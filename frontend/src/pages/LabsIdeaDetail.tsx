import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import Check from "lucide-react/dist/esm/icons/check";
import Clock3 from "lucide-react/dist/esm/icons/clock-3";
import Copy from "lucide-react/dist/esm/icons/copy";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Info from "lucide-react/dist/esm/icons/info";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle";
import PieChart from "lucide-react/dist/esm/icons/pie-chart";
import Share2 from "lucide-react/dist/esm/icons/share-2";
import { PageShell } from "@/components/layout/PageShell";
import { DonutChart, type DonutChartDatum } from "@/components/arc/donut-chart/donut-chart";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { kairosApi } from "@/lib/api-client";
import { cacheMarketHistoryResult, readMarketHistoryCache } from "@/lib/market-history-cache";
import type { BacktestWindow, BasketMarketNavHistoryResponse, LabsBasketResponse, LabsCommentRow } from "@/lib/api-types";
import { useBaskets } from "@/lib/baskets-data";
import "./labs-detail.css";

function shortWallet(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatStatus(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function historyLine(series: Array<{ timestamp: number; navValue: number }>): string {
  if (!series.length) return "";
  const values = series.map((point) => point.navValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.abs(max) * 0.001 || 1;
  const left = 10;
  const top = 12;
  const width = 480;
  const height = 156;
  return series.map((point, index) => {
    const x = left + (series.length === 1 ? width / 2 : (index / (series.length - 1)) * width);
    const y = top + height - ((point.navValue - min) / spread) * height;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

const ALLOCATION_COLORS = ["#38bdf8", "#f43f5e", "#a855f7", "#10b981", "#fbbf24", "#34d399", "#06b6d4", "#6366f1"];

export default function LabsIdeaDetail() {
  const { marketId = "" } = useParams<{ marketId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ensureAuthenticated, authenticated } = useWalletAuth();
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const { data: catalog = [] } = useBaskets();
  const { data: tokenResponse } = useQuery({
    queryKey: ["token-registry"],
    queryFn: () => kairosApi.getTokens(),
    staleTime: 60_000,
  });
  const [historyWindow, setHistoryWindow] = useState<BacktestWindow>("1Y");
  const [commentText, setCommentText] = useState("");
  const [copied, setCopied] = useState(false);
  const [thesisExpanded, setThesisExpanded] = useState(false);
  // Include auth readiness so the detail query is repeated after a wallet
  // session is restored or signed in. A pre-auth response cannot tell whether
  // this wallet has already voted.
  const detailKey = ["labs-basket", marketId, walletAddress ?? "anonymous", authenticated] as const;

  const { data, isLoading, isError, error, refetch } = useQuery<LabsBasketResponse>({
    queryKey: detailKey,
    queryFn: () => kairosApi.getLabsBasket(marketId, walletAddress ?? undefined),
    enabled: Boolean(marketId),
  });

  const basket = data?.labsBasket;
  const voted = data?.viewerVoted ?? false;
  const historyCacheId = `labs:${marketId}:${historyWindow}`;
  const historyQuery = useQuery<BasketMarketNavHistoryResponse>({
    queryKey: ["labs-market-nav-history", marketId, historyWindow],
    queryFn: () => cacheMarketHistoryResult(historyCacheId, () => kairosApi.getLabsBasketMarketNavHistory(marketId, historyWindow)),
    enabled: Boolean(basket),
    initialData: () => readMarketHistoryCache(historyCacheId)?.data,
    initialDataUpdatedAt: () => readMarketHistoryCache(historyCacheId)?.savedAt,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const progress = query.state.data?.progress;
      if (!progress) return 10_000;
      if (progress.loaded >= progress.publicMarkets && !progress.pendingSymbols.length) return false;
      if (progress.pendingSymbols.length) return 15_000;
      if (progress.publicMarkets === 0 && progress.basketAssets > 0 && !query.state.data?.excludedAssets.length) return 30_000;
      return 60_000;
    },
    refetchOnWindowFocus: true,
  });
  const historyPath = useMemo(
    () => historyLine(historyQuery.data?.history ?? []),
    [historyQuery.data?.history],
  );
  const historyPoints = historyQuery.data?.history ?? [];
  const firstHistoryValue = historyPoints[0]?.navValue;
  const latestHistoryValue = historyPoints[historyPoints.length - 1]?.navValue;
  const historyReturnPct = firstHistoryValue && firstHistoryValue > 0 && latestHistoryValue !== undefined && historyPoints.length > 1
    ? ((latestHistoryValue / firstHistoryValue) - 1) * 100
    : null;
  const tokenLookup = useMemo(() => {
    const byMint = new Map<string, { symbol: string; name: string; icon: string }>();
    for (const market of catalog) {
      for (const token of market.tokens) {
        byMint.set(token.mint, { symbol: token.symbol, name: token.name, icon: token.icon });
      }
    }
    for (const token of tokenResponse?.tokens ?? []) {
      const iconSymbol = token.symbol.replace(/^t(?=[A-Z])/, "").toLowerCase();
      byMint.set(token.mint, {
        symbol: token.symbol,
        name: token.name,
        icon: `/tokens/${iconSymbol}.png`,
      });
    }
    return byMint;
  }, [catalog, tokenResponse]);
  const donutData = useMemo<DonutChartDatum[]>(
    () => (basket?.allocations ?? []).map((allocation, index) => {
      const token = tokenLookup.get(allocation.mint);
      return {
        key: allocation.mint,
        label: token?.symbol ?? shortWallet(allocation.mint),
        value: allocation.weightBps / 100,
        color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
      };
    }),
    [basket?.allocations, tokenLookup],
  );

  const voteMutation = useMutation({
    mutationFn: async (removeVote: boolean) => {
      await ensureAuthenticated();
      return removeVote
        ? kairosApi.removeLabsVote(marketId)
        : kairosApi.voteLabsBasket(marketId);
    },
    onSuccess: (result) => {
      const nextBasket = result.labsBasket;
      queryClient.setQueryData<LabsBasketResponse>(detailKey, (current) =>
        current ? {
          ...current,
          labsBasket: nextBasket,
          viewerVoted: "removed" in result ? false : true,
        } : current,
      );
      queryClient.invalidateQueries({ queryKey: ["labs-baskets"] });
      void queryClient.invalidateQueries({ queryKey: detailKey });
      toast.success("removed" in result
        ? result.removed ? "Vote removed." : "You had no vote to remove."
        : result.counted ? "Vote recorded." : "You had already voted.");
    },
    onError: (cause) => toast.error(cause instanceof Error ? cause.message : "Could not save your vote."),
  });

  const commentMutation = useMutation({
    mutationFn: async (body: string) => {
      await ensureAuthenticated();
      return kairosApi.commentLabsBasket(marketId, body);
    },
    onSuccess: ({ comment }) => {
      setCommentText("");
      queryClient.setQueryData<LabsBasketResponse>(detailKey, (current) =>
        current
          ? { ...current, comments: [...(current.comments ?? []), comment] }
          : current,
      );
      toast.success("Comment posted.");
    },
    onError: (cause) => toast.error(cause instanceof Error ? cause.message : "Could not post your comment."),
  });

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: basket?.name ?? "Kairos Labs idea", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast.success("Link copied.");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      toast.error("Could not share this idea.");
    }
  };

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = commentText.trim();
    if (!body || commentMutation.isPending) return;
    commentMutation.mutate(body);
  };

  const comments = (data?.comments ?? []).filter((comment: LabsCommentRow) => !comment.hidden);

  return (
    <PageShell hideFooter contentTag="div">
      <main className="labsdetail-page">
        <div className="labsdetail-breadcrumb">
          <button type="button" className="labsdetail-back" onClick={() => navigate("/labs")} aria-label="Go back">
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <ol>
            <li><Link to="/labs">Labs</Link></li>
            {basket && <li><span className="labsdetail-crumb-current">{basket.name}</span></li>}
          </ol>
        </div>

        {isLoading && (
          <section className="labsdetail-state" role="status">
            <span className="labsdetail-spinner" aria-hidden="true" />
            <p>Loading basket idea…</p>
          </section>
        )}

        {isError && (
          <section className="labsdetail-state" role="alert">
            <h1>Idea unavailable</h1>
            <p>{error instanceof Error ? error.message : "This idea could not be loaded."}</p>
            <div className="labsdetail-state-actions">
              <button type="button" className="labsdetail-button labsdetail-button-secondary" onClick={() => void refetch()}>Try again</button>
              <Link className="labsdetail-button labsdetail-button-primary" to="/labs">Browse Labs</Link>
            </div>
          </section>
        )}

        {basket && (
          <div className="labsdetail-columns">
            <div className="labsdetail-left-column">
              <section className="labsdetail-card labsdetail-idea-card" aria-labelledby="labsdetail-title">
                <div className="labsdetail-idea-header">
                  <div className="labsdetail-cover-wrap">
                    {basket.coverImageDataUrl ? (
                      <img className="labsdetail-cover" src={basket.coverImageDataUrl} alt={`${basket.name} cover`} />
                    ) : (
                      <div className="labsdetail-cover-placeholder" aria-label="No cover image">
                        <div className="labsdetail-cover-icons">
                          {basket.allocations.slice(0, 4).map((allocation) => {
                            const token = tokenLookup.get(allocation.mint);
                            return <img key={allocation.mint} src={token?.icon ?? "/tokens/sol.png"} alt="" />;
                          })}
                        </div>
                        <span>{basket.category}</span>
                      </div>
                    )}
                  </div>
                  <div className="labsdetail-hero-copy">
                    <div className="labsdetail-title-row">
                      <h1 id="labsdetail-title">{basket.name}</h1>
                      <span className={`labsdetail-status labsdetail-status-${basket.status}`}>{formatStatus(basket.status)}</span>
                    </div>
                    <p className={`labsdetail-thesis${thesisExpanded ? " is-expanded" : ""}`}>
                      {basket.thesis || "No thesis has been added to this basket idea yet."}
                    </p>
                    {(basket.thesis?.length ?? 0) > 120 && (
                      <button type="button" className="labsdetail-show-more" onClick={() => setThesisExpanded((expanded) => !expanded)}>
                        {thesisExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                    <div className="labsdetail-actions">
                      <div className="labsdetail-vote-control">
                        <button
                          type="button"
                          className={voted ? "is-active" : ""}
                          aria-label="Upvote"
                          aria-pressed={voted}
                          disabled={voted || voteMutation.isPending || basket.status === "rejected"}
                          onClick={() => voteMutation.mutate(false)}
                        ><ArrowUp size={16} aria-hidden="true" /></button>
                        <strong aria-label={`${basket.votes} votes`}>{basket.votes}</strong>
                        <button
                          type="button"
                          className="labsdetail-vote-remove"
                          aria-label="Remove upvote"
                          disabled={!voted || voteMutation.isPending}
                          onClick={() => voteMutation.mutate(true)}
                        ><ArrowDown size={16} aria-hidden="true" /></button>
                      </div>
                      <button type="button" className="labsdetail-share" onClick={() => void share()} aria-label={copied ? "Link copied" : "Share"}>
                        {copied ? <Check size={16} aria-hidden="true" /> : navigator.share ? <Share2 size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                      </button>
                    </div>
                    <div className="labsdetail-meta">
                      <span className="labsdetail-author-avatar" aria-hidden="true">{basket.createdBy.slice(0, 2).toUpperCase()}</span>
                      <span className="labsdetail-author">{shortWallet(basket.createdBy)}</span>
                      <span className="labsdetail-meta-divider" aria-hidden="true">·</span>
                      <Clock3 size={13} aria-hidden="true" />
                      <time>{formatDate(basket.createdAt)}</time>
                    </div>
                  </div>
                </div>

                <div className="labsdetail-allocation-heading">
                  <span className="labsdetail-allocation-label">Allocation</span>
                  <span>{basket.allocations.length} assets</span>
                </div>
                <div className="labsdetail-allocation-list">
                  {basket.allocations.map((allocation) => {
                    const token = tokenLookup.get(allocation.mint);
                    const weight = allocation.weightBps / 100;
                    return (
                      <div className="labsdetail-allocation" key={allocation.mint}>
                        <span className="labsdetail-token-icon">
                          <img src={token?.icon ?? "/tokens/sol.png"} alt="" onError={(event) => { event.currentTarget.src = "/tokens/sol.png"; }} />
                        </span>
                        <span className="labsdetail-token-name">
                          <strong>{token?.symbol ?? shortWallet(allocation.mint)}</strong>
                          <small>{token?.name ?? allocation.mint}</small>
                        </span>
                        <span className="labsdetail-weight-track" aria-hidden="true"><span style={{ width: `${Math.min(weight, 100)}%` }} /></span>
                        <strong className="labsdetail-weight">{weight.toFixed(weight % 1 ? 1 : 0)}%</strong>
                      </div>
                    );
                  })}
                </div>
                <p className="labsdetail-panel-note">Proposed target allocations. Weights may change before approval.</p>
              </section>

              <section className="labsdetail-card labsdetail-history-card" aria-labelledby="labsdetail-performance-heading">
                <div className="labsdetail-history-header">
                  <div>
                    <h2 id="labsdetail-performance-heading">Backtested Performance</h2>
                    <p>{historyQuery.data?.disclaimer ?? "Hypothetical basket index modeled from available public market candles. Not realized investor returns."}</p>
                  </div>
                  <div className="labsdetail-range-control" role="group" aria-label="Backtest history range">
                    {(["1W", "1M", "6M", "1Y", "3Y"] as const).map((range) => (
                      <button
                        type="button"
                        key={range}
                        className={historyWindow === range ? "is-active" : ""}
                        aria-pressed={historyWindow === range}
                        disabled={historyQuery.isFetching}
                        onClick={() => setHistoryWindow(range)}
                      >{range}</button>
                    ))}
                  </div>
                </div>
                {historyQuery.isLoading ? (
                  <div className="labsdetail-empty-chart" role="status">
                    <div className="labsdetail-empty-chart-copy"><strong>Loading historical data</strong><p>Fetching public market candle history.</p></div>
                  </div>
                ) : historyPoints.length > 1 ? (
                  <div className="labsdetail-empty-chart labsdetail-chart-ready">
                    <div className="labsdetail-chart-grid" aria-hidden="true" />
                    <svg viewBox="0 0 500 180" role="img" aria-label={`${historyWindow} hypothetical basket performance${historyReturnPct == null ? "" : `, ${historyReturnPct.toFixed(2)} percent return`}`} preserveAspectRatio="none">
                      <path d={historyPath} className={historyReturnPct == null || historyReturnPct >= 0 ? "is-positive" : "is-negative"} />
                    </svg>
                    <div className="labsdetail-chart-dates"><time>{formatDate(new Date(historyPoints[0].timestamp).toISOString())}</time><time>{formatDate(new Date(historyPoints[historyPoints.length - 1].timestamp).toISOString())}</time></div>
                    {!historyQuery.data?.complete && <p className="labsdetail-chart-coverage">Partial history: {historyQuery.data?.progress.loaded ?? 0}/{historyQuery.data?.progress.basketAssets ?? basket.allocations.length} assets · {((historyQuery.data?.progress.coverageWeightBps ?? 0) / 100).toFixed(1)}% of target weight represented{historyQuery.data?.excludedAssets.length ? ` · Excluded: ${historyQuery.data.excludedAssets.map((asset) => asset.symbol).join(", ")}` : ""}</p>}
                  </div>
                ) : (
                  (() => {
                    const progress = historyQuery.data?.progress;
                    const building = Boolean(progress && (
                      progress.pendingSymbols.length > 0 ||
                      progress.loaded < progress.publicMarkets ||
                      (progress.publicMarkets === 0 && progress.basketAssets > 0 && !historyQuery.data?.excludedAssets.length)
                    ));
                    return (
                  <div className="labsdetail-empty-chart" role={historyQuery.isError ? "alert" : undefined}>
                    <div className="labsdetail-chart-grid" aria-hidden="true" />
                    <div className="labsdetail-empty-chart-copy">
                      <strong>{historyQuery.isError ? "Historical data unavailable" : building ? "Building basket history" : "No public market history yet"}</strong>
                      <p>{historyQuery.isError
                        ? historyQuery.error instanceof Error
                          ? historyQuery.error.message
                          : "The history service could not be reached. Try again."
                        : building
                          ? `Public price candles are loading${historyQuery.data?.progress.pendingSymbols.length ? ` for ${historyQuery.data.progress.pendingSymbols.join(", ")}` : ""}. This chart will update as the data arrives.`
                          : historyQuery.data?.excludedAssets.length
                            ? `No allocated asset has public candle history for this range. Unavailable feeds: ${historyQuery.data.excludedAssets.map((asset) => asset.symbol).join(", ")}.`
                            : "No allocated asset has enough public candle history for this range yet."}</p>
                      {historyQuery.isError && (
                        <button type="button" className="labsdetail-chart-retry" onClick={() => void historyQuery.refetch()}>Retry</button>
                      )}
                    </div>
                  </div>
                    );
                  })()
                )}
                <div className="labsdetail-history-legend">
                  <span><i className="labsdetail-legend-portfolio" />Hypothetical basket NAV</span>
                  {historyQuery.isFetching && <span>Updating history…</span>}
                </div>
              </section>

              <section className="labsdetail-card labsdetail-comments-card" aria-labelledby="labsdetail-comments-heading">
                <div className="labsdetail-section-heading">
                  <div className="labsdetail-heading-label">
                    <MessageCircle size={16} aria-hidden="true" />
                    <h2 id="labsdetail-comments-heading">Discussion</h2>
                  </div>
                  <span>{comments.length} comments</span>
                </div>
                <form className="labsdetail-comment-form" onSubmit={submitComment}>
                  <textarea
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    maxLength={600}
                    placeholder="Add a comment…"
                    aria-label="Write a comment"
                    rows={3}
                  />
                  <div className="labsdetail-comment-submit-row">
                    <span>{commentText.length}/600</span>
                    <button type="submit" className="labsdetail-button labsdetail-button-primary" disabled={!commentText.trim() || commentMutation.isPending}>
                      {commentMutation.isPending ? "Posting…" : "Post comment"}
                    </button>
                  </div>
                </form>
                <div className="labsdetail-comments">
                  {comments.length ? comments.map((comment) => (
                    <article className="labsdetail-comment" key={comment.id}>
                      <span className="labsdetail-author-avatar" aria-hidden="true">{comment.walletAddress.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <div className="labsdetail-comment-meta"><strong>{shortWallet(comment.walletAddress)}</strong><time>{formatDate(comment.createdAt)}</time></div>
                        <p>{comment.body}</p>
                      </div>
                    </article>
                  )) : <div className="labsdetail-no-comments">No comments yet. Start the discussion.</div>}
                </div>
              </section>
            </div>

            <aside className="labsdetail-side-column">
              <section className="labsdetail-performance-summary" aria-label="Backtested return">
                <div className="labsdetail-summary-label">
                  <span>Backtested Return</span>
                  <Info size={13} aria-hidden="true" />
                </div>
                <strong className={historyReturnPct != null ? (historyReturnPct >= 0 ? "is-positive" : "is-negative") : ""}>
                  {historyReturnPct != null ? `${historyReturnPct >= 0 ? "+" : ""}${historyReturnPct.toFixed(2)}%` : "—"}
                </strong>
                <small>{historyReturnPct != null ? `${historyWindow} hypothetical return` : "Public market history unavailable"}</small>
              </section>

              <section className="labsdetail-card labsdetail-donut-card" aria-labelledby="labsdetail-donut-heading">
                <div className="labsdetail-heading-label">
                  <PieChart size={16} aria-hidden="true" />
                  <h2 id="labsdetail-donut-heading">Allocation Breakdown</h2>
                </div>
                <div className="labsdetail-donut-wrap">
                  <DonutChart
                    data={donutData}
                    label="Allocation Breakdown"
                    unit="%"
                    formatValue={(value) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`}
                    totalLabel="Target"
                    size={180}
                    thickness={26}
                    groupBelow={0}
                    maxSegments={Math.max(donutData.length, 1)}
                    legend={false}
                    className="labsdetail-donut-chart"
                  />
                </div>
                <div className="labsdetail-donut-legend">
                  {basket.allocations.map((allocation, index) => {
                    const token = tokenLookup.get(allocation.mint);
                    return (
                      <div className="labsdetail-legend-row" key={allocation.mint}>
                        <span style={{ background: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] }} />
                        <span title={token?.name ?? allocation.mint}>{token?.symbol ?? shortWallet(allocation.mint)}</span>
                        <strong>{(allocation.weightBps / 100).toFixed(allocation.weightBps % 100 ? 1 : 0)}%</strong>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="labsdetail-review-card">
                <p className="labsdetail-eyebrow">Labs review</p>
                <h2>{basket.status === "promoted" ? "Live basket" : basket.status === "approved" ? "Approved idea" : "Community submission"}</h2>
                <p>{basket.status === "promoted"
                  ? "This idea has been promoted to a Kairos basket."
                  : basket.status === "approved"
                    ? "This idea has passed review and is awaiting promotion."
                    : "Community submissions are reviewed before they can become investable baskets."}</p>
                {basket.basketId && <Link to={`/markets/${basket.basketId}`} className="labsdetail-market-link">View live basket <ExternalLink size={14} aria-hidden="true" /></Link>}
              </section>
            </aside>
          </div>
        )}
      </main>
    </PageShell>
  );
}
