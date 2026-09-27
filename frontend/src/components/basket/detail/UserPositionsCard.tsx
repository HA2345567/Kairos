import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePrivy } from "@privy-io/react-auth";
import { Wallet, ArrowRight, Activity, Clock, ShieldCheck } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface UserPositionsCardProps {
  basket: Basket;
  onInvestClick: () => void;
}

export const UserPositionsCard: React.FC<UserPositionsCardProps> = ({
  basket,
  onInvestClick,
}) => {
  const [subTab, setSubTab] = useState<"positions" | "activity">("positions");
  const { connected: adapterConnected } = useWallet();
  const { authenticated: privyAuthenticated } = usePrivy();
  const isConnected = adapterConnected || privyAuthenticated;

  // For v1 without local position caching, position defaults to empty state
  const hasActivePosition = false;

  return (
    <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6 mt-6">
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-[#1F2633] pb-4 mb-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("positions")}
            className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              subTab === "positions"
                ? "bg-[#1A202C] text-white border border-[#2D3748]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            My Positions
          </button>
          <button
            type="button"
            onClick={() => setSubTab("activity")}
            className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              subTab === "activity"
                ? "bg-[#1A202C] text-white border border-[#2D3748]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Rebalance Activity
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-gray-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Non-Custodial ATAs</span>
        </div>
      </div>

      {/* Positions Content */}
      {subTab === "positions" && (
        <div>
          {!hasActivePosition ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#0A0D12] border border-[#1F2633] flex items-center justify-center mb-4 text-gray-500">
                <Wallet className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold font-display text-white mb-1">
                No open position
              </h4>
              <p className="text-xs text-gray-400 max-w-sm mb-5 leading-normal">
                Invest in this basket to view your live portfolio allocation and PnL. Constituents will be held directly in your connected wallet.
              </p>
              <button
                type="button"
                onClick={onInvestClick}
                className="px-5 py-2.5 rounded-xl bg-[#D4FF00] hover:bg-[#bfe600] text-black font-bold text-xs tracking-wide shadow-md transition-all flex items-center gap-2"
              >
                <span>Invest in Basket</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Position details placeholder when active */}
              <div className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633]">
                <div className="text-xs text-gray-400 font-mono">Current Position Value</div>
                <div className="text-2xl font-bold font-mono text-white mt-1">$0.00</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity Content */}
      {subTab === "activity" && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#0A0D12] border border-[#1F2633] flex items-center justify-center mb-4 text-gray-500">
            <Clock className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold font-display text-white mb-1">
            No Recent Activity
          </h4>
          <p className="text-xs text-gray-400 max-w-sm leading-normal">
            No recent rebalance activity for your wallet. When rebalances occur on-chain, transaction logs will be listed here.
          </p>
        </div>
      )}
    </div>
  );
};
