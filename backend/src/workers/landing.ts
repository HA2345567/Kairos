import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { repository } from "../db/repository";
import { Execution, ExecutionLeg, ExecutionLegReceipt, Position } from "../db/schema";
import { config } from "../config";
import { getSignatureStatuses, sendRawTransaction, withFailover } from "../chain/connection";
import { getLegReceipt } from "../chain/receipt";
import { resolveUsdcAsset } from "../services/portfolio.service";
import { rebalanceFunding } from "./rebalance-funding";

/**
 * Landing worker (PRD §4.4): DB-backed queue poller that sends submitted leg
 * transactions, confirms them, records per-leg outcomes, updates positions
 * and fees, and drives the execution state machine.
 *
 * Idempotent + retry-safe: a job resumes from the signature in its signed
 * transaction, so an RPC timeout or process restart cannot lose a broadcast;
 * closing the browser mid-execution never cancels landing (PRD §2).
 */

const POLL_INTERVAL_MS = 1_000;
const CONFIRM_DEADLINE_MS = 90_000;
const CONFIRM_POLL_MS = 2_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let timer: ReturnType<typeof setInterval> | null = null;
let draining = false;

interface LandJobPayload {
  executionId: string;
  legId: string;
  signedTxBase64: string;
  mint?: string;
}

async function outbox(event: string, payload: unknown): Promise<void> {
  await repository.enqueueOutbox(event, payload);
}

function transactionSignature(tx: VersionedTransaction): string {
  const signature = tx.signatures[0];
  if (!signature || signature.every((byte) => byte === 0)) throw new Error("SIGNED_TRANSACTION_REQUIRED");
  return bs58.encode(signature);
}

async function targetBpsFor(basketVersionId: string, mint: string): Promise<number> {
  const version = (await repository.getBasketVersion(basketVersionId));
  return version?.legs.find((l) => l.mint === mint)?.weightBps ?? 0;
}

async function ensurePosition(execution: Execution): Promise<Position> {
  const existing = (await repository
    .getPositionsForWallet(execution.walletAddress))
    .find((p) => p.basketId === execution.basketId);
  if (existing) return existing;

  const position: Position = {
    id: "pos-" + Math.random().toString(36).slice(2, 12),
    walletAddress: execution.walletAddress,
    basketId: execution.basketId,
    basketVersionId: execution.basketVersionId,
    entryUsdc: Number((execution.totalUsdc - execution.feeUsdc).toFixed(4)),
    currentValueUsd: 0,
    status: "ACTIVE",
    rebalanceState: "NONE",
    autoRebalance: false,
    driftPct: 0,
    rebalanceAvailable: false,
    legs: (await Promise.all([...new Map(execution.legs.map(leg => [leg.mint, leg])).values()].map(async (l) => ({
      mint: l.mint,
      symbol: l.symbol,
      targetBps: (await targetBpsFor(execution.basketVersionId, l.mint)),
      currentAmount: 0,
      currentValueUsd: 0,
    })))),
    updatedAt: new Date().toISOString(),
  };
  (await repository.savePosition(position));
  return position;
}

async function failLeg(execution: Execution, leg: ExecutionLeg, error: string, jobId: string): Promise<void> {
  await settleLeg(execution.id, leg.id, jobId, { error });
}

async function confirmedReceipt(execution: Execution, leg: ExecutionLeg, signature: string) {
  if (leg.receipt) return leg.receipt;
  if (config.simulateLanding) return undefined;
  const usdc = await resolveUsdcAsset();
  const side = leg.side ?? (execution.type === "open" ? "buy" : execution.type === "close" ? "sell" : undefined);
  return getLegReceipt(signature, execution.walletAddress, leg.mint, usdc.mint, side);
}

/** No RPC calls inside this transaction: all outcome records commit together. */
async function settleLeg(
  executionId: string,
  legId: string,
  jobId: string,
  outcome: { signature: string; receipt?: ExecutionLegReceipt } | { error: string }
): Promise<void> {
  await repository.withExecutionLock(executionId, async (execution) => {
    const leg = execution.legs.find((item) => item.id === legId);
    if (!leg) throw new Error("LEG_NOT_FOUND");
    // A stale worker must never turn a confirmed transfer into a failed leg.
    const signature = leg.status === "CONFIRMED" && leg.txSignature
      ? leg.txSignature
      : "signature" in outcome ? outcome.signature : undefined;
    const error = "error" in outcome ? outcome.error : undefined;
    if (signature) {
      const receipt = "receipt" in outcome ? outcome.receipt ?? leg.receipt : leg.receipt;
      if (!config.simulateLanding && !receipt) throw new Error("TRANSACTION_RECEIPT_PENDING");
      await onLegConfirmed(execution, leg, signature, receipt);
    } else {
      await repository.updateExecutionLeg(execution.id, leg.id, { status: "FAILED", error });
      await outbox("execution.leg.failed", { executionId, legId, mint: leg.mint, error });
    }
    await recomputeExecutionStatus(execution.id);
    await repository.finishJob(jobId, Boolean(signature), signature ? undefined : error);
  });
}

