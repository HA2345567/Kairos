import { useMemo, useState, useEffect } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { CURATED_BASKETS, Basket } from "@/lib/baskets-data";
import { BasketCard } from "@/components/basket/BasketCard";
import { BasketRow } from "@/components/basket/BasketRow";
import { BasketCardSkeleton, BasketRowSkeleton } from "@/components/basket/BasketSkeleton";
import { InvestModal } from "@/components/basket/InvestModal";
import { Link } from "react-router-dom";
import { LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import "./cesto.css";

const CATEGORIES = ["All", ...Array.from(new Set(CURATED_BASKETS.map((b) => b.category)))];

export default function Markets() {
  const [selectedCat, setSelectedCat] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isLoading, setIsLoading] = useState(true);
  const [investBasket, setInvestBasket] = useState<Basket | null>(null);
  const [investModalOpen, setInvestModalOpen] = useState(false);

  function handleInvestClick(basket: Basket) {
    setInvestBasket(basket);
    setInvestModalOpen(true);
  }

  // Initial smooth mount skeleton
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 250);
    return () => clearTimeout(timer);
  }, []);

  const filteredBaskets = useMemo(() => {
    return CURATED_BASKETS.filter((b) => {
      if (selectedCat === "All") return true;
      return b.category === selectedCat;
    });
  }, [selectedCat]);

  return (
    <PageShell>
      <div className="cesto-page markets-page space-y-5 sm:space-y-6">
        {/* Top Header Section */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-display tracking-tight text-foreground">
            Investment Baskets
          </h1>
          <p className="text-foreground/75 text-sm sm:text-base max-w-2xl leading-relaxed">
            Diversified portfolios reflecting themes, strategies, and narratives. Invest in one click, directly to your wallet.
          </p>
        </div>

        {/* Filter Pills & View Mode Bar (Matches Cesto Screenshot) */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Category Filter Pills */}
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCat === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer",
                    isSelected
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "border border-border/40 bg-surface text-foreground/75 hover:text-foreground hover:bg-surface-elevated"
                  )}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle: Grid vs Table (Matches Cesto Screenshot) */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-surface shrink-0">
            <button
              onClick={() => setViewMode("table")}
              title="Table View"
              aria-label="Switch to table view"
              aria-pressed={viewMode === "table"}
              className={cn(
                "p-1.5 rounded-lg transition-colors cursor-pointer",
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
          {isLoading ? (
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
                  to={`/markets/${basket.id}`}
                  className="block h-full group/card no-underline"
                >
                  <BasketCard
                    basket={basket}
                    disableLink
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface divide-y divide-border-subtle overflow-hidden shadow-sm">
              {filteredBaskets.map((basket, idx) => (
                <Link
                  key={basket.id}
                  to={`/markets/${basket.id}`}
                  className="block group/row no-underline"
                >
                  <BasketRow
                    index={idx + 1}
                    basket={basket}
                    onInvestClick={handleInvestClick}
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
