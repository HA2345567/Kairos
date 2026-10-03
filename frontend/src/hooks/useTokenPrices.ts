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

async function fetchLiveTokenPrices(mints: string[]): Promise<PriceMap> {
  const out: PriceMap = {};
  if (mints.length === 0) return out;

  // DexScreener allows batches up to 30 addresses per request
  const batchSize = 30;
  const batches: string[][] = [];
  for (let i = 0; i < mints.length; i += batchSize) {
    batches.push(mints.slice(i, i + batchSize));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return;

        const data = await res.json();
        const pairs = data?.pairs || [];

        // Track highest liquidity pair for each token address
        const bestPairByMint: Record<string, any> = {};
        for (const pair of pairs) {
          const addr = pair.baseToken?.address;
          if (!addr) continue;

          const currentLiq = pair.liquidity?.usd || 0;
          if (!bestPairByMint[addr] || currentLiq > (bestPairByMint[addr].liquidity?.usd || 0)) {
            bestPairByMint[addr] = pair;
          }
        }

        for (const mint of batch) {
          const pair = bestPairByMint[mint];
          if (pair && pair.priceUsd) {
            const priceUsd = parseFloat(pair.priceUsd) || 0;
            const change24h = typeof pair.priceChange?.h24 === "number" ? pair.priceChange.h24 : 0;
            out[mint] = { mint, priceUsd, change24h };
          }
        }
      } catch (err: any) {
        console.warn("[useTokenPrices] DexScreener batch error:", err?.message);
      }
    })
  );

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
      inFlight = fetchLiveTokenPrices(mints).finally(() => {
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