async function landLeg(job: { id: string; payload: string | null }): Promise<void> {
  let payload: LandJobPayload;
  try {
    payload = JSON.parse(job.payload ?? "{}") as LandJobPayload;
  } catch {
    (await repository.finishJob(job.id, false, "UNPARSEABLE_JOB_PAYLOAD"));
    return;
  }

  const execution = (await repository.getExecution(payload.executionId));
  if (!execution) {
    (await repository.finishJob(job.id, false, "EXECUTION_NOT_FOUND"));
    return;
  }
  const leg = execution.legs.find((l) => l.id === payload.legId);
  if (!leg) {
    (await repository.finishJob(job.id, false, "LEG_NOT_FOUND"));
    return;
  }
  if (leg.status === "FAILED") {
    await failLeg(execution, leg, leg.error ?? "EXECUTION_LEG_FAILED", job.id);
    return;
  }
  if (leg.status === "CONFIRMED" && leg.txSignature) {
    const receipt = await confirmedReceipt(execution, leg, leg.txSignature);
    await settleLeg(execution.id, leg.id, job.id, { signature: leg.txSignature, receipt });
    return;
  }
  // Transition SUBMITTED → LANDING on first send attempt.
  if (execution.status === "SUBMITTED") {
    await repository.withExecutionLock(execution.id, async (current) => {
      if (current.status === "SUBMITTED") await repository.updateExecutionStatus(current.id, "LANDING");
    });
  }

  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(payload.signedTxBase64, "base64"));
  } catch (err) {
    await failLeg(execution, leg, `DESERIALIZE_FAILED: ${(err as Error).message}`, job.id);
    return;
  }
  const signature = transactionSignature(tx);

  // A prior attempt may have committed the leg before the process died while
  // writing its fee, position, or outbox records. Replay those idempotent DB
  // effects before retiring the job.
  if (leg.status === "CONFIRMED") {
    const receipt = await confirmedReceipt(execution, leg, signature);
    await settleLeg(execution.id, leg.id, job.id, { signature, receipt });
    return;
  }

  // Chaos applies only to pending legs, never to already confirmed transfers.
  const funding = await rebalanceFunding(execution, leg, id => repository.getExecution(id));
  if (funding.state !== "ready") {
    // A previous worker/version may already have sent these bytes. Reconcile
    // known chain outcomes before withholding a new broadcast.
    if (!config.simulateLanding) {
      const status = (await getSignatureStatuses([signature], true)).value[0];
      if (status?.err) {
        await failLeg(execution, leg, `ONCHAIN_ERROR: ${JSON.stringify(status.err)}`, job.id);
        return;
      }
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        const receipt = await confirmedReceipt(execution, leg, signature);
        await settleLeg(execution.id, leg.id, job.id, { signature, receipt });
        return;
      }
      if (status) throw new Error("LANDING_CONFIRMATION_PENDING");
    }
    if (funding.state === "failed") await failLeg(execution, leg, funding.error, job.id);
    else await repository.requeueJob(job.id, Date.now() + 5_000, "WAITING_FOR_REBALANCE_SELLS");
    return;
  }

  if (config.chaos.forceLegFailMint === leg.mint) {
    await failLeg(execution, leg, "FORCED_CHAOS_FAILURE", job.id);
    return;
  }
  if (config.chaos.slowConfirmMs && config.chaos.slowConfirmMs > 0) {
    await sleep(Math.min(config.chaos.slowConfirmMs, 30_000));
  }

  // Simulation mode (KAIROS_SIMULATE_LANDING=1): the transaction was built and
  // byte-verified for real, but no RPC send happens (no validator/faucet on
  // this host). Legs confirm deterministically and everything downstream —
  // state machine, positions, fees, outbox — runs for real. PRD §11.2 test data.
  if (config.simulateLanding) {
    await sleep(Math.min(1500, 1500));
    const simSig = "SIM" + (await (async () => {
      const { createHash } = await import("node:crypto");
      return createHash("sha256").update(`${execution.id}:${leg.id}`).digest("base64").slice(0, 40);
    })());
    await settleLeg(execution.id, leg.id, job.id, { signature: simSig });
    return;
  }

  // Submitting the exact same signed bytes is safe: Solana derives the same
  // signature. Keep checking chain history even when send times out, since an
  // RPC can fail after the validator accepted the transaction.
  const deadline = Date.now() + CONFIRM_DEADLINE_MS;
  let sent = false;
  let retries = 0;
  while (Date.now() < deadline) {
    if (!sent || retries++ % 3 === 0) {
      try {
        const returnedSignature = await sendRawTransaction(tx.serialize());
        if (returnedSignature !== signature) throw new Error("RPC_RETURNED_DIFFERENT_SIGNATURE");
        sent = true;
      } catch {
        // Continue into history lookup; sendRawTransaction may have timed out
        // after the validator received the transaction.
      }
    }

    await sleep(CONFIRM_POLL_MS);
    const res = await getSignatureStatuses([signature], true);
    const status = res?.value?.[0];
    if (status?.err) {
      await failLeg(execution, leg, `ONCHAIN_ERROR: ${JSON.stringify(status.err)}`, job.id);
      return;
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      const receipt = await confirmedReceipt(execution, leg, signature);
      await settleLeg(execution.id, leg.id, job.id, { signature, receipt });
      return;
    }

    if (!status && execution.lastValidBlockHeight) {
      const blockHeight = await withFailover((connection) => connection.getBlockHeight());
      if (blockHeight > execution.lastValidBlockHeight) {
        await failLeg(execution, leg, "BLOCKHASH_EXPIRED", job.id);
        return;
      }
    }
  }

  // A timeout is uncertain, not a failed swap. Throwing makes processOnce
  // release the lease and retry this same transaction in a later poll.
  throw new Error(`LANDING_CONFIRMATION_PENDING:${signature}`);
}

