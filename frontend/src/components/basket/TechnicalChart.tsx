import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  computeTechnicalIndicators,
  type TechnicalPoint,
  type TechnicalSummary,
} from "@/lib/technical-analysis";
import type { Basket } from "@/lib/baskets-data";
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  ShieldAlert,
  Gauge,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TechnicalChartProps {
  basket: Basket;
  rawHistory: { timestamp: number; navValue: number }[];
  isLoading?: boolean;
  mobile?: boolean;
}

type TimePeriod = "1W" | "1M" | "3M" | "ALL";
type ChartMode = "NAV" | "SMA" | "RSI" | "DRAWDOWN";

export function TechnicalChart({
  basket,
  rawHistory,
  isLoading = false,
  mobile = false,
}: TechnicalChartProps) {
  const [period, setPeriod] = useState<TimePeriod>("ALL");
  const [chartMode, setChartMode] = useState<ChartMode>("NAV");
  const [showSma, setShowSma] = useState(true);

  // Filter raw points by period
  const filteredHistory = useMemo(() => {
    if (!rawHistory || rawHistory.length === 0) return [];
    if (period === "ALL") return rawHistory;

    const now = rawHistory[rawHistory.length - 1].timestamp;
    let cutoffMs = 0;
    if (period === "1W") cutoffMs = 7 * 86400 * 1000;
    else if (period === "1M") cutoffMs = 30 * 86400 * 1000;
    else if (period === "3M") cutoffMs = 90 * 86400 * 1000;

    const filtered = rawHistory.filter((p) => p.timestamp >= now - cutoffMs);
    // Ensure at least 2 points
    return filtered.length >= 2 ? filtered : rawHistory.slice(-Math.min(rawHistory.length, 14));
  }, [rawHistory, period]);

  // Compute indicators
  const { points, summary } = useMemo(() => {
    return computeTechnicalIndicators(filteredHistory);
  }, [filteredHistory]);

  const hasData = points.length > 0;
  const isPositive = summary.currentReturnPct >= 0;

  // Min and max for domain
  const { minNav, maxNav } = useMemo(() => {
    if (!hasData) return { minNav: 0, maxNav: 100 };
    const values = points.map((p) => p.navValue);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || 0.05;
    return {
      minNav: Math.max(0, Number((min - pad).toFixed(4))),
      maxNav: Number((max + pad).toFixed(4)),
    };
  }, [points, hasData]);

  return (
    <div className={cn("panel technical-chart-panel", mobile && "performance-mobile")}>
      {/* Header with Title and Period Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              Real Historical NAV & Technicals
            </h2>
            <span className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-muted border border-border text-foreground">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SOLANA
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real basket NAV curve, 20-day Simple Moving Average, RSI (14), and risk metrics.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-1 bg-surface-muted/60 p-1 rounded-xl border border-border">
          {(["1W", "1M", "3M", "ALL"] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                period === p
                  ? "bg-surface text-foreground font-bold shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 p-4 rounded-xl bg-surface border border-border">
        <div>
          <span className="text-[11px] font-mono text-muted-foreground uppercase">CURRENT NAV</span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-foreground mt-0.5">
            {summary.currentNav > 0 ? `$${summary.currentNav.toFixed(4)}` : "—"}
          </div>
        </div>

        <div>
          <span className="text-[11px] font-mono text-muted-foreground uppercase">{period} RETURN</span>
          <div
            className={cn(
              "text-xl sm:text-2xl font-bold font-mono flex items-center gap-1 mt-0.5",
              isPositive ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {isPositive ? <ArrowUpRight className="size-5 shrink-0" /> : <ArrowDownRight className="size-5 shrink-0" />}
            {isPositive ? "+" : ""}
            {summary.currentReturnPct.toFixed(2)}%
          </div>
        </div>

        <div>
          <span className="text-[11px] font-mono text-muted-foreground uppercase">RSI (14)</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {summary.rsi14 ? summary.rsi14.toFixed(1) : "—"}
            </span>
            <span
              className={cn(
                "text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border",
                summary.rsiSignal === "Overbought" && "bg-rose-500/10 text-rose-400 border-rose-500/20",
                summary.rsiSignal === "Bullish Momentum" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                summary.rsiSignal === "Neutral" && "bg-surface-muted text-muted-foreground border-border",
                summary.rsiSignal === "Bearish Pressure" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                summary.rsiSignal === "Oversold" && "bg-blue-500/10 text-blue-400 border-blue-500/20"
              )}
            >
              {summary.rsiSignal}
            </span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-mono text-muted-foreground uppercase">ANNUALIZED VOL (σ)</span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-foreground mt-0.5">
            {summary.annualizedVolatilityPct > 0 ? `${summary.annualizedVolatilityPct.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Chart View Mode Toggle Bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setChartMode("NAV")}
            className={cn(
              "px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer",
              chartMode === "NAV"
                ? "bg-surface text-foreground border-border font-bold shadow-sm"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-surface-muted"
            )}
          >
            NAV Price
          </button>
          <button
            onClick={() => setChartMode("RSI")}
            className={cn(
              "px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer",
              chartMode === "RSI"
                ? "bg-surface text-foreground border-border font-bold shadow-sm"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-surface-muted"
            )}
          >
            RSI Oscillator
          </button>
          <button
            onClick={() => setChartMode("DRAWDOWN")}
            className={cn(
              "px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer",
              chartMode === "DRAWDOWN"
                ? "bg-surface text-foreground border-border font-bold shadow-sm"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-surface-muted"
            )}
          >
            Drawdown %
          </button>
        </div>

        {chartMode === "NAV" && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSma}
              onChange={(e) => setShowSma(e.target.checked)}
              className="rounded accent-emerald-500 cursor-pointer"
            />
            <span>20 SMA</span>
          </label>
        )}
      </div>

      {/* Recharts Container */}
      <div className="w-full h-[260px] sm:h-[300px]">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center bg-surface/40 rounded-xl border border-border">
            <span className="text-xs font-mono text-muted-foreground animate-pulse">Loading technical series...</span>
          </div>
        ) : !hasData ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-surface/40 rounded-xl border border-border p-6 text-center">
            <p className="text-sm font-semibold text-foreground/80 mb-1">No historical points recorded</p>
            <p className="text-xs text-muted-foreground">Historical daily data will be populated as markets trade.</p>
          </div>
        ) : chartMode === "RSI" ? (
          /* RSI Oscillator View */
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#a855f7" stopOpacity={0.25} />
                  <stop offset="1" stopColor="#a855f7" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="dateStr" tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Overbought (70)", fill: "#ef4444", fontSize: 10 }} />
              <ReferenceLine y={30} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: "Oversold (30)", fill: "#3b82f6", fontSize: 10 }} />
              <ReferenceLine y={50} stroke="#525252" strokeDasharray="2 2" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as TechnicalPoint;
                  return (
                    <div className="rounded-xl border border-border bg-[#1A1A1A] p-3 shadow-2xl text-xs font-mono">
                      <div className="text-text-muted mb-1">{d.dateStr}</div>
                      <div className="text-purple-400 font-bold">RSI (14): {d.rsi14 ?? "—"}</div>
                      <div className="text-text-primary">NAV: ${d.navValue.toFixed(4)}</div>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="rsi14" stroke="#a855f7" strokeWidth={2} fill="url(#rsiGrad)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : chartMode === "DRAWDOWN" ? (
          /* Drawdown % View */
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#ef4444" stopOpacity={0.0} />
                  <stop offset="1" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="dateStr" tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as TechnicalPoint;
                  return (
                    <div className="rounded-xl border border-border bg-[#1A1A1A] p-3 shadow-2xl text-xs font-mono">
                      <div className="text-text-muted mb-1">{d.dateStr}</div>
                      <div className="text-rose-400 font-bold">Drawdown: {d.drawdownPct}%</div>
                      <div className="text-text-primary">NAV: ${d.navValue.toFixed(4)}</div>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="drawdownPct" stroke="#ef4444" strokeWidth={2} fill="url(#ddGrad)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          /* Primary NAV Price & SMA View */
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.22} />
                  <stop offset="1" stopColor={isPositive ? "#10b981" : "#ef4444"} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="dateStr" tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                domain={[minNav, maxNav]}
                tick={{ fill: "#737373", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v >= 10 ? v.toFixed(1) : v.toFixed(2)}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as TechnicalPoint;
                  return (
                    <div className="rounded-xl border border-border bg-[#1A1A1A] p-3.5 shadow-2xl text-xs font-mono min-w-[170px]">
                      <div className="text-text-muted mb-1.5 flex items-center justify-between">
                        <span>{d.dateStr}</span>
                        <span className={d.returnPct >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {d.returnPct >= 0 ? "+" : ""}
                          {d.returnPct}%
                        </span>
                      </div>
                      <div className="text-sm font-bold text-text-primary mb-1">
                        NAV: ${d.navValue.toFixed(4)}
                      </div>
                      {d.sma20 && (
                        <div className="text-amber-400 text-[11px]">
                          20 SMA: ${d.sma20.toFixed(4)}
                        </div>
                      )}
                      {d.rsi14 && (
                        <div className="text-purple-400 text-[11px] mt-0.5">
                          RSI (14): {d.rsi14}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="navValue"
                stroke={isPositive ? "#10b981" : "#ef4444"}
                strokeWidth={2.4}
                fill="url(#navGrad)"
                dot={false}
                isAnimationActive={false}
              />
              {showSma && (
                <Line
                  type="monotone"
                  dataKey="sma20"
                  stroke="#f59e0b"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Quantitative & Risk Metrics Footer Bar */}
      <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div className="bg-surface/60 p-2.5 rounded-lg border border-border/60">
          <span className="text-muted-foreground block text-[10px]">SHARPE RATIO</span>
          <span className="font-bold text-foreground text-sm">
            {summary.sharpeRatio > 0 ? summary.sharpeRatio.toFixed(2) : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground block">Risk-adjusted return</span>
        </div>

        <div className="bg-surface/60 p-2.5 rounded-lg border border-border/60">
          <span className="text-muted-foreground block text-[10px]">MAX DRAWDOWN</span>
          <span className="font-bold text-rose-400 text-sm">
            {summary.maxDrawdownPct ? `${summary.maxDrawdownPct}%` : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground block">Peak-to-trough decline</span>
        </div>

        <div className="bg-surface/60 p-2.5 rounded-lg border border-border/60">
          <span className="text-muted-foreground block text-[10px]">20-DAY SMA</span>
          <span className="font-bold text-amber-400 text-sm">
            {summary.sma20 ? `$${summary.sma20.toFixed(4)}` : "—"}
          </span>
          <span className="text-[10px] text-muted-foreground block">
            {summary.isAboveSma20 ? "▲ Above 20 SMA" : "▼ Below 20 SMA"}
          </span>
        </div>

        <div className="bg-surface/60 p-2.5 rounded-lg border border-border/60">
          <span className="text-muted-foreground block text-[10px]">52W HIGH / LOW</span>
          <span className="font-bold text-foreground text-sm">
            ${summary.high52w} / ${summary.low52w}
          </span>
          <span className="text-[10px] text-muted-foreground block">Historical range</span>
        </div>
      </div>
    </div>
  );
}
