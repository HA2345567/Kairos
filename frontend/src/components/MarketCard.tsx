import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatUsd } from '@/lib/api';
import type { ApiMarket } from '@/lib/api-types';
import { Globe, TrendingUp, Users, Flag, Zap, Hash, Database, Cpu } from 'lucide-react';

interface MarketCardProps {
  market: ApiMarket;
  compact?: boolean;
}

const getCategoryIcon = (category: string) => {
  const c = category.toLowerCase();
  if (c.includes('politic')) return <Flag className="h-3.5 w-3.5 text-blue-400" />;
  if (c.includes('crypto')) return <Database className="h-3.5 w-3.5 text-yellow-400" />;
  if (c.includes('ai')) return <Cpu className="h-3.5 w-3.5 text-purple-400" />;
  if (c.includes('sport')) return <TrendingUp className="h-3.5 w-3.5 text-green-400" />;
  if (c.includes('meme')) return <Zap className="h-3.5 w-3.5 text-orange-400" />;
  if (c.includes('nft')) return <Hash className="h-3.5 w-3.5 text-pink-400" />;
  return <Globe className="h-3.5 w-3.5 text-muted-foreground" />;
};

export function MarketCard({ market, compact = false }: MarketCardProps) {
  const yesProb = Math.round(market.yesPrice * 100);
  const noProb = 100 - yesProb;
  
  const yesMultiplier = (1 / market.yesPrice).toFixed(2);
  const noMultiplier = (1 / (1 - market.yesPrice)).toFixed(2);

  return (
    <Link
      to={`/markets/${market.id}`}
      className={cn(
        "group relative flex flex-col w-full bg-[#0D0D0D] border border-white/[0.04] rounded-2xl p-5 transition-all duration-300 hover:bg-[#121212] hover:border-white/[0.08] hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)]",
        compact ? "max-w-sm" : ""
      )}
    >
      {/* Header: Icon + Category */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.03] ring-1 ring-white/10">
          {getCategoryIcon(market.category)}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
          {market.category}
        </span>
        {market.isLive && (
          <div className="ml-auto flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[9px] font-bold uppercase text-success tracking-wider">Live</span>
          </div>
        )}
      </div>

      {/* Question / Title with Image */}
      <div className="flex gap-3 mb-6">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
          {market.imageUrl ? (
            <img 
              src={market.imageUrl} 
              className="h-full w-full object-cover transition duration-500 group-hover:scale-110" 
              alt={market.question} 
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/5">
              <Globe className="h-6 w-6 text-white/20" />
            </div>
          )}
        </div>
        <h3 className="text-base font-semibold text-white/95 leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-white transition-colors">
          {market.question}
        </h3>
      </div>

      {/* Outcome Rows (Polymarket Style) */}
      <div className="space-y-2.5 mb-6">
        {/* Yes Outcome */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.03] border border-white/[0.05] overflow-hidden">
               <span className="text-[10px] font-bold text-white/40">Y</span>
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-white/80">Yes</span>
              <div className="mt-1 h-1 w-full bg-white/[0.03] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#00FFBD] rounded-full transition-all duration-700" 
                  style={{ width: `${yesProb}%` }} 
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <span className="text-[11px] font-medium text-muted-foreground/60">{yesMultiplier}x</span>
            <div className="min-w-[54px] py-1 px-2 rounded-lg bg-[#00FFBD]/[0.08] border border-[#00FFBD]/20 flex items-center justify-center">
              <span className="text-xs font-bold text-[#00FFBD]">{yesProb}%</span>
            </div>
          </div>
        </div>

        {/* No Outcome */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.03] border border-white/[0.05] overflow-hidden">
               <span className="text-[10px] font-bold text-white/40">N</span>
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-white/80">No</span>
              <div className="mt-1 h-1 w-full bg-white/[0.03] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#FF4F4F] rounded-full transition-all duration-700" 
                  style={{ width: `${noProb}%` }} 
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <span className="text-[11px] font-medium text-muted-foreground/60">{noMultiplier}x</span>
            <div className="min-w-[54px] py-1 px-2 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center">
              <span className="text-xs font-bold text-white/90">{noProb}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-auto flex items-center justify-between border-t border-white/[0.04] pt-4">
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <TrendingUp className="h-3 w-3" />
          <span className="text-[11px] font-medium">{formatUsd(market.volume)} vol</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <Users className="h-3 w-3" />
          <span className="text-[11px] font-medium">{market.participants || 0} markets</span>
        </div>
      </div>
    </Link>
  );
}
