// OneRouter dashboard — the MVP's main screen.
//
// Pure client-side data fetching against the gateway's config API and
// OpenAI-compatible endpoints (same origin, no auth on the config API yet —
// single-user MVP). No server functions needed; keep it memory-light.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

// ---- types ----------------------------------------------------------------

type Settings = { baseUrl: string; apiKey: string; providerCount: number };
type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string; // already masked server-side
  models: string[];
  tier: "top" | "medium" | "other";
  createdAt: string;
};
type ModelInfo = { id: string; owned_by: string };

const TIERS = ["top", "medium", "other"] as const;
type Tier = (typeof TIERS)[number];

const TIER_STYLES: Record<Tier, string> = {
  top: "bg-indigo-100 text-indigo-700",
  medium: "bg-emerald-100 text-emerald-700",
  other: "bg-gray-100 text-gray-600",
};

// ---- small helpers ---------------------------------------------------------

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* non-JSON error body; keep default */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts where the async clipboard API is missing.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function parseModels(raw: string): string[] {
  return [...new Set(raw.split(/[\n,;]+/).map((m) => m.trim()).filter(Boolean))];
}

// ---- copy button -----------------------------------------------------------

function CopyButton({ text, label }: { text: string; label: string }) {
  const [justCopied, setJustCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(text);
        if (!ok) return;
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 1600);
      }}
      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        justCopied
          ? "bg-emerald-600 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
      aria-label={`Copy ${label}`}
    >
      {justCopied ? "Copied!" : "Copy"}
    </button>
  );
}

// ---- page ------------------------------------------------------------------

