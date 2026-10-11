import { createHash } from "node:crypto";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { config } from "../config";
import { getLatestBlockhash, withFailover } from "./connection";

/**
 * Mock swap transaction builder (contracts.md §6, plan.md §5).
 *
 * Devnet has no Jupiter liquidity / tokenized-stock venues, so swaps run
 * against an authority-controlled treasury (PRD §11.1):
 *   buy  leg: user USDC → treasury USDC, treasury asset → user asset
 *   sell leg: user asset → treasury asset, treasury USDC → user USDC
 *
 * Transactions are compiled to V0 messages with the relayer as fee payer and
 * pre-signed by [relayer, treasury]; the user's signature is intentionally
 * missing and is added client-side (byte-verify at submit compares
 * sha256(message bytes) to the stored messageHash).
 */

/** Our test USDC mint is always created with 6 decimals (devnet-setup). */
export const USDC_DECIMALS = 6;

const COMPUTE_UNIT_LIMIT = 200_000;
const PRIORITY_FEE_MICRO_LAMPORTS = 1_000;

export interface LegBuild {
  transaction: VersionedTransaction;
  messageHash: string;
  signersNeeded: "user"[];
}

interface CommonLegOpts {
  user: PublicKey;
  usdcMint: PublicKey;
  assetMint: PublicKey;
  assetDecimals: number;
  treasury: Keypair; // partial-signs the treasury-side transfer
  relayer: Keypair; // fee payer
  /** Extra USDC user→treasury transfer (platform fee); only leg 1 includes it. */
  includeFeeUsdcBaseUnits?: number;
  /** Real recent blockhash fetched by the caller (see getRecentBlockhash). */
  recentBlockhash: string;
}

export interface BuyLegOpts extends CommonLegOpts {
  inUsdcBaseUnits: number; // user spends this much USDC
  expectedOutBaseUnits: number; // treasury sends this much asset
}

export interface SellLegOpts extends CommonLegOpts {
  inAssetBaseUnits: number; // user sells this much asset
  expectedOutUsdcBaseUnits: number; // treasury sends this much USDC
}

function chaosConfig(): { forceSimulationFail?: boolean } {
  return (config as { chaos?: { forceSimulationFail?: boolean } }).chaos ?? {};
}

function computeBudgetIxs(): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICRO_LAMPORTS }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
  ];
}

