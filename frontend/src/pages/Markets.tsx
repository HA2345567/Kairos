import { useLayoutEffect, useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { BasketCard } from "@/components/basket/BasketCard";
import { BasketRow } from "@/components/basket/BasketRow";
import { BasketCardSkeleton, BasketRowSkeleton } from "@/components/basket/BasketSkeleton";
import { InvestModal } from "@/components/basket/InvestModal";
import { Link } from "react-router-dom";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import Rows3 from "lucide-react/dist/esm/icons/rows-3";
import { cn } from "@/lib/utils";
import "./kairos.css";
import { fetchBaskets, type Basket } from "@/lib/baskets-data";

import { useTokenPrices } from "@/hooks/useTokenPrices";

/* ────────────────────────────────────────────────────────────────────────── */
/* Grain card                                                                 */
/*                                                                            */
/* The card's picture stays clean. Grain + shade cover only the part BELOW    */
/* the picture (title, description, token icons, return). The start line is   */
/* measured from the picture's bottom edge, so it follows the card at any     */
/* width. Typography and token icons get a small contrast boost so they stay  */
/* sharp under the grain.                                                     */
/*                                                                            */
/* Tune:  --grain-opacity   0 = clean … 1 = very gritty                       */
/*        --grain-size      smaller number = finer grain                      */
/*        --shade-strength  0 = no shading … 1 = heavy dark                   */
/* ────────────────────────────────────────────────────────────────────────── */

const GRAIN_CSS = `
.grain-bg {
  --grain-opacity: 0.22;
  --grain-size: 200px;
  --shade-strength: 0.35;
  position: relative;
  isolation: isolate;
  height: 100%;
  overflow: hidden;
  border-radius: 1rem;
}

/* Overlays start at the picture's bottom edge (set from JS as --grain-top) */
.grain-bg::before,
.grain-bg::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: var(--grain-top, 0px);
  pointer-events: none;
}

/* Shade: soft depth toward the bottom + a thin seam under the picture */
.grain-bg::before {
  z-index: 20;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, calc(var(--shade-strength) * 0.7)) 100%),
    radial-gradient(120% 90% at 20% 0%, transparent 40%, rgba(0, 0, 0, calc(var(--shade-strength) * 0.6)) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

/* Film grain speckle */
.grain-bg::after {
  z-index: 21;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n' color-interpolation-filters='sRGB'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.4 0 0 0 -.5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: var(--grain-size) var(--grain-size);
  opacity: var(--grain-opacity);
}

/* Typography: brighter title, clearer description */
.grain-bg h1,
.grain-bg h2,
.grain-bg h3,
.grain-bg h4 {
  color: #f2f2f2;
  letter-spacing: -0.02em;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.55);
}
.grain-bg p {
  color: #b8b8b8;
}

/* Token icons (everything except the big picture): crisper, with a dark ring */
.grain-bg img:not([data-grain-hero]) {
  filter: saturate(1.15) contrast(1.06);
  box-shadow: 0 0 0 1.5px rgba(17, 17, 17, 0.95);
}
`;

/**
 * Wraps the original BasketCard. Finds the card's picture (the largest <img>),
 * and tells the CSS where it ends so the grain starts right below it.
 */
function GrainCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const observed = new Set<Element>();
    const ro = new ResizeObserver(() => measure());

    function measure() {
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      const imgs = Array.from(root.querySelectorAll("img"));

      let hero: HTMLImageElement | null = null;
      let best = 0;
      for (const img of imgs) {
        const r = img.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > best) {
          best = area;
          hero = img;
        }
        if (!observed.has(img)) {
          observed.add(img);
          ro.observe(img);
        }
      }

      // Only treat it as "the picture" if it is a big part of the card
      const isPicture = hero && best > rootRect.width * rootRect.height * 0.15;
      for (const img of imgs) {
        if (isPicture && img === hero) img.setAttribute("data-grain-hero", "");
        else img.removeAttribute("data-grain-hero");
      }

      const top = isPicture && hero ? Math.max(0, Math.round(hero.getBoundingClientRect().bottom - rootRect.top)) : 0;
      root.style.setProperty("--grain-top", `${top}px`);
    }

    measure();
    ro.observe(root);
    const mo = new MutationObserver(measure);
    mo.observe(root, { childList: true, subtree: true });
    root.addEventListener("load", measure, true); // images finishing loading

    return () => {
      ro.disconnect();
      mo.disconnect();
      root.removeEventListener("load", measure, true);
    };
  }, []);

  return (
    <div ref={ref} className="grain-bg">
      {children}
    </div>
  );
}

const INITIAL_CATEGORIES = ["All"];
const MARKET_DISPLAY_ORDER = [
  "solana-infrastructure",
  "solana-real-world-assets",
  "solana-sigma-basket",
  "solana-culture-memes",
  "solana-ai-compute",
  "solana-depin-infrastructure",
];
const MARKET_DISPLAY_ORDER_INDEX = new Map(
  MARKET_DISPLAY_ORDER.map((slug, index) => [slug, index])
);

function orderMarketBaskets(markets: Basket[]): Basket[] {
  return [...markets].sort((a, b) => {
    const aIndex = MARKET_DISPLAY_ORDER_INDEX.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = MARKET_DISPLAY_ORDER_INDEX.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.name.localeCompare(b.name);
  });
}

