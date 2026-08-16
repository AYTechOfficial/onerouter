// OneRouter gateway — request router for the config API and the OpenAI-compatible
// proxy. Exported handleGatewayRequest returns a Response for gateway routes and
// null for everything else, so serve.ts can fall through to the site.

import { timingSafeEqual } from "node:crypto";
import { PUBLIC_ORIGIN } from "./config";
import { buildFallbackChain } from "./fallback";
import { forwardWithFailover } from "./proxy";
import {
  addProvider,
  deleteProvider,
  getUnifiedKey,
  listProviders,
  toPublic,
  type Provider,
  type Tier,
} from "./store";

const TIERS: readonly Tier[] = ["top", "medium", "other"];

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

function requireAuth(req: Request): boolean {
  const expected = getUnifiedKey();
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token.length !== expected.length) return false;
  try {
    return timingSafeEqual(new TextEncoder().encode(token), new TextEncoder().encode(expected));
  } catch {
    return false;
  }
}

function unauthorized(): Response {
  return jsonResponse(401, {
    error: { message: "unauthorized: missing or invalid OneRouter API key (Authorization: Bearer <key>)" },
  });
}

// The base URL we hand the user for /v1. Always the configured public origin:
// the request's Host is either masked to loopback by the reverse proxy or is the
// sandbox's internal hostname — neither is usable by the owner. Override with
// ONEROUTER_PUBLIC_ORIGIN (see config.ts).
function requestOrigin(_req: Request): string {
  return PUBLIC_ORIGIN;
}

function handleProvidersPost(body: unknown): Response {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const baseUrl = typeof b.baseUrl === "string" ? b.baseUrl.trim() : "";
  const apiKey = typeof b.apiKey === "string" ? b.apiKey.trim() : "";
  const tierRaw = typeof b.tier === "string" ? b.tier : "other";
  const modelsRaw = Array.isArray(b.models) ? b.models : [];

  if (!name) throw new HttpError(400, "name is required (non-empty string)");
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new HttpError(400, "baseUrl is required and must start with http:// or https://");
  }
  if (!apiKey) throw new HttpError(400, "apiKey is required (non-empty string)");
  if (!TIERS.includes(tierRaw as Tier)) {
    throw new HttpError(400, `tier must be one of: ${TIERS.join(", ")}`);
  }
  if (modelsRaw.some((m) => typeof m !== "string")) {
    throw new HttpError(400, "models must be an array of strings");
  }

  const provider = addProvider({
    name,
    baseUrl,
    apiKey,
    models: modelsRaw as string[],
    tier: tierRaw as Tier,
  });
  return jsonResponse(201, { provider: toPublic(provider) });
}

function handleModelsGet(): Response {
  const seen = new Set<string>();
  const data: Array<Record<string, unknown>> = [];
  const created = Math.floor(Date.now() / 1000);
  for (const p of listProviders()) {
    for (const m of p.models) {
      if (seen.has(m)) continue;
      seen.add(m);
      data.push({ id: m, object: "model", created, owned_by: p.name });
    }
  }
  data.push({ id: "top", object: "model", created, owned_by: "onerouter" });
  data.push({ id: "medium", object: "model", created, owned_by: "onerouter" });
  return jsonResponse(200, { object: "list", data });
}

async function handleChatCompletionsPost(req: Request): Promise<Response> {
  if (!requireAuth(req)) return unauthorized();
  const body = await readJson(req);
  const b = (body ?? {}) as Record<string, unknown>;
  const model = typeof b.model === "string" ? b.model : "";
  if (!model) throw new HttpError(400, "model is required (a provider model ID, or the aliases \"top\" / \"medium\")");

  const chain = buildFallbackChain(model);
  if (!chain || chain.length === 0) {
    throw new HttpError(404, `model "${model}" is not configured on any provider`);
  }
  return forwardWithFailover(chain, b);
}

// Returns a Response for gateway routes, or null if the path is not ours.
export async function handleGatewayRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method;

  try {
    if (pathname === "/api/providers") {
      if (method === "GET") return jsonResponse(200, { providers: listProviders().map(toPublic) });
      if (method === "POST") return handleProvidersPost(await readJson(req));
      return jsonResponse(405, { error: { message: "method not allowed" } });
    }

    if (pathname.startsWith("/api/providers/") && method === "DELETE") {
      const id = decodeURIComponent(pathname.slice("/api/providers/".length));
      if (!id) return jsonResponse(400, { error: { message: "provider id is required" } });
      return deleteProvider(id) ? new Response(null, { status: 204 }) : jsonResponse(404, { error: { message: "provider not found" } });
    }

    if (pathname === "/api/settings" && method === "GET") {
      return jsonResponse(200, {
        baseUrl: `${requestOrigin(req)}/v1`,
        apiKey: getUnifiedKey(),
        providerCount: listProviders().length,
      });
    }

    if (pathname === "/v1/models" && method === "GET") {
      if (!requireAuth(req)) return unauthorized();
      return handleModelsGet();
    }

    if (pathname === "/v1/chat/completions" && method === "POST") {
      return await handleChatCompletionsPost(req);
    }
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse(err.status, { error: { message: err.message } });
    throw err;
  }

  return null;
}

export type { Provider };
