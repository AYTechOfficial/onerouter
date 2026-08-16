// Provider store + unified-key store for OneRouter.
//
// Persistence: a single JSON file at .run/gateway/data.json, written atomically
// (tmp file + rename) with mode 0600 inside a 0700 directory. Providers are
// stored in plaintext on disk (they must be, so the proxy can forward them) but
// API responses always return masked keys.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { DATA_DIR, DATA_FILE, UNIFIED_KEY_PREFIX } from "./config";

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

let cache: StoreData | null = null;

function ensureDir(): void {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    chmodSync(DATA_DIR, 0o700);
  } catch {
    /* best effort */
  }
}

function persist(data: StoreData): void {
  ensureDir();
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, DATA_FILE);
  chmodSync(DATA_FILE, 0o600);
}

export function loadStore(): StoreData {
  if (cache) return cache;
  ensureDir();
  if (existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8")) as StoreData;
      cache = {
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
        unifiedKey: typeof parsed.unifiedKey === "string" ? parsed.unifiedKey : null,
      };
      return cache;
    } catch {
      // Corrupt store: back it up and start fresh rather than crash the server.
      try {
        renameSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
      } catch {
        /* best effort */
      }
    }
  }
  cache = { providers: [], unifiedKey: null };
  persist(cache);
  return cache;
}

// The user's one unified API key. Generated once on first access, persisted.
export function getUnifiedKey(): string {
  const data = loadStore();
  if (data.unifiedKey) return data.unifiedKey;
  const key = UNIFIED_KEY_PREFIX + randomBytes(32).toString("base64url");
  data.unifiedKey = key;
  persist(data);
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

export function addProvider(input: {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  tier: Tier;
}): Provider {
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
  persist(data);
  return provider;
}

export function listProviders(): Provider[] {
  return loadStore().providers;
}

export function getProvider(id: string): Provider | undefined {
  return loadStore().providers.find((p) => p.id === id);
}

export function deleteProvider(id: string): boolean {
  const data = loadStore();
  const before = data.providers.length;
  data.providers = data.providers.filter((p) => p.id !== id);
  if (data.providers.length === before) return false;
  persist(data);
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