function Dashboard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);

  const [settingsError, setSettingsError] = useState("");
  const [providersError, setProvidersError] = useState("");
  const [modelsError, setModelsError] = useState("");

  const [showKey, setShowKey] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"url" | "key" | null>(null);

  const [form, setForm] = useState<{
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string;
    tier: Tier;
  }>({ name: "", baseUrl: "", apiKey: "", models: "", tier: "other" });
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");

  async function loadSettings() {
    try {
      const s = await api<Settings>("/api/settings");
      setSettings(s);
      setSettingsError("");
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadProviders() {
    try {
      const res = await api<{ providers: Provider[] }>("/api/providers");
      setProviders(res.providers);
      setProvidersError("");
    } catch (e) {
      setProvidersError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadModels(settingsData?: Settings) {
    setModelsError("");
    const s = settingsData ?? settings;
    if (!s) return;
    try {
      const res = await api<{ data: ModelInfo[] }>("/v1/models", {
        headers: { authorization: `Bearer ${s.apiKey}` },
      });
      setModels(res.data);
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : String(e));
    }
  }

  // Initial load: settings (needed for the key, which /v1/models requires),
  // providers, and the model list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api<Settings>("/api/settings");
        if (cancelled) return;
        setSettings(s);
        setSettingsError("");
        try {
          const res = await api<{ data: ModelInfo[] }>("/v1/models", {
            headers: { authorization: `Bearer ${s.apiKey}` },
          });
          if (!cancelled) setModels(res.data);
        } catch (e) {
          if (!cancelled) setModelsError(e instanceof Error ? e.message : String(e));
        }
      } catch (e) {
        if (!cancelled) setSettingsError(e instanceof Error ? e.message : String(e));
      }
    })();
    loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshAll() {
    await loadSettings();
    await loadProviders();
    await loadModels();
  }

  async function handleAddProvider(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    const models = parseModels(form.models);
    if (!form.name.trim()) return setFormError("Name is required.");
    if (!/^https?:\/\//i.test(form.baseUrl.trim()))
      return setFormError("Base URL is required and must start with http:// or https://.");
    if (!form.apiKey.trim()) return setFormError("API key is required.");
    setFormBusy(true);
    try {
      await api<{ provider: Provider }>("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey.trim(),
          models,
          tier: form.tier,
        }),
      });
      setForm({ name: "", baseUrl: "", apiKey: "", models: "", tier: "other" });
      setFormSuccess(`Provider "${form.name.trim()}" added.`);
      await refreshAll();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDeleteProvider(p: Provider) {
    if (!window.confirm(`Delete provider "${p.name}"? This cannot be undone.`)) return;
    setProvidersError("");
    try {
      await api<void>(`/api/providers/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      await refreshAll();
    } catch (e) {
      setProvidersError(e instanceof Error ? e.message : String(e));
    }
  }

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">OneRouter</h1>
            <p className="text-xs text-gray-500">One endpoint for every model provider</p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            {settings ? `${settings.providerCount} provider${settings.providerCount === 1 ? "" : "s"}` : "Dashboard"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {/* ---------- Your endpoint ---------- */}
        <section aria-labelledby="endpoint-heading">
          <h2 id="endpoint-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Your unified endpoint
          </h2>
          {settingsError && <ErrorBanner message={settingsError} />}
          {settings ? (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Base URL</p>
                  <p className="truncate font-mono text-sm text-gray-900">{settings.baseUrl}</p>
                </div>
                <CopyButton text={settings.baseUrl} label="base URL" />
              </div>
              <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">API key</p>
                  <p className="truncate font-mono text-sm text-gray-900">
                    {showKey ? settings.apiKey : "••••••••••••••••••••••••••"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                  <CopyButton text={settings.apiKey} label="API key" />
                </div>
              </div>
              <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
                Point any OpenAI-compatible client (Claude Code, your IDE, curl) at{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">{settings.baseUrl}</code>{" "}
                with this key. Model aliases: <code className="font-mono text-[11px]">top</code> (complex reasoning)
                and <code className="font-mono text-[11px]">medium</code> (everyday tasks).
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
              {settingsError ? "Couldn't load endpoint settings." : "Loading…"}
            </div>
          )}
        </section>

        {/* ---------- Add provider + providers ---------- */}
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="add-heading">
            <h2 id="add-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Add a provider
            </h2>
            <form onSubmit={handleAddProvider} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              {formError && <ErrorBanner message={formError} />}
              {formSuccess && <SuccessBanner message={formSuccess} />}
              <Field label="Name" htmlFor="p-name">
                <input
                  id="p-name"
                  value={form.name}
                  onChange={update("name")}
                  placeholder="e.g. OpenAI, Anthropic"
                  className={inputCls}
                  autoComplete="off"
                />
              </Field>
              <Field label="Base URL" htmlFor="p-baseurl">
                <input
                  id="p-baseurl"
                  value={form.baseUrl}
                  onChange={update("baseUrl")}
                  placeholder="https://api.openai.com/v1"
                  className={inputCls}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="API key" htmlFor="p-apikey">
                <input
                  id="p-apikey"
                  type="password"
                  value={form.apiKey}
                  onChange={update("apiKey")}
                  placeholder="sk-…"
                  className={inputCls}
                  autoComplete="off"
                />
              </Field>
              <Field label="Model IDs (comma or newline separated)" htmlFor="p-models">
                <textarea
                  id="p-models"
                  value={form.models}
                  onChange={update("models")}
                  placeholder={"gpt-5\ngpt-4o-mini"}
                  rows={3}
                  className={`${inputCls} resize-y font-mono text-sm`}
                  spellCheck={false}
                />
              </Field>
              <Field label="Tier" htmlFor="p-tier">
                <select id="p-tier" value={form.tier} onChange={update("tier")} className={inputCls}>
                  <option value="top">top — coding, complex reasoning</option>
                  <option value="medium">medium — everyday tasks</option>
                  <option value="other">other</option>
                </select>
              </Field>
              <button
                type="submit"
                disabled={formBusy}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {formBusy ? "Adding…" : "Add provider"}
              </button>
            </form>
          </section>

          <section aria-labelledby="providers-heading">
            <h2 id="providers-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Your providers
            </h2>
            {providersError && <ErrorBanner message={providersError} />}
            <div className="space-y-3">
              {providers.length === 0 && !providersError ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
                  No providers yet — add your first one.
                </div>
              ) : (
                providers.map((p) => (
                  <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TIER_STYLES[p.tier]}`}>{p.tier}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteProvider(p)}
                        className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        aria-label={`Delete ${p.name}`}
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-1.5 truncate font-mono text-xs text-gray-500">{p.baseUrl}</p>
                    <p className="mt-0.5 font-mono text-xs text-gray-400">key: {p.apiKey}</p>
                    {p.models.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.models.map((m) => (
                          <span key={m} className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-700">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ---------- Models available ---------- */}
        <section aria-labelledby="models-heading">
          <h2 id="models-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Models available
          </h2>
          {modelsError && <ErrorBanner message={modelsError} />}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {models.length === 0 && !modelsError ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {models.map((m) => (
                  <span
                    key={m.id}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs ${
                      m.owned_by === "onerouter" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {m.id}
                    {m.owned_by === "onerouter" && (
                      <span className="rounded bg-indigo-600 px-1 py-px text-[10px] font-medium text-white">alias</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="pb-4 text-center text-xs text-gray-400">
          OneRouter — single-user MVP. Config API is not authenticated yet.
        </footer>
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {message}
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
      {message}
    </div>
  );
}
