/** Public market reference data for basket assets. This data is intentionally
 * separate from oracle snapshots used by execution and NAV calculations. */

import { createHash } from "node:crypto";
import { one, run } from "../db/postgres";

const SOLANA_MINTS: Record<string, string> = {
  CLOUD: "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu",
  BP: "BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  JITOSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  SOL: "So11111111111111111111111111111111111111112",
  MSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  KMNO: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  ORCA: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  MET: "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL",
  ARX: "ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs",
  JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
  PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
  RENDER: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  TRUMP: "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
  PENGU: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  FARTCOIN: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
  NOS: "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7",
  IO: "BZLbGTNCSFfoth2GYDtwr7e4imWzpR5jqcUuGEwr646K",
  HNT: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
  MOBILE: "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
  IOT: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns",
  HONEY: "4vMsoUT2BWatFweudnQM1xedRLfJgJ7hswhcpz4xgBTy",
  USDY: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6",
  SPYX: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  XAUM: "5aLhp9VnUEKcsdtkfsf2DUgpJfomx7GmYVny24dHUZoB",
};

const NO_PUBLIC_MARKET = new Set(["OUSG", "BUIDL"]);
const CACHE_MS = 60_000;
const PROVIDER_URL = "https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi";

type BasketToken = { mint: string; symbol: string; name?: string; weightBps: number };
type MarketAsset = {
  mint: string;
  symbol: string;
  name: string;
  weightBps: number;
  marketMint: string | null;
  marketUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  poolAddress: string | null;
  poolName: string | null;
  dexId: string | null;
  transactions24h: number | null;
  sparkline24h: number[] | null;
  sparklineAsOf: string | null;
  sparklineStatus: "loading" | "ready" | "summary" | "unavailable";
  status: "live" | "unavailable";
  reason?: string;
};

type CacheEntry = { expiresAt: number; response: BasketMarketData };
export type MarketNavWindow = "1W" | "1M" | "6M" | "1Y" | "3Y";
type PriceCandle = { timestamp: number; priceUsd: number };
type NavHistoryEntry = { expiresAt: number; points: PriceCandle[] };
export type BasketMarketNavHistory = {
  source: "GeckoTerminal";
  window: MarketNavWindow;
  history: Array<{ timestamp: number; navValue: number }>;
  progress: { loaded: number; publicMarkets: number; basketAssets: number; coverageWeightBps: number; pendingSymbols: string[] };
  complete: boolean;
  availableFrom: number | null;
  fetchedAt: string;
  excludedAssets: Array<{ symbol: string; reason: string }>;
  disclaimer: string;
};
export type BasketMarketData = {
  source: "GeckoTerminal";
  fetchedAt: string;
  refreshAfterSec: number;
  assets: MarketAsset[];
  coverage: { available: number; total: number; weightBps: number };
  totalVolume24hUsd: number;
  totalLiquidityUsd: number;
  coveredLegsChange24hPct: number | null;
  basketChange24hPct: number | null;
};

const cache = new Map<string, CacheEntry>();
const marketDataRequests = new Map<string, Promise<BasketMarketData>>();
const sparklineCache = new Map<string, { expiresAt: number; values: number[]; fetchedAt: string }>();
const historyCache = new Map<string, NavHistoryEntry>();
const historyRefreshStartedAt = new Map<string, number>();
const historyRefreshes = new Map<string, Promise<void>>();
const sparklineRetryAfter = new Map<string, number>();
const queuedSparklineMints = new Set<string>();
const historyRetryAfter = new Map<string, number>();
const queuedHistoryMints = new Set<string>();
const providerRequestQueue: Array<{ url: string; resolve: (response: Response) => void; reject: (error: Error) => void }> = [];
let providerRequestActive = false;
let providerRetryAfter = 0;

function retryDelayMs(response: Response, fallbackMs: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(15_000, Math.min(seconds * 1000, 5 * 60_000));
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return Math.max(15_000, Math.min(dateDelay, 5 * 60_000));
  }
  return fallbackMs;
}

