import { createHash } from "node:crypto";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import { config } from "../config";

/**
 * Program-backed swap builder (user's build order: program → backend).
 *
 * Builds real `kairos_router` swap_and_distribute_leg / swap_and_collect_leg
 * transactions (Raydium CPMM CPI, input/output-side fee, memo, pause checks)
 * WITHOUT needing the generated IDL at runtime: Anchor instruction
 * discriminators are sha256("global:<name>")[..8] and args are borsh-encoded.
 *
 * Selected with SWAP_BUILDER=program (config.swapBuilder). The treasury mock
 * (chain/mockSwap.ts) stays the devnet default until the program is deployed.
 */

export const KAIROS_ROUTER_PROGRAM_ID = new PublicKey(
  process.env.KAIROS_ROUTER_PROGRAM_ID || "ELfFskTFe9keckQ7yN3hgZ2csq7hUHAR7QuPNoErQqPw"
);

const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");
const MEMO_V2_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const DISC_BUY = createHash("sha256").update("global:swap_and_distribute_leg").digest().subarray(0, 8);
const DISC_SELL = createHash("sha256").update("global:swap_and_collect_leg").digest().subarray(0, 8);

/** Anchor string borsh encoding: u32 len + utf8. */
function borshString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

export interface ProgramBuildOpts {
  user: PublicKey;
  usdcMint: PublicKey;
  assetMint: PublicKey;
  /** sell legs: the user's asset ATA; buy legs: the destination asset ATA */
  userAssetAta: PublicKey;
  userUsdcAta: PublicKey;
  treasuryUsdcAta: PublicKey;
  globalConfigPda: PublicKey;
  basketConfigPda: PublicKey;
  pool: {
    authority: PublicKey;
    ammConfig: PublicKey;
    poolState: PublicKey;
    inputVault: PublicKey;
    outputVault: PublicKey;
    observation: PublicKey;
  };
  relayer: Keypair;
  recentBlockhash: string;
}

export interface ProgramLegBuild {
  transaction: VersionedTransaction;
  messageHash: string;
}

function compile(relayer: Keypair, recentBlockhash: string, ixs: TransactionInstruction[]): ProgramLegBuild {
  const message = new TransactionMessage({
    payerKey: relayer.publicKey,
    recentBlockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([relayer]);
  const messageHash = createHash("sha256").update(message.serialize()).digest("hex");
  return { transaction: tx, messageHash };
}

/** BUY: swap_and_distribute_leg(amount_in_usdc, min_amount_out, memo). */
export async function buildProgramBuyLeg(opts: ProgramBuildOpts & {
  amountInUsdcBase: number;
  minAmountOutBase: number;
  memo: string;
}): Promise<ProgramLegBuild> {
  const data = Buffer.concat([
    Buffer.from(DISC_BUY),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(opts.amountInUsdcBase)); return b; })(),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(opts.minAmountOutBase)); return b; })(),
    borshString(opts.memo),
  ]);

  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    new TransactionInstruction({
      programId: KAIROS_ROUTER_PROGRAM_ID,
      keys: [
        { pubkey: opts.user, isSigner: true, isWritable: true },          // user
        { pubkey: opts.globalConfigPda, isSigner: false, isWritable: false }, // global_config
        { pubkey: opts.userUsdcAta, isSigner: false, isWritable: true },  // user_usdc_ata
        { pubkey: opts.userAssetAta, isSigner: false, isWritable: true }, // user_dest_ata
        { pubkey: opts.treasuryUsdcAta, isSigner: false, isWritable: true }, // treasury_usdc_ata
        { pubkey: opts.basketConfigPda, isSigner: false, isWritable: false }, // basket_config
        { pubkey: RAYDIUM_CPMM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: opts.pool.authority, isSigner: false, isWritable: false },
        { pubkey: opts.pool.ammConfig, isSigner: false, isWritable: false },
        { pubkey: opts.pool.poolState, isSigner: false, isWritable: true },
        { pubkey: opts.pool.inputVault, isSigner: false, isWritable: true },
        { pubkey: opts.pool.outputVault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: opts.usdcMint, isSigner: false, isWritable: false },
        { pubkey: opts.assetMint, isSigner: false, isWritable: false },
        { pubkey: opts.pool.observation, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      data,
    }),
  ];

  // Memo instruction rides along in the same transaction (client-side memo,
  // mirrored by the in-program memo when the CPI path runs).
  ixs.push(
    new TransactionInstruction({
      programId: MEMO_V2_PROGRAM_ID,
      keys: [{ pubkey: opts.user, isSigner: true, isWritable: false }],
      data: Buffer.from(opts.memo, "utf8"),
    })
  );

  return compile(opts.relayer, opts.recentBlockhash, ixs);
}

/** SELL: swap_and_collect_leg(amount_in_asset, min_usdc_out, memo). */
export async function buildProgramSellLeg(opts: ProgramBuildOpts & {
  amountInAssetBase: number;
  minUsdcOutBase: number;
  memo: string;
}): Promise<ProgramLegBuild> {
  const data = Buffer.concat([
    Buffer.from(DISC_SELL),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(opts.amountInAssetBase)); return b; })(),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(opts.minUsdcOutBase)); return b; })(),
    borshString(opts.memo),
  ]);

  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    new TransactionInstruction({
      programId: KAIROS_ROUTER_PROGRAM_ID,
      keys: [
        { pubkey: opts.user, isSigner: true, isWritable: true },          // user
        { pubkey: opts.globalConfigPda, isSigner: false, isWritable: false },
        { pubkey: opts.userUsdcAta, isSigner: false, isWritable: true },  // user_usdc_ata
        { pubkey: opts.userAssetAta, isSigner: false, isWritable: true }, // user_src_ata
        { pubkey: opts.treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: opts.basketConfigPda, isSigner: false, isWritable: false },
        { pubkey: RAYDIUM_CPMM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: opts.pool.authority, isSigner: false, isWritable: false },
        { pubkey: opts.pool.ammConfig, isSigner: false, isWritable: false },
        { pubkey: opts.pool.poolState, isSigner: false, isWritable: true },
        // SELL: pool roles swapped vs the buy (asset vault in, USDC vault out).
        { pubkey: opts.pool.inputVault, isSigner: false, isWritable: true },
        { pubkey: opts.pool.outputVault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: opts.assetMint, isSigner: false, isWritable: false },
        { pubkey: opts.usdcMint, isSigner: false, isWritable: false },
        { pubkey: opts.pool.observation, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
    new TransactionInstruction({
      programId: MEMO_V2_PROGRAM_ID,
      keys: [{ pubkey: opts.user, isSigner: true, isWritable: false }],
      data: Buffer.from(opts.memo, "utf8"),
    }),
  ];

  return compile(opts.relayer, opts.recentBlockhash, ixs);
}

/** PDA helpers shared with the seeder. */
export const globalConfigPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("global")], KAIROS_ROUTER_PROGRAM_ID)[0];
export const basketConfigPda = (basketId: string) =>
  PublicKey.findProgramAddressSync([Buffer.from("basket"), Buffer.from(basketId)], KAIROS_ROUTER_PROGRAM_ID)[0];

/** ATA helper (classic token program) for callers. */
export const ataFor = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddress(mint, owner);