/** Record a confirmed leg: signature + outcome, fee ledger, position leg. */
async function onLegConfirmed(
  execution: Execution, leg: ExecutionLeg, signature: string, receipt?: ExecutionLegReceipt
): Promise<void> {
  const side = receipt?.side ?? leg.side ?? (execution.type === "close" ? "sell" : "buy");
  const actualOut = receipt?.actualOut ?? leg.actualOut ?? (side === "sell"
    ? String(Math.max(0, Number(leg.expectedOut) - Math.round((leg.feeUsdc ?? 0) * 1_000_000)))
    : leg.expectedOut);
  (await repository.updateExecutionLeg(execution.id, leg.id, {
    status: "CONFIRMED",
    txSignature: signature,
    actualOut,
    side,
    receipt,
  }));

  // Ledger only the fee attached to this confirmed leg. The repository
  // deduplicates by execution and leg if landing is retried.
  if ((leg.feeUsdc ?? 0) > 0) {
    await repository.addFee(execution.id, leg.id, leg.feeUsdc ?? 0, new Date().toISOString());
  }

  // Live holdings use the receipt's observed token balance. Simulation applies
  // the planned transfer to the existing amount, including partial sells.
  // Settlement is atomic. A duplicate delivery must preserve balances that a
  // later execution or reconciliation has updated since this leg landed.
  if (leg.status !== "CONFIRMED") {
    const position = await ensurePosition(execution);
    const targetBps = await targetBpsFor(execution.basketVersionId, leg.mint);
    const decimals = receipt?.assetDecimals ?? (await repository.getToken(leg.mint))?.decimals ?? 6;
    const previous = position.legs.find(item => item.mint === leg.mint)?.currentAmount ?? 0;
    const amount = receipt ? Number(receipt.assetBalanceAfter) / 10 ** decimals
      : side === "sell" ? Math.max(0, previous - Number(leg.inputBaseUnits ?? previous * 10 ** decimals) / 10 ** decimals)
      : previous + Number(actualOut) / 10 ** decimals;
    await repository.upsertPositionLeg(position.id, leg.mint, targetBps, amount);
  }

  (await outbox("execution.leg.confirmed", {
    executionId: execution.id,
    legId: leg.id,
    mint: leg.mint,
    signature,
  }));
}