/** GeckoTerminal's public tier is limited, so serialize both quote and candle requests. */
function enqueueProviderRequest(url: string, priority = false): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (Date.now() < providerRetryAfter) {
      reject(new Error("Market data provider rate limit; retry scheduled."));
      return;
    }
    const request = { url, resolve, reject };
    if (priority) providerRequestQueue.unshift(request);
    else providerRequestQueue.push(request);
    drainProviderRequests();
  });
}

function drainProviderRequests() {
  if (providerRequestActive || providerRequestQueue.length === 0) return;
  providerRequestActive = true;
  const request = providerRequestQueue.shift()!;
  void fetch(request.url, { headers: { accept: "application/json;version=20230302" }, signal: AbortSignal.timeout(8_000) })
    .then((response) => {
      if (response.status === 429) {
        providerRetryAfter = Math.max(providerRetryAfter, Date.now() + retryDelayMs(response, 60_000));
      }
      request.resolve(response);
    }, request.reject)
    .finally(() => {
      setTimeout(() => {
        providerRequestActive = false;
        drainProviderRequests();
      }, Math.max(6_500, providerRetryAfter - Date.now()));
    });
}

function requestSparkline(asset: MarketAsset) {
  if (!asset.marketMint || !asset.poolAddress) return;
  const key = asset.marketMint;
  const existing = sparklineCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return;
  if (queuedSparklineMints.has(key) || (sparklineRetryAfter.get(key) ?? 0) > Date.now()) return;
  queuedSparklineMints.add(key);
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(asset.poolAddress)}/ohlcv/hour?aggregate=1&limit=24&currency=usd&token=${encodeURIComponent(asset.marketMint)}`;
  // Card charts are visible immediately on basket pages, so let the 24H candle
  // request run before the slower daily history backfill.
  void enqueueProviderRequest(url, true)
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 429) sparklineRetryAfter.set(key, Date.now() + retryDelayMs(response, 60_000));
        throw new Error(`OHLCV endpoint returned ${response.status}`);
      }
      const payload = await response.json() as { data?: { attributes?: { ohlcv_list?: unknown[][] } } };
      const values = (payload.data?.attributes?.ohlcv_list ?? [])
        .map((row) => ({ timestamp: Number(row[0]), close: numeric(row[4]) }))
        .filter((row): row is { timestamp: number; close: number } => Number.isFinite(row.timestamp) && row.close !== null)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((row) => row.close);
      if (values.length >= 2) {
        sparklineCache.set(key, { values, fetchedAt: new Date().toISOString(), expiresAt: Date.now() + 5 * 60_000 });
        sparklineRetryAfter.delete(key);
      } else {
        sparklineRetryAfter.set(key, Date.now() + 5 * 60_000);
      }
    })
    .catch((error) => {
      console.warn("[market-data] OHLCV request failed:", (error as Error).message);
      if ((sparklineRetryAfter.get(key) ?? 0) <= Date.now()) sparklineRetryAfter.set(key, Date.now() + 60_000);
    })
    .finally(() => queuedSparklineMints.delete(key));
}

function requestDailyHistory(asset: MarketAsset) {
  if (!asset.marketMint || !asset.poolAddress || asset.status !== "live") return;
  const key = asset.marketMint;
  const existing = historyCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return;
  if (queuedHistoryMints.has(key) || (historyRetryAfter.get(key) ?? 0) > Date.now()) return;
  queuedHistoryMints.add(key);
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(asset.poolAddress)}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=${encodeURIComponent(asset.marketMint)}`;
  // Daily candles power the historical chart; give them the next provider slot
  // ahead of best-effort card sparklines so the page's main chart fills sooner.
  void enqueueProviderRequest(url, true)
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 429) historyRetryAfter.set(key, Date.now() + retryDelayMs(response, 60_000));
        throw new Error(`Daily OHLCV endpoint returned ${response.status}`);
      }
      const payload = await response.json() as { data?: { attributes?: { ohlcv_list?: unknown[][] } } };
      const points = (payload.data?.attributes?.ohlcv_list ?? [])
        .map((row) => ({ timestamp: Number(row[0]) * 1000, priceUsd: numeric(row[4]) }))
        .filter((row): row is PriceCandle => Number.isFinite(row.timestamp) && row.priceUsd !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
      if (points.length >= 2) {
        historyCache.set(key, { points, expiresAt: Date.now() + 60 * 60_000 });
        historyRetryAfter.delete(key);
      } else {
        historyRetryAfter.set(key, Date.now() + 10 * 60_000);
      }
    })
    .catch((error) => {
      console.warn("[market-data] daily OHLCV request failed:", (error as Error).message);
      if ((historyRetryAfter.get(key) ?? 0) <= Date.now()) historyRetryAfter.set(key, Date.now() + 60_000);
    })
    .finally(() => queuedHistoryMints.delete(key));
}

