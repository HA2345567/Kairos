import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { kairosApi } from "@/lib/api-client";
import type { LabsBasket } from "@/lib/api-types";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up";
import ArrowUpDown from "lucide-react/dist/esm/icons/arrow-up-down";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right";
import Boxes from "lucide-react/dist/esm/icons/boxes";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import Clock from "lucide-react/dist/esm/icons/clock";
import Lightbulb from "lucide-react/dist/esm/icons/lightbulb";
import Layers from "lucide-react/dist/esm/icons/layers";
import Medal from "lucide-react/dist/esm/icons/medal";
import Plus from "lucide-react/dist/esm/icons/plus";
import Search from "lucide-react/dist/esm/icons/search";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import Trophy from "lucide-react/dist/esm/icons/trophy";
import { PageShell } from "@/components/layout/PageShell";
import { useBaskets } from "@/lib/baskets-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { HistoricalMiniChart } from "@/components/basket/HistoricalMiniChart";
import "./labs.css";

export type LabIdeaToken = {
  symbol: string;
  name?: string;
  icon: string;
  weightPct?: number;
};

export type LabIdea = {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  votes: number;
  date: string;
  /** Server timestamp used for the "New" sort; absent for curated rows. */
  createdAt?: string;
  status?: string;
  coverImageDataUrl?: string | null;
  tags: string[];
  tokens?: LabIdeaToken[];
};

/**
 * FR-25: Labs ideas are durable server rows now. The previous implementation
 * kept them in `localStorage`, which meant a second visitor saw nothing and a
 * cleared cache lost the basket. Votes are per-wallet and idempotent server-side.
 */
function toLabIdea(
  row: LabsBasket,
  tokensByMint: Map<string, { symbol: string; name: string; icon: string }>,
): LabIdea {
  return {
    id: row.id,
    slug: row.slug,
    title: row.name,
    description: row.thesis,
    author: row.createdBy ? `${row.createdBy.slice(0, 4)}…${row.createdBy.slice(-4)}` : "anonymous",
    votes: row.votes,
    date: row.createdAt,
    createdAt: row.createdAt,
    status: row.status,
    coverImageDataUrl: row.coverImageDataUrl,
    tags: [row.category],
    tokens: row.allocations.map((allocation) => {
      const token = tokensByMint.get(allocation.mint);
      const symbol = token?.symbol ?? `${allocation.mint.slice(0, 4)}…`;
      return {
        symbol,
        name: token?.name,
        icon: token?.icon ?? `/tokens/${symbol.toLowerCase()}.png`,
        weightPct: allocation.weightBps / 100,
      };
    }),
  };
}

type SortKey = "Top" | "New" | "Trending";
const SORT_OPTIONS: SortKey[] = ["Top", "New", "Trending"];

/**
 * Relative-date recency rank in hours (smaller = newer), for the "New" sort.
 * Understands the labels used across the feed ("Just now", "2h ago",
 * "Yesterday", "3 days ago"); unknown labels sink below known ones ordered
 * by feed position.
 */
function recencyHours(idea: LabIdea, feedIndex: number): number {
  if (idea.createdAt) {
    const hours = (Date.now() - Date.parse(idea.createdAt)) / 3_600_000;
    if (Number.isFinite(hours)) return Math.max(0, hours);
  }
  const label = idea.date.trim().toLowerCase();
  if (label === "just now" || label === "now") return 0;
  const hours = /^(\d+)\s*h/.exec(label);
  if (hours) return Number(hours[1]);
  if (label.startsWith("yesterday")) return 24;
  const days = /^(\d+)\s*day/.exec(label);
  if (days) return 24 * Number(days[1]);
  return 24 * 365 + feedIndex;
}

