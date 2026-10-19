import { Card as ArcCard } from "@/components/arc/card/card";
import "@/components/arc/foundation.css";
import "@/components/arc/basket-card.css";
import { Link } from "react-router-dom";
import type { Basket } from "@/lib/baskets-data";
import { HistoricalMiniChart } from "@/components/basket/HistoricalMiniChart";

export interface BasketCardProps {
  /** The human-readable name of the basket (e.g. "Nancy Pelosi Tracker") */
  basketName?: string;
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
 * 2. Title row with basket name
 * 3. Muted thesis description
 * 4. Split bottom row: constituent token avatar stack (+N) & accessible return percentage
 *
 * Styled exclusively with Tailwind CSS matching Kairos dark theme (#0A0B0D).
 */
export function BasketCard({
  basketName,
  description,
  heroImageUrl,
  tokenIcons,
  returnPercent,
  returnPeriodLabel = "Hypothetical Return",
  onTradeClick,
  onInvestClick,
  href,
  disableLink = false,
  basket,
  className = "",
}: BasketCardProps) {
  // Resolve data from direct props or fallback to basket object
  const name = basketName || basket?.name || "Untitled Basket";
  const desc = description || basket?.description || "";
  const image = heroImageUrl || basket?.imageUrl || "/baskets/solana-orb.png";

  const rawIcons =
    tokenIcons ||
    (basket?.tokens ? basket.tokens.map((t) => t.icon) : []);

  const computedReturnPct = returnPercent !== undefined
    ? (typeof returnPercent === "number" ? returnPercent : parseFloat(String(returnPercent).replace(/[+\-%]/g, "")))
    : null;

  const targetHref = disableLink
    ? undefined
    : href || (basket ? `/markets/${basket.slug || basket.id}` : undefined);

  // Visible constituent tokens (first 3) + remainder badge
  const visibleIcons = rawIcons.slice(0, 3);
  const extraCount = rawIcons.length > 3 ? rawIcons.length - 3 : 0;

  const content = (
    <div className="arc-card-theme" data-theme="dark" data-accent="green">
      <ArcCard
        title={
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="truncate">{name}</span>
          </div>
        }
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
        action={
          basket ? (
            <HistoricalMiniChart slug={basket.slug || basket.id} />
          ) : (
            <div className="kairos-card-return">
              <small>{returnPeriodLabel}</small>
              <strong className={computedReturnPct === null ? "" : computedReturnPct >= 0 ? "positive" : "negative"}>
                {computedReturnPct === null ? "—" : `${computedReturnPct >= 0 ? "+" : ""}${computedReturnPct.toFixed(2)}%`}
              </strong>
            </div>
          )
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
