/** Shared public-mainnet price references for display. Devnet test mints use
 * their underlying priceMint, and these values never become execution quotes. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { kairosApi } from "@/lib/api-client";

export interface TokenPrice {
  mint: string;
  priceUsd: number;
  change24h: number | null;
  source: "GeckoTerminal" | "DEX Screener";
  asOf: string;
  status: "current" | "stale";
}

type PriceMap = Record<string, TokenPrice>;
const REFRESH_INTERVAL_MS = 60_000;
const cache = new Map<string, { prices: PriceMap; fetchedAt: number }>();
const requests = new Map<string, Promise<PriceMap>>();

async function requestPrices(mints: string[]): Promise<PriceMap> {
  const key = mints.join(",");
  const pending = requests.get(key);
  if (pending) return pending;
  const request = (async () => {
    const prices: PriceMap = {};
    const batches = Array.from({ length: Math.ceil(mints.length / 30) }, (_, index) => mints.slice(index * 30, (index + 1) * 30));
    const responses = await Promise.all(batches.map((batch) => kairosApi.getMarketReferencePrices(batch)));
    for (const payload of responses) {
      for (const mint of mints) {
        const price = payload.prices?.[mint];
        if (price && Number.isFinite(price.priceUsd) && price.priceUsd! > 0 && price.source && price.asOf && price.status !== "unavailable") {
          prices[mint] = {
            mint,
            priceUsd: price.priceUsd!,
            change24h: typeof price.change24h === "number" && Number.isFinite(price.change24h) ? price.change24h : null,
            source: price.source,
            asOf: price.asOf,
            status: price.status,
          };
        }
      }
    }
    cache.set(key, { prices, fetchedAt: Date.now() });
    return prices;
  })();
  requests.set(key, request);
  try { return await request; }
  finally { if (requests.get(key) === request) requests.delete(key); }
}

export function useTokenPrices(mints: string[]): {
  prices: PriceMap;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const key = [...new Set(mints)].sort().join(",");
  const requested = useMemo(() => key ? key.split(",") : [], [key]);
  const latestKey = useRef(key);
  latestKey.current = key;
  const [prices, setPrices] = useState<PriceMap>(() => cache.get(key)?.prices ?? {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (!requested.length) { setPrices({}); return; }
    const cached = cache.get(key);
    if (!force && cached && Date.now() - cached.fetchedAt < REFRESH_INTERVAL_MS) {
      if (latestKey.current === key) setPrices(cached.prices);
      return;
    }
    setLoading(true);
    try {
      const next = await requestPrices(requested);
      if (latestKey.current === key) { setPrices(next); setError(null); }
    } catch (failure) {
      if (latestKey.current === key) {
        setPrices({});
        setError(failure instanceof Error ? failure.message : "Market prices unavailable");
      }
    } finally {
      if (latestKey.current === key) setLoading(false);
    }
  }, [key, requested]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return { prices, loading, error, refetch: () => void load(true) };
}
