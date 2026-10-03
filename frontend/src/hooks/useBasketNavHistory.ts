import { useQuery } from "@tanstack/react-query";

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
 * Fetches real historical NAV points for a basket from the backend.
 * Strictly no mock data or fallback generation:
 * - If the endpoint returns 404, React Query enters an error state.
 * - If the request fails, no synthetic curves or simulated prices are fabricated.
 */
export function useBasketNavHistory(basketId?: string) {
  return useQuery<BasketNavHistorySummary>({
    queryKey: ["basket-nav-history", basketId],
    queryFn: async () => {
      if (!basketId) {
        throw new Error("Basket ID is required");
      }

      const res = await fetch(`${API_BASE}/api/baskets/${encodeURIComponent(basketId)}/nav-history`);

      if (!res.ok) {
        // If 404, the backend honestly indicates no NAV points exist yet
        const errorText = await res.text().catch(() => "");
        throw new Error(
          res.status === 404
            ? `No NAV history recorded for basket "${basketId}" yet.`
            : `Failed to fetch NAV history: HTTP ${res.status} ${errorText}`
        );
      }

      const points = (await res.json()) as NAVPoint[];

      if (!Array.isArray(points) || points.length === 0) {
        throw new Error(`Empty NAV history returned for basket "${basketId}"`);
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
