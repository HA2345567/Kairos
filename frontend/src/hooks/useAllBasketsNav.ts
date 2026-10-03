import { useQuery } from "@tanstack/react-query";

export interface LatestNavEntry {
  navValue: number;
  timestamp: number;
}

/** Map of basketId → latest NAV snapshot (or null if no data yet) */
export type AllBasketsNavMap = Record<string, LatestNavEntry | null>;

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

/**
 * Fetches the most recent NAV snapshot for every basket in a single backend call.
 * Refreshes every 60 seconds so the Markets page always shows fresh real-time values.
 */
export function useAllBasketsNav() {
  return useQuery<AllBasketsNavMap>({
    queryKey: ["all-baskets-nav-latest"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/baskets/nav-latest`);
      if (!res.ok) {
        throw new Error(`Failed to fetch latest NAV data: HTTP ${res.status}`);
      }
      return res.json() as Promise<AllBasketsNavMap>;
    },
    staleTime: 60 * 1000,       // treat as fresh for 1 min
    refetchInterval: 60 * 1000, // poll every 60 s for live feel
    retry: 1,
  });
}
