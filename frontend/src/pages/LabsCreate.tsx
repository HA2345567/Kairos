import { useState, useMemo, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import FlaskConical from "lucide-react/dist/esm/icons/flask-conical";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Send from "lucide-react/dist/esm/icons/send";
import PieIcon from "lucide-react/dist/esm/icons/pie-chart";
import Search from "lucide-react/dist/esm/icons/search";
import Check from "lucide-react/dist/esm/icons/check";
import X from "lucide-react/dist/esm/icons/x";
import Equal from "lucide-react/dist/esm/icons/equal";
import ImagePlus from "lucide-react/dist/esm/icons/image-plus";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { kairosApi } from "@/lib/api-client";
import type { BasketCompositionDraft, TokenRegistryItem } from "@/lib/api-types";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { TokenAvatar } from "@/components/common/TokenAvatar";
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

const MAX_COVER_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_COVER_OUTPUT_BYTES = 550 * 1024;

async function optimizeCoverImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_COVER_UPLOAD_BYTES) {
    throw new Error("Image must be smaller than 15 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (image.naturalWidth > 12000 || image.naturalHeight > 12000) {
      throw new Error("Image dimensions are too large.");
    }

    const scale = Math.min(1, 1600 / image.naturalWidth, 900 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob: Blob | null = null;
    for (const quality of [0.84, 0.76, 0.68, 0.6]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= MAX_COVER_OUTPUT_BYTES) break;
    }
    if (!blob || blob.size > MAX_COVER_OUTPUT_BYTES) {
      throw new Error("This image could not be compressed to a suitable size.");
    }

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this image."));
      reader.onerror = () => reject(new Error("Could not read this image."));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const TOKEN_ICON_PATHS: Record<string, string> = {
  ARX: "/tokens/arx.png",
  BP: "/tokens/bp.png",
  CLOUD: "/tokens/cloud.png",
  NVDA: "/tokens/nvda.svg",
  GOLD: "/tokens/gold.svg",
  TSLA: "/tokens/tesla.svg",
  JUP: "/tokens/jup.png",
  JTO: "/tokens/jto.png",
  BONK: "/tokens/bonk.jpg",
  RENDER: "/tokens/render.png",
  HNT: "/tokens/hnt.png",
  PYTH: "/tokens/pyth.svg",
  KMNO: "/tokens/kmno.png",
  FARTCOIN: "/tokens/fartcoin.svg",
  GOAT: "/tokens/goat.svg",
  IOT: "/tokens/iot.svg",
  JITOSOL: "/tokens/jitosol.png",
  MET: "/tokens/met.png",
  MOBILE: "/tokens/mobile.svg",
  MSOL: "/tokens/msol.png",
  ORCA: "/tokens/orca.png",
  PENGU: "/tokens/pengu.svg",
  PIPPIN: "/tokens/pippin.svg",
  RAY: "/tokens/ray.png",
  SOL: "/tokens/sol.png",
  TRUMP: "/tokens/trump.svg",
  WIF: "/tokens/wif.jpg",
};

function tokenIconPath(symbol: string): string {
  // Devnet registry symbols use a lowercase `t` prefix (tNVDA). Keep normal
  // symbols such as TRUMP intact while mapping synthetic mints to real logos.
  const underlyingSymbol = symbol.replace(/^t(?=[A-Z])/, "").toUpperCase();
  return TOKEN_ICON_PATHS[underlyingSymbol] ?? `/tokens/${underlyingSymbol.toLowerCase()}.png`;
}

function isMarketAsset(token: TokenRegistryItem): boolean {
  const underlyingSymbol = token.symbol.replace(/^t(?=[A-Z])/, "").toUpperCase();
  const isFixtureSymbol = underlyingSymbol === "TEST" || underlyingSymbol === "A" || underlyingSymbol === "B";
  const isFixtureName = /\b(test|fixture|mock)\b/i.test(token.name);
  return !isFixtureSymbol && !isFixtureName;
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
  const [searchParams] = useSearchParams();
  const initialIdea = searchParams.get("idea")?.trim() ?? "";
  const { ensureAuthenticated } = useWalletAuth();
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const [composing, setComposing] = useState(false);
  const [agentDraft, setAgentDraft] = useState<BasketCompositionDraft | null>(null);
  const requestedIdea = useRef("");

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [customCoverImage, setCustomCoverImage] = useState("");
  const coverImageInputRef = useRef<HTMLInputElement>(null);
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
      .filter((token) =>
        !token.denylisted &&
        token.tradingStatus === "active" &&
        token.type !== "stablecoin" &&
        isMarketAsset(token)
      )
      .map((token) => ({
        ...token,
        icon: tokenIconPath(token.symbol),
        category: token.type === "xstock" || token.type === "ondo" ? "Tokenized assets" : "Devnet assets",
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokenResponse]
  );

  // Total weight calculation
  const totalWeight = useMemo(() => {
    return allocations.reduce((sum, item) => sum + (Number(item.weightPct) || 0), 0);
  }, [allocations]);

  const isValidWeight = totalWeight === 100;

  async function handleCoverImageChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      setCustomCoverImage(await optimizeCoverImage(file));
      toast.success("Cover image added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this image.");
    } finally {
      input.value = "";
    }
  }

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
  }

  function handleToggleToken(token: LabRegistryToken) {
    if (allocations.some((allocation) => allocation.mint === token.mint)) {
      handleRemoveToken(token.mint);
      return;
    }
    handleAddToken(token);
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

  // Publish Basket Handler — submits to the durable Labs API (FR-25).
  async function handlePublish(e: FormEvent) {
    e.preventDefault();
    if (submissionInFlight.current) return;

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

    submissionInFlight.current = true;
    setSubmitting(true);
    try {
      await ensureAuthenticated();
      await kairosApi.createLabsBasket({
        name: title.trim(),
        thesis: description.trim() || "Community curated thematic narrative basket on Solana.",
        category: Array.from(new Set(allocations.map((a) => a.category)))[0] || "Labs",
        coverImageDataUrl: customCoverImage || undefined,
        allocations: allocations.map((a) => ({
          mint: a.mint,
          weightBps: Math.round(a.weightPct * 100),
        })),
      });
      toast.success("Submitted for moderation. An admin reviews it before it can be promoted.");
      navigate("/labs");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit this basket.");
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
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

  async function composeIdea(idea: string) {
    setComposing(true);
    setAgentDraft(null);
    setDescription(idea);
    try {
      const { draft } = await kairosApi.composeBasket(idea);
      setAgentDraft(draft);
      setTitle(draft.name);
      setAllocations(draft.allocations.map((allocation) => ({
        symbol: allocation.symbol,
        name: allocation.name,
        mint: allocation.mint,
        icon: tokenIconPath(allocation.symbol),
        weightPct: allocation.weightBps / 100,
        category: draft.category,
      })));
      if (draft.needsClarification) toast.info(draft.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kairos could not map that idea. You can still build the basket manually.");
    } finally {
      setComposing(false);
    }
  }

  useEffect(() => {
    if (!initialIdea || requestedIdea.current === initialIdea) return;
    requestedIdea.current = initialIdea;
    void composeIdea(initialIdea);
  }, [initialIdea]);

  return (
    <PageShell>
      <div className="labs-create-container">
        {/* Breadcrumb navigation: go back, Labs, and current page */}
        <nav className="labs-create-breadcrumbs" aria-label="Breadcrumb">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => navigate(-1)}
            className="labs-create-back-btn"
          >
            <ChevronLeft className="size-4" />
          </button>
          <Link to="/ideas">Ideas</Link>
          <span className="separator">›</span>
          <span className="current">Create Basket</span>
        </nav>

        {/* Kairos top header bar */}
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

        {(initialIdea || agentDraft || composing) && (
          <section className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5" aria-live="polite">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Build with Kairos agents</p>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {composing
                    ? "Reading your idea and matching it to active registry assets..."
                    : agentDraft?.message ?? "Your idea is ready. Review the draft, then adjust the assets and weights yourself."}
                </p>
              </div>
              {initialIdea && (
                <button
                  type="button"
                  onClick={() => void composeIdea(initialIdea)}
                  disabled={composing}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
                >
                  {composing ? "Mapping idea..." : "Regenerate draft"}
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {(agentDraft?.agents ?? [
                { name: "Idea reader", summary: "Identify your basket theme." },
                { name: "Asset mapper", summary: "Match active registry tokens." },
                { name: "Allocation planner", summary: "Create editable target weights." },
              ]).map((agent) => (
                <div key={agent.name} className="rounded-lg bg-background/60 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">{agent.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{agent.summary}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Agent suggestions are a starting point. Every asset and weight stays editable; saving submits the idea for moderation.
            </p>
          </section>
        )}

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
                ref={coverImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCoverImageChange}
                className="sr-only"
                aria-label="Upload a basket cover image"
              />
              {customCoverImage ? (
                <div className="overflow-hidden rounded-xl border border-border bg-surface-muted">
                  <img
                    src={customCoverImage}
                    alt="Basket cover preview"
                    className="block max-h-72 w-full object-contain"
                  />
                  <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                    <span className="text-xs text-muted-foreground">Preview · optimized for sharing</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => coverImageInputRef.current?.click()}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomCoverImage("")}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverImageInputRef.current?.click()}
                  className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-muted/60 px-4 py-5 text-center transition-colors hover:border-foreground/40 hover:bg-surface-muted"
                >
                  <ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">Choose a cover photo</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG or WebP · up to 15 MB</span>
                </button>
              )}
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
                          <TokenAvatar
                            symbol={item.symbol.replace(/^t(?=[A-Z])/, "")}
                            name={item.name}
                            src={item.icon}
                            className="labs-create-token-icon"
                          />
                          <div className="labs-create-token-texts">
                            <span className="labs-create-token-symbol">{item.symbol}</span>
                            <span className="labs-create-token-name">{item.name}</span>
                            {agentDraft?.allocations.find((suggestion) => suggestion.mint === item.mint)?.reason && (
                              <span className="text-xs text-muted-foreground">
                                {agentDraft.allocations.find((suggestion) => suggestion.mint === item.mint)?.reason}
                              </span>
                            )}
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
                disabled={submitting || !title.trim() || allocations.length === 0 || !isValidWeight}
                className="labs-create-publish-btn"
              >
                <Send className="size-3.5" />
                <span>{submitting ? "Saving…" : "Save Idea"}</span>
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
                                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{d.symbol}</span>: {d.weightPct}%
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
                        onClick={() => handleToggleToken(t)}
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? "Remove" : "Add"} ${t.symbol} ${isSelected ? "from" : "to"} basket`}
                        className={`labs-create-modal-item ${isSelected ? "selected" : ""}`}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <TokenAvatar
                            symbol={t.symbol.replace(/^t(?=[A-Z])/, "")}
                            name={t.name}
                            src={t.icon}
                            className="size-8 border border-[var(--border)]"
                          />
                          <div>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem", display: "block" }}>{t.symbol}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>{t.name}</span>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span className="labs-create-category-badge">{t.category}</span>
                          <span className={`labs-create-selection-check ${isSelected ? "checked" : ""}`} aria-hidden="true">
                            {isSelected && <Check className="size-3.5" />}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="labs-create-modal-footer">
                <span>{allocations.length} {allocations.length === 1 ? "asset" : "assets"} selected</span>
                <button type="button" onClick={() => setIsAssetModalOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
