# OneRouter

One OpenAI-compatible endpoint for all your model providers.

Paste in base URLs + API keys from any provider or router (tokenrouter, orcarouter,
agentrouter, gorouter, InferRoute, …) and OneRouter gives you back **one** base URL
and **one** API key. Point Claude Code, your IDE, or any CLI at that single endpoint
and OneRouter routes each request to the right model automatically — with tiered
aliases and automatic failover when an upstream is down.

## What's included

- **Landing page** — explains the product and links to the dashboard.
- **Dashboard** — add/manage providers (name, base URL, API key, model IDs, tier);
  shows your unified endpoint + key with copy buttons.
- **Live proxy** — OpenAI-compatible `/v1/chat/completions` (incl. streaming) and
  `/v1/models`, secured by a generated unified API key, with tier aliases:
  - `top` — coding, complex reasoning
  - `medium` — everyday tasks
- **Automatic failover** — each request gets an ordered candidate chain of
  (provider, model); retriable failures (network error, timeout, 5xx, 429,
  401/403) fall through to the next candidate, bounded by `MAX_ATTEMPTS`
  (default 3). Successful responses carry
  `x-onerouter-served-by: <provider>/<model>`.

## Quickstart

```bash
bun install
bun run publish   # builds the site and serves everything on :3000
```

Then open http://localhost:3000 — the dashboard lets you add providers and shows
your unified endpoint + key.

## API surface

The gateway lives in the same Bun server as the site (`serve.ts` routes `/api/*`
and `/v1/*` to it, everything else to the frontend).

### Config API (no auth — single-user MVP)

| Method | Path                 | Body / notes                                  |
| ------ | -------------------- | --------------------------------------------- |
| POST   | `/api/providers`     | `{name, baseUrl, apiKey, models[], tier}` — tier: `top`\|`medium`\|`other`. Returns provider with **masked** key. |
| GET    | `/api/providers`     | List providers, masked keys.                  |
| DELETE | `/api/providers/:id` | 204 on success, 404 if missing.               |
| GET    | `/api/settings`      | `{baseUrl, apiKey, providerCount}` — your one endpoint + key. |

### OpenAI-compatible proxy (requires `Authorization: Bearer <unified key>`)

- `GET /v1/models` — all provider model IDs + the `top` and `medium` aliases.
- `POST /v1/chat/completions` — standard payloads; streams SSE straight through
  when `stream: true`.

## Configuration

- `ONEROUTER_PUBLIC_ORIGIN` — overrides the public base URL reported by
  `/api/settings` (defaults to the deployed origin).
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — **persistent store on
  serverless.** When both are set, the gateway keeps all state (providers + the
  unified key) in Upstash Redis (single key `onerouter:state`, plain REST fetch)
  instead of the local `.run/gateway/data.json` file. Required on Vercel, where
  the filesystem is ephemeral and read-only: without these, every cold start
  would lose your providers and regenerate the unified key. Locally, leaving
  them unset keeps the file store. A configured-but-unreachable Upstash fails
  loudly (readable 500) — it never silently falls back to the file store.
- `MAX_ATTEMPTS`, `UPSTREAM_TIMEOUT_MS` — see `gateway/config.ts`.

## Repository layout

- `gateway/` — backend: `index.ts` (router/auth), `store.ts` (provider store +
  unified key), `proxy.ts` (upstream forwarding + failover), `fallback.ts`
  (candidate chain), `config.ts`. See `gateway/README.md`.
- `src/` — frontend (landing page + dashboard), TanStack Start + React + Tailwind.
- `serve.ts` — production server: gateway routes first, then the static site.
- `publish.sh` / `go-live.sh` — build & serve on :3000, and deploy to a real host.

## Runtime data (secrets) — not committed

Provider API keys are stored at runtime in `.run/gateway/data.json` (dir 0700,
file 0600, atomic writes) or, when `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` are set (serverless), in Upstash Redis under
`onerouter:state` — and are **never committed**: `.run/`, `.env*`,
`node_modules`, `dist/`, `.vercel/`, and the generated `src/routeTree.gen.ts`
are all git-ignored. Check out a fresh clone, add your own providers, and you're
off — nothing about your keys leaves the machine except through the unified
endpoint you choose to use (and the remote store you explicitly configure).
