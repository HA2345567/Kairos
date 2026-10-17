import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { Keypair, PublicKey, TransactionMessage } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import devnet from "../../shared/devnet-config.json";
import { poolForPair } from "../src/chain/pool-config";
import { buildProgramBuyLeg, buildProgramSellLeg, globalConfigPda, basketConfigPda, basketVersionPda, KAIROS_ROUTER_PROGRAM_ID, MEMO_PROGRAM_ID } from "../src/chain/programSwap";

async function fixture(side: "buy" | "sell") {
  const user = Keypair.generate().publicKey;
  const relayer = Keypair.generate();
  const usdcMint = new PublicKey(devnet.mints.usdc);
  const assetMint = new PublicKey(devnet.mints.tJUP);
  return {
    user, relayer, usdcMint, assetMint,
    userAssetAta: await getAssociatedTokenAddress(assetMint, user),
    userUsdcAta: await getAssociatedTokenAddress(usdcMint, user),
    treasuryUsdcAta: await getAssociatedTokenAddress(usdcMint, Keypair.generate().publicKey),
    globalConfigPda: globalConfigPda(), basketConfigPda: basketConfigPda(devnet.basketId),
     basketVersion: 1, basketVersionPda: basketVersionPda(devnet.basketId, 1),
     feeBps: 20,
    pool: poolForPair(side === "buy" ? usdcMint.toBase58() : assetMint.toBase58(), side === "buy" ? assetMint.toBase58() : usdcMint.toBase58()),
    recentBlockhash: Keypair.generate().publicKey.toBase58(), memo: "kairos:test:leg1",
  };
}

for (const side of ["buy", "sell"] as const) {
  test(`program ${side} has directional vaults, relayer-funded ATAs, and exact signed message`, async () => {
    const opts = await fixture(side);
    const result = side === "buy"
      ? await buildProgramBuyLeg({ ...opts, amountInUsdcBase: 1_000_000, minAmountOutBase: 900_000 })
      : await buildProgramSellLeg({ ...opts, amountInAssetBase: 1_000_000, minUsdcOutBase: 900_000 });
    const tx = result.transaction;
    const message = TransactionMessage.decompile(tx.message);
    const ataInstructions = message.instructions.filter(ix => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID));
    assert.equal(ataInstructions.length, 2);
    for (const ix of ataInstructions) {
      assert.ok(ix.keys[0].pubkey.equals(opts.relayer.publicKey));
      assert.equal(ix.data[0], 1, "ATA creation must be idempotent");
    }
    const ix = message.instructions.find(ix => ix.programId.equals(KAIROS_ROUTER_PROGRAM_ID))!;
    assert.equal(ix.keys.length, 21);
    assert.ok(ix.keys[2].isWritable);
    assert.ok(ix.keys[6].pubkey.equals(opts.basketVersionPda));
    assert.ok(ix.keys[20].pubkey.equals(MEMO_PROGRAM_ID));
    const pool = devnet.pools.tJUP;
    assert.equal(ix.keys[11].pubkey.toBase58(), side === "buy" ? pool.vault1 : pool.vault0);
    assert.equal(ix.keys[12].pubkey.toBase58(), side === "buy" ? pool.vault0 : pool.vault1);
    assert.equal(ix.data.readUInt32LE(8), opts.basketVersion);
    assert.equal(ix.data.readUInt16LE(12), opts.feeBps);
    assert.equal(ix.data.readBigUInt64LE(14), 1_000_000n);
    assert.equal(ix.data.readBigUInt64LE(22), 900_000n);
    assert.equal(ix.data.subarray(34).toString(), opts.memo);
    assert.equal(message.instructions.filter(ix => ix.programId.equals(MEMO_PROGRAM_ID)).length, 0, "memo is emitted once through the router");
    assert.equal(result.messageHash, createHash("sha256").update(tx.message.serialize()).digest("hex"));
    assert.ok(nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0], opts.relayer.publicKey.toBytes()));
    assert.ok(tx.signatures[1].every(byte => byte === 0), "wallet signature is still required");
    assert.ok(tx.serialize().length <= 1232, "transaction must fit the Solana packet limit");
  });
}

test("program builder rejects unknown pairs, wrong ATAs, and unsafe amounts", async () => {
  assert.throws(() => poolForPair(devnet.mints.usdc, devnet.mints.usdc), /pool/);
  assert.throws(() => poolForPair(devnet.mints.tJUP, devnet.mints.tJTO), /pool/);
  const opts = await fixture("buy");
  await assert.rejects(buildProgramBuyLeg({ ...opts, userAssetAta: Keypair.generate().publicKey, amountInUsdcBase: 1, minAmountOutBase: 1 }), /INVALID_USER_ATA/);
  await assert.rejects(buildProgramBuyLeg({ ...opts, amountInUsdcBase: Number.MAX_SAFE_INTEGER + 1, minAmountOutBase: 1 }), /safe integers/);
  await assert.rejects(buildProgramBuyLeg({ ...opts, amountInUsdcBase: 1, minAmountOutBase: 0 }), /safe integers/);
  for (const basketVersion of [0, -1, 1.5, 0x1_0000_0000, NaN]) {
    await assert.rejects(buildProgramBuyLeg({ ...opts, basketVersion, amountInUsdcBase: 1, minAmountOutBase: 1 }), /positive u32/);
  }
  await assert.rejects(buildProgramBuyLeg({ ...opts, feeBps: 76, amountInUsdcBase: 1, minAmountOutBase: 1 }), /between 0 and 75/);
});

test("published version changes the PDA and the message the wallet must sign", async () => {
  const opts = await fixture("buy");
  const first = await buildProgramBuyLeg({ ...opts, amountInUsdcBase: 1_000_000, minAmountOutBase: 900_000 });
  const second = await buildProgramBuyLeg({
    ...opts, basketVersion: 2, basketVersionPda: basketVersionPda(devnet.basketId, 2),
    amountInUsdcBase: 1_000_000, minAmountOutBase: 900_000,
  });
  assert.notEqual(first.messageHash, second.messageHash);
  const ix = TransactionMessage.decompile(second.transaction.message).instructions.find(ix => ix.programId.equals(KAIROS_ROUTER_PROGRAM_ID))!;
  assert.equal(ix.data.readUInt32LE(8), 2);
  assert.ok(ix.keys[6].pubkey.equals(basketVersionPda(devnet.basketId, 2)));
  assert.ok(!ix.keys[6].pubkey.equals(opts.basketVersionPda));
});
