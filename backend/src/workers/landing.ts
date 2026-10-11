import { Connection, VersionedTransaction } from "@solana/web3.js";
import { repository } from "../db/repository";
import { Execution, ExecutionLeg, Position } from "../db/schema";
import { config } from "../config";
import { getSignatureStatuses, sendRawTransaction } from "../chain/connection";

/**
 * Landing worker (PRD §4.4): DB-backed queue poller that sends submitted leg
 * transactions, confirms them, records per-leg outcomes, updates positions
 * and fees, and drives the execution state machine.
 *
 * Idempotent + retry-safe: a job for an already-CONFIRMED leg finishes
 * immediately; all work is wrapped so one bad job never kills the loop;
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

function outbox(event: string, payload: unknown): void {
  try {
    repository.enqueueOutbox(event, payload);
  } catch (err) {
    console.warn("[landing] outbox enqueue failed:", (err as Error).message);
  }
}

function targetBpsFor(basketVersionId: string, mint: string): number {
  const version = repository.getBasketVersion(basketVersionId);
  return version?.legs.find((l) => l.mint === mint)?.weightBps ?? 0;
}

function ensurePosition(execution: Execution): Position {
  const existing = repository
    .getPositionsForWallet(execution.walletAddress)
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
    autoRebalance: false,
    driftPct: 0,
    rebalanceAvailable: false,
    legs: execution.legs.map((l) => ({
      mint: l.mint,
      symbol: l.symbol,
      targetBps: targetBpsFor(execution.basketVersionId, l.mint),
      currentAmount: 0,
      currentValueUsd: 0,
    })),
    updatedAt: new Date().toISOString(),
  };
  repository.savePosition(position);
  return position;
}

async function failLeg(execution: Execution, leg: ExecutionLeg, error: string, jobId: string): Promise<void> {
  repository.updateExecutionLeg(execution.id, leg.id, { status: "FAILED", error });
  repository.finishJob(jobId, false, error);
  outbox("execution.leg.failed", { executionId: execution.id, legId: leg.id, mint: leg.mint, error });
  await recomputeExecutionStatus(execution.id);
}

async function landLeg(job: { id: string; payload: string | null }): Promise<void> {
  let payload: LandJobPayload;
  try {
    payload = JSON.parse(job.payload ?? "{}") as LandJobPayload;
  } catch {
    repository.finishJob(job.id, false, "UNPARSEABLE_JOB_PAYLOAD");
    return;
  }

  const execution = repository.getExecution(payload.executionId);
  if (!execution) {
    repository.finishJob(job.id, false, "EXECUTION_NOT_FOUND");
    return;
  }
  const leg = execution.legs.find((l) => l.id === payload.legId);
  if (!leg) {
    repository.finishJob(job.id, false, "LEG_NOT_FOUND");
    return;
  }
  if (leg.status === "CONFIRMED") {
    repository.finishJob(job.id, true); // retry-safe: already landed
    return;
  }

  // Transition SUBMITTED → LANDING on first send attempt.
  if (execution.status === "SUBMITTED") {
    execution.status = "LANDING";
    execution.updatedAt = new Date().toISOString();
    repository.saveExecution(execution);
  }

  // Chaos switches (PRD §11.3): force a leg to fail / slow confirmation.
  if (config.chaos.forceLegFailMint && config.chaos.forceLegFailMint === leg.mint) {
    await failLeg(execution, leg, "FORCED_CHAOS_FAILURE", job.id);
    return;
  }
  if (config.chaos.slowConfirmMs && config.chaos.slowConfirmMs > 0) {
    await sleep(Math.min(config.chaos.slowConfirmMs, 30_000));
  }

  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(payload.signedTxBase64, "base64"));
  } catch (err) {
    await failLeg(execution, leg, `DESERIALIZE_FAILED: ${(err as Error).message}`, job.id);
    return;
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
    onLegConfirmed(execution, leg, simSig);
    repository.finishJob(job.id, true);
    await recomputeExecutionStatus(execution.id);
    return;
  }

  let signature: string;
  try {
    signature = await sendRawTransaction(tx.serialize());
  } catch (err) {
    await failLeg(execution, leg, `SEND_FAILED: ${(err as Error).message}`, job.id);
    return;
  }

  // Poll until confirmed / errored / deadline / blockhash expiry.
  const deadline = Date.now() + CONFIRM_DEADLINE_MS;
  try {
    while (Date.now() < deadline) {
      await sleep(CONFIRM_POLL_MS);
      const res = await getSignatureStatuses([signature]);
      const status = res?.value?.[0];
      if (status?.err) {
        await failLeg(execution, leg, `ONCHAIN_ERROR: ${JSON.stringify(status.err)}`, job.id);
        return;
      }
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        const blockHeightOk =
          !execution.lastValidBlockHeight ||
          (await (async () => {
            try {
              const { getConnection } = await import("../chain/connection");
              return (await getConnection().getBlockHeight()) <= execution.lastValidBlockHeight!;
            } catch {
              return true;
            }
          })());
        if (!blockHeightOk) {
          await failLeg(execution, leg, "BLOCKHASH_EXPIRED", job.id);
          return;
        }
        onLegConfirmed(execution, leg, signature);
        repository.finishJob(job.id, true);
        await recomputeExecutionStatus(execution.id);
        return;
      }
    }
    await failLeg(execution, leg, "CONFIRM_TIMEOUT", job.id);
  } catch (err) {
    await failLeg(execution, leg, `CONFIRM_ERROR: ${(err as Error).message}`, job.id);
  }
}

/** Record a confirmed leg: signature + outcome, fee ledger, position leg. */
function onLegConfirmed(execution: Execution, leg: ExecutionLeg, signature: string): void {
  repository.updateExecutionLeg(execution.id, leg.id, {
    status: "CONFIRMED",
    txSignature: signature,
    actualOut: leg.expectedOut,
  });

  // Fee ledger: once per execution, when its first leg lands (PRD §7).
  if (execution.legs[0]?.id === leg.id && execution.feeUsdc > 0) {
    try {
      repository.addFee(execution.id, execution.feeUsdc, new Date().toISOString());
    } catch (err) {
      console.warn("[landing] fee ledger write failed:", (err as Error).message);
    }
  }

  // Position bookkeeping. Buys (open legs, rebalance buys) upsert the
  // received asset amount with the version's target weight; full closes
  // zero the leg. Amounts are persisted in UI units (decimals-adjusted) —
  // the portfolio layer reads them as UI. Partial rebalance sells are left
  // to the reconciler, which refreshes from on-chain balances anyway
  // (positions are derived).
  try {
    const position = ensurePosition(execution);
    const decimals = repository.getToken(leg.mint)?.decimals ?? 6;
    if (execution.type === "close") {
      repository.upsertPositionLeg(position.id, leg.mint, targetBpsFor(execution.basketVersionId, leg.mint), 0);
    } else {
      const uiAmount = Number(leg.actualOut ?? leg.expectedOut) / 10 ** decimals;
      repository.upsertPositionLeg(
        position.id,
        leg.mint,
        targetBpsFor(execution.basketVersionId, leg.mint),
        uiAmount
      );
    }
  } catch (err) {
    console.warn("[landing] position update failed:", (err as Error).message);
  }

  outbox("execution.leg.confirmed", {
    executionId: execution.id,
    legId: leg.id,
    mint: leg.mint,
    signature,
  });
}

