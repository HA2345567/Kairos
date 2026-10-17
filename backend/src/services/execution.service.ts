import { createHash, randomUUID } from "node:crypto";
import { Connection, MessageV0, PublicKey, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { repository } from "../db/repository";
import { Execution, ExecutionLeg } from "../db/schema";
import { AppError } from "../errors";
import { config } from "../config";
import { quoteService } from "./quote.service";
import { relayerService } from "./relayer.service";
import { assertSettled, legSide, recoverySell, retryBuy } from "./execution-recovery";
import { saveRecovery, type RecoveryAction } from "../db/recovery";
import { recoveryRequest } from "./recovery-request";
import { poolForPair } from "../chain/pool-config";
import { getConnection, getSignatureStatuses } from "../chain/connection";
import {
  buildLegSwapTx,
  buildReverseLegTx,
  getLatestBlockhashWithHeight,
  simulate,
} from "../chain/mockSwap";
import { getTokenBalances } from "../chain/balances";
import { DEVNET_LABELS, deterministicKeypair, loadDevnetState } from "../chain/devnetState";
import { usdcToBaseUnits } from "./money";

/**
 * Execution engine (PRD §4.4): prepare → sign (client) → submit → land.
 *
 * prepare  — real per-leg swap transactions (authority-controlled treasury,
 *            relayer fee payer), real recent blockhash, simulation gate,
 *            SHA-256 message hashes for byte verification, ~60 s expiry.
 * submit   — byte-verify signed messages against stored hashes, verify the
 *            user signature (or delegated-signing policy), enqueue landing
 *            jobs and return immediately; workers land asynchronously.
 * Landing  lives in workers/landing.ts (send → confirm → per-leg status →
 *            position/fee/outbox updates → execution state machine).
 *
 * Fees: input-side for opens/rebalances (separate USDC transfer per leg),
 * output-side (deducted from proceeds) for close/unwind —
 * never both (PRD §4.4 rule 5).
 */

export interface PrepareParams {
  basketSlug: string;
  usdcAmount: number;
  walletAddress: string;
  idempotencyKey: string;
}

export interface SubmitParams {
  executionId: string;
  signedTxs: string[]; // base64 versioned transactions, user signature added
  idempotencyKey?: string;
}

export interface PrepareLegInput {
  mint: string;
  symbol: string;
  inUsdcAmount: number;
  side?: "buy" | "sell";
  inAssetBaseUnits?: number;
  feeUsdc?: number;
  /** Pre-computed expected asset out in base units; recomputed when omitted. */
  expectedOutBaseUnits?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usdToBase = usdcToBaseUnits;

function requireDevnet() {
  const state = loadDevnetState();
  if (!state) {
    throw new AppError("DEVNET_NOT_INITIALIZED", "Run scripts/devnet-setup.ts first", 503);
  }
  return state;
}

async function killSwitchActive(): Promise<boolean> {
  return (await repository.getSetting("global_kill_switch")) === "true";
}

export function allocateFeeBaseUnits(totalFee: number, legs: PrepareLegInput[]): number[] {
  const total = usdToBase(totalFee);
  if (total <= 0 || legs.length === 0) return legs.map(() => 0);
  const weights = legs.map((leg) => Math.max(0, usdToBase(leg.inUsdcAmount)));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) return legs.map(() => 0);
  const fees = weights.map((weight) => Math.floor((total * weight) / weightSum));
  const largest = weights.indexOf(Math.max(...weights));
  fees[largest] += total - fees.reduce((sum, fee) => sum + fee, 0);
  return fees;
}

/** Shared prepare pipeline: builds + simulates per-leg txs and persists a PREPARED execution. */
async function prepareWithLegs(opts: {
  walletAddress: string;
  idempotencyKey: string;
  type: Execution["type"];
  basketId: string;
  basketVersionId: string;
  totalUsdc: number;
  feeUsdc: number;
  legs: PrepareLegInput[];
  auditAction: string;
  baseExecutionId?: string;
  recoveryAction?: RecoveryAction;
  replaceRecoveryId?: string;
}): Promise<Execution> {
  const state = requireDevnet();
  const user = new PublicKey(opts.walletAddress);
  const relayer = relayerService.getKeypair();
  const treasury = deterministicKeypair(DEVNET_LABELS.treasury);
  const usdcMint = new PublicKey(state.usdc.mint);
  const conn = getConnection();

  const { blockhash, lastValidBlockHeight } = await getLatestBlockhashWithHeight(conn);

  // Best-effort USDC balance guard for opens only (PRD §4.4): sells are funded
  // by the assets being sold, and rebalance buys are funded by the sells.
  // Skipped in simulation mode (no live faucet/balances on this host).
  if (opts.type === "open" && !config.simulateLanding) {
    try {
      const balances = await getTokenBalances(conn, user, [usdcMint]);
      const usdcRaw = Number(balances[usdcMint.toBase58()] ?? 0);
      if (usdcRaw < usdToBase(opts.totalUsdc)) {
        throw new AppError(
          "INSUFFICIENT_BALANCE",
          `Wallet holds ${(usdcRaw / 1e6).toFixed(2)} USDC, needs ${opts.totalUsdc.toFixed(2)}`,
          422
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.warn("[execution] balance check skipped (RPC unavailable):", (err as Error).message);
    }
  }

  const preparedTxs: string[] = [];
  const messageHashes: string[] = [];
  const legs: ExecutionLeg[] = [];
  const feeByLeg = allocateFeeBaseUnits(opts.feeUsdc, opts.legs);
  const publishedVersion = config.swapBuilder === "program"
    ? await repository.getBasketVersion(opts.basketVersionId)
    : undefined;
  if (config.swapBuilder === "program" &&
      (!publishedVersion || publishedVersion.basketId !== opts.basketId ||
       !Number.isInteger(publishedVersion.version) || publishedVersion.version < 1 || publishedVersion.version > 0xffff_ffff)) {
    throw new AppError("BASKET_VERSION_NOT_FOUND", "The selected immutable basket version is unavailable", 409);
  }
  if (publishedVersion && opts.legs.some(leg => !publishedVersion.legs.some(item => item.mint === leg.mint))) {
    throw new AppError("BASKET_VERSION_MISMATCH", "A requested mint is outside the selected basket version", 409);
  }

  for (let i = 0; i < opts.legs.length; i++) {
    const legIn = opts.legs[i];
    const token = (await repository.getToken(legIn.mint));
    if (!token) throw new AppError("BASKET_NOT_FOUND", `Leg mint ${legIn.mint} is not in the token registry`, 422);
    const decimals = token.decimals;
    const price = token.priceUsd > 0 ? token.priceUsd : 1;
    const inBase = usdToBase(legIn.inUsdcAmount);
    const expectedOutBase =
      legIn.expectedOutBaseUnits ?? Math.floor((legIn.inUsdcAmount / price) * 10 ** decimals);

    // Allocate the basket fee over legs so a failed leg never charges fees for
    // legs that did not land.
    const feeBaseUnits = legIn.feeUsdc === undefined ? feeByLeg[i] ?? 0 : usdToBase(legIn.feeUsdc);
    const includeFeeUsdcBaseUnits = feeBaseUnits;

    const isSell = (legIn.side ?? (opts.type === "close" ? "sell" : "buy")) === "sell";
    if (isSell && (!Number.isSafeInteger(legIn.inAssetBaseUnits) || legIn.inAssetBaseUnits! <= 0)) {
      throw new AppError("INVALID_INPUT", "Sell input must be a positive safe integer in base units", 422);
    }

    const built =
      config.swapBuilder === "program"
        ? await (async () => {
            // On-chain kairos_router path (user's build order: program → backend).
            // Fee + memo live INSIDE the program instruction; min-out slippage
            // uses the quote's min.
            const { buildProgramBuyLeg, buildProgramSellLeg, globalConfigPda, basketConfigPda, basketVersionPda } =
              await import("../chain/programSwap");
            const common = {
              user,
              usdcMint,
              assetMint: new PublicKey(legIn.mint),
              relayer,
              recentBlockhash: blockhash,
              basketVersion: publishedVersion!.version,
              basketVersionPda: basketVersionPda(opts.basketId, publishedVersion!.version),
              feeBps: opts.type === "rebalance" ? config.rebalanceFeeBps : config.platformFeeBps,
              memo: `kairos:${opts.basketId}:${opts.basketVersionId}:leg${i + 1}`,
            };
            if (isSell) {
              const p = await buildProgramSellLeg({
                ...common,
                userAssetAta: await (await import("@solana/spl-token")).getAssociatedTokenAddress(
                  new PublicKey(legIn.mint),
                  user
                ),
                userUsdcAta: await (await import("@solana/spl-token")).getAssociatedTokenAddress(
                  usdcMint,
                  user
                ),
                treasuryUsdcAta: await (await import("@solana/spl-token")).getAssociatedTokenAddress(
                  usdcMint,
                  treasury.publicKey
                ),
                globalConfigPda: globalConfigPda(),
                basketConfigPda: basketConfigPda(opts.basketId),
                pool: poolForPair(legIn.mint, state.usdc.mint),
                amountInAssetBase: legIn.inAssetBaseUnits!,
                minUsdcOutBase: expectedOutBase,
              });
              return { transaction: p.transaction, messageHash: p.messageHash };
            }
            const p = await buildProgramBuyLeg({
              ...common,
              userAssetAta: await (await import("@solana/spl-token")).getAssociatedTokenAddress(
                new PublicKey(legIn.mint),
                user
              ),
              userUsdcAta: await (await import("@solana/spl-token")).getAssociatedTokenAddress(
                usdcMint,
                user
              ),
              treasuryUsdcAta: await (await import("@solana/spl-token")).getAssociatedTokenAddress(
                usdcMint,
                treasury.publicKey
              ),
              globalConfigPda: globalConfigPda(),
              basketConfigPda: basketConfigPda(opts.basketId),
              pool: poolForPair(state.usdc.mint, legIn.mint),
              amountInUsdcBase: inBase + feeBaseUnits,
              minAmountOutBase: Math.floor(
                (Number(expectedOutBase) * (10000 - 50)) / 10000
              ),
            });
            return { transaction: p.transaction, messageHash: p.messageHash };
          })()
        : isSell
        ? await buildReverseLegTx({
            user,
            usdcMint,
            assetMint: new PublicKey(legIn.mint),
            assetDecimals: decimals,
            // For close legs prepared here (unwind), in/out are already base units.
            inAssetBaseUnits: legIn.inAssetBaseUnits!,
            expectedOutUsdcBaseUnits: expectedOutBase,
            treasury,
            relayer,
            includeFeeUsdcBaseUnits,
            recentBlockhash: blockhash,
          })
        : await buildLegSwapTx({
            user,
            usdcMint,
            assetMint: new PublicKey(legIn.mint),
            assetDecimals: decimals,
            inUsdcBaseUnits: inBase,
            expectedOutBaseUnits: expectedOutBase,
            treasury,
            relayer,
            includeFeeUsdcBaseUnits,
            recentBlockhash: blockhash,
          });

    if (config.simulateLanding) {
      // Simulation mode: skip the RPC simulate gate (mints don't exist on any
      // reachable chain here). Static sanity instead: transaction compiled,
      // required signers present.
      if (built.transaction.message.header.numRequiredSignatures < 1) {
        throw new AppError("SIMULATION_FAILED", `Leg ${i + 1} (${legIn.symbol}): no required signers`, 422);
      }
    } else {
      const sim = await simulate(conn, built.transaction);
      if (!sim.ok) {
        throw new AppError("SIMULATION_FAILED", `Leg ${i + 1} (${legIn.symbol}): ${sim.error ?? "simulation failed"}`, 422);
      }
    }

    preparedTxs.push(Buffer.from(built.transaction.serialize()).toString("base64"));
    messageHashes.push(built.messageHash);
    legs.push({
      id: `leg-${i + 1}`,
      executionId: "",
      mint: legIn.mint,
      symbol: legIn.symbol,
      inAmountUsdc: legIn.inUsdcAmount,
      inUsdcBaseUnits: String(inBase),
      feeUsdc: feeBaseUnits / 1_000_000,
      feeBaseUnits: String(feeBaseUnits),
      side: isSell ? "sell" : "buy",
      inputBaseUnits: String(isSell ? legIn.inAssetBaseUnits : inBase + feeBaseUnits),
      expectedOut: String(expectedOutBase),
      messageHash: built.messageHash,
      status: "PENDING",
    });
  }

  const now = new Date();
  const wallet = (await repository.getWalletByAddress(opts.walletAddress));
  const execution: Execution = {
    id: "exec-" + randomUUID().slice(0, 10),
    baseExecutionId: opts.baseExecutionId,
    recoveryAction: opts.recoveryAction,
    walletId: wallet?.id ?? `wal-${opts.walletAddress.slice(0, 8)}`,
    walletAddress: opts.walletAddress,
    basketId: opts.basketId,
    basketVersionId: opts.basketVersionId,
    type: opts.type,
    status: "PREPARED",
    idempotencyKey: opts.idempotencyKey,
    totalUsdc: opts.totalUsdc,
    totalUsdcBaseUnits: String(usdcToBaseUnits(opts.totalUsdc)),
    feeUsdc: opts.feeUsdc,
    feeUsdcBaseUnits: String(usdcToBaseUnits(opts.feeUsdc)),
    preparedTxs,
    messageHashes,
    blockhash,
    lastValidBlockHeight,
    expiresAt: new Date(now.getTime() + config.quoteValiditySec * 1000).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    legs,
  };
  legs.forEach((l) => (l.executionId = execution.id));

  if (opts.recoveryAction) return saveRecovery(execution, opts.replaceRecoveryId);

  try {
    (await repository.saveExecution(execution));
  } catch (err) {
    if (err instanceof AppError && err.code === "IDEMPOTENCY_CONFLICT") {
      const existing = (await repository.getExecutionByIdempotency(opts.idempotencyKey, opts.walletAddress));
      if (existing) {
        if (
          existing.type === opts.type &&
          existing.basketId === opts.basketId &&
          existing.totalUsdc === opts.totalUsdc
        ) {
          return existing;
        }
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key already used for a different request", 409);
      }
    }
    throw err;
  }

  (await repository.logAudit({
    actor: opts.walletAddress,
    action: opts.auditAction,
    entity: "execution",
    entityId: execution.id,
    after: {
      type: opts.type,
      totalUsdc: opts.totalUsdc,
      feeUsdc: opts.feeUsdc,
      legs: legs.length,
      baseExecutionId: opts.baseExecutionId,
    },
  }));
  return execution;
}

export class ExecutionService {
  async prepare(params: PrepareParams): Promise<Execution> {
    if ((await killSwitchActive())) {
      throw new AppError("KILL_SWITCH_ACTIVE", "New investments are halted by the kill switch", 503);
    }

    // Idempotency keys are wallet-scoped and can only replay the same request.
    const existing = (await repository.getExecutionByIdempotency(params.idempotencyKey, params.walletAddress));
    if (existing) {
      const basket = (await repository.getBasketBySlug(params.basketSlug));
      if (
        existing.baseExecutionId !== undefined || existing.type !== "open" ||
        existing.basketId !== basket?.id ||
        existing.totalUsdc !== params.usdcAmount
      ) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key already used for a different request", 409);
      }
      return existing;
    }

    const basket = (await repository.getBasketBySlug(params.basketSlug));
    if (!basket) throw new AppError("BASKET_NOT_FOUND", `Basket ${params.basketSlug} not found`, 404);
    if (basket.status !== "active") throw new AppError("BASKET_NOT_ACTIVE", undefined, 422);
    if (params.usdcAmount < basket.minUsdc) {
      throw new AppError("MIN_INVESTMENT", `Minimum investment is ${basket.minUsdc} USDC`, 422);
    }

    const quote = await quoteService.getQuote(params.basketSlug, params.usdcAmount);
    const investable = quote.legs.filter((l) => l.inUsdcAmount >= config.dustThresholdUsdc);
    if (investable.length === 0) {
      throw new AppError("DUST_LEG_FORBIDDEN", "Amount too small — every leg would be dust", 422);
    }

    return (await prepareWithLegs({
      walletAddress: params.walletAddress,
      idempotencyKey: params.idempotencyKey,
      type: "open",
      basketId: basket.id,
      basketVersionId: quote.basketVersionId,
      totalUsdc: params.usdcAmount,
      feeUsdc: quote.platformFeeUsdc,
      legs: investable.map((l) => ({
        mint: l.mint,
        symbol: l.symbol,
        inUsdcAmount: l.inUsdcAmount,
      })),
      auditAction: "PREPARE_EXECUTION",
    }));
  }

  async submit(params: SubmitParams): Promise<Execution> {
    const execution = (await repository.getExecution(params.executionId));
    if (!execution) throw new AppError("EXECUTION_NOT_FOUND", undefined, 404);

    // Idempotent: already submitted / landing / terminal → return as-is.
    if (execution.status !== "PREPARED") return execution;

    if (new Date(execution.expiresAt).getTime() < Date.now()) {
      const current = await repository.withExecutionLock(execution.id, async (current) => {
        if (current.status === "PREPARED") {
          current.status = "EXPIRED";
          await repository.updateExecutionStatus(current.id, current.status);
        }
        return current;
      });
      if (current.status !== "EXPIRED") return current;
      throw new AppError("EXECUTION_EXPIRED", "Prepared transactions were never signed in time", 410);
    }

    if (params.signedTxs.length !== execution.legs.length) {
      throw new AppError(
        "SIGNED_TRANSACTION_COUNT_MISMATCH",
        `expected ${execution.legs.length} signed transactions, got ${params.signedTxs.length}`,
        400
      );
    }

    const userPk = new PublicKey(execution.walletAddress);

    for (let i = 0; i < params.signedTxs.length; i++) {
      let signedTx: VersionedTransaction;
      try {
        signedTx = VersionedTransaction.deserialize(Buffer.from(params.signedTxs[i], "base64"));
      } catch {
        throw new AppError("TAMPERED_TRANSACTION", "Malformed transaction bytes", 400);
      }

      // Byte verification (critical security control, PRD §4.4).
      const incomingHash = createHash("sha256")
        .update(Buffer.from(signedTx.message.serialize()))
        .digest("hex");
      if (incomingHash !== execution.messageHashes[i]) {
        (await repository.logAudit({
          actor: execution.walletAddress,
          action: "BYTE_VERIFICATION_FAILED",
          entity: "execution",
          entityId: execution.id,
          before: { leg: i, expectedHash: execution.messageHashes[i] },
          after: { incomingHash },
        }));
        throw new AppError("TAMPERED_TRANSACTION", "Signed message differs from the prepared message", 400);
      }

      const msg = signedTx.message as MessageV0;
      const messageBytes = msg.serialize();
      const signerCount = msg.header.numRequiredSignatures;
      for (let signerIndex = 0; signerIndex < signerCount; signerIndex++) {
        const signature = signedTx.signatures[signerIndex];
        const signer = msg.staticAccountKeys[signerIndex];
        if (
          !signature ||
          signature.every((byte) => byte === 0) ||
          !nacl.sign.detached.verify(messageBytes, signature, signer.toBytes())
        ) {
          throw new AppError("TAMPERED_TRANSACTION", `Invalid required signature on leg ${i + 1}`, 400);
        }
      }
      const userIndex = msg.staticAccountKeys
        .slice(0, signerCount)
        .findIndex((key) => key.equals(userPk));
      if (userIndex < 0) {
        throw new AppError("TAMPERED_TRANSACTION", "Wallet is not a required signer on leg " + (i + 1), 400);
      }
    }

    // Jobs, state, audit, and outbox become visible in one commit. A competing
    // submit waits for this lock, then returns the already accepted execution.
    const accepted = await repository.withExecutionLock(execution.id, async (current) => {
      if (current.status !== "PREPARED") return current;
      if (new Date(current.expiresAt).getTime() < Date.now()) {
        current.status = "EXPIRED";
        await repository.updateExecutionStatus(current.id, current.status);
        return current;
      }
      current.status = "SUBMITTED";
      current.updatedAt = new Date().toISOString();
      for (let i = 0; i < params.signedTxs.length; i++) {
        const leg = current.legs[i];
        await repository.enqueueJob(
          current.id,
          leg.id,
          "land_leg",
          {
            executionId: current.id,
            legId: leg.id,
            signedTxBase64: params.signedTxs[i],
            mint: leg.mint,
          },
          Date.now()
        );
      }
      await repository.updateExecutionStatus(current.id, current.status);
      await repository.enqueueOutbox("execution.submitted", {
        executionId: current.id,
        legs: current.legs.length,
      });
      await repository.logAudit({
        actor: current.walletAddress,
        action: "SUBMIT_EXECUTION",
        entity: "execution",
        entityId: current.id,
        after: { status: "SUBMITTED", legs: current.legs.length },
      });
      return current;
    });
    if (accepted.status === "EXPIRED") throw new AppError("EXECUTION_EXPIRED", "Prepared transactions expired before acceptance", 410);
    return accepted;
  }

  /** Retry only the FAILED legs of a previous execution (PRD §4.4). */
  async retryFailed(baseExecutionId: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    const base = (await repository.getExecution(baseExecutionId));
    if (!base) throw new AppError("EXECUTION_NOT_FOUND", undefined, 404);
    if (base.walletAddress !== walletAddress) {
      throw new AppError("UNAUTHORIZED", "Execution belongs to another wallet", 403);
    }
    assertSettled(base);
    const recovery = await recoveryRequest(base, idempotencyKey, "retry");
    if (recovery.existing) return recovery.existing;
    const failed = base.legs.filter((l) => l.status === "FAILED");
    if (failed.length === 0) {
      throw new AppError("NO_FAILED_LEGS", "Every leg of this execution landed; nothing to retry", 422);
    }

    const legs = await Promise.all(failed.map(async leg => legSide(base, leg) === "sell"
      ? recoverySell(leg, leg.inputBaseUnits, await repository.getToken(leg.mint), base.type === "rebalance" ? config.rebalanceFeeBps : config.platformFeeBps)
      : retryBuy(leg, base.type, base.type === "rebalance" ? config.rebalanceFeeBps : config.platformFeeBps)));
    if (legs.some(leg => leg.side === "buy") && await killSwitchActive()) {
      throw new AppError("KILL_SWITCH_ACTIVE", "New investments are halted by the kill switch", 503);
    }
    const feeUsdc = legs.reduce((sum, leg) => sum + (leg.feeUsdc ?? 0), 0);
    const totalUsdc = legs.reduce((sum, leg) => sum + leg.inUsdcAmount + (leg.side === "buy" ? leg.feeUsdc ?? 0 : 0), 0);

    return (await prepareWithLegs({
      walletAddress,
      idempotencyKey,
      type: base.type,
      basketId: base.basketId,
      basketVersionId: base.basketVersionId,
      totalUsdc,
      feeUsdc,
      legs,
      auditAction: "RETRY_FAILED_LEGS",
      baseExecutionId: base.id,
      recoveryAction: "retry",
      replaceRecoveryId: recovery.replaceId,
    }));
  }

  /** Unwind: sell the CONFIRMED legs of a partial execution back to USDC. */
  async unwind(executionId: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    const base = (await repository.getExecution(executionId));
    if (!base) throw new AppError("EXECUTION_NOT_FOUND", undefined, 404);
    if (base.walletAddress !== walletAddress) {
      throw new AppError("UNAUTHORIZED", "Execution belongs to another wallet", 403);
    }
    assertSettled(base);
    const recovery = await recoveryRequest(base, idempotencyKey, "unwind");
    if (recovery.existing) return recovery.existing;
    const landed = base.legs.filter((l) => l.status === "CONFIRMED" && legSide(base, l) === "buy" && Number(l.actualOut ?? 0) > 0);
    if (landed.length === 0) {
      throw new AppError("DUST_LEG_FORBIDDEN", "No landed legs to unwind", 422);
    }

    // Sell-leg fee model: OUTPUT-side (deducted from USDC proceeds) — the
    // user has no USDC balance to transfer pre-sell; "never both" still holds.
    const legs = await Promise.all(landed.map(async leg => recoverySell(
      leg, leg.receipt?.actualOut ?? leg.actualOut, await repository.getToken(leg.mint), config.platformFeeBps
    )));
    const totalGross = legs.reduce((sum, leg) => sum + leg.inUsdcAmount, 0);
    const totalFee = legs.reduce((sum, leg) => sum + (leg.feeUsdc ?? 0), 0);

    return (await prepareWithLegs({
      walletAddress,
      idempotencyKey,
      type: "close",
      basketId: base.basketId,
      basketVersionId: base.basketVersionId,
      totalUsdc: Number(totalGross.toFixed(4)),
      feeUsdc: totalFee,
      legs,
      auditAction: "UNWIND_LANDED_LEGS",
      baseExecutionId: base.id,
      recoveryAction: "unwind",
      replaceRecoveryId: recovery.replaceId,
    }));
  }
}

export const executionService = new ExecutionService();
