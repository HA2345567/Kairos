import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  Clock,
  FlaskConical,
  Info,
  Layers,
  Medal,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trophy,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { CURATED_BASKETS } from "@/lib/baskets-data";
import { useAllBasketsNav } from "@/hooks/useAllBasketsNav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import "./labs.css";

export type LabIdeaToken = {
  symbol: string;
  name?: string;
  icon: string;
  weightPct?: number;
};

export type LabIdea = {
  id: string;
  title: string;
  description: string;
  author: string;
  votes: number;
  date: string;
  tags: string[];
  tokens?: LabIdeaToken[];
  returnsEst?: string;
  /** Period label shown above the estimated return (defaults to "1Y") */
  returnsPeriod?: string;
};

const INITIAL_IDEAS: LabIdea[] = [
  {
    id: "conviction",
    title: "High Conviction Tech & Industrial Alpha",
    description: "A high growth basket focused on decentralized compute leaders, industrial IoT grids, and the infrastructure powering next-gen AI.",
    author: "SolanaFan",
    votes: 128,
    date: "2h ago",
    tags: ["Technology", "Growth"],
    tokens: [
      { symbol: "RENDER", icon: "/tokens/render.png" },
      { symbol: "HNT", icon: "/tokens/hnt.png" },
      { symbol: "IOT", icon: "/tokens/iot.svg" },
    ],
    returnsEst: "+34.2%",
    returnsPeriod: "1Y",
  },
  {
    id: "ai",
    title: "Ansem’s Top Public Conviction Portfolio",
    description: "Curated liquid basket based on public top positions: Solana ecosystem foundation combined with breakout high-beta tokens.",
    author: "matthew",
    votes: 96,
    date: "5h ago",
    tags: ["Solana", "Community"],
    tokens: [
      { symbol: "SOL", icon: "/tokens/sol.png" },
      { symbol: "BONK", icon: "/tokens/bonk.jpg" },
      { symbol: "JUP", icon: "/tokens/jup.png" },
      { symbol: "RAY", icon: "/tokens/ray.png" },
    ],
    returnsEst: "+48.9%",
    returnsPeriod: "1Y",
  },
  {
    id: "china",
    title: "Autonomous AI & Compute Backplane",
    description: "Next wave of decentralized AI inference: GPU networks, autonomous agent coordination, and open oracle compute on Solana.",
    author: "LuckyB",
    votes: 84,
    date: "Yesterday",
    tags: ["AI", "Compute"],
    tokens: [
      { symbol: "RENDER", icon: "/tokens/render.png" },
      { symbol: "GOAT", icon: "/tokens/goat.svg" },
      { symbol: "PIPPIN", icon: "/tokens/pippin.svg" },
      { symbol: "FARTCOIN", icon: "/tokens/fartcoin.svg" },
    ],
    returnsEst: "+62.1%",
    returnsPeriod: "1Y",
  },
  {
    id: "depin",
    title: "Decentralized Physical Wireless (DePIN)",
    description: "Tokenizing global telecommunications, 5G wireless networks, and IoT sensor networks on Solana.",
    author: "GFLABS",
    votes: 72,
    date: "Yesterday",
    tags: ["DePIN", "Telecom"],
    tokens: [
      { symbol: "HNT", icon: "/tokens/hnt.png" },
      { symbol: "IOT", icon: "/tokens/iot.svg" },
      { symbol: "MOBILE", icon: "/tokens/mobile.svg" },
    ],
    returnsEst: "+27.5%",
    returnsPeriod: "1Y",
  },
  {
    id: "liquid-staking",
    title: "Liquid Staking & MEV Routing Capture",
    description: "Dominant liquid staking protocols and validator MEV capture on Solana. Direct staking yield combined with governance power.",
    author: "SolanaFan",
    votes: 61,
    date: "2 days ago",
    tags: ["Staking", "DeFi"],
    tokens: [
      { symbol: "JTO", icon: "/tokens/jto.png" },
      { symbol: "JUP", icon: "/tokens/jup.png" },
      { symbol: "CLOUD", icon: "/tokens/cloud.png" },
      { symbol: "SOL", icon: "/tokens/sol.png" },
    ],
    returnsEst: "+19.8%",
    returnsPeriod: "30D",
  },
  {
    id: "culture-alpha",
    title: "Solana Culture & Cultural Alpha",
    description: "Top community attention networks capturing consumer mindshare and liquidity across Solana.",
    author: "matthew",
    votes: 58,
    date: "2 days ago",
    tags: ["Culture", "Memes"],
    tokens: [
      { symbol: "BONK", icon: "/tokens/bonk.jpg" },
      { symbol: "TRUMP", icon: "/tokens/trump.svg" },
      { symbol: "PENGU", icon: "/tokens/pengu.svg" },
    ],
    returnsEst: "+51.3%",
    returnsPeriod: "1Y",
  },
  {
    id: "defi-core",
    title: "Solana Core DeFi Money Legos",
    description: "Liquidity routers, lending markets, and automated market makers powering trading volumes on Solana.",
    author: "GFLABS",
    votes: 43,
    date: "3 days ago",
    tags: ["DeFi", "Yield"],
    tokens: [
      { symbol: "JUP", icon: "/tokens/jup.png" },
      { symbol: "KMNO", icon: "/tokens/kmno.png" },
      { symbol: "RAY", icon: "/tokens/ray.png" },
      { symbol: "ORCA", icon: "/tokens/orca.png" },
    ],
    returnsEst: "+31.0%",
    returnsPeriod: "1Y",
  },
  {
    id: "oracle-data",
    title: "Decentralized Oracle & Data Feeds",
    description: "Low-latency financial oracle feeds and infrastructure securing billions in multi-asset on-chain TVL.",
    author: "LuckyB",
    votes: 39,
    date: "3 days ago",
    tags: ["Oracle", "Infrastructure"],
    tokens: [
      { symbol: "PYTH", icon: "/tokens/pyth.svg" },
      { symbol: "SOL", icon: "/tokens/sol.png" },
      { symbol: "JTO", icon: "/tokens/jto.png" },
    ],
    returnsEst: "+22.4%",
    returnsPeriod: "1Y",
  },
];