/** Drive the execution state machine from per-leg statuses (PRD §4.4). */
export async function recomputeExecutionStatus(executionId: string): Promise<string | null> {
  const execution = repository.getExecution(executionId);
  if (!execution) return null;
  // PREPARED never has landing jobs; EXPIRED must never be downgraded.
  if (execution.status === "PREPARED" || execution.status === "EXPIRED") {
    return execution.status;
  }

  const legs = execution.legs;
  let next: Execution["status"];
  // Order matters: PARTIALLY_COMPLETED is terminal only when NO legs are
  // still pending (PRD §4.4) — otherwise it's a transient mid-landing state.
  if (legs.every((l) => l.status === "CONFIRMED")) next = "COMPLETED";
  else if (legs.every((l) => l.status === "FAILED")) next = "FAILED";
  else if (legs.some((l) => l.status === "PENDING")) next = "LANDING";
  else next = "PARTIALLY_COMPLETED"; // mix of CONFIRMED + FAILED, none pending

  if (next !== execution.status) {
    execution.status = next;
    execution.updatedAt = new Date().toISOString();
    repository.saveExecution(execution);

    if (next === "COMPLETED" || next === "PARTIALLY_COMPLETED" || next === "FAILED") {
      outbox(`execution.${next.toLowerCase()}`, {
        executionId: execution.id,
        basketId: execution.basketId,
        type: execution.type,
        legs: legs.map((l) => ({ mint: l.mint, status: l.status, error: l.error })),
      });
      // A fully closed execution retires its position (PRD §4.4 close flow).
      if (next === "COMPLETED" && execution.type === "close") {
        try {
          const position = repository
            .getPositionsForWallet(execution.walletAddress)
            .find((p) => p.basketId === execution.basketId);
          if (position) {
            position.status = "CLOSED";
            position.updatedAt = new Date().toISOString();
            repository.savePosition(position);
          }
        } catch (err) {
          console.warn("[landing] close-position flag failed:", (err as Error).message);
        }
      }
    }
  }
  return next;
}

async function processOnce(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const jobs = repository.claimJobs(5, Date.now());
    for (const job of jobs) {
      try {
        await landLeg(job);
      } catch (err) {
        console.error(`[landing] job ${job.id} crashed:`, err);
        try {
          repository.requeueJob(job.id, Date.now() + 5_000);
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
  timer = setInterval(() => {
    processOnce().catch((err) => console.error("[landing] worker tick failed:", err));
  }, POLL_INTERVAL_MS);
  console.log(`[landing] worker started (interval ${POLL_INTERVAL_MS}ms, confirm deadline ${CONFIRM_DEADLINE_MS / 1000}s)`);
}

export { processOnce as processLandingJobsOnce };
