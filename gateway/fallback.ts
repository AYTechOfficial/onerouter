// Fallback-chain builder for OneRouter failover.
//
// Produces the ordered list of (provider, model) candidates the proxy should try
// for a chat-completions request, so that when an upstream attempt fails the
// gateway can retry automatically (see proxy.ts's forwardWithFailover).
//
// Ordering rules:
// - Exact model ID requested: every provider offering that exact model, in
//   provider order; only when those are exhausted, equivalent models — other
//   models in the same tier as the first exact-match provider, in provider
//   order then model order.
// - Alias requested ("top" / "medium"): each provider in that tier in order
//   (using that provider's first model), then every remaining model in that
//   tier as further candidates (provider order, then model order).
//
// Returns null when the requested model is not configured anywhere (caller
// keeps the existing readable 404 behavior). Pairs are deduplicated by
// provider id + model id, and a provider is only ever paired with a model it
// actually lists.

import { listProviders, type Provider, type Tier } from "./store";

export interface Candidate {
  provider: Provider;
  model: string;
}

function addPair(
  seen: Set<string>,
  out: Candidate[],
  provider: Provider,
  model: string,
): void {
  if (!provider.models.includes(model)) return;
  const key = `${provider.id}/${model}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ provider, model });
}

function chainForAlias(tier: Tier): Candidate[] {
  const providers = listProviders().filter(
    (p) => p.tier === tier && p.models.length > 0,
  );
  const seen = new Set<string>();
  const out: Candidate[] = [];
  // First each provider's first model, in provider order.
  for (const p of providers) addPair(seen, out, p, p.models[0]);
  // Then every remaining model in the tier.
  for (const p of providers) for (const m of p.models) addPair(seen, out, p, m);
  return out;
}

export function buildFallbackChain(model: string): Candidate[] | null {
  if (model === "top" || model === "medium") return chainForAlias(model);

  const providers = listProviders();
  const exact = providers.filter((p) => p.models.includes(model));
  if (exact.length === 0) return null;

  const tier = exact[0].tier; // tier of the provider that would serve first
  const seen = new Set<string>();
  const out: Candidate[] = [];

  // 1) Exact model on every provider that lists it, in provider order.
  for (const p of exact) addPair(seen, out, p, model);

  // 2) Equivalent models: other models in that tier, provider order then model
  //    order. Only reached after every exact-model provider has failed.
  for (const p of providers) {
    if (p.tier !== tier) continue;
    for (const m of p.models) {
      if (m === model) continue;
      addPair(seen, out, p, m);
    }
  }
  return out;
}
