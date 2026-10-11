import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { BasketCard } from "@/components/basket/BasketCard";
import { BasketRow } from "@/components/basket/BasketRow";
import { BasketCardSkeleton, BasketRowSkeleton } from "@/components/basket/BasketSkeleton";
import { InvestModal } from "@/components/basket/InvestModal";
import { Link } from "react-router-dom";
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import "./market.css";
import { kairosApi } from "@/lib/api-client";
import { Basket } from "@/lib/api-types";

import { useTokenPrices } from "@/hooks/useTokenPrices";
import { useAllBasketsNav } from "@/hooks/useAllBasketsNav";

const CATEGORIES = ["All"]; // Will be populated dynamically

export default function Market() {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [selectedCat, setSelectedCat] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isLoading, setIsLoading] = useState(true);
  const [investBasket, setInvestBasket] = useState<Basket | null>(null);
  const [investModalOpen, setInvestModalOpen] = useState(false);

  // Aggregate all unique token mints for real-time DexScreener/Jupiter price updates
  const allConstituentMints = useMemo(() => {
    return Array.from(
      new Set(baskets.flatMap((b) => b.tokens.map((t) => t.priceMint || t.mint)))
    );
  }, [baskets]);
  const { prices: livePrices } = useTokenPrices(allConstituentMints);

  // Live NAV map from the Kairos backend (polled every 60s) — powers the hero status badge
  const { data: navMap } = useAllBasketsNav();
  const liveNavCount = useMemo(() => {
    if (!navMap) return null; // still syncing
    return Object.values(navMap).filter(Boolean).length;
  }, [navMap]);

  function handleInvestClick(basket: Basket) {
    setInvestBasket(basket);
    setInvestModalOpen(true);
  }

  // Initial smooth mount skeleton
  useEffect(() => {
    async function loadMarketData() {
      try {
        setIsLoading(true);
        const response = await kairosApi.getBaskets();
        const fetchedBaskets = response.baskets as Basket[];
        setBaskets(fetchedBaskets);

        // Extract unique categories
        const uniqueCategories = Array.from(
          new Set(fetchedBaskets.map(basket => basket.category))
        );
        setCategories(["All", ...uniqueCategories.sort()]);
      } catch (error) {
        console.error("Failed to fetch market data:", error);
        setBaskets([]);
        setCategories(["All"]);
      } finally {
        setIsLoading(false);
      }
    }

    loadMarketData();
  }, []);

  const filteredBaskets = useMemo(() => {
    if (selectedCat === "All") return baskets;
    return baskets.filter(basket => basket.category === selectedCat);
  }, [baskets, selectedCat]);

  return (
    <PageShell>
      <div className="market-page space-y-5 sm:space-y-6">
        {/* Hero Section (Cesto layout: large display title + supporting copy) */}
        <header className="space-y-2.5">
          <h1 className="text-4xl sm:text-5xl font-display tracking-tight text-foreground">
            Investment Baskets
          </h1>
          <p className="text-foreground/70 text-sm sm:text-base max-w-2xl leading-relaxed">
            Diversified portfolios reflecting themes, strategies, and narratives. Invest in one
            click, directly to your wallet.
          </p>

          {/* Live backend status — Kairos NAV feed, polled every 60s */}
          <p className="flex items-center gap-1.5 pt-0.5 text-[11px] font-mono text-text-muted">
            {liveNavCount === null ? (
              <>
                <span
                  className="size-1.5 rounded-full bg-foreground/30 animate-pulse"
                  aria-hidden="true"
                />
                Syncing live NAV…
              </>
            ) : liveNavCount > 0 ? (
              <>
                <span
                  className="size-1.5 rounded-full bg-emerald-400 animate-pulse"
                  aria-hidden="true"
                />
                Live NAV · {liveNavCount} basket{liveNavCount === 1 ? "" : "s"} reporting
              </>
            ) : (
              <>
                <span
                  className="size-1.5 rounded-full bg-foreground/30 animate-pulse"
                  aria-hidden="true"
                />
                Live NAV · awaiting first sync
              </>
            )}
          </p>
        </header>

        {/* Filter Pills & View Mode Toggle Bar */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Category Filter Pills — horizontally scrollable on small screens */}
          <div className="market-filters flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => {
              const isSelected = selectedCat === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  aria-pressed={isSelected}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer",
                    FOCUS_RING,
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "border border-border bg-surface text-foreground/70 hover:text-foreground hover:bg-surface-elevated hover:border-border-strong"
                  )}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle: Table (Rows3) vs Grid (LayoutGrid) */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl border border-border bg-surface shrink-0"
            role="group"
            aria-label="View mode"
          >
            <button
              onClick={() => setViewMode("table")}
              title="Table View"
              aria-label="Switch to table view"
              aria-pressed={viewMode === "table"}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
                FOCUS_RING,
                viewMode === "table"
                  ? "bg-surface-elevated text-foreground"
                  : "text-foreground/50 hover:text-foreground"
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
                FOCUS_RING,
                viewMode === "grid"
                  ? "bg-surface-elevated text-foreground"
                  : "text-foreground/50 hover:text-foreground"
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
                className={cn(
                  "rounded-md text-xs text-foreground font-bold underline underline-offset-4 hover:opacity-80 transition-opacity cursor-pointer",
                  FOCUS_RING
                )}
              >
                View all baskets
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 auto-rows-fr">
              {filteredBaskets.map((basket) => (
                <Link
                  key={basket.id}
                  to={`/markets/${basket.id}`}
                  className={cn(
                    "market-card-link block h-full rounded-2xl no-underline group/card",
                    FOCUS_RING
                  )}
                >
                  <BasketCard basket={basket} disableLink />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface divide-y divide-border-subtle overflow-hidden shadow-sm">
              {filteredBaskets.map((basket, idx) => (
                <Link
                  key={basket.id}
                  to={`/markets/${basket.id}`}
                  className={cn("block no-underline group/row", FOCUS_RING)}
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

        {/* Invest Modal — fires when a row Invest button is clicked */}
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