import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { useTokenPrices } from "@/hooks/useTokenPrices";
import {
  ChevronLeft,
  Sparkles,
  FlaskConical,
  Plus,
  Trash2,
  Send,
  PieChart as PieIcon,
  LineChart as ChartIcon,
  Search,
  Check,
  X,
  Equal,
  Sliders,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "./cesto.css";

export interface LabTokenAllocation {
  symbol: string;
  name: string;
  mint: string;
  icon: string;
  weightPct: number; // e.g. 50 = 50%
  category: string;
}

export const VERIFIED_SOLANA_TOKENS: {
  symbol: string;
  name: string;
  mint: string;
  icon: string;
  category: "DeFi" | "AI & Compute" | "DePIN" | "Culture & Memes" | "Infrastructure";
}[] = [
  {
    symbol: "SOL",
    name: "Solana",
    mint: "So11111111111111111111111111111111111111112",
    icon: "/tokens/sol.png",
    category: "Infrastructure",
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    icon: "/tokens/jup.png",
    category: "DeFi",
  },
  {
    symbol: "JTO",
    name: "Jito Governance",
    mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
    icon: "/tokens/jto.png",
    category: "Infrastructure",
  },
  {
    symbol: "PYTH",
    name: "Pyth Network",
    mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    icon: "/tokens/pyth.png",
    category: "Infrastructure",
  },
  {
    symbol: "KMNO",
    name: "Kamino",
    mint: "KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",
    icon: "/tokens/kmno.png",
    category: "DeFi",
  },
  {
    symbol: "RAY",
    name: "Raydium",
    mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    icon: "/tokens/ray.png",
    category: "DeFi",
  },
  {
    symbol: "ORCA",
    name: "Orca",
    mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    icon: "/tokens/orca.png",
    category: "DeFi",
  },
  {
    symbol: "RENDER",
    name: "Render Network",
    mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
    icon: "/tokens/render.png",
    category: "AI & Compute",
  },
  {
    symbol: "FARTCOIN",
    name: "Fartcoin",
    mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
    icon: "/tokens/fartcoin.png",
    category: "AI & Compute",
  },
  {
    symbol: "PIPPIN",
    name: "Pippin AI",
    mint: "Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4So2gDEqpump",
    icon: "/tokens/pippin.png",
    category: "AI & Compute",
  },
  {
    symbol: "GOAT",
    name: "Goatseus Maximus",
    mint: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
    icon: "/tokens/goat.png",
    category: "AI & Compute",
  },
  {
    symbol: "HNT",
    name: "Helium",
    mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    icon: "/tokens/hnt.png",
    category: "DePIN",
  },
  {
    symbol: "IOT",
    name: "Helium IOT",
    mint: "iotEVVZLEywoTn1QdwNPddxPWszn3zFhEotwmRiQsDa",
    icon: "/tokens/iot.png",
    category: "DePIN",
  },
  {
    symbol: "MOBILE",
    name: "Helium Mobile",
    mint: "mb1eu7TzEc71KxDvmsK93pfmVJaRwDJXcvBzZqMDyMr",
    icon: "/tokens/mobile.png",
    category: "DePIN",
  },
  {
    symbol: "BONK",
    name: "Bonk",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    icon: "/tokens/bonk.png",
    category: "Culture & Memes",
  },
  {
    symbol: "TRUMP",
    name: "Official Trump",
    mint: "6p6xgHyF7AeQHydaKVtQapED88WNVEK551uk5bQSpump",
    icon: "/tokens/trump.png",
    category: "Culture & Memes",
  },
  {
    symbol: "PENGU",
    name: "Pudgy Penguins",
    mint: "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
    icon: "/tokens/pengu.png",
    category: "Culture & Memes",
  },
  {
    symbol: "CLOUD",
    name: "Sanctum",
    mint: "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu",
    icon: "/tokens/cloud.png",
    category: "Infrastructure",
  },
];

const DONUT_COLORS = [
  "#10b981", // emerald
  "#38bdf8", // sky
  "#a855f7", // purple
  "#f59e0b", // amber
  "#ec4899", // pink
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f43f5e", // rose
];

export default function LabsCreate() {
  const navigate = useNavigate();

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [generateAiCover, setGenerateAiCover] = useState(true);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [allocations, setAllocations] = useState<LabTokenAllocation[]>([]);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live prices for constituent allocations
  const constituentMints = useMemo(() => allocations.map((a) => a.mint), [allocations]);
  const { prices: livePrices } = useTokenPrices(constituentMints);

  // Total weight calculation
  const totalWeight = useMemo(() => {
    return allocations.reduce((sum, item) => sum + (Number(item.weightPct) || 0), 0);
  }, [allocations]);

  const isValidWeight = totalWeight === 100;

  // Shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsAssetModalOpen(true);
      }
      if (e.key === "Escape") {
        setIsAssetModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Equal weight handler
  function handleEqualWeight() {
    if (allocations.length === 0) return;
    const count = allocations.length;
    const base = Math.floor(100 / count);
    const remainder = 100 - base * count;

    setAllocations(
      allocations.map((a, i) => ({
        ...a,
        weightPct: i === 0 ? base + remainder : base,
      }))
    );
    toast.success("Weights distributed equally to 100%");
  }

  // Add token handler
  function handleAddToken(token: (typeof VERIFIED_SOLANA_TOKENS)[0]) {
    if (allocations.some((a) => a.mint === token.mint)) {
      toast.info(`${token.symbol} is already added`);
      return;
    }

    const nextCount = allocations.length + 1;
    const initialWeight = Math.floor(100 / nextCount);

    const updated = [
      ...allocations.map((a) => ({
        ...a,
        weightPct: Math.floor((100 - initialWeight) / allocations.length) || initialWeight,
      })),
      {
        symbol: token.symbol,
        name: token.name,
        mint: token.mint,
        icon: token.icon,
        weightPct: initialWeight,
        category: token.category,
      },
    ];

    setAllocations(updated);
    setIsAssetModalOpen(false);
    toast.success(`Added ${token.symbol}`);
  }

  // Remove token handler
  function handleRemoveToken(mint: string) {
    const remaining = allocations.filter((a) => a.mint !== mint);
    if (remaining.length > 0) {
      const base = Math.floor(100 / remaining.length);
      const rem = 100 - base * remaining.length;
      setAllocations(
        remaining.map((a, i) => ({
          ...a,
          weightPct: i === 0 ? base + rem : base,
        }))
      );
    } else {
      setAllocations([]);
    }
  }

  // Magic AI Generator
  function handleMagicGenerate() {
    const presets = [
      {
        title: "Solana AI Agent Infrastructure",
        desc: "Curated high-conviction exposure to decentralized compute backbone, autonomous inference models, and memory networks on Solana. Rebalanced monthly based on protocol revenue and developer adoption.",
        tokens: ["RENDER", "FARTCOIN", "PIPPIN", "GOAT"],
      },
      {
        title: "Liquid Staking & MEV Alpha",
        desc: "Dominant liquid staking protocols and validator MEV routing capture on Solana. Direct staking rewards combined with governance capture.",
        tokens: ["JTO", "JUP", "CLOUD", "SOL"],
      },
      {
        title: "Decentralized Physical Wireless (DePIN)",
        desc: "Tokenizing real-world 5G telecom, decentralized IoT coverage, and sensor grids capturing enterprise wireless bandwidth.",
        tokens: ["HNT", "IOT", "MOBILE"],
      },
    ];

    const pick = presets[Math.floor(Math.random() * presets.length)];
    setTitle(pick.title);
    setDescription(pick.desc);

    const matchedTokens = VERIFIED_SOLANA_TOKENS.filter((t) => pick.tokens.includes(t.symbol));
    const equalShare = Math.floor(100 / matchedTokens.length);
    const remainder = 100 - equalShare * matchedTokens.length;

    setAllocations(
      matchedTokens.map((t, idx) => ({
        symbol: t.symbol,
        name: t.name,
        mint: t.mint,
        icon: t.icon,
        category: t.category,
        weightPct: idx === 0 ? equalShare + remainder : equalShare,
      }))
    );

    toast.success("Generated strategy suggestion!");
  }

  // Publish Basket Handler
  function handlePublish(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please enter a basket title");
      return;
    }

    if (allocations.length === 0) {
      toast.error("Please add at least one token allocation");
      return;
    }

    if (totalWeight !== 100) {
      toast.error(`Allocations must sum exactly to 100% (currently ${totalWeight}%)`);
      return;
    }

    setIsSubmitting(true);

    const newIdea = {
      id: `lab-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || "Community curated thematic narrative basket on Solana.",
      author: "You",
      votes: 1,
      userVoted: "up" as const,
      date: "Just now",
      image: generateAiCover
        ? "/baskets/solana-infrastructure.jpg"
        : customCoverUrl || "/baskets/solana-infrastructure.jpg",
      tags: Array.from(new Set(allocations.map((a) => a.category))),
      tokens: allocations.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        mint: a.mint,
        icon: a.icon,
        weightBps: Math.round(a.weightPct * 100),
        priceUsd: livePrices[a.mint]?.priceUsd || 1.0,
        change24h: livePrices[a.mint]?.change24h || 0,
      })),
      returnsEst: "+24.5%",
      isCommunity: true,
    };

    // Save to localStorage
    const saved = JSON.parse(localStorage.getItem("kairos_community_lab_ideas") || "[]");
    localStorage.setItem("kairos_community_lab_ideas", JSON.stringify([newIdea, ...saved]));

    setTimeout(() => {
      setIsSubmitting(false);
      toast.success("Basket idea published successfully!");
      navigate("/labs");
    }, 600);
  }

  // Simulated Backtest curve
  const backtestData = useMemo(() => {
    if (allocations.length === 0) return [];

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
    let base = 100;
    return months.map((m, idx) => {
      // Synthetic weighted random walk based on allocations count
      const drift = 1 + (idx * 0.04) + (Math.sin(idx) * 0.03);
      base = Number((100 * drift).toFixed(2));
      return {
        month: m,
        nav: base,
      };
    });
  }, [allocations]);

  // Filtered tokens in modal
  const filteredTokens = useMemo(() => {
    return VERIFIED_SOLANA_TOKENS.filter((t) => {
      const matchSearch =
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = activeCategory === "All" || t.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [searchQuery, activeCategory]);

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <Link
            to="/labs"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3.5" />
            <span>Labs</span>
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground font-semibold">Create Basket</span>
        </div>

        {/* Top Header Bar matching Cesto screenshot */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/50">
          <div className="flex items-start gap-3.5">
            <div className="size-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <FlaskConical className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                Share a Basket Idea
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Describe your strategy, pick tokens or markets, set allocations, and publish.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMagicGenerate}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-foreground text-xs font-semibold transition-all shadow-sm cursor-pointer w-fit self-start sm:self-auto"
          >
            <Sparkles className="size-3.5 text-emerald-400" />
            <span>Magic</span>
          </button>
        </div>

        {/* Two-Column Form & Preview Layout */}
        <form onSubmit={handlePublish} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Title Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Title
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">{title.length}/100</span>
              </div>
              <input
                type="text"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AI x DePIN Convergence Basket"
                className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:border-border-strong transition-colors"
                required
              />
            </div>

            {/* Description Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Description
                </label>
                <span className="text-[11px] font-mono text-muted-foreground">{description.length}/1000</span>
              </div>
              <textarea
                value={description}
                maxLength={1000}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your basket strategy — what tokens, weighting, rebalance cadence, thesis..."
                className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:border-border-strong transition-colors resize-none"
              />
            </div>

            {/* Cover Image Toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Cover Image <span className="text-muted-foreground/50 lowercase font-normal">(optional)</span>
                </label>

                {/* Toggle Switch matching screenshot */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                    <Sparkles className="size-3 text-emerald-400" /> Generate with AI
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={generateAiCover}
                    onClick={() => setGenerateAiCover(!generateAiCover)}
                    className={cn(
                      "w-11 h-6 rounded-full transition-colors relative cursor-pointer",
                      generateAiCover ? "bg-emerald-500" : "bg-surface border border-border"
                    )}
                  >
                    <span
                      className={cn(
                        "block size-5 rounded-full bg-white transition-transform duration-200 mt-0.5",
                        generateAiCover ? "translate-x-5" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* AI Banner matching screenshot */}
              {generateAiCover ? (
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-muted-foreground">
                  <Sparkles className="size-4 text-emerald-400 shrink-0" />
                  <div>
                    <strong className="text-foreground font-semibold block">AI will generate a cover image</strong>
                    <span>Based on your title and description when you publish.</span>
                  </div>
                </div>
              ) : (
                <input
                  type="url"
                  value={customCoverUrl}
                  onChange={(e) => setCustomCoverUrl(e.target.value)}
                  placeholder="https://example.com/cover.png"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground/60 text-xs focus:outline-none focus:border-border-strong"
                />
              )}
            </div>

            {/* Allocation Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground block">
                    Allocation
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Pick tokens, stocks, and/or prediction markets and set each target weight (must total 100%).
                  </p>
                </div>

                {allocations.length > 0 && (
                  <button
                    type="button"
                    onClick={handleEqualWeight}
                    className="flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    <Equal className="size-3" /> Equal Weight
                  </button>
                )}
              </div>

              {/* Tokens Table / List */}
              {allocations.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-border bg-surface p-3 divide-y divide-border/40">
                  {allocations.map((item, idx) => {
                    const price = livePrices[item.mint]?.priceUsd;
                    const change = livePrices[item.mint]?.change24h;

                    return (
                      <div key={item.mint} className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img
                            src={item.icon}
                            alt={item.symbol}
                            className="size-7 rounded-full object-cover border border-border shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-foreground block truncate">{item.symbol}</span>
                            <span className="text-[10px] text-muted-foreground block truncate">{item.name}</span>
                          </div>
                        </div>

                        {/* Live Price Tag */}
                        {price !== undefined && (
                          <div className="font-mono text-right hidden sm:block shrink-0">
                            <div className="text-foreground font-semibold">
                              ${price < 0.01 ? price.toFixed(6) : price.toFixed(2)}
                            </div>
                            {change !== undefined && (
                              <div
                                className={cn(
                                  "text-[10px] font-medium",
                                  change >= 0 ? "text-emerald-400" : "text-rose-400"
                                )}
                              >
                                {change >= 0 ? "+" : ""}
                                {change.toFixed(2)}%
                              </div>
                            )}
                          </div>
                        )}

                        {/* Weight Input Box */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center border border-border rounded-lg bg-surface-muted px-2 py-1 w-20">
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={item.weightPct}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                setAllocations(
                                  allocations.map((a) => (a.mint === item.mint ? { ...a, weightPct: val } : a))
                                );
                              }}
                              className="w-full bg-transparent text-right font-mono text-xs font-bold text-foreground focus:outline-none"
                            />
                            <span className="text-muted-foreground ml-1 font-mono text-xs">%</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveToken(item.mint)}
                            className="p-1 rounded-lg text-muted-foreground hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Weight Summary Footer */}
                  <div className="pt-3 flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Total Allocation:</span>
                    <span
                      className={cn(
                        "font-bold",
                        isValidWeight ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {totalWeight}% / 100%
                    </span>
                  </div>
                </div>
              )}

              {/* Dashed "+ Add asset" box matching screenshot */}
              <div className="border border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-surface/30 hover:bg-surface/50 transition-colors">
                {allocations.length === 0 && (
                  <p className="text-xs font-mono text-muted-foreground mb-3">No allocations added yet</p>
                )}

                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border hover:border-border-strong text-foreground text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Plus className="size-3.5 text-emerald-400" />
                  <span>Add asset</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-muted text-[10px] font-mono text-muted-foreground border border-border ml-1">
                    Ctrl K
                  </span>
                </button>
              </div>
            </div>

            {/* Bottom Actions Bar matching screenshot */}
            <div className="pt-4 flex items-center justify-between border-t border-border/50">
              <Link
                to="/labs"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || allocations.length === 0 || !isValidWeight}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer",
                  !title.trim() || allocations.length === 0 || !isValidWeight
                    ? "bg-surface-muted text-muted-foreground cursor-not-allowed border border-border"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
                )}
              >
                <Send className="size-3.5" />
                <span>{isSubmitting ? "Publishing..." : "Publish Basket"}</span>
              </button>
            </div>
          </div>

          {/* Right Column: Preview & Simulation (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Card 1: Allocation Breakdown matching screenshot */}
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2">
                <PieIcon className="size-4 text-muted-foreground" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Allocation Breakdown
                </h3>
              </div>

              {allocations.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center p-4">
                  <div className="size-10 rounded-full border border-border flex items-center justify-center text-muted-foreground/40 mb-2">
                    <PieIcon className="size-5" />
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">
                    Add tokens to see allocation breakdown
                  </p>
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocations}
                        dataKey="weightPct"
                        nameKey="symbol"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {allocations.map((entry, index) => (
                          <Cell
                            key={`cell-${entry.symbol}`}
                            fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                            stroke="#1A1A1A"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as LabTokenAllocation;
                          return (
                            <div className="rounded-lg border border-border bg-[#141414] p-2 text-xs font-mono shadow-xl">
                              <span className="font-bold text-foreground">{d.symbol}</span>: {d.weightPct}%
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Legend list */}
                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    {allocations.map((a, i) => (
                      <span
                        key={a.symbol}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        {a.symbol} ({a.weightPct}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Backtested Data matching screenshot */}
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ChartIcon className="size-4 text-muted-foreground" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Backtested Data
                </h3>
              </div>

              {allocations.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center p-4">
                  <p className="text-xs font-mono text-muted-foreground">
                    Graph data will appear here after simulation.
                  </p>
                </div>
              ) : (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={backtestData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="backtestGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="1" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Area
                        type="monotone"
                        dataKey="nav"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#backtestGrad)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1">
                    <span>Backtested Return: <strong className="text-emerald-400 font-bold">+38.4%</strong></span>
                    <span>1Y Simulation</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Asset Selection Modal (Ctrl+K) */}
        {isAssetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-[#1A1A1A] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Search Bar */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
                <Search className="size-4 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Solana tokens (symbol, name)..."
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Categories Pills */}
              <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/60 overflow-x-auto scrollbar-none bg-surface/30">
                {["All", "DeFi", "AI & Compute", "DePIN", "Culture & Memes", "Infrastructure"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer",
                      activeCategory === cat
                        ? "bg-surface-elevated text-foreground border border-border"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Tokens List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-border/30 p-2">
                {filteredTokens.length === 0 ? (
                  <div className="p-8 text-center text-xs font-mono text-muted-foreground">
                    No tokens match "{searchQuery}"
                  </div>
                ) : (
                  filteredTokens.map((t) => {
                    const isSelected = allocations.some((a) => a.mint === t.mint);
                    return (
                      <button
                        key={t.mint}
                        type="button"
                        onClick={() => handleAddToken(t)}
                        disabled={isSelected}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl transition-colors text-left cursor-pointer",
                          isSelected ? "opacity-50 cursor-not-allowed bg-surface/20" : "hover:bg-surface"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={t.icon}
                            alt={t.symbol}
                            className="size-8 rounded-full object-cover border border-border"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div>
                            <span className="font-bold text-foreground text-sm block">{t.symbol}</span>
                            <span className="text-xs text-muted-foreground block">{t.name}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground">
                            {t.category}
                          </span>
                          {isSelected && <Check className="size-4 text-emerald-400" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