async function transitionRebalancePosition(
  execution: Execution,
  status: "COMPLETED" | "PARTIALLY_COMPLETED"
): Promise<void> {
  const position = (await repository.getPositionsForWallet(execution.walletAddress))
    .find((candidate) => candidate.basketId === execution.basketId);
  if (!position) return;

  if (status === "PARTIALLY_COMPLETED") {
    // Mixed rebalance outcomes never silently move the position to the target
    // version. The old version remains authoritative until the recovery path
    // completes, while the explicit flag drives UI/ops handling.
    position.rebalanceState = "REBALANCE_PARTIAL";
    position.rebalanceAvailable = true;
    position.updatedAt = new Date().toISOString();
    await repository.savePosition(position);
    return;
  }

  const targetVersion = await repository.getBasketVersion(execution.basketVersionId);
  if (!targetVersion) throw new Error("TARGET_REBALANCE_VERSION_NOT_FOUND");
  const targetByMint = new Map(targetVersion.legs.map((leg) => [leg.mint, leg]));
  for (const leg of position.legs) {
    leg.targetBps = targetByMint.get(leg.mint)?.weightBps ?? 0;
  }
  for (const targetLeg of targetVersion.legs) {
    if (!position.legs.some((leg) => leg.mint === targetLeg.mint)) {
      position.legs.push({
        mint: targetLeg.mint,
        symbol: "",
        targetBps: targetLeg.weightBps,
        currentAmount: 0,
        currentValueUsd: 0,
      });
    }
  }
  position.basketVersionId = execution.basketVersionId;
  position.rebalanceAvailable = false;
  position.rebalanceState = "NONE";
  position.updatedAt = new Date().toISOString();
  await repository.savePosition(position);
}

/** Drive the execution state machine from per-leg statuses (PRD §4.4). */
export async function recomputeExecutionStatus(executionId: string): Promise<string | null> {
  return repository.withExecutionLock(executionId, async (execution) => {
    // PREPARED never has landing jobs; EXPIRED must never be downgraded.
    if (execution.status === "PREPARED" || execution.status === "EXPIRED" || execution.legs.length === 0) {
      return execution.status;
    }

    const legs = execution.legs;
    let next: Execution["status"];
    if (legs.every((l) => l.status === "CONFIRMED")) next = "COMPLETED";
    else if (legs.every((l) => l.status === "FAILED")) next = "FAILED";
    else if (legs.some((l) => l.status === "PENDING")) next = "LANDING";
    else next = "PARTIALLY_COMPLETED"; // terminal only when no legs are pending

    if (next !== execution.status) {
      if (next !== "LANDING") {
        await outbox(`execution.${next.toLowerCase()}`, {
          executionId: execution.id,
          basketId: execution.basketId,
          type: execution.type,
          legs: legs.map((l) => ({ mint: l.mint, status: l.status, error: l.error })),
        });
      }
      await repository.updateExecutionStatus(execution.id, next);
    }
    if (execution.type === "rebalance" && (next === "COMPLETED" || next === "PARTIALLY_COMPLETED")) {
      await transitionRebalancePosition(execution, next);
    }
    // Close the position in the same transaction; retry also repairs old
    // terminal executions whose position update was interrupted.
    if (next === "COMPLETED" && execution.type === "close") {
      const position = (await repository.getPositionsForWallet(execution.walletAddress))
        .find((p) => p.basketId === execution.basketId);
      if (position && position.status !== "CLOSED" && position.legs.every(leg => leg.currentAmount === 0)) {
        position.status = "CLOSED";
        position.updatedAt = new Date().toISOString();
        await repository.savePosition(position);
      }
    }
    return next;
  });
}

async function processOnce(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // Claim only the work we can start now; queued legs must not burn through
    // their lease while an earlier transaction waits for confirmation.
    const jobs = (await repository.claimJobs(1, Date.now()));
    for (const job of jobs) {
      try {
        await landLeg(job);
      } catch (err) {
        console.error(`[landing] job ${job.id} crashed:`, err);
        try {
          (await repository.requeueJob(job.id, Date.now() + 5_000, (err as Error).message));
        } catch {
          /* leave as running; sweeper/re-run handles */
        }
      }
    }
  } finally {
    draining = false;
  }
}

export function startLandingWorker(): void {
  if (timer) return;
  timer = setInterval(async () => {
    processOnce().catch((err) => console.error("[landing] worker tick failed:", err));
  }, POLL_INTERVAL_MS);
  console.log(`[landing] worker started (interval ${POLL_INTERVAL_MS}ms, confirm deadline ${CONFIRM_DEADLINE_MS / 1000}s)`);
}

export { processOnce as processLandingJobsOnce };
