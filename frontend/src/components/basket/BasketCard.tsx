import { Card as ArcCard } from "@/components/arc/card/card";
import "@/components/arc/foundation.css";
import "@/components/arc/basket-card.css";
import { Link } from "react-router-dom";
import type { Basket } from "@/lib/baskets-data";

export interface BasketCardProps {
  /** The human-readable name of the basket (e.g. "Nancy Pelosi Tracker") */
  basketName?: string;
  /** Points multiplier label (e.g. "3x Pts") */
  pointsMultiplier?: string;
  /** Plain language summary of the basket thesis */
  description?: string;
  /** URL for the top collage / hero artwork */
  heroImageUrl?: string;
  /** Array of constituent token icon URLs */
  tokenIcons?: string[];
  /** Numeric or formatted percentage (e.g. 18.96 or "+18.96%") */
  returnPercent?: number | string;
  /** Label for the return metric (defaults to "1 Year Return") */
  returnPeriodLabel?: string;
  /** Optional handler if card is directly actioned */
  onTradeClick?: () => void;
  /** Optional handler for invest modal */
  onInvestClick?: (basket: Basket) => void;
  /** Optional href / route link (defaults to /markets/:id when basket provided) */
  href?: string;
  /** Optional flag to disable inner Link wrapper when card is wrapped externally */
  disableLink?: boolean;
  /** Optional integration with Kairos Basket catalog object */
  basket?: Basket;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * BasketCard Component (Kairos)
 *
 * Implements the editorial narrative basket card with:
 * 1. Top collage artwork with dark bottom vignette
 * 2. Title row with basket name and purple points multiplier pill
 * 3. Muted thesis description
 * 4. Split bottom row: constituent token avatar stack (+N) & accessible return percentage
 *
 * Styled exclusively with Tailwind CSS matching Kairos dark theme (#0A0B0D).
 */
import { useBasketNavHistory } from "@/hooks/useBasketNavHistory";

export function BasketCard({
  basketName,
  pointsMultiplier,
  description,
  heroImageUrl,
  tokenIcons,
  returnPercent,
  returnPeriodLabel = "All Time Return",
  onTradeClick,
  onInvestClick,
  href,
  disableLink = false,
  basket,
  className = "",
}: BasketCardProps) {
  const { data: navSummary, isLoading: isNavLoading } = useBasketNavHistory(basket?.id);

  // Resolve data from direct props or fallback to basket object
  const name = basketName || basket?.name || "Untitled Basket";
  const points = pointsMultiplier || basket?.pointsMultiplier || "3x Pts";
  const desc = description || basket?.description || "";
  const image = heroImageUrl || basket?.imageUrl || "/baskets/solana-orb.png";

  const rawIcons =
    tokenIcons ||
    (basket?.tokens ? basket.tokens.map((t) => t.icon) : []);

  // Compute real return from backend NAV history
  const hasRealNav = Boolean(navSummary && navSummary.history && navSummary.history.length > 0);
  const computedReturnPct = returnPercent !== undefined 
    ? (typeof returnPercent === "number" ? returnPercent : parseFloat(String(returnPercent).replace(/[+\-%]/g, "")))
    : (hasRealNav ? navSummary!.allTimeReturnPct : null);

  const hasReturnData = computedReturnPct !== null;
  const isPositive = computedReturnPct !== null ? computedReturnPct >= 0 : true;
  const returnString = computedReturnPct !== null
    ? `${computedReturnPct >= 0 ? "+" : ""}${computedReturnPct.toFixed(2)}%`
    : null;

  const returnAriaLabel = returnString
    ? `${isPositive ? "up" : "down"} ${returnString.replace(/[+\-%]/g, "").trim()} percent`
    : "no data yet";

  const targetHref = disableLink
    ? undefined
    : href || (basket ? `/markets/${basket.slug || basket.id}` : undefined);

  // Visible constituent tokens (first 3) + remainder badge
  const visibleIcons = rawIcons.slice(0, 3);
  const extraCount = rawIcons.length > 3 ? rawIcons.length - 3 : 0;

  const content = (
    <div className="arc-card-theme" data-theme="dark" data-accent="green">
      <ArcCard
        title={name}
        description={desc}
        media={
          <img
            src={image}
            alt={`${name} basket artwork`}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        }
        avatar={
          visibleIcons.length > 0 ? (
            <div className="kairos-token-stack" aria-label="Constituent tokens">
              {visibleIcons.map((icon, idx) => (
                <img
                  key={idx}
                  src={icon}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ))}
              {extraCount > 0 && <span>+{extraCount}</span>}
            </div>
          ) : null
        }
        meta={points ? <span className="kairos-card-points">{points}</span> : null}
        action={
          <div className="kairos-card-return">
            <small>{returnPeriodLabel}</small>
            {isNavLoading ? (
              <span className="inline-block h-3 w-12 animate-pulse rounded bg-white/10" />
            ) : hasReturnData ? (
              <strong className={isPositive ? "positive" : "negative"} aria-label={returnAriaLabel}>
                {returnString}
              </strong>
            ) : (
              <small>No data yet</small>
            )}
          </div>
        }
        onClick={() => onTradeClick?.()}
        className={`kairos-market-card ${className}`}
      />
    </div>
  );

  if (targetHref) {
    return (
      <Link to={targetHref} className="block h-full w-full no-underline">
        {content}
      </Link>
    );
  }

  return content;
}

export default BasketCard;

/* =========================================================================
   Sample Usage & Preview Data
   =========================================================================
   Example 1 (Props driven — e.g. Nancy Pelosi Tracker):
   ```tsx
   <BasketCard
     basketName="Nancy Pelosi Tracker"
     pointsMultiplier="3x Pts"
     description="Nancy Pelosi's disclosed stock book on Solana, rebalanced every time a new STOCK Act filing drops."
     heroImageUrl="/baskets/pelosi.png"
     tokenIcons={["/tokens/sol.png", "/tokens/ray.png", "/tokens/jup.png", "/tokens/pyth.svg"]}
     returnPercent="+18.96%"
     returnPeriodLabel="1 Year Return"
   />
   ```

   Example 2 (Catalog object driven):
   ```tsx
   <BasketCard basket={CURATED_BASKETS[0]} />
   ```
*/
