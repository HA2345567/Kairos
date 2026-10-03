import { useState, useEffect, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PageShell } from "@/components/layout/PageShell";
import { CURATED_BASKETS, DEVNET_DEMO_BASKET, Basket } from "@/lib/baskets-data";
import { InvestModal } from "@/components/basket/InvestModal";
import { Link } from "react-router-dom";
import { BasketCardSkeleton, PortfolioSkeleton } from "@/components/basket/BasketSkeleton";
import { BasketCard } from "@/components/basket/BasketCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useTokenPrices } from "@/hooks/useTokenPrices";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  ExternalLink,
  Layers,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { ArrowRight, Compass, History } from "lucide-react";
import "./cesto.css";

interface TokenBalance {
  symbol: string;
  name: string;
  mint: string;
  amount: number;
  priceUsd: number;
  usdValue: number;
  icon: string;
}

interface ActivityItem {
  action: string;
  basketName: string;
  amountUsdc: number;
  tokensDescription: string;
  txSignature: string;
  timestamp?: string;
}

// Mainnet mints used for real price lookups (devnet tokens use mainnet counterpart prices)
const PRICE_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
};

export default function Portfolio() {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();

  const isConnected = connected && !!publicKey;
  const activePublicKey = publicKey;
  const activeAddress = publicKey?.toBase58() || null;

  // Live prices from Jupiter — SOL, JUP, JTO mainnet mints
  const { prices: livePrices } = useTokenPrices(Object.values(PRICE_MINTS));

  const [solBalance, setSolBalance] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBasketForInvest, setSelectedBasketForInvest] = useState<Basket | null>(null);
  const [investModalOpen, setInvestModalOpen] = useState(false);

  const displayAddress = activeAddress
    ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
    : null;

  // Fetch real Devnet balance
  const fetchBalances = async () => {
    if (!activePublicKey) return;
    try {
      setLoading(true);
      const balanceLamports = await connection.getBalance(activePublicKey);
      const sol = balanceLamports / LAMPORTS_PER_SOL;
      setSolBalance(sol);

      // Query real on-chain SPL tokens on devnet
      const tokenProgramId = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const resp = await connection.getParsedTokenAccountsByOwner(activePublicKey, { programId: tokenProgramId });

      const foundBalances: Record<string, number> = {};
      for (const acc of resp.value) {
        const info = acc.account.data.parsed.info;
        const mint = info.mint;
        const uiAmount = info.tokenAmount.uiAmount || 0;
        foundBalances[mint] = (foundBalances[mint] || 0) + uiAmount;
      }

      const usdcAmt = foundBalances["An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y"] || 0;
      const jupAmt = foundBalances["atvmDFJj7iGLBqJywzbs1Xo9SBpfp3eYjm268g9pwen"] || 0;
      const jtoAmt = foundBalances["8YNCULLBG3u4Si2RQpfAidrv84GVifcf5U1wiEXi95Jg"] || 0;

      const solPrice = livePrices[PRICE_MINTS.SOL]?.priceUsd ?? 148.5;
      const jupPrice = livePrices[PRICE_MINTS.JUP]?.priceUsd ?? 0.85;
      const jtoPrice = livePrices[PRICE_MINTS.JTO]?.priceUsd ?? 2.30;

      const realTokens: TokenBalance[] = [
        {
          symbol: "SOL",
          name: "Solana",
          mint: "So11111111111111111111111111111111111111112",
          amount: Number(sol.toFixed(4)),
          priceUsd: solPrice,
          usdValue: sol * solPrice,
          icon: "/tokens/sol.png",
        },
        {
          symbol: "USDC",
          name: "USD Coin (Devnet)",
          mint: "An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y",
          amount: Number(usdcAmt.toFixed(4)),
          priceUsd: 1.0,
          usdValue: usdcAmt * 1.0,
          icon: "/tokens/usdc.png",
        },
        {
          symbol: "tJUP",
          name: "Jupiter (Devnet)",
          mint: "atvmDFJj7iGLBqJywzbs1Xo9SBpfp3eYjm268g9pwen",
          amount: Number(jupAmt.toFixed(4)),
          priceUsd: jupPrice,
          usdValue: jupAmt * jupPrice,
          icon: "/tokens/jup.png",
        },
        {
          symbol: "tJTO",
          name: "Jito (Devnet)",
          mint: "8YNCULLBG3u4Si2RQpfAidrv84GVifcf5U1wiEXi95Jg",
          amount: Number(jtoAmt.toFixed(4)),
          priceUsd: jtoPrice,
          usdValue: jtoAmt * jtoPrice,
          icon: "/tokens/jto.png",
        },
      ];

      setTokenBalances(realTokens);

      // Load activity from localStorage and backend
      const storageKey = `kairos_invest_${activePublicKey.toBase58()}`;
      const localRecords: ActivityItem[] = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setRecentActivity(localRecords);

      const apiBase = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
      fetch(`${apiBase}/api/positions/${activePublicKey.toBase58()}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.investments?.length > 0) {
            const apiItems: ActivityItem[] = data.investments.map((inv: any) => ({
              action: "Invest",
              basketName: "Solana Infra Governance",
              amountUsdc: inv.amountUsdc,
              tokensDescription: "50% tJUP + 50% tJTO",
              txSignature: inv.txSignature,
              timestamp: inv.createdAt,
            }));
            const seen = new Set(localRecords.map((r: any) => r.txSignature));
            const merged = [...localRecords];
            for (const item of apiItems) {
              if (!seen.has(item.txSignature)) {
                merged.push(item);
                seen.add(item.txSignature);
              }
            }
            setRecentActivity(merged);
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error("Error fetching wallet balances:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && activePublicKey) {
      fetchBalances();
    } else {
      setSolBalance(0);
      setTokenBalances([]);
    }
  }, [isConnected, activePublicKey, livePrices]);

  if (!isConnected) {
    return (
      <PageShell>
        <div className="cesto-page positions-page space-y-8">
          <div className="positions-heading">
            <div>
              <h1 className="font-display font-bold text-3xl sm:text-4xl text-foreground tracking-tight">Your Positions</h1>
              <p className="text-text-secondary text-sm sm:text-base mt-1">Track your positions and get rebalancing updates when market conditions change</p>
            </div>
            <button
              type="button"
              className="history-button"
              onClick={() => window.alert("Position history will appear here after your first investment.")}
            >
              <History size={15} />
              <span>History</span>
            </button>
          </div>

          <section className="empty-positions">
            <div className="space-y-4">
              <div className="empty-compass">
                <Compass size={26} className="text-foreground" />
              </div>
              <div>
                <h2 className="font-display font-bold text-2xl text-foreground">No open positions yet</h2>
                <p className="text-text-secondary text-sm max-w-sm mx-auto mt-1">
                  Your non-custodial positions and constituent tokens will show up here.
                </p>
              </div>
              <div className="pt-2">
                <Link to="/markets" className="explore-button">
                  <span>Explore baskets</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </section>

          <section className="positions-recommendations">
            <h2 className="font-display font-bold text-xl sm:text-2xl text-foreground mb-4">
              Here are some baskets you can invest into
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {CURATED_BASKETS.slice(0, 3).map((basket) => (
                <Link key={basket.id} to={`/markets/${basket.id}`} className="block h-full no-underline">
                  <BasketCard basket={basket} disableLink />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </PageShell>
    );
  }

  if (loading && tokenBalances.length === 0) {
    return (
      <PageShell>
        <PortfolioSkeleton />
      </PageShell>
    );
  }

  const totalPortfolioUsd = tokenBalances.reduce((acc, t) => acc + t.usdValue, 0);
  const hasConstituents = tokenBalances.some(
    (t) => (t.symbol === "tJUP" || t.symbol === "tJTO") && t.amount > 0
  );
  const activeBaskets = hasConstituents ? [DEVNET_DEMO_BASKET] : [];
  const basketTokensUsd = tokenBalances
    .filter((t) => t.symbol === "tJUP" || t.symbol === "tJTO")
    .reduce((acc, t) => acc + t.usdValue, 0);

  return (
    <PageShell>
      {/* Header Section */}
      <section className="border-b border-border/60">
        <div className="container py-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                <span className="font-mono text-foreground font-medium">
                  {displayAddress ?? "Connected"}
                </span>
                <span className="badge-pill">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
                  Devnet Active
                </span>
              </div>
              <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground">Positions</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Real-time self-custody portfolio tracking. All tokens are held directly in your Associated Token Accounts.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchBalances}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              >
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                Refresh
              </button>
              <Link
                to="/markets"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-neutral-200 px-4 py-2 text-sm font-bold text-primary-foreground transition-all"
              >
                Browse baskets
              </Link>
            </div>
          </div>

          {/* 4 Big Stats Grid */}
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
            <BigStat
              label="Total Basket Value"
              value={`$${basketTokensUsd.toFixed(2)}`}
              sub="held tJUP + tJTO ATAs"
              loading={loading}
            />
            <BigStat
              label="Total Devnet Assets"
              value={`$${totalPortfolioUsd.toFixed(2)}`}
              sub="SOL, USDC, tJUP, tJTO"
              accent="success"
              loading={loading}
            />
            <BigStat
              label="Active Baskets"
              value={`${activeBaskets.length} ${activeBaskets.length === 1 ? "Basket" : "Baskets"}`}
              sub={activeBaskets.length > 0 ? "Solana Infra Governance" : "No active holdings"}
              loading={loading}
            />
            <BigStat
              label="Native SOL Balance"
              value={`${solBalance.toFixed(4)} SOL`}
              sub={`≈ $${(solBalance * 148.5).toFixed(2)} USD`}
              loading={loading}
            />
          </div>
        </div>
      </section>

      {/* Active Basket Holdings */}
      <section className="container py-10 space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl text-foreground">Active Basket Holdings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Narrative baskets you currently hold constituent tokens for
            </p>
          </div>
          <Link
            to="/markets"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            Explore all baskets <ArrowUpRight className="size-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {loading ? (
            <>
              <BasketCardSkeleton />
              <BasketCardSkeleton />
            </>
          ) : activeBaskets.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border/80 p-10 text-center space-y-3 bg-surface/40">
              <Layers className="size-8 mx-auto text-muted-foreground/60" />
              <h3 className="font-display font-semibold text-foreground text-sm">No Active Basket Holdings</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                You do not hold basket constituent tokens yet. Deposit devnet USDC to swap directly into 50% tJUP and 50% tJTO.
              </p>
              <Link
                to="/markets/solana-infra-governance"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-neutral-200 text-primary-foreground font-bold text-xs transition-colors"
              >
                Invest in Solana Infra Governance <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            activeBaskets.map((basket) => (
              <div
                key={basket.id}
                className="rounded-2xl border border-border bg-surface p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-border-strong transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Link
                      to={`/markets/${basket.id}`}
                      className="font-display text-lg font-bold text-foreground hover:opacity-80 transition-opacity inline-flex items-center gap-1.5"
                    >
                      {basket.name}
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </Link>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md border border-emerald-600/30 text-emerald-800 bg-emerald-600/10">
                      +{basket.returns7d}% 7d
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {basket.description}
                  </p>

                  {/* Constituents held */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="text-[11px] text-muted-foreground font-medium flex justify-between">
                      <span>Basket Constituents</span>
                      <span>Holding Ratio</span>
                    </div>
                    <div className="space-y-1.5">
                      {basket.tokens.map((token) => (
                        <div
                          key={token.symbol}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-surface-elevated/70 border border-border/50"
                        >
                          <div className="flex items-center gap-2">
                            <img src={token.icon} alt={token.symbol} className="size-4 rounded-full" />
                            <span className="font-semibold text-foreground">{token.symbol}</span>
                            <span className="text-[11px] text-muted-foreground">({token.name})</span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-foreground font-semibold">
                              {token.weightBps / 100}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Estimated Value:{" "}
                    <span className="font-mono font-bold text-foreground">
                      ${basketTokensUsd.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedBasketForInvest(basket);
                      setInvestModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-foreground text-background font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                  >
                    + Add Funds
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Wallet Token Accounts Table */}
      <section className="container py-6 space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl text-foreground">Wallet Token Accounts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              SPL token accounts detected on Solana Devnet
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {tokenBalances.length} tokens
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-ring">
          <div className="grid grid-cols-12 border-b border-border bg-background px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Asset</div>
            <div className="col-span-2 text-right">Balance</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">USD Value</div>
            <div className="col-span-2 text-right">Associated Account</div>
          </div>
          <div className="divide-y divide-border/50 font-mono text-xs">
            {tokenBalances.map((token) => (
              <div key={token.symbol} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-surface-elevated/40 transition-colors">
                <div className="col-span-4 font-sans flex items-center gap-2.5">
                  <img src={token.icon} alt={token.symbol} className="size-5 rounded-full" />
                  <div>
                    <span className="font-bold text-foreground block">{token.symbol}</span>
                    <span className="text-[11px] text-muted-foreground font-sans">{token.name}</span>
                  </div>
                </div>
                <div className="col-span-2 text-right text-foreground font-semibold">
                  {token.amount.toLocaleString()} {token.symbol}
                </div>
                <div className="col-span-2 text-right text-muted-foreground">
                  ${token.priceUsd.toFixed(2)}
                </div>
                <div className="col-span-2 text-right text-foreground font-bold">
                  ${token.usdValue.toFixed(2)}
                </div>
                <div className="col-span-2 text-right">
                  <a
                    href={`https://explorer.solana.com/address/${token.mint}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground font-mono inline-flex items-center gap-1 transition-colors"
                  >
                    {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Execution Activity */}
      <section className="container pb-20 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-foreground">Recent Router Activity</h2>
          <span className="text-xs text-muted-foreground font-mono">Non-custodial history</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-ring">
          <div className="grid grid-cols-12 border-b border-border bg-background px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-2">Action</div>
            <div className="col-span-4">Basket</div>
            <div className="col-span-2">Deposit</div>
            <div className="col-span-2">Delivered ATAs</div>
            <div className="col-span-2 text-right">Solana Explorer</div>
          </div>
          <div className="divide-y divide-border/50 text-xs">
            {recentActivity.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No recent router executions found for this wallet. Invest in the{" "}
                <Link to="/markets/solana-infra-governance" className="text-foreground underline font-semibold">
                  Solana Infra Governance basket
                </Link>{" "}
                to see non-custodial Raydium swaps recorded here.
              </div>
            ) : (
              recentActivity.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-surface-elevated/40 transition-colors">
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-surface-hover text-foreground border border-border">
                      <ArrowDownLeft className="size-3" />
                      {item.action || "Invest"}
                    </span>
                  </div>
                  <div className="col-span-4 font-semibold text-foreground">
                    {item.basketName || "Solana Infra Governance"}
                  </div>
                  <div className="col-span-2 font-mono text-foreground">
                    ${Number(item.amountUsdc).toFixed(2)} USDC
                  </div>
                  <div className="col-span-2 font-mono text-muted-foreground text-[11px]">
                    {item.tokensDescription || "50% tJUP + 50% tJTO"}
                  </div>
                  <div className="col-span-2 text-right">
                    <a
                      href={`https://explorer.solana.com/tx/${item.txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-foreground/80 hover:text-foreground hover:underline font-mono inline-flex items-center gap-1 transition-colors"
                    >
                      {item.txSignature.slice(0, 6)}...{item.txSignature.slice(-4)}
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <InvestModal
        basket={selectedBasketForInvest}
        open={investModalOpen}
        onOpenChange={setInvestModalOpen}
      />
    </PageShell>
  );
}

function BigStat({
  label,
  value,
  sub,
  accent,
  loading = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "success" | "destructive";
  loading?: boolean;
}) {
  return (
    <div className="bg-background p-6">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {loading ? (
        <div className="space-y-2 mt-2">
          <Skeleton className="h-8 w-28 bg-white/[0.08] rounded" />
          <Skeleton className="h-3 w-36 bg-white/[0.04] rounded" />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "mt-2 font-display text-3xl text-foreground",
              accent === "success" && "text-emerald-400",
              accent === "destructive" && "text-rose-400"
            )}
          >
            {value}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">{sub}</div>
        </>
      )}
    </div>
  );
}
