import { createHash } from "node:crypto";
import {
  ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const KAIROS_ROUTER_PROGRAM_ID = new PublicKey(
  process.env.KAIROS_ROUTER_PROGRAM_ID || "3jWJZPdDou1h8UrT871Qi573yqQkFYYW8Jqiug9Pne5w"
);
const CPMM = new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export interface ProgramBuildOpts {
  user: PublicKey;
  usdcMint: PublicKey;
  assetMint: PublicKey;
  userAssetAta: PublicKey;
  userUsdcAta: PublicKey;
  treasuryUsdcAta: PublicKey;
  globalConfigPda: PublicKey;
  basketConfigPda: PublicKey;
  basketVersion: number;
  basketVersionPda: PublicKey;
  feeBps: number;
  pool: {
    authority: PublicKey; ammConfig: PublicKey; poolState: PublicKey;
    inputVault: PublicKey; outputVault: PublicKey; observation: PublicKey;
  };
  relayer: Keypair;
  recentBlockhash: string;
}
export interface ProgramLegBuild { transaction: VersionedTransaction; messageHash: string }

function uint64(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError("Swap amounts must be positive safe integers");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

async function build(opts: ProgramBuildOpts, side: "buy" | "sell", amount: number, minOut: number, memo: string): Promise<ProgramLegBuild> {
  if (!Number.isInteger(opts.basketVersion) || opts.basketVersion < 1 || opts.basketVersion > 0xffff_ffff) {
    throw new RangeError("Basket version must be a positive u32");
  }
  const memoBytes = Buffer.from(memo, "utf8");
  if (memoBytes.length > 256) throw new RangeError("Swap memo exceeds 256 bytes");
  if (!Number.isInteger(opts.feeBps) || opts.feeBps < 0 || opts.feeBps > 75) {
    throw new RangeError("Fee bps must be an integer between 0 and 75");
  }
  const length = Buffer.alloc(4);
  length.writeUInt32LE(memoBytes.length);
  const version = Buffer.alloc(4);
  version.writeUInt32LE(opts.basketVersion);
  const fee = Buffer.alloc(2);
  fee.writeUInt16LE(opts.feeBps);
  const name = side === "buy" ? "swap_and_distribute_leg" : "swap_and_collect_leg";
  const data = Buffer.concat([
    createHash("sha256").update(`global:${name}`).digest().subarray(0, 8),
    version, fee, uint64(amount), uint64(minOut), length, memoBytes,
  ]);
  const readonly = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });
  const writable = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: true });
  const instructions = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
  ];
  // Both trade directions work for a wallet whose destination ATA is absent.
  for (const [mint, ata] of [[opts.usdcMint, opts.userUsdcAta], [opts.assetMint, opts.userAssetAta]]) {
    if (!(await getAssociatedTokenAddress(mint, opts.user)).equals(ata)) throw new Error("INVALID_USER_ATA");
    instructions.push(createAssociatedTokenAccountIdempotentInstruction(opts.relayer.publicKey, ata, opts.user, mint));
  }
  instructions.push(new TransactionInstruction({
    programId: KAIROS_ROUTER_PROGRAM_ID, data,
    keys: [
      { pubkey: opts.user, isSigner: true, isWritable: true }, readonly(opts.globalConfigPda),
      writable(opts.userUsdcAta), writable(opts.userAssetAta), writable(opts.treasuryUsdcAta),
      readonly(opts.basketConfigPda), readonly(opts.basketVersionPda), readonly(CPMM), readonly(opts.pool.authority), readonly(opts.pool.ammConfig),
      writable(opts.pool.poolState), writable(opts.pool.inputVault), writable(opts.pool.outputVault),
      readonly(TOKEN_PROGRAM_ID), readonly(TOKEN_PROGRAM_ID),
      readonly(side === "buy" ? opts.usdcMint : opts.assetMint),
      readonly(side === "buy" ? opts.assetMint : opts.usdcMint), writable(opts.pool.observation),
      readonly(TOKEN_PROGRAM_ID), readonly(SystemProgram.programId), readonly(MEMO_PROGRAM_ID),
    ],
  }));
  const message = new TransactionMessage({
    payerKey: opts.relayer.publicKey, recentBlockhash: opts.recentBlockhash, instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([opts.relayer]);
  return { transaction, messageHash: createHash("sha256").update(message.serialize()).digest("hex") };
}

export const buildProgramBuyLeg = (opts: ProgramBuildOpts & { amountInUsdcBase: number; minAmountOutBase: number; memo: string }) =>
  build(opts, "buy", opts.amountInUsdcBase, opts.minAmountOutBase, opts.memo);
export const buildProgramSellLeg = (opts: ProgramBuildOpts & { amountInAssetBase: number; minUsdcOutBase: number; memo: string }) =>
  build(opts, "sell", opts.amountInAssetBase, opts.minUsdcOutBase, opts.memo);

export const globalConfigPda = () => PublicKey.findProgramAddressSync([Buffer.from("global")], KAIROS_ROUTER_PROGRAM_ID)[0];
export const basketConfigPda = (basketId: string) =>
  PublicKey.findProgramAddressSync([Buffer.from("basket"), Buffer.from(basketId)], KAIROS_ROUTER_PROGRAM_ID)[0];
export const basketVersionPda = (basketId: string, version: number) => {
  const value = Buffer.alloc(4);
  value.writeUInt32LE(version);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("version"), Buffer.from(basketId), value],
    KAIROS_ROUTER_PROGRAM_ID
  )[0];
};
export const ataFor = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddress(mint, owner);
