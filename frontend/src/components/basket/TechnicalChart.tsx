import { useId, useMemo, useState } from "react";
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

interface TechnicalChartProps {
  rawHistory: { timestamp: number; navValue: number }[];
  isLoading?: boolean;
  mobile?: boolean;
  disclaimer?: string;
}

const PERIODS = { "1W": 7, "1M": 30, "3M": 90, ALL: 0 } as const;
type Period = keyof typeof PERIODS;

export function TechnicalChart({
  rawHistory,
  isLoading = false,
  mobile = false,
  disclaimer,
}: TechnicalChartProps) {
  const [period, setPeriod] = useState<Period>("ALL");
  const gradientId = useId().replace(/:/g, "");
  const points = useMemo(() => {
    const end = rawHistory[rawHistory.length - 1]?.timestamp ?? 0;
    const days = PERIODS[period];
    const filtered = days
      ? rawHistory.filter((point) => point.timestamp >= end - days * 86_400_000)
      : rawHistory;
    return filtered.map((point) => ({
      ...point,
      date: new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }));
  }, [period, rawHistory]);

  const first = points[0]?.navValue ?? null;
  const last = points[points.length - 1]?.navValue ?? null;
  const returnPct = first !== null && first > 0 && last !== null && points.length > 1
    ? ((last / first) - 1) * 100
    : null;
  const positive = returnPct === null || returnPct >= 0;

  return (
    <section className={cn("panel technical-chart-panel", mobile && "performance-mobile")}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Hypothetical Basket Index</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Reweighted historical prices, not user holdings or realized returns.
          </p>
          {disclaimer && <p className="mt-1 text-[10px] text-muted-foreground">{disclaimer}</p>}
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-surface-muted/60 p-1">
          {(Object.keys(PERIODS) as Period[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-semibold",
                period === value ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
        <span className="text-muted-foreground">Current index <b className="text-foreground">{last?.toFixed(4) ?? "—"}</b></span>
        <span className="text-muted-foreground">Window return <b className={positive ? "text-emerald-400" : "text-rose-400"}>
          {returnPct === null ? "—" : `${positive ? "+" : ""}${returnPct.toFixed(2)}%`}
        </b></span>
      </div>

      <div className="h-[240px] w-full sm:h-[280px]">
        {isLoading ? (
          <div className="grid h-full place-items-center rounded-xl border border-border bg-surface/40 text-xs text-muted-foreground">
            Loading verified history…
          </div>
        ) : points.length < 2 ? (
          <div className="grid h-full place-items-center rounded-xl border border-border bg-surface/40 p-6 text-center">
            <p className="text-sm font-semibold text-foreground">No verified price history yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Performance appears after an approved price source records enough data.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor={positive ? "#10b981" : "#ef4444"} stopOpacity={0.2} />
                  <stop offset="1" stopColor={positive ? "#10b981" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#262626" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                formatter={(value) => [Number(value).toFixed(4), "Index"]}
                contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 10, fontSize: 12 }}
              />
              <Area dataKey="navValue" type="monotone" stroke={positive ? "#10b981" : "#ef4444"} fill={`url(#${gradientId})`} strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
