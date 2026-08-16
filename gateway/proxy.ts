// Upstream forwarding + automatic failover for the OpenAI-compatible proxy.
//
// forwardWithFailover walks the fallback chain (built in fallback.ts) and
// retries retriable failures — connection/network errors, timeouts, upstream
// 5xx, 429, 401/403 (another provider may have a working key) — up to
// MAX_ATTEMPTS total attempts. Non-retriable failures (e.g. 400 malformed
// payload — the request would fail everywhere) surface immediately with the
// upstream status. Streaming requests only switch providers BEFORE any SSE data
// is delivered (connection error or non-200 response); once a stream has
// started, it is kept and any mid-stream death ends the stream with a readable
// error. Successful responses carry `x-onerouter-served-by: <provider>/<model>`.

import { MAX_ATTEMPTS, UPSTREAM_TIMEOUT_MS } from "./config";
import type { Candidate } from "./fallback";

// Normalize a provider base URL into the chat completions endpoint:
// - strip trailing slashes
// - base URLs that already end in /v1 keep it:  .../v1 -> .../v1/chat/completions
// - anything else gets /chat/completions appended:  .../api -> .../api/chat/completions
export function chatCompletionsUrl(baseUrl: string): string {
  const u = baseUrl.trim().replace(/\/+$/, "");
  return u.endsWith("/v1") ? `${u}/chat/completions` : `${u}/chat/completions`;
}

function jsonResponse(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Statuses that justify retrying another candidate. Everything else (400, 404,
// 422, ...) is treated as a request that would fail everywhere.
export function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status >= 500;
}

// Restrict a value to printable ASCII so user-supplied provider names / model
// IDs can't smuggle control characters into a response header.
function headerSafe(s: string): string {
  const cleaned = s.replace(/[^\x20-\x7e]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "?";
}

interface AttemptResult {
  kind: "ok" | "retriable" | "nonretriable";
  response?: Response; // kind === "ok": response ready to hand to the client
  status?: number;
  detail?: string; // readable failure detail — never includes API keys
}

// Try one (provider, model) candidate. The request is forwarded with the
// candidate's model (candidates are the only place model substitution happens).
async function tryCandidate(
  c: Candidate,
  body: Record<string, unknown>,
  wantStream: boolean,
): Promise<AttemptResult> {
  const url = chatCompletionsUrl(c.provider.baseUrl);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${c.provider.apiKey}`,
      },
      body: JSON.stringify({ ...body, model: c.model }),
      signal: ac.signal,
    });
  } catch (err) {
    return {
      kind: "retriable",
      status: 502,
      detail: `could not reach provider "${c.provider.name}" at ${url}: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const detail = (text || upstream.statusText).slice(0, 800);
    return {
      kind: isRetriableStatus(upstream.status) ? "retriable" : "nonretriable",
      status: upstream.status,
      detail,
    };
  }

  // Success — attach the served-by header so callers can see what served.
  const headers: Record<string, string> = {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
  };
  if (wantStream) headers["cache-control"] = "no-cache";
  headers["x-onerouter-served-by"] = `${headerSafe(c.provider.name)}/${headerSafe(c.model)}`;

  const outBody =
    wantStream && upstream.body
      ? guardStream(upstream.body, c.provider.name, c.model)
      : upstream.body;
  return { kind: "ok", response: new Response(outBody, { status: 200, headers }) };
}

// Wrap a 200 SSE body so a stream that dies mid-delivery ends with a readable
// error event instead of a silent connection drop. Never switches providers
// mid-stream (failover already happened before this point).
function guardStream(
  body: ReadableStream<Uint8Array>,
  providerName: string,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: {
                  message: `OneRouter: stream from provider "${providerName}" (model ${model}) interrupted mid-stream: ${(err as Error).message}`,
                },
              })}\n\n`,
            ),
          );
        } catch {
          /* controller already closed */
        }
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

// Walk the fallback chain, retrying retriable failures, bounded to
// MAX_ATTEMPTS total upstream attempts. On total failure returns 502 with a
// readable summary of what was tried (provider names/models + last error —
// never API keys).
export async function forwardWithFailover(
  candidates: Candidate[],
  body: Record<string, unknown>,
): Promise<Response> {
  const wantStream = body.stream === true;
  const attempts = candidates.slice(0, MAX_ATTEMPTS);
  const tried: string[] = [];
  let lastDetail = "";

  for (const c of attempts) {
    const label = `${c.provider.name}/${c.model}`;
    const result = await tryCandidate(c, body, wantStream);
    if (result.kind === "ok") return result.response as Response;

    tried.push(label);
    lastDetail =
      result.detail ||
      `provider "${c.provider.name}" returned HTTP ${result.status ?? "?"}`;

    if (result.kind === "nonretriable") {
      // The request itself is bad — it would fail everywhere, don't retry.
      return jsonResponse(result.status ?? 502, {
        error: { message: `OneRouter: ${label} failed: ${lastDetail}` },
      });
    }
    // retriable -> continue with the next candidate
  }

  return jsonResponse(502, {
    error: {
      message: `OneRouter: all ${tried.length} attempt(s) failed (max ${MAX_ATTEMPTS}). Tried: ${tried.join(", ")}. Last error: ${lastDetail}`,
    },
  });
}
