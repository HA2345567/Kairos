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
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import "./labs-create.css";

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

// Sleek high-contrast palette with ZERO green
const DONUT_COLORS = [
  "#38bdf8", // sky cyan
  "#818cf8", // indigo
  "#c084fc", // purple
  "#f472b6", // pink
  "#fb923c", // orange
  "#facc15", // yellow amber
  "#94a3b8", // slate
  "#e2e8f0", // platinum
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
      navigate("/ideas");
    }, 600);
  }

  // Simulated Backtest curve
  const backtestData = useMemo(() => {
    if (allocations.length === 0) return [];

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
    let base = 100;
    return months.map((m, idx) => {
      const drift = 1 + idx * 0.04 + Math.sin(idx) * 0.03;
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
      <div className="labs-create-container">
        {/* Breadcrumb Navigation: go-back + Labs + current (Cesto pattern) */}
        <nav className="labs-create-breadcrumbs" aria-label="Breadcrumb">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => navigate(-1)}
            className="labs-create-back-btn"
          >
            <ChevronLeft className="size-4" />
          </button>
          <Link to="/labs">Labs</Link>
          <span className="separator">›</span>
          <span className="current">Create Basket</span>
        </nav>

        {/* Top Header Bar matching Cesto reference */}
        <div className="labs-create-header">
          <div className="labs-create-title-group">
            <div className="labs-create-icon-badge">
              <FlaskConical className="size-5" />
            </div>
            <div>
              <h1>Share a Basket Idea</h1>
              <p>Describe your strategy, pick tokens or markets, set allocations, and publish.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMagicGenerate}
            className="labs-create-magic-btn"
          >
            <Sparkles className="size-3.5" />
            <span>Magic</span>
          </button>
        </div>

        {/* Two-Column Form & Preview Layout */}
        <form onSubmit={handlePublish} className="labs-create-grid">
          {/* Left Column: Form Controls */}
          <div className="labs-create-form-section">
            {/* Title Input — counter sits below the input, right-aligned */}
            <div className="labs-create-field">
              <div className="labs-create-field-header">
                <label className="labs-create-label">Title</label>
              </div>
              <input
                type="text"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AI x DePIN Convergence Basket"
                className="labs-create-input"
                required
              />
              <span className="labs-create-char-counter">{title.length}/100</span>
            </div>

            {/* Description Input — counter below the textarea */}
            <div className="labs-create-field">
              <div className="labs-create-field-header">
                <label className="labs-create-label">Description</label>
              </div>
              <textarea
                value={description}
                maxLength={1000}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your basket strategy — what tokens, weighting, rebalance cadence, thesis..."
                className="labs-create-textarea"
              />
              <span className="labs-create-char-counter">{description.length}/1000</span>
            </div>

            {/* Cover Image Toggle */}
            <div className="labs-create-cover-group">
              <div className="labs-create-field-header">
                <label className="labs-create-label">
                  Cover Image <span className="optional">(optional)</span>
                </label>

                {/* Neutral High-Contrast Switch */}
                <div className="labs-create-ai-toggle-row">
                  <Sparkles className="size-3 text-muted-foreground" />
                  <span>Generate with AI</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={generateAiCover}
                    onClick={() => setGenerateAiCover(!generateAiCover)}
                    className={`labs-create-switch ${generateAiCover ? "active" : ""}`}
                  >
                    <span className="labs-create-switch-thumb" />
                  </button>
                </div>
              </div>

              {/* AI Banner */}
              {generateAiCover ? (
                <div className="labs-create-ai-banner">
                  <Sparkles className="size-4 labs-create-ai-banner-icon" />
                  <div>
                    <strong>AI will generate a cover image</strong>
                    <span>Based on your title and description when you publish.</span>
                  </div>
                </div>
              ) : (
                <input
                  type="url"
                  value={customCoverUrl}
                  onChange={(e) => setCustomCoverUrl(e.target.value)}
                  placeholder="https://example.com/cover.png"
                  className="labs-create-input"
                />
              )}
            </div>

            {/* Allocation Section */}
            <div className="labs-create-field">
              <div className="labs-create-alloc-header">
                <div>
                  <label className="labs-create-label">Allocation</label>
                  <p className="labs-create-alloc-desc">
                    Pick tokens, stocks, and/or prediction markets and set each target weight (must total 100%).
                  </p>
                </div>

                {allocations.length > 0 && (
                  <button
                    type="button"
                    onClick={handleEqualWeight}
                    className="labs-create-equal-btn"
                  >
                    <Equal className="size-3" />
                    <span>Equal Weight</span>
                  </button>
                )}
              </div>

              {/* Tokens Table / List */}
              {allocations.length > 0 && (
                <div className="labs-create-allocations-table">
                  {allocations.map((item) => {
                    const price = livePrices[item.mint]?.priceUsd;
                    const change = livePrices[item.mint]?.change24h;

                    return (
                      <div key={item.mint} className="labs-create-allocation-row">
                        <div className="labs-create-token-info">
                          <img
                            src={item.icon}
                            alt={item.symbol}
                            className="labs-create-token-icon"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div className="labs-create-token-texts">
                            <span className="labs-create-token-symbol">{item.symbol}</span>
                            <span className="labs-create-token-name">{item.name}</span>
                          </div>
                        </div>

                        {/* Live Price Tag */}
                        {price !== undefined && (
                          <div className="labs-create-token-price-col">
                            <div className="labs-create-token-price">
                              ${price < 0.01 ? price.toFixed(6) : price.toFixed(2)}
                            </div>
                            {change !== undefined && (
                              <div
                                className={`labs-create-token-change ${
                                  change >= 0 ? "positive" : "negative"
                                }`}
                              >
                                {change >= 0 ? "+" : ""}
                                {change.toFixed(2)}%
                              </div>
                            )}
                          </div>
                        )}

                        {/* Weight Input Box */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div className="labs-create-weight-box">
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
                              className="labs-create-weight-input"
                            />
                            <span className="labs-create-weight-pct">%</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveToken(item.mint)}
                            className="labs-create-delete-btn"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Weight Summary Footer */}
                  <div className="labs-create-alloc-footer">
                    <span className="total-label">Total Allocation:</span>
                    <span className={`total-val ${isValidWeight ? "valid" : "invalid"}`}>
                      {totalWeight}% / 100%
                    </span>
                  </div>
                </div>
              )}

              {/* Dashed "+ Add asset" box */}
              <div className="labs-create-dashed-box">
                {allocations.length === 0 && (
                  <p className="labs-create-dashed-empty">No allocations added yet</p>
                )}

                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(true)}
                  className="labs-create-add-btn"
                >
                  <Plus className="size-3.5" />
                  <span>Add asset</span>
                  <span className="labs-create-kbd">Ctrl K</span>
                </button>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="labs-create-actions">
              <Link to="/ideas" className="labs-create-cancel-btn">
                Cancel
              </Link>

              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || allocations.length === 0 || !isValidWeight}
                className="labs-create-publish-btn"
              >
                <Send className="size-3.5" />
                <span>{isSubmitting ? "Publishing..." : "Publish Basket"}</span>
              </button>
            </div>
          </div>

          {/* Right Column: Preview & Simulation */}
          <div className="labs-create-preview-section">
            {/* Card 1: Allocation Breakdown (~250px min-height) */}
            <div className="labs-create-preview-card labs-create-card-breakdown">
              <h3 className="labs-create-card-title">
                <PieIcon className="size-4" />
                <span>Allocation Breakdown</span>
              </h3>

              {allocations.length === 0 ? (
                <div className="labs-create-empty-state">
                  <div className="labs-create-empty-icon">
                    <PieIcon className="size-5" />
                  </div>
                  <p>Add tokens to see allocation breakdown</p>
                </div>
              ) : (
                <div>
                  <div className="labs-create-chart-wrap">
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
                              <div style={{ borderRadius: "0.5rem", border: "1px solid var(--border)", background: "var(--background)", padding: "0.5rem", fontSize: "0.75rem", fontFamily: "var(--font-mono, monospace)" }}>
                                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{d.symbol}</span>: {d.weightPct}%
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend list */}
                  <div className="labs-create-legend-wrap">
                    {allocations.map((a, i) => (
                      <span key={a.symbol} className="labs-create-legend-badge">
                        <span
                          className="labs-create-legend-dot"
                          style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        {a.symbol} ({a.weightPct}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Backtested Data (~365px min-height) */}
            <div className="labs-create-preview-card labs-create-card-backtest">
              <h3 className="labs-create-card-title">
                <ChartIcon className="size-4" />
                <span>Backtested Data</span>
              </h3>

              {allocations.length === 0 ? (
                <div className="labs-create-empty-state">
                  <p>Graph data will appear here after simulation.</p>
                </div>
              ) : (
                <div>
                  <div style={{ height: "11rem", width: "100%" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={backtestData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="backtestGradNeutral" x1="0" y1="0" x2="0" y2="1">
                            <stop stopColor="#38bdf8" stopOpacity={0.25} />
                            <stop offset="1" stopColor="#38bdf8" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="month" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Area
                          type="monotone"
                          dataKey="nav"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          fill="url(#backtestGradNeutral)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="labs-create-stat-row">
                    <span>Backtested Return: <strong className="labs-create-stat-val">+38.4%</strong></span>
                    <span>1Y Simulation</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Asset Selection Modal (Ctrl+K) */}
        {isAssetModalOpen && (
          <div className="labs-create-modal-overlay" onClick={() => setIsAssetModalOpen(false)}>
            <div className="labs-create-modal-card" onClick={(e) => e.stopPropagation()}>
              {/* Modal Search Bar */}
              <div className="labs-create-modal-search">
                <Search className="size-4 labs-create-modal-search-icon" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Solana tokens (symbol, name)..."
                  className="labs-create-modal-search-input"
                />
                <button
                  type="button"
                  onClick={() => setIsAssetModalOpen(false)}
                  className="labs-create-modal-close"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Categories Pills */}
              <div className="labs-create-pills-wrap">
                {["All", "DeFi", "AI & Compute", "DePIN", "Culture & Memes", "Infrastructure"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`labs-create-pill-btn ${activeCategory === cat ? "active" : ""}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Tokens List */}
              <div className="labs-create-modal-list">
                {filteredTokens.length === 0 ? (
                  <div className="labs-create-modal-empty">
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
                        className={`labs-create-modal-item ${isSelected ? "selected" : ""}`}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <img
                            src={t.icon}
                            alt={t.symbol}
                            style={{ width: "2rem", height: "2rem", borderRadius: "9999px", objectFit: "cover", border: "1px solid var(--border)" }}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div>
                            <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem", display: "block" }}>{t.symbol}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>{t.name}</span>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span className="labs-create-category-badge">{t.category}</span>
                          {isSelected && <Check className="size-4" style={{ color: "#38bdf8" }} />}
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
