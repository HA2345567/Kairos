import { Basket } from "@/lib/baskets-data";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TokenAvatar } from "@/components/common/TokenAvatar";
import { BasketSparkline } from "@/components/common/BasketSparkline";
import { useMarketBasketNavHistory } from "@/hooks/useBasketNavHistory";
import { Button } from "@/components/arc/button";

interface BasketRowProps {
  basket: Basket;
  index: number;
  onInvestClick?: (basket: Basket) => void;
  livePrices?: Record<string, { priceUsd: number; change24h: number | null }>;
}

export function BasketRow({ basket, index, onInvestClick, livePrices }: BasketRowProps) {
  const { data: navSummary, isLoading: isNavLoading } = useMarketBasketNavHistory(basket.slug || basket.id, "1Y");

  const historyPoints = navSummary?.history ?? [];
  const hasData = historyPoints.length > 1;
  const firstHistoryValue = historyPoints[0]?.navValue;
  const currentHistoryValue = historyPoints[historyPoints.length - 1]?.navValue;
  const historicalReturn = hasData && firstHistoryValue && firstHistoryValue > 0 && currentHistoryValue !== undefined
    ? ((currentHistoryValue / firstHistoryValue) - 1) * 100
    : null;
  const isPositive = historicalReturn === null || historicalReturn >= 0;
  const returnString = historicalReturn !== null ? `${historicalReturn >= 0 ? "+" : ""}${historicalReturn.toFixed(2)}%` : null;
  const pricedTokens = basket.tokens
    .map((token) => ({ token, price: livePrices?.[token.priceMint ?? token.mint] }))
    .filter((item): item is { token: Basket["tokens"][number]; price: { priceUsd: number; change24h: number | null } } => Boolean(item.price && typeof item.price.change24h === "number"));
  const pricedWeight = pricedTokens.reduce((sum, item) => sum + item.token.weightBps, 0);
  const weightedChange24h = pricedWeight > 0
    ? pricedTokens.reduce((sum, item) => sum + item.price.change24h * item.token.weightBps, 0) / pricedWeight
    : null;

  return (
    <div className="group relative flex items-center justify-between gap-3 sm:gap-6 bg-surface hover:bg-surface-hover px-4 py-3.5 sm:px-6 sm:py-4 transition-colors duration-150">
      {/* Left: Index + Icon + Title & Subline */}
      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
        {/* Row Index */}
        <span className="w-4 sm:w-5 text-left font-mono text-xs sm:text-sm font-semibold text-text-muted shrink-0">
          {index}
        </span>

        {/* Rounded Icon Thumbnail */}
        <div className="size-11 sm:size-12 rounded-xl overflow-hidden bg-surface-hover border border-border shrink-0 relative group-hover:border-border-strong transition-colors shadow-inner flex items-center justify-center">
          {basket.imageUrl ? (
            <img
              src={basket.imageUrl}
              alt={basket.name}
              className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <div className="size-full flex items-center justify-center bg-surface-hover">
              <Sparkles className="size-5 text-text-muted" />
            </div>
          )}
        </div>

        {/* Title + Subline (Constituents & Top Performer) */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm sm:text-base group-hover:text-primary transition-colors truncate">
              {basket.name}
            </span>
          </div>

          {/* Subline: Overlapping Tokens + Top Performer Tick */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Overlapping Constituent Tokens */}
            <div className="flex -space-x-1.5 items-center shrink-0">
              {basket.tokens.slice(0, 3).map((token) => (
                <TokenAvatar
                  key={token.symbol}
                  symbol={token.symbol}
                  src={token.icon}
                  name={token.name}
                  size="sm"
                  className="ring-2 ring-surface"
                />
              ))}
            </div>
            {weightedChange24h !== null && (
              <span className={cn("font-mono text-[10px] font-semibold", weightedChange24h >= 0 ? "text-emerald-400" : "text-rose-400")}>
                24h {weightedChange24h >= 0 ? "+" : ""}{weightedChange24h.toFixed(2)}%
              </span>
            )}

          </div>
        </div>
      </div>

      {/* Right Section: Real-time Sparkline + Return % + Invest Button */}
      <div className="flex items-center gap-4 sm:gap-8 shrink-0">
        {/* Real-time Animated Sparkline Graph with glowing live beacon dot */}
        <div className="hidden sm:block">
          {isNavLoading ? (
            <div className="w-[140px] h-[38px] flex items-center justify-center">
              <span className="inline-block w-16 h-3 bg-surface-hover animate-pulse rounded" />
            </div>
          ) : hasData ? (
            <BasketSparkline
              values={historyPoints.map((point) => point.navValue)}
              isPositive={isPositive}
              width={140}
              height={38}
            />
          ) : (
            <div className="w-[140px] h-[38px] flex items-center justify-center">
              <span className="text-[11px] font-mono text-text-muted italic">No data yet</span>
            </div>
          )}
        </div>

        {/* Return Metrics: +XX.X% and ALL TIME */}
        <div className="flex flex-col items-end min-w-[85px] sm:min-w-[100px]">
          {isNavLoading ? (
            <span className="inline-block w-14 h-4 bg-surface-hover animate-pulse rounded" />
          ) : hasData ? (
            <span
              className={cn(
                "font-mono font-bold text-sm sm:text-base tracking-tight",
                isPositive ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {returnString}
            </span>
          ) : (
            <span className="font-mono text-xs text-text-muted font-medium">No data yet</span>
          )}
          <span className="text-[10px] font-mono uppercase font-semibold text-text-muted tracking-wider">
            1Y HISTORY
          </span>
        </div>

        {/* Invest CTA Button */}
        <Button
          variant="primary"
          size="sm"
          disabled={!basket.isInvestable}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!basket.isInvestable) return;
            onInvestClick?.(basket);
          }}
          className="font-bold relative z-10 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {basket.isInvestable ? "Invest" : "Paused"}
        </Button>
      </div>
    </div>
  );
}
