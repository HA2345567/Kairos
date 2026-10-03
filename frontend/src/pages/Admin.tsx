import { useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { CURATED_BASKETS } from "@/lib/baskets-data";
import { AdminSkeleton } from "@/components/basket/BasketSkeleton";
import { useQuery } from "@tanstack/react-query";
import { Settings, RefreshCw, Database, Layers, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function AdminPage() {
  const [triggering, setTriggering] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<string | null>(null);

  // Fetch server health / baskets status
  const { data: serverHealth, isLoading: isHealthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ["server-health"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) return { status: "offline" };
        return await res.json();
      } catch {
        return { status: "offline" };
      }
    },
    refetchInterval: 15000,
  });

  const handleTriggerSnapshot = async () => {
    setTriggering(true);
    setSnapshotResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/trigger-snapshot`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSnapshotResult(`✓ Live snapshot complete: ${data.successfulBaskets || 0} baskets updated.`);
      } else {
        setSnapshotResult(`Error triggering snapshot: ${data.message || "Failed"}`);
      }
    } catch (err: any) {
      setSnapshotResult(`Failed to connect to backend: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  };

  const isBackendOnline = serverHealth?.status === "ok";

  if (isHealthLoading) {
    return (
      <PageShell>
        <AdminSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/30 pb-6">
          <div>
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground mb-1">
              <Settings className="size-3.5 text-foreground" />
              <span className="font-mono uppercase tracking-wider">Internal Configuration</span>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Admin & Router Registry</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Live narrative baskets, CoinGecko price snapshot cron status, and on-chain swap routing controls.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/30 bg-surface">
              <span
                className={`size-2 rounded-full ${
                  isBackendOnline ? "bg-emerald-500 shadow-[0_0_8px_#10B981]" : "bg-rose-500"
                }`}
              />
              <span className="text-xs font-mono font-medium text-foreground/80">
                Backend: {isBackendOnline ? "Online (Port 3001)" : "Offline"}
              </span>
            </div>
            <button
              type="button"
              disabled={triggering}
              onClick={handleTriggerSnapshot}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-neutral-200 text-primary-foreground font-semibold text-xs tracking-tight transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${triggering ? "animate-spin" : ""}`} />
              Trigger NAV Snapshot
            </button>
          </div>
        </div>

        {snapshotResult && (
          <div className="p-4 rounded-xl border border-border/30 bg-foreground/[0.04] flex items-center gap-3">
            {snapshotResult.startsWith("✓") ? (
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="size-5 text-rose-500 shrink-0" />
            )}
            <span className="text-xs font-mono text-foreground/90">{snapshotResult}</span>
          </div>
        )}

        {/* 5 Curated Baskets Overview */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-bold text-foreground">Active Launch Baskets (5)</h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {CURATED_BASKETS.map((basket) => {
              const totalWeight = basket.tokens.reduce((acc, t) => acc + t.weightBps, 0);
              return (
                <div
                  key={basket.id}
                  className="rounded-2xl border border-border/30 bg-surface p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/20 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl overflow-hidden bg-foreground/5 border border-border/30">
                        {basket.imageUrl && (
                          <img src={basket.imageUrl} alt={basket.name} className="size-full object-cover" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-base">{basket.name}</h3>
                        <p className="text-xs font-mono text-muted-foreground">{basket.id} · {basket.category}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/80 border border-border/30">
                        Weights: <b className={totalWeight === 10000 ? "text-emerald-700" : "text-rose-600"}>{totalWeight} bps</b> (100%)
                      </span>
                    </div>
                  </div>

                  {/* Constituents Table */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {basket.tokens.map((token) => (
                      <div
                        key={token.symbol}
                        className="p-2.5 rounded-xl border border-border/20 bg-foreground/[0.03] flex flex-col justify-between"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <img
                            src={token.icon}
                            alt={token.symbol}
                            className="size-4 rounded-full"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <span className="font-bold text-xs text-foreground">{token.symbol}</span>
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {(token.weightBps / 100).toFixed(1)}% ({token.weightBps} bps)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Specs */}
        <div className="rounded-2xl border border-border/30 bg-surface p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-foreground">Non-Custodial Architecture Specs</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-muted-foreground">
            <div className="p-3 rounded-xl bg-foreground/[0.03] border border-border/20 space-y-1">
              <span className="text-muted-foreground">Model</span>
              <p className="text-foreground font-medium">Swap-and-Distribute Router (No Vaults)</p>
            </div>
            <div className="p-3 rounded-xl bg-foreground/[0.03] border border-border/20 space-y-1">
              <span className="text-muted-foreground">Aggregator CPI</span>
              <p className="text-foreground font-medium">Jupiter V6 CPI Routing</p>
            </div>
            <div className="p-3 rounded-xl bg-foreground/[0.03] border border-border/20 space-y-1">
              <span className="text-muted-foreground">Delivery Destination</span>
              <p className="text-foreground font-medium">User Associated Token Accounts (ATAs)</p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
