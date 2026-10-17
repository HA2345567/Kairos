import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { fetchBasket, type Basket, type BasketToken } from "@/lib/baskets-data";
import { kairosApi } from "@/lib/api-client";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
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
      rawHistory={rawHistory}
      isLoading={isNavLoading}
      mobile={mobile}
      disclaimer={navSummary?.disclaimer}
    />
  );
}


function Allocation({ tokens }: { tokens: BasketToken[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const donutData = useMemo(() => tokens.map((token, index) => ({
    key: token.symbol,
    label: token.name,
    value: token.weightBps / 100,
    color: donutColors[index % donutColors.length],
  })), [tokens]);

  const copy = (mint: string) => {
    navigator.clipboard?.writeText(mint);
    setCopied(mint);
    toast.success("Mint address copied");
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="allocation panel">
      <div className="mb-4">
        <h2>Allocation</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Published basket composition on Solana devnet.</p>
      </div>
      <div className="allocation-visual flex items-center justify-center py-4">
        <DonutChart data={donutData} label="Constituent Token Allocation" unit="%"
          formatValue={(value) => String(Number.isInteger(value) ? value : value.toFixed(1)) + "%"}
          totalLabel="Target" size={240} thickness={28} legend legendAction="toggle"
          className="mx-auto w-full max-w-xl" />
      </div>
      <div className="holdings">
        {tokens.map((token) => {
          const shortMint = token.mint.slice(0, 4) + "..." + token.mint.slice(-4);
          return (
            <article className="holding" key={token.mint}>
              <div className="holding-top">
                <img src={token.icon} alt={token.name} className="rounded-full border border-white/20 object-cover" />
                <div className="holding-name"><strong>{token.symbol}</strong><span>{token.name}</span></div>
                <button type="button" className="address" title={token.mint} onClick={() => copy(token.mint)}>
                  <span>{shortMint}</span>
                  {copied === token.mint ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>
              <div className="holding-data">
                <div className="holding-bottom"><span>Target allocation</span><b>{token.weightBps / 100}%</b></div>
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
          {(["Rebalances", "Markers"] as const).map((item) => (
            <button key={item} className={mode === item ? "selected" : ""} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading published versions…</p> : null}
      {isError ? <p className="text-sm text-muted-foreground">Version history is currently unavailable.</p> : null}
      {!isLoading && !isError && versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published basket versions yet.</p>
      ) : null}

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
        </div>
      ) : (
        <div className="rebalance-list">
          {versions.map((version, index) => (
            <div className="rebalance-item" key={version.id}>
              <button type="button" className="rebalance-trigger" onClick={() => setOpen(open === index ? -1 : index)}>
                <span>
                  <strong>{version.changelog}</strong>
                  <small>v{version.version}</small>
                </span>
                <span>
                  {new Date(version.publishedAt).toLocaleDateString()}
                  <ChevronDown size={15} className={open === index ? "rotate" : ""} />
                </span>
              </button>
              {open === index ? (
                <div className="rebalance-detail">
                  <p>Published by {version.publishedBy}</p>
                  {version.registryTx ? (
                    <a
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 underline"
                      href={`https://explorer.solana.com/tx/${version.registryTx}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Verified on Solana devnet <ArrowUpRight size={13} />
                    </a>
                  ) : <p className="text-xs text-muted-foreground">No on-chain registry proof is recorded for this version.</p>}
                  <div className="rebalance-changes">
                    {version.legs.map((leg) => (
                      <div key={leg.mint}>
                        <span>
                          {basket.tokens.find((token) => token.mint === leg.mint)?.symbol ?? "…"}
                        </span>
                        <span>Target weight <b>{(leg.weightBps / 100).toFixed(2)}%</b></span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function TextContent({ basket, kind }: { basket: Basket; kind: "Risk" | "Resources" }) {
  const chars = basket.aboutStrategy?.characteristics ?? [];
  const risks = basket.aboutStrategy?.risks ?? [];
  return (
    <div className="panel text-content">
      {kind === "Risk" ? (
        <>
          <h2>{basket.name}</h2>
          <h3>Key Characteristics</h3>
          {chars.length ? <ul>{chars.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No basket-specific characteristics have been published.</p>}
          <h3>Risk Factors</h3>
          {risks.length ? <ul>{risks.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No basket-specific risk assessment has been published.</p>}
          <h3>Non-Custodial Delivery</h3>
          <p>Kairos prepares unsigned transactions for your connected wallet. Review each transfer and sign it in your wallet; Kairos does not hold your wallet keys.</p>
          <p>Devnet assets and indicative rates are for testing and may not represent live markets.</p>
        </>
      ) : (
        <>
          <h2>Thesis &amp; Methodology</h2>
          <p>{basket.aboutStrategy?.thesis || "No basket-specific thesis has been published."}</p>
          <p>Target weights are recorded in the published basket version. Portfolio changes are user-initiated unless a supported automation is enabled.</p>
          <p>Price and performance data are shown only when a configured provider supplies them; unavailable data stays unavailable.</p>
        </>
      )}
    </div>
  );
}
import { MarketDetailSkeleton } from "@/components/basket/BasketSkeleton";

function exportCsv(basket: Basket, history: { timestamp: number; navValue: number }[]) {
  if (!history || history.length === 0) {
    toast.error("No historical records available to export.");
    return;
  }
  const headers = "Date,Hypothetical_Index,Cumulative_Return_Pct\n";
  const startNav = history[0].navValue;
  const rows = history
    .map((pt) => {
      const dateStr = new Date(pt.timestamp).toISOString();
      const retPct = startNav > 0 ? (((pt.navValue - startNav) / startNav) * 100).toFixed(2) : "0.00";
      return `${dateStr},${pt.navValue.toFixed(4)},${retPct}%`;
    })
    .join("\n");
  const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${basket.slug || basket.id}-nav-history.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Hypothetical index CSV exported");
}

function HistoricalTabContent({ basket }: { basket: Basket }) {
  const { data: navSummary, isLoading } = useBasketNavHistory(basket.id);
  const history = navSummary?.history || [];
  const startNav = history[0]?.navValue || 1;

  // Recent 14 records for the table, newest first
  const recentRecords = useMemo(() => {
    if (!history.length) return [];
    return history.slice(-14).reverse().map((pt, i, arr) => {
      const dateStr = new Date(pt.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const prevVal = arr[i + 1]?.navValue || pt.navValue;
      const dayChangePct = prevVal > 0 ? ((pt.navValue - prevVal) / prevVal) * 100 : 0;
      const cumReturnPct = startNav > 0 ? ((pt.navValue - startNav) / startNav) * 100 : 0;
      return {
        dateStr,
        navValue: pt.navValue,
        dayChangePct,
        cumReturnPct,
      };
    });
  }, [history, startNav]);

  return (
    <div className="space-y-6">
      {/* 1. Main Technical Chart */}
      <PerformanceChart basket={basket} />

      {/* 2. Benchmark & Alpha Comparison Panel */}
      <div className="panel p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Hypothetical Performance Comparison</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {navSummary?.benchmarkLabel ?? "Verified benchmark unavailable until source data is connected."}
            </p>
          </div>
          <span className="text-[10px] font-mono px-3 py-1 rounded-full bg-surface-muted border border-border text-muted-foreground w-fit">
            HYPOTHETICAL · NOT REALIZED RETURNS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2.5 px-3">Series</th>
                <th className="py-2.5 px-3">Available-window return</th>
                <th className="py-2.5 px-3">Ending index (base 1.0)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr className="bg-surface/50 font-bold text-foreground">
                <td className="py-3 px-3">{basket.name}</td>
                <td className="py-3 px-3">
                  {navSummary ? `${navSummary.allTimeReturnPct! >= 0 ? "+" : ""}${navSummary.allTimeReturnPct!.toFixed(2)}%` : "—"}
                </td>
                <td className="py-3 px-3">{navSummary?.currentNav?.toFixed(4) ?? "—"}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-3 px-3">SOL benchmark (verified history unavailable)</td>
                <td className="py-3 px-3">—</td>
                <td className="py-3 px-3">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Hypothetical index observations */}
      <div className="panel p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Hypothetical Index History</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sampled index observations for {basket.name}; these are not user holdings or realized returns.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(basket, history)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-xs font-mono font-medium text-foreground transition-colors cursor-pointer w-fit"
          >
            <span>Export CSV</span>
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs font-mono text-muted-foreground">
            Loading historical ledger...
          </div>
        ) : recentRecords.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-muted-foreground">
            No historical records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2.5 px-3">Observation Time</th>
                  <th className="py-2.5 px-3">Hypothetical Index</th>
                  <th className="py-2.5 px-3">Daily Change</th>
                  <th className="py-2.5 px-3">Cumulative Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentRecords.map((r, i) => (
                  <tr key={i} className="hover:bg-surface/40 transition-colors">
                    <td className="py-2.5 px-3 text-foreground/80">{r.dateStr}</td>
                    <td className="py-2.5 px-3 font-bold text-foreground">{r.navValue.toFixed(4)}</td>
                    <td className={cn("py-2.5 px-3 font-semibold", r.dayChangePct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {r.dayChangePct >= 0 ? "+" : ""}{r.dayChangePct.toFixed(2)}%
                    </td>
                    <td className={cn("py-2.5 px-3 font-bold", r.cumReturnPct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {r.cumReturnPct >= 0 ? "+" : ""}{r.cumReturnPct.toFixed(2)}%
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
  const { data: basket, isLoading: isPageLoading } = useQuery({
    queryKey: ["basket-detail", id],
    queryFn: () => fetchBasket(id!),
    enabled: Boolean(id),
  });

  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
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
  const { data: navSummary } = useBasketNavHistory(basket?.id);

  // ── Live Jupiter quote for sidebar ────────────────────────────────────────
  const numAmount = parseFloat(amount) || 0;
  const quoteQuery = useQuery({
    queryKey: ["basket-invest-quote", basket?.slug, amount],
    queryFn: () => kairosApi.getQuote(basket!.slug, numAmount),
    enabled: Boolean(basket && numAmount >= basket.minUsdc),
    staleTime: 0,
    retry: false,
  });
  const quote = quoteQuery.data?.quote;

  // ── Real positions from localStorage + backend ────────────────────────────
  const [positions, setPositions] = useState<PositionItem[]>([]);

  useEffect(() => {
    if (!publicKey) { setPositions([]); return; }
    const key = `kairos_invest_${publicKey.toBase58()}`;
    try {
      setPositions(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setPositions([]);
    }
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
    toast.success("Basket URL copied to clipboard!");
    window.setTimeout(() => setShared(false), 2000);
  }

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
            {tab === "Historical" && <HistoricalTabContent basket={basket} />}
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
            {/* Completed execution history recorded by this browser. */}
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
                  <button
                    type="button"
                    onClick={() => {
                      if (!isConnected) setWalletModalVisible(true);
                      else setInvestModalOpen(true);
                    }}
                    className="mt-3 px-4 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-foreground transition-colors cursor-pointer"
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
                onClick={() => {
                  if (!isConnected) {
                    setWalletModalVisible(true);
                  } else if (walletUsdcBalance > 0) {
                    setAmount((walletUsdcBalance / 2).toFixed(2));
                  } else {
                    setAmount("25");
                    toast.info("Using preset $25 (wallet balance is 0)");
                  }
                }}
              >
                Half
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isConnected) {
                    setWalletModalVisible(true);
                  } else if (walletUsdcBalance > 0) {
                    setAmount(walletUsdcBalance.toFixed(2));
                  } else {
                    setAmount("50");
                    toast.info("Using preset $50 (wallet balance is 0)");
                  }
                }}
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
              Allocated after fee
              {quoteQuery.isFetching && <Loader2 size={9} className="animate-spin text-muted-foreground" />}
            </span>
            <span className="text-foreground font-mono">
              {quote ? `$${quote.netInvestUsdc.toFixed(2)} USDC` : quoteQuery.isError ? "Quote unavailable" : "—"}
            </span>
          </div>

          <div className="investment-metrics">
            <div>
              <span>
                Hypothetical Return <Info size={13} />
              </span>
              <strong>
                {navSummary?.allTimeReturnPct != null
                  ? `${navSummary.allTimeReturnPct >= 0 ? "+" : ""}${navSummary.allTimeReturnPct.toFixed(2)}%`
                  : "—"}
              </strong>
            </div>
            <div>
              <span className="fee-label">Router Fee</span>
              <u className="fee-value">
                {quote ? `$${quote.platformFeeUsdc.toFixed(2)} USDC` : "—"}
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

          <Button
            variant="primary"
            size="lg"
            className="w-full font-bold tracking-wide uppercase shadow-lg cursor-pointer"
            onClick={() => {
              if (!isConnected) {
                setWalletModalVisible(true);
              } else {
                setInvestModalOpen(true);
              }
            }}
          >
            {!isConnected
              ? "CONNECT WALLET TO INVEST"
              : `INVEST IN ${basket.tokens.length} TOKENS`}
          </Button>
        </aside>
      </main>

      <button
        type="button"
        className="mobile-invest cursor-pointer"
        onClick={() => {
          if (!isConnected) {
            setWalletModalVisible(true);
          } else {
            setInvestModalOpen(true);
          }
        }}
      >
        {!isConnected ? "Connect Wallet" : `Invest in ${basket.name}`}
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
            Learn more about devnet basket quotes, wallet signing, and on-chain position management.
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

      {/* Non-custodial backend-prepared transaction flow */}
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
