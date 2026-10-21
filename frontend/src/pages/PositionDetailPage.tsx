import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { kairosApi } from "@/lib/api-client";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import type { Execution, Position } from "@/lib/api-types";

/**
 * PRD §4.1 "Position Detail": leg table with target vs current weights, drift,
 * status/`MODIFIED` disclosure and the auto-rebalance policy control. Every
 * value is read from `GET /v1/positions/:id`; nothing is reconstructed in the
 * browser.
 */
export default function PositionDetailPage() {
  const { id = "" } = useParams();
  const { authenticated, ensureAuthenticated } = useWalletAuth();
  const [busy, setBusy] = useState(false);

  const position = useQuery<Position>({
    queryKey: ["position-detail", id],
    queryFn: async () => {
      await ensureAuthenticated();
      return kairosApi.getPosition(id);
    },
    enabled: authenticated && Boolean(id),
    refetchInterval: 15_000,
    retry: 1,
  });

  const history = useQuery<{ executions: Execution[] }>({
    queryKey: ["position-history", id],
    queryFn: async () => {
      await ensureAuthenticated();
      return kairosApi.get<{ executions: Execution[] }>(`/v1/executions?walletAddress=${encodeURIComponent(position.data?.walletAddress ?? "")}`);
    },
    enabled: authenticated && Boolean(position.data?.walletAddress),
    retry: 1,
  });

  const toggleAuto = async () => {
    if (!position.data) return;
    setBusy(true);
    try {
      const updated = await kairosApi.setAutoRebalance(position.data.id, !position.data.autoRebalance);
      toast.success(updated.autoRebalance ? "Auto-rebalance enabled for this position." : "Auto-rebalance disabled.");
      await position.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update auto-rebalance.");
    } finally {
      setBusy(false);
    }
  };

  const data = position.data;

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-10 sm:px-6 lg:px-8">
        <Link to="/portfolio" className="inline-flex items-center gap-1 text-xs text-text-secondary underline underline-offset-4">
          <ArrowLeft className="size-3" /> Portfolio
        </Link>

        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Position</h1>
          <p className="break-all text-xs text-text-secondary">{id}</p>
        </header>

        {position.isLoading && (
          <p className="flex items-center gap-2 text-sm text-text-secondary" role="status">
            <Loader2 className="size-3 animate-spin" /> Loading position…
          </p>
        )}
        {position.isError && (
          <p className="text-sm text-destructive-foreground" role="alert">
            {position.error instanceof Error ? position.error.message : "Position unavailable."}
          </p>
        )}

        {data && (
          <section className="space-y-4 rounded-2xl border border-border/60 bg-surface/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-text-secondary">{data.basketId}</p>
                <p className="text-sm text-foreground">
                  ${data.currentValueUsd.toFixed(2)} indicative · drift {data.driftPct.toFixed(1)}% ·{" "}
                  {data.status}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={data.autoRebalance}
                aria-label="Auto-rebalance"
                disabled={busy || data.status !== "ACTIVE"}
                onClick={() => void toggleAuto()}
                className={`inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                  data.autoRebalance
                    ? "justify-end border-primary bg-primary/80"
                    : "justify-start border-border/60 bg-surface-elevated"
                } disabled:opacity-50`}
              >
                <span className="mx-0.5 size-4 rounded-full bg-background" />
              </button>
            </div>

            {data.status === "MODIFIED" && (
              <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200" role="status">
                Holdings changed outside Kairos. This position is excluded from auto-rebalance until it is reconciled.
              </p>
            )}

            <table className="w-full text-left text-sm">
              <caption className="sr-only">Target versus current leg weights</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-text-muted">
                  <th scope="col" className="py-1.5">Asset</th>
                  <th scope="col" className="py-1.5 text-right">Target</th>
                  <th scope="col" className="py-1.5 text-right">Current</th>
                  <th scope="col" className="py-1.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {data.legs.map((leg) => (
                  <tr key={leg.mint}>
                    <td className="py-2 text-foreground">{leg.symbol}</td>
                    <td className="py-2 text-right font-mono text-xs">{(leg.targetBps / 100).toFixed(2)}%</td>
                    <td className="py-2 text-right font-mono text-xs">{leg.currentAmount.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono text-xs">${leg.currentValueUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-xs text-text-secondary">
              Last observation:{" "}
              {data.legs[0]?.lastKnownAt ? new Date(data.legs[0].lastKnownAt).toLocaleString() : "pending reconciler"}{" "}
              {data.legs[0]?.lastKnownCommitment ? `(${data.legs[0].lastKnownCommitment})` : ""}
            </p>

            {(history.data?.executions.length ?? 0) > 0 && (
              <details className="text-xs text-text-secondary">
                <summary className="cursor-pointer">Execution history ({history.data!.executions.length})</summary>
                <ul className="mt-2 space-y-1">
                  {history.data!.executions.slice(0, 10).map((execution) => (
                    <li key={execution.id}>
                      <Link to={`/executions/${execution.id}`} className="underline underline-offset-4">
                        {execution.type} · {execution.status}
                      </Link>{" "}
                      · {new Date(execution.createdAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="text-xs text-text-secondary">
              Manual rebalance and close run from the portfolio panel, where this wallet can sign the prepared legs.
            </p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
