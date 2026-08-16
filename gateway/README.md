# OneRouter gateway (backend)

Model gateway living in the same Bun server as the site (port 3000). Users paste
provider base URLs + API keys and get one OpenAI-compatible endpoint + one API key
that routes requests to the right provider.

## How it's served

`serve.ts` (the production server started by `bun run publish`) checks gateway
routes first (`/api/...` and `/v1/...`), then falls through to the TanStack site.
There is no separate process or port.

## Files

- `gateway/index.ts` — request router: config API + OpenAI-compatible proxy, auth
- `gateway/store.ts` — provider store + unified key, persisted to
  `.run/gateway/data.json` (dir 0700, file 0600, atomic tmp+rename writes)
- `gateway/proxy.ts` — upstream forwarding + automatic failover/retry loop
  (incl. SSE passthrough with mid-stream error handling)
- `gateway/fallback.ts` — builds the ordered (provider, model) candidate chain
  for a request
- `gateway/config.ts` — data paths, `ONEROUTER_PUBLIC_ORIGIN` override,
  `MAX_ATTEMPTS`, `UPSTREAM_TIMEOUT_MS`

## Config API (no auth — single-user MVP)

| Method | Path                 | Body / notes                                  |
| ------ | -------------------- | --------------------------------------------- |
| POST   | `/api/providers`     | `{name, baseUrl, apiKey, models[], tier}` — tier: `top`\|`medium`\|`other` (default `other`). Returns provider with **masked** key. |
| GET    | `/api/providers`     | List providers, masked keys.                  |
| DELETE | `/api/providers/:id` | 204 on success, 404 if missing.               |
| GET    | `/api/settings`      | `{baseUrl, apiKey, providerCount}` — your one endpoint + key. `baseUrl` is the public origin (override: env `ONEROUTER_PUBLIC_ORIGIN`). |

## OpenAI-compatible proxy (requires `Authorization: Bearer <unified key>`)

- `GET /v1/models` — all provider model IDs + `top` + `medium` aliases.
- `POST /v1/chat/completions` — standard payloads; streams SSE straight through
  when `stream: true`.

### Routing & automatic failover

For each request the gateway builds an ordered fallback chain of
(provider, model) candidates (see `gateway/fallback.ts`):

- **Exact model ID** → every provider offering that model, in provider order;
  only after all of them fail, equivalent models — other models in the same
  tier as the first exact-match provider (provider order, then model order).
- **`top` / `medium` alias** → each provider in that tier in order (using its
  first model), then every remaining model in that tier.

If a candidate fails with a **retriable** error — connection/network error,
timeout, upstream 5xx, 429, 401/403 (another provider may have a working key)
— the proxy moves to the next candidate, bounded to `MAX_ATTEMPTS` total
upstream attempts (**`gateway/config.ts`**, default 3 = original + 2 retries).
A **non-retriable** failure (e.g. 400 malformed payload — it would fail
everywhere) surfaces immediately with the upstream status, no retries. If all
attempts fail retriably, the proxy returns **502** with a readable summary of
what was tried (provider names/models + last error — never API keys).
Unknown models keep the current readable 404.

Happy path is unchanged: no pre-flight checks, the first candidate is always
tried first and its success is returned as fast as before. Successful
chat-completions responses carry
`x-onerouter-served-by: <providerName>/<modelId>` so callers can see what
served.

Streaming: candidates are only switched BEFORE any SSE data is delivered
(connection error or non-200 response). Once a stream has started, it is kept;
if it dies mid-stream the gateway ends it with a readable error event (it does
not switch providers mid-stream). An upstream timeout applies only to
receiving response headers (`UPSTREAM_TIMEOUT_MS`, `gateway/config.ts`), never
to stream duration.

## Start / verify

```bash
cd /home/team/shared/site && bun run publish   # builds site + starts server on :3000
curl http://localhost:3000/api/settings        # get your unified key
curl -X POST http://localhost:3000/api/providers -H 'content-type: application/json' \
  -d '{"name":"OpenAI","baseUrl":"https://api.openai.com/v1","apiKey":"sk-...","models":["gpt-5","gpt-4o-mini"],"tier":"top"}'
curl http://localhost:3000/v1/models -H "Authorization: Bearer <unified key>"
```

`src/` (the frontend) is untouched by the gateway; a dashboard UI can call the
config API directly from the same origin.
