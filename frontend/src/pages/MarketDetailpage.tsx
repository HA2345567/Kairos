import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import Copy from "lucide-react/dist/esm/icons/copy";
import Info from "lucide-react/dist/esm/icons/info";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import Send from "lucide-react/dist/esm/icons/send";
import Share2 from "lucide-react/dist/esm/icons/share-2";
import TrendingUp from "lucide-react/dist/esm/icons/trending-up";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import X from "lucide-react/dist/esm/icons/x";
import { useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

import { Header } from "@/components/layout/Header";
import { InvestModal } from "@/components/basket/InvestModal";
import { useKairosWallet } from "@/components/wallet/useKairosWallet";
import { MarketDetailSkeleton } from "@/components/basket/BasketSkeleton";
import { TechnicalChart } from "@/components/basket/TechnicalChart";
import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import { TokenAvatar } from "@/components/common/TokenAvatar";
import { useMarketBasketNavHistory } from "@/hooks/useBasketNavHistory";
import { useTokenPrices } from "@/hooks/useTokenPrices";
import { useBasket, useBaskets, type Basket, type BasketToken } from "@/lib/baskets-data";
import { kairosApi } from "@/lib/api-client";
import type { BasketMarketNavHistoryResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import "./style.css";

/* ────────────────────────────────────────────────────────────────────────── */
/* Constants & types                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

type Tab = "About" | "Historical" | "Rebalances" | "Risk" | "Resources";
const tabs: Tab[] = ["About", "Historical", "Rebalances", "Risk", "Resources"];

const donutColors = [
  "#38bdf8",
  "#f43f5e",
  "#a855f7",
  "#10b981",
  "#fbbf24",
  "#34d399",
  "#06b6d4",
  "#6366f1",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

// Devnet USDC mint — defined once outside the component
const EMPTY_TOKENS: BasketToken[] = [];

interface NavPoint {
  timestamp: number;
  navValue: number;
}

interface PositionItem {
  action: string;
  basketName: string;
  basketId: string;
  amountUsdc: number;
  tokensDescription: string;
  txSignature: string;
  timestamp?: string;
}

// TODO: replace with live benchmark data. These are STATIC reference values
// and are labelled as such in the UI so they are never mistaken for live data.
const SOL_BENCHMARK = { r1w: 5.2, r1m: 18.4, r1y: 94.2, maxDrawdown: -28.1, sharpe: 1.62 };
const BTC_BENCHMARK = { r1w: 2.1, r1m: 11.6, r1y: 62.8, maxDrawdown: -22.5, sharpe: 1.38 };

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function fmtWeight(bps: number) {
  const v = bps / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

function fmtPrice(p: number | undefined) {
  if (!isNum(p)) return "—";
  if (p >= 1) {
    return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function fmtPct(n: number | undefined, digits = 1) {
  if (!isNum(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

const tone = (n: number | undefined) =>
  !isNum(n) ? "text-muted-foreground" : n >= 0 ? "text-emerald-400" : "text-rose-400";

/** Floors to 2 decimals so "Max" never exceeds the real wallet balance. */
const floor2 = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);

function readLocalPositions(key: string): PositionItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeNavStats(history: NavPoint[]) {
  if (history.length < 2) return null;
  let peak = history[0].navValue;
  let maxDrawdown = 0;
  const returns: number[] = [];

  for (let i = 0; i < history.length; i++) {
    const v = history[i].navValue;
    if (v > peak) peak = v;
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, ((v - peak) / peak) * 100);
    if (i > 0 && history[i - 1].navValue > 0) {
      returns.push(v / history[i - 1].navValue - 1);
    }
  }

  let sharpe: number | null = null;
  if (returns.length > 1) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : null; // assumes daily points
  }
  return { maxDrawdown, sharpe };
}

function exportCsv(basket: Basket, history: NavPoint[]) {
  if (!history || history.length === 0) {
    toast.error("No historical records available to export.");
    return;
  }
  const headers = "Date,NAV_USD,Cumulative_Return_Pct\n";
  const startNav = history[0].navValue;
  const rows = history
    .map((pt) => {
      const dateStr = new Date(pt.timestamp).toISOString().split("T")[0];
      const retPct = startNav > 0 ? (((pt.navValue - startNav) / startNav) * 100).toFixed(2) : "0.00";
      return `${dateStr},${pt.navValue.toFixed(4)},${retPct}%`;
    })
    .join("\n");

  const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${basket.slug || basket.id}-nav-history.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success("Historical NAV CSV exported!");
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function BacktestedPerformance({ basket }: { basket: Basket }) {
  const [period, setPeriod] = useState<BasketMarketNavHistoryResponse["window"]>("1Y");
  const { data, isLoading, isFetching, isError, refetch } = useMarketBasketNavHistory(basket.slug, period);
  return (
    <TechnicalChart
      rawHistory={data?.history || []}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => void refetch()}
      period={period}
      onPeriodChange={setPeriod}
      progress={data?.progress}
      complete={data?.complete}
      availableFrom={data?.availableFrom}
      disclaimer={data?.disclaimer}
      title="Backtested Performance"
    />
  );
}

function PerformanceChart({ basket, mobile = false }: { basket: Basket; mobile?: boolean }) {
  const [period, setPeriod] = useState<BasketMarketNavHistoryResponse["window"]>("1Y");
  const { data: navSummary, isLoading, isFetching, isError, refetch } = useMarketBasketNavHistory(basket.slug, period);
  return (
    <TechnicalChart
      rawHistory={navSummary?.history || []}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => void refetch()}
      mobile={mobile}
      period={period}
      onPeriodChange={setPeriod}
      progress={navSummary?.progress}
      complete={navSummary?.complete}
      availableFrom={navSummary?.availableFrom}
      disclaimer={navSummary?.disclaimer}
    />
  );
}

