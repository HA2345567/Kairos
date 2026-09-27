import React, { useState } from "react";
import { Copy, Check, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import type { BasketToken } from "@/lib/baskets-data";

interface ConstituentTokenCardProps {
  token: BasketToken;
}

export const ConstituentTokenCard: React.FC<ConstituentTokenCardProps> = ({ token }) => {
  const [copied, setCopied] = useState(false);

  const allocationPercent = (token.weightBps / 100).toFixed(1);
  const isPositive = token.change24h >= 0;
  const truncatedMint = `${token.mint.slice(0, 4)}...${token.mint.slice(-4)}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(token.mint);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate a mini sparkline path based on 24h trajectory
  const sparklineColor = isPositive ? "#10B981" : "#F43F5E";
  const sparklineD = isPositive
    ? "M 0 22 Q 15 20, 30 15 T 60 10 T 90 4"
    : "M 0 4 Q 15 8, 30 14 T 60 18 T 90 22";

  return (
    <div className="group relative flex flex-col justify-between p-4 rounded-xl bg-[#10141D] hover:bg-[#141A25] border border-[#1F2633] hover:border-[#2D3748] transition-all duration-200">
      {/* Top Header: Token Icon, Symbol/Name, Truncated Mint */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#1A202C] border border-[#2D3748] flex items-center justify-center overflow-hidden shrink-0">
            {token.icon ? (
              <img
                src={token.icon}
                alt={token.symbol}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback letter avatar
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : null}
            <span className="text-xs font-bold text-gray-300">
              {token.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white text-base tracking-tight truncate">
                {token.symbol}
              </span>
              {/* Copyable Mint Chip */}
              <button
                type="button"
                onClick={handleCopy}
                title="Copy Mint Address"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1A202C] hover:bg-[#252D3D] text-[10px] font-mono text-gray-400 hover:text-gray-200 border border-[#2D3748] transition-colors"
              >
                <span>{truncatedMint}</span>
                {copied ? (
                  <Check className="w-2.5 h-2.5 text-[#10B981]" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">{token.name}</p>
          </div>
        </div>

        {/* Explorer link */}
        <a
          href={`https://solscan.io/token/${token.mint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
          title="View on Solscan"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Middle Row: Price, 24h Change, Sparkline */}
      <div className="flex items-center justify-between my-2">
        <div>
          <div className="text-lg font-bold font-mono text-white tracking-tight">
            ${token.priceUsd.toFixed(2)}
          </div>
          <div
            className={`inline-flex items-center gap-0.5 text-xs font-mono font-medium ${
              isPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {token.change24h.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Micro Sparkline */}
        <div className="w-20 h-7 opacity-85 group-hover:opacity-100 transition-opacity">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 90 26">
            <path
              d={sparklineD}
              fill="none"
              stroke={sparklineColor}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Bottom Row: Allocation Progress Bar */}
      <div className="mt-2 pt-2.5 border-t border-[#1F2633]/60">
        <div className="flex justify-between items-center text-xs mb-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Allocation
          </span>
          <span className="font-mono font-semibold text-white">
            {allocationPercent}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[#1A202C] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#D4FF00] transition-all duration-500"
            style={{ width: `${Math.min(parseFloat(allocationPercent), 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
