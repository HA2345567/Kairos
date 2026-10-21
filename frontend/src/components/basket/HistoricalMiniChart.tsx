import { useQuery } from "@tanstack/react-query";
import { kairosApi } from "@/lib/api-client";
import type { BasketMarketNavHistoryResponse } from "@/lib/api-types";
import { cacheMarketHistoryResult, readMarketHistoryCache } from "@/lib/market-history-cache";
import { cn } from "@/lib/utils";

type HistorySource = "catalog" | "labs";

interface HistoricalMiniChartProps {
  slug: string;
  source?: HistorySource;
  className?: string;
  compact?: boolean;
}

function miniPath(points: BasketMarketNavHistoryResponse["history"]) {
  if (points.length < 2) return "";
  const values = points.map((point) => point.navValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.abs(max) * 0.001 || 1;
  return points.map((point, index) => {
    const x = 2 + (index / (points.length - 1)) * 92;
    const y = 22 - ((point.navValue - min) / range) * 19;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

export function HistoricalMiniChart({ slug, source = "catalog", className, compact = false }: HistoricalMiniChartProps) {
  const cacheId = `${source}:${slug}:1Y`;
  const query = useQuery<BasketMarketNavHistoryResponse>({
    queryKey: [source === "labs" ? "labs-market-nav-history" : "basket-market-nav-history", slug, "1Y"],
    queryFn: () => cacheMarketHistoryResult(cacheId, () => source === "labs"
      ? kairosApi.getLabsBasketMarketNavHistory(slug, "1Y")
      : kairosApi.getBasketMarketNavHistory(slug, "1Y")),
    enabled: Boolean(slug),
    initialData: () => readMarketHistoryCache(cacheId)?.data,
    initialDataUpdatedAt: () => readMarketHistoryCache(cacheId)?.savedAt,
    staleTime: 5 * 60_000,
    refetchInterval: (current) => {
      if (current.state.status === "error") return 30_000;
      const data = current.state.data;
      const progress = data?.progress;
      if (!progress) return 10_000;
      if (progress.loaded >= progress.publicMarkets && !progress.pendingSymbols.length) return 60_000;
      if (!data?.complete || progress.pendingSymbols.length) return 15_000;
      return 60_000;
    },
    refetchOnWindowFocus: true,
  });

  const points = query.data?.history ?? [];
  const first = points[0]?.navValue;
  const last = points[points.length - 1]?.navValue;
  const returnPct = first && first > 0 && last !== undefined && points.length > 1
    ? ((last / first) - 1) * 100
    : null;
  const positive = returnPct === null || returnPct >= 0;
  const coverage = query.data?.progress.coverageWeightBps ?? 0;
  const details = [
    query.data?.disclaimer,
    query.data?.availableFrom ? `History begins ${new Date(query.data.availableFrom).toLocaleDateString()}.` : "",
    query.data && !query.data.complete ? `${(coverage / 100).toFixed(1)}% of target allocation represented.` : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cn("flex min-w-0 items-center gap-2", compact ? "gap-1.5" : "gap-2.5", className)}
      title={details || (query.isLoading ? "Loading historical market data" : "Historical market data unavailable")}
      aria-label={returnPct === null ? "Historical return unavailable" : `1 year historical return ${returnPct >= 0 ? "up" : "down"} ${Math.abs(returnPct).toFixed(2)} percent`}
    >
      <div className="flex min-w-0 flex-col items-end">
        <strong className={cn(
          "font-mono font-semibold tabular-nums",
          compact ? "text-[10px]" : "text-xs",
          returnPct === null ? "text-muted-foreground" : positive ? "text-emerald-400" : "text-rose-400",
        )}>
          {returnPct === null ? (query.isLoading ? "···" : "—") : `${positive ? "+" : ""}${returnPct.toFixed(2)}%`}
        </strong>
        <small className="whitespace-nowrap font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
          {query.data && points.length === 0
            ? "No 1Y data"
            : query.data?.complete
              ? "1Y history"
              : query.data
                ? `${(coverage / 100).toFixed(0)}% · 1Y`
                : "1Y history"}
        </small>
      </div>
      <svg className={cn("shrink-0", compact ? "h-5 w-14" : "h-6 w-20")} viewBox="0 0 96 24" preserveAspectRatio="none" role="img" aria-label="Historical NAV sparkline">
        {points.length > 1 ? (
          <path d={miniPath(points)} fill="none" stroke={returnPct === null ? "#8f8f8f" : positive ? "#228b22" : "#f87171"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M2 12 H94" fill="none" stroke="#525252" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
    </div>
  );
}