function MarketSparkline({ values, color, status }: { values: number[] | null | undefined; color: string; status: "loading" | "ready" | "stale" | "summary" | "unavailable" }) {
  const points = (values ?? []).filter((value) => Number.isFinite(value));
  if (points.length < 2) {
    if (status === "unavailable") return null;
    return (
      <div className="market-sparkline-placeholder" aria-label={status === "loading" ? "Loading 24 hour price chart" : "24 hour chart unavailable"}>
        <span>{status === "loading" ? "Loading 24H trend" : "24H trend unavailable"}</span>
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || Math.abs(max) * 0.001 || 1;
  const coords = points.map((value, index) => ({
    x: (index / (points.length - 1)) * 220,
    y: 36 - ((value - min) / range) * 28,
  }));
  const line = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L220,44 L0,44 Z`;

  return (
    <svg className="market-sparkline" viewBox="0 0 220 44" preserveAspectRatio="none" role="img" aria-label={status === "summary" ? "24 hour starting and current price reference; hourly candles are loading" : status === "stale" ? "Cached 24 hour price trend; updating" : "24 hour price trend"}>
      <defs>
        <linearGradient id={`market-gradient-${color.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0.015" />
        </linearGradient>
      </defs>
      {status === "summary" && <title>24H start-to-current reference. Replaced by hourly market candles when available.</title>}
      {status === "stale" && <title>Cached 24H market candles. Refreshing.</title>}
      <path d={area} fill={`url(#market-gradient-${color.replace("#", "")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Allocation({ tokens, basket }: { tokens: BasketToken[]; basket: Basket }) {
  const [copied, setCopied] = useState<string | null>(null);
  const marketPriceMints = useMemo(
    () => Array.from(new Set(tokens.map((token) => token.priceMint).filter((mint): mint is string => Boolean(mint)))),
    [tokens],
  );
  const { prices: fallbackPrices } = useTokenPrices(marketPriceMints);
  const { data: marketData, isLoading: marketLoading, isError: marketError, dataUpdatedAt } = useQuery({
    queryKey: ["basket-market-data", basket.slug],
    queryFn: () => kairosApi.getBasketMarketData(basket.slug),
    enabled: Boolean(basket.slug),
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
  const marketByMint = useMemo(() => new Map((marketData?.assets ?? []).map((asset) => [asset.mint, asset])), [marketData]);
  const marketDataCurrent = Boolean(marketData && Date.now() - Date.parse(marketData.fetchedAt) < 2 * 60_000);
  const hasLiveData = marketDataCurrent && (marketData?.coverage.available ?? 0) > 0;

  async function copy(symbol: string, shortAddress: string, full: string) {
    if (!full) return;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(symbol);
      toast.success(`Copied mint address: ${shortAddress}`);
      window.setTimeout(() => setCopied((c) => (c === symbol ? null : c)), 1800);
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  const donutData = useMemo(
    () =>
      tokens.map((token, i) => ({
        key: token.symbol,
        label: token.name || token.symbol,
        value: token.weightBps / 100,
        color: donutColors[i % donutColors.length],
      })),
    [tokens]
  );

  return (
    <div className="allocation panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2>Allocation</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Target weights across {tokens.length} basket assets. Market prices reference their mainnet assets; basket execution mints remain environment-specific.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {marketLoading && !marketData ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading market data</div>
          ) : hasLiveData && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-surface-muted/80 border border-border/80 text-foreground backdrop-blur-sm">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              MARKET REF · {marketData?.coverage.available}/{marketData?.coverage.total}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs font-mono font-medium px-3 py-1 rounded-full bg-surface-muted/80 border border-border/80 text-foreground w-fit backdrop-blur-sm">
            <TrendingUp className="h-3.5 w-3.5 text-foreground" />
            <span>100% Target Weight</span>
          </div>
        </div>
      </div>

      <div className="allocation-visual py-4 flex items-center justify-center">
        <DonutChart
          data={donutData}
          label="Constituent Token Allocation"
          unit="%"
          formatValue={(val) => `${Number.isInteger(val) ? val : val.toFixed(1)}%`}
          totalLabel="Target"
          size={240}
          thickness={28}
          legend={true}
          legendAction="toggle"
          className="market-allocation-chart w-full max-w-xl mx-auto"
        />
      </div>

      <div className="holdings">
        {tokens.map((h) => {
          const market = marketByMint.get(h.mint);
          const fallbackPrice = h.priceMint ? fallbackPrices[h.priceMint] : undefined;
          const useMarket = market?.status === "live" && isNum(market.priceUsd) && (marketDataCurrent || fallbackPrice?.status !== "current");
          const priceUsd = useMarket ? market?.priceUsd : fallbackPrice?.priceUsd;
          const change24h = useMarket ? market?.change24hPct : fallbackPrice?.change24h ?? null;
          const isCurrent = isNum(priceUsd) && (useMarket ? marketDataCurrent : fallbackPrice?.status === "current");
          const priceSource = useMarket ? "GeckoTerminal" : fallbackPrice?.source;
          const priceAsOf = useMarket ? marketData?.fetchedAt : fallbackPrice?.asOf;

          const shortAddress = h.mint ? `${h.mint.slice(0, 4)}...${h.mint.slice(-4)}` : "Solana";
          const hasChange = isNum(change24h);
          const isUp = hasChange && change24h >= 0;
          const absPct = hasChange ? Math.abs(change24h) : null;
          const dollarChange = hasChange && isNum(priceUsd) ? Math.abs((priceUsd * change24h) / 100) : null;
          const formattedDollarChange = dollarChange === null ? null : dollarChange < 0.01 ? dollarChange.toFixed(4) : dollarChange.toFixed(2);

          return (
            <article className="holding" key={h.symbol}>
              <div className="holding-top">
                <TokenAvatar symbol={h.symbol} src={h.icon} name={h.name} size="md" />
                <div className="holding-name">
                  <strong className="flex items-center gap-1.5">
                    {h.symbol}
                    {isCurrent && (
                  <span className="size-1.5 rounded-full bg-[#8f8f8f] animate-pulse" title="Current underlying market reference" />
                    )}
                  </strong>
                  <span>{h.name}</span>
                </div>
                <button
                  type="button"
                  className="address"
                  title={h.mint ? `Copy ${h.mint}` : "No mint address"}
                  disabled={!h.mint}
                  onClick={() => copy(h.symbol, shortAddress, h.mint)}
                >
                  <span>{shortAddress}</span>
                  {copied === h.symbol ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>

              <div className={`holding-data ${hasChange ? (isUp ? "up" : "down") : "unavailable"}`}>
                <div className="holding-price">
                  {fmtPrice(priceUsd)} <Info size={13} />
                </div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                  {isNum(priceUsd) ? `${priceSource} · ${isCurrent ? "current" : "stale"} underlying reference${priceAsOf ? ` · ${new Date(priceAsOf).toLocaleTimeString()}` : ""}` : marketLoading ? "Loading market price" : market?.reason ?? (marketError ? "Market data unavailable" : "No public market feed")}
                </span>

                <div className={`holding-change ${!hasChange ? "unavailable" : ""}`}>
                  {hasChange ? <><span>{isUp ? "▲" : "▼"}</span> ${formattedDollarChange} ({absPct!.toFixed(2)}%) <span>24H</span></> : <span>24H change unavailable</span>}
                </div>

                <div className="holding-bottom">
                  <span>ALLOCATION</span>
                  <b>{fmtWeight(h.weightBps)}</b>
                </div>

                <MarketSparkline
                  values={market?.sparkline24h ?? (fallbackPrice && isNum(fallbackPrice.change24h) && isNum(priceUsd)
                    ? [priceUsd / (1 + fallbackPrice.change24h / 100), priceUsd]
                    : null)}
                  color={isUp ? "#22c55e" : "#ef4444"}
                  status={marketLoading && !market ? "loading" : market?.sparklineStatus ?? (fallbackPrice ? "summary" : "unavailable")}
                />

                {isNum(change24h) && <span className="sr-only">Live reference 24 hour change is {change24h.toFixed(2)} percent.</span>}
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Prices reference corresponding Solana mainnet pools via GeckoTerminal or DEX Screener. A start-to-current reference is shown until hourly candles arrive{dataUpdatedAt ? ` · updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}. Devnet tokens use these as underlying references; they do not feed execution quotes or verified NAV history.
        {marketError ? " Market data is temporarily unavailable." : ""}
      </p>
    </div>
  );
}

function Rebalances({ basket }: { basket: Basket }) {
  const [open, setOpen] = useState(0);
  const [mode, setMode] = useState<"Rebalances" | "Markers">("Rebalances");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["basket-versions", basket.id],
    queryFn: () => kairosApi.getBasketRebalances(basket.slug),
    enabled: Boolean(basket.slug),
  });
  const versions = data?.versions ?? [];

  return (
    <div className="panel rebalances">
      <div className="section-heading">
        <div>
          <h2>Published versions</h2>
          <p>Immutable basket versions and their target allocations.</p>
        </div>
        <div className="mini-segments">
          {(["Rebalances", "Markers"] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? "selected" : ""} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === "Markers" ? (
        <div className="marker-list">
          {versions.map((version) => (
            <div key={version.id}>
              <span className="marker-dot" />
              <div>
                <strong>{version.changelog}</strong>
                <small>v{version.version} · {new Date(version.publishedAt).toLocaleDateString()}</small>
              </div>
            </div>
          ))}
          {!isLoading && versions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No published versions yet.</p>}
        </div>
      ) : (
        <div className="rebalance-list">
          {isLoading && <p className="py-6 text-sm text-muted-foreground">Loading published versions…</p>}
          {isError && <p className="py-6 text-sm text-muted-foreground">Version history is currently unavailable.</p>}
          {!isLoading && !isError && versions.length === 0 && <p className="py-6 text-sm text-muted-foreground">No published basket versions yet.</p>}
          {versions.map((version, i) => (
            <div className="rebalance-item" key={version.id}>
              <button
                type="button"
                className="rebalance-trigger"
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? -1 : i)}
              >
                <span>
                  <strong>{version.changelog}</strong>
                  <small>v{version.version}</small>
                </span>
                <span>
                  {new Date(version.publishedAt).toLocaleDateString()}
                  <ChevronDown size={15} className={open === i ? "rotate" : ""} />
                </span>
              </button>
              {open === i && (
                <div className="rebalance-detail">
                  <p>Published by {version.publishedBy}</p>
                  {version.registryTx ? (
                    <a className="inline-flex items-center gap-1 text-xs text-emerald-700 underline" href={`https://explorer.solana.com/tx/${version.registryTx}?cluster=devnet`} target="_blank" rel="noreferrer">
                      Verified on Solana devnet <ArrowUpRight size={13} />
                    </a>
                  ) : <p className="text-xs text-muted-foreground">No on-chain registry proof is recorded for this version.</p>}
                  <div className="rebalance-changes">
                    {version.legs.map((leg) => (
                      <div key={leg.mint}>
                        <span>{`${leg.mint.slice(0, 4)}…${leg.mint.slice(-4)}`}</span>
                        <span><b>{fmtWeight(leg.weightBps)}</b></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextContent({ basket, kind }: { basket: Basket; kind: "Risk" | "Resources" }) {
  const chars = basket.aboutStrategy?.characteristics || [
    "Zero Liquidation Risk (Spot-Only) — All constituent positions are spot tokens held directly in your wallet without margin, borrowing, or liquidation thresholds.",
    "Non-Custodial Delivery — Kairos never holds user funds. Swaps execute via Jupiter aggregator straight into your wallet's Associated Token Accounts.",
    "Thematic Diversification — Pre-balanced allocation prevents single-token concentration drag.",
  ];

  const risks = basket.aboutStrategy?.risks || [
    "Crypto Market Volatility — Digital assets fluctuate in value based on market sentiment, macro liquidity, and network conditions.",
    "Smart Contract & Execution Risk — Swaps execute via decentralized Jupiter routing, subject to pool depth and slippage.",
    "Underlying Protocol Risk — Constituent projects operate autonomous on-chain programs and tokenomics.",
  ];

  return (
    <div className="panel text-content">
      {kind === "Risk" ? (
        <>
          <h2>{basket.name}</h2>
          <h3>Key Characteristics</h3>
          <ul>
            {chars.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h3>Risk Factors</h3>
          <ul>
            {risks.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <h3>Non-Custodial Delivery</h3>
          <p>
            When you invest, USDC is routed via Jupiter swaps directly into constituent tokens in your Associated
            Token Accounts (ATAs). Kairos holds zero custody of your assets.
          </p>
          <p>Not financial advice. Curated for thematic ecosystem exposure based on verified on-chain traction.</p>
        </>
      ) : (
        <>
          <h2>Thesis &amp; Methodology</h2>
          <p>
            {basket.aboutStrategy?.thesis ||
              `${basket.name} captures the premier leaders within the Solana ecosystem, selecting protocols with verified liquidity and traction.`}
          </p>
          <p>
            Holdings are evaluated continuously and rebalanced to locked weights, allowing users to compound returns
            across the entire narrative with a single click.
          </p>
          <h3>Verified On-Chain Data Sources</h3>
          <p>
            Solana Blockchain Explorer &amp; Solscan
            <br />
            Jupiter Aggregator Price &amp; Routing API
            <br />
            DefiLlama Protocol Revenue &amp; TVL Analytics
          </p>
        </>
      )}
    </div>
  );
}

function HistoricalTabContent({ basket }: { basket: Basket }) {
  const { data: navSummary, isLoading } = useMarketBasketNavHistory(basket.slug, "1Y");
  const history: NavPoint[] = useMemo(() => navSummary?.history || [], [navSummary]);
  const startNav = history[0]?.navValue || 0;

  // Most recent 14 records, newest first. Daily change is computed against the
  // true previous point in the FULL history (so the oldest visible row is correct too).
  const recentRecords = useMemo(() => {
    if (!history.length) return [];
    const startIdx = Math.max(0, history.length - 14);
    const rows = [];
    for (let i = history.length - 1; i >= startIdx; i--) {
      const pt = history[i];
      const prev = i > 0 ? history[i - 1].navValue : pt.navValue;
      rows.push({
        key: pt.timestamp,
        dateStr: new Date(pt.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        navValue: pt.navValue,
        dayChangePct: prev > 0 ? ((pt.navValue - prev) / prev) * 100 : 0,
        cumReturnPct: startNav > 0 ? ((pt.navValue - startNav) / startNav) * 100 : 0,
      });
    }
    return rows;
  }, [history, startNav]);

  const stats = useMemo(() => computeNavStats(history), [history]);
  const alphaVsSol = history.length > 1
    ? ((history[history.length - 1].navValue / history[0].navValue - 1) * 100) - SOL_BENCHMARK.r1y
    : undefined;
  const historicalReturn = (days: number) => {
    if (history.length < 2) return undefined;
    const latest = history[history.length - 1];
    const cutoff = latest.timestamp - days * 86_400_000;
    const baseline = history.find((point) => point.timestamp >= cutoff) ?? history[0];
    return baseline.navValue > 0 ? ((latest.navValue / baseline.navValue) - 1) * 100 : undefined;
  };

  return (
    <div className="space-y-6">
      <PerformanceChart basket={basket} />

      {/* Benchmark & Alpha */}
      <div className="panel p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Benchmark Performance Comparison</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Relative alpha against Solana (SOL) and Bitcoin (BTC). SOL/BTC figures are static reference values.
            </p>
          </div>
          {isNum(alphaVsSol) && (
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full border font-bold w-fit",
                alphaVsSol >= 0
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              )}
            >
              <TrendingUp size={13} />
              {fmtPct(alphaVsSol)} Alpha vs SOL (1Y)
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2.5 px-3">Asset</th>
                <th className="py-2.5 px-3">1W Return</th>
                <th className="py-2.5 px-3">1M Return</th>
                <th className="py-2.5 px-3">1Y Return</th>
                <th className="py-2.5 px-3">Max Drawdown</th>
                <th className="py-2.5 px-3">Sharpe (est.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr className="bg-surface/50 font-bold text-foreground">
                <td className="py-3 px-3 flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  {basket.name} (Basket)
                </td>
                <td className={cn("py-3 px-3", tone(historicalReturn(7)))}>{fmtPct(historicalReturn(7))}</td>
                <td className={cn("py-3 px-3", tone(historicalReturn(30)))}>{fmtPct(historicalReturn(30))}</td>
                <td className={cn("py-3 px-3", tone(historicalReturn(365)))}>{fmtPct(historicalReturn(365))}</td>
                <td className="py-3 px-3 text-rose-400">{stats ? `${stats.maxDrawdown.toFixed(1)}%` : "—"}</td>
                <td className="py-3 px-3 text-foreground font-bold">
                  {stats?.sharpe != null ? stats.sharpe.toFixed(2) : "—"}
                </td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-3 px-3 flex items-center gap-2">
                  <img
                    src="/tokens/sol.png"
                    alt="SOL"
                    className="size-4 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  Solana (SOL Benchmark)
                </td>
                <td className={cn("py-3 px-3", tone(SOL_BENCHMARK.r1w))}>{fmtPct(SOL_BENCHMARK.r1w)}</td>
                <td className={cn("py-3 px-3", tone(SOL_BENCHMARK.r1m))}>{fmtPct(SOL_BENCHMARK.r1m)}</td>
                <td className={cn("py-3 px-3", tone(SOL_BENCHMARK.r1y))}>{fmtPct(SOL_BENCHMARK.r1y)}</td>
                <td className="py-3 px-3 text-rose-400">{SOL_BENCHMARK.maxDrawdown.toFixed(1)}%</td>
                <td className="py-3 px-3">{SOL_BENCHMARK.sharpe.toFixed(2)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-3 px-3 flex items-center gap-2">
                  <span className="size-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[9px]">
                    ₿
                  </span>
                  Bitcoin (BTC Reference)
                </td>
                <td className={cn("py-3 px-3", tone(BTC_BENCHMARK.r1w))}>{fmtPct(BTC_BENCHMARK.r1w)}</td>
                <td className={cn("py-3 px-3", tone(BTC_BENCHMARK.r1m))}>{fmtPct(BTC_BENCHMARK.r1m)}</td>
                <td className={cn("py-3 px-3", tone(BTC_BENCHMARK.r1y))}>{fmtPct(BTC_BENCHMARK.r1y)}</td>
                <td className="py-3 px-3 text-rose-400">{BTC_BENCHMARK.maxDrawdown.toFixed(1)}%</td>
                <td className="py-3 px-3">{BTC_BENCHMARK.sharpe.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily NAV ledger */}
      <div className="panel p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Historical NAV Daily Ledger</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Chronological daily NAV settlements for {basket.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(basket, history)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/70 bg-surface/50 hover:bg-surface/80 text-xs font-mono font-medium text-foreground transition-all cursor-pointer w-fit backdrop-blur-sm shadow-sm"
          >
            <span>Export CSV</span>
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs font-mono text-muted-foreground">Loading historical ledger...</div>
        ) : recentRecords.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-muted-foreground">No historical records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2.5 px-3">Settlement Date</th>
                  <th className="py-2.5 px-3">NAV Price ($)</th>
                  <th className="py-2.5 px-3">Daily Change</th>
                  <th className="py-2.5 px-3">Cumulative Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentRecords.map((r) => (
                  <tr key={r.key} className="hover:bg-surface/40 transition-colors">
                    <td className="py-2.5 px-3 text-foreground/80">{r.dateStr}</td>
                    <td className="py-2.5 px-3 font-bold text-foreground">${r.navValue.toFixed(4)}</td>
                    <td className={cn("py-2.5 px-3 font-semibold", tone(r.dayChangePct))}>
                      {fmtPct(r.dayChangePct, 2)}
                    </td>
                    <td className={cn("py-2.5 px-3 font-bold", tone(r.cumReturnPct))}>
                      {fmtPct(r.cumReturnPct, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Page                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("About");
  const [positionTab, setPositionTab] = useState<"Positions" | "Rebalance">("Positions");
  const [amount, setAmount] = useState("0.25");
  const [investModalOpen, setInvestModalOpen] = useState(false);
  const [quickInvesting, setQuickInvesting] = useState(false);
  const [lastInvestSignature, setLastInvestSignature] = useState("");
  const startInvestRef = useRef<((amount: string) => void) | null>(null);
  const registerInvestHandler = useCallback((handler: ((amount: string) => void) | null) => {
    startInvestRef.current = handler;
  }, []);
  const [help, setHelp] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const shareContainerRef = useRef<HTMLDivElement>(null);

  // Reset transient UI + show the skeleton briefly whenever the basket changes
  useEffect(() => {
    setIsPageLoading(true);
    setTab("About");
    setPositionTab("Positions");
    setIsShareOpen(false);
    const timer = setTimeout(() => setIsPageLoading(false), 200);
    return () => clearTimeout(timer);
  }, [id]);

  // Close share popover on outside click / Escape
  useEffect(() => {
    if (!isShareOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (shareContainerRef.current && !shareContainerRef.current.contains(event.target as Node)) {
        setIsShareOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsShareOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isShareOpen]);

  /* ── Wallet ── */
  const { connected, publicKey, connect } = useKairosWallet();
  const { connection } = useConnection();
  const isConnected = connected && !!publicKey;

  const handleConnectWallet = () => connect();

  const handleInvestAction = () => {
    if (!isConnected) void handleConnectWallet();
    else {
      setLastInvestSignature("");
      startInvestRef.current?.(amount);
    }
  };

  /* ── On-chain USDC balance ── */
  const [walletSolBalance, setWalletSolBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const refreshSolBalance = useCallback(async () => {
    if (!publicKey || !connection) {
      setWalletSolBalance(null);
      return;
    }
    try {
      setBalanceLoading(true);
      const lamports = await connection.getBalance(publicKey, "confirmed");
      setWalletSolBalance(lamports / 1_000_000_000);
    } catch {
      // ATA doesn't exist yet → balance is 0
      setWalletSolBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (isConnected) void refreshSolBalance();
    else setWalletSolBalance(null);
  }, [isConnected, refreshSolBalance]);

  /* ── Basket ── */
  const { data: basket, isLoading: basketLoading } = useBasket(id);
  const { data: catalog = [] } = useBaskets();
  /* ── Jupiter quote (debounced so we don't fire per keystroke) ── */
  const parsedAmount = parseFloat(amount);
  const numAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;

  /* ── Positions (localStorage + backend) ── */
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [positionsNonce, setPositionsNonce] = useState(0);

  useEffect(() => {
    if (!publicKey) {
      setPositions([]);
      return;
    }
    let cancelled = false;
    const wallet = publicKey.toBase58();
    const local = readLocalPositions(`kairos_invest_${wallet}`);
    setPositions(local);

    kairosApi
      .getPositions(wallet)
      .then((data) => {
        if (cancelled || !data?.positions?.length) return;
        const seen = new Set(local.map((p) => p.txSignature));
        const merged = [...local];
        for (const pos of data.positions) {
          if (seen.has(pos.id)) continue;
          seen.add(pos.id);
          merged.push({
            action: "Invest",
            basketName: catalog.find((item) => item.id === pos.basketId || item.slug === pos.basketId)?.name ?? pos.basketId ?? "Curated Basket",
            basketId: pos.basketId,
            amountUsdc: pos.entryUsdc,
            tokensDescription: catalog.find((item) => item.id === pos.basketId || item.slug === pos.basketId)?.name ?? pos.basketId,
            txSignature: pos.id,
            timestamp: pos.updatedAt,
          });
        }
        setPositions(merged);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [publicKey, positionsNonce, catalog]);

  const basketPositions = useMemo(() => {
    if (!basket) return [];
    return positions.filter(
      (p) => p.basketId === basket.id || p.basketId === basket.slug || p.basketName === basket.name
    );
  }, [positions, basket]);

  /* ── Share ── */
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success("Basket URL copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const handleShareTwitter = () => {
    if (!basket) return;
    const text = `Explore ${basket.name} on @Kairos_Fi — Curated Solana Narrative Baskets!\n`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleShareTelegram = () => {
    if (!basket) return;
    const text = `Explore ${basket.name} on Kairos — Curated Solana Narrative Baskets`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleNativeShare = async () => {
    if (!basket) return;
    if (!canNativeShare) {
      void handleCopyLink();
      return;
    }
    try {
      await navigator.share({
        title: `${basket.name} | Kairos`,
        text: `Check out ${basket.name} on Kairos:`,
        url: window.location.href,
      });
    } catch (err: any) {
      if (err?.name !== "AbortError") void handleCopyLink();
    }
  };

  /* ── Early returns (all hooks are above this line) ── */
  if (isPageLoading || basketLoading) {
    return (
      <div className="site-shell">
        <Header />
        <MarketDetailSkeleton />
      </div>
    );
  }

  if (!basket) {
    return (
      <div className="site-shell">
        <Header />
        <div className="not-found-state min-h-[50vh] flex flex-col items-center justify-center text-center p-8 gap-4">
          <p className="text-lg text-muted-foreground">This basket doesn't exist or isn't available.</p>
          <Link
            to="/markets"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#d4d4d4] text-[#141414] font-semibold text-sm hover:bg-[#f5f5f5] transition-colors"
          >
            Back to all baskets
          </Link>
        </div>
      </div>
    );
  }

  /* ── Derived display values ── */
  const investDisabled = isConnected && numAmount <= 0;

  return (
    <div className="site-shell market-detail-page">
      <Header />

      <main className="detail-page-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <button
            type="button"
            className="breadcrumb-back"
            aria-label="Go back"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="breadcrumb-items">
            <Link to="/markets">Baskets</Link>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb-current" aria-current="page">{basket.name}</span>
          </div>
        </nav>

        <div className="page-layout">
        <div className="main-column">
          {/* Hero Card */}
          <section className="tracker-hero panel">
            <div className="hero-media">
              {basket.imageUrl ? (
                <img src={basket.imageUrl} alt={basket.name} />
              ) : (
                <div className="hero-media-fallback">{basket.category}</div>
              )}
              <div className="hero-token-stack" aria-label="Basket constituents">
                {basket.tokens.slice(0, 5).map((token) => (
                  <img
                    key={token.symbol}
                    src={token.icon}
                    alt={token.symbol}
                    title={`${token.symbol} · ${token.name}`}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ))}
                {basket.tokens.length > 5 && <small>+{basket.tokens.length - 5}</small>}
              </div>
            </div>

            <div className="hero-copy">
              <div className="hero-title-row">
                <h1>{basket.name}</h1>
                <span className="points">{basket.pointsMultiplier || "3x Pts"}</span>
                {/* Share */}
                <div className="hero-share-wrapper" ref={shareContainerRef}>
                  <button
                    type="button"
                    className={`hero-share ${isShareOpen ? "active" : ""}`}
                    title="Share Basket"
                    aria-label="Share basket"
                    aria-expanded={isShareOpen}
                    onClick={() => setIsShareOpen((prev) => !prev)}
                  >
                    {copiedLink ? <Check size={16} /> : <Share2 size={16} />}
                  </button>

                  {isShareOpen && (
                    <div className="share-popover" role="dialog" aria-label="Share options">
                      <div className="share-popover-header">
                        <span className="share-popover-title">Share Strategy</span>
                        <button
                          type="button"
                          className="share-popover-close"
                          onClick={() => setIsShareOpen(false)}
                          aria-label="Close share menu"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="share-copy-box">
                        <input
                          type="text"
                          readOnly
                          value={typeof window !== "undefined" ? window.location.href : ""}
                          className="share-copy-input"
                          aria-label="Basket URL"
                        />
                        <button
                          type="button"
                          className={`share-copy-btn ${copiedLink ? "copied" : ""}`}
                          onClick={handleCopyLink}
                        >
                          {copiedLink ? (
                            <>
                              <Check size={12} />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="share-actions-grid">
                        <button type="button" className="share-action-item" onClick={handleShareTwitter}>
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                          </svg>
                          <span>Post on X</span>
                        </button>

                        <button type="button" className="share-action-item" onClick={handleShareTelegram}>
                          <Send size={13} className="shrink-0" />
                          <span>Telegram</span>
                        </button>

                        {canNativeShare && (
                          <button type="button" className="share-action-item full-width" onClick={handleNativeShare}>
                            <Share2 size={13} className="shrink-0" />
                            <span>More Options...</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="hero-description">{basket.description}</p>
            </div>
          </section>

          {/* Tabs */}
          <div className="tabs" role="tablist" aria-label="Basket details">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`tab-btn ${tab === t ? "active" : ""} ${t === "Historical" ? "historical-tab" : ""}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="tab-content" role="tabpanel">
            {tab === "About" && (
              <>
                <BacktestedPerformance basket={basket} />
                <Allocation tokens={basket.tokens} basket={basket} />
                <div className="about-strategy panel">
                  <h2>About This Strategy</h2>
                  <p>
                    {basket.aboutStrategy?.summary ||
                      `${basket.name} is a thematic Solana index providing diversified, non-custodial exposure to high-conviction assets.`}
                  </p>
                  <p>
                    <strong>Thesis.</strong> {basket.aboutStrategy?.thesis || basket.description}
                  </p>
                  <p>
                    <strong>Constituents.</strong>
                  </p>
                  <ul className="space-y-2 mb-4 text-sm text-muted-foreground list-disc pl-5">
                    {basket.aboutStrategy?.constituentsRationale
                      ? basket.aboutStrategy.constituentsRationale.map((cr) => (
                          <li key={cr.symbol}>
                            <strong>${cr.symbol}</strong> — {cr.rationale}
                          </li>
                        ))
                      : basket.tokens.map((t) => (
                          <li key={t.symbol}>
                            <strong>
                              ${t.symbol} ({t.name})
                            </strong>{" "}
                            — {fmtWeight(t.weightBps)} allocation target
                          </li>
                        ))}
                  </ul>
                  <p>
                    <strong>Composition.</strong>{" "}
                    {basket.tokens.map((t) => `${t.symbol} ${fmtWeight(t.weightBps)}`).join(", ")}. All allocations
                    execute non-custodially into your wallet.
                  </p>
                </div>
              </>
            )}
            {tab === "Historical" && <HistoricalTabContent basket={basket} />}
            {tab === "Rebalances" && <Rebalances basket={basket} />}
            {(tab === "Risk" || tab === "Resources") && <TextContent basket={basket} kind={tab} />}
          </div>

          {/* Positions / Rebalance */}
          <section className="positions">
            <div className="position-tabs">
              {(["Positions", "Rebalance"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  className={`position-tab-btn ${positionTab === x ? "active" : ""}`}
                  onClick={() => setPositionTab(x)}
                >
                  {x}
                </button>
              ))}
            </div>

            {positionTab === "Positions" ? (
              basketPositions.length > 0 ? (
                <div className="space-y-2 px-1 mt-2">
                  {basketPositions.map((pos, i) => (
                    <div
                      key={pos.txSignature || i}
                      className="bg-surface/40 border border-border/70 rounded-xl p-3.5 text-xs space-y-1.5 backdrop-blur-md hover:border-border/90 hover:bg-surface/50 transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {pos.action} — {pos.basketName || basket.name}
                        </span>
                        <span className="font-mono text-foreground font-bold">
                          ${isNum(pos.amountUsdc) ? pos.amountUsdc.toFixed(2) : "0.00"} USDC
                        </span>
                      </div>
                      {pos.tokensDescription && <div className="text-foreground/70">{pos.tokensDescription}</div>}
                      <div className="flex items-center justify-between text-foreground/50">
                        <span>{pos.timestamp ? new Date(pos.timestamp).toLocaleDateString() : ""}</span>
                        {pos.txSignature && (
                          <a
                            href={`https://explorer.solana.com/tx/${pos.txSignature}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground/70 hover:text-foreground flex items-center gap-1 transition-colors"
                          >
                            {pos.txSignature.slice(0, 6)}…
                            <ArrowUpRight size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-position">
                  <div className="empty-icon">◇</div>
                  <strong>No open position</strong>
                  <p>Invest in this basket to view your positions here</p>
                  <button
                    type="button"
                    onClick={handleInvestAction}
                    className="mt-3 px-4 py-2 rounded-xl bg-surface/60 hover:bg-surface/90 border border-border/70 text-xs font-semibold text-foreground transition-all cursor-pointer backdrop-blur-sm shadow-sm"
                  >
                    {!isConnected ? "Connect Wallet" : "Invest Now"}
                  </button>
                </div>
              )
            ) : (
              <div className="empty-position">
                <div className="empty-icon">◇</div>
                <strong>No rebalances yet</strong>
                <p>Open a position to view automated rebalance settlements</p>
              </div>
            )}
          </section>
        </div>

        {/* Sticky Invest Sidebar */}
        <aside className="invest-panel panel">
          <h2>Invest</h2>
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5 font-medium">
            <span>Amount to invest</span>
            <span className="text-text-muted">Currency: SOL (Devnet)</span>
          </div>

          <div className="amount-field">
            <input
              aria-label="Investment amount"
              type="number"
              inputMode="decimal"
              min="0.0001"
              step="0.01"
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("-")) return; // no negative amounts
                setAmount(v);
              }}
            />
            <span className="amount-currency">SOL</span>
          </div>

          <div className="flex items-center gap-1.5 mt-2">
            {["0.25", "0.5", "1"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className={cn(
                  "flex-1 py-1.5 text-[11px] rounded-lg border font-mono transition-all cursor-pointer",
                  amount === preset
                    ? "border-border-strong bg-primary text-primary-foreground font-bold shadow-sm"
                    : "border-border/60 bg-surface/40 hover:bg-surface/70 text-text-secondary hover:text-foreground"
                )}
              >
                {preset} SOL
              </button>
            ))}
          </div>

          <div className="balance-row mt-2">
            <span>
              <Wallet size={12} />
              {balanceLoading ? (
                <span className="inline-flex items-center gap-1 ml-1 text-muted-foreground">
                  <Loader2 size={10} className="animate-spin" /> Checking balance...
                </span>
              ) : isConnected ? (
                <span className="ml-1">SOL balance: {walletSolBalance === null ? "Unavailable" : `${walletSolBalance.toFixed(4)} SOL`}</span>
              ) : (
                <span className="ml-1 text-muted-foreground">Connect wallet to see balance</span>
              )}
            </span>
          </div>

          <div className="invest-security-note">
            <ShieldCheck size={15} />
            <span>Your Phantom wallet signs each Devnet leg. SOL is sent to the basket treasury for fixed-rate test-asset delivery; this is not a Jupiter market swap.</span>
          </div>

          <button
            type="button"
            className="invest-button"
            onClick={handleInvestAction}
            disabled={investDisabled || quickInvesting}
            aria-disabled={investDisabled || quickInvesting}
          >
            {!isConnected ? (
              <>
                <Wallet className="size-4 stroke-[2.2]" />
                <span>Connect Wallet to Invest</span>
              </>
            ) : (
              <>
                <span>
                  {quickInvesting
                    ? "Preparing Devnet transactions..."
                    : numAmount > 0
                    ? `Invest ${numAmount.toFixed(4)} SOL in ${basket.tokens.length} assets`
                    : "Enter an amount"}
                </span>
                {quickInvesting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4 stroke-[2.2]" />}
              </>
            )}
          </button>
          {lastInvestSignature && (
            <a
              href={`https://explorer.solana.com/tx/${lastInvestSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-xs text-text-secondary hover:text-foreground"
            >
              View confirmed Devnet transaction <ArrowUpRight size={13} />
            </a>
          )}
        </aside>
        </div>
      </main>

      <button type="button" className="mobile-invest cursor-pointer" onClick={handleInvestAction}>
        {!isConnected ? (
          <span className="flex items-center justify-center gap-2">
            <Wallet className="size-4 stroke-[2.2]" />
            Connect Wallet to Invest
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            Invest in {basket.name}
            <ArrowRight className="size-4 stroke-[2.2]" />
          </span>
        )}
      </button>

      <button
        type="button"
        className="help-button"
        aria-label="Help"
        aria-expanded={help}
        onClick={() => setHelp((v) => !v)}
      >
        <MessageCircle size={19} />
        <span>HELP</span>
      </button>

      {help && (
        <div className="help-popover">
          <button type="button" aria-label="Close help" onClick={() => setHelp(false)}>
            <X size={16} />
          </button>
          <h3>Need Help?</h3>
          <p>
            Learn more about how Kairos Solana narrative baskets work, non-custodial Jupiter CPI routing, and
            on-chain rebalancing.
          </p>
          <a href="https://docs.kairos.fi" target="_blank" rel="noreferrer">
            Documentation <ArrowUpRight size={13} />
          </a>
        </div>
      )}

      {/* Final wallet-signing confirmation for the selected SOL amount */}
      <InvestModal
        basket={basket}
        open={investModalOpen}
        onOpenChange={setInvestModalOpen}
        initialAmount={amount}
        onRegisterInvest={registerInvestHandler}
        onBusyChange={setQuickInvesting}
        onAttestationRequired={() => setInvestModalOpen(true)}
        onSuccess={(signature) => {
          setLastInvestSignature(signature);
          void refreshSolBalance();
          setPositionsNonce((n) => n + 1); // re-read local + backend positions
        }}
      />
    </div>
  );
}
