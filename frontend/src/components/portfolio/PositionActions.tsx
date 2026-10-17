import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { kairosApi } from "@/lib/api-client";
import type { Execution } from "@/lib/api-types";
import { formatTokenBaseUnits } from "@/lib/usdc";
import { Button } from "@/components/ui/button";
import { WithdrawUsdc } from "./WithdrawUsdc";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";

const terminal = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "EXPIRED"]);

export function PositionActions({ address }: { address: string }) {
  const wallet = useWallet();
  const { authenticated, authenticating, error: authError, ensureAuthenticated } = useWalletAuth();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Execution | null>(null);
  const positions = useQuery({
    queryKey: ["positions", address],
    queryFn: async () => { await ensureAuthenticated(); return kairosApi.getPositions(address); },
    enabled: authenticated,
    refetchInterval: 15_000,
  });
  const history = useQuery({
    queryKey: ["executions", address],
    queryFn: async () => {
      await ensureAuthenticated();
      return kairosApi.get<{ executions: Execution[] }>(`/v1/executions?walletAddress=${encodeURIComponent(address)}`);
    },
    enabled: authenticated,
    refetchInterval: 3_000,
  });
  const executionId = selected || history.data?.executions[0]?.id;
  const status = useQuery({
    queryKey: ["execution", executionId],
    queryFn: async () => { await ensureAuthenticated(); return kairosApi.getExecution(executionId!); },
    enabled: Boolean(executionId) && authenticated,
    refetchInterval: query => terminal.has(query.state.data?.status || "") ? false : 2_000,
  });
  const execution = status.data || prepared;
  async function review(action: () => Promise<Execution>) {
    setBusy(true);
    try {
      await ensureAuthenticated();
      const next = await action();
      setPrepared(next);
      setSelected(next.id);
      cache.setQueryData(["execution", next.id], next);
      await cache.invalidateQueries({ queryKey: ["executions", address] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not prepare the transaction"); }
    finally { setBusy(false); }
  }
  async function sign() {
    if (!execution || !wallet.publicKey || wallet.publicKey.toBase58() !== address) return;
    if (!wallet.signAllTransactions && !wallet.signTransaction) return toast.error("Wallet signing is unavailable");
    setBusy(true);
    try {
      await ensureAuthenticated();
      if (Date.now() >= Date.parse(execution.expiresAt)) throw new Error("This preview expired. Prepare a new transaction.");
      const transactions = execution.preparedTxs.map(value => VersionedTransaction.deserialize(Buffer.from(value, "base64")));
      const signed = wallet.signAllTransactions
        ? await wallet.signAllTransactions(transactions)
        : await Promise.all(transactions.map(tx => wallet.signTransaction!(tx)));
      const result = await kairosApi.submitPosition({
        executionId: execution.id,
        signedTxs: signed.map(tx => Buffer.from(tx.serialize()).toString("base64")),
      });
      cache.setQueryData(["execution", execution.id], result.execution);
      toast.info("Submitted. Confirmation is tracked below; you can return to this page later.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Signing or submission failed"); }
    finally { setBusy(false); }
  }
  return <section className="container py-8 space-y-5" aria-label="Manage positions">
    <h2 className="text-xl font-semibold">Manage your basket positions</h2>
    <p className="text-sm text-muted-foreground">Test assets stay in your wallet. Closing and rebalancing require your signature. Values use indicative devnet rates.</p>
    <WithdrawUsdc />
    {!authenticated && <div className="rounded-xl border border-border p-4 space-y-3" role="status">
      <p className="text-sm">Sign a one-time wallet message to load your protected positions and execution history.</p>
      {authError && <p className="text-sm text-red-400" role="alert">{authError}</p>}
      <Button disabled={authenticating} onClick={() => ensureAuthenticated().catch(() => undefined)}>
        {authenticating ? "Waiting for wallet…" : "Sign in to Kairos"}
      </Button>
    </div>}
    {(positions.isError || history.isError) && <p role="alert">Position service unavailable. Refresh to try again.</p>}
    {positions.isLoading && <p role="status">Loading positions…</p>}
    {positions.data?.positions.filter(position => position.status !== "CLOSED").map(position => <article key={position.id} className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><strong>{position.basketId}</strong><span>{position.status} · ${position.currentValueUsd.toFixed(2)} indicative</span></div>
      <p className="text-sm text-muted-foreground">{position.legs.map(leg => `${leg.currentAmount.toLocaleString()} ${leg.symbol}`).join(" · ")}</p>
      {position.status === "MODIFIED" && <p className="text-sm">An external transfer changed these holdings. Review your balances before closing.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => review(() => kairosApi.submitCloseExecution(position.id, crypto.randomUUID(), address))}>Review close</Button>
        <Button variant="outline" disabled={busy || position.status !== "ACTIVE"} onClick={() => review(() => kairosApi.prepareRebalance(position.id, crypto.randomUUID(), address))}>Review rebalance</Button>
      </div>
    </article>)}
    {history.data?.executions.length ? <label className="block text-sm">Execution history
      <select className="block w-full rounded border border-border bg-background p-2 mt-2" value={executionId || ""} onChange={event => { setSelected(event.target.value); setPrepared(null); }}>
        {history.data.executions.map(item => <option key={item.id} value={item.id}>{item.type} · {item.status} · {new Date(item.createdAt).toLocaleString()}</option>)}
      </select>
    </label> : null}
    {execution && <article className="rounded-xl border border-border p-4 space-y-3" aria-live="polite">
      <h3 className="font-semibold">{execution.type} · {execution.status}</h3>
      <p className="text-sm break-all">Execution: {execution.id}</p>
      <p className="text-sm">Indicative value: {execution.totalUsdc.toFixed(2)} USDC · Platform fee: {execution.feeUsdc.toFixed(4)} USDC</p>
      {execution.legs.map(leg => <div key={leg.id} className="flex flex-wrap justify-between gap-2 text-sm">
        <span>{leg.symbol} · {leg.status}{leg.error ? ` · ${leg.error}` : ""}
          {leg.receipt && <span className="block text-muted-foreground">Received {formatTokenBaseUnits(leg.receipt.actualOut, leg.receipt.side === "buy" ? leg.receipt.assetDecimals : 6)} {leg.receipt.side === "buy" ? leg.symbol : "USDC"}</span>}
        </span>
        {leg.txSignature && <a className="underline" href={`https://explorer.solana.com/tx/${leg.txSignature}?cluster=devnet`} target="_blank" rel="noreferrer">View transaction</a>}
      </div>)}
      {execution.status === "PREPARED" && <>
        <p className="text-sm">Expires {new Date(execution.expiresAt).toLocaleTimeString()}. Review every transfer in your wallet before approving.</p>
        <Button disabled={busy} onClick={sign}>{busy ? "Waiting for wallet…" : "Sign and submit"}</Button>
      </>}
      {["PREPARED", "EXPIRED"].includes(execution.status) && Date.now() >= Date.parse(execution.expiresAt) && execution.baseExecutionId && execution.recoveryAction &&
        <Button variant="outline" disabled={busy} onClick={() => review(() => execution.recoveryAction === "retry"
          ? kairosApi.retryExecution(execution.baseExecutionId!, crypto.randomUUID(), address)
          : kairosApi.unwindExecution(execution.baseExecutionId!, crypto.randomUUID(), address))}>Refresh recovery</Button>}
      {["PARTIALLY_COMPLETED", "FAILED", "EXPIRED"].includes(execution.status) && <div className="flex flex-wrap gap-2">
        {execution.legs.some(leg => leg.status === "FAILED") && <Button disabled={busy} onClick={() => review(() => kairosApi.retryExecution(execution.id, crypto.randomUUID(), address))}>Review retry</Button>}
        {execution.legs.some(leg => leg.status === "CONFIRMED" && (leg.receipt?.side ?? leg.side ?? (execution.type === "open" ? "buy" : undefined)) === "buy") && <Button variant="outline" disabled={busy} onClick={() => review(() => kairosApi.unwindExecution(execution.id, crypto.randomUUID(), address))}>Review unwind</Button>}
      </div>}
    </article>}
  </section>;
}
