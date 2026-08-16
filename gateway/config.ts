// OneRouter gateway configuration.
//
// The gateway keeps its data (providers + the unified key) in .run/gateway/,
// which is gitignored and denied by the vite dev server's fs allowlist, so it is
// never served or committed. File permissions are hardened by store.ts (0600).

import { join } from "node:path";

export const ROOT_DIR = join(import.meta.dir, "..");
export const DATA_DIR = join(ROOT_DIR, ".run", "gateway");
export const DATA_FILE = join(DATA_DIR, "data.json");

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