function attachSparklines(response: BasketMarketData): BasketMarketData {
  for (const asset of response.assets) {
    requestSparkline(asset);
    const sparkline = asset.marketMint ? sparklineCache.get(asset.marketMint) : undefined;
    const changeFactor = asset.change24hPct === null ? null : 1 + asset.change24hPct / 100;
    const endpointReference = asset.priceUsd !== null && changeFactor !== null && changeFactor > 0
      ? [asset.priceUsd / changeFactor, asset.priceUsd]
      : null;
    asset.sparkline24h = sparkline?.values ?? endpointReference;
    asset.sparklineAsOf = sparkline?.fetchedAt ?? null;
    const retryAfter = asset.marketMint ? sparklineRetryAfter.get(asset.marketMint) ?? 0 : 0;
    asset.sparklineStatus = sparkline?.values.length
      ? "ready"
      : endpointReference
        ? "summary"
      : asset.marketMint && asset.poolAddress && asset.status === "live" && retryAfter <= Date.now()
        ? "loading"
        : "unavailable";
  }
  return response;
}
const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalizedSymbol = (symbol: string) => symbol.replace(/^t(?=[A-Z])/, "").toUpperCase();
const providerSymbolMatches = (symbol: string, providerSymbol: string) =>
  symbol === providerSymbol || (symbol === "SPYX" && providerSymbol === "SPYX");

export async function getBasketMarketData(tokens: BasketToken[]): Promise<BasketMarketData> {
  const symbols = tokens.map((token) => normalizedSymbol(token.symbol));
  const mintBySymbol = new Map(symbols.map((symbol) => [symbol, SOLANA_MINTS[symbol]]));
  const mints = [...new Set([...mintBySymbol.values()].filter((mint): mint is string => Boolean(mint)))].sort();
  const key = mints.join(",") + "|" + symbols.sort().join(",");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return attachSparklines(cached.response);

  const pending = marketDataRequests.get(key);
  if (pending) return pending.then(attachSparklines);

  const request = fetchBasketMarketData(tokens, key, mintBySymbol, mints);
  marketDataRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (marketDataRequests.get(key) === request) marketDataRequests.delete(key);
  }
}

