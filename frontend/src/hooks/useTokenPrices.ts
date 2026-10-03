/**
 * useTokenPrices
 * Fetches real-time USD prices from Jupiter Price API v2 for given mint addresses.
 * Refreshes every 30s. Falls back silently to static values if the API is down.
 *
 * Jupiter Price API v2: https://api.jup.ag/price/v2?ids=<mint,...>&showExtraInfo=true
 * Response shape: { data: { [mint]: { id, type, price, extraInfo?: { last24hChange?: { price: number } } } } }
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface TokenPrice {
  mint: string;
  priceUsd: number;
  change24h: number; // percent, e.g. 3.4 means +3.4%
}

type PriceMap = Record<string, TokenPrice>;

const JUP_PRICE_URL = "https://api.jup.ag/price/v2";
const REFRESH_INTERVAL_MS = 30_000;

// Cache shared across hook instances so parallel components don't duplicate requests
let cachedPrices: PriceMap = {};
let lastFetchedMints = "";
let lastFetchTime = 0;
let inFlight: Promise<PriceMap> | null = null;

async function fetchJupiterPrices(mints: string[]): Promise<PriceMap> {
  const ids = mints.join(",");
  const url = `${JUP_PRICE_URL}?ids=${ids}&showExtraInfo=true`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Jupiter Price API ${res.status}`);

  const json = await res.json();
  const out: PriceMap = {};

  for (const mint of mints) {
    const entry = json?.data?.[mint];
    if (!entry) continue;

    const priceUsd = parseFloat(entry.price ?? "0");
    // extraInfo.last24hChange.price is the absolute $ change over 24h
    const raw24hAbsolute: number = entry?.extraInfo?.last24hChange?.price ?? 0;
    const change24h =
      priceUsd > 0 ? (raw24hAbsolute / (priceUsd - raw24hAbsolute)) * 100 : 0;

    out[mint] = { mint, priceUsd, change24h };
  }

  return out;
}

export function useTokenPrices(mints: string[]): {
  prices: PriceMap;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [prices, setPrices] = useState<PriceMap>(cachedPrices);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mintsKey = mints.slice().sort().join(",");

  const load = useCallback(async () => {
    if (mints.length === 0) return;

    const now = Date.now();
    // Use in-memory cache if same mints & fresh within 30s
    if (
      mintsKey === lastFetchedMints &&
      now - lastFetchTime < REFRESH_INTERVAL_MS &&
      Object.keys(cachedPrices).length > 0
    ) {
      setPrices({ ...cachedPrices });
      return;
    }

    // Deduplicate concurrent requests
    if (!inFlight) {
      inFlight = fetchJupiterPrices(mints).finally(() => {
        inFlight = null;
      });
    }

    try {
      setLoading(true);
      setError(null);
      const result = await inFlight!;
      cachedPrices = { ...cachedPrices, ...result };
      lastFetchedMints = mintsKey;
      lastFetchTime = Date.now();
      setPrices({ ...cachedPrices });
    } catch (err: any) {
      console.warn("[useTokenPrices] Jupiter API error:", err?.message);
      setError(err?.message ?? "Price fetch failed");
      // Keep showing stale/static values — don't wipe existing prices
    } finally {
      setLoading(false);
    }
  }, [mintsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  return { prices, loading, error, refetch: load };
}
