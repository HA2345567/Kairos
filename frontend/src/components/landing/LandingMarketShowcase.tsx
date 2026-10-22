import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import { Link, useNavigate } from "react-router-dom";
import { BasketRow } from "@/components/basket/BasketRow";
import { TechnicalChart, type HistoricalPeriod } from "@/components/basket/TechnicalChart";
import { TokenAvatar } from "@/components/common/TokenAvatar";
import { useMarketBasketNavHistory } from "@/hooks/useBasketNavHistory";
import { useTokenPrices } from "@/hooks/useTokenPrices";
import { kairosApi } from "@/lib/api-client";
import type { Basket } from "@/lib/baskets-data";
import type { BasketMarketDataResponse, BasketMarketNavHistoryResponse } from "@/lib/api-types";
import "./landing-market-showcase.css";

const FEATURED_ORDER = [
  "solana-infrastructure",
  "solana-real-world-assets",
  "solana-sigma-basket",
  "solana-culture-memes",
  "solana-ai-compute",
  "solana-depin-infrastructure",
];

const FEATURED_TOKENS = ["BP", "JUP", "SOL", "MSOL"];

function formatPrice(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return "—";
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function curve(values: number[], summary = false) {
  const points = values.filter((value) => Number.isFinite(value) && value > 0);
  if (points.length < 2) return "";
  // A summary contains only the verified 24h start/end references, not hourly
  // observations. Keep that fallback visually restrained; the endpoint dots
  // and dashed stroke distinguish it from an observed candle sparkline.
  if (summary && points.length === 2) {
    const direction = points[1] - points[0];
    const endY = direction === 0 ? 20 : direction > 0 ? 16 : 24;
    return `M2,20 L218,${endY}`;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || Math.abs(max) * 0.001 || 1;
  const coords = points.map((value, index) => ({
    x: 2 + (index / (points.length - 1)) * 216,
    y: 38 - ((value - min) / range) * 29,
  }));
  return coords.reduce((path, point, index) => {
    if (index === 0) return `M${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    const previous = coords[index - 1];
    const beforePrevious = coords[index - 2] ?? previous;
    const next = coords[index + 1] ?? point;
    const first = {
      x: previous.x + (point.x - beforePrevious.x) / 6,
      y: previous.y + (point.y - beforePrevious.y) / 6,
    };
    const second = {
      x: point.x - (next.x - previous.x) / 6,
      y: point.y - (next.y - previous.y) / 6,
    };
    return `${path} C${first.x.toFixed(1)},${first.y.toFixed(1)} ${second.x.toFixed(1)},${second.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }, "");
}

function TokenReferenceCard({ asset, fetchedAt }: { asset: BasketMarketDataResponse["assets"][number]; fetchedAt?: string }) {
  const positive = typeof asset.change24hPct === "number" && asset.change24hPct >= 0;
  const hasChange = typeof asset.change24hPct === "number" && Number.isFinite(asset.change24hPct);
  const isSummary = asset.sparklineStatus === "summary";
  const sparklineValues = asset.sparkline24h ?? [];
  const summaryEndY = sparklineValues.length > 1 && sparklineValues[sparklineValues.length - 1] !== sparklineValues[0]
    ? sparklineValues[sparklineValues.length - 1] > sparklineValues[0] ? 16 : 24
    : 20;
  const path = curve(sparklineValues, isSummary);
  const chartColor = positive ? "#14f195" : "#ff5b65";
  const updateTime = fetchedAt ? new Date(fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const chartUnavailable = asset.sparklineStatus === "unavailable";

  return (
    <article className="landing-token-card">
      <div className="landing-token-head">
        <TokenAvatar symbol={asset.symbol} name={asset.name} size="md" />
        <div className="landing-token-title">
          <strong>{asset.symbol}</strong>
          <span>{asset.name}</span>
        </div>
        <span className={`landing-price-status ${asset.status === "live" ? "is-live" : ""}`} title={asset.reason ?? "Underlying Solana market reference; not a Devnet execution quote."}>
          <i aria-hidden="true" />
          {asset.status === "live" ? "Reference" : "Unavailable"}
        </span>
      </div>

      <div className="landing-token-price-line">
        <strong>{formatPrice(asset.priceUsd)}</strong>
        {updateTime && <time dateTime={fetchedAt}>{updateTime}</time>}
      </div>
      <div className="landing-token-details">
        <span className={hasChange ? (positive ? "is-positive" : "is-negative") : ""}>
          {hasChange ? `${positive ? "▲" : "▼"} ${Math.abs(asset.change24hPct!).toFixed(2)}%` : "24h change unavailable"}
          {hasChange && <small>24h</small>}
        </span>
        <span>Target allocation <b>{(asset.weightBps / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</b></span>
      </div>
      <div className={`landing-token-sparkline ${chartUnavailable ? "is-empty" : ""}`}>
        {path ? (
          <svg viewBox="0 0 220 44" preserveAspectRatio="none" role="img" aria-label={isSummary
            ? `${asset.symbol} 24 hour price reference endpoints; hourly candles are loading`
            : `${asset.symbol} observed 24 hour market price trend`}>
            {!isSummary && <path d={`${path} L218,44 L2,44 Z`} fill={chartColor} fillOpacity=".09" />}
            <path d={path} fill="none" stroke={chartColor} strokeWidth="1.8" strokeLinecap="round" strokeDasharray={isSummary ? "4 4" : undefined} />
            {isSummary && <><circle cx="2" cy="20" r="2" fill={chartColor} /><circle cx="218" cy={summaryEndY} r="2" fill={chartColor} /></>}
          </svg>
        ) : (
          <span>{chartUnavailable ? "Hourly history unavailable" : "Loading observed price history"}</span>
        )}
        {isSummary && <small className="landing-token-sparkline-note">24h endpoints - candles loading</small>}
      </div>
    </article>
  );
}

function LiveTokenReferences({ basket }: { basket?: Basket }) {
  const { data, isLoading, isError } = useQuery<BasketMarketDataResponse>({
    queryKey: ["basket-market-data", basket?.slug],
    queryFn: () => kairosApi.getBasketMarketData(basket!.slug),
    enabled: Boolean(basket?.slug),
    staleTime: 10_000,
    refetchInterval: (query) => Math.max(30_000, (query.state.data?.refreshAfterSec ?? 30) * 1000),
    refetchOnWindowFocus: true,
  });
  const selected = FEATURED_TOKENS.map((symbol) => data?.assets.find((asset) => asset.symbol.toUpperCase() === symbol)).filter(
    (asset): asset is BasketMarketDataResponse["assets"][number] => Boolean(asset),
  );

  return (
    <section className="landing-showcase-panel landing-token-panel" aria-labelledby="landing-token-title">
      <header className="landing-panel-heading">
        <div>
          <p className="landing-section-kicker">LIVE MARKET REFERENCES</p>
          <h3 id="landing-token-title">Basket constituents</h3>
        </div>
        {basket && <Link to={`/markets/${basket.slug}`} aria-label="View Solana Infrastructure basket">View basket <ArrowRight size={14} /></Link>}
      </header>
      <p className="landing-panel-caption">Indicative mainnet prices · refresh about every 30 seconds · separate from Devnet execution.</p>
      <div className="landing-token-grid">
        {selected.map((asset) => <TokenReferenceCard key={asset.mint} asset={asset} fetchedAt={data?.fetchedAt} />)}
        {isLoading && selected.length === 0 && FEATURED_TOKENS.map((symbol) => (
          <div className="landing-token-card landing-token-skeleton" key={symbol} aria-label={`Loading ${symbol} market reference`}><span /><span /><span /></div>
        ))}
        {!isLoading && selected.length === 0 && (
          <div className="landing-market-empty" role="status">
            {isError ? "Live token references are temporarily unavailable." : "Token market references are not available yet."}
          </div>
        )}
      </div>
    </section>
  );
}

function BasketPerformance({ basket }: { basket?: Basket }) {
  const [period, setPeriod] = useState<BasketMarketNavHistoryResponse["window"]>("1Y");
  const history = useMarketBasketNavHistory(basket?.slug, period);

  if (!basket) {
    return <section className="landing-showcase-panel landing-performance-panel"><p className="landing-section-kicker">HISTORICAL DATA</p><h3>Backtested Performance</h3><div className="landing-market-empty">Basket history is loading.</div></section>;
  }

  return (
    <section className="landing-showcase-panel landing-performance-panel" aria-label={`${basket.name} backtested performance`}>
      <TechnicalChart
        rawHistory={history.data?.history ?? []}
        isLoading={history.isLoading}
        isFetching={history.isFetching}
        isError={history.isError}
        onRetry={() => void history.refetch()}
        period={period}
        onPeriodChange={setPeriod}
        progress={history.data?.progress}
        complete={history.data?.complete}
        availableFrom={history.data?.availableFrom}
        disclaimer={history.data?.disclaimer}
        title="Backtested Performance"
      />
      <p className="landing-chart-basket-name">{basket.name}</p>
    </section>
  );
}

export function LandingMarketShowcase({ baskets }: { baskets: Basket[] }) {
  const navigate = useNavigate();
  const orderedBaskets = useMemo(() => {
    const bySlug = new Map(baskets.map((basket) => [basket.slug, basket]));
    return FEATURED_ORDER.map((slug) => bySlug.get(slug)).filter((basket): basket is Basket => Boolean(basket));
  }, [baskets]);
  const allMints = orderedBaskets.flatMap((basket) => basket.tokens.map((token) => token.priceMint ?? token.mint));
  const { prices } = useTokenPrices(allMints);
  const infrastructure = orderedBaskets.find((basket) => basket.slug === "solana-infrastructure");

  if (orderedBaskets.length === 0) return null;

  return (
    <section className="landing-market-showcase" aria-labelledby="landing-market-title">
      <div className="container landing-market-container">
        <header className="landing-market-heading">
          <div>
            <p className="landing-section-kicker">KAIROS MARKETS</p>
            <h2 id="landing-market-title">Baskets, prices & performance</h2>
            <p>Explore the Solana themes and their available market history.</p>
          </div>
          <Link to="/markets" className="landing-markets-link">All baskets <ArrowRight size={15} /></Link>
        </header>

        <section className="landing-showcase-panel landing-basket-panel" aria-labelledby="landing-basket-rank-title">
          <header className="landing-panel-heading">
            <div>
              <h3 id="landing-basket-rank-title">Featured baskets</h3>
              <p className="landing-panel-caption">1Y history where source data is available</p>
            </div>
          </header>
          <div className="landing-basket-list">
            {orderedBaskets.map((basket, index) => (
              <BasketRow
                key={basket.slug}
                basket={basket}
                index={index + 1}
                livePrices={prices}
                onInvestClick={(selectedBasket) => navigate(`/markets/${selectedBasket.slug}`)}
              />
            ))}
          </div>
        </section>

        <div className="landing-market-detail-grid">
          <LiveTokenReferences basket={infrastructure} />
          <BasketPerformance basket={infrastructure} />
        </div>
      </div>
    </section>
  );
}
