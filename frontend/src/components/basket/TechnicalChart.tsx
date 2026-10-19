import { useEffect, useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2 } from "lucide-react";

export type HistoricalPeriod = "1W" | "1M" | "6M" | "1Y" | "3Y";

interface TechnicalChartProps {
  rawHistory: { timestamp: number; navValue: number }[];
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  mobile?: boolean;
  disclaimer?: string;
  title?: string;
  period: HistoricalPeriod;
  onPeriodChange: (period: HistoricalPeriod) => void;
  progress?: { loaded: number; publicMarkets: number; basketAssets: number; coverageWeightBps: number; pendingSymbols: string[] };
  complete?: boolean;
  availableFrom?: number | null;
}

const PERIODS = { "1W": 7, "1M": 30, "6M": 183, "1Y": 365, "3Y": 1095 } as const;

export function TechnicalChart({
  rawHistory,
  isLoading = false,
  isFetching = false,
  isError = false,
  onRetry,
  mobile = false,
  disclaimer,
  title = "Historical Performance",
  period,
  onPeriodChange,
  progress,
  complete,
  availableFrom,
}: TechnicalChartProps) {
  const [expanded, setExpanded] = useState(false);
  const gradientId = useId().replace(/:/g, "");
  const points = useMemo(() => {
    const end = rawHistory[rawHistory.length - 1]?.timestamp ?? 0;
    const days = PERIODS[period];
    return rawHistory
      .filter((point) => point.timestamp >= end - days * 86_400_000)
      .map((point) => ({
      ...point,
      date: new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }));
  }, [period, rawHistory]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const first = points[0]?.navValue ?? null;
  const last = points[points.length - 1]?.navValue ?? null;
  const returnPct = first !== null && first > 0 && last !== null && points.length > 1
    ? ((last / first) - 1) * 100
    : null;
  const positive = returnPct === null || returnPct >= 0;
  const chartColor = returnPct === null ? "#8f8f8f" : positive ? "#228b22" : "#f87171";

  return (
    <div
      id="historical-chart"
      className={cn("technical-chart-panel", mobile && "performance-mobile", expanded && "is-expanded")}
      aria-label="Historical basket performance chart"
    >
      <header className="historical-chart-header">
        <div>
          <h2 className="historical-chart-title">{title}</h2>
          <p className="historical-chart-caption">
            Modeled basket NAV from available history. Not realized investor returns.
          </p>
          {disclaimer && <p className="historical-chart-caption">{disclaimer}</p>}
        </div>
        <div className="historical-chart-controls">
          <label className="historical-chart-mobile-range">
            <span className="sr-only">Select time range</span>
            <select value={period} onChange={(event) => onPeriodChange(event.target.value as HistoricalPeriod)} aria-label="Select time range">
              {(Object.keys(PERIODS) as HistoricalPeriod[]).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="historical-chart-ranges" role="group" aria-label="Chart time range">
            {(Object.keys(PERIODS) as HistoricalPeriod[]).map((value) => (
              <button key={value} type="button" aria-pressed={period === value} onClick={() => onPeriodChange(value)}>
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="historical-chart-expand"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "Collapse chart" : "Expand chart"}
            title={expanded ? "Collapse chart" : "Expand chart"}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      <div className="historical-chart-stats">
        <span>Current index <b>{last?.toFixed(4) ?? "—"}</b></span>
        <span>Window return <b className={positive ? "is-positive" : "is-negative"}>
          {returnPct === null ? "—" : `${positive ? "+" : ""}${returnPct.toFixed(2)}%`}
        </b></span>
        {isFetching && !isLoading && <span className="historical-chart-refresh">Updating</span>}
      </div>

      <div className="historical-chart-plot">
        {isLoading ? (
          <div className="grid h-full place-items-center rounded-xl border border-border bg-surface/40 text-xs text-muted-foreground">
            Loading basket history…
          </div>
        ) : isError && points.length < 2 ? (
          <div className="historical-chart-empty" role="status">
            <p className="historical-chart-empty-title">Couldn’t load basket history</p>
            <p className="historical-chart-empty-copy">Market history is temporarily unavailable. Try again shortly.</p>
            {onRetry && <button type="button" className="historical-chart-retry" onClick={onRetry}>Retry</button>}
          </div>
        ) : points.length < 2 ? (
          <div className="historical-chart-empty">
            {progress && progress.publicMarkets > 0 && progress.loaded < progress.publicMarkets ? (
              <>
                <span className="historical-chart-loader" aria-hidden="true" />
                <p className="historical-chart-empty-title">Building the basket history</p>
                <p className="historical-chart-empty-copy">Historical pools loaded: {progress.loaded} of {progress.publicMarkets}. The chart will fill as source candles arrive.</p>
              </>
            ) : (
              <>
                <p className="historical-chart-empty-title">No historical NAV available</p>
                <p className="historical-chart-empty-copy">No verified public pool history is available for the selected period.</p>
              </>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#737373" stopOpacity={0.12} />
                  <stop offset="1" stopColor="#737373" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#303030" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#8f8f8f", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#8f8f8f", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                content={({ active, payload, label }) => {
                  const navPoint = payload?.find((item) => item.dataKey === "navValue");
                  if (!active || !navPoint) return null;
                  return (
                    <div style={{ background: "#242424", border: "1px solid #383838", borderRadius: 10, padding: "8px 10px", fontSize: 12 }}>
                      <p style={{ margin: "0 0 4px", color: "#a0a0a0" }}>{label}</p>
                      <strong style={{ color: "#f5f5f5" }}>{Number(navPoint.value).toFixed(4)} basket index</strong>
                    </div>
                  );
                }}
              />
              <Area dataKey="navValue" type="monotone" stroke={chartColor} fill={`url(#${gradientId})`} strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: chartColor, stroke: "#242424", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {availableFrom && points.length > 1 && <p className="historical-chart-date-range">Showing source history from {new Date(availableFrom).toLocaleDateString()} to {new Date(points[points.length - 1].timestamp).toLocaleDateString()}.</p>}
      {complete === false && points.length > 1 && (
        <p className="historical-chart-partial">
          Partial basket history · {((progress?.coverageWeightBps ?? 0) / 100).toFixed(1)}% of target weight represented
          {progress?.pendingSymbols?.length ? ` · Loading ${progress.pendingSymbols.join(", ")}` : ""}.
        </p>
      )}
    </div>
  );
}