async function fetchBasketMarketData(
  tokens: BasketToken[],
  key: string,
  mintBySymbol: Map<string, string | undefined>,
  mints: string[],
): Promise<BasketMarketData> {
  const assets: MarketAsset[] = tokens.map((token) => {
    const symbol = normalizedSymbol(token.symbol);
    const marketMint = mintBySymbol.get(symbol) ?? null;
    return {
      mint: token.mint,
      symbol,
      name: token.name ?? symbol,
      weightBps: token.weightBps,
      marketMint,
      marketUrl: marketMint ? `https://www.geckoterminal.com/solana/tokens/${marketMint}` : null,
      priceUsd: null,
      change24hPct: null,
      volume24hUsd: null,
      liquidityUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      poolAddress: null,
      poolName: null,
      dexId: null,
      transactions24h: null,
      sparkline24h: null,
      sparklineAsOf: null,
      sparklineStatus: "unavailable",
      status: "unavailable",
      reason: NO_PUBLIC_MARKET.has(symbol)
        ? "No public market feed; issuer eligibility or a supported marketplace is required."
        : marketMint ? "Market data is temporarily unavailable." : "No verified underlying mainnet market is configured.",
    };
  });

  let providerFailed = false;
  if (mints.length) {
    try {
      const url = `${PROVIDER_URL}/${mints.map(encodeURIComponent).join(",")}?include=top_pools`;
      const response = await enqueueProviderRequest(url, true);
      if (!response.ok) throw new Error(`GeckoTerminal returned ${response.status}`);
      const payload = await response.json() as {
        data?: Array<{ id: string; attributes?: Record<string, unknown>; relationships?: { top_pools?: { data?: Array<{ id: string }> } } }>;
        included?: Array<{
          id: string;
          attributes?: Record<string, unknown>;
          relationships?: { dex?: { data?: { id?: string } } };
        }>;
      };
      const includedById = new Map((payload.included ?? []).map((item) => [item.id, item]));
      const dataByMint = new Map((payload.data ?? []).map((item) => [item.id.split("_").at(-1) ?? "", item]));
      for (const asset of assets) {
        if (!asset.marketMint) continue;
        const market = dataByMint.get(asset.marketMint);
        if (!market) continue;
        const attrs = market.attributes ?? {};
        const pools = market.relationships?.top_pools?.data ?? [];
        const poolId = pools[0]?.id;
        const pool = poolId ? includedById.get(poolId) : undefined;
        const poolAttrs = pool?.attributes ?? {};
        const providerSymbol = typeof attrs.symbol === "string" ? attrs.symbol.replace(/^\$/, "").toUpperCase() : "";
        if (providerSymbol && !providerSymbolMatches(asset.symbol, providerSymbol)) {
          asset.reason = `Market symbol mismatch (${providerSymbol}); quote withheld.`;
          continue;
        }
        asset.priceUsd = numeric(attrs.price_usd);
        asset.change24hPct = numeric((poolAttrs.price_change_percentage as Record<string, unknown> | undefined)?.h24);
        asset.volume24hUsd = numeric((attrs.volume_usd as Record<string, unknown> | undefined)?.h24)
          ?? numeric((poolAttrs.volume_usd as Record<string, unknown> | undefined)?.h24);
        asset.liquidityUsd = numeric(attrs.total_reserve_in_usd) ?? numeric(poolAttrs.reserve_in_usd);
        asset.marketCapUsd = numeric(attrs.market_cap_usd);
        asset.fdvUsd = numeric(attrs.fdv_usd);
        asset.poolAddress = typeof poolAttrs.address === "string" ? poolAttrs.address : poolId?.split("_").at(-1) ?? null;
        asset.poolName = typeof poolAttrs.name === "string" ? poolAttrs.name : null;
        asset.dexId = typeof poolAttrs.dex_name === "string"
          ? poolAttrs.dex_name
          : pool?.relationships?.dex?.data?.id?.split("_").at(-1) ?? null;
        const tx = poolAttrs.transactions as Record<string, Record<string, unknown>> | undefined;
        const h24 = tx?.h24;
        asset.transactions24h = h24 ? (numeric(h24.buys) ?? 0) + (numeric(h24.sells) ?? 0) : null;
        asset.status = asset.priceUsd !== null ? "live" : "unavailable";
        asset.reason = asset.priceUsd !== null ? undefined : "The public pool has no reliable current USD price.";
      }
    } catch (error) {
      // Market-data failure is an unavailable state, never a reason to block basket details.
      console.warn("[market-data] GeckoTerminal request failed:", (error as Error).message);
      providerFailed = true;
    }
  }

  const liveAssets = assets.filter((asset) => asset.status === "live");
  const availableWeight = liveAssets.reduce((sum, asset) => sum + asset.weightBps, 0);
  const totalWeight = assets.reduce((sum, asset) => sum + asset.weightBps, 0);
  const coveredLegsChange24hPct = availableWeight > 0 && liveAssets.every((asset) => asset.change24hPct !== null)
    ? liveAssets.reduce((sum, asset) => sum + asset.weightBps * (asset.change24hPct ?? 0), 0) / availableWeight
    : null;
  const result: BasketMarketData = {
    source: "GeckoTerminal",
    fetchedAt: new Date().toISOString(),
    refreshAfterSec: CACHE_MS / 1000,
    assets,
    coverage: { available: liveAssets.length, total: assets.length, weightBps: availableWeight },
    totalVolume24hUsd: liveAssets.reduce((sum, asset) => sum + (asset.volume24hUsd ?? 0), 0),
    totalLiquidityUsd: liveAssets.reduce((sum, asset) => sum + (asset.liquidityUsd ?? 0), 0),
    coveredLegsChange24hPct,
    basketChange24hPct: liveAssets.length === assets.length && availableWeight === totalWeight ? coveredLegsChange24hPct : null,
  };
  const withSparklines = attachSparklines(result);
  cache.set(key, { expiresAt: Date.now() + (providerFailed ? 10_000 : CACHE_MS), response: withSparklines });
  return withSparklines;
}

