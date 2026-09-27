import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePrivy } from "@privy-io/react-auth";
import { ShieldCheck, ArrowRight, Wallet, Info, Sparkles } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface InvestSidebarProps {
  basket: Basket;
  onInvest: (amount: string) => void;
}

const PRESETS = ["25", "50", "100", "250"];

export const InvestSidebar: React.FC<InvestSidebarProps> = ({ basket, onInvest }) => {
  const { connected: adapterConnected } = useWallet();
  const { authenticated: privyAuthenticated } = usePrivy();
  const isConnected = adapterConnected || privyAuthenticated;

  const [amount, setAmount] = useState<string>("50");
  const numAmount = parseFloat(amount) || 0;

  // Mock wallet USDC balance (or 0 if disconnected)
  const walletUsdcBalance = isConnected ? 1240.5 : 0;

  const handlePreset = (val: string) => {
    setAmount(val);
  };

  const handleHalf = () => {
    if (walletUsdcBalance > 0) {
      setAmount((walletUsdcBalance / 2).toFixed(2));
    } else {
      setAmount("25");
    }
  };

  const handleMax = () => {
    if (walletUsdcBalance > 0) {
      setAmount(walletUsdcBalance.toFixed(2));
    } else {
      setAmount("100");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount > 0) {
      onInvest(amount);
    }
  };

  return (
    <div className="sticky top-24 rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#1F2633]/80">
        <div>
          <h3 className="text-xl font-bold font-display text-white tracking-tight">
            Invest Now
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Instant 1-click swap-and-distribute
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[11px] font-mono font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Non-Custodial</span>
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Wallet Balance & Amount Input */}
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-gray-400 font-medium">You Pay</span>
            <div className="flex items-center gap-1.5 font-mono text-gray-400">
              <Wallet className="w-3 h-3 text-gray-400" />
              <span>Balance:</span>
              <span className="text-white font-semibold">
                ${walletUsdcBalance.toFixed(2)} USDC
              </span>
              <div className="flex items-center gap-1 ml-1.5">
                <button
                  type="button"
                  onClick={handleHalf}
                  className="px-1.5 py-0.5 rounded bg-[#1A202C] hover:bg-[#252D3D] text-[10px] text-gray-300 font-semibold border border-[#2D3748] transition-colors"
                >
                  Half
                </button>
                <button
                  type="button"
                  onClick={handleMax}
                  className="px-1.5 py-0.5 rounded bg-[#1A202C] hover:bg-[#252D3D] text-[10px] text-gray-300 font-semibold border border-[#2D3748] transition-colors"
                >
                  Max
                </button>
              </div>
            </div>
          </div>

          {/* Input Box */}
          <div className="relative flex items-center">
            <input
              type="number"
              step="any"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-12 pl-4 pr-24 rounded-xl bg-[#0A0D12] border border-[#2D3748] focus:border-[#D4FF00] focus:ring-1 focus:ring-[#D4FF00] outline-none text-white font-mono text-lg font-bold transition-all"
            />
            <div className="absolute right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141A25] border border-[#1F2633] pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
              <span className="text-xs font-mono font-bold text-white">USDC</span>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-4 gap-2 mt-2.5">
            {PRESETS.map((p) => {
              const isSelected = amount === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                    isSelected
                      ? "bg-[#D4FF00]/15 text-[#D4FF00] border border-[#D4FF00]/50"
                      : "bg-[#0A0D12] text-gray-400 hover:text-white border border-[#1F2633] hover:border-[#2D3748]"
                  }`}
                >
                  ${p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Constituent Leg Breakdown */}
        <div className="p-3.5 rounded-xl bg-[#0A0D12] border border-[#1F2633] space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 pb-1.5 border-b border-[#1F2633]">
            <span>Target Distribution</span>
            <span>Allocated USDC</span>
          </div>

          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {basket.tokens.map((token) => {
              const legAmount = (numAmount * (token.weightBps / 10000)).toFixed(2);
              const pct = (token.weightBps / 100).toFixed(0);

              return (
                <div
                  key={token.symbol}
                  className="flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-400 text-[10px] w-7 font-semibold">
                      {pct}%
                    </span>
                    <span className="text-white font-bold truncate">
                      {token.symbol}
                    </span>
                  </div>
                  <span className="text-gray-200 font-semibold">
                    ${legAmount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expected Return & Fees */}
        <div className="space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between text-gray-400">
            <span>1 Year Return (Hist.)</span>
            <span className="text-emerald-400 font-bold">
              +{basket.returns1y.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-gray-400">
            <span>Fees</span>
            <span className="text-gray-300">
              ~$0.08 network · 0.00% platform
            </span>
          </div>
        </div>

        {/* CTA Invest Button */}
        <button
          type="submit"
          className="w-full h-12 rounded-xl bg-[#D4FF00] hover:bg-[#bfe600] active:scale-[0.99] text-black font-bold text-sm tracking-wide shadow-[0_0_20px_rgba(212,255,0,0.25)] hover:shadow-[0_0_25px_rgba(212,255,0,0.4)] transition-all flex items-center justify-center gap-2"
        >
          <span>Invest ${amount || "0"}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Security / Non-Custodial Footer */}
        <div className="pt-2 text-center">
          <p className="text-[11px] font-mono text-gray-500 leading-tight">
            Zero custody · Tokens land directly in your wallet ATAs
          </p>
        </div>
      </form>
    </div>
  );
};
