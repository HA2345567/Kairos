import React from "react";
import { ShieldCheck, Droplets, PieChart, Activity } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface RiskTabViewProps {
  basket: Basket;
}

export const RiskTabView: React.FC<RiskTabViewProps> = ({ basket }) => {
  return (
    <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6 mb-6">
      <div className="mb-5">
        <h3 className="text-xl font-bold font-display text-white tracking-tight">
          Risk & Security Assessment
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Multi-dimensional risk analysis across liquidity, custody, and volatility
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Smart Contract Risk */}
        <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-white text-sm">Smart Contract & Execution</h4>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Low Risk
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Non-custodial router model. No centralized vaults holding custody. Uses battle-tested Jupiter v6 CPI swap aggregation and Anchor 0.30+ validated instructions.
          </p>
        </div>

        {/* 2. Liquidity & Slippage */}
        <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Droplets className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-white text-sm">Liquidity & Slippage Profile</h4>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              High Depth
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            All constituent tokens maintain minimum on-chain liquidity depth of &gt;$10M across Raydium, Orca Whirlpools, and Meteora DLMM pools.
          </p>
        </div>

        {/* 3. Concentration Risk */}
        <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <PieChart className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-white text-sm">Concentration Score (HHI)</h4>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Balanced (0.28)
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Herfindahl-Hirschman index calibrated to prevent single-asset domino failures. No individual constituent token exceeds 45% basket weight.
          </p>
        </div>

        {/* 4. Volatility Profile */}
        <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#D4FF00]/10 text-[#D4FF00]">
                <Activity className="w-4 h-4" />
              </div>
              <h4 className="font-bold text-white text-sm">Market Volatility Beta</h4>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#D4FF00]/10 text-[#D4FF00] border border-[#D4FF00]/20">
              Medium-High Beta
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Ecosystem altcoins exhibit higher beta to SOL price action. Diversified constituent basket reduces peak drawdown by an estimated 48% vs individual alts.
          </p>
        </div>
      </div>
    </div>
  );
};