export default function Markets() {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [selectedCat, setSelectedCat] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isLoading, setIsLoading] = useState(true);
  const [investBasket, setInvestBasket] = useState<Basket | null>(null);
  const [investModalOpen, setInvestModalOpen] = useState(false);

  // Aggregate all unique token mints for real-time DexScreener/Jupiter price updates
  const allConstituentMints = useMemo(() => {
    return Array.from(
      new Set(baskets.flatMap((b) => (b.tokens || []).map((t) => t.priceMint || t.mint)))
    );
  }, [baskets]);
  const { prices: livePrices } = useTokenPrices(allConstituentMints);

  function handleInvestClick(basket: Basket) {
    setInvestBasket(basket);
    setInvestModalOpen(true);
  }

  // Load real backend baskets enriched with live on-chain token prices
  useEffect(() => {
    let active = true;
    async function loadMarketsData() {
      try {
        const fetchedBaskets = await fetchBaskets();
        if (active) {
          const orderedBaskets = orderMarketBaskets(fetchedBaskets);
          setBaskets(orderedBaskets);
          const uniqueCategories = Array.from(
            new Set(orderedBaskets.map((basket) => basket.category))
          );
          setCategories(["All", ...uniqueCategories.sort()]);
        }
      } catch (error) {
        console.warn("API unavailable, displaying catalog:", error);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadMarketsData();
    return () => {
      active = false;
    };
  }, []);

  const filteredBaskets = useMemo(() => {
    if (selectedCat === "All") return baskets;
    return baskets.filter((basket) => basket.category === selectedCat);
  }, [baskets, selectedCat]);

  return (
    <PageShell>
      <style>{GRAIN_CSS}</style>

      {/* Layout: max 1280px wide, centered, 48px vertical / 32px horizontal padding */}
      <div className="kairos-page markets-page mx-auto block w-full max-w-[1280px] px-8 py-12 space-y-5 sm:space-y-6">
        {/* Top Header Section */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-display tracking-tight text-[#E5E5E5]">
            Investment Baskets
          </h1>
          <p className="text-[#A3A3A3] text-sm sm:text-base max-w-2xl leading-relaxed">
            Diversified portfolios reflecting themes, strategies, and narratives. Invest in one click, directly to your wallet.
          </p>
        </div>

        {/* Filter Pills & View Mode Bar */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Category Filter Pills */}
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => {
              const isSelected = selectedCat === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer",
                    isSelected
                      ? "bg-[#D4D4D4] text-[#111111] font-bold shadow-sm"
                      : "border border-white/10 bg-[#1C1C1E] text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-[#262629]"
                  )}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle: Grid vs Table */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-white/10 bg-[#1C1C1E] shrink-0">
            <button
              onClick={() => setViewMode("table")}
              title="Table View"
              aria-label="Switch to table view"
              aria-pressed={viewMode === "table"}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
                viewMode === "table"
                  ? "bg-[#262629] text-[#E5E5E5]"
                  : "text-[#A3A3A3] hover:text-[#E5E5E5]"
              )}
            >
              <Rows3 className="size-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              title="Grid View"
              aria-label="Switch to grid view"
              aria-pressed={viewMode === "grid"}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
                viewMode === "grid"
                  ? "bg-[#262629] text-[#E5E5E5]"
                  : "text-[#A3A3A3] hover:text-[#E5E5E5]"
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>

        {/* Baskets Grid / Table View */}
        <div className="pt-2">
          {isLoading && baskets.length === 0 ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 auto-rows-fr">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <BasketCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-surface divide-y divide-border/40 overflow-hidden shadow-sm">
                {[1, 2, 3, 4, 5].map((i) => (
                  <BasketRowSkeleton key={i} index={i} />
                ))}
              </div>
            )
          ) : filteredBaskets.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <p className="text-foreground/70 text-sm">No baskets found under "{selectedCat}".</p>
              <button
                onClick={() => setSelectedCat("All")}
                className="text-xs text-foreground font-bold underline"
              >
                View all baskets
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 auto-rows-fr">
              {filteredBaskets.map((basket) => (
                <Link
                  key={basket.id}
                  to={`/markets/${encodeURIComponent(basket.slug)}`}
                  className="block h-full group/card no-underline"
                >
                  <GrainCard>
                    <BasketCard basket={basket} disableLink />
                  </GrainCard>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#1C1C1E] divide-y divide-white/[0.08] overflow-hidden shadow-sm">
              {filteredBaskets.map((basket, idx) => (
                <Link
                  key={basket.id}
                  to={`/markets/${encodeURIComponent(basket.slug)}`}
                  className="block group/row no-underline"
                >
                  <BasketRow
                    index={idx + 1}
                    basket={basket}
                    onInvestClick={handleInvestClick}
                    livePrices={livePrices}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Invest Modal — fires when row Invest button is clicked */}
        {investBasket && (
          <InvestModal
            basket={investBasket}
            open={investModalOpen}
            onOpenChange={(open) => {
              setInvestModalOpen(open);
              if (!open) setInvestBasket(null);
            }}
            initialAmount="50"
            onSuccess={() => {}}
          />
        )}
      </div>
    </PageShell>
  );
}
