import React from "react";
import { Sparkles, ShieldCheck, Zap, Layers, RefreshCw } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface StrategyRationaleProps {
  basket: Basket;
}

export const StrategyRationale: React.FC<StrategyRationaleProps> = ({ basket }) => {
  return (
    <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-[#D4FF00]" />
        <h3 className="text-xl font-bold font-display text-white tracking-tight">
          Investment Strategy & Narrative
        </h3>
      </div>

      <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
        <p>
          {basket.description}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633]">
            <div className="flex items-center gap-2 text-[#D4FF00] font-semibold text-sm mb-1.5">
              <Layers className="w-4 h-4" />
              <span>Curation & Weighting Logic</span>
            </div>
            <p className="text-xs text-gray-400 leading-normal">
              Weights are systematically calibrated based on on-chain liquidity depth, 30-day DEX volume market share, and staking governance yield generation.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633]">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1.5">
              <RefreshCw className="w-4 h-4" />
              <span>Rebalancing Cadence</span>
            </div>
            <p className="text-xs text-gray-400 leading-normal">
              Constituents are reviewed monthly with algorithmic target weight deviations rebalanced only when slippage impact is less than 0.05%.
            </p>
          </div>
        </div>

        {/* Non-Custodial Router Callout */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#10141D] to-[#141A25] border border-emerald-500/20 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-normal">
            <span className="font-bold text-white block mb-0.5">
              Non-Custodial Router Architecture
            </span>
            <span className="text-gray-400">
              Kairos does not pool or custody your funds in smart contract vaults. When you execute an investment, your USDC is atomically swapped via Jupiter CPI directly into the constituent tokens and deposited into your personal Associated Token Accounts (ATAs).
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
