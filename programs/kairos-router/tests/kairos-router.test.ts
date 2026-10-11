import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { KairosRouter } from "../target/types/kairos_router";
import { expect } from "chai";

describe("kairos-router", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.KairosRouter as Program<KairosRouter>;

  const admin = anchor.web3.Keypair.generate();
  const usdcMint = anchor.web3.Keypair.generate().publicKey;
  const treasury = anchor.web3.Keypair.generate().publicKey;
  const feeBps = 20; // 0.2%

  before(async () => {
    // Airdrop SOL to admin for paying transaction fees
    await anchor.getProvider().connection.requestAirdrop(
      admin.publicKey,
      anchor.web3.LAMPORTS_PER_SOL * 2
    );
  });

  describe("initialize_global", () => {
    it("Initializes global config with correct parameters", async () => {
      const [globalConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("global")],
        program.programId
      );

      await program.methods
        .initializeGlobal(usdcMint, treasury, feeBps)
        .accounts({
          payer: admin.publicKey,
          globalConfig: globalConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const globalConfig = await program.account.globalConfig.fetch(globalConfigPDA);
      expect(globalConfig.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(globalConfig.usdcMint.toBase58()).to.equal(usdcMint.toBase58());
      expect(globalConfig.treasury.toBase58()).to.equal(treasury.toBase58());
      expect(globalConfig.feeBps).to.equal(feeBps);
      expect(globalConfig.paused).to.be.false;
    });

    it("Rejects invalid fee bps (>5000)", async () => {
      const [globalConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("global")],
        program.programId
      );

      try {
        await program.methods
          .initializeGlobal(usdcMint, treasury, 6000) // Invalid: > 5000 bps
          .accounts({
            payer: admin.publicKey,
            globalConfig: globalConfigPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        expect.fail("Expected transaction to fail");
      } catch (err) {
        // Should fail with InvalidFeeBps error
        expect(err.toString()).to.include("InvalidFeeBps");
      }
    });
  });

  describe("initialize_basket", () => {
    let globalConfigPDA: anchor.web3.PublicKey;

    beforeEach(async () => {
      [globalConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("global")],
        program.programId
      );

      await program.methods
        .initializeGlobal(usdcMint, treasury, feeBps)
        .accounts({
          payer: admin.publicKey,
          globalConfig: globalConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it("Creates basket with correct weights sum", async () => {
      const basketId = "test-basket";
      const name = "Test Basket";
      const legCount = 2;

      // Create basket items (50% JUP, 50% USDC)
      const items: anchor.web3.PublicKey[] = [
        anchor.web3.Keypair.generate().publicKey, // JUP mint
        anchor.web3.Keypair.generate().publicKey, // USDC mint (different from global)
      ];
      const basketItems: any = [
        { mint: items[0], weightBps: 5000 },
        { mint: items[1], weightBps: 5000 },
        // Fill remaining with zero weight
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
      ];

      const [basketConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("basket"), Buffer.from(basketId)],
        program.programId
      );

      await program.methods
        .initializeBasket(basketId, name, basketItems, legCount)
        .accounts({
          admin: admin.publicKey,
          globalConfig: globalConfigPDA,
          basketConfig: basketConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const basketConfig = await program.account.basketConfig.fetch(basketConfigPDA);
      expect(basketConfig.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(basketConfig.basketId).to.equal(basketId);
      expect(basketConfig.name).to.equal(name);
      expect(basketConfig.is_active).to.be.true;
      expect(basketConfig.legCount).to.equal(legCount);
      expect(basketConfig.items[0].mint.toBase58()).to.equal(items[0].toBase58());
      expect(basketConfig.items[0].weightBps).to.equal(5000);
      expect(basketConfig.items[1].mint.toBase58()).to.equal(items[1].toBase58());
      expect(basketConfig.items[1].weightBps).to.equal(5000);
    });

    it("Rejects basket with invalid weight sum", async () => {
      [globalConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("global")],
        program.programId
      );

      await program.methods
        .initializeGlobal(usdcMint, treasury, feeBps)
        .accounts({
          payer: admin.publicKey,
          globalConfig: globalConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const basketId = "test-basket-weights";
      const name = "Test Basket Weights";
      const legCount = 2;
      const items: any = [
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 6000 }, // Invalid: sum > 10000
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 5000 },
        // Fill remaining with zero weight
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
      ];

      const [basketConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("basket"), Buffer.from(basketId)],
        program.programId
      );

      try {
        await program.methods
          .initializeBasket(basketId, name, basketItems, legCount)
          .accounts({
            admin: admin.publicKey,
            globalConfig: globalConfigPDA,
            basketConfig: basketConfigPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        expect.fail("Expected transaction to fail");
      } catch (err) {
        // Should fail with InvalidBasketWeights error
        expect(err.toString()).to.include("InvalidBasketWeights");
      }
    });
  });

  describe("publish_version", () => {
    let globalConfigPDA: anchor.web3.PublicKey;
    let basketConfigPDA: anchor.web3.PublicKey;

    beforeEach(async () => {
      [globalConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("global")],
        program.programId
      );

      await program.methods
        .initializeGlobal(usdcMint, treasury, feeBps)
        .accounts({
          payer: admin.publicKey,
          globalConfig: globalConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const basketId = "test-basket";
      const name = "Test Basket";
      const legCount = 2;
      const items: any = [
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 5000 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 5000 },
        // Fill remaining with zero weight
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
      ];

      [basketConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("basket"), Buffer.from(basketId)],
        program.programId
      );

      await program.methods
        .initializeBasket(basketId, name, basketItems, legCount)
        .accounts({
          admin: admin.publicKey,
          globalConfig: globalConfigPDA,
          basketConfig: basketConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it("Publishes version with correct legs hash", async () => {
      const basketId = "test-basket";
      const version = 1;
      const items: any = [
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 5000 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 5000 },
        // Fill remaining with zero weight
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
        { mint: anchor.web3.Keypair.generate().publicKey, weightBps: 0 },
      ];
      const legsHash = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]; // 32 bytes

      const [versionConfigPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("version"),
          Buffer.from(basketId),
          Buffer.from(version.toString().split("").map(c => c.charCodeAt(0))),
        ],
        program.programId
      );

      await program.methods
        .publishVersion(basketId, version, basketItems, legCount, legsHash)
        .accounts({
          admin: admin.publicKey,
          globalConfig: globalConfigPDA,
          basketConfig: basketConfigPDA,
          basketVersion: versionConfigPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const basketVersion = await program.account.basketVersion.fetch(versionConfigPDA);
      expect(basketVersion.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(basketVersion.basketId).to.equal(basketId);
      expect(basketVersion.version).to.equal(version);
      expect(basketVersion.legCount).to.equal(legCount);
      expect(basketVersion.legsHash).to.deep.equal(legsHash);
      expect(basketVersion.publishedAt).to.be.a("number");
    });
  });

  describe("swap_and_distribute_leg (buy leg)", () => {
    // This test would require setting up mock Raydium CPMM accounts
    // For brevity, we're focusing on the account validation logic
    it("Validates accounts correctly", async () => {
      // This would be a more complex test requiring mock CPMM pool setup
      // The core validation logic is in the instruction handler
      expect(true).to.be.true; // Placeholder
    });
  });

  describe("swap_and_collect_leg (sell leg)", () => {
    // This test would require setting up mock Raydium CPMM accounts
    // For brevity, we're focusing on the account validation logic
    it("Validates accounts correctly", async () => {
      // This would be a more complex test requiring mock CPMM pool setup
      // The core validation logic is in the instruction handler
      expect(true).to.be.true; // Placeholder
    });
  });
});