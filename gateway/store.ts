// Provider store + unified-key store for OneRouter.
//
// Two persistence backends, chosen once at process start by environment:
//
//  1. Local file store (default). The whole state doc lives at
//     .run/gateway/data.json, written atomically (tmp file + rename) with mode
//     0600 inside a 0700 directory. This is what runs locally / in the sandbox,
//     where there is a writable disk.
//
//  2. Upstash Redis REST (serverless). When BOTH UPSTASH_REDIS_REST_URL and
//     UPSTASH_REDIS_REST_TOKEN are set, the whole state doc lives under a
//     single Redis key (config.REMOTE_KEY, "onerouter:state") and is read /
//     written with plain fetch — no SDK, no new dependencies. This is what runs
//     on Vercel, where the filesystem is ephemeral and read-only: every cold
//     start re-hydrates the same doc, so providers and the unified API key
//     survive restarts together.
//
// Remote-mode rules (see ensureHydrated / persist):
//  - Reads hydrate the in-memory cache exactly once, then serve from it
//    synchronously — the same object the write path mutates.
//  - A configured-but-unreachable remote FAILS LOUDLY (throws a readable
//    error). The gateway NEVER silently falls back to the file store when
//    remote is configured: that would split state between two places.
//  - A missing remote key on first read is treated as fresh state (first run),
//    which is how the unified key gets generated and persisted for the first
//    time on serverless — mirroring an empty file on the local backend.
//
// Providers are stored in plaintext (they must be, so the proxy can forward
// them) but API responses always return masked keys.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import {
  DATA_DIR,
  DATA_FILE,
  REMOTE_KEY,
  REMOTE_TOKEN,
  REMOTE_URL,
  UNIFIED_KEY_PREFIX,
  isRemoteConfigured,
} from "./config";

export type Tier = "top" | "medium" | "other";

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string; // full key — never returned by the API, never logged
  models: string[];
  tier: Tier;
  createdAt: string;
}

export interface PublicProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string; // masked
  models: string[];
  tier: Tier;
  createdAt: string;
}

interface StoreData {
  providers: Provider[];
  unifiedKey: string | null;
}

// The doc is stored on disk / in Redis with the same 2-space JSON formatting in
// both backends, so a migration between them is a straight copy.
function serialize(data: StoreData): string {
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// Local file backend
// ---------------------------------------------------------------------------

let cache: StoreData | null = null;

function ensureDir(): void {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    chmodSync(DATA_DIR, 0o700);
  } catch {
    /* best effort */
  }
}

function persistFile(data: StoreData): void {
  ensureDir();
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, serialize(data), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, DATA_FILE);
  chmodSync(DATA_FILE, 0o600);
}

function loadFromFile(): StoreData {
  ensureDir();
  if (existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8")) as StoreData;
      return {
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
        unifiedKey: typeof parsed.unifiedKey === "string" ? parsed.unifiedKey : null,
      };
    } catch {
      // Corrupt store: back it up and start fresh rather than crash the server.
      try {
        renameSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
      } catch {
        /* best effort */
      }
    }
  }
  const fresh: StoreData = { providers: [], unifiedKey: null };
  persistFile(fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Upstash Redis REST backend (plain fetch, no SDK)
// ---------------------------------------------------------------------------

// Upper bound for a single Upstash round-trip. Fails loudly and fast instead of
// hanging a serverless request when the remote is misconfigured/unreachable.
const REMOTE_TIMEOUT_MS = 10_000;

function remoteError(action: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `OneRouter store: Upstash Redis REST ${action} failed (${REMOTE_URL}) — ${detail}. ` +
      `Check UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. The gateway did NOT fall back to the local file store.`,
  );
}

