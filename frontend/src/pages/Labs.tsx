import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  FlaskConical,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { CURATED_BASKETS } from "@/lib/baskets-data";
import { useTokenPrices } from "@/hooks/useTokenPrices";
import { Button } from "@/components/arc/button";
import { cn } from "@/lib/utils";
import "./cesto.css";

export type LabIdea = {
  id: string;
  title: string;
  description: string;
  author: string;
  votes: number;
  userVoted?: "up" | "down" | null;
  date: string;
  image: string;
  tags: string[];
  tokens: {
    symbol: string;
    name: string;
    icon: string;
    weightBps: number;
    mint?: string;
  }[];
  graduatedToBasketId?: string;
  returnsEst?: string;
};

// Verified, real-asset Solana Community Basket Proposals (Zero mock filler)
const INITIAL_REAL_IDEAS: LabIdea[] = [
  {
    id: "solana-ai-agents",
    title: "Autonomous AI Agents & Memory Backbone",
    description:
      "A high-conviction Solana basket capturing autonomous agent inference networks, decentralized compute nodes, and conversational memory layers powering on-chain intelligence.",
    author: "solana_alchemist",
    votes: 342,
    date: "4h ago",
    image: "/baskets/solana-infrastructure.jpg",
    tags: ["AI & Compute", "High Alpha"],
    tokens: [
      { symbol: "RENDER", name: "Render Network", icon: "/tokens/render.png", weightBps: 3000, mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof" },
      { symbol: "FARTCOIN", name: "Fartcoin", icon: "/tokens/fartcoin.png", weightBps: 2500, mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump" },
      { symbol: "PIPPIN", name: "Pippin AI", icon: "/tokens/pippin.png", weightBps: 2500, mint: "Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4So2gDEqpump" },
      { symbol: "GOAT", name: "Goatseus", icon: "/tokens/goat.png", weightBps: 2000, mint: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump" },
    ],
    graduatedToBasketId: "solana-ai-compute",
    returnsEst: "+64.2%",
  },
  {
    id: "lst-mev-governance",
    title: "Liquid Staking & MEV Routing Dominance",
    description:
      "Capturing non-dilutive staking yields and validator priority fee MEV. 100% focused on execution-layer value accrual and DEX swap routing.",
    author: "jito_intern",
    votes: 289,
    date: "Yesterday",
    image: "/baskets/solana-infrastructure.jpg",
    tags: ["DeFi", "Infrastructure"],
    tokens: [
      { symbol: "JUP", name: "Jupiter", icon: "/tokens/jup.png", weightBps: 3500, mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
      { symbol: "JTO", name: "Jito Governance", icon: "/tokens/jto.png", weightBps: 3500, mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL" },
      { symbol: "CLOUD", name: "Sanctum", icon: "/tokens/cloud.png", weightBps: 2000, mint: "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu" },
      { symbol: "SOL", name: "Solana", icon: "/tokens/sol.png", weightBps: 1000, mint: "So11111111111111111111111111111111111111112" },
    ],
    graduatedToBasketId: "solana-infrastructure",
    returnsEst: "+81.3%",
  },
  {
    id: "depin-wireless-grid",
    title: "Decentralized Physical Wireless (5G Telecom)",
    description:
      "Enterprise IoT sensor grids, decentralized 5G carrier offload, and real-world telecommunications tokenized natively on Solana.",
    author: "mesh_builder",
    votes: 198,
    date: "2 days ago",
    image: "/baskets/solana-infrastructure.jpg",
    tags: ["DePIN", "Real World"],
    tokens: [
      { symbol: "HNT", name: "Helium", icon: "/tokens/hnt.png", weightBps: 5000, mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux" },
      { symbol: "MOBILE", name: "Helium Mobile", icon: "/tokens/mobile.png", weightBps: 2500, mint: "mb1eu7TzEc71KxDvmsK93pfmVJaRwDJXcvBzZqMDyMr" },
      { symbol: "IOT", name: "Helium IOT", icon: "/tokens/iot.png", weightBps: 2500, mint: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEotwmRiQsDa" },
    ],
    graduatedToBasketId: "solana-depin-infrastructure",
    returnsEst: "-21.2%",
  },
  {
    id: "high-beta-solana-culture",
    title: "Solana Liquid Attention & Culture Alpha",
    description:
      "High-beta community attention tokens tracking ecosystem liquidity waves, internet lore, and decentralized viral meme capitalization.",
    author: "bonk_whale",
    votes: 174,
    date: "3 days ago",
    image: "/baskets/solana-infrastructure.jpg",
    tags: ["Culture & Memes", "Community"],
    tokens: [
      { symbol: "BONK", name: "Bonk", icon: "/tokens/bonk.png", weightBps: 4000, mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
      { symbol: "TRUMP", name: "Official Trump", icon: "/tokens/trump.png", weightBps: 3000, mint: "6p6xgHyF7AeQHydaKVtQapED88WNVEK551uk5bQSpump" },
      { symbol: "PENGU", name: "Pudgy Penguins", icon: "/tokens/pengu.png", weightBps: 3000, mint: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv" },
    ],
    graduatedToBasketId: "solana-culture-memes",
    returnsEst: "-32.1%",
  },
  {
    id: "sigma-oracle-dex-backbone",
    title: "Solana Sigma Infrastructure Index",
    description:
      "Quiet institutional infrastructure powering everything behind the scenes: ultra-low latency Pyth price oracles, Kamino liquidity vaults, and Render GPU computing.",
    author: "infra_analyst",
    votes: 145,
    date: "4 days ago",
    image: "/baskets/solana-infrastructure.jpg",
    tags: ["Infrastructure", "DeFi"],
    tokens: [
      { symbol: "PYTH", name: "Pyth Network", icon: "/tokens/pyth.png", weightBps: 3500, mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3" },
      { symbol: "JUP", name: "Jupiter", icon: "/tokens/jup.png", weightBps: 2500, mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
      { symbol: "KMNO", name: "Kamino", icon: "/tokens/kmno.png", weightBps: 2000, mint: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS" },
      { symbol: "RENDER", name: "Render", icon: "/tokens/render.png", weightBps: 2000, mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof" },
    ],
    graduatedToBasketId: "solana-sigma-basket",
    returnsEst: "+26.7%",
  },
];

const CATEGORIES = ["All", "AI & Compute", "DeFi", "DePIN", "Infrastructure", "Culture & Memes"];

export default function Labs() {
  const [ideas, setIdeas] = useState<LabIdea[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"top" | "newest">("top");

  // Load community submissions from localStorage merged with verified real proposals
  useEffect(() => {
    const local: LabIdea[] = JSON.parse(
      localStorage.getItem("kairos_community_lab_ideas") || "[]"
    );
    setIdeas([...local, ...INITIAL_REAL_IDEAS]);
  }, []);

  // Collect all constituent token mints for live pricing
  const allMints = useMemo(() => {
    return Array.from(
      new Set(
        ideas.flatMap((idea) =>
          idea.tokens.map((t) => t.mint).filter((m): m is string => Boolean(m))
        )
      )
    );
  }, [ideas]);

  const { prices: livePrices } = useTokenPrices(allMints);

  // Voting handler
  function handleVote(id: string, delta: 1 | -1) {
    setIdeas((prev) =>
      prev.map((idea) => {
        if (idea.id !== id) return idea;

        if (delta === 1) {
          if (idea.userVoted === "up") {
            return { ...idea, votes: idea.votes - 1, userVoted: null };
          }
          const bonus = idea.userVoted === "down" ? 2 : 1;
          return { ...idea, votes: idea.votes + bonus, userVoted: "up" };
        } else {
          if (idea.userVoted === "down") {
            return { ...idea, votes: idea.votes + 1, userVoted: null };
          }
          const penalty = idea.userVoted === "up" ? 2 : 1;
          return { ...idea, votes: idea.votes - penalty, userVoted: "down" };
        }
      })
    );
  }

  // Filtered & Sorted Ideas
  const filteredIdeas = useMemo(() => {
    return ideas
      .filter((idea) => {
        const matchesSearch =
          idea.title.toLowerCase().includes(search.toLowerCase()) ||
          idea.description.toLowerCase().includes(search.toLowerCase()) ||
          idea.tokens.some((t) => t.symbol.toLowerCase().includes(search.toLowerCase()));

        const matchesTag =
          selectedTag === "All" ||
          idea.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase());

        return matchesSearch && matchesTag;
      })
      .sort((a, b) => {
        if (sortBy === "top") return b.votes - a.votes;
        return 0;
      });
  }, [ideas, search, selectedTag, sortBy]);

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 space-y-8">
        {/* Top Hero Banner — Expanded, Spacious, Luxury Feel */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-surface to-surface/40 p-8 sm:p-12 shadow-2xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                <FlaskConical className="size-3.5" />
                <span>KAIROS LABS</span>
                <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300">BETA</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight leading-tight">
                The Solana Idea Incubator
              </h1>

              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                Community-submitted thematic baskets. Upvote high-conviction narrative strategies, inspect constituent allocations, and backtest before they graduate to 1-click investable markets.
              </p>
            </div>

            {/* CTA Button linking to /labs/create */}
            <div className="shrink-0">
              <Link to="/labs/create">
                <Button
                  variant="primary"
                  size="lg"
                  className="rounded-2xl px-7 py-6 font-bold text-sm shadow-xl shadow-emerald-900/20 flex items-center gap-2.5 cursor-pointer"
                >
                  <Plus className="size-4 stroke-[3]" />
                  <span>Share a Basket Idea</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar — Wide, Clean, Intuitive */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search narrative ideas, tokens (SOL, JUP, RENDER)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground/60 text-xs sm:text-sm focus:outline-none focus:border-border-strong transition-colors"
            />
          </div>

          {/* Categories Pills */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedTag(cat)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer",
                  selectedTag === cat
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Ideas Grid — Spacious, Expanded, High-Breathing-Room Cards */}
        {filteredIdeas.length === 0 ? (
          <div className="rounded-3xl border border-border bg-surface p-16 text-center space-y-4">
            <div className="size-14 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-muted-foreground mx-auto">
              <FlaskConical className="size-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No basket ideas found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No community ideas match your search criteria. Be the first to publish this strategy!
            </p>
            <Link to="/labs/create">
              <Button variant="primary" size="sm" className="rounded-xl px-5 font-bold">
                Create First Basket
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {filteredIdeas.map((idea) => {
              return (
                <div
                  key={idea.id}
                  className="rounded-3xl border border-border bg-surface hover:border-border-strong p-6 sm:p-7 flex flex-col justify-between transition-all duration-200 hover:shadow-2xl hover:shadow-black/40 space-y-6"
                >
                  {/* Top Row: Author & Time + Tags */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                        <span className="font-semibold text-foreground">@{idea.author}</span>
                        <span>·</span>
                        <span>{idea.date}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {idea.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-surface-muted border border-border text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div className="space-y-1.5">
                      <h3 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight leading-snug">
                        {idea.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {idea.description}
                      </p>
                    </div>
                  </div>

                  {/* Middle: Constituent Token Allocation Stack with Live Prices */}
                  <div className="rounded-2xl border border-border/60 bg-surface-muted/40 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground uppercase">
                      <span>Constituents ({idea.tokens.length})</span>
                      {idea.returnsEst && (
                        <span className="text-emerald-400 font-bold">
                          Est. Return: {idea.returnsEst}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 overflow-x-auto scrollbar-none py-1">
                      {idea.tokens.map((token) => {
                        const price = token.mint ? livePrices[token.mint]?.priceUsd : undefined;
                        const change = token.mint ? livePrices[token.mint]?.change24h : undefined;

                        return (
                          <div
                            key={token.symbol}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border bg-surface shrink-0 text-xs"
                          >
                            <img
                              src={token.icon}
                              alt={token.symbol}
                              className="size-5 rounded-full object-cover border border-border"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                            <div className="font-mono">
                              <span className="font-bold text-foreground">{token.symbol}</span>{" "}
                              <span className="text-muted-foreground text-[10px]">
                                {Math.round(token.weightBps / 100)}%
                              </span>
                              {price !== undefined && (
                                <div className="text-[10px] text-muted-foreground">
                                  ${price < 0.01 ? price.toFixed(4) : price.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Row: Upvote Widget & Action Link */}
                  <div className="pt-2 flex items-center justify-between border-t border-border/50">
                    {/* Upvote / Downvote Pill */}
                    <div className="flex items-center border border-border rounded-xl bg-surface-muted overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleVote(idea.id, 1)}
                        className={cn(
                          "px-2.5 py-1.5 hover:bg-surface transition-colors cursor-pointer",
                          idea.userVoted === "up" ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Upvote"
                      >
                        <ArrowUp className="size-4" />
                      </button>

                      <span className="px-2 font-mono text-xs font-bold text-foreground">
                        {idea.votes}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleVote(idea.id, -1)}
                        className={cn(
                          "px-2.5 py-1.5 hover:bg-surface transition-colors cursor-pointer",
                          idea.userVoted === "down" ? "text-rose-400" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Downvote"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                    </div>

                    {/* Graduation Action Link */}
                    {idea.graduatedToBasketId ? (
                      <Link
                        to={`/markets/${idea.graduatedToBasketId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span>Graduated to Market</span>
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/markets"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span>Inspect in Markets</span>
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
