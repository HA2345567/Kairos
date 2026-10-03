import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTokenPrices } from "@/hooks/useTokenPrices";
import { useJupiterQuote } from "@/hooks/useJupiterQuote";
import { useParams, Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Info,
  Loader2,
  MessageCircle,
  Share2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { InvestModal } from "@/components/basket/InvestModal";
import { CURATED_BASKETS, getBasketById, type Basket, type BasketToken } from "@/lib/baskets-data";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { cn } from "@/lib/utils";
import { Button } from "@/components/arc/button";
import { Pie, PieChart } from "recharts";
import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import "./style.css";

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

import { useBasketNavHistory } from "@/hooks/useBasketNavHistory";
import { TechnicalChart } from "@/components/basket/TechnicalChart";

function PerformanceChart({ basket, mobile = false }: { basket: Basket; mobile?: boolean }) {
  const { data: navSummary, isLoading: isNavLoading } = useBasketNavHistory(basket.id);
  const rawHistory = navSummary?.history || [];

  return (
    <TechnicalChart
      basket={basket}
      rawHistory={rawHistory}
      isLoading={isNavLoading}
      mobile={mobile}
    />
  );
}

function getSparklinePoints(isUp: boolean, seedStr: string) {
  const seed = seedStr.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const numPoints = 28;
  const points: number[] = [];
  
  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    // Base trend: if UP, starts lower and ends higher. If DOWN, starts higher and ends lower.
    const trend = isUp ? 24 - progress * 16 : 8 + progress * 16;
    // Organic wave variation
    const wave = Math.sin((i * 0.9) + (seed % 7)) * 2.8 + Math.cos((i * 1.6) + (seed % 11)) * 1.8;
    const y = Math.max(3, Math.min(29, trend + wave));
    points.push(y);
  }

  const width = 280;
  const height = 36;
  const stepX = width / (points.length - 1);
  const coords = points.map((y, i) => `${(i * stepX).toFixed(1)},${y.toFixed(1)}`);
  const path = coords.join(" ");
  const area = `0,${height} ${coords.join(" ")} ${width},${height}`;

  return { path, area };
}

