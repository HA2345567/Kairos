import { Link } from "react-router-dom";
import type { Basket } from "@/lib/baskets-data";
import { HistoricalMiniChart } from "@/components/basket/HistoricalMiniChart";
import "@/components/arc/basket-card.css";

export interface HorizontalBasketMarqueeProps {
  baskets: Basket[];
  className?: string;
  speedSeconds?: number;
}

function MarqueeCard({ basket }: { basket: Basket }) {
  const name = basket.name || "Untitled Basket";
  const desc = basket.description || "";
  const image = basket.imageUrl || "/baskets/solana-orb.png";

  const rawIcons = basket.tokens ? basket.tokens.map((t) => t.icon) : [];
  const visibleIcons = rawIcons.slice(0, 3);
  const extraCount = rawIcons.length > 3 ? rawIcons.length - 3 : 0;

  const targetHref = `/markets/${basket.slug || basket.id}`;

  return (
    <Link
      to={targetHref}
      className="group relative flex h-[430px] w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#191919] text-foreground no-underline shadow-[0_10px_28px_rgba(0,0,0,0.36)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_18px_44px_rgba(0,0,0,0.55)] sm:h-[450px] sm:w-[340px]"
      draggable={false}
    >
      <div className="relative h-[218px] w-full shrink-0 overflow-hidden bg-[#111] sm:h-[228px]">
        <img
          src={image}
          alt={`${name} artwork`}
          draggable={false}
          className="size-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          loading="eager"
          onError={(e) => {
            e.currentTarget.style.opacity = "0";
          }}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 shadow-sm backdrop-blur-md">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          {basket.category || "Solana Basket"}
        </div>
        {basket.pointsMultiplier && (
          <span className="absolute bottom-4 right-4 rounded-md border border-white/15 bg-black/45 px-2 py-1 font-mono text-[10px] font-semibold text-white/80 backdrop-blur-sm">
            {basket.pointsMultiplier}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-[#1b1b1b] to-[#161616] p-4 sm:p-[18px]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate font-display text-base font-semibold leading-snug text-white transition-colors group-hover:text-emerald-200 sm:text-[17px]">
            {name}
          </h3>
          <span className="mt-0.5 shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
            {basket.tokens.length} assets
          </span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-[1.65] text-white/55">{desc}</p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.08] pt-3.5">
          <div className="min-w-0">
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
            ) : <span className="text-[10px] text-white/35">Basket assets</span>}
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-white/35">Constituents</span>
          </div>
          <HistoricalMiniChart slug={basket.slug || basket.id} compact />
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
          .group:hover .marquee-track,
          .group:focus-within .marquee-track {
            animation-play-state: paused;
          }
          @media (prefers-reduced-motion: reduce) {
            .marquee-track { animation: none; }
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
