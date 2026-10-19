import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import devnet from "../../shared/devnet-config.json";
import { assertTransactionAllowlisted } from "../src/chain/allowlist";
import {
  buildProgramBuyLeg,
  basketConfigPda,
  basketVersionPda,
  globalConfigPda,
  KAIROS_ROUTER_PROGRAM_ID,
  RAYDIUM_CPMM_PROGRAM_ID,
} from "../src/chain/programSwap";
import { poolForPair } from "../src/chain/pool-config";

const allowlistedPrograms = [
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  KAIROS_ROUTER_PROGRAM_ID.toBase58(),
  RAYDIUM_CPMM_PROGRAM_ID.toBase58(),
];

function store(denylistedMints: string[] = []) {
  return {
    getProgramAllowlist: async () => allowlistedPrograms.map((programId) => ({ programId })),
    isMintAllowlisted: async (mint: string) =>
      [devnet.mints.usdc, devnet.mints.tJUP].includes(mint) && !denylistedMints.includes(mint),
  };
}

async function validTransaction(): Promise<VersionedTransaction> {
  const user = Keypair.generate().publicKey;
  const relayer = Keypair.generate();
  const usdcMint = new PublicKey(devnet.mints.usdc);
  const assetMint = new PublicKey(devnet.mints.tJUP);
  const result = await buildProgramBuyLeg({
    user,
    relayer,
    usdcMint,
    assetMint,
    userAssetAta: await getAssociatedTokenAddress(assetMint, user),
    userUsdcAta: await getAssociatedTokenAddress(usdcMint, user),
    treasuryUsdcAta: await getAssociatedTokenAddress(usdcMint, Keypair.generate().publicKey),
    globalConfigPda: globalConfigPda(),
    basketId: devnet.basketId,
    basketConfigPda: basketConfigPda(devnet.basketId),
    basketVersion: 1,
    basketVersionPda: basketVersionPda(devnet.basketId, 1),
    basketLegCount: 2,
    feeBps: 20,
    pool: poolForPair(devnet.mints.usdc, devnet.mints.tJUP),
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    amountInUsdcBase: 1_000_000,
    minAmountOutBase: 900_000,
    memo: "kairos:allowlist:test",
  });
  return result.transaction;
}

test("accepts a built transaction when programs and required mints are allowlisted", async () => {
  await assert.doesNotReject(
    assertTransactionAllowlisted(
      await validTransaction(),
      [devnet.mints.usdc, devnet.mints.tJUP],
      [KAIROS_ROUTER_PROGRAM_ID, RAYDIUM_CPMM_PROGRAM_ID],
      store()
    )
  );
});

test("rejects an instruction targeting an unknown program", async () => {
  const payer = Keypair.generate();
  const unknownProgram = Keypair.generate().publicKey;
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [new TransactionInstruction({ programId: unknownProgram, keys: [], data: Buffer.alloc(0) })],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  await assert.rejects(
    assertTransactionAllowlisted(transaction, [devnet.mints.usdc], [], store()),
    /PROGRAM_NOT_ALLOWED|non-allowlisted program/
  );
});

test("rejects a denylisted required mint", async () => {
  const transaction = await validTransaction();
  await assert.rejects(
    assertTransactionAllowlisted(transaction, [devnet.mints.usdc, devnet.mints.tJTO], [], store([devnet.mints.tJTO])),
    /MINT_NOT_ALLOWED|not allowlisted/
  );
});
