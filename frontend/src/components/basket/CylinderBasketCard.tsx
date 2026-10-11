import React from "react";
import { Link } from "react-router-dom";
import type { Basket } from "@/lib/baskets-data";
import { useBasketNavHistory } from "@/hooks/useBasketNavHistory";
import "@/components/arc/basket-card.css";

export interface CylinderBasketCardProps {
  basket: Basket;
  className?: string;
}

export function CylinderBasketCard({ basket, className = "" }: CylinderBasketCardProps) {
  const { data: navSummary } = useBasketNavHistory(basket.id);

  const name = basket.name || "Untitled Basket";
  const points = basket.pointsMultiplier || "3x Pts";
  const desc = basket.description || "";
  const image = basket.imageUrl || "/baskets/solana-orb.png";

  // Compute live return percentage
  const hasRealNav = Boolean(navSummary && navSummary.history && navSummary.history.length > 0);
  const computedReturnPct = hasRealNav ? navSummary!.allTimeReturnPct : null;
  const returnString =
    computedReturnPct !== null
      ? `${computedReturnPct >= 0 ? "+" : ""}${computedReturnPct.toFixed(2)}%`
      : basket.displayReturn?.value || "+0.00%";
  const isPositive = !returnString.startsWith("-");

  const rawIcons = basket.tokens ? basket.tokens.map((t) => t.icon) : [];
  const visibleIcons = rawIcons.slice(0, 3);
  const extraCount = rawIcons.length > 3 ? rawIcons.length - 3 : 0;

  const targetHref = `/markets/${basket.slug || basket.id}`;

  return (
    <Link
      to={targetHref}
      className={`group flex flex-col w-[250px] h-[360px] rounded-2xl overflow-hidden border border-border/80 bg-[#1A1A1A] hover:bg-[#222222] hover:border-white/30 shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.7)] transition-all duration-200 select-none no-underline cursor-pointer ${className}`}
      draggable={false}
    >
      {/* Top Media Artwork Container — identical to ArcCard media in BasketCard */}
      <div className="relative w-full h-[170px] shrink-0 bg-[#141414] overflow-hidden border-b border-border/40">
        <img
          src={image}
          alt={`${name} artwork`}
          draggable={false}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300 ease-out select-none"
          loading="eager"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.visibility = "hidden";
          }}
        />
      </div>

      {/* Bottom Information Panel — matches BasketCard ArcCard body */}
      <div className="flex flex-col flex-1 p-3.5 bg-[#1A1A1A] group-hover:bg-[#222222] transition-colors justify-between">
        <div>
          {/* Title Row with Basket Name & Points Multiplier */}
          <div className="flex items-center justify-between gap-1.5 w-full">
            <h3 className="text-sm font-bold text-foreground truncate group-hover:text-emerald-300 transition-colors">
              {name}
            </h3>
            {points && <span className="kairos-card-points shrink-0">{points}</span>}
          </div>

          {/* Thesis Description */}
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
            {desc}
          </p>
        </div>

        {/* Split Bottom Row: Constituent Tokens Stack & All Time Return */}
        <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2 mt-auto">
          {/* Token Stack */}
          {visibleIcons.length > 0 ? (
            <div className="kairos-token-stack" aria-label="Constituent tokens">
              {visibleIcons.map((icon, idx) => (
                <img
                  key={idx}
                  src={icon}
                  alt=""
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
              ))}
              {extraCount > 0 && <span>+{extraCount}</span>}
            </div>
          ) : <div />}

          {/* Return Metric */}
          <div className="kairos-card-return text-right">
            <small>ALL TIME RETURN</small>
            <strong className={isPositive ? "positive" : "negative"}>
              {returnString}
            </strong>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default CylinderBasketCard;
