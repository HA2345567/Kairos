import React from "react";
import { TrendingUp, Award, BarChart3, AlertTriangle } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface HistoricalTabViewProps {
  basket: Basket;
}

export const HistoricalTabView: React.FC<HistoricalTabViewProps> = ({ basket }) => {
  const returnMetrics = [
    { period: "24 Hours", basket: "+3.4%", sol: "+1.8%", alpha: "+1.6%" },
    { period: "7 Days", basket: `+${basket.returns7d.toFixed(1)}%`, sol: "+11.2%", alpha: `+${(basket.returns7d - 11.2).toFixed(1)}%` },
    { period: "30 Days", basket: `+${basket.returns30d.toFixed(1)}%`, sol: "+24.5%", alpha: `+${(basket.returns30d - 24.5).toFixed(1)}%` },
    { period: "90 Days", basket: "+68.2%", sol: "+44.1%", alpha: "+24.1%" },
    { period: "1 Year", basket: `+${basket.returns1y.toFixed(1)}%`, sol: "+86.6%", alpha: `+${(basket.returns1y - 86.6).toFixed(1)}%` },
    { period: "YTD", basket: "+112.5%", sol: "+78.3%", alpha: "+34.2%" },
  ];

  return (
    <div className="space-y-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#10141D] border border-[#1F2633]">
          <div className="text-xs text-gray-400 font-mono mb-1 flex items-center justify-between">
            <span>Sharpe Ratio</span>
            <Award className="w-3.5 h-3.5 text-[#D4FF00]" />
          </div>
          <div className="text-xl font-bold font-mono text-white">2.42</div>
          <div className="text-[10px] text-emerald-400 mt-1">Exceptional Risk-Adj.</div>
        </div>

        <div className="p-4 rounded-xl bg-[#10141D] border border-[#1F2633]">
          <div className="text-xs text-gray-400 font-mono mb-1 flex items-center justify-between">
            <span>Max Drawdown</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">-14.2%</div>
          <div className="text-[10px] text-gray-400 mt-1">vs -28.4% Raw SOL</div>
        </div>

        <div className="p-4 rounded-xl bg-[#10141D] border border-[#1F2633]">
          <div className="text-xs text-gray-400 font-mono mb-1 flex items-center justify-between">
            <span>Annualized Volatility</span>
            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">38.5%</div>
          <div className="text-[10px] text-gray-400 mt-1">Ecosystem Diversified</div>
        </div>

        <div className="p-4 rounded-xl bg-[#10141D] border border-[#1F2633]">
          <div className="text-xs text-gray-400 font-mono mb-1 flex items-center justify-between">
            <span>Beta vs SOL</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#D4FF00]" />
          </div>
          <div className="text-xl font-bold font-mono text-white">1.18</div>
          <div className="text-[10px] text-[#D4FF00] mt-1">High Upside Beta</div>
        </div>
      </div>

      {/* Comparative Returns Matrix Table */}
      <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5">
        <h4 className="text-base font-bold font-display text-white mb-4">
          Comparative Returns Matrix (Basket vs Benchmark)
        </h4>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1F2633] text-[11px] font-mono uppercase text-gray-400">
                <th className="py-2.5 px-3">Period</th>
                <th className="py-2.5 px-3">Basket Return</th>
                <th className="py-2.5 px-3">SOL Benchmark</th>
                <th className="py-2.5 px-3">Net Alpha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2633]/60 text-xs font-mono">
              {returnMetrics.map((row) => (
                <tr key={row.period} className="hover:bg-[#141A25] transition-colors">
                  <td className="py-3 px-3 text-white font-medium">{row.period}</td>
                  <td className="py-3 px-3 text-[#D4FF00] font-bold">{row.basket}</td>
                  <td className="py-3 px-3 text-purple-300">{row.sol}</td>
                  <td className="py-3 px-3 text-emerald-400 font-semibold">{row.alpha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
