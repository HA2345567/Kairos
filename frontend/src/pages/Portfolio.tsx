import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { useBaskets, type Basket } from "@/lib/baskets-data";
import { kairosApi } from "@/lib/api-client";
import type { Execution } from "@/lib/api-types";
import { InvestModal } from "@/components/basket/InvestModal";
import { PositionActions } from "@/components/portfolio/PositionActions";
import { Link } from "react-router-dom";
import { BasketCardSkeleton } from "@/components/basket/BasketSkeleton";
import { BasketCard } from "@/components/basket/BasketCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useTokenPrices } from "@/hooks/useTokenPrices";
import ArrowDownLeft from "lucide-react/dist/esm/icons/arrow-down-left";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Layers from "lucide-react/dist/esm/icons/layers";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import WalletCards from "lucide-react/dist/esm/icons/wallet-cards";
import { cn } from "@/lib/utils";
import { resolveUsdcMint } from "@/lib/usdc";
import { useAppConfig } from "@/hooks/useAppConfig";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { useKairosWallet } from "@/components/wallet/useKairosWallet";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import "./cesto.css";

interface TokenBalance {
  symbol: string;
  name: string;
  mint: string;
  amount: number;
  priceUsd: number | null;
  usdValue: number | null;
  icon: string;
}

interface ActivityItem {
  executionId: string;
  baseExecutionId?: string;
  recoveryAction?: Execution["recoveryAction"];
  action: string;
  basketName: string;
  depositAmount: number;
  fundingAsset: "USDC" | "SOL";
  tokensDescription: string;
  txSignatures: string[];
  hasInvalidTxReference: boolean;
  timestamp?: string;
  status: Execution["status"];
}

function isSolanaSignature(value: string): boolean {
  return value.length >= 80 && value.length <= 90 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

function toActivityItem(execution: Execution): ActivityItem {
  const action = execution.recoveryAction === "retry"
    ? "Retry"
    : execution.recoveryAction === "unwind"
      ? "Unwind"
      : execution.type === "open" ? "Invest" : execution.type === "close" ? "Close" : "Rebalance";
  const confirmed = execution.legs.filter((leg) => leg.status === "CONFIRMED");
  const recordedSignatures = execution.legs.flatMap((leg) => leg.txSignature ? [leg.txSignature] : []);
  const signatures = [...new Set(recordedSignatures.filter(isSolanaSignature))];
  const progress = `${confirmed.length}/${execution.legs.length} confirmed`;
  const detail = confirmed.length
    ? confirmed.map((leg) => leg.symbol).join(" + ")
    : execution.status === "PREPARED" ? "Awaiting wallet signature"
      : execution.status === "SUBMITTED" || execution.status === "LANDING" ? "Waiting for confirmation"
        : execution.status === "PARTIALLY_COMPLETED" ? "Partial delivery"
          : "No assets confirmed";
  return {
    executionId: execution.id,
    baseExecutionId: execution.baseExecutionId,
    recoveryAction: execution.recoveryAction,
    action,
    // The basket name is resolved by the renderer from the catalog; the id is
    // the authoritative key and is used when the catalog has not loaded yet.
    basketName: execution.basketId,
    depositAmount: execution.fundingAsset === "SOL" ? execution.solInputAmount ?? 0 : execution.totalUsdc,
    fundingAsset: execution.fundingAsset ?? "USDC",
    tokensDescription: `${progress} · ${detail}`,
    txSignatures: signatures,
    hasInvalidTxReference: recordedSignatures.some((signature) => !isSolanaSignature(signature)),
    timestamp: execution.updatedAt,
    status: execution.status,
  };
}

// Mainnet mints used for real price lookups (devnet tokens use mainnet counterpart prices)
const PRICE_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
};
const EMPTY_CATALOG: Basket[] = [];