// Shared accessible focus ring for every interactive element on the page
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function Labs() {
  const [ideas, setIdeas] = useState<LabIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadIdeas, setReloadIdeas] = useState(0);
  // Votes are server-owned; this only remembers what this session already cast
  // so the button can reflect it without a second round trip.
  const [voted, setVoted] = useState<string[]>([]);
  const [voting, setVoting] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("Trending");
  const [query, setQuery] = useState("");
  const { data: catalogBaskets = [] } = useBaskets();
  const { data: tokenResponse } = useQuery({
    queryKey: ["token-registry"],
    queryFn: () => kairosApi.getTokens(),
    staleTime: 60_000,
  });
  const { ensureAuthenticated } = useWalletAuth();

  const tokensByMint = useMemo(() => {
    const result = new Map<string, { symbol: string; name: string; icon: string }>();
    for (const basket of catalogBaskets) {
      for (const token of basket.tokens) {
        result.set(token.mint, { symbol: token.symbol, name: token.name, icon: token.icon });
      }
    }
    for (const token of tokenResponse?.tokens ?? []) {
      const symbol = token.symbol.replace(/^t(?=[A-Z])/, "");
      result.set(token.mint, {
        symbol: token.symbol,
        name: token.name,
        icon: `/tokens/${symbol.toLowerCase()}.png`,
      });
    }
    return result;
  }, [catalogBaskets, tokenResponse]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await kairosApi.getLabsBaskets();
        if (cancelled) return;
        setIdeas(response.labsBaskets.map((row) => toLabIdea(row, tokensByMint)));
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Labs ideas are unavailable right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokensByMint, reloadIdeas]);

  // No verified performance ranking is available yet; keep the catalog order.
  const topBaskets = useMemo(() => catalogBaskets.slice(0, 5), [catalogBaskets]);

  // Top Contributors: aggregated net votes per author, derived live from the
  // ideas state so the board updates as soon as any vote changes.
  const contributors = useMemo(() => {
    const scores = new Map<string, number>();
    for (const idea of ideas) {
      scores.set(idea.author, (scores.get(idea.author) ?? 0) + Math.max(idea.votes, 0));
    }
    return [...scores.entries()]
      .map(([name, score]) => ({ name, score, initials: name.slice(0, 2).toUpperCase() }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [ideas]);

  const visible = useMemo(() => {
    const result = ideas.filter((idea) =>
      `${idea.title} ${idea.description} ${idea.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())
    );
    if (sort === "Top") return [...result].sort((a, b) => b.votes - a.votes);
    if (sort === "New") {
      const feedIndex = new Map(ideas.map((idea, index) => [idea.id, index]));
      return [...result].sort(
        (a, b) =>
          recencyHours(a, feedIndex.get(a.id) ?? 0) - recencyHours(b, feedIndex.get(b.id) ?? 0)
      );
    }
    if (sort === "Trending") {
      return [...result].sort((a, b) => {
        const aAge = a.createdAt ? Math.max(0, (Date.now() - Date.parse(a.createdAt)) / 3_600_000) : 24 * 365;
        const bAge = b.createdAt ? Math.max(0, (Date.now() - Date.parse(b.createdAt)) / 3_600_000) : 24 * 365;
        const aScore = a.votes + 1 / (1 + aAge / 24);
        const bScore = b.votes + 1 / (1 + bAge / 24);
        return bScore - aScore;
      });
    }
    return result;
  }, [ideas, query, sort]);

  const vote = (idea: LabIdea, remove = false) => {
    if (voting.includes(idea.id) || (remove && !voted.includes(idea.id))) return;
    setVoting((previous) => [...previous, idea.id]);
    if (remove) {
      setVoted((previous) => previous.filter((id) => id !== idea.id));
    } else {
      setVoted((previous) => previous.includes(idea.id) ? previous : [...previous, idea.id]);
    }
    setIdeas((previous) =>
      previous.map((item) => item.id === idea.id
        ? { ...item, votes: Math.max(0, item.votes + (remove ? -1 : 1)) }
        : item),
    );
    void (async () => {
      try {
        await ensureAuthenticated();
        let serverBasket: LabsBasket;
        if (remove) {
          const result = await kairosApi.removeLabsVote(idea.id);
          serverBasket = result.labsBasket;
          if (!result.removed) setVoted((previous) => previous.filter((id) => id !== idea.id));
        } else {
          const result = await kairosApi.voteLabsBasket(idea.id);
          serverBasket = result.labsBasket;
          if (!result.counted) {
            // A previous session may already have voted. Reflect the server's
            // idempotent no-op so the user can remove that vote from this page.
            setVoted((previous) => previous.includes(idea.id) ? previous : [...previous, idea.id]);
          }
        }
        setIdeas((previous) =>
          previous.map((item) =>
            item.id === idea.id ? { ...item, votes: serverBasket.votes } : item,
          ),
        );
      } catch (error) {
        setVoted((previous) => remove
          ? (previous.includes(idea.id) ? previous : [...previous, idea.id])
          : previous.filter((id) => id !== idea.id));
        setIdeas((previous) =>
          previous.map((item) =>
            item.id === idea.id ? { ...item, votes: Math.max(0, item.votes + (remove ? 1 : -1)) } : item,
          ),
        );
        toast.error(error instanceof Error ? error.message : "Could not record the vote.");
      } finally {
        setVoting((previous) => previous.filter((id) => id !== idea.id));
      }
    })();
  };

  return (
    <PageShell hideFooter contentTag="div">
      <main className="labsroot-page">
          {/* Ideas page heading */}
        <header className="space-y-2">
          <div className="flex items-center gap-2.5">
              <Lightbulb className="size-6 shrink-0 text-foreground" aria-hidden="true" />
            <h1 className="font-display text-[30px] font-semibold leading-9 tracking-tight text-foreground">
              Ideas
            </h1>
          </div>
          <p className="max-w-[672px] text-base leading-relaxed text-foreground/70">
            Community-driven basket ideas. Share your alpha, upvote the best baskets, and build
            community around it.
          </p>
        </header>

        {/* Two-column layout: ~830px feed + 355px sticky sidebar */}
        <div className="labsgrid-layout mt-5">
          <div className="min-w-0">
            {/* Banner CTA — 176px tall: heading top-left, copy below, button row bottom-left */}
            <section
              className="labscta-banner flex min-h-44 flex-col gap-3 p-5"
              aria-labelledby="labs-banner-heading"
            >
              <div>
                <h2
                  id="labs-banner-heading"
                  className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
                >
                  Got a basket idea?
                </h2>
                <p className="mt-1 max-w-[300px] text-[13px] leading-relaxed text-foreground/60">
                  Pick your tokens, set allocations, and share your strategy.
                </p>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2.5">
                <Link to="/labs/create" className={cn("labs-btn-primary no-underline", FOCUS_RING)}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  <span>Create Basket</span>
                </Link>
                <Link to="/markets" className={cn("labs-btn-secondary no-underline", FOCUS_RING)}>
                  Browse Baskets
                </Link>
              </div>
            </section>

            {/* Feed */}
            <section aria-labelledby="labs-feed-heading" className="mt-5">
              <h2 id="labs-feed-heading" className="sr-only">
                Idea feed
              </h2>

              {/* Toolbar: search (left) + standalone sort pill (right, 36px) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  className={cn(
                    "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-muted-foreground transition-colors focus-within:border-border-strong sm:max-w-64",
                    FOCUS_RING
                  )}
                >
                  <Search className="size-3.5 shrink-0" aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Search ideas..."
                    aria-label="Search ideas"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="w-full min-w-0 border-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </label>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Sort ideas"
                      className={cn(
                        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-hover cursor-pointer",
                        FOCUS_RING
                      )}
                    >
                      <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <span>{sort}</span>
                      <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                      {SORT_OPTIONS.map((option) => (
                        <DropdownMenuRadioItem
                          key={option}
                          value={option}
                          className="cursor-pointer text-xs"
                        >
                          {option}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Idea cards — ~16px vertical rhythm, ~158-170px card height */}
              <div className="flex flex-col gap-4 pt-3">
                {visible.map((idea) => {
                  const tokens = idea.tokens || [
                    { symbol: "SOL", icon: "/tokens/sol.png" },
                    { symbol: "JUP", icon: "/tokens/jup.png" },
                  ];
                  const hasVoted = voted.includes(idea.id);

                  return (
                    <article
                      key={idea.id}
                      className="labs-idea-card flex gap-3.5 rounded-xl border border-border bg-surface p-3.5"
                    >
                      {/* Landscape token-collage thumbnail (house style — no AI images) */}
                      <div className="labs-idea-thumb" aria-hidden="true">
                        {idea.coverImageDataUrl ? (
                          <img src={idea.coverImageDataUrl} alt="" className="labs-idea-cover" />
                        ) : (
                          <>
                            <div className="labs-thumb-stack">
                              {tokens.slice(0, 3).map((token, idx) => (
                                <img
                                  key={`${token.symbol}-${idx}`}
                                  src={token.icon}
                                  alt=""
                                  className="relative"
                                  style={{ zIndex: 10 - idx }}
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              ))}
                            </div>
                            <span className="labs-thumb-symbols">
                              {tokens.slice(0, 3).map((token) =>
                                `${token.symbol}${token.weightPct === undefined ? "" : ` ${token.weightPct}%`}`,
                              ).join(" / ")}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        {/* Idea title */}
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base font-semibold leading-snug text-foreground">
                            <Link to={`/labs/${encodeURIComponent(idea.slug || idea.id)}`} className="hover:underline focus-visible:underline">
                              {idea.title}
                            </Link>
                          </h3>
                        </div>

                        <p className="mt-0.5 line-clamp-2 text-xs leading-[1.6] text-foreground/60">
                          {idea.description}
                        </p>

                        <div className="flex justify-end pt-2">
                          <HistoricalMiniChart source="labs" slug={idea.slug || idea.id} compact />
                        </div>

                        {/* Footer: author + bare ghost vote controls */}
                        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-elevated font-mono text-[8px] font-extrabold text-foreground">
                              {idea.author.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="truncate font-medium">{idea.author}</span>
                            <span aria-hidden="true">·</span>
                            <Clock className="size-3 shrink-0" aria-hidden="true" />
                            <span className="shrink-0">{idea.date}</span>
                          </span>

                          <span className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              aria-pressed={hasVoted}
                              aria-label="Upvote idea"
                              className={cn(
                                "grid size-[26px] place-items-center rounded-full transition-colors cursor-pointer",
                                hasVoted
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                                FOCUS_RING
                              )}
                              disabled={voting.includes(idea.id)}
                              onClick={() => vote(idea)}
                            >
                              <ArrowUp className="size-3.5" aria-hidden="true" />
                            </button>
                            <span
                              className="min-w-6 text-center font-mono text-xs font-semibold text-foreground"
                              aria-label={`${idea.votes} votes`}
                            >
                              {idea.votes}
                            </span>
                            <button
                              type="button"
                              aria-pressed={false}
                              aria-label="Remove upvote"
                              className={cn(
                                "grid size-[26px] place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-35",
                                FOCUS_RING
                              )}
                              disabled={!hasVoted || voting.includes(idea.id)}
                              onClick={() => vote(idea, true)}
                            >
                              <ArrowDown className="size-3.5" aria-hidden="true" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {loading && (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center" role="status">
                    <p className="text-sm text-muted-foreground">Loading community ideas…</p>
                  </div>
                )}
                {!loading && loadError && (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center" role="alert">
                    <p className="font-medium text-foreground">Labs ideas are unavailable</p>
                    <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                    <button
                      type="button"
                      className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
                      onClick={() => {
                        setLoading(true);
                        setReloadIdeas((previous) => previous + 1);
                      }}
                    >
                      Try again
                    </button>
                  </div>
                )}
                {!loading && !loadError && ideas.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <p className="font-medium text-foreground">No basket ideas yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Submit an idea — it is stored server-side and reviewed by a moderator before promotion.
                    </p>
                  </div>
                )}

                {!loading && !loadError && ideas.length > 0 && visible.length === 0 && (
                  <div className="rounded-xl border border-border bg-surface px-6 py-14 text-center">
                    <p className="text-sm text-muted-foreground">
                      No ideas match “{query}”. Try another search.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar — one sticky wrapper (top: 32px) holding all panels */}
          <aside className="labsaside-sidebar flex flex-col gap-4" aria-label="Ideas highlights">
            {/* Top Contributors — derived live from the ideas state */}
            <section
              className="rounded-xl border border-border bg-surface p-4"
              aria-labelledby="labs-contributors-heading"
            >
              <h2
                id="labs-contributors-heading"
                className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-foreground"
              >
                <Trophy className="size-3.5" aria-hidden="true" /> Top Contributors
              </h2>
              <ul className="mt-2">
                {contributors.map((contributor, index) => (
                  <li
                    key={contributor.name}
                    className="flex h-[50px] items-center gap-3 rounded-[10px] px-2 py-2.5"
                  >
                    <span className="grid w-4 shrink-0 place-items-center" aria-label={`Rank ${index + 1}`}>
                      {index === 0 ? (
                        <Trophy className="size-3.5 text-amber-400" aria-hidden="true" />
                      ) : index < 3 ? (
                        <Medal className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      )}
                    </span>
                    <span className="grid size-5 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-elevated font-mono text-[8px] font-extrabold text-foreground">
                      {contributor.initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                      {contributor.name}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-sm font-bold leading-tight text-emerald-400">
                        +{contributor.score}
                      </span>
                      <span className="block font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                        Votes
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                to="/ideas/leaderboard"
                className={cn(
                  "-mx-4 -mb-4 mt-2 flex w-full items-center justify-center gap-1 rounded-b-xl border-t border-border py-3 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer",
                  FOCUS_RING
                )}
              >
                View All Rankings <ArrowUpRight className="size-3" aria-hidden="true" />
              </Link>
            </section>

            {/* Top Baskets — catalog baskets ranked by 7-day return */}
            <section
              className="rounded-xl border border-border bg-surface p-4"
              aria-labelledby="labs-top-baskets-heading"
            >
              <h2
                id="labs-top-baskets-heading"
                className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-foreground"
              >
                <Boxes className="size-3.5" aria-hidden="true" /> Featured Baskets
              </h2>
              <ul className="mt-2">
                {topBaskets.map((basket, index) => {
                  const thumbSrc = basket.imageUrl || basket.tokens[0]?.icon;
                  return (
                    <li key={basket.id}>
                      <Link
                        to={`/markets/${basket.id}`}
                        className={cn(
                          "group flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-surface-hover no-underline",
                          FOCUS_RING
                        )}
                      >
                        <span
                          className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground"
                          aria-label={`Rank ${index + 1}`}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-hover">
                          {thumbSrc ? (
                            <img
                              src={thumbSrc}
                              alt=""
                              className="size-full object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <Sparkles className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {basket.name}
                        </span>
                        <HistoricalMiniChart slug={basket.slug || basket.id} compact className="ml-auto" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link
                to="/markets"
                className={cn(
                  "-mx-4 -mb-4 mt-2 flex w-full items-center justify-center gap-1 rounded-b-xl border-t border-border py-3 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground no-underline",
                  FOCUS_RING
                )}
              >
                View All Baskets <ArrowUpRight className="size-3" aria-hidden="true" />
              </Link>
            </section>

            {/* Tip card */}
            <section className="flex gap-2.5 rounded-xl border border-border bg-surface p-4">
              <Layers size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <b className="block text-[11px] text-foreground">Good ideas start with a thesis.</b>
                <p className="mt-1 text-[10px] leading-relaxed text-foreground/60">
                  Tell the community what tokens your basket holds and why they matter.
                </p>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </PageShell>
  );
}