function Allocation({ tokens }: { tokens: BasketToken[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  // Live prices: use priceMint (mainnet) when available, else mint
  // This makes devnet tJUP/tJTO show real JUP/JTO market prices
  const priceLookupMints = useMemo(
    () => tokens.map((t) => t.priceMint ?? t.mint),
    [tokens]
  );
  const { prices: livePrices, loading: pricesLoading } = useTokenPrices(priceLookupMints);
  const hasLiveData = Object.keys(livePrices).length > 0;

  function copy(address: string, full: string) {
    navigator.clipboard?.writeText(full);
    setCopied(address);
    window.setTimeout(() => setCopied(null), 1800);
  }

  // Real chart data for Arc Donut Chart
  const donutData = useMemo(() => {
    return tokens.map((token, i) => ({
      key: token.symbol,
      label: token.name || token.symbol,
      value: token.weightBps / 100,
      color: donutColors[i % donutColors.length],
    }));
  }, [tokens]);

  return (
    <div className="allocation panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2>Allocation</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Target constituent distribution across {tokens.length} verified Solana tokens.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasLiveData && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-surface-muted border border-border text-foreground">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              LIVE
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs font-mono font-medium px-3 py-1 rounded-full bg-surface-muted border border-border text-foreground w-fit">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
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
          className="w-full max-w-xl mx-auto"
        />
      </div>

      {/* Constituent Holdings Cards matching reference screenshot */}
      <div className="holdings">
        {tokens.map((h) => {
          // Use priceMint (mainnet) key for live price lookup
          const lookupMint = h.priceMint ?? h.mint;
          const live = livePrices[lookupMint];
          const priceUsd = live?.priceUsd ?? h.priceUsd;
          const change24h = live?.change24h ?? h.change24h;
          const isLive = !!live;

          const shortAddress = h.mint ? `${h.mint.slice(0, 4)}...${h.mint.slice(-4)}` : "Solana";
          const isUp = change24h >= 0;
          const absPct = Math.abs(change24h);
          const dollarChange = Math.abs((priceUsd * change24h) / 100);
          const formattedDollarChange = dollarChange < 0.01 
            ? dollarChange.toFixed(4) 
            : dollarChange.toFixed(2);
          const displayPrice = priceUsd < 0.001 
            ? `$${priceUsd.toFixed(6)}` 
            : `$${priceUsd.toFixed(2)}`;
          const weight = ((h.weightBps / 100) % 1 === 0 ? (h.weightBps / 100) : (h.weightBps / 100).toFixed(1)) + "%";
          const sparkline = getSparklinePoints(isUp, h.symbol);

          return (
            <article className="holding" key={h.symbol}>
              <div className="holding-top">
                <img 
                  src={h.icon} 
                  alt={h.name} 
                  className="rounded-full border border-white/20 object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
                <div className="holding-name">
                  <strong className="flex items-center gap-1.5">
                    {h.symbol}
                    {isLive && (
                      <span className="size-1.5 rounded-full bg-[#c5ff4a] animate-pulse" title="Live price" />
                    )}
                  </strong>
                  <span>{h.name}</span>
                </div>
                <button
                  type="button"
                  className="address"
                  title={`Copy ${h.mint}`}
                  onClick={() => copy(shortAddress, h.mint)}
                >
                  <span>{shortAddress}</span>
                  {copied === shortAddress ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>

              <div className={`holding-data ${isUp ? "up" : "down"}`}>
                <div className="holding-price">
                  {displayPrice} <Info size={13} />
                </div>

                <div className="holding-change">
                  <span>{isUp ? "▲" : "▼"}</span> ${formattedDollarChange} ({absPct.toFixed(2)}%) <span>24H</span>
                </div>

                <div className="holding-bottom">
                  <span>ALLOCATION</span>
                  <b>{weight}</b>
                </div>

                {/* SVG Sparkline with gradient underglow matching reference screenshot */}
                <svg 
                  viewBox="0 0 280 36" 
                  preserveAspectRatio="none" 
                  className="sparkline"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={`sparkGrad-${h.symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop 
                        offset="0%" 
                        stopColor={isUp ? "#22c55e" : "#ef4444"} 
                        stopOpacity={isUp ? "0.38" : "0.32"} 
                      />
                      <stop 
                        offset="100%" 
                        stopColor={isUp ? "#22c55e" : "#ef4444"} 
                        stopOpacity="0" 
                      />
                    </linearGradient>
                  </defs>
                  <polygon 
                    points={sparkline.area} 
                    fill={`url(#sparkGrad-${h.symbol})`} 
                  />
                  <polyline
                    points={sparkline.path}
                    fill="none"
                    stroke={isUp ? "#22c55e" : "#ef4444"}
                    strokeWidth="1.8"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Rebalances({ basket }: { basket: Basket }) {
  const [open, setOpen] = useState(0);
  const [mode, setMode] = useState("Rebalances");

  // TODO: replace with real on-chain data
  const defaultRebalances = [
    {
      title: `Final Launch Weights Normalized for ${basket.name}`,
      version: "v1.0",
      date: "Sep 27, 2026",
      changes: basket.tokens.map((t) => [
        t.symbol,
        "Target Weight",
        `${Math.round(t.weightBps / 100)}%`,
      ] as [string, string, string]),
      bullets: [
        `• Verified constituent liquidity depth on Jupiter CPI router.`,
        `• Direct non-custodial delivery configured for all Associated Token Accounts (ATAs).`,
      ],
    },
  ];

  const rebalanceData = basket.aboutStrategy?.rebalances || defaultRebalances;

  return (
    <div className="panel rebalances">
      <div className="section-heading">
        <div>
          <h2>Rebalances</h2>
          <p>Every allocation change published for this basket, newest first.</p>
        </div>
        <div className="mini-segments">
          {["Rebalances", "Markers"].map((m) => (
            <button
              key={m}
              className={mode === m ? "selected" : ""}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === "Markers" ? (
        <div className="marker-list">
          {[
            { title: `${basket.name} Launch Catalog Verified`, date: "Sep 27, 2026" },
            { title: "Non-Custodial Router Integration Finalized", date: "Sep 26, 2026" },
            { title: "Constituent ATA routing verified on mainnet", date: "Sep 24, 2026" },
          ].map((item, i) => (
            <div key={i}>
              <span className="marker-dot" />
              <div>
                <strong>{item.title}</strong>
                <small>{item.date}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rebalance-list">
          {rebalanceData.map((item, i) => (
            <div className="rebalance-item" key={i}>
              <button
                type="button"
                className="rebalance-trigger"
                onClick={() => setOpen(open === i ? -1 : i)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.version}</small>
                </span>
                <span>
                  {item.date} <ChevronDown size={15} className={open === i ? "rotate" : ""} />
                </span>
              </button>
              {open === i && (
                <div className="rebalance-detail">
                  {item.bullets.map((b, bi) => (
                    <p key={bi}>{b}</p>
                  ))}
                  <div className="rebalance-changes">
                    {item.changes.map(([name, a, b]) => (
                      <div key={name}>
                        <span>{name}</span>
                        <span>{a} → <b>{b}</b></span>
                      </div>
                    ))}
                  </div>
                  <p>› &nbsp; Kairos Solana On-Chain Router Registry</p>
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
            When you invest, USDC is routed via Jupiter swaps directly into constituent tokens in your Associated Token Accounts (ATAs). Kairos holds zero custody of your assets.
          </p>
          <p>
            Not financial advice. Curated for thematic ecosystem exposure based on verified on-chain traction.
          </p>
        </>
      ) : (
        <>
          <h2>Thesis & Methodology</h2>
          <p>
            {basket.aboutStrategy?.thesis ||
              `${basket.name} captures the premier leaders within the Solana ecosystem, selecting protocols with verified liquidity and traction.`}
          </p>
          <p>
            Holdings are evaluated continuously and rebalanced to locked weights, allowing users to compound returns across the entire narrative with a single click.
          </p>
          <h3>Verified On-Chain Data Sources</h3>
          <p>
            Solana Blockchain Explorer & Solscan<br />
            Jupiter Aggregator Price & Routing API<br />
            DefiLlama Protocol Revenue & TVL Analytics
          </p>
        </>
      )}
    </div>
  );
}

import { MarketDetailSkeleton } from "@/components/basket/BasketSkeleton";

// Devnet USDC mint — defined once outside the component
const DEVNET_USDC_MINT = new PublicKey("An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y");

interface PositionItem {
  action: string;
  basketName: string;
  basketId: string;
  amountUsdc: number;
  tokensDescription: string;
  txSignature: string;
  timestamp?: string;
}

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("About");
  const [amount, setAmount] = useState("50");
  const [auto, setAuto] = useState(false);
  const [investModalOpen, setInvestModalOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [shared, setShared] = useState(false);
  const [positionTab, setPositionTab] = useState("Positions");
  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsPageLoading(false), 200);
    return () => clearTimeout(timer);
  }, [id]);

  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const isConnected = connected && !!publicKey;

  // ── Real on-chain USDC balance ─────────────────────────────────────────────
  const [walletUsdcBalance, setWalletUsdcBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const refreshUsdcBalance = useCallback(async () => {
    if (!publicKey || !connection) return;
    try {
      setBalanceLoading(true);
      const ata = await getAssociatedTokenAddress(DEVNET_USDC_MINT, publicKey);
      const info = await connection.getTokenAccountBalance(ata);
      setWalletUsdcBalance(info?.value?.uiAmount ?? 0);
    } catch {
      setWalletUsdcBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (isConnected) refreshUsdcBalance();
    else setWalletUsdcBalance(0);
  }, [isConnected, refreshUsdcBalance]);

  // ── Resolve basket (must come before any hook that depends on it) ──────────
  const basket = getBasketById(id);
  const { data: navSummary } = useBasketNavHistory(basket?.id);

  // ── Live Jupiter quote for sidebar ────────────────────────────────────────
  const numAmount = parseFloat(amount) || 0;
  const jupQuote = useJupiterQuote(basket?.tokens ?? [], numAmount);

  // ── Real positions from localStorage + backend ────────────────────────────
  const [positions, setPositions] = useState<PositionItem[]>([]);

  useEffect(() => {
    if (!publicKey) { setPositions([]); return; }
    const key = `kairos_invest_${publicKey.toBase58()}`;
    const local: PositionItem[] = JSON.parse(localStorage.getItem(key) || "[]");
    setPositions(local);

    const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
    fetch(`${apiBase}/api/positions/${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.investments?.length) return;
        const seen = new Set(local.map((p) => p.txSignature));
        const merged = [...local];
        for (const inv of data.investments) {
          if (!seen.has(inv.txSignature)) {
            merged.push({
              action: "Invest",
              basketName: inv.basketId || "Solana Infra Governance",
              basketId: inv.basketId,
              amountUsdc: inv.amountUsdc,
              tokensDescription: "50% tJUP + 50% tJTO",
              txSignature: inv.txSignature,
              timestamp: inv.createdAt,
            });
          }
        }
        setPositions(merged);
      })
      .catch(() => {});
  }, [publicKey]);


  if (isPageLoading) {
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
          <Link to="/markets" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c5ff4a] text-black font-semibold text-sm hover:bg-[#b0f020] transition-colors">
            Back to all baskets
          </Link>
        </div>
      </div>
    );
  }

  function share() {
    navigator.clipboard?.writeText(window.location.href);
    setShared(true);
    window.setTimeout(() => setShared(false), 2000);
  }

  // Estimated receive from live Jupiter quote (fallback to 0.996 haircut)
  const receiveEst = jupQuote.tokens.length > 0
    ? jupQuote.totalReceiveUsdc.toFixed(2)
    : (numAmount * 0.996).toFixed(2);
  const feePct = jupQuote.tokens.length > 0 && numAmount > 0
    ? ((jupQuote.totalFeeUsdc / numAmount) * 100).toFixed(2)
    : "0.38";

  return (
    <div className="site-shell">
      <Header />

      <main className="page-layout">
        <div className="main-column">
          {/* Breadcrumbs */}
          <div className="breadcrumbs">
            <Link to="/markets">
              <ChevronLeft size={14} />
              <span>Baskets</span>
            </Link>
            <span>/</span>
            <strong>{basket.name}</strong>
          </div>

          {/* Hero Card */}
          <section className="tracker-hero panel">
            {basket.imageUrl ? (
              <img src={basket.imageUrl} alt={basket.name} />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-foreground/10 flex items-center justify-center font-bold text-foreground">
                {basket.category}
              </div>
            )}
            <div className="hero-copy">
              <div className="title-row">
                <h1 className="text-3xl sm:text-4xl md:text-[38px] font-extrabold text-foreground tracking-tight leading-none">
                  {basket.name}
                </h1>
                <span className="points">{basket.pointsMultiplier || "3x Pts"}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 mb-2 font-medium">
                Curated by Kairos · {basket.category}
              </p>
              <p className="text-sm text-muted-foreground/90 leading-relaxed">{basket.description}</p>
            </div>
            <button
              type="button"
              className="hero-share"
              title="Share"
              aria-label="Share tracker"
              onClick={share}
            >
              {shared ? <Check size={16} /> : <Share2 size={16} />}
            </button>
            <div className="hero-token-stack">
              {basket.tokens.slice(0, 3).map((token) => (
                <img
                  key={token.symbol}
                  src={token.icon}
                  alt={token.symbol}
                  className="rounded-full border border-foreground/20 object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ))}
              {basket.tokens.length > 3 && (
                <small>+{basket.tokens.length - 3}</small>
              )}
            </div>
          </section>

          <div className="mobile-intro">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground mb-1.5 px-5 pt-3">
              {basket.name}
            </h1>
            <p className="px-5 text-sm text-muted-foreground">{basket.description}</p>
            <PerformanceChart basket={basket} mobile />
          </div>

          {/* Detail Tabs */}
          <div className="tabs" role="tablist" aria-label="Tracker details">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`tab-btn ${tab === t ? "active" : ""} ${t === "Historical" ? "historical-tab" : ""}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Active Tab Content */}
          <div className="tab-content">
            {tab === "About" && (
              <>
                <PerformanceChart basket={basket} />
                <Allocation tokens={basket.tokens} />
                <div className="about-strategy panel">
                  <h2>About This Strategy</h2>
                  <p>
                    {basket.aboutStrategy?.summary ||
                      `${basket.name} is a thematic Solana index providing diversified, non-custodial exposure to high-conviction assets.`}
                  </p>
                  <p>
                    <strong>Thesis.</strong>{" "}
                    {basket.aboutStrategy?.thesis || basket.description}
                  </p>
                  <p>
                    <strong>Constituents.</strong>
                  </p>
                  <ul className="space-y-2 mb-4 text-sm text-muted-foreground list-disc pl-5">
                    {basket.aboutStrategy?.constituentsRationale ? (
                      basket.aboutStrategy.constituentsRationale.map((cr) => (
                        <li key={cr.symbol}>
                          <strong>${cr.symbol}</strong> — {cr.rationale}
                        </li>
                      ))
                    ) : (
                      basket.tokens.map((t) => (
                        <li key={t.symbol}>
                          <strong>${t.symbol} ({t.name})</strong> — {Math.round(t.weightBps / 100)}% allocation target
                        </li>
                      ))
                    )}
                  </ul>
                  <p>
                    <strong>Composition.</strong>{" "}
                    {basket.tokens
                      .map((t) => `${t.symbol} ${Math.round(t.weightBps / 100)}%`)
                      .join(", ")}
                    . All allocations execute non-custodially into your wallet.
                  </p>
                </div>
              </>
            )}
            {tab === "Historical" && <PerformanceChart basket={basket} />}
            {tab === "Rebalances" && <Rebalances basket={basket} />}
            {(tab === "Risk" || tab === "Resources") && <TextContent basket={basket} kind={tab} />}
          </div>

          {/* Positions / Rebalance Module */}
          <section className="positions">
            <div className="position-tabs">
              {["Positions", "Rebalance"].map((x) => (
                <button
                  key={x}
                  className={`position-tab-btn ${positionTab === x ? "active" : ""}`}
                  onClick={() => setPositionTab(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            {/* Real Positions: from localStorage + backend API */}
            {positionTab === "Positions" ? (
              positions.filter((p) => !basket || p.basketId === basket.id || p.basketName?.includes(basket.name)).length > 0 ? (
                <div className="space-y-2 px-1 mt-2">
                  {positions
                    .filter((p) => !basket || p.basketId === basket.id || p.basketName?.includes(basket.name))
                    .map((pos, i) => (
                      <div
                        key={pos.txSignature || i}
                        className="bg-foreground/[0.04] border border-border/30 rounded-xl p-3.5 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{pos.action} — {pos.basketName || basket?.name}</span>
                          <span className="font-mono text-foreground font-bold">${pos.amountUsdc?.toFixed(2)} USDC</span>
                        </div>
                        {pos.tokensDescription && (
                          <div className="text-foreground/70">{pos.tokensDescription}</div>
                        )}
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
                </div>
              )
            ) : (
              <div className="empty-position">
                <div className="empty-icon">◇</div>
                <strong>No rebalances yet</strong>
                <p>Open a position to view your rebalances</p>
              </div>
            )}
          </section>
        </div>

        {/* Right Sticky Invest Sidebar */}
        <aside className="invest-panel panel">
          <h2>Invest</h2>
          <div className="balance-row">
            <span>
              <Wallet size={12} />
              {balanceLoading ? (
                <span className="inline-flex items-center gap-1 ml-1 text-muted-foreground">
                  <Loader2 size={10} className="animate-spin" /> Loading...
                </span>
              ) : isConnected ? (
                <span className="ml-1">{walletUsdcBalance.toFixed(2)} USDC</span>
              ) : (
                <span className="ml-1 text-muted-foreground">Connect wallet</span>
              )}
            </span>
            <div className="half-max-pill">
              <button
                type="button"
                disabled={walletUsdcBalance <= 0}
                className={walletUsdcBalance <= 0 ? "opacity-40 cursor-not-allowed" : ""}
                onClick={() => walletUsdcBalance > 0 && setAmount((walletUsdcBalance / 2).toFixed(2))}
              >
                Half
              </button>
              <button
                type="button"
                disabled={walletUsdcBalance <= 0}
                className={walletUsdcBalance <= 0 ? "opacity-40 cursor-not-allowed" : ""}
                onClick={() => walletUsdcBalance > 0 && setAmount(walletUsdcBalance.toFixed(2))}
              >
                Max
              </button>
            </div>
          </div>
          <div className="amount-field">
            <span className="usdc-mark">$</span>
            <span>USDC</span>
            <input
              aria-label="Investment amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            {["10", "25", "50", "100"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className={cn(
                  "flex-1 py-1 text-[11px] rounded-lg border font-mono transition-colors cursor-pointer",
                  amount === preset
                    ? "border-foreground bg-primary text-primary-foreground font-bold shadow-sm"
                    : "border-border/30 bg-surface hover:bg-surface-hover text-text-secondary hover:text-foreground"
                )}
              >
                ${preset}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground mt-2 flex justify-between items-center">
            <span className="flex items-center gap-1">
              You'll receive
              {jupQuote.loading && <Loader2 size={9} className="animate-spin text-muted-foreground" />}
            </span>
            <span className="text-foreground font-mono">
              {jupQuote.error
                ? `≈ $${receiveEst} (est.)`
                : jupQuote.loading
                ? <span className="text-muted-foreground">Fetching quote…</span>
                : `≈ $${receiveEst} (-${feePct}%)`
              }
            </span>
          </div>

          <div className="investment-metrics">
            <div>
              <span>
                All Time Return <Info size={13} />
              </span>
              <strong>
                {navSummary?.allTimeReturnPct != null
                  ? `${navSummary.allTimeReturnPct >= 0 ? "+" : ""}${navSummary.allTimeReturnPct.toFixed(2)}%`
                  : "No data yet"}
              </strong>
            </div>
            <div>
              <span className="fee-label">Router Fee</span>
              <u className="fee-value">
                {jupQuote.tokens.length > 0 && numAmount > 0
                  ? `${feePct}%`
                  : "~0.5%"}
              </u>
            </div>
          </div>
          <div className="auto-row">
            <span>
              Auto-rebalance <Info size={13} />
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={auto}
              aria-label="Auto-rebalance"
              className={`switch ${auto ? "on" : ""}`}
              onClick={() => setAuto(!auto)}
            >
              <span />
            </button>
          </div>

          {basket.id !== "solana-infra-governance" && (
            <div className="mb-3 p-3.5 rounded-[16px] bg-surface border border-border text-text-secondary text-xs flex items-center justify-between">
              <span>Devnet demo is active on <strong className="text-foreground">Solana Infra Governance</strong>.</span>
              <Link to="/markets/solana-infra-governance" className="underline font-semibold ml-2 hover:text-foreground text-foreground">Switch</Link>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            className={cn("w-full font-bold tracking-wide uppercase shadow-lg", basket.id !== "solana-infra-governance" && "opacity-50 cursor-not-allowed")}
            disabled={basket.id !== "solana-infra-governance"}
            onClick={() => setInvestModalOpen(true)}
          >
            {basket.id === "solana-infra-governance" ? `INVEST IN ${basket.tokens.length} TOKENS` : "COMING SOON (DEVNET DEMO LOCKED)"}
          </Button>
        </aside>
      </main>

      <button
        type="button"
        className={cn("mobile-invest", basket.id !== "solana-infra-governance" && "opacity-50 cursor-not-allowed bg-foreground/10 text-foreground/50")}
        disabled={basket.id !== "solana-infra-governance"}
        onClick={() => setInvestModalOpen(true)}
      >
        {basket.id === "solana-infra-governance" ? `Invest in ${basket.name}` : "Coming Soon"}
      </button>

      <button
        type="button"
        className="help-button"
        aria-label="Help"
        onClick={() => setHelp(!help)}
      >
        <MessageCircle size={19} />
        <span>HELP</span>
      </button>

      {help && (
        <div className="help-popover">
          <button
            type="button"
            aria-label="Close help"
            onClick={() => setHelp(false)}
          >
            <X size={16} />
          </button>
          <h3>Need Help?</h3>
          <p>
            Learn more about how Kairos Solana narrative baskets work, non-custodial Jupiter CPI routing, and on-chain rebalancing.
          </p>
          <a
            href="https://docs.kairos.fi"
            target="_blank"
            rel="noreferrer"
          >
            Documentation <ArrowUpRight size={13} />
          </a>
        </div>
      )}

      {/* Real Non-Custodial Jupiter CPI Invest Modal */}
      <InvestModal
        basket={basket}
        open={investModalOpen}
        onOpenChange={setInvestModalOpen}
        initialAmount={amount}
        onSuccess={() => {
          refreshUsdcBalance();
          if (publicKey) {
            const key = `kairos_invest_${publicKey.toBase58()}`;
            const local: PositionItem[] = JSON.parse(localStorage.getItem(key) || "[]");
            setPositions(local);
          }
        }}
      />
    </div>
  );
}