function compileAndSign(
  relayer: Keypair,
  treasury: Keypair,
  recentBlockhash: string,
  instructions: TransactionInstruction[]
): LegBuild {
  const message = new TransactionMessage({
    payerKey: relayer.publicKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([relayer, treasury]); // user signature intentionally missing
  const messageHash = createHash("sha256").update(message.serialize()).digest("hex");
  return { transaction, messageHash, signersNeeded: ["user"] };
}

/** Buy leg: user USDC → treasury asset (plan.md §5 tx shape). */
export async function buildLegSwapTx(opts: BuyLegOpts): Promise<LegBuild> {
  const {
    user,
    usdcMint,
    assetMint,
    assetDecimals,
    inUsdcBaseUnits,
    expectedOutBaseUnits,
    treasury,
    relayer,
    includeFeeUsdcBaseUnits = 0,
    recentBlockhash,
  } = opts;

  const userAssetAta = await getAssociatedTokenAddress(assetMint, user);
  const userUsdcAta = await getAssociatedTokenAddress(usdcMint, user);
  const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, treasury.publicKey);
  const treasuryAssetAta = await getAssociatedTokenAddress(assetMint, treasury.publicKey);

  const instructions: TransactionInstruction[] = [
    ...computeBudgetIxs(),
    // 1) relayer pays rent for the user's asset ATA (idempotent)
    createAssociatedTokenAccountIdempotentInstruction(
      relayer.publicKey,
      userAssetAta,
      user,
      assetMint
    ),
    // 2) user USDC → treasury USDC (user signs)
    createTransferCheckedInstruction(
      userUsdcAta,
      usdcMint,
      treasuryUsdcAta,
      user,
      BigInt(Math.trunc(inUsdcBaseUnits)),
      USDC_DECIMALS
    ),
    // 3) treasury asset → user asset (treasury pre-signs)
    createTransferCheckedInstruction(
      treasuryAssetAta,
      assetMint,
      userAssetAta,
      treasury.publicKey,
      BigInt(Math.trunc(expectedOutBaseUnits)),
      assetDecimals
    ),
  ];

  // 4) platform fee: extra USDC transfer user → treasury (leg 1 only)
  if (includeFeeUsdcBaseUnits > 0) {
    instructions.push(
      createTransferCheckedInstruction(
        userUsdcAta,
        usdcMint,
        treasuryUsdcAta,
        user,
        BigInt(Math.trunc(includeFeeUsdcBaseUnits)),
        USDC_DECIMALS
      )
    );
  }

  return compileAndSign(relayer, treasury, recentBlockhash, instructions);
}

/** Sell leg (mirror of the buy): user asset → treasury, treasury USDC → user. */
export async function buildReverseLegTx(opts: SellLegOpts): Promise<LegBuild> {
  const {
    user,
    usdcMint,
    assetMint,
    assetDecimals,
    inAssetBaseUnits,
    expectedOutUsdcBaseUnits,
    treasury,
    relayer,
    includeFeeUsdcBaseUnits = 0,
    recentBlockhash,
  } = opts;

  const userAssetAta = await getAssociatedTokenAddress(assetMint, user);
  const userUsdcAta = await getAssociatedTokenAddress(usdcMint, user);
  const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, treasury.publicKey);
  const treasuryAssetAta = await getAssociatedTokenAddress(assetMint, treasury.publicKey);

  const instructions: TransactionInstruction[] = [
    ...computeBudgetIxs(),
    // 1) relayer pays rent for the user's USDC ATA so proceeds can land (idempotent)
    createAssociatedTokenAccountIdempotentInstruction(
      relayer.publicKey,
      userUsdcAta,
      user,
      usdcMint
    ),
    // 2) user asset → treasury asset (user signs)
    createTransferCheckedInstruction(
      userAssetAta,
      assetMint,
      treasuryAssetAta,
      user,
      BigInt(Math.trunc(inAssetBaseUnits)),
      assetDecimals
    ),
    // 3) treasury USDC → user USDC (treasury pre-signs)
    createTransferCheckedInstruction(
      treasuryUsdcAta,
      usdcMint,
      userUsdcAta,
      treasury.publicKey,
      BigInt(Math.trunc(expectedOutUsdcBaseUnits)),
      USDC_DECIMALS
    ),
  ];

  // 4) platform fee on sells: extra USDC transfer user → treasury (leg 1 only)
  if (includeFeeUsdcBaseUnits > 0) {
    instructions.push(
      createTransferCheckedInstruction(
        userUsdcAta,
        usdcMint,
        treasuryUsdcAta,
        user,
        BigInt(Math.trunc(includeFeeUsdcBaseUnits)),
        USDC_DECIMALS
      )
    );
  }

  return compileAndSign(relayer, treasury, recentBlockhash, instructions);
}

/** Recent blockhash string for tx building, with RPC failover. */
export async function getRecentBlockhash(conn: Connection): Promise<string> {
  const res = await withFailover((c) => c.getLatestBlockhash("confirmed"));
  return res.blockhash;
}

/** {blockhash, lastValidBlockHeight} for executors doing expiry-aware landing. */
export async function getLatestBlockhashWithHeight(
  conn: Connection
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const res = await getLatestBlockhash();
  return { blockhash: res.blockhash, lastValidBlockHeight: res.lastValidBlockHeight };
}

/** Simulate a (possibly not fully signed) versioned tx; chaos-aware. */
export async function simulate(
  conn: Connection,
  tx: VersionedTransaction
): Promise<{ ok: boolean; logs: string[]; error?: string }> {
  if (chaosConfig().forceSimulationFail) {
    return { ok: false, logs: [], error: "CHAOS_FORCE_SIMULATION_FAIL" };
  }
  try {
    const resp = await withFailover((c) =>
      c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true })
    );
    const err = resp.value.err;
    return {
      ok: !err,
      logs: resp.value.logs ?? [],
      error: err ? JSON.stringify(err) : undefined,
    };
  } catch (e) {
    return { ok: false, logs: [], error: e instanceof Error ? e.message : String(e) };
  }
}