const KEY = "cesto-labs-ideas-v1";
const COMMUNITY_KEY = "kairos_community_lab_ideas";

function loadIdeas(): LabIdea[] {
  try {
    const rawCommunity = JSON.parse(localStorage.getItem(COMMUNITY_KEY) || "[]");
    const rawSaved = JSON.parse(localStorage.getItem(KEY) || "[]");
    return [...rawCommunity, ...rawSaved, ...INITIAL_IDEAS];
  } catch {
    return INITIAL_IDEAS;
  }
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
  const [ideas, setIdeas] = useState<LabIdea[]>(loadIdeas);
  const [voted, setVoted] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`${KEY}-votes`) || "[]");
    } catch {
      return [];
    }
  });
  const [sort, setSort] = useState<SortKey>("Trending");
  const [query, setQuery] = useState("");

  // Live NAV map from the Kairos backend (polled every 60s) — powers the hero
  // status line. Degrades gracefully when the backend is offline.
  const { data: navMap } = useAllBasketsNav();
  const liveNavCount = useMemo(() => {
    if (!navMap) return null; // still syncing
    return Object.values(navMap).filter(Boolean).length;
  }, [navMap]);

  // Top Baskets: catalog baskets ranked by 7-day return
  const topBaskets = useMemo(
    () => [...CURATED_BASKETS].sort((a, b) => b.returns7d - a.returns7d).slice(0, 5),
    []
  );

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
    return result;
  }, [ideas, query, sort]);

  const vote = (idea: LabIdea) => {
    const already = voted.includes(idea.id);
    const nextVotes = already ? voted.filter((id) => id !== idea.id) : [...voted, idea.id];
    setVoted(nextVotes);
    localStorage.setItem(`${KEY}-votes`, JSON.stringify(nextVotes));
    setIdeas((previous) =>
      previous.map((item) => (item.id === idea.id ? { ...item, votes: item.votes + (already ? -1 : 1) } : item))
    );
  };

  return (
    <PageShell>
      <div className="labsroot-page">
        {/* Hero — 30px/600 display title with inline flask icon + BETA pill */}
        <header className="space-y-2">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="size-6 shrink-0 text-foreground" aria-hidden="true" />
            <h1 className="font-display text-[30px] font-semibold leading-9 tracking-tight text-foreground">
              Labs
            </h1>
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] font-extrabold tracking-widest text-muted-foreground">
              BETA
            </span>
          </div>
          <p className="max-w-[672px] text-base leading-relaxed text-foreground/70">
            Community-driven basket ideas. Share your alpha, upvote the best baskets, and build
            community around it.
          </p>

          {/* Live backend status — Kairos NAV feed, polled every 60s */}
          <p className="flex items-center gap-1.5 pt-0.5 text-[11px] font-mono text-muted-foreground">
            {liveNavCount === null ? (
              <>
                <span className="size-1.5 rounded-full bg-foreground/30 animate-pulse" aria-hidden="true" />
                Syncing live NAV…
              </>
            ) : liveNavCount > 0 ? (
              <>
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                Live NAV · {liveNavCount} basket{liveNavCount === 1 ? "" : "s"} reporting
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-foreground/30 animate-pulse" aria-hidden="true" />
                Live NAV · awaiting first sync
              </>
            )}
          </p>
        </header>

        {/* Two-column layout: ~830px feed + 355px sticky sidebar */}
        <div className="labsgrid-layout mt-5">
          <main className="min-w-0">
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
                  const returnPositive = idea.returnsEst ? !idea.returnsEst.trim().startsWith("-") : true;
                  const yieldBadge = idea.tags.some((tag) => /yield|staking/i.test(tag))
                    ? "Earns yield"
                    : null;

                  return (
                    <article
                      key={idea.id}
                      className="labs-idea-card flex gap-3.5 rounded-xl border border-border bg-surface p-3.5"
                    >
                      {/* Landscape token-collage thumbnail (house style — no AI images) */}
                      <div className="labs-idea-thumb" aria-hidden="true">
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
                          {tokens.map((t) => t.symbol).slice(0, 3).join(" / ")}
                        </span>
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        {/* Title (16px/600) + period/return block top-right */}
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-base font-semibold leading-snug text-foreground">
                            {idea.title}
                          </h3>
                          {idea.returnsEst && (
                            <div className="flex shrink-0 flex-col items-end">
                              <span className="flex items-center gap-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                                <Info className="size-3" aria-hidden="true" />
                                {idea.returnsPeriod ?? "1Y"}
                              </span>
                              <strong
                                className={cn(
                                  "font-mono text-base font-semibold leading-tight",
                                  returnPositive ? "text-emerald-400" : "text-rose-400"
                                )}
                              >
                                {idea.returnsEst}
                              </strong>
                            </div>
                          )}
                        </div>

                        <p className="mt-0.5 line-clamp-2 text-xs leading-[1.6] text-foreground/60">
                          {idea.description}
                        </p>

                        {yieldBadge && (
                          <span className="mt-1.5 inline-flex w-fit items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {yieldBadge}
                          </span>
                        )}

                        {/* Footer: author + bare ghost vote controls */}
                        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
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
                              aria-pressed={hasVoted}
                              aria-label={hasVoted ? "Remove upvote" : "Downvote"}
                              className={cn(
                                "grid size-[26px] place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground cursor-pointer",
                                FOCUS_RING
                              )}
                              onClick={() => hasVoted && vote(idea)}
                            >
                              <ArrowDown className="size-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label="More actions"
                              title="More actions (coming soon)"
                              className={cn(
                                "ml-0.5 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer",
                                FOCUS_RING
                              )}
                            >
                              <MoreHorizontal className="size-4" aria-hidden="true" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {visible.length === 0 && (
                  <div className="rounded-xl border border-border bg-surface px-6 py-14 text-center">
                    <p className="text-sm text-muted-foreground">
                      No ideas match “{query}”. Try another search.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </main>

          {/* Sidebar — one sticky wrapper (top: 32px) holding all panels */}
          <aside className="labsaside-sidebar flex flex-col gap-4" aria-label="Labs highlights">
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
              <button
                type="button"
                className={cn(
                  "-mx-4 -mb-4 mt-2 flex w-full items-center justify-center gap-1 rounded-b-xl border-t border-border py-3 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground cursor-pointer",
                  FOCUS_RING
                )}
                onClick={() => setSort("Top")}
              >
                View All Rankings <ArrowUpRight className="size-3" aria-hidden="true" />
              </button>
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
                <Boxes className="size-3.5" aria-hidden="true" /> Top Baskets
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
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[11px] font-bold",
                            basket.returns7d >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {basket.returns7d >= 0 ? "+" : ""}
                          {basket.returns7d.toFixed(1)}%
                        </span>
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
      </div>
    </PageShell>
  );
}
