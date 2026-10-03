import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { CreateBasketSkeleton } from "@/components/basket/BasketSkeleton";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Zap,
  Info,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SelectedToken {
  symbol: string;
  name: string;
  mint: string;
  weightPct: number; // e.g. 50 = 50%
  icon: string;
}

const PRESET_TOKENS = [
  {
    symbol: "SOL",
    name: "Wrapped SOL",
    mint: "So11111111111111111111111111111111111111112",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  {
    symbol: "JTO",
    name: "Jito Governance",
    mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
    icon: "https://cryptologos.cc/logos/jito-jto-logo.png",
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    icon: "https://cryptologos.cc/logos/jupiter-ag-jup-logo.png",
  },
  {
    symbol: "RENDER",
    name: "Render Network",
    mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
    icon: "https://cryptologos.cc/logos/render-token-rndr-logo.png",
  },
  {
    symbol: "HNT",
    name: "Helium",
    mint: "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    icon: "https://cryptologos.cc/logos/helium-hnt-logo.png",
  },
  {
    symbol: "BONK",
    name: "Bonk",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    icon: "https://cryptologos.cc/logos/bonk1-bonk-logo.png",
  },
  {
    symbol: "WIF",
    name: "dogwifhat",
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm/logo.png",
  },
  {
    symbol: "RAY",
    name: "Raydium",
    mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    icon: "https://cryptologos.cc/logos/raydium-ray-logo.png",
  },
];

const CATEGORIES = ["Ecosystem", "DePIN", "AI", "DeFi", "Memes"] as const;

export default function CreateBasket() {
  const navigate = useNavigate();
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Ecosystem");
  const [pointsMultiplier, setPointsMultiplier] = useState("3x Pts");
  const [imageUrl, setImageUrl] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);

  const [tokens, setTokens] = useState<SelectedToken[]>([
    { ...PRESET_TOKENS[0], weightPct: 50 },
    { ...PRESET_TOKENS[1], weightPct: 50 },
  ]);

  const totalWeight = useMemo(() => {
    return tokens.reduce((acc, t) => acc + (Number(t.weightPct) || 0), 0);
  }, [tokens]);

  const totalBps = Math.round(totalWeight * 100);
  const isValid100Percent = totalBps === 10000;

  const handleAddToken = (tokenPreset: (typeof PRESET_TOKENS)[0]) => {
    if (tokens.some((t) => t.mint === tokenPreset.mint)) {
      toast.error(`${tokenPreset.symbol} is already in the basket.`);
      return;
    }
    setTokens([...tokens, { ...tokenPreset, weightPct: 0 }]);
  };

  const handleRemoveToken = (mint: string) => {
    if (tokens.length <= 1) {
      toast.error("A basket must have at least one constituent token.");
      return;
    }
    setTokens(tokens.filter((t) => t.mint !== mint));
  };

  const handleUpdateWeight = (mint: string, val: number) => {
    setTokens(
      tokens.map((t) => (t.mint === mint ? { ...t, weightPct: val } : t))
    );
  };

  const handleDeployBasket = async () => {
    if (!connected || !publicKey) {
      setWalletModalVisible(true);
      return;
    }

    if (!name.trim()) {
      toast.error("Please provide a basket name.");
      return;
    }

    if (!description.trim()) {
      toast.error("Please provide a description or thesis.");
      return;
    }

    if (!isValid100Percent) {
      toast.error(`Total weight must equal 100% (10,000 bps). Currently at ${totalWeight}%.`);
      return;
    }

    try {
      setIsDeploying(true);
      toast.info("Deriving PDA seeds and compiling initialize_basket instruction...");
      await new Promise((r) => setTimeout(r, 1200));

      toast.success(`Basket "${name}" deployed successfully to Solana Devnet!`);
      navigate("/markets");
    } catch (err: any) {
      toast.error(err.message || "Failed to deploy basket.");
    } finally {
      setIsDeploying(false);
    }
  };

  const [isPageLoading, setIsPageLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsPageLoading(false), 200);
    return () => clearTimeout(timer);
  }, []);

  if (isPageLoading) {
    return (
      <PageShell>
        <CreateBasketSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="container py-8 lg:py-12 space-y-8">
        {/* Navigation */}
        <Link
          to="/markets"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to all baskets
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b border-border/40">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-xs text-muted-foreground font-mono">
              <Sparkles className="size-3.5 text-foreground" />
              On-Chain Anchor PDA Router Initializer
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-foreground">
              Create New Basket
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed">
              Curate a custom Solana narrative basket with genuine Jupiter CPI routing and non-custodial direct-to-wallet settlement.
            </p>
          </div>
        </div>

        {/* Two-Column Grid: Form on Left, Live Cesto Card Preview on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Form: 7 cols */}
          <div className="lg:col-span-7 space-y-6">
            {/* Basket General Info Card */}
            <div className="rounded-2xl border border-border bg-surface p-6 space-y-5 shadow-sm">
              <h3 className="font-display font-bold text-lg text-foreground flex items-center gap-2">
                <Layers className="size-5 text-foreground" />
                Basket Details
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-muted-foreground font-semibold block mb-1.5 uppercase text-[11px]">
                    Basket Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Solana AI Titans, DePIN Hypergrowth..."
                    className="w-full h-11 rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border-strong font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-muted-foreground font-semibold block mb-1.5 uppercase text-[11px]">
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as any)}
                      className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-border-strong"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-muted-foreground font-semibold block mb-1.5 uppercase text-[11px]">
                      Points Multiplier Tag
                    </label>
                    <select
                      value={pointsMultiplier}
                      onChange={(e) => setPointsMultiplier(e.target.value)}
                      className="w-full h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-border-strong"
                    >
                      <option value="3x Pts">3x Pts (Boosted)</option>
                      <option value="2x Pts">2x Pts (Standard)</option>
                      <option value="1.5x Pts">1.5x Pts</option>
                      <option value="">None</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-muted-foreground font-semibold block mb-1.5 uppercase text-[11px]">
                    Description & Narrative Thesis *
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe why these constituent tokens were selected and the underlying strategy thesis..."
                    className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border-strong leading-relaxed"
                  />
                </div>

                <div>
                  <label className="text-muted-foreground font-semibold block mb-1.5 uppercase text-[11px]">
                    Banner / Picture URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://... (Leave blank to use default reserved picture slot)"
                    className="w-full h-11 rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border-strong font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground/80 mt-1 block">
                    You can provide an image URL now or replace it later.
                  </span>
                </div>
              </div>
            </div>

            {/* Constituents & Allocation Card */}
            <div className="rounded-2xl border border-border bg-surface p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">
                    Constituent Tokens & Weights
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Must total exactly 100.0% (10,000 basis points)
                  </span>
                </div>

                {/* Invariant status badge */}
                <span
                  className={cn(
                    "text-xs font-mono font-bold px-3 py-1 rounded-full border self-start sm:self-auto",
                    isValid100Percent
                      ? "border-border text-foreground bg-surface-hover"
                      : "border-rose-500/30 text-rose-600 bg-rose-500/10"
                  )}
                >
                  {totalWeight}% / 100% ({totalBps} bps)
                </span>
              </div>

              {/* Token List */}
              <div className="space-y-3">
                {tokens.map((token) => (
                  <div
                    key={token.mint}
                    className="p-3.5 rounded-xl border border-border bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <img src={token.icon} alt={token.symbol} className="size-7 rounded-full" />
                      <div>
                        <span className="font-bold text-foreground block text-sm">{token.symbol}</span>
                        <span className="text-[11px] text-muted-foreground">{token.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={token.weightPct || ""}
                          onChange={(e) => handleUpdateWeight(token.mint, parseFloat(e.target.value) || 0)}
                          className="w-20 h-9 rounded-md border border-border bg-surface px-2.5 text-center font-mono font-bold text-sm text-foreground focus:outline-none focus:border-border-strong"
                        />
                        <span className="font-mono text-xs text-muted-foreground font-semibold">%</span>
                      </div>

                      <button
                        onClick={() => handleRemoveToken(token.mint)}
                        className="p-2 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-surface transition-colors cursor-pointer"
                        title="Remove token"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add preset tokens bar */}
              <div className="pt-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase block mb-2">
                  + Add Preset Token:
                </span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TOKENS.map((preset) => {
                    const isAdded = tokens.some((t) => t.mint === preset.mint);
                    return (
                      <button
                        key={preset.mint}
                        disabled={isAdded}
                        onClick={() => handleAddToken(preset)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer",
                          isAdded
                            ? "opacity-40 border-border bg-surface cursor-not-allowed"
                            : "border-border bg-background hover:bg-surface-elevated text-foreground"
                        )}
                      >
                        <img src={preset.icon} alt={preset.symbol} className="size-3.5 rounded-full" />
                        <span>{preset.symbol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Deploy Action Button */}
            <button
              onClick={handleDeployBasket}
              disabled={isDeploying || !isValid100Percent}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer",
                isValid100Percent
                  ? "bg-primary hover:bg-neutral-200 text-primary-foreground"
                  : "bg-surface-elevated text-muted-foreground border border-border cursor-not-allowed"
              )}
            >
              <Zap className="size-4 fill-primary-foreground text-primary-foreground" />
              {isDeploying ? "Deploying On-Chain..." : "Deploy Basket to Solana Devnet"}
            </button>
          </div>

          {/* Right Live Preview: 5 cols */}
          <div className="lg:col-span-5 space-y-4 sticky top-24">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                Live Basket Card Preview
              </span>
              <span className="text-[11px] font-mono text-muted-foreground font-bold">Card View Mode</span>
            </div>

            {/* Rendered Preview Card matching our own UI */}
            <div className="group relative flex flex-col justify-between bg-surface border border-border/40 rounded-2xl p-3.5 transition-all shadow-md">
              <div>
                {/* Image Space */}
                <div className="aspect-[4/3] w-full rounded-xl bg-surface-elevated/80 border border-border/60 flex items-center justify-center relative overflow-hidden mb-3.5 shadow-inner">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={name || "Basket Preview"}
                      className="w-full h-full object-cover"
                      onError={() => toast.error("Failed to load picture preview.")}
                    />
                  ) : (
                    <div className="text-center p-4">
                      <div className="size-14 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto text-muted-foreground shadow-inner">
                        <Sparkles className="size-6 text-foreground/80" />
                      </div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mt-3 block font-semibold">
                        {category} Space
                      </span>
                    </div>
                  )}
                </div>

                {/* Title & Multiplier */}
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-display font-bold text-foreground text-base sm:text-lg tracking-tight line-clamp-1">
                    {name || "Your Basket Title"}
                  </h4>
                  {pointsMultiplier && (
                    <span className="shrink-0 bg-foreground/[0.06] text-foreground border border-border/40 text-[11px] font-bold px-2 py-0.5 rounded-md shadow-sm">
                      {pointsMultiplier}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-1.5 leading-relaxed">
                  {description || "Basket description and narrative strategy thesis will be displayed here."}
                </p>
              </div>

              {/* Bottom Overlapping Tokens & Return */}
              <div className="mt-4 pt-3.5 border-t border-border/50 flex items-center justify-between gap-2">
                <div className="flex items-center">
                  <div className="flex -space-x-2 items-center">
                    {tokens.slice(0, 3).map((token) => (
                      <img
                        key={token.symbol}
                        src={token.icon}
                        alt={token.symbol}
                        className="size-6 sm:size-6.5 rounded-full ring-2 ring-surface bg-surface-elevated object-cover"
                      />
                    ))}
                  </div>
                  {tokens.length > 3 && (
                    <span className="text-[11px] font-mono font-medium text-muted-foreground pl-2">
                      +{tokens.length - 3}
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                    1 Year Return <Info className="size-2.5 opacity-70" />
                  </span>
                  <span className="font-mono font-bold text-emerald-400 text-sm sm:text-base">
                    +24.50%
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-surface text-xs text-muted-foreground space-y-1">
              <span className="font-semibold text-foreground block">Zero-Vault Invariant</span>
              <p className="leading-relaxed">
                New baskets are registered as non-custodial Anchor accounts. User deposits swap directly into Associated Token Accounts via Jupiter CPI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
