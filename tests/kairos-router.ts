/**
 * Kairos router program tests (Anchor 0.30, ts-mocha) — replaces the old
 * bun:test placeholder suite.
 *
 * Run where a validator is available (AVX-capable machine or devnet):
 *   anchor test                      # localnet
 *   anchor test --provider.cluster devnet --skip-local-validator
 *
 * Coverage: global/basket init, admin gating, kill switches, version registry,
 * and the pre-CPI failure paths of both swap legs (paused program, paused
 * basket, wrong mint, bad weights, duplicate mints, bad leg_count).
 * The CPI happy path + over-slippage need a REAL Raydium CPMM pool —
 * those suites are marked skip and run against devnet after pool funding.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { KairosRouter } from "../target/types/kairos_router";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import crypto from "crypto";

describe("kairos-router", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.KairosRouter as Program<KairosRouter>;

  const admin = Keypair.generate();
  const treasury = Keypair.generate();
  const stranger = Keypair.generate();
  const user = Keypair.generate();
  const MAX_LEGS = 10;

  let usdcMint: PublicKey;
  let assetMint: PublicKey;
  let globalConfig: PublicKey;
  let treasuryUsdcAta: PublicKey;
  let userUsdcAta: PublicKey;
  let userAssetAta: PublicKey;
  const basketId = "test-basket";
  let basketConfig: PublicKey;
  const versionPda = (v: number, id = basketId) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("version"), Buffer.from(id), new anchor.BN(v).toArrayLike(Buffer, "le", 4)],
      program.programId
    )[0];

  // Deterministic dummy pool accounts — swap tests here FAIL BEFORE the CPI,
  // so pool contents never matter.
  const pool = {
    cpmmProgram: new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"),
    authority: Keypair.generate().publicKey,
    ammConfig: Keypair.generate().publicKey,
    poolState: Keypair.generate().publicKey,
    inputVault: Keypair.generate().publicKey,
    outputVault: Keypair.generate().publicKey,
    observation: Keypair.generate().publicKey,
  };

  const legs = (mints: PublicKey[], weights: number[]): any[] =>
    Array.from({ length: MAX_LEGS }, (_, i) =>
      i < mints.length
        ? { mint: mints[i], weightBps: weights[i] ?? 0 }
        : { mint: PublicKey.default, weightBps: 0 }
    );

  const swapAccounts = (userDestAta: PublicKey, outputMint: PublicKey) => ({
    user: user.publicKey,
    globalConfig,
    userUsdcAta,
    userDestAta,
    treasuryUsdcAta,
    basketConfig,
    cpmmProgram: pool.cpmmProgram,
    authority: pool.authority,
    ammConfig: pool.ammConfig,
    poolState: pool.poolState,
    inputVault: pool.inputVault,
    outputVault: pool.outputVault,
    inputTokenProgram: TOKEN_PROGRAM_ID,
    outputTokenProgram: TOKEN_PROGRAM_ID,
    inputMint: usdcMint,
    outputMint,
    observationState: pool.observation,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  });

  before(async () => {
    const sig = async (kp: Keypair) =>
      provider.connection
        .requestAirdrop(kp.publicKey, 20 * LAMPORTS_PER_SOL)
        .then((s) => provider.connection.confirmTransaction(s, "confirmed"));
    await Promise.all([sig(admin), sig(stranger), sig(user), sig(treasury)]);

    usdcMint = await createMint(provider.connection, admin, admin.publicKey, null, 6);
    assetMint = await createMint(provider.connection, admin, admin.publicKey, null, 6);

    globalConfig = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      program.programId
    )[0];
    basketConfig = PublicKey.findProgramAddressSync(
      [Buffer.from("basket"), Buffer.from(basketId)],
      program.programId
    )[0];

    treasuryUsdcAta = await createAssociatedTokenAccount(
      provider.connection,
      admin,
      usdcMint,
      treasury.publicKey
    );
    userUsdcAta = await createAssociatedTokenAccount(
      provider.connection,
      admin,
      usdcMint,
      user.publicKey
    );
    userAssetAta = await createAssociatedTokenAccount(
      provider.connection,
      admin,
      assetMint,
      user.publicKey
    );
    await mintTo(provider.connection, admin, usdcMint, userUsdcAta, admin, 1_000_000_000);
  });

  it("initializes global config (admin, USDC pin, treasury, fee)", async () => {
    await program.methods
      .initializeGlobal(usdcMint, treasury.publicKey, 20)
      .accounts({ payer: admin.publicKey, globalConfig })
      .signers([admin])
      .rpc();
    const cfg = await program.account.globalConfig.fetch(globalConfig);
    expect(cfg.admin.equals(admin.publicKey)).true;
    expect(cfg.usdcMint.equals(usdcMint)).true;
    expect(cfg.treasury.equals(treasury.publicKey)).true;
    expect(cfg.feeBps).eq(20);
    expect(cfg.paused).false;
  });

  it("initializes a 2-leg basket", async () => {
    await program.methods
      .initializeBasket(basketId, "Test Basket", legs([assetMint, usdcMint], [5000, 5000]), 2)
      .accounts({ admin: admin.publicKey, globalConfig, basketConfig })
      .signers([admin])
      .rpc();
    const b = await program.account.basketConfig.fetch(basketConfig);
    expect(b.legCount).eq(2);
    expect(b.isActive).true;
  });

  it("rejects non-admin basket creation", async () => {
    try {
      await program.methods
        .initializeBasket("sneaky", "Sneaky", legs([assetMint], [10000]), 1)
        .accounts({ admin: stranger.publicKey, globalConfig })
        .signers([stranger])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("UnauthorizedAdmin");
    }
  });

  it("rejects bad weights (sum != 10000)", async () => {
    try {
      await program.methods
        .initializeBasket("bad-weights", "Bad", legs([assetMint, usdcMint], [4000, 4000]), 2)
        .accounts({ admin: admin.publicKey, globalConfig, basketConfig: PublicKey.findProgramAddressSync([Buffer.from("basket"), Buffer.from("bad-weights")], program.programId)[0] })
        .signers([admin])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("InvalidBasketWeights");
    }
  });

  it("rejects leg_count 0 and > 10", async () => {
    for (const lc of [0, 11]) {
      const id = `lc-${lc}`;
      try {
        await program.methods
          .initializeBasket(id, "Bad", legs([assetMint], [10000]), lc)
          .accounts({
            admin: admin.publicKey,
            globalConfig,
            basketConfig: PublicKey.findProgramAddressSync([Buffer.from("basket"), Buffer.from(id)], program.programId)[0],
          })
          .signers([admin])
          .rpc();
        expect.fail(`leg_count ${lc} should have failed`);
      } catch (err) {
        expect(String(err)).to.include("InvalidLegCount");
      }
    }
  });

  it("rejects duplicate mints", async () => {
    const id = "dupes";
    try {
      await program.methods
        .initializeBasket(id, "Dupes", legs([assetMint, assetMint], [5000, 5000]), 2)
        .accounts({
          admin: admin.publicKey,
          globalConfig,
          basketConfig: PublicKey.findProgramAddressSync([Buffer.from("basket"), Buffer.from(id)], program.programId)[0],
        })
        .signers([admin])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("DuplicateMint");
    }
  });

  it("rejects non-admin set_active", async () => {
    try {
      await program.methods
        .setActive(false)
        .accounts({ admin: stranger.publicKey, globalConfig, basketConfig })
        .signers([stranger])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("UnauthorizedAdmin");
    }
  });

  it("paused basket rejects swaps BEFORE any CPI or fee", async () => {
    await program.methods
      .setActive(false)
      .accounts({ admin: admin.publicKey, globalConfig, basketConfig })
      .signers([admin])
      .rpc();
    try {
      await program.methods
        .swapAndDistributeLeg(new anchor.BN(1_000_000), new anchor.BN(1), "audit-memo")
        .accounts(swapAccounts(userAssetAta, assetMint))
        .signers([user])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("BasketNotActive");
    }
    const feeBal = (await provider.connection.getTokenAccountBalance(treasuryUsdcAta)).value.amount;
    expect(feeBal).eq("0"); // no fee for a failed leg
    await program.methods
      .setActive(true)
      .accounts({ admin: admin.publicKey, globalConfig, basketConfig })
      .signers([admin])
      .rpc();
  });

  it("global pause rejects swaps even on an active basket", async () => {
    await program.methods
      .setGlobalPause(true)
      .accounts({ admin: admin.publicKey, globalConfig })
      .signers([admin])
      .rpc();
    try {
      await program.methods
        .swapAndDistributeLeg(new anchor.BN(1_000_000), new anchor.BN(1), "audit-memo")
        .accounts(swapAccounts(userAssetAta, assetMint))
        .signers([user])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("ProgramPaused");
    }
    await program.methods
      .setGlobalPause(false)
      .accounts({ admin: admin.publicKey, globalConfig })
      .signers([admin])
      .rpc();
  });

  it("publishes a version with legs_hash; rejects bad weights", async () => {
    const legsHash = crypto.createHash("sha256").update("v1-legs").digest();
    await program.methods
      .publishVersion(basketId, 1, legs([assetMint, usdcMint], [5000, 5000]), 2, [...legsHash])
      .accounts({ admin: admin.publicKey, globalConfig, basketConfig, basketVersion: versionPda(1) })
      .signers([admin])
      .rpc();
    const v = await program.account.basketVersion.fetch(versionPda(1));
    expect(v.version).eq(1);
    expect(Buffer.from(v.legsHash).equals(Buffer.from(legsHash))).true;
    expect(v.legCount).eq(2);

    try {
      await program.methods
        .publishVersion(basketId, 2, legs([assetMint, usdcMint], [9000, 9000]), 2, [...legsHash])
        .accounts({ admin: admin.publicKey, globalConfig, basketConfig, basketVersion: versionPda(2) })
        .signers([admin])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("InvalidBasketWeights");
    }
  });

  it("rejects a swap whose destination mint is not a basket leg", async () => {
    const foreign = await createMint(provider.connection, admin, admin.publicKey, null, 6);
    const foreignAta = await createAssociatedTokenAccount(
      provider.connection,
      admin,
      foreign,
      user.publicKey
    );
    try {
      await program.methods
        .swapAndDistributeLeg(new anchor.BN(1_000_000), new anchor.BN(1), "audit-memo")
        .accounts(swapAccounts(foreignAta, foreign))
        .signers([user])
        .rpc();
      expect.fail("should have failed");
    } catch (err) {
      expect(String(err)).to.include("InvalidUserAta");
    }
  });

  describe.skip("CPI happy path + over-slippage (needs a REAL Raydium CPMM pool)", () => {
    it("swaps with fee + memo and emits InvestLegExecuted");
    it("reverts when min_amount_out is not met (no fee charged)");
    it("sell leg collects USDC and takes fee from proceeds");
  });
});
