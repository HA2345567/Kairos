import { randomUUID } from "node:crypto";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { ataFor, basketConfigPda, basketVersionPda, buildProgramBuyLeg, buildProgramSellLeg, globalConfigPda } from "../chain/programSwap";
import { poolForPair } from "../chain/pool-config";
import type { Execution, ExecutionLeg } from "../db/schema";
import { AppError } from "../errors";
import { config } from "../config";
import { buildLegSwapTx, buildReverseLegTx, getLatestBlockhashWithHeight, simulate, USDC_DECIMALS } from "../chain/mockSwap";
import { DEVNET_LABELS, deterministicKeypair, loadDevnetState } from "../chain/devnetState";
import { relayerService } from "./relayer.service";
import { resolveUsdcAsset } from "./portfolio.service";
import type { RebalancePlan } from "./rebalance-plan";
import { repository } from "../db/repository";

const round2 = (n: number) => Number(n.toFixed(2));
const fmtOut = (amount: number, decimals: number) => amount.toFixed(Math.max(0, Math.min(decimals, 6)));

export interface RebalancePreview {
  kind: "rebalance" | "close";
  fromVersionId: string;
  toVersionId: string;
  totalSellUsdc: number;
  feeUsdc: number;
  netUsdcToRedeploy: number;
  estimatedReturnUsdc: number;
  estimatedPriceImpactPct: string;
  driftBeforePct: number;
  sells: Array<{
    mint: string;
    symbol: string;
    amountToSell: string;
    expectedUsdcOut: string;
  }>;
  buys: Array<{
    mint: string;
    symbol: string;
    usdcIn: string;
    expectedOut: string;
  }>;
  expiresAt: string;
}
export type PreparedExecution = Execution & { preview: RebalancePreview };