const MARKET_NAV_WINDOW_DAYS: Record<MarketNavWindow, number> = { "1W": 7, "1M": 30, "6M": 183, "1Y": 365, "3Y": 1095 };

function lastCandleAtOrBefore(candles: PriceCandle[], timestamp: number): PriceCandle | undefined {
  let low = 0;
  let high = candles.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (candles[middle].timestamp <= timestamp) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result >= 0 ? candles[result] : undefined;
}

/** Build a current-weight, normalized basket NAV from public Solana pool candles. */
async function buildBasketMarketNavHistory(tokens: BasketToken[], window: MarketNavWindow): Promise<BasketMarketNavHistory> {
  const market = await getBasketMarketData(tokens);
  const publicAssets = market.assets.filter((asset) => asset.status === "live" && asset.priceUsd !== null && asset.poolAddress);
  for (const asset of publicAssets) requestDailyHistory(asset);

  const loaded = publicAssets.flatMap((asset) => {
    const candles = asset.marketMint ? historyCache.get(asset.marketMint)?.points : undefined;
    return candles?.length ? [{ asset, candles }] : [];
  });
  const availableWeightBps = loaded.reduce((sum, item) => sum + item.asset.weightBps, 0);
  const excludedAssets = market.assets
    .filter((asset) => asset.status !== "live")
    .map((asset) => ({ symbol: asset.symbol, reason: asset.reason ?? "No public market history is available." }));
  const allHistoryReady = loaded.length === publicAssets.length && loaded.length > 0;
  const points: Array<{ timestamp: number; navValue: number }> = [];
  let availableFrom: number | null = null;

  // Render usable partial history while the rate-limited provider backfills the
  // remaining assets. Waiting for every leg made the historical panel look empty.
  if (loaded.length > 0) {
    const startOfCommonHistory = Math.max(...loaded.map(({ candles }) => candles[0].timestamp));
    availableFrom = startOfCommonHistory;
    const now = Date.now();
    const cutoff = now - MARKET_NAV_WINDOW_DAYS[window] * 86_400_000;
    const start = Math.max(cutoff, startOfCommonHistory);
    const dateSet = new Set<number>();
    for (const { candles } of loaded) {
      for (const candle of candles) if (candle.timestamp >= start && candle.timestamp <= now) dateSet.add(candle.timestamp);
    }
    const dates = [...dateSet].sort((a, b) => a - b);
    const baseline = new Map<string, number>();
    for (const { asset, candles } of loaded) {
      const candle = lastCandleAtOrBefore(candles, start) ?? candles[0];
      if (candle) baseline.set(asset.symbol, candle.priceUsd);
    }

    for (const timestamp of dates) {
      let weightedIndex = 0;
      let weight = 0;
      for (const { asset, candles } of loaded) {
        const firstPrice = baseline.get(asset.symbol);
        if (!firstPrice || firstPrice <= 0) continue;
        const point = lastCandleAtOrBefore(candles, timestamp);
        if (!point || timestamp - point.timestamp > 3 * 86_400_000) continue;
        weightedIndex += asset.weightBps * point.priceUsd / firstPrice;
        weight += asset.weightBps;
      }
      if (weight > 0) points.push({ timestamp, navValue: Number((weightedIndex / weight).toFixed(6)) });
    }

    // Anchor the latest index to the same live quotes used by the market cards.
    if (points.length && loaded.every(({ asset }) => asset.priceUsd !== null)) {
      const latestIndex = loaded.reduce((sum, { asset }) => sum + asset.weightBps * (asset.priceUsd! / (baseline.get(asset.symbol) ?? asset.priceUsd!)), 0) / availableWeightBps;
      points.push({ timestamp: now, navValue: Number(latestIndex.toFixed(6)) });
    }
  }

  const completenessWeight = tokens.reduce((sum, token) => sum + token.weightBps, 0);
  const totalAssets = tokens.length;
  const data = points.length > 400
    ? points.filter((_, index) => index % Math.ceil(points.length / 400) === 0 || index === points.length - 1)
    : points;
  return {
    source: "GeckoTerminal",
    window,
    history: data,
    progress: {
      loaded: loaded.length,
      publicMarkets: publicAssets.length,
      basketAssets: totalAssets,
      coverageWeightBps: availableWeightBps,
      pendingSymbols: publicAssets
        .filter((asset) => !asset.marketMint || !historyCache.has(asset.marketMint))
        .map((asset) => asset.symbol),
    },
    complete: allHistoryReady && excludedAssets.length === 0 && availableWeightBps === completenessWeight,
    availableFrom: data[0]?.timestamp ?? null,
    fetchedAt: new Date().toISOString(),
    excludedAssets,
    disclaimer: !allHistoryReady || excludedAssets.length > 0 || availableWeightBps < completenessWeight
      ? `Partial historical index: ${loaded.length} of ${totalAssets} basket assets have loaded public candle history (${completenessWeight > 0 ? ((availableWeightBps / completenessWeight) * 100).toFixed(1) : "0.0"}% of target weight represented)${excludedAssets.length ? `; ${excludedAssets.map((asset) => asset.symbol).join(", ")} have no public market feed` : ""}. Current basket weights are applied to available assets.`
      : "Hypothetical index rebased to 1.00 using current basket weights and public market candles. This is not realized investor NAV or a record of past basket rebalances.",
  };
}