// GET /get/<key> -> { "result": "<json string>" | null }  (null = key missing).
async function remoteGet(): Promise<StoreData | null> {
  const res = await fetch(`${REMOTE_URL}/get/${REMOTE_KEY}`, {
    headers: { authorization: `Bearer ${REMOTE_TOKEN}` },
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  }).catch((cause) => {
    throw remoteError("GET", cause);
  });
  if (!res.ok) {
    throw new Error(
      `OneRouter store: Upstash Redis REST GET returned HTTP ${res.status} ${res.statusText} ` +
        `(check UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). The gateway did NOT fall back to the local file store.`,
    );
  }
  let payload: { result?: unknown };
  try {
    payload = (await res.json()) as { result?: unknown };
  } catch (cause) {
    throw remoteError("GET (bad response body)", cause);
  }
  if (payload.result === null || payload.result === undefined) return null;
  if (typeof payload.result !== "string") {
    throw new Error(`OneRouter store: Upstash Redis REST GET returned an unexpected result type (${typeof payload.result})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.result);
  } catch (cause) {
    throw remoteError("GET (stored doc is not valid JSON)", cause);
  }
  const doc = parsed as Partial<StoreData>;
  return {
    providers: Array.isArray(doc.providers) ? doc.providers : [],
    unifiedKey: typeof doc.unifiedKey === "string" ? doc.unifiedKey : null,
  };
}

// SET /set/<key> with the raw JSON string as the body. One key, one value, so a
// write is a single atomic replace of the whole doc (the remote analogue of the
// local tmp+rename).
async function remoteSet(data: StoreData): Promise<void> {
  const res = await fetch(`${REMOTE_URL}/set/${REMOTE_KEY}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${REMOTE_TOKEN}`,
      "content-type": "text/plain; charset=utf-8",
    },
    body: serialize(data),
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  }).catch((cause) => {
    throw remoteError("SET", cause);
  });
  if (!res.ok) {
    throw new Error(
      `OneRouter store: Upstash Redis REST SET returned HTTP ${res.status} ${res.statusText} — state was NOT persisted ` +
        `(check UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). The gateway did NOT fall back to the local file store.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Store lifecycle
// ---------------------------------------------------------------------------

// In remote mode: hydrate the in-memory cache from Upstash exactly once. In
// local mode: load the file. Must be awaited before any store access (the
// gateway does this on every request — see gateway/index.ts). Deduplicated so
// concurrent first requests share a single round-trip.
let hydrating: Promise<void> | null = null;

export function ensureHydrated(): Promise<void> {
  if (cache) return Promise.resolve();
  if (!hydrating) {
    hydrating = (async () => {
      if (isRemoteConfigured()) {
        // Throws with a readable message when the remote is unreachable — fail
        // loudly, never silently fall back to the file store.
        const remote = await remoteGet();
        cache = remote ?? { providers: [], unifiedKey: null };
        if (!remote) await remoteSet(cache); // first run: create the key like loadFromFile does
      } else {
        cache = loadFromFile();
      }
    })().finally(() => {
      hydrating = null;
    });
  }
  return hydrating;
}

function loadStore(): StoreData {
  if (cache) return cache;
  if (isRemoteConfigured()) {
    // Should be unreachable (the gateway awaits ensureHydrated on every
    // request), but fail loudly rather than pretend the store is empty.
    throw new Error(
      "OneRouter store: remote backend not hydrated yet — ensureHydrated() must complete before store access (server startup bug)",
    );
  }
  cache = loadFromFile();
  return cache;
}

// Persist the current doc to whichever backend is active. Async because the
// remote write is a network round-trip that callers must await before replying
// (serverless functions freeze after the response; a fire-and-forget write
// could be lost). In local mode it's a synchronous file write.
async function persist(data: StoreData): Promise<void> {
  if (isRemoteConfigured()) {
    await remoteSet(data); // throws loudly on failure — state was NOT saved
    return;
  }
  persistFile(data);
}

// The user's one unified API key. Generated once on first access, persisted.
export async function getUnifiedKey(): Promise<string> {
  const data = loadStore();
  if (data.unifiedKey) return data.unifiedKey;
  const key = UNIFIED_KEY_PREFIX + randomBytes(32).toString("base64url");
  data.unifiedKey = key;
  await persist(data);
  return key;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

export function toPublic(p: Provider): PublicProvider {
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: maskKey(p.apiKey),
    models: [...p.models],
    tier: p.tier,
    createdAt: p.createdAt,
  };
}

export async function addProvider(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  tier: Tier;
}): Promise<Provider> {
  const data = loadStore();
  const provider: Provider = {
    id: randomUUID(),
    name: input.name.trim(),
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: input.apiKey.trim(),
    models: [...new Set(input.models.map((m) => m.trim()).filter(Boolean))],
    tier: input.tier,
    createdAt: new Date().toISOString(),
  };
  data.providers.push(provider);
  await persist(data);
  return provider;
}

export function listProviders(): Provider[] {
  return loadStore().providers;
}

export function getProvider(id: string): Provider | undefined {
  return loadStore().providers.find((p) => p.id === id);
}

export async function deleteProvider(id: string): Promise<boolean> {
  const data = loadStore();
  const before = data.providers.length;
  data.providers = data.providers.filter((p) => p.id !== id);
  if (data.providers.length === before) return false;
  await persist(data);
  return true;
}

// Resolve a requested model to a provider.
// - "top" / "medium" -> first provider with that tier that has at least one model;
//   the forwarded model becomes that provider's first model (a provider can't
//   answer to the alias name).
// - otherwise -> the provider that lists the exact model ID.
// Returns null when nothing matches.
export function resolveRoute(model: string): { provider: Provider; model: string } | null {
  const providers = loadStore().providers;
  if (model === "top" || model === "medium") {
    const provider = providers.find((p) => p.tier === model && p.models.length > 0);
    if (!provider) return null;
    return { provider, model: provider.models[0] };
  }
  const provider = providers.find((p) => p.models.includes(model));
  return provider ? { provider, model } : null;
}
