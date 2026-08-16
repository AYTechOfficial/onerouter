// OneRouter gateway configuration.
//
// The gateway keeps its data (providers + the unified key) either in a local
// file or in Upstash Redis, chosen at runtime by environment:
//
//  - Local file store (default): .run/gateway/data.json, gitignored and denied
//    by the vite dev server's fs allowlist, so it is never served or committed.
//    File permissions are hardened by store.ts (0600).
//  - Upstash Redis REST (serverless): when BOTH UPSTASH_REDIS_REST_URL and
//    UPSTASH_REDIS_REST_TOKEN are set, the whole state doc lives under a single
//    Redis key instead of the local file — required on Vercel, where the
//    filesystem is ephemeral/read-only and cold starts would otherwise lose
//    every provider and the unified key. See store.ts and gateway/README.md.

import { join } from "node:path";

export const ROOT_DIR = join(import.meta.dir, "..");
export const DATA_DIR = join(ROOT_DIR, ".run", "gateway");
export const DATA_FILE = join(DATA_DIR, "data.json");

// Upstash Redis REST backend (serverless persistence). Both must be non-empty
// for remote mode to activate; neither is read from any committed file (they
// come from the deployment environment, e.g. Vercel project env vars).
export const REMOTE_URL = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim().replace(/\/+$/, "");
export const REMOTE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
// The single Redis key that holds the whole state doc (providers + unified key).
export const REMOTE_KEY = "onerouter:state";

export function isRemoteConfigured(): boolean {
  const url = REMOTE_URL.length > 0;
  const token = REMOTE_TOKEN.length > 0;
  if (url !== token) {
    // Half-configured: treat as local but say so — a real misconfiguration
    // would otherwise silently split state between two backends.
    console.warn(
      "[onerouter] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set TOGETHER; falling back to the local file store",
    );
  }
  return url && token;
}

export const UNIFIED_KEY_PREFIX = "sk-onerouter-";

// Failover bounds: at most this many upstream attempts per chat-completions
// request (the original attempt + up to MAX_ATTEMPTS-1 retries across the
// fallback chain). Easy to tune by editing this constant; the retry loop in
// proxy.ts slices the candidate chain to this length.
export const MAX_ATTEMPTS = 3;

// How long to wait for upstream RESPONSE HEADERS before treating the attempt as
// a timeout (a retriable failure). Streaming/body duration is NOT bounded by
// this — the timer is cleared as soon as headers arrive.
export const UPSTREAM_TIMEOUT_MS = 120_000;

// Origin used by GET /api/settings when the request's Host is loopback (the
// reverse proxy masks the Host to localhost:3000, so the request origin is not
// usable from inside the sandbox). Override with ONEROUTER_PUBLIC_ORIGIN.
export const PUBLIC_ORIGIN =
  (process.env.ONEROUTER_PUBLIC_ORIGIN ?? "").replace(/\/+$/, "") ||
  "https://3770772ce5ca2e210c2225163d27ad4e.ctonew.app";
