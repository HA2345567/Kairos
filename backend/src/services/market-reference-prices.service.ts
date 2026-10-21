/** Public mainnet market references for display only. Never use these prices to
 * prepare Devnet transactions, value verified NAV, or record execution. */
import { all, run } from "../db/postgres";
import { SOLANA_MINTS, enqueueProviderRequest } from "./market-data.service";

export type MarketReferencePrice = {
  marketMint: string;
  priceUsd: number | null;
  change24h: number | null;
  source: "GeckoTerminal" | "DEX Screener" | null;
  asOf: string | null;
  status: "current" | "stale" | "unavailable";
  reason?: string;
};

const ALLOWED_MINTS = new Set(Object.values(SOLANA_MINTS));
const REFRESH_MS = 60_000;
const MAX_STALE_MS = 15 * 60_000;
const MIN_LIQUIDITY_USD = 1_000;
const requests = new Map<string, Promise<Record<string, MarketReferencePrice>>>();

const number = (value: unknown): number | null => {
  const parsed = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(parsed) ? null : parsed;
};

const unavailable = (mint: string, reason = "No liquid public Solana market price is available."): MarketReferencePrice => ({
  marketMint: mint, priceUsd: null, change24h: null, source: null, asOf: null, status: "unavailable", reason,
});

async function geckoPrices(mints: string[]): Promise<Record<string, MarketReferencePrice>> {
  const result: Record<string, MarketReferencePrice> = {};
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/${mints.map(encodeURIComponent).join(",")}?include=top_pools`;
  const response = await enqueueProviderRequest(url, true);
  if (!response.ok) throw new Error(`GeckoTerminal returned ${response.status}`);
  const payload = await response.json() as {
    data?: Array<{ id: string; attributes?: Record<string, unknown>; relationships?: { top_pools?: { data?: Array<{ id: string }> } } }>;
    included?: Array<{ id: string; attributes?: Record<string, unknown> }>;
  };
  const included = new Map((payload.included ?? []).map((pool) => [pool.id, pool]));
  const allowed = new Set(mints);
  const now = new Date().toISOString();
  for (const token of payload.data ?? []) {
    const mint = token.id.split("_").at(-1) ?? "";
    if (!allowed.has(mint)) continue;
    const pool = included.get(token.relationships?.top_pools?.data?.[0]?.id ?? "");
    const attrs = token.attributes ?? {};
    const poolAttrs = pool?.attributes ?? {};
    const priceUsd = number(attrs.price_usd);
    const liquidity = number(attrs.total_reserve_in_usd) ?? number(poolAttrs.reserve_in_usd);
    if (priceUsd === null || priceUsd <= 0 || liquidity === null || liquidity < MIN_LIQUIDITY_USD) continue;
    result[mint] = {
      marketMint: mint,
      priceUsd,
      change24h: number((poolAttrs.price_change_percentage as Record<string, unknown> | undefined)?.h24),
      source: "GeckoTerminal",
      asOf: now,
      status: "current",
    };
  }
  return result;
}

async function dexPrices(mints: string[]): Promise<Record<string, MarketReferencePrice>> {
  const result: Record<string, MarketReferencePrice> = {};
  const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.map(encodeURIComponent).join(",")}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`DEX Screener returned ${response.status}`);
  const pairs = await response.json() as Array<{
    chainId?: string;
    baseToken?: { address?: string };
    priceUsd?: string;
    priceChange?: { h24?: number };
    liquidity?: { usd?: number };
  }>;
  if (!Array.isArray(pairs)) return result;
  const allowed = new Set(mints);
  const best = new Map<string, { priceUsd: number; liquidity: number; change24h: number | null }>();
  for (const pair of pairs) {
    const mint = pair.baseToken?.address ?? "";
    const priceUsd = number(pair.priceUsd);
    const liquidity = number(pair.liquidity?.usd);
    if (pair.chainId !== "solana" || !allowed.has(mint) || priceUsd === null || priceUsd <= 0 || liquidity === null || liquidity < MIN_LIQUIDITY_USD) continue;
    if ((best.get(mint)?.liquidity ?? 0) < liquidity) {
      best.set(mint, { priceUsd, liquidity, change24h: number(pair.priceChange?.h24) });
    }
  }
  const now = new Date().toISOString();
  for (const [mint, price] of best) {
    result[mint] = { marketMint: mint, priceUsd: price.priceUsd, change24h: price.change24h, source: "DEX Screener", asOf: now, status: "current" };
  }
  return result;
}

async function refreshPrices(mints: string[]): Promise<Record<string, MarketReferencePrice>> {
  // Reserve the limited candle-provider quota for charts. Only request a
  // GeckoTerminal quote when the independent price provider has no liquid pair.
  const result = await dexPrices(mints).catch((error) => {
    console.warn("[market-reference] DEX Screener:", (error as Error).message);
    return {} as Record<string, MarketReferencePrice>;
  });
  const missing = mints.filter((mint) => !result[mint]);
  if (missing.length) {
    Object.assign(result, await geckoPrices(missing).catch((error) => {
      console.warn("[market-reference] GeckoTerminal:", (error as Error).message);
      return {};
    }));
  }
  return result;
}

export async function getTokenMarketPrices(requestedMints: string[]): Promise<Record<string, MarketReferencePrice>> {
  const mints = [...new Set(requestedMints)].filter((mint) => ALLOWED_MINTS.has(mint)).sort();
  if (!mints.length) return {};
  const key = mints.join(",");
  const pending = requests.get(key);
  if (pending) return pending;
  const request = loadPrices(mints);
  requests.set(key, request);
  try { return await request; }
  finally { if (requests.get(key) === request) requests.delete(key); }
}

async function loadPrices(mints: string[]): Promise<Record<string, MarketReferencePrice>> {
  const rows = await all<{ market_mint: string; payload_json: string; fetched_at: string }>(
    `SELECT market_mint, payload_json, fetched_at FROM market_reference_price_cache WHERE market_mint IN (${mints.map(() => "?").join(",")})`,
    ...mints,
  );
  const stored = new Map<string, { price: MarketReferencePrice; fetchedAt: number }>();
  for (const row of rows) {
    try {
      const price = JSON.parse(row.payload_json) as MarketReferencePrice;
      const fetchedAt = Date.parse(row.fetched_at);
      if (price.marketMint === row.market_mint && Number.isFinite(fetchedAt)) stored.set(row.market_mint, { price, fetchedAt });
    } catch { /* Discard a corrupt cache row. */ }
  }
  const now = Date.now();
  const toRefresh = mints.filter((mint) => !stored.has(mint) || now - stored.get(mint)!.fetchedAt >= REFRESH_MS);
  const refreshed = toRefresh.length ? await refreshPrices(toRefresh) : {};
  const result: Record<string, MarketReferencePrice> = {};
  const writes: Array<Promise<number>> = [];
  for (const mint of mints) {
    const hit = refreshed[mint];
    if (hit) {
      result[mint] = hit;
      writes.push(run(
        "INSERT INTO market_reference_price_cache (market_mint, payload_json, fetched_at) VALUES (?, ?, ?) ON CONFLICT (market_mint) DO UPDATE SET payload_json = EXCLUDED.payload_json, fetched_at = EXCLUDED.fetched_at",
        mint, JSON.stringify(hit), hit.asOf,
      ));
    } else {
      const cached = stored.get(mint);
      const age = cached ? now - cached.fetchedAt : Infinity;
      result[mint] = cached?.price.priceUsd && age < MAX_STALE_MS
        ? { ...cached.price, status: age < REFRESH_MS ? "current" : "stale" }
        : unavailable(mint);
      // Negative-cache missing markets for one minute without erasing a useful
      // older price; a later request can retry both providers.
      if (!cached && toRefresh.includes(mint)) {
        writes.push(run(
          "INSERT INTO market_reference_price_cache (market_mint, payload_json, fetched_at) VALUES (?, ?, ?) ON CONFLICT (market_mint) DO UPDATE SET payload_json = EXCLUDED.payload_json, fetched_at = EXCLUDED.fetched_at",
          mint, JSON.stringify(result[mint]), new Date(now).toISOString(),
        ));
      }
    }
  }
  const persisted = await Promise.allSettled(writes);
  if (persisted.some((write) => write.status === "rejected")) {
    console.warn("[market-reference] Some price cache writes failed.");
  }
  return result;
}
