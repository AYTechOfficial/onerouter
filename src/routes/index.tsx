import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Landing,
});

// ---- small shared bits -------------------------------------------------------
function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">{children}</p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{children}</h2>
  );
}

function SectionSub({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto mt-4 max-w-2xl text-center text-base text-gray-600">{children}</p>;
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
        <span className="font-mono text-xs text-gray-400">{title}</span>
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-700" />
        </div>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-gray-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ---- landing page ------------------------------------------------------------
function Landing() {
  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      {/* ---------- Nav ---------- */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
        <Container className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
              O
            </span>
            <span className="text-lg font-bold tracking-tight text-gray-900">OneRouter</span>
          </div>
          <nav className="flex items-center gap-4">
            <a href="#how-it-works" className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">
              How it works
            </a>
            <a href="#tiers" className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:block">
              Tiers
            </a>
            <Link
              to="/dashboard"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Dashboard
            </Link>
          </nav>
        </Container>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-50 via-gray-50 to-gray-50" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />
        <Container className="relative py-20 text-center sm:py-28">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-4 py-1.5 text-xs font-medium text-indigo-700 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            OpenAI-compatible gateway · tokenrouter, orcarouter, agentrouter, gorouter &amp; more
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            One API endpoint for{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              all your models
            </span>
            .
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Paste in base URLs and API keys from any provider or router — tokenrouter, orcarouter, agentrouter,
            gorouter, or any OpenAI-compatible API. OneRouter gives you back{" "}
            <strong className="font-semibold text-gray-900">one</strong> OpenAI-compatible base URL and API key.
            Point Claude Code, your IDE, or any CLI at it, and every request is routed to the right model
            automatically.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/dashboard"
              className="rounded-xl bg-indigo-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition-colors hover:bg-indigo-700"
            >
              Open your dashboard
            </Link>
            <a
              href="#how-it-works"
              className="rounded-xl border border-gray-300 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              See how it works
            </a>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            Your own endpoint + key in under a minute. No accounts to create, no models to manage by hand.
          </p>
        </Container>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-24">
        <Container>
          <SectionLabel>How it works</SectionLabel>
          <SectionTitle>Three steps to one endpoint</SectionTitle>
          <SectionSub>
            Keep using the providers and routers you already know — OneRouter just puts a single door in front of
            them all.
          </SectionSub>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Add your providers",
                body: "Enter each provider's base URL, API key, and its model IDs — tokenrouter, orcarouter, agentrouter, gorouter, or any OpenAI-compatible API.",
              },
              {
                step: "2",
                title: "Get one endpoint + key",
                body: "OneRouter issues a single OpenAI-compatible base URL and API key for your whole setup. That's the only thing you need to remember.",
              },
              {
                step: "3",
                title: "Use it anywhere",
                body: "Point Claude Code, your IDE, or any CLI at the endpoint. OneRouter routes each request to the right model automatically.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-sm">
                  {s.step}
                </span>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ---------- Tiers ---------- */}
      <section id="tiers" className="scroll-mt-20 border-y border-gray-200 bg-white py-16 sm:py-24">
        <Container>
          <SectionLabel>Tiers</SectionLabel>
          <SectionTitle>Route by intent, not by hand</SectionTitle>
          <SectionSub>
            Instead of juggling model IDs, use a tier. OneRouter picks the best model from your providers for each
            request — no config changes when you add or swap providers.
          </SectionSub>
          <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-indigo-700">top</span>
                <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  flagship
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                For coding and complex reasoning. Requests to <code className="font-mono text-indigo-700">top</code>{" "}
                are routed to your most capable model — the one you'd reach for when the task is hard.
              </p>
              <div className="mt-4 rounded-lg bg-white px-4 py-3 font-mono text-xs text-gray-600 ring-1 ring-indigo-100">
                model: "top"
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-emerald-700">medium</span>
                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  everyday
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                For everyday tasks — summarising, drafting, quick questions. Requests to{" "}
                <code className="font-mono text-emerald-700">medium</code> are routed to a fast, cheaper model
                that's plenty for the job.
              </p>
              <div className="mt-4 rounded-lg bg-white px-4 py-3 font-mono text-xs text-gray-600 ring-1 ring-gray-200">
                model: "medium"
              </div>
            </div>
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-gray-500">
            Routing is automatic: OneRouter matches your tier against the models your providers expose, so you never
            hardcode a specific provider or model ID in your tools.
          </p>
        </Container>
      </section>

      {/* ---------- Code sample ---------- */}
      <section className="py-16 sm:py-24">
        <Container>
          <SectionLabel>In practice</SectionLabel>
          <SectionTitle>Works with anything that speaks OpenAI</SectionTitle>
          <SectionSub>
            One base URL + one key, anywhere you'd point an LLM endpoint today. Here's a curl call and a Claude Code
            setup — both use your OneRouter endpoint.
          </SectionSub>
          <div className="mx-auto mt-12 grid max-w-4xl gap-6 lg:grid-cols-2">
            <CodeBlock
              title="curl"
              code={"curl YOUR_BASE_URL/v1/chat/completions \\\n" +
                '  -H "Authorization: Bearer YOUR_API_KEY" \\\n' +
                '  -H "Content-Type: application/json" \\\n' +
                "  -d '{\n" +
                '    "model": "top",\n' +
                '    "messages": [\n' +
                '      {"role": "user", "content": "Explain one-router tiering in one line"}\n' +
                "    ]\n" +
                "  }'"}
            />
            <CodeBlock
              title="Claude Code"
              code={"# Set these in your environment, then run:\n" +
                "#   claude\n\n" +
                "export ANTHROPIC_BASE_URL=YOUR_BASE_URL\n" +
                "export ANTHROPIC_AUTH_TOKEN=YOUR_API_KEY\n\n" +
                '# "top" and "medium" are available as model\n' +
                "# aliases in the /v1/models list."}
            />
          </div>
          <p className="mt-6 text-center font-mono text-xs text-gray-500">
            YOUR_BASE_URL / YOUR_API_KEY — issued by your dashboard.
          </p>
        </Container>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="relative overflow-hidden border-t border-gray-200 bg-white py-16 sm:py-20">
        <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-indigo-100/60 blur-3xl" />
        <Container className="relative text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Stop copying keys. Start routing.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-600">
            Add your providers once and get a single endpoint that works everywhere.
          </p>
          <Link
            to="/dashboard"
            className="mt-8 inline-block rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition-colors hover:bg-indigo-700"
          >
            Open your dashboard
          </Link>
        </Container>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-gray-200 bg-gray-50">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 sm:flex-row">
          <p className="text-sm font-semibold text-gray-700">OneRouter</p>
          <p className="text-xs text-gray-500">
            One OpenAI-compatible endpoint for every model provider and router.
          </p>
          <Link to="/dashboard" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
            Dashboard →
          </Link>
        </Container>
      </footer>
    </div>
  );
}
