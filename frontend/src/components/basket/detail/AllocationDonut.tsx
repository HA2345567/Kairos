import React, { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { BasketToken } from "@/lib/baskets-data";

interface AllocationDonutProps {
  tokens: BasketToken[];
  tvlUsd: number;
}

const PALETTE = [
  "#D4FF00", // Lime
  "#10B981", // Emerald
  "#06B6D4", // Cyan
  "#8B5CF6", // Purple/Violet
  "#F59E0B", // Amber
  "#F43F5E", // Rose
  "#EC4899", // Pink
  "#3B82F6", // Blue
];

export const AllocationDonut: React.FC<AllocationDonutProps> = ({ tokens, tvlUsd }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const data = tokens.map((token, idx) => ({
    name: token.symbol,
    fullName: token.name,
    value: token.weightBps / 100, // percentage e.g. 40
    color: PALETTE[idx % PALETTE.length],
    mint: token.mint,
  }));

  const activeItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  const formattedTvl = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(tvlUsd);

  return (
    <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold font-display text-white tracking-tight">
            Target Allocation
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Curated constituent target weights with real-time on-chain verification
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A202C] border border-[#2D3748] text-xs font-mono text-gray-300">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          <span>{tokens.length} Constituents</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Donut Chart with Center TVL Label */}
        <div className="lg:col-span-5 relative flex items-center justify-center min-h-[260px]">
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={96}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="#10141D"
                  strokeWidth={3}
                  onMouseEnter={(_, index) => setHoveredIdx(index)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      opacity={hoveredIdx === null || hoveredIdx === index ? 1 : 0.4}
                      style={{
                        transition: "all 0.3s ease",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-[#0A0D12] border border-[#2D3748] rounded-lg px-2.5 py-1.5 shadow-xl text-xs font-mono text-white">
                          <span style={{ color: item.color }} className="font-bold">
                            {item.name}
                          </span>
                          : {item.value.toFixed(1)}%
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Center Label inside Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            {activeItem ? (
              <>
                <span className="text-xs uppercase font-mono tracking-wider text-gray-400">
                  {activeItem.fullName}
                </span>
                <span
                  className="text-2xl font-bold font-mono tracking-tight"
                  style={{ color: activeItem.color }}
                >
                  {activeItem.value.toFixed(1)}%
                </span>
                <span className="text-[10px] font-mono text-gray-500">
                  {activeItem.name}
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] uppercase font-mono tracking-widest text-gray-400">
                  BASKET TVL
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
                  {formattedTvl}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 mt-0.5">
                  Verified On-chain
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Interactive Legend Grid */}
        <div className="lg:col-span-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tokens.map((token, idx) => {
              const color = PALETTE[idx % PALETTE.length];
              const pct = (token.weightBps / 100).toFixed(1);
              const isHovered = hoveredIdx === idx;

              return (
                <div
                  key={token.symbol}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isHovered
                      ? "bg-[#1A202C] border-[#3B82F6]/50 shadow-sm"
                      : "bg-[#0A0D12] border-[#1F2633] hover:border-[#2D3748]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{
                        backgroundColor: color,
                        boxShadow: isHovered ? `0 0 10px ${color}` : "none",
                      }}
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm tracking-tight truncate">
                        {token.symbol}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {token.name}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-white">
                      {pct}%
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      ${token.priceUsd.toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
