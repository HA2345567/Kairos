import React from "react";
import { Link } from "react-router-dom";
import type { Basket } from "@/lib/baskets-data";
import { useBasketNavHistory } from "@/hooks/useBasketNavHistory";
import "@/components/arc/basket-card.css";

export interface HorizontalBasketMarqueeProps {
  baskets: Basket[];
  className?: string;
  speedSeconds?: number;
}

function MarqueeCard({ basket }: { basket: Basket }) {
  const { data: navSummary } = useBasketNavHistory(basket.id);

  const name = basket.name || "Untitled Basket";
  const points = basket.pointsMultiplier || "3x Pts";
  const desc = basket.description || "";
  const image = basket.imageUrl || "/baskets/solana-orb.png";

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
      className="group relative flex flex-col w-[330px] sm:w-[350px] h-[470px] sm:h-[490px] shrink-0 rounded-2xl overflow-hidden border border-white/15 hover:border-white/35 bg-[#161618]/90 hover:bg-[#1e1f23]/95 backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:shadow-[0_18px_44px_rgba(0,0,0,0.65)] transition-all duration-200 select-none no-underline cursor-pointer"
      draggable={false}
    >
      {/* Top Media Artwork Container — Taller & richer visual showcase */}
      <div className="relative w-full h-[245px] sm:h-[255px] shrink-0 bg-[#121316] overflow-hidden border-b border-white/10">
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

      {/* Bottom Information Panel */}
      <div className="flex flex-col flex-1 p-5 bg-[#161618]/95 group-hover:bg-[#1e1f23] transition-colors justify-between">
        <div>
          {/* Title Row with Basket Name & Points Multiplier */}
          <div className="flex items-center justify-between gap-2 w-full">
            <h3 className="text-[15px] sm:text-base font-bold text-foreground truncate group-hover:text-emerald-300 transition-colors">
              {name}
            </h3>
            {points && <span className="kairos-card-points shrink-0">{points}</span>}
          </div>

          {/* Thesis Description */}
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {desc}
          </p>
        </div>

        {/* Split Bottom Row: Constituent Tokens Stack & All Time Return */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 mt-auto">
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

export function HorizontalBasketMarquee({
  baskets,
  className = "",
  speedSeconds = 50,
}: HorizontalBasketMarqueeProps) {
  return (
    <div className={`group relative w-full overflow-hidden select-none py-2 ${className}`}>
      <style>
        {`
          @keyframes marquee-scroll {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-50%);
            }
          }
          .marquee-track {
            display: flex;
            width: max-content;
            gap: 1.5rem;
            animation: marquee-scroll ${speedSeconds}s linear infinite;
            will-change: transform;
          }
          .group:hover .marquee-track {
            animation-play-state: paused;
          }
        `}
      </style>

      {/* Infinite Scrolling Track (Duplicated list for 100% seamless infinite loop) */}
      <div className="marquee-track py-2">
        {/* Set 1 */}
        {baskets.map((basket, idx) => (
          <MarqueeCard key={`track1-${basket.id}-${idx}`} basket={basket} />
        ))}
        {/* Set 2 (Identical mirror for seamless infinite loop) */}
        {baskets.map((basket, idx) => (
          <MarqueeCard key={`track2-${basket.id}-${idx}`} basket={basket} />
        ))}
      </div>
    </div>
  );
}

export default HorizontalBasketMarquee;
