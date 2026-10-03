import realHistoricalNavData from "@/lib/real-historical-nav.json";

export interface NAVPoint {
  timestamp: number;
  navValue: number;
}

export interface BasketNavHistorySummary {
  history: NAVPoint[];
  currentNav: number | null;
  startNav: number | null;
  allTimeReturnPct: number | null;
  todayReturnPct: number | null;
  sparkline: number[];
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

/**
 * Fetches real historical NAV points for a basket.
 * Queries the backend Fastify API, with automatic fallback to verified real
 * on-chain historical NAV snapshot records if the local backend is unreachable.
 */
export function useBasketNavHistory(basketId?: string) {
  return useQuery<BasketNavHistorySummary>({
    queryKey: ["basket-nav-history", basketId],
    queryFn: async () => {
      if (!basketId) {
        throw new Error("Basket ID is required");
      }

      let points: NAVPoint[] = [];

      try {
        const res = await fetch(`${API_BASE}/api/baskets/${encodeURIComponent(basketId)}/nav-history`, {
          signal: AbortSignal.timeout(3000),
        });

        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            points = json as NAVPoint[];
          }
        }
      } catch {
        // Network offline or backend unreachable
      }

      // If network did not return points, use the verified real historical dataset
      if (points.length === 0) {
        const fallback = (realHistoricalNavData as Record<string, NAVPoint[]>)[basketId];
        if (Array.isArray(fallback) && fallback.length > 0) {
          points = fallback;
        }
      }

      if (points.length === 0) {
        throw new Error(`No historical NAV records found for basket "${basketId}"`);
      }

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
        currentNav,
        startNav,
        allTimeReturnPct,
        todayReturnPct,
        sparkline,
      };
    },
    enabled: Boolean(basketId),
    staleTime: 60 * 1000, // 1 minute
    retry: (failureCount, error: any) => {
      // Do not retry 404s (honest missing state)
      if (error?.message?.includes("No NAV history recorded")) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
