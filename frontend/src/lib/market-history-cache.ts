import type { BasketMarketNavHistoryResponse } from "@/lib/api-types";

const STORAGE_KEY = "kairos.market-nav-history.v1";
// Historical candles change slowly. Keep a usable chart across browser and
// backend restarts, and refresh it in the background when the page opens.
const MAX_AGE_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 60;

type CachedHistory = { savedAt: number; data: BasketMarketNavHistoryResponse };
type HistoryCache = Record<string, CachedHistory>;

function readStore(): HistoryCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HistoryCache;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, entry]) =>
        Number.isFinite(entry?.savedAt) && now - entry.savedAt < MAX_AGE_MS && Array.isArray(entry?.data?.history),
      ),
    );
  } catch {
    return {};
  }
}

export function readMarketHistoryCache(cacheId: string): CachedHistory | undefined {
  return readStore()[cacheId];
}

export function writeMarketHistoryCache(cacheId: string, data: BasketMarketNavHistoryResponse): void {
  if (typeof window === "undefined" || data.history.length === 0) return;
  try {
    const store = readStore();
    store[cacheId] = { savedAt: Date.now(), data };
    const recent = Object.entries(store)
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    // Storage can be disabled or full. The chart still works from the live query.
  }
}

export function cacheMarketHistoryResult(
  cacheId: string,
  request: () => Promise<BasketMarketNavHistoryResponse>,
): Promise<BasketMarketNavHistoryResponse> {
  return request().then((data) => {
    const cached = readMarketHistoryCache(cacheId)?.data;
    // A cold backend may return an empty or less-complete snapshot while it
    // repopulates provider candle caches. Keep the previous chart visible
    // until the refreshed response has at least as much verified coverage.
    if (cached?.history.length && (
      data.history.length === 0 ||
      data.progress.coverageWeightBps < cached.progress.coverageWeightBps
    )) {
      return cached;
    }
    writeMarketHistoryCache(cacheId, data);
    return data;
  });
}
