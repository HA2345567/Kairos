import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Raydium,
  DEVNET_PROGRAM_ID,
  CpmmConfigInfoInterface,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🧪 Testing Standalone Devnet Pool Swaps...");

  const configPath = path.resolve(process.cwd(), "shared/devnet-config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const keypairPath = path.resolve(process.cwd(), "scripts/deployer-keypair.json");
  console.log(`Loading deployer keypair from: ${keypairPath}`);
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`Deployer Pubkey: ${payer.publicKey.toBase58()}`);

  const connection = new Connection(config.rpcUrl, "confirmed");
  const raydium = await Raydium.load({
    owner: payer,
    connection,
    cluster: "devnet",
  });

  const usdcMint = new PublicKey(config.mints.usdc);
  const jupMint = new PublicKey(config.mints.tJUP);
  const jtoMint = new PublicKey(config.mints.tJTO);

  // Ensure payer has USDC ATA and funds
  const usdcAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMint, payer.publicKey);
  console.log(`Payer tUSDC Balance: ${Number(usdcAta.amount) / 1e6}`);
  if (Number(usdcAta.amount) < 5 * 1e6) {
    console.log("Minting 100 tUSDC to payer for swap test...");
    await mintTo(connection, payer, usdcMint, usdcAta.address, payer, 100 * 1e6);
    console.log("✅ Minted 100 tUSDC to payer!");
  }

  // 1. Test Swap Leg 1: 1 USDC -> tJUP
  console.log("\n--- Testing Swap 1: 1.00 tUSDC -> tJUP ---");
  const pool1Id = config.pools.tJUP.poolId;
  const pool1RpcInfo = await raydium.cpmm.getRpcPoolInfo(pool1Id);
  const pool1Keys = await raydium.cpmm.getCpmmPoolKeys(pool1Id);

  const jupAtaBefore = await getOrCreateAssociatedTokenAccount(connection, payer, jupMint, payer.publicKey);
  const jupBalBefore = Number(jupAtaBefore.amount) / 1e6;
  console.log(`tJUP Balance Before: ${jupBalBefore}`);

  const expectedJupOut = new BN(1 * 1e6); // ~1.17 tJUP expected from 1 USDC
  const swap1TxData = await raydium.cpmm.swap({
    poolInfo: {
      ...pool1RpcInfo,
      id: pool1Id,
      mintA: pool1Keys.mintA,
      mintB: pool1Keys.mintB,
    },
    poolKeys: pool1Keys,
    inputMint: usdcMint.toBase58(),
    inputAmount: new BN(1 * 1e6),
    swapResult: {
      inputAmount: new BN(1 * 1e6),
      outputAmount: expectedJupOut,
    },
    slippage: 0.05,
    baseIn: usdcMint.toBase58() === pool1Keys.mintA.address,
    txVersion: "V0",
  });

  const { txId: swap1Tx } = await swap1TxData.execute({ sendAndConfirm: true });
  console.log(`✅ Swap 1 Confirmed! Tx: ${swap1Tx}`);

  const jupAtaAfter = await getAccount(connection, jupAtaBefore.address);
  const jupBalAfter = Number(jupAtaAfter.amount) / 1e6;
  const jupDelta = jupBalAfter - jupBalBefore;
  console.log(`tJUP Balance After: ${jupBalAfter} (Received: +${jupDelta.toFixed(4)} tJUP)`);

  if (jupDelta <= 0) {
    throw new Error("FAIL: Did not receive expected tJUP output from Pool 1 swap.");
  }

  // 2. Test Swap Leg 2: 1 USDC -> tJTO
  console.log("\n--- Testing Swap 2: 1.00 tUSDC -> tJTO ---");
  const pool2Id = config.pools.tJTO.poolId;
  const pool2RpcInfo = await raydium.cpmm.getRpcPoolInfo(pool2Id);
  const pool2Keys = await raydium.cpmm.getCpmmPoolKeys(pool2Id);

  const jtoAtaBefore = await getOrCreateAssociatedTokenAccount(connection, payer, jtoMint, payer.publicKey);
  const jtoBalBefore = Number(jtoAtaBefore.amount) / 1e9;
  console.log(`tJTO Balance Before: ${jtoBalBefore}`);

  const expectedJtoOut = new BN(Math.floor(0.4 * 1e9)); // ~0.43 tJTO expected from 1 USDC
  const swap2TxData = await raydium.cpmm.swap({
    poolInfo: {
      ...pool2RpcInfo,
      id: pool2Id,
      mintA: pool2Keys.mintA,
      mintB: pool2Keys.mintB,
    },
    poolKeys: pool2Keys,
    inputMint: usdcMint.toBase58(),
    inputAmount: new BN(1 * 1e6),
    swapResult: {
      inputAmount: new BN(1 * 1e6),
      outputAmount: expectedJtoOut,
    },
    slippage: 0.05,
    baseIn: usdcMint.toBase58() === pool2Keys.mintA.address,
    txVersion: "V0",
  });

  const { txId: swap2Tx } = await swap2TxData.execute({ sendAndConfirm: true });
  console.log(`✅ Swap 2 Confirmed! Tx: ${swap2Tx}`);

  const jtoAtaAfter = await getAccount(connection, jtoAtaBefore.address);
  const jtoBalAfter = Number(jtoAtaAfter.amount) / 1e9;
  const jtoDelta = jtoBalAfter - jtoBalBefore;
  console.log(`tJTO Balance After: ${jtoBalAfter} (Received: +${jtoDelta.toFixed(4)} tJTO)`);

  if (jtoDelta <= 0) {
    throw new Error("FAIL: Did not receive expected tJTO output from Pool 2 swap.");
  }

  console.log("\n🎉 ALL POOL SWAPS VERIFIED WITH REAL DEVNET TRANSACTIONS!");
  console.log(`Swap 1 Tx: https://explorer.solana.com/tx/${swap1Tx}?cluster=devnet`);
  console.log(`Swap 2 Tx: https://explorer.solana.com/tx/${swap2Tx}?cluster=devnet`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