function historyCacheKey(tokens: BasketToken[], window: MarketNavWindow): string {
  const composition = tokens
    .map(({ mint, weightBps }) => `${mint}:${weightBps}`)
    .sort()
    .join("|");
  return createHash("sha256").update(`${window}\n${composition}`).digest("hex");
}

async function persistMarketNavHistory(cacheKey: string, response: BasketMarketNavHistory): Promise<void> {
  if (!response.history.length) return;
  await run(
    `INSERT INTO basket_market_nav_history_cache (cache_key, payload_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    cacheKey,
    JSON.stringify(response),
    new Date().toISOString(),
  );
}

/**
 * Read-through cache for public history. A saved, composition-matched chart is
 * returned immediately after API restarts while provider candles refresh in
 * the background. This keeps GeckoTerminal latency and rate limits off the
 * first paint without substituting simulated or unverified values.
 */
export async function getBasketMarketNavHistory(
  tokens: BasketToken[],
  window: MarketNavWindow,
): Promise<BasketMarketNavHistory> {
  const cacheKey = historyCacheKey(tokens, window);
  const cached = await one<{ payload_json: string; updated_at: string }>(
    "SELECT payload_json, updated_at FROM basket_market_nav_history_cache WHERE cache_key = ?",
    cacheKey,
  );

  if (cached) {
    try {
      const response = JSON.parse(cached.payload_json) as BasketMarketNavHistory;
      const refreshInterval = response.progress.pendingSymbols.length > 0 ? 30_000 : 5 * 60_000;
      const lastStartedAt = historyRefreshStartedAt.get(cacheKey) ?? 0;
      if (!historyRefreshes.has(cacheKey) && Date.now() - lastStartedAt >= refreshInterval) {
        historyRefreshStartedAt.set(cacheKey, Date.now());
        const refresh = buildBasketMarketNavHistory(tokens, window)
          .then(async (fresh) => {
            const hasAtLeastAsMuchData = fresh.history.length > 0 &&
              fresh.progress.coverageWeightBps >= response.progress.coverageWeightBps &&
              fresh.history.length >= response.history.length;
            if (hasAtLeastAsMuchData) await persistMarketNavHistory(cacheKey, fresh);
          })
          .catch((error) => console.warn("[market-data] cached history refresh failed:", (error as Error).message))
          .finally(() => historyRefreshes.delete(cacheKey));
        historyRefreshes.set(cacheKey, refresh);
      }
      return response;
    } catch (error) {
      console.warn("[market-data] invalid persisted history cache:", (error as Error).message);
    }
  }

  const response = await buildBasketMarketNavHistory(tokens, window);
  await persistMarketNavHistory(cacheKey, response);
  return response;
}
