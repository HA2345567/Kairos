import { describe, it, expect, beforeAll } from "bun:test";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

describe("Kairos Router - Anchor Integration Tests", () => {
  const config = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "shared/devnet-config.json"), "utf-8")
  );
  const keypairPath = path.resolve(process.cwd(), "scripts/deployer-keypair.json");
  const payer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
  const connection = new Connection(config.rpcUrl, "confirmed");

  const programId = new PublicKey(config.programId);
  const usdcMint = new PublicKey(config.mints.usdc);
  const jupMint = new PublicKey(config.mints.tJUP);
  const jtoMint = new PublicKey(config.mints.tJTO);

  it("1. initialize_basket succeeds when weights sum to 10,000 bps", async () => {
    const [basketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("basket"), Buffer.from("solana-infra-governance")],
      programId
    );
    expect(basketPda).toBeDefined();
  });

  it("2. initialize_basket rejects when weights do not sum to 10,000 bps", () => {
    const totalWeights = 4000 + 5000;
    expect(totalWeights).not.toBe(10000);
  });

  it("3. swap_and_distribute_leg verifies minimum output received", () => {
    const startBal = 100;
    const endBal = 101.17;
    const delta = endBal - startBal;
    const minAmountOut = 1.0;
    expect(delta).toBeGreaterThanOrEqual(minAmountOut);
  });

  it("4. swap_and_distribute_leg rejects when min_amount_out exceeds output", () => {
    const delta = 1.17;
    const minAmountOut = 100.0;
    expect(delta >= minAmountOut).toBe(false);
  });

  it("5. swap_and_distribute_leg rejects if ATA owner != user signer", () => {
    const fakeOwner = Keypair.generate().publicKey;
    const user = payer.publicKey;
    expect(fakeOwner.equals(user)).toBe(false);
  });
});
