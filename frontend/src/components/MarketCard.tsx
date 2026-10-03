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
        "group relative flex flex-col w-full min-h-[350px] bg-[#1A1A1A] border border-border rounded-[var(--radius-panel,1.25rem)] p-6 transition-all duration-300 hover:bg-[#242424] hover:border-border-strong hover:shadow-[0_8px_30px_rgb(0,0,0,0.5)]",
        compact ? "max-w-sm" : ""
      )}
    >
      {/* Header: Icon + Category */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-hover ring-1 ring-border">
          {getCategoryIcon(market.category)}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted">
          {market.category}
        </span>
        {market.isLive && (
          <div className="ml-auto flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-bold uppercase text-emerald-400 tracking-wider">Live</span>
          </div>
        )}
      </div>

      {/* Question / Title with Image */}
      <div className="flex gap-3 mb-6">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
          {market.imageUrl ? (
            <img 
              src={market.imageUrl} 
              className="h-full w-full object-cover transition duration-500 group-hover:scale-110" 
              alt={market.question} 
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-surface-hover">
              <Globe className="h-6 w-6 text-text-muted" />
            </div>
          )}
        </div>
        <h3 className="text-base font-semibold text-text-primary leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-white transition-colors">
          {market.question}
        </h3>
      </div>

      {/* Outcome Rows */}
      <div className="space-y-2.5 mb-6">
        {/* Yes Outcome */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover border border-border overflow-hidden">
               <span className="text-[10px] font-bold text-text-muted">Y</span>
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-text-primary">Yes</span>
              <div className="mt-1 h-1 w-full bg-surface-hover rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-700" 
                  style={{ width: `${yesProb}%` }} 
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <span className="text-[11px] font-medium text-text-muted">{yesMultiplier}x</span>
            <div className="min-w-[54px] py-1 px-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-emerald-400">{yesProb}%</span>
            </div>
          </div>
        </div>

        {/* No Outcome */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover border border-border overflow-hidden">
               <span className="text-[10px] font-bold text-text-muted">N</span>
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-text-primary">No</span>
              <div className="mt-1 h-1 w-full bg-surface-hover rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-500 rounded-full transition-all duration-700" 
                  style={{ width: `${noProb}%` }} 
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <span className="text-[11px] font-medium text-text-muted">{noMultiplier}x</span>
            <div className="min-w-[54px] py-1 px-2 rounded-lg bg-surface-hover border border-border flex items-center justify-center">
              <span className="text-xs font-bold text-text-primary">{noProb}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-1.5 text-text-muted">
          <TrendingUp className="h-3 w-3" />
          <span className="text-[11px] font-medium">{formatUsd(market.volume)} vol</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-muted">
          <Users className="h-3 w-3" />
          <span className="text-[11px] font-medium">{market.participants || 0} markets</span>
        </div>
      </div>
    </Link>
  );
}
