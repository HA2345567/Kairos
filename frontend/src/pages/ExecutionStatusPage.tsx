import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { kairosApi } from "@/lib/api-client";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import type { Execution } from "@/lib/api-types";

/**
 * FE-06 / FE-07: durable signing & status page.
 *
 * PRD §4.4 requires the execution to survive a refresh or a closed tab using
 * only its `executionId`. This route is that contract: it polls the durable
 * execution row plus the `/status` resume shape, reports progress in an
 * `aria-live` region, and never depends on component state from the modal that
 * started the execution.
 */

const TERMINAL = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "EXPIRED"]);

function statusLabel(status: string): string {
  switch (status) {
    case "PREPARED":
      return "Prepared — waiting for your signature";
    case "SUBMITTED":
      return "Submitted — broadcasting to devnet";
    case "LANDING":
      return "Landing — confirming each leg";
    case "COMPLETED":
      return "Completed";
    case "PARTIALLY_COMPLETED":
      return "Partially completed";
    case "FAILED":
      return "Failed — nothing was charged for failed legs";
    case "EXPIRED":
      return "Expired — the quote is no longer valid";
    default:
      return status;
  }
}

export default function ExecutionStatusPage() {
  const { id = "" } = useParams();
  const { authenticated, ensureAuthenticated, error: authError } = useWalletAuth();
  const [signingIn, setSigningIn] = useState(false);

  const execution = useQuery<Execution>({
    queryKey: ["execution-page", id],
    queryFn: async () => {
      await ensureAuthenticated();
      return kairosApi.getExecution(id);
    },
    enabled: authenticated && Boolean(id),
    refetchInterval: (query) => (TERMINAL.has(query.state.data?.status ?? "") ? false : 2_000),
    retry: 1,
  });

  const status = useQuery({
    queryKey: ["execution-status", id],
    queryFn: async () => {
      await ensureAuthenticated();
      return kairosApi.getExecutionStatus(id);
    },
    enabled: authenticated && Boolean(id),
    refetchInterval: () => (TERMINAL.has(execution.data?.status ?? "") ? 15_000 : 3_000),
    retry: 1,
  });

  useEffect(() => {
    if (!authenticated) void ensureAuthenticated().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const data = execution.data;
  const legs = useMemo(() => data?.legs ?? [], [data]);
  const confirmed = legs.filter((leg) => leg.status === "CONFIRMED").length;

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-10 sm:px-6 lg:px-8">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Execution status
          </h1>
          <p className="break-all text-xs text-text-secondary">{id}</p>
        </header>

        {!authenticated && (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-surface/80 p-5" role="status">
            <p className="text-sm text-text-secondary">
              Sign in with the wallet that owns this execution to resume it after a refresh.
            </p>
            {authError && (
              <p className="text-sm text-destructive-foreground" role="alert">
                {authError}
              </p>
            )}
            <button
              type="button"
              disabled={signingIn}
              onClick={() => {
                setSigningIn(true);
                void ensureAuthenticated().finally(() => setSigningIn(false));
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {signingIn && <Loader2 className="size-3 animate-spin" />}
              Sign in to resume
            </button>
          </div>
        )}

        {execution.isLoading && (
          <p className="flex items-center gap-2 text-sm text-text-secondary" role="status">
            <Loader2 className="size-3 animate-spin" /> Loading execution…
          </p>
        )}

        {execution.isError && (
          <p className="text-sm text-destructive-foreground" role="alert">
            {execution.error instanceof Error ? execution.error.message : "Execution unavailable."}
          </p>
        )}

        {data && (
          <section className="space-y-4 rounded-2xl border border-border/60 bg-surface/80 p-5">
            <div aria-live="polite" className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{statusLabel(data.status)}</p>
              <p className="text-xs text-text-secondary">
                {confirmed}/{legs.length} legs confirmed · type {data.type} · fee{" "}
                {data.feeUsdc.toFixed(4)} USDC · {data.totalUsdc.toFixed(2)} USDC intended
              </p>
            </div>

            <ol className="divide-y divide-border/40">
              {legs.map((leg, index) => (
                <li key={leg.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-sm text-foreground">
                    <span className="text-text-muted">{index + 1}.</span> {leg.symbol} · {leg.status}
                    {leg.error ? <span className="block text-xs text-destructive-foreground">{leg.error}</span> : null}
                  </span>
                  {leg.txSignature && (
                    <a
                      className="inline-flex items-center gap-1 text-xs text-text-secondary underline underline-offset-4"
                      href={`https://explorer.solana.com/tx/${leg.txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Explorer <ExternalLink className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ol>

            {data.status === "PREPARED" && (
              <p className="text-xs text-text-secondary">
                Open the invest or position panel to sign this prepared execution. The preview expires at{" "}
                {new Date(data.expiresAt).toLocaleTimeString()}.
              </p>
            )}

            {["PARTIALLY_COMPLETED", "FAILED", "EXPIRED"].includes(data.status) && (
              <p className="text-xs text-text-secondary">
                Failed legs were never charged. Retry and unwind are available from the portfolio panel where the
                wallet can sign.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1.5 hover:bg-surface-elevated"
                onClick={() => {
                  void execution.refetch();
                  void status.refetch();
                }}
              >
                <RefreshCw className="size-3" /> Re-check now
              </button>
              {status.data && (
                <span className="font-mono">
                  stream seq {status.data.seq} · {status.data.terminal ? "terminal" : "live"}
                </span>
              )}
              <Link to="/portfolio" className="underline underline-offset-4">
                Go to portfolio
              </Link>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