export async function assembleRebalanceExecution(opts: {
  conn: Connection;
  user: PublicKey;
  walletAddress: string;
  walletId: string;
  idempotencyKey: string;
  type: "rebalance" | "close";
  basketId: string;
  basketVersionId: string;
  plan: RebalancePlan;
  fromVersionId: string;
}): Promise<PreparedExecution> {
  const { conn, user, plan } = opts;
  const programMode = config.swapBuilder === "program";
  const devnetState = programMode ? loadDevnetState() : null;
  if (programMode && !devnetState) {
    throw new AppError("DEVNET_NOT_INITIALIZED", "Run scripts/devnet-setup.ts first", 503);
  }

  // A rebalance can sell a leg that was removed from the target version. The
  // router validates each mint against its immutable version account, so sells
  // use the source version while buys use the target version.
  const sourceVersion = programMode ? await repository.getBasketVersion(opts.fromVersionId) : undefined;
  const targetVersion = programMode ? await repository.getBasketVersion(opts.basketVersionId) : undefined;
  const validVersion = (version: typeof sourceVersion, id: string): version is NonNullable<typeof sourceVersion> =>
    !!version && version.basketId === opts.basketId &&
    Number.isInteger(version.version) && version.version >= 1 && version.version <= 0xffff_ffff &&
    version.id === id;
  if (programMode && (!validVersion(sourceVersion, opts.fromVersionId) || !validVersion(targetVersion, opts.basketVersionId))) {
    throw new AppError("BASKET_VERSION_NOT_FOUND", "The selected immutable basket version is unavailable", 409);
  }

  const usdc = programMode
    ? { mint: devnetState!.usdc.mint }
    : await resolveUsdcAsset();
  const usdcMint = new PublicKey(usdc.mint);
  const treasury = deterministicKeypair(DEVNET_LABELS.treasury); // PRD §11.1 treasury pattern
  const relayer = relayerService.getKeypair();
  const { blockhash: recentBlockhash, lastValidBlockHeight } = await getLatestBlockhashWithHeight(conn);

  const userUsdcAta = programMode ? await ataFor(usdcMint, user) : undefined;
  const treasuryUsdcAta = programMode ? await ataFor(usdcMint, treasury.publicKey) : undefined;

  const preparedTxs: string[] = [];
  const messageHashes: string[] = [];
  const legs: ExecutionLeg[] = [];
  let legIndex = 0;

  const pushLeg = (lb: { transaction: VersionedTransaction; messageHash: string }, leg: ExecutionLeg) => {
    preparedTxs.push(Buffer.from(lb.transaction.serialize()).toString("base64"));
    messageHashes.push(lb.messageHash);
    legs.push(leg);
    legIndex += 1;
  };

  for (const s of plan.sells) {
    const feeForLegBase = s.feeBaseUnits;
    const assetMint = new PublicKey(s.mint);
    const legVersion = sourceVersion!;
    if (programMode && !legVersion.legs.some((leg) => leg.mint === s.mint)) {
      throw new AppError("BASKET_VERSION_MISMATCH", `Sell mint ${s.mint} is outside the source basket version`, 409);
    }
    const lb = programMode
      ? await buildProgramSellLeg({
          user,
          usdcMint,
          assetMint,
          userAssetAta: await ataFor(assetMint, user),
          userUsdcAta: userUsdcAta!,
          treasuryUsdcAta: treasuryUsdcAta!,
          globalConfigPda: globalConfigPda(),
          basketConfigPda: basketConfigPda(opts.basketId),
           basketVersion: legVersion.version,
           basketVersionPda: basketVersionPda(opts.basketId, legVersion.version),
           feeBps: opts.type === "close" ? config.platformFeeBps : config.rebalanceFeeBps,
          pool: poolForPair(s.mint, devnetState!.usdc.mint),
          relayer,
          recentBlockhash,
          amountInAssetBase: s.inAssetBaseUnits,
          // The plan's sell quote is gross proceeds; the router applies the
          // operation fee once after enforcing this exact minimum.
          minUsdcOutBase: Math.round(s.expectedUsdcOut * Math.pow(10, USDC_DECIMALS)),
          memo: `kairos:${opts.basketId}:${opts.basketVersionId}:leg${legIndex + 1}`,
        })
      : await buildReverseLegTx({
          user,
          usdcMint,
          assetMint,
          assetDecimals: s.assetDecimals,
          inAssetBaseUnits: s.inAssetBaseUnits,
          expectedOutUsdcBaseUnits: Math.round(s.expectedUsdcOut * Math.pow(10, USDC_DECIMALS)),
          treasury,
          relayer,
          includeFeeUsdcBaseUnits: feeForLegBase,
          recentBlockhash,
        });
    // Simulation mode (KAIROS_SIMULATE_LANDING=1): skip the RPC simulate
    // gate — the tx is built for real, but no chain state exists on this host.
    if (!config.simulateLanding) {
      const simResult = await simulate(conn, lb.transaction);
      if (!simResult.ok) {
        throw new AppError("SIMULATION_FAILED", `SELL_LEG_${s.mint}: ${simResult.error ?? "simulation failed"}`);
      }
    }
    pushLeg(lb, {
      id: `l-${legIndex + 1}-${randomUUID().slice(0, 8)}`,
      executionId: "", // set once the execution id exists
      mint: s.mint,
      symbol: s.symbol,
      inAmountUsdc: s.expectedUsdcOut, // USDC side of the sell
      feeUsdc: feeForLegBase / Math.pow(10, USDC_DECIMALS),
      side: "sell",
      inputBaseUnits: String(s.inAssetBaseUnits),
      expectedOut: String(Math.round(s.expectedUsdcOut * Math.pow(10, USDC_DECIMALS))),
      messageHash: lb.messageHash,
      status: "PENDING",
    });
  }

  // then buys
  for (const b of plan.buys) {
    const assetMint = new PublicKey(b.mint);
    const legVersion = targetVersion!;
    if (programMode && !legVersion.legs.some((leg) => leg.mint === b.mint)) {
      throw new AppError("BASKET_VERSION_MISMATCH", `Buy mint ${b.mint} is outside the target basket version`, 409);
    }
    const lb = programMode
      ? await buildProgramBuyLeg({
          user,
          usdcMint,
          assetMint,
          userAssetAta: await ataFor(assetMint, user),
          userUsdcAta: userUsdcAta!,
          treasuryUsdcAta: treasuryUsdcAta!,
          globalConfigPda: globalConfigPda(),
          basketConfigPda: basketConfigPda(opts.basketId),
           basketVersion: legVersion.version,
           basketVersionPda: basketVersionPda(opts.basketId, legVersion.version),
           feeBps: opts.type === "close" ? config.platformFeeBps : config.rebalanceFeeBps,
          pool: poolForPair(devnetState!.usdc.mint, b.mint),
          relayer,
          recentBlockhash,
          // Planned buy input is net of this side's fee. The router receives
          // the complete debit and deducts the fee exactly once on-chain.
          amountInUsdcBase: b.inUsdcBaseUnits + b.feeBaseUnits,
          minAmountOutBase: b.expectedOutBaseUnits,
          memo: `kairos:${opts.basketId}:${opts.basketVersionId}:leg${legIndex + 1}`,
        })
      : await buildLegSwapTx({
          user,
          usdcMint,
          assetMint,
          assetDecimals: b.assetDecimals,
          inUsdcBaseUnits: b.inUsdcBaseUnits,
          includeFeeUsdcBaseUnits: b.feeBaseUnits,
          expectedOutBaseUnits: b.expectedOutBaseUnits,
          treasury,
          relayer,
          recentBlockhash,
        });
    if (!config.simulateLanding) {
      const simResult = await simulate(conn, lb.transaction);
      if (!simResult.ok) {
        throw new AppError("SIMULATION_FAILED", `BUY_LEG_${b.mint}: ${simResult.error ?? "simulation failed"}`);
      }
    }
    pushLeg(lb, {
      id: `l-${legIndex + 1}-${randomUUID().slice(0, 8)}`,
      executionId: "",
      mint: b.mint,
      symbol: b.symbol,
      inAmountUsdc: b.usdcIn,
      feeUsdc: b.feeBaseUnits / 1_000_000,
      side: "buy",
      inputBaseUnits: String(b.inUsdcBaseUnits + b.feeBaseUnits),
      expectedOut: String(b.expectedOutBaseUnits),
      messageHash: lb.messageHash,
      status: "PENDING",
    });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.quoteValiditySec * 1000).toISOString();
  const execution: Execution = {
    id: "exec-" + randomUUID().slice(0, 10),
    walletId: opts.walletId,
    walletAddress: opts.walletAddress,
    basketId: opts.basketId,
    basketVersionId: opts.basketVersionId,
    type: opts.type,
    status: "PREPARED",
    idempotencyKey: opts.idempotencyKey,
    totalUsdc: plan.totalSellUsdc,
    feeUsdc: plan.feeUsdc,
    preparedTxs,
    messageHashes,
    blockhash: recentBlockhash,
    lastValidBlockHeight,
    expiresAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    legs,
  };
  for (const leg of legs) leg.executionId = execution.id;

  const preview: RebalancePreview = {
    kind: opts.type,
    fromVersionId: opts.fromVersionId,
    toVersionId: opts.basketVersionId,
    totalSellUsdc: plan.totalSellUsdc,
    feeUsdc: plan.feeUsdc,
    netUsdcToRedeploy: plan.netUsdcToRedeploy,
    estimatedReturnUsdc: round2(plan.totalSellUsdc - plan.feeUsdc),
    estimatedPriceImpactPct: "Unavailable",
    driftBeforePct: plan.driftBeforePct,
    sells: plan.sells.map((s) => ({
      mint: s.mint,
      symbol: s.symbol,
      amountToSell: s.amountAssetUi.toFixed(s.assetDecimals),
      expectedUsdcOut: s.expectedUsdcOut.toFixed(2),
    })),
    buys: plan.buys.map((b) => ({
      mint: b.mint,
      symbol: b.symbol,
      usdcIn: b.usdcIn.toFixed(2),
      expectedOut: fmtOut(b.expectedAssetOutUi, b.assetDecimals),
    })),
    expiresAt,
  };
  return { ...execution, preview };
}
