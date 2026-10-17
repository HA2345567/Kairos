import { useState, useMemo, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import {
  ChevronLeft,
  FlaskConical,
  Plus,
  Trash2,
  Send,
  PieChart as PieIcon,
  Search,
  Check,
  X,
  Equal,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { kairosApi } from "@/lib/api-client";
import type { TokenRegistryItem } from "@/lib/api-types";
import "./labs-create.css";

export interface LabTokenAllocation {
  symbol: string;
  name: string;
  mint: string;
  icon: string;
  weightPct: number; // e.g. 50 = 50%
  category: string;
}

interface LabRegistryToken extends TokenRegistryItem {
  icon: string;
  category: string;
}

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
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [allocations, setAllocations] = useState<LabTokenAllocation[]>([]);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const { data: tokenResponse, isLoading: tokensLoading, isError: tokensFailed } = useQuery({
    queryKey: ["token-registry"],
    queryFn: () => kairosApi.getTokens(),
    staleTime: 60_000,
  });
  const availableTokens = useMemo<LabRegistryToken[]>(
    () => (tokenResponse?.tokens ?? [])
      .filter((token) => !token.denylisted && token.tradingStatus === "active" && token.type !== "stablecoin")
      .map((token) => ({
        ...token,
        icon: `/tokens/${token.symbol.replace(/^t/, "").toLowerCase()}.png`,
        category: token.type === "xstock" || token.type === "ondo" ? "Tokenized assets" : "Devnet assets",
      })),
    [tokenResponse]
  );

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
  function handleAddToken(token: LabRegistryToken) {
    if (allocations.some((a) => a.mint === token.mint)) {
      toast.info(`${token.symbol} is already added`);
      return;
    }

    const nextCount = allocations.length + 1;
    const baseWeight = Math.floor(100 / nextCount);
    const remainder = 100 - baseWeight * nextCount;
    const updated = [
      ...allocations,
      {
        symbol: token.symbol,
        name: token.name,
        mint: token.mint,
        icon: token.icon,
        weightPct: baseWeight,
        category: token.category,
      },
    ].map((item, index) => ({ ...item, weightPct: baseWeight + (index === 0 ? remainder : 0) }));

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

  // Publish Basket Handler
  function handlePublish(e: FormEvent) {
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

    const newIdea = {
      id: `lab-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || "Community curated thematic narrative basket on Solana.",
      author: "You",
      votes: 0,
      date: "Just now",
      image: customCoverUrl || "/baskets/solana-infrastructure.jpg",
      tags: Array.from(new Set(allocations.map((a) => a.category))),
      tokens: allocations.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        mint: a.mint,
        icon: a.icon,
        weightBps: Math.round(a.weightPct * 100),
      })),
    };

    // Save to localStorage
    const saved = JSON.parse(localStorage.getItem("kairos_community_lab_ideas") || "[]");
    localStorage.setItem("kairos_community_lab_ideas", JSON.stringify([newIdea, ...saved]));

    toast.success("Saved in this browser. Community publishing is not connected yet.");
    navigate("/labs");
  }

  // Filtered tokens in modal
  const filteredTokens = useMemo(() => {
    return availableTokens.filter((t) => {
      const matchSearch =
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = activeCategory === "All" || t.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [availableTokens, searchQuery, activeCategory]);
  const categories = ["All", ...new Set(availableTokens.map((token) => token.category))];

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
              <p>Describe your strategy and choose active assets from the devnet registry.</p>
            </div>
          </div>

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

            {/* Optional cover image */}
            <div className="labs-create-cover-group">
              <div className="labs-create-field-header">
                <label className="labs-create-label">Cover Image (optional)</label>
              </div>
              <input
                type="url"
                value={customCoverUrl}
                onChange={(e) => setCustomCoverUrl(e.target.value)}
                placeholder="https://example.com/cover.png"
                className="labs-create-input"
              />
            </div>

            {/* Allocation Section */}
            <div className="labs-create-field">
              <div className="labs-create-alloc-header">
                <div>
                  <label className="labs-create-label">Allocation</label>
                  <p className="labs-create-alloc-desc">
                    Pick active devnet registry assets and set each target weight (must total 100%).
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
                disabled={!title.trim() || allocations.length === 0 || !isValidWeight}
                className="labs-create-publish-btn"
              >
                <Send className="size-3.5" />
                <span>Save Idea</span>
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

            {/* Historical performance is only shown after verified snapshots exist. */}
            <div className="labs-create-preview-card labs-create-card-history">
              <h3 className="labs-create-card-title">Historical Performance</h3>
              <div className="labs-create-empty-state">
                <p>Unavailable until verified historical price data is connected.</p>
              </div>
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
                {categories.map((cat) => (
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
                {tokensLoading ? (
                  <div className="labs-create-modal-empty">Loading devnet assets…</div>
                ) : tokensFailed ? (
                  <div className="labs-create-modal-empty">Token registry is unavailable. Try again later.</div>
                ) : filteredTokens.length === 0 ? (
                  <div className="labs-create-modal-empty">
                    {availableTokens.length ? `No tokens match "${searchQuery}"` : "No active devnet assets are available."}
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
