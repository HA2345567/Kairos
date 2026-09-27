import React, { useState } from "react";
import { ExternalLink, Copy, Check, Database, Zap, BookOpen } from "lucide-react";
import type { Basket } from "@/lib/baskets-data";

interface ResourcesTabViewProps {
  basket: Basket;
}

export const ResourcesTabView: React.FC<ResourcesTabViewProps> = ({ basket }) => {
  const [copiedMint, setCopiedMint] = useState<string | null>(null);

  const copyMint = (mint: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(mint);
    }
    setCopiedMint(mint);
    setTimeout(() => setCopiedMint(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Verified SPL Mint Addresses */}
      <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6">
        <h3 className="text-xl font-bold font-display text-white tracking-tight mb-1">
          Verified SPL Mint Addresses
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          All tokens swap directly from USDC into their verified on-chain mint addresses
        </p>

        <div className="space-y-2">
          {basket.tokens.map((token) => (
            <div
              key={token.mint}
              className="flex items-center justify-between p-3 rounded-xl bg-[#0A0D12] border border-[#1F2633] hover:border-[#2D3748] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-bold text-white text-sm w-12">{token.symbol}</span>
                <span className="text-xs font-mono text-gray-400 truncate max-w-[200px] sm:max-w-md">
                  {token.mint}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyMint(token.mint)}
                  className="p-1.5 rounded-lg bg-[#141A25] hover:bg-[#1A202C] text-gray-400 hover:text-white transition-colors"
                  title="Copy Mint"
                >
                  {copiedMint === token.mint ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <a
                  href={`https://solscan.io/token/${token.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-[#141A25] hover:bg-[#1A202C] text-gray-400 hover:text-white transition-colors"
                  title="View on Solscan"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* External References & Oracles */}
      <div className="rounded-2xl bg-[#10141D] border border-[#1F2633] p-5 sm:p-6">
        <h3 className="text-xl font-bold font-display text-white tracking-tight mb-4">
          Oracle & Infrastructure References
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="https://pyth.network/price-feeds"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633] hover:border-[#2D3748] transition-all group"
          >
            <div className="flex items-center justify-between text-purple-400 mb-2">
              <Database className="w-4 h-4" />
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <div className="text-sm font-bold text-white mb-1">Pyth Network Oracles</div>
            <p className="text-xs text-gray-400">
              Low-latency real-time price feeds used for UI display and tracking.
            </p>
          </a>

          <a
            href="https://station.jup.ag/docs/apis/swap-api"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633] hover:border-[#2D3748] transition-all group"
          >
            <div className="flex items-center justify-between text-emerald-400 mb-2">
              <Zap className="w-4 h-4" />
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <div className="text-sm font-bold text-white mb-1">Jupiter Aggregator v6</div>
            <p className="text-xs text-gray-400">
              Optimal multi-hop routing across Solana DEX liquidity pools.
            </p>
          </a>

          <a
            href="https://solana.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 rounded-xl bg-[#0A0D12] border border-[#1F2633] hover:border-[#2D3748] transition-all group"
          >
            <div className="flex items-center justify-between text-[#D4FF00] mb-2">
              <BookOpen className="w-4 h-4" />
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <div className="text-sm font-bold text-white mb-1">Solana SPL Token Spec</div>
            <p className="text-xs text-gray-400">
              Associated Token Account (ATA) program standards and verification.
            </p>
          </a>
        </div>
      </div>
    </div>
  );
};
