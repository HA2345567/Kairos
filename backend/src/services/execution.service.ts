import { createHash, randomUUID } from "node:crypto";
import { Connection, MessageV0, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { repository } from "../db/repository";
import { Execution, ExecutionLeg } from "../db/schema";
import { AppError } from "../errors";
import { config } from "../config";
import { quoteService } from "./quote.service";
import { relayerService } from "./relayer.service";
import { getConnection, getSignatureStatuses } from "../chain/connection";
import {
  USDC_DECIMALS,
  buildLegSwapTx,
  buildReverseLegTx,
  getLatestBlockhashWithHeight,
  simulate,
} from "../chain/mockSwap";
import { getTokenBalances } from "../chain/balances";
import { DEVNET_LABELS, deterministicKeypair, loadDevnetState } from "../chain/devnetState";

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
 * Fees: input-side for opens/rebalances (separate USDC transfer in leg 1's
 * transaction), output-side (deducted from proceeds) for close/unwind —
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
  /** Pre-computed expected asset out in base units; recomputed when omitted. */
  expectedOutBaseUnits?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usdToBase = (usd: number) => Math.round(usd * 10 ** USDC_DECIMALS);

/** Pool accounts for an asset mint, from shared/devnet-config.json (program builder). */
function poolForMint(mint: string): {
  authority: PublicKey;
  ammConfig: PublicKey;
  poolState: PublicKey;
  inputVault: PublicKey;
  outputVault: PublicKey;
  observation: PublicKey;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const cfgPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..", "shared", "devnet-config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const entry = Object.values<{ mint0: string; mint1: string } & Record<string, string>>(cfg.pools).find(
    (p) => p.mint0 === mint || p.mint1 === mint
  );
  if (!entry) throw new AppError("BASKET_NOT_FOUND", `No CPMM pool configured for mint ${mint}`, 422);
  return {
    authority: new PublicKey(entry.authority ?? cfg.raydiumAuthority),
    ammConfig: new PublicKey(entry.ammConfig ?? cfg.ammConfig),
    poolState: new PublicKey(entry.poolId),
    inputVault: new PublicKey(entry.vault0),
    outputVault: new PublicKey(entry.vault1),
    observation: new PublicKey(entry.observationKey),
  };
}

function requireDevnet() {
  const state = loadDevnetState();
  if (!state) {
    throw new AppError("DEVNET_NOT_INITIALIZED", "Run scripts/devnet-setup.ts first", 503);
  }
  return state;
}

function killSwitchActive(): boolean {
  return repository.getSetting("global_kill_switch") === "true";
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
  let feeCharged = false;

  for (let i = 0; i < opts.legs.length; i++) {
    const legIn = opts.legs[i];
    const token = repository.getToken(legIn.mint);
    if (!token) throw new AppError("BASKET_NOT_FOUND", `Leg mint ${legIn.mint} is not in the token registry`, 422);
    const decimals = token.decimals;
    const price = token.priceUsd > 0 ? token.priceUsd : 1;
    const inBase = usdToBase(legIn.inUsdcAmount);
    const expectedOutBase =
      legIn.expectedOutBaseUnits ?? Math.floor((legIn.inUsdcAmount / price) * 10 ** decimals);

    // Fee rides on the first leg only (input-side), never on every leg.
    const includeFeeUsdcBaseUnits = !feeCharged && opts.feeUsdc > 0 ? usdToBase(opts.feeUsdc) : 0;
    if (includeFeeUsdcBaseUnits > 0) feeCharged = true;

    const isSell = opts.type === "close" || opts.type === "rebalance" ? undefined : false;
    void isSell;

    const built =
      config.swapBuilder === "program"
        ? await (async () => {
            // On-chain kairos_router path (user's build order: program → backend).
            // Fee + memo live INSIDE the program instruction; min-out slippage
            // uses the quote's min.
            const { buildProgramBuyLeg, buildProgramSellLeg, globalConfigPda, basketConfigPda } =
              await import("../chain/programSwap");
            const common = {
              user,
              usdcMint,
              assetMint: new PublicKey(legIn.mint),
              relayer,
              recentBlockhash: blockhash,
              memo: `kairos:${opts.basketId}:${opts.basketVersionId}:leg${i + 1}`,
            };
            if (opts.type === "close") {
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
                pool: poolForMint(legIn.mint),
                amountInAssetBase: Number(
                  (legIn as PrepareLegInput & { inAssetBaseUnits?: number }).inAssetBaseUnits ?? 0
                ),
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
              pool: poolForMint(legIn.mint),
              amountInUsdcBase: inBase,
              minAmountOutBase: Math.floor(
                (Number(expectedOutBase) * (10000 - 50)) / 10000
              ),
            });
            return { transaction: p.transaction, messageHash: p.messageHash };
          })()
        : opts.type === "close"
        ? await buildReverseLegTx({
            user,
            usdcMint,
            assetMint: new PublicKey(legIn.mint),
            assetDecimals: decimals,
            // For close legs prepared here (unwind), in/out are already base units.
            inAssetBaseUnits: Number((legIn as PrepareLegInput & { inAssetBaseUnits?: number }).inAssetBaseUnits ?? 0),
            expectedOutUsdcBaseUnits: expectedOutBase,
            treasury,
            relayer,
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
      expectedOut: String(expectedOutBase),
      messageHash: built.messageHash,
      status: "PENDING",
    });
  }

  const now = new Date();
  const wallet = repository.getWalletByAddress(opts.walletAddress);
  const execution: Execution = {
    id: "exec-" + randomUUID().slice(0, 10),
    walletId: wallet?.id ?? `wal-${opts.walletAddress.slice(0, 8)}`,
    walletAddress: opts.walletAddress,
    basketId: opts.basketId,
    basketVersionId: opts.basketVersionId,
    type: opts.type,
    status: "PREPARED",
    idempotencyKey: opts.idempotencyKey,
    totalUsdc: opts.totalUsdc,
    feeUsdc: opts.feeUsdc,
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

  try {
    repository.saveExecution(execution);
  } catch (err) {
    if (err instanceof AppError && err.code === "IDEMPOTENCY_CONFLICT") {
      const existing = repository.getExecutionByIdempotency(opts.idempotencyKey);
      if (existing) return existing;
    }
    throw err;
  }

  repository.logAudit({
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
  });
  return execution;
}

export class ExecutionService {
  async prepare(params: PrepareParams): Promise<Execution> {
    if (killSwitchActive()) {
      throw new AppError("KILL_SWITCH_ACTIVE", "New investments are halted by the kill switch", 503);
    }

    // Idempotency: same key returns the same execution, never double-lands.
    const existing = repository.getExecutionByIdempotency(params.idempotencyKey);
    if (existing) {
      if (existing.walletAddress.toLowerCase() !== params.walletAddress.toLowerCase()) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key already used by another wallet", 409);
      }
      return existing;
    }

    const basket = repository.getBasketBySlug(params.basketSlug);
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

    return prepareWithLegs({
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
    });
  }

  async submit(params: SubmitParams): Promise<Execution> {
    const execution = repository.getExecution(params.executionId);
    if (!execution) throw new AppError("EXECUTION_NOT_FOUND", undefined, 404);

    // Idempotent: already submitted / landing / terminal → return as-is.
    if (execution.status !== "PREPARED") return execution;

    if (new Date(execution.expiresAt).getTime() < Date.now()) {
      execution.status = "EXPIRED";
      execution.updatedAt = new Date().toISOString();
      repository.saveExecution(execution);
      throw new AppError("EXECUTION_EXPIRED", "Prepared transactions were never signed in time", 410);
    }

    if (params.signedTxs.length !== execution.legs.length) {
      throw new AppError(
        "SIGNED_TRANSACTION_COUNT_MISMATCH",
        `expected ${execution.legs.length} signed transactions, got ${params.signedTxs.length}`,
        400
      );
    }

    // Delegated-signing wallets (auto-rebalance) submit the partially-signed
    // prepared transactions as-is; everyone else must have added the user sig.
    const wallet = repository.getWalletByAddress(execution.walletAddress);
    const delegated = wallet?.delegatedSigning === true;
    const userPk = new PublicKey(execution.walletAddress);

    for (let i = 0; i < params.signedTxs.length; i++) {
      let signedTx: VersionedTransaction;
      try {
        signedTx = VersionedTransaction.deserialize(Buffer.from(params.signedTxs[i], "base64"));
      } catch {
        execution.status = "FAILED";
        execution.updatedAt = new Date().toISOString();
        repository.saveExecution(execution);
        throw new AppError("TAMPERED_TRANSACTION", "Malformed transaction bytes", 400);
      }

      // Byte verification (critical security control, PRD §4.4).
      const incomingHash = createHash("sha256")
        .update(Buffer.from(signedTx.message.serialize()))
        .digest("hex");
      if (incomingHash !== execution.messageHashes[i]) {
        execution.status = "FAILED";
        execution.updatedAt = new Date().toISOString();
        repository.saveExecution(execution);
        repository.logAudit({
          actor: execution.walletAddress,
          action: "BYTE_VERIFICATION_FAILED",
          entity: "execution",
          entityId: execution.id,
          before: { leg: i, expectedHash: execution.messageHashes[i] },
          after: { incomingHash },
        });
        throw new AppError("TAMPERED_TRANSACTION", "Signed message differs from the prepared message", 400);
      }

      if (!delegated) {
        const msg = signedTx.message as MessageV0;
        const userIndex = msg.staticAccountKeys.findIndex((k) => k.equals(userPk));
        const hasUserSig =
          userIndex >= 0 &&
          userIndex < msg.header.numRequiredSignatures &&
          signedTx.signatures[userIndex]?.some((b) => b !== 0);
        if (!hasUserSig) {
          throw new AppError("TAMPERED_TRANSACTION", "User signature missing on leg " + (i + 1), 400);
        }
      }
    }

    // Accept → queue landing. The response returns immediately; workers land.
    execution.status = "SUBMITTED";
    execution.updatedAt = new Date().toISOString();
    for (let i = 0; i < params.signedTxs.length; i++) {
      const leg = execution.legs[i];
      repository.enqueueJob(
        execution.id,
        leg.id,
        "land_leg",
        {
          executionId: execution.id,
          legId: leg.id,
          signedTxBase64: params.signedTxs[i],
          mint: leg.mint,
        },
        Date.now()
      );
    }
    repository.saveExecution(execution);
    repository.enqueueOutbox("execution.submitted", {
      executionId: execution.id,
      legs: execution.legs.length,
    });
    repository.logAudit({
      actor: execution.walletAddress,
      action: "SUBMIT_EXECUTION",
      entity: "execution",
      entityId: execution.id,
      after: { status: "SUBMITTED", legs: execution.legs.length },
    });
    return execution;
  }

  /** Retry only the FAILED legs of a previous execution (PRD §4.4). */
  async retryFailed(baseExecutionId: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    if (killSwitchActive()) {
      throw new AppError("KILL_SWITCH_ACTIVE", "New investments are halted by the kill switch", 503);
    }
    const base = repository.getExecution(baseExecutionId);
    if (!base) throw new AppError("EXECUTION_NOT_FOUND", undefined, 404);
    if (base.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new AppError("UNAUTHORIZED", "Execution belongs to another wallet", 403);
    }
    const failed = base.legs.filter((l) => l.status === "FAILED");
    if (failed.length === 0) {
      throw new AppError("NO_FAILED_LEGS", "Every leg of this execution landed; nothing to retry", 422);
    }

    const feeUsdc = Number(((failed.reduce((s, l) => s + l.inAmountUsdc, 0) * config.platformFeeBps) / 10000).toFixed(4));
    const netTotal = failed.reduce((s, l) => s + l.inAmountUsdc, 0);

    return prepareWithLegs({
      walletAddress,
      idempotencyKey,
      type: "open",
      basketId: base.basketId,
      basketVersionId: base.basketVersionId,
      totalUsdc: netTotal,
      feeUsdc,
      legs: failed.map((l) => ({ mint: l.mint, symbol: l.symbol, inUsdcAmount: l.inAmountUsdc })),
      auditAction: "RETRY_FAILED_LEGS",
      baseExecutionId: base.id,
    });
  }

  /** Unwind: sell the CONFIRMED legs of a partial execution back to USDC. */
  async unwind(executionId: string, idempotencyKey: string, walletAddress: string): Promise<Execution> {
    const base = repository.getExecution(executionId);
    if (!base) throw new AppError("EXECUTION_NOT_FOUND", undefined, 404);
    if (base.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new AppError("UNAUTHORIZED", "Execution belongs to another wallet", 403);
    }
    const landed = base.legs.filter((l) => l.status === "CONFIRMED" && Number(l.actualOut ?? 0) > 0);
    if (landed.length === 0) {
      throw new AppError("DUST_LEG_FORBIDDEN", "No landed legs to unwind", 422);
    }

    // Sell-leg fee model: OUTPUT-side (deducted from USDC proceeds) — the
    // user has no USDC balance to transfer pre-sell; "never both" still holds.
    const legs: PrepareLegInput[] = [];
    let totalGross = 0;
    let totalFee = 0;
    for (const leg of landed) {
      const token = repository.getToken(leg.mint);
      const decimals = token?.decimals ?? 6;
      const price = token && token.priceUsd > 0 ? token.priceUsd : 1;
      const assetBase = Number(leg.actualOut);
      const gross = (assetBase / 10 ** decimals) * price;
      const fee = Number(((gross * config.platformFeeBps) / 10000).toFixed(4));
      totalGross += gross;
      totalFee += fee;
      legs.push({
        mint: leg.mint,
        symbol: leg.symbol,
        inUsdcAmount: Number(gross.toFixed(4)),
        expectedOutBaseUnits: Math.floor((gross - fee) * 10 ** USDC_DECIMALS),
        ...( { inAssetBaseUnits: assetBase } as object),
      } as PrepareLegInput);
    }

    return prepareWithLegs({
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
    });
  }
}

export const executionService = new ExecutionService();
