import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import { TrendingUp, Sparkles, Info, Maximize2 } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface PerformanceChartCardProps {
  basket: Basket;
}

type Timeframe = "1W" | "1M" | "6M" | "1Y" | "ALL";

interface DataPoint {
  time: string;
  basket: number;
  sol: number;
  milestone?: string;
  milestoneDesc?: string;
}

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  "1W": 7,
  "1M": 30,
  "6M": 180,
  "1Y": 365,
  ALL: 500,
};

export const PerformanceChartCard: React.FC<PerformanceChartCardProps> = ({ basket }) => {
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [activeMilestone, setActiveMilestone] = useState<string | null>(null);

  // Generate realistic normalized comparative backtest data (base 100)
  const chartData: DataPoint[] = useMemo(() => {
    const pointsCount = timeframe === "1W" ? 7 : timeframe === "1M" ? 15 : 24;
    const baseReturn = basket.returns1y || 134.8;
    const solBaseReturn = 86.6; // SOL benchmark return over 1Y

    const tfMultiplier =
      timeframe === "1W"
        ? 0.05
        : timeframe === "1M"
        ? 0.18
        : timeframe === "6M"
        ? 0.65
        : timeframe === "1Y"
        ? 1.0
        : 1.35;

    const basketEnd = 100 + (baseReturn * tfMultiplier);
    const solEnd = 100 + (solBaseReturn * tfMultiplier);

    const labels1W = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const labels1M = ["Day 1", "Day 3", "Day 6", "Day 9", "Day 12", "Day 15", "Day 18", "Day 21", "Day 24", "Day 27", "Day 30"];
    const labels1Y = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const labels = timeframe === "1W" ? labels1W : timeframe === "1M" ? labels1M : labels1Y;
    const count = labels.length;

    return labels.map((label, idx) => {
      const progress = idx / (count - 1);
      // Non-linear trajectory with market volatility swings
      const curve = Math.pow(progress, 0.95);
      const basketNoise = Math.sin(idx * 1.5) * 3.2;
      const solNoise = Math.cos(idx * 1.3) * 2.8;

      const basketVal = Number((100 + (basketEnd - 100) * curve + basketNoise).toFixed(1));
      const solVal = Number((100 + (solEnd - 100) * curve + solNoise).toFixed(1));

      let milestone: string | undefined;
      let milestoneDesc: string | undefined;

      if (idx === Math.floor(count * 0.25)) {
        milestone = "v1.2 Rebalance";
        milestoneDesc = "Rebalanced constituent weights to prioritize staking yields.";
      } else if (idx === Math.floor(count * 0.7)) {
        milestone = "Breakpoint Surge";
        milestoneDesc = "Solana Breakpoint ecosystem announcements accelerated inflows.";
      }

      return {
        time: label,
        basket: Math.max(80, basketVal),
        sol: Math.max(80, solVal),
        milestone,
        milestoneDesc,
      };
    });
  }, [basket, timeframe]);

  // Alpha calculation vs SOL benchmark
  const latestPoint = chartData[chartData.length - 1];
  const firstPoint = chartData[0];
  const basketGain = latestPoint.basket - firstPoint.basket;
  const solGain = latestPoint.sol - firstPoint.sol;
  const alphaVsSol = (basketGain - solGain).toFixed(1);
  const isAlphaPositive = parseFloat(alphaVsSol) >= 0;

  return (
    <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6 mb-6">
      {/* Top Header: Title, Alpha Badge, Timeframe Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold font-display text-white tracking-tight">
              Backtested & Historical Performance
            </h3>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[#D4FF00]/10 text-[#D4FF00] border border-[#D4FF00]/25">
              <Sparkles className="w-3 h-3" />
              {isAlphaPositive ? `+${alphaVsSol}%` : `${alphaVsSol}%`} Alpha vs SOL
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Comparative performance normalized to base 100 against raw SOL holding
          </p>
        </div>

        {/* Timeframe Buttons */}
        <div className="flex items-center bg-[#0A0D12] p-1 rounded-xl border border-[#1F2633] self-start sm:self-auto">
          {(["1W", "1M", "6M", "1Y", "ALL"] as Timeframe[]).map((tf) => {
            const isActive = timeframe === tf;
            return (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg transition-all duration-150 ${
                  isActive
                    ? "bg-[#D4FF00] text-black font-bold shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-[#1A202C]"
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dual Series Legend & Current Values */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-[#1F2633]/60">
        <div className="flex items-center gap-5">
          {/* Basket Series Legend */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#D4FF00] shadow-[0_0_8px_rgba(212,255,0,0.5)]" />
            <span className="text-xs font-semibold text-white">Basket Performance</span>
            <span className="text-xs font-mono font-bold text-[#D4FF00]">
              {latestPoint.basket.toFixed(1)}
            </span>
          </div>

          {/* SOL Benchmark Legend */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#8B5CF6]" />
            <span className="text-xs font-medium text-gray-300">SOL Benchmark</span>
            <span className="text-xs font-mono text-purple-300">
              {latestPoint.sol.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Milestone info banner if hovered */}
        {activeMilestone && (
          <div className="text-xs font-mono text-[#D4FF00] bg-[#D4FF00]/10 px-2 py-0.5 rounded border border-[#D4FF00]/30 animate-pulse">
            Event: {activeMilestone}
          </div>
        )}
      </div>

      {/* Recharts Chart Container */}
      <div className="w-full h-72 sm:h-80 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2633" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#64748B"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748B", fontFamily: "monospace" }}
            />
            <YAxis
              stroke="#64748B"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              tick={{ fill: "#64748B", fontFamily: "monospace" }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as DataPoint;
                  return (
                    <div className="bg-[#0A0D12] border border-[#2D3748] rounded-xl p-3 shadow-xl backdrop-blur-md">
                      <div className="text-[11px] font-mono text-gray-400 mb-1">
                        {data.time}
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs font-mono mb-1">
                        <span className="text-[#D4FF00] font-bold">Basket:</span>
                        <span className="text-white font-bold">{data.basket}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-xs font-mono">
                        <span className="text-purple-400">SOL Index:</span>
                        <span className="text-gray-300">{data.sol}</span>
                      </div>
                      {data.milestone && (
                        <div className="mt-2 pt-2 border-t border-[#1F2633] text-[11px] text-[#D4FF00]">
                          <div className="font-bold">★ {data.milestone}</div>
                          <div className="text-gray-400 text-[10px] mt-0.5">
                            {data.milestoneDesc}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* SOL Benchmark Line */}
            <Line
              type="monotone"
              dataKey="sol"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 4"
            />
            {/* Basket Performance Line */}
            <Line
              type="monotone"
              dataKey="basket"
              stroke="#D4FF00"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, fill: "#D4FF00", stroke: "#0A0D12", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Normalized Footnote Disclaimer */}
      <div className="mt-4 pt-3 border-t border-[#1F2633]/60 flex items-start gap-2 text-[11px] font-mono text-gray-500">
        <Info className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" />
        <span>
          *Simulated backtested and index values are normalized to base 100 for comparative analysis against raw SOL holding. Past performance does not guarantee future results.
        </span>
      </div>
    </div>
  );
};