export default function Portfolio() {
  // Keep the empty fallback stable so balance updates do not retrigger the
  // wallet-fetching effect on every render while the catalog is unavailable.
  const { data: catalogBaskets = EMPTY_CATALOG } = useBaskets();
  const { connected, publicKey, connection } = useKairosWallet();
  const { authenticated, authenticating, error: authError, ensureAuthenticated } = useWalletAuth();

  const isConnected = connected && !!publicKey;
  const activePublicKey = publicKey;
  const { data: appConfig } = useAppConfig();
  const configMint = appConfig?.usdcMint ?? null;
  const activeAddress = publicKey?.toBase58() || null;

  // Live prices from Jupiter — SOL, JUP, JTO mainnet mints
  const { prices: livePrices } = useTokenPrices(Object.values(PRICE_MINTS));

  const [solBalance, setSolBalance] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [hasLoadedBalances, setHasLoadedBalances] = useState(false);
  const [selectedBasketForInvest, setSelectedBasketForInvest] = useState<Basket | null>(null);
  const [investModalOpen, setInvestModalOpen] = useState(false);
  const fetchSequence = useRef(0);
  const balanceWallet = useRef<string | null>(null);

  const positionsQuery = useQuery({
    queryKey: ["positions", activeAddress],
    queryFn: async () => {
      if (!activeAddress) throw new Error("Connect a wallet to load positions.");
      await ensureAuthenticated();
      return kairosApi.getPositions(activeAddress);
    },
    enabled: Boolean(activeAddress && authenticated),
    refetchInterval: 15_000,
  });
  const historyQuery = useQuery({
    queryKey: ["executions", activeAddress],
    queryFn: async () => {
      if (!activeAddress) throw new Error("Connect a wallet to load activity.");
      await ensureAuthenticated();
      return kairosApi.getWalletExecutions(activeAddress);
    },
    enabled: Boolean(activeAddress && authenticated),
    refetchInterval: 15_000,
  });

  const displayAddress = activeAddress
    ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
    : null;

  // Fetch native SOL and SPL balances from Devnet. Both SPL token programs are
  // queried so Token-2022 assets do not disappear from the page.
  const fetchBalances = useCallback(async () => {
    if (!activePublicKey) return;
    const address = activePublicKey.toBase58();
    if (balanceWallet.current !== address) {
      balanceWallet.current = address;
      setSolBalance(0);
      setTokenBalances([]);
      setHasLoadedBalances(false);
    }
    const sequence = ++fetchSequence.current;
    try {
      setLoading(true);
      setBalanceError(null);
      const tokenProgramIds = [
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      ];
      const [balanceLamports, ...tokenResponses] = await Promise.all([
        connection.getBalance(activePublicKey),
        ...tokenProgramIds.map((programId) => connection.getParsedTokenAccountsByOwner(activePublicKey, { programId })),
      ]);
      if (sequence !== fetchSequence.current) return;
      const sol = balanceLamports / LAMPORTS_PER_SOL;
      setSolBalance(sol);

      const foundBalances: Record<string, number> = {};
      for (const response of tokenResponses) {
        for (const acc of response.value) {
          const info = acc.account.data.parsed.info;
          const mint = info.mint as string;
          const uiAmount = Number(info.tokenAmount.uiAmountString ?? info.tokenAmount.uiAmount ?? 0);
          foundBalances[mint] = (foundBalances[mint] || 0) + (Number.isFinite(uiAmount) ? uiAmount : 0);
        }
      }

      // FR-16: resolve the configured USDC mint; never a hardcoded constant.
      const usdcMint = resolveUsdcMint(configMint);
      const usdcAmt = usdcMint ? foundBalances[usdcMint] || 0 : 0;
      const solReference = livePrices[PRICE_MINTS.SOL];
      const solPrice = solReference?.status === "current" ? solReference.priceUsd : null;

      const knownTokens = new Map(catalogBaskets.flatMap((basket) => basket.tokens).map((token) => [token.mint, token]));
      const heldTokens = Object.entries(foundBalances)
        .filter(([, amount]) => amount > 0)
        .map(([mint, amount]) => {
          const token = knownTokens.get(mint);
          return {
            symbol: token?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`,
            name: token?.name ?? "Unregistered Devnet token",
            mint,
            amount,
            priceUsd: null,
            usdValue: null,
            icon: token?.icon ?? "/tokens/sol.png",
          } satisfies TokenBalance;
        });
      const realTokens: TokenBalance[] = [
        {
          symbol: "SOL",
          name: "Solana",
          mint: "So11111111111111111111111111111111111111112",
          amount: Number(sol.toFixed(4)),
          priceUsd: solPrice,
          usdValue: solPrice === null ? null : sol * solPrice,
          icon: "/tokens/sol.png",
        },
        ...(usdcMint ? [{
          symbol: "USDC",
          name: "USD Coin (Devnet)",
          mint: usdcMint,
          amount: Number(usdcAmt.toFixed(6)),
          priceUsd: 1,
          usdValue: Number(usdcAmt.toFixed(6)),
          icon: "/tokens/usdc.png",
        }] : []),
        ...heldTokens.filter((token) => token.mint !== usdcMint),
      ];

      setTokenBalances(realTokens);
      setHasLoadedBalances(true);
    } catch (err) {
      if (sequence === fetchSequence.current) {
        const message = err instanceof Error ? err.message : "Could not load Devnet balances.";
        setBalanceError(message);
        console.error("Error fetching wallet balances:", err);
      }
    } finally {
      if (sequence === fetchSequence.current) setLoading(false);
    }
  }, [activePublicKey, catalogBaskets, configMint, connection, livePrices]);

  useEffect(() => {
    if (isConnected && activePublicKey) {
      void fetchBalances();
    } else {
      fetchSequence.current += 1;
      setSolBalance(0);
      setTokenBalances([]);
      setHasLoadedBalances(false);
      balanceWallet.current = null;
      setBalanceError(null);
      setLoading(false);
    }
    return () => { fetchSequence.current += 1; };
  }, [isConnected, activeAddress, fetchBalances]);

  if (!isConnected) {
    return (
      <PageShell>
        <div className="cesto-page positions-page space-y-8">
          <div className="positions-heading">
            <div>
              <h1 className="font-display font-bold text-3xl sm:text-4xl text-foreground tracking-tight">Your Positions</h1>
              <p className="text-text-secondary text-sm sm:text-base mt-1">Track your positions and get rebalancing updates when market conditions change</p>
            </div>
          </div>

          <section className="empty-positions">
            <div className="space-y-4">
              <div className="empty-compass">
                <WalletCards size={26} className="text-foreground" />
              </div>
              <div>
                <h2 className="font-display font-bold text-2xl text-foreground">Connect your wallet</h2>
                <p className="text-text-secondary text-sm max-w-sm mx-auto mt-1">
                  Connect the wallet that holds your Devnet assets to load balances, basket positions, and execution history.
                </p>
              </div>
              <ConnectWalletButton className="mt-2" />
            </div>
          </section>

          <section className="positions-recommendations">
            <h2 className="font-display font-bold text-xl sm:text-2xl text-foreground mb-4">
              Here are some baskets you can invest into
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {catalogBaskets.slice(0, 3).map((basket) => (
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

  const positions = positionsQuery.data?.positions ?? [];
  const activePositions = positions.filter((position) => position.status !== "CLOSED");
  const basketValueUsd = activePositions.reduce((sum, position) => sum + position.currentValueUsd, 0);
  const trackedPriceByMint = new Map<string, number>();
  for (const position of activePositions) {
    for (const leg of position.legs) {
      if (leg.currentAmount > 0 && leg.currentValueUsd >= 0) {
        trackedPriceByMint.set(leg.mint, leg.currentValueUsd / leg.currentAmount);
      }
    }
  }
  const valuedTokenBalances = tokenBalances.map((token) => {
    const priceUsd = token.priceUsd ?? trackedPriceByMint.get(token.mint) ?? null;
    return { ...token, priceUsd, usdValue: priceUsd === null ? null : token.amount * priceUsd };
  });
  const totalPortfolioUsd = hasLoadedBalances && valuedTokenBalances.every((token) => token.usdValue !== null)
    ? valuedTokenBalances.reduce((sum, token) => sum + (token.usdValue ?? 0), 0)
    : null;
  const recentActivity = (historyQuery.data?.executions ?? []).map((execution) => {
    const item = toActivityItem(execution);
    return {
      ...item,
      basketName: catalogBaskets.find((basket) => basket.id === execution.basketId)?.name ?? execution.basketId,
    };
  });

  return (
    <PageShell>
      <PositionActions key={activeAddress} address={activeAddress!} />
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
                onClick={() => {
                  void fetchBalances();
                  if (authenticated) {
                    void positionsQuery.refetch();
                    void historyQuery.refetch();
                  }
                }}
                disabled={loading || positionsQuery.isFetching || historyQuery.isFetching}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              >
                <RefreshCw className={cn("size-3.5", (loading || positionsQuery.isFetching || historyQuery.isFetching) && "animate-spin")} />
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
              value={authenticated && !positionsQuery.isLoading ? `$${basketValueUsd.toFixed(2)}` : "—"}
              sub={authenticated ? `${activePositions.length} tracked basket positions` : authenticating ? "Linking connected wallet" : "Waiting for wallet session"}
              loading={loading || positionsQuery.isLoading}
            />
            <BigStat
              label="Total Devnet Assets"
              value={totalPortfolioUsd === null ? "—" : `$${totalPortfolioUsd.toFixed(2)}`}
              sub={totalPortfolioUsd === null ? "Some Devnet assets have no price source" : "Indicative wallet value"}
              accent="success"
              loading={loading}
            />
            <BigStat
              label="Open Positions"
              value={`${activePositions.length} ${activePositions.length === 1 ? "Position" : "Positions"}`}
              sub={authenticated ? (activePositions.length ? "Open basket positions" : "No open basket positions") : authenticating ? "Linking connected wallet" : "Waiting for wallet session"}
              loading={loading || positionsQuery.isLoading}
            />
            <BigStat
              label="Native SOL Balance"
              value={`${solBalance.toFixed(4)} SOL`}
              sub={livePrices[PRICE_MINTS.SOL]?.status !== "current"
                ? livePrices[PRICE_MINTS.SOL]?.status === "stale" ? "SOL market reference is stale" : "SOL price unavailable"
                : `Estimated $${(solBalance * livePrices[PRICE_MINTS.SOL].priceUsd).toFixed(2)} USD`}
              loading={loading}
            />
          </div>
          {balanceError && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200" role="alert">
              <span>Could not refresh wallet balances: {balanceError}</span>
              <button type="button" className="underline underline-offset-4" onClick={() => void fetchBalances()}>Try again</button>
            </div>
          )}
          {authenticated && positionsQuery.isError && (
            <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200" role="alert">
              Could not load backend positions. Wallet balances remain visible; refresh to retry.
            </div>
          )}
          {!authenticated && authenticating && (
            <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground" role="status">
              Securely linking your connected wallet to load your positions. Approve the one-time sign-in request in your wallet if prompted.
            </div>
          )}
          {!authenticated && authError && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200" role="alert">
              <span>Could not link the connected wallet: {authError}</span>
              <button type="button" className="underline underline-offset-4" onClick={() => void ensureAuthenticated().catch(() => undefined)}>Retry</button>
            </div>
          )}
        </div>
      </section>

      {/* Backend positions refreshed against Devnet by the API. */}
      <section className="container py-10 space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl text-foreground">Your Basket Positions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Position values use refreshed wallet balances and available price data.
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
          {!authenticated ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground bg-surface/40">
              {authError
                ? "Your wallet is connected, but its secure session could not be restored. Use Retry above to try again."
                : authenticating
                  ? "Linking your connected wallet to load protected basket positions…"
                  : "Connecting your wallet above will load protected basket positions automatically."}
            </div>
          ) : positionsQuery.isLoading ? (
            <>
              <BasketCardSkeleton />
              <BasketCardSkeleton />
            </>
          ) : positionsQuery.isError ? (
            <div className="col-span-full rounded-2xl border border-rose-400/30 bg-rose-400/5 p-8 text-center space-y-3" role="alert">
              <h3 className="font-display font-semibold text-foreground text-sm">Positions could not be loaded</h3>
              <p className="text-xs text-muted-foreground">Wallet token balances remain available. Retry the protected positions request.</p>
              <button type="button" onClick={() => void positionsQuery.refetch()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-elevated text-xs font-semibold">
                <RefreshCw className="size-3.5" /> Retry
              </button>
            </div>
          ) : activePositions.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border/80 p-10 text-center space-y-3 bg-surface/40">
              <Layers className="size-8 mx-auto text-muted-foreground/60" />
              <h3 className="font-display font-semibold text-foreground text-sm">No Active Basket Holdings</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Confirmed investments create positions here. Individual Devnet token balances are still listed below.
              </p>
              <Link
                to="/markets"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-neutral-200 text-primary-foreground font-bold text-xs transition-colors"
              >
                Browse baskets <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            activePositions.map((position) => {
              const basket = catalogBaskets.find((item) => item.id === position.basketId);
              return (
                <div key={position.id} className="rounded-2xl border border-border bg-surface p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-border-strong transition-all">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Link to={`/positions/${position.id}`} className="font-display text-lg font-bold text-foreground hover:opacity-80 transition-opacity inline-flex items-center gap-1.5">
                        {basket?.name ?? position.basketId}<ArrowUpRight className="size-4 text-muted-foreground" />
                      </Link>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md border border-border text-muted-foreground bg-surface-elevated/50">
                        {position.status} · {position.driftPct.toFixed(1)}% drift
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{basket?.description ?? `Basket version ${position.basketVersionId}`}</p>
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="text-[11px] text-muted-foreground font-medium flex justify-between">
                        <span>Assets held</span><span>Live value</span>
                      </div>
                      <div className="space-y-1.5">
                        {position.legs.map((leg) => (
                          <div key={leg.mint} className="flex items-center justify-between text-xs p-2 rounded-lg bg-surface-elevated/70 border border-border/50">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{leg.symbol}</span>
                              <span className="text-[11px] text-muted-foreground">{leg.currentAmount.toLocaleString()} held</span>
                            </div>
                            <span className="font-mono font-semibold text-foreground">${leg.currentValueUsd.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">Current value: <span className="font-mono font-bold text-foreground">${position.currentValueUsd.toFixed(2)}</span></div>
                    {basket && <button onClick={() => { setSelectedBasketForInvest(basket); setInvestModalOpen(true); }} className="px-3.5 py-1.5 rounded-lg bg-foreground text-background font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-sm">+ Add Funds</button>}
                  </div>
                </div>
              );
            })
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
            {valuedTokenBalances.length} assets
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-ring">
          <div className="min-w-[720px]">
          <div className="grid grid-cols-12 border-b border-border bg-background px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Asset</div>
            <div className="col-span-2 text-right">Balance</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">USD Value</div>
            <div className="col-span-2 text-right">Mint / Explorer</div>
          </div>
          <div className="divide-y divide-border/50 font-mono text-xs">
            {valuedTokenBalances.map((token) => (
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
                  {token.priceUsd === null ? "—" : `$${token.priceUsd.toFixed(2)}`}
                </div>
                <div className="col-span-2 text-right text-foreground font-bold">
                  {token.usdValue === null ? "—" : `$${token.usdValue.toFixed(2)}`}
                </div>
                <div className="col-span-2 text-right">
                  <a
                    href={`https://explorer.solana.com/address/${token.symbol === "SOL" ? activeAddress : token.mint}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground font-mono inline-flex items-center gap-1 transition-colors"
                  >
                    {token.symbol === "SOL" ? "Wallet" : `${token.mint.slice(0, 4)}...${token.mint.slice(-4)}`}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      </section>

      {/* Execution Activity */}
      <section className="container pb-20 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-foreground">Execution History</h2>
          <span className="text-xs text-muted-foreground font-mono">Non-custodial history</span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-ring">
          <div className="min-w-[760px]">
          <div className="grid grid-cols-12 border-b border-border bg-background px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="col-span-2">Action</div>
            <div className="col-span-4">Basket</div>
            <div className="col-span-2">Deposit</div>
            <div className="col-span-2">Confirmed legs</div>
            <div className="col-span-2 text-right">Solana Explorer</div>
          </div>
          <div className="divide-y divide-border/50 text-xs">
            {!authenticated ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {authError ? "Waiting for a secure wallet session. Use Retry above to try again."
                  : authenticating ? "Linking your connected wallet…"
                    : "Execution history loads automatically after your wallet is connected."}
              </div>
            ) : historyQuery.isLoading ? (
              <div className="p-8 text-center text-xs text-muted-foreground" role="status">Loading execution history…</div>
            ) : historyQuery.isError ? (
              <div className="p-8 text-center text-xs text-rose-200" role="alert">Could not load execution history. Try refreshing the page.</div>
            ) : recentActivity.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No executions are recorded for this wallet yet. Browse baskets to get started.
                <Link to="/markets" className="ml-1 text-foreground underline font-semibold">Explore baskets</Link>
              </div>
            ) : (
              recentActivity.map((item) => (
                <div key={item.executionId} className="grid grid-cols-12 items-center px-5 py-3.5 hover:bg-surface-elevated/40 transition-colors">
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-surface-hover text-foreground border border-border">
                      {item.action === "Close" || item.action === "Unwind" ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                      {item.action || "Invest"}
                    </span>
                    <span className="block mt-1 text-[10px] text-muted-foreground">{item.status}</span>
                  </div>
                  <div className="col-span-4 font-semibold text-foreground">
                    <Link to={`/executions/${item.executionId}`} className="hover:underline">{item.basketName}</Link>
                    <span className="block text-[10px] font-normal text-muted-foreground">{item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}</span>
                    {item.baseExecutionId && (
                      <Link to={`/executions/${item.baseExecutionId}`} className="block text-[10px] font-normal text-muted-foreground hover:text-foreground hover:underline">
                        Recovery of {item.baseExecutionId.slice(0, 14)}…
                      </Link>
                    )}
                  </div>
                  <div className="col-span-2 font-mono text-foreground">
                    {item.fundingAsset === "SOL"
                      ? `${Number(item.depositAmount).toFixed(4)} SOL`
                      : `$${Number(item.depositAmount).toFixed(2)} USDC`}
                  </div>
                  <div className="col-span-2 font-mono text-muted-foreground text-[11px]">
                    {item.tokensDescription || "Basket holdings"}
                  </div>
                  <div className="col-span-2 text-right">
                    {item.txSignatures.length === 0 ? (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.hasInvalidTxReference ? "invalid tx reference"
                          : item.status === "PREPARED" ? "awaiting signature"
                          : item.status === "SUBMITTED" || item.status === "LANDING" ? "awaiting confirmation"
                            : "no landed tx"}
                      </span>
                    ) : item.txSignatures.length === 1 ? (
                      <a
                        href={`https://explorer.solana.com/tx/${item.txSignatures[0]}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-foreground/80 hover:text-foreground hover:underline font-mono inline-flex items-center gap-1 transition-colors"
                      >
                        {item.txSignatures[0].slice(0, 6)}...{item.txSignatures[0].slice(-4)}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <details className="relative inline-block text-left">
                        <summary className="list-none cursor-pointer text-xs text-foreground/80 hover:text-foreground font-mono underline underline-offset-2">
                          {item.txSignatures.length} txs
                        </summary>
                        <div className="absolute right-0 z-20 mt-2 max-h-48 min-w-40 overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-xl">
                          {item.txSignatures.map((signature, index) => (
                            <a
                              key={signature}
                              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px] text-foreground/80 hover:bg-surface-hover hover:text-foreground"
                            >
                              <span>Leg {index + 1}</span>
                              <span className="font-mono">{signature.slice(0, 5)}…{signature.slice(-4)}</span>
                            </a>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
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
