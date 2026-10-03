import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const targetWalletStr = process.argv[2];
  if (!targetWalletStr) {
    console.log("Usage: bun run scripts/faucet-devnet-usdc.ts <RECIPIENT_WALLET_PUBLIC_KEY> [AMOUNT_USDC]");
    process.exit(1);
  }

  const recipientPubkey = new PublicKey(targetWalletStr);
  const amountUsdc = process.argv[3] ? parseFloat(process.argv[3]) : 50;

  const keypairPath = path.resolve(process.cwd(), "scripts/deployer-keypair.json");
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
  const payer = Keypair.fromSecretKey(secretKey);

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const usdcMint = new PublicKey("An9DFuHeSDYgVBiybraa7Svn1RHjrDb7Ed8YJZCZ4D1Y");

  console.log(`Connecting to Solana Devnet...`);
  console.log(`Deployer / Mint Authority: ${payer.publicKey.toBase58()}`);
  console.log(`Recipient: ${recipientPubkey.toBase58()}`);

  // Check recipient SOL balance
  const recipientSol = await connection.getBalance(recipientPubkey);
  console.log(`Recipient current SOL: ${(recipientSol / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (recipientSol < 0.05 * LAMPORTS_PER_SOL) {
    console.log("Recipient has low SOL (<0.05 SOL). Requesting 1 SOL airdrop...");
    try {
      const airdropSig = await connection.requestAirdrop(recipientPubkey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdropSig, "confirmed");
      console.log(`✓ 1 SOL airdropped! Sig: ${airdropSig}`);
    } catch (err: any) {
      console.warn("SOL airdrop rate-limited or failed, continuing to USDC minting...", err.message);
    }
  }

  console.log(`Ensuring recipient USDC ATA exists...`);
  const userAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    usdcMint,
    recipientPubkey
  );

  console.log(`Recipient USDC ATA: ${userAta.address.toBase58()}`);
  console.log(`Minting ${amountUsdc} tUSDC...`);

  const amountLamports = BigInt(Math.floor(amountUsdc * 1_000_000));
  const mintSig = await mintTo(
    connection,
    payer,
    usdcMint,
    userAta.address,
    payer.publicKey,
    amountLamports
  );

  console.log(`✓ Successfully minted ${amountUsdc} tUSDC to ${recipientPubkey.toBase58()}!`);
  console.log(`Transaction Signature: ${mintSig}`);
  console.log(`Solana Explorer: https://explorer.solana.com/tx/${mintSig}?cluster=devnet`);
}

main().catch((err) => {
  console.error("Faucet error:", err);
  process.exit(1);
});
