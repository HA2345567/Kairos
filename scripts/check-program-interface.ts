import assert from "node:assert/strict";
import { BorshInstructionCoder, BN, type Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey, TransactionMessage } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import idl from "../target/idl/kairos_router.json";
import devnet from "../shared/devnet-config.json";
import { poolForPair } from "../backend/src/chain/pool-config";
import { buildProgramBuyLeg, buildProgramSellLeg, basketConfigPda, basketVersionPda, globalConfigPda, KAIROS_ROUTER_PROGRAM_ID } from "../backend/src/chain/programSwap";

const coder = new BorshInstructionCoder(idl as Idl);
const user = Keypair.generate().publicKey;
const usdcMint = new PublicKey(devnet.mints.usdc);
const assetMint = new PublicKey(devnet.mints.tJUP);
const common = {
  user, usdcMint, assetMint, relayer: Keypair.generate(),
  userUsdcAta: await getAssociatedTokenAddress(usdcMint, user),
  userAssetAta: await getAssociatedTokenAddress(assetMint, user),
  treasuryUsdcAta: await getAssociatedTokenAddress(usdcMint, Keypair.generate().publicKey),
  globalConfigPda: globalConfigPda(), basketId: devnet.basketId, basketConfigPda: basketConfigPda(devnet.basketId),
  basketVersion: 2, basketVersionPda: basketVersionPda(devnet.basketId, 2), basketLegCount: 2, feeBps: 20,
  recentBlockhash: Keypair.generate().publicKey.toBase58(), memo: "kairos:interface-check",
};
for (const side of ["buy", "sell"] as const) {
  const pool = poolForPair(side === "buy" ? usdcMint.toBase58() : assetMint.toBase58(), side === "buy" ? assetMint.toBase58() : usdcMint.toBase58());
  const name = side === "buy" ? "swap_and_distribute_leg" : "swap_and_collect_leg";
  const built = side === "buy"
    ? await buildProgramBuyLeg({ ...common, pool, amountInUsdcBase: 1_000_000, minAmountOutBase: 900_000 })
    : await buildProgramSellLeg({ ...common, pool, amountInAssetBase: 1_000_000, minUsdcOutBase: 900_000 });
  const ix = TransactionMessage.decompile(built.transaction.message).instructions.find(ix => ix.programId.equals(KAIROS_ROUTER_PROGRAM_ID))!;
  const definition = idl.instructions.find(ix => ix.name === name)!;
  assert.equal(definition.accounts.length, ix.keys.length);
  assert.equal(definition.accounts[6].name, "basket_version");
  assert.equal(definition.accounts[21].name, "basket_version_extension");
  assert.equal(definition.accounts[21].optional, true);
  const args = side === "buy"
     ? { fee_bps: 20, amount_in_usdc: new BN(1_000_000), min_amount_out: new BN(900_000) }
     : { fee_bps: 20, amount_in_asset: new BN(1_000_000), min_usdc_out: new BN(900_000) };
   assert.deepEqual(ix.data, coder.encode(name, { version: 2, ...args, memo: common.memo }));
  console.log(`${name}: builder matches generated Anchor IDL`);
}
