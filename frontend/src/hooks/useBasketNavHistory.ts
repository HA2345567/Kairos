import { useQuery } from "@tanstack/react-query";
import { kairosApi } from "@/lib/api-client";
import { cacheMarketHistoryResult, readMarketHistoryCache } from "@/lib/market-history-cache";
import type { BasketMarketNavHistoryResponse } from "@/lib/api-types";

export interface NAVPoint {
  timestamp: number;
  navValue: number;
}

export interface BasketNavHistorySummary {
  history: NAVPoint[];
  benchmarkHistory: NAVPoint[];
  currentNav: number | null;
  startNav: number | null;
  allTimeReturnPct: number | null;
  todayReturnPct: number | null;
  sparkline: number[];
  isHypothetical: true;
  disclaimer: string;
  benchmarkLabel: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/**
 * Fetches the backend's explicitly hypothetical index built from stored price snapshots.
 * Missing history stays missing; it is never replaced with another basket's data.
 */
export function useBasketNavHistory(basketId?: string) {
  return useQuery<BasketNavHistorySummary>({
    queryKey: ["basket-nav-history", basketId],
    queryFn: async () => {
      if (!basketId) {
        throw new Error("Basket ID is required");
      }

      const res = await fetch(`${API_BASE}/v1/baskets/${encodeURIComponent(basketId)}/nav-history`, {
        signal: AbortSignal.timeout(5000),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.error === "BACKTEST_UNAVAILABLE" && String(payload.message).includes("NO_BACKTESTABLE_LEGS")) {
          throw new Error("No hypothetical performance history is available yet");
        }
        throw new Error(payload.message || payload.error || `NAV history request failed (${res.status})`);
      }

      const points = (payload.history as NAVPoint[]).filter(
        (point) => Number.isFinite(point.timestamp) && Number.isFinite(point.navValue)
      );
      if (points.length === 0) throw new Error("No hypothetical performance history is available yet");

      const startNav = points[0].navValue;
      const currentNav = points[points.length - 1].navValue;
      const allTimeReturnPct = startNav > 0 ? ((currentNav - startNav) / startNav) * 100 : 0;

      // Calculate 24h / today return if at least 2 points exist
      let todayReturnPct: number | null = null;
      if (points.length >= 2) {
        const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
        // Find closest point to 24h ago
        let prevPoint = points[points.length - 2];
        for (let i = points.length - 1; i >= 0; i--) {
          if (points[i].timestamp <= oneDayAgoMs) {
            prevPoint = points[i];
            break;
          }
        }
        if (prevPoint && prevPoint.navValue > 0) {
          todayReturnPct = ((currentNav - prevPoint.navValue) / prevPoint.navValue) * 100;
        }
      }

      const sparkline = points.map((p) => p.navValue);

      return {
        history: points,
        benchmarkHistory: ((payload.benchmarkHistory ?? []) as { timestamp: number; value: number }[]).map(
          ({ timestamp, value }) => ({ timestamp, navValue: value })
        ),
        currentNav,
        startNav,
        allTimeReturnPct,
        todayReturnPct,
        sparkline,
        isHypothetical: true,
        disclaimer: payload.disclaimer,
        benchmarkLabel: payload.benchmarkLabel,
      };
    },
    enabled: Boolean(basketId),
    staleTime: 60 * 1000, // 1 minute
    retry: (failureCount, error: any) => {
      if (error?.message?.includes("No hypothetical performance history")) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/** Public-pool historical index, distinct from execution/oracle NAV snapshots. */
export function useMarketBasketNavHistory(slug?: string, window: BasketMarketNavHistoryResponse["window"] = "1Y") {
  const cacheId = `catalog:${slug ?? ""}:${window}`;
  return useQuery<BasketMarketNavHistoryResponse>({
    queryKey: ["basket-market-nav-history", slug, window],
    queryFn: () => {
      if (!slug) throw new Error("Basket slug is required");
      return cacheMarketHistoryResult(cacheId, () => kairosApi.getBasketMarketNavHistory(slug, window));
    },
    enabled: Boolean(slug),
    initialData: () => readMarketHistoryCache(cacheId)?.data,
    initialDataUpdatedAt: () => readMarketHistoryCache(cacheId)?.savedAt,
    // Keep the last chart ready when users revisit a basket, then refresh it.
    staleTime: 60_000,
    // History backfills are deliberately progressive. Check again soon while
    // candles are still arriving instead of leaving the chart stale for 20s.
    refetchInterval: (query) => {
      if (query.state.status === "error") return 30_000;
      const progress = query.state.data?.progress;
      if (!progress) return 10_000;
      if (progress.pendingSymbols.length) return 15_000;
      if (progress.publicMarkets === 0 && progress.basketAssets > 0) return 30_000;
      return 60_000;
    },
    refetchOnWindowFocus: true,
  });
}
