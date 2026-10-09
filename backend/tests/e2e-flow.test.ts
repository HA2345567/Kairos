// Set environment variables BEFORE any imports
process.env.KAIROS_DB_PATH = ":memory:";
process.env.KAIROS_E2E = "0";
process.env.KAIROS_SIMULATE_LANDING = "true";

// Import modules
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const { repository } = await import("../src/db/repository");
const { quoteService } = await import("../src/services/quote.service");
const { authService } = await import("../src/services/auth.service");
const { executionService } = await import("../src/services/execution.service");
const { recomputeExecutionStatus } = await import("../src/workers/landing");
const { config } = await import("../src/config");

// Override for testing
(config as any).simulateLanding = true;

// Helper: Generate valid base58 public key (44 chars)
function generateValidPubkey(): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[0] = Math.floor(Math.random() * 26) + 65; // A-Z (avoid I,O)
  if (bytes[0] === 73 || bytes[0] === 79) bytes[0] = 66; // B instead of I/O
  return bs58.encode(bytes);
}

// Helper: Convert token amount with decimals to base units string
function toBaseUnitsString(amount: string, decimals: number): string {
  const [whole = '0', fraction = ''] = amount.split('.');
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  return (parseInt(whole) * Math.pow(10, decimals) + parseInt(padded)).toString();
}

describe("E2E Transaction Flow: Quote → Prepare → Sign → Submit → Land → Position", () => {
  let wallet: Keypair;
  let walletAddress: string;
  let USDC_MINT: string;
  let JUP_MINT: string;
  let GOLD_MINT: string;
  const BASKET_SLUG = "solana-infra-governance";
  const USDC_AMOUNT = 50;

  beforeEach(async () => {
    // Setup fresh test fixtures
    wallet = Keypair.generate();
    walletAddress = wallet.publicKey.toBase58();
    USDC_MINT = generateValidPubkey();
    JUP_MINT = generateValidPubkey();
    GOLD_MINT = generateValidPubkey();

    // Clear DB (in-memory)

    // Seed tokens
    [USDC_MINT, JUP_MINT, GOLD_MINT].forEach((mint, i) => {
      repository.saveToken({
        mint,
        symbol: i === 0 ? "USDC" : i === 1 ? "tJUP" : "tGOLD",
        name: i === 0 ? "Test USDC" : i === 1 ? "Test Jupiter" : "Test Gold",
        decimals: 6,
        type: i === 0 ? "stablecoin" : i === 1 ? "spl" : "xstock",
        tradingStatus: "active",
        denylisted: false,
        priceUsd: i === 0 ? 1 : i === 1 ? 0.85 : 2400,
      });
    });

    // Seed basket version
    repository.saveBasketVersion({
      id: "bv-test-1",
      basketId: "bkt-test",
      version: 1,
      changelog: "test basket",
      publishedBy: "e2e-test",
      publishedAt: new Date().toISOString(),
      legs: [
        { id: "leg-jup", versionId: "bv-test-1", mint: JUP_MINT, weightBps: 6000, legType: "spl" },
        { id: "leg-gold", versionId: "bv-test-1", mint: GOLD_MINT, weightBps: 4000, legType: "xstock" },
      ],
    });

    // Seed basket
    repository.saveBasket({
      id: "bkt-test",
      slug: BASKET_SLUG,
      name: "Solana Infrastructure Governance",
      thesis: "Test basket",
      category: "infrastructure",
      status: "active",
      activeVersionId: "bv-test-1",
      minUsdc: 25,
      performance: { "1W": 0, "1M": 0, "6M": 0, "1Y": 0 } as never,
      protocols: [],
    });

    // Create test wallet
    await authService.generateNonce(walletAddress);
    const walletKeyPair = Keypair.generate();
    const message = `kairos-devnet-login:${await authService.generateNonce(walletAddress)}`;
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), walletKeyPair.secretKey));
    await authService.verify(walletAddress, sig, message);
  });

  test("complete flow executes successfully and updates position", async () => {
    // STEP 1: Get quote
    const quote = await quoteService.getQuote(BASKET_SLUG, USDC_AMOUNT);
    assert.ok(quote);
    assert.equal(quote.basketId, "bkt-test");
    assert.equal(quote.usdcAmount, USDC_AMOUNT);
    assert.equal(quote.platformFeeUsdc, 0.1);
    assert.ok(quote.legs.length >= 2);
    assert.ok(quote.expiresAt);

    // Verify fee math
    let legSum = 0;
    for (const leg of quote.legs) legSum += leg.inUsdcAmount;
    assert.equal(Number((legSum + quote.platformFeeUsdc).toFixed(4)), USDC_AMOUNT);

    // STEP 2: Prepare execution
    const idempotencyKey = `e2e-test-${Date.now()}-${Math.random()}`;
    const prepared = await executionService.prepare({
      basketSlug: BASKET_SLUG,
      usdcAmount: USDC_AMOUNT,
      walletAddress: walletAddress,
      idempotencyKey: idempotencyKey,
    });

    assert.equal(prepared.status, "PREPARED");
    assert.equal(prepared.walletAddress, walletAddress);
    assert.equal(prepared.basketId, "bkt-test");
    assert.equal(prepared.totalUsdc, USDC_AMOUNT);
    assert.equal(prepared.feeUsdc, quote.platformFeeUsdc);
    assert.ok(prepared.preparedTxs.length > 0);
    assert.ok(prepared.messageHashes.length > 0);
    assert.ok(prepared.expiresAt);
    assert.equal(prepared.legs.length, quote.legs.filter(l => l.inUsdcAmount >= config.dustThresholdUsdc).length);

    // Verify leg data matches quote
    for (const leg of prepared.legs) {
      const quoteLeg = quote.legs.find(ql => ql.mint === leg.mint);
      assert.ok(quoteLeg);
      assert.equal(leg.inAmountUsdc, quoteLeg.inUsdcAmount);

      const token = repository.getToken(quoteLeg.mint);
      const decimals = token?.decimals ?? 6;
      const expectedOutBaseUnits = toBaseUnitsString(quoteLeg.expectedOutTokens, decimals);
      const actualNum = parseInt(String(leg.expectedOut));
      const expectedNum = parseInt(expectedOutBaseUnits);
      assert.ok(Math.abs(actualNum - expectedNum) <= 1);

      assert.equal(leg.messageHash, prepared.messageHashes[prepared.legs.indexOf(leg)]);
      assert.equal(leg.status, "PENDING");
    }

    // STEP 3: Sign transactions
    const signedTransactions = prepared.preparedTxs.map(txBase64 => {
      const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
      tx.sign([wallet]);
      return Buffer.from(tx.serialize()).toString("base64");
    });

    assert.equal(signedTransactions.length, prepared.preparedTxs.length);

    // STEP 4: Submit execution
    const submitted = await executionService.submit({
      executionId: prepared.id,
      signedTxs: signedTransactions,
      idempotencyKey: idempotencyKey,
    });

    assert.equal(submitted.status, "SUBMITTED");
    assert.equal(submitted.id, prepared.id);
    assert.ok(submitted.updatedAt > prepared.createdAt);

    // STEP 5: Simulate landing process
    const executionWithLegs = repository.getExecution(prepared.id);
    assert.ok(executionWithLegs);
    assert.equal(executionWithLegs.legs.length, prepared.legs.length);

    // Process each leg through landing simulation
    for (const leg of executionWithLegs.legs) {
      const simulatedSignature = `sim-${leg.id}-${Date.now()}`;

      // Update leg status
      repository.updateExecutionLeg(prepared.id, leg.id, {
        status: "CONFIRMED",
        txSignature: simulatedSignature,
        actualOut: leg.expectedOut,
      });

      // Fee ledger for first leg
      if (executionWithLegs.legs[0]?.id === leg.id && executionWithLegs.feeUsdc > 0) {
        repository.addFee(prepared.id, executionWithLegs.feeUsdc, new Date().toISOString());
      }

      // Position bookkeeping
      const pos = ensurePosition(executionWithLegs);
      const token = repository.getToken(leg.mint);
      const decimals = token?.decimals ?? 6;
      if (executionWithLegs.type === "close") {
        repository.upsertPositionLeg(pos.id, leg.mint, targetBpsFor(executionWithLegs.basketVersionId, leg.mint), 0);
      } else {
        const uiAmount = Number(leg.actualOut ?? leg.expectedOut) / 10 ** decimals;
        repository.upsertPositionLeg(
          pos.id,
          leg.mint,
          targetBpsFor(executionWithLegs.basketVersionId, leg.mint),
          uiAmount
        );
      }

      // Outbox event
      repository.enqueueOutbox("execution.leg.confirmed", {
        executionId: prepared.id,
        legId: leg.id,
        mint: leg.mint,
        signature: simulatedSignature,
      });
    }

    // Update execution status (triggers outbox events)
    const finalStatus = await recomputeExecutionStatus(prepared.id);

    // STEP 6: Verify execution state
    const finalExecution = repository.getExecution(prepared.id);
    assert.ok(finalExecution);
    assert.ok(finalExecution.legs.every(l => l.status === "CONFIRMED"));
    assert.equal(finalExecution.status, "COMPLETED");
    assert.equal(finalStatus, "COMPLETED");

    // STEP 7: Verify position
    const positions = repository.getPositionsForWallet(walletAddress);
    assert.ok(positions.length > 0);
    const position = positions.find(p => p.basketId === "bkt-test");
    assert.ok(position);
    assert.equal(position.status, "ACTIVE");
    assert.equal(position.basketId, "bkt-test");
    assert.equal(position.basketVersionId, "bv-test-1");
    assert.ok(Number(position.currentValueUsd) >= 0);
    assert.ok(position.legs.length > 0);

    // STEP 8: Verify idempotency
    const idempotentPrepare = await executionService.prepare({
      basketSlug: BASKET_SLUG,
      usdcAmount: USDC_AMOUNT,
      walletAddress: walletAddress,
      idempotencyKey: idempotencyKey,
    });
    assert.equal(idempotentPrepare.id, prepared.id);
    assert.equal(idempotentPrepare.status, "COMPLETED");

    // STEP 9: Verify outbox events
    const outboxClaims = repository.claimOutbox(100);
    const eventTypes = outboxClaims.map(o => o.event);
    assert.ok(eventTypes.includes("execution.submitted"));
    assert.ok(eventTypes.includes("execution.completed"));
    assert.equal(eventTypes.filter(e => e === "execution.leg.confirmed").length, finalExecution.legs.length);

    console.log(`✅ E2E flow: ${quote.legs.length} legs, fee: ${quote.platformFeeUsdc} USDC, position: $${position.currentValueUsd.toFixed(2)}`);
  });

  test("handles partial completion correctly", async () => {
    // Prepare execution
    const prepared = await executionService.prepare({
      basketSlug: BASKET_SLUG,
      usdcAmount: USDC_AMOUNT,
      walletAddress: walletAddress,
      idempotencyKey: `partial-${Date.now()}`,
    });

    // Sign transactions
    const signedTransactions = prepared.preparedTxs.map(txBase64 => {
      const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
      tx.sign([wallet]);
      return Buffer.from(tx.serialize()).toString("base64");
    });

    // Submit
    const submitted = await executionService.submit({
      executionId: prepared.id,
      signedTxs: signedTransactions,
    });

    // Simulate partial landing: first leg CONFIRMED, second leg FAILED
    const executionWithLegs = repository.getExecution(prepared.id);
    assert.ok(executionWithLegs);

    // Confirm first leg
    const firstLegSig = `sim-${executionWithLegs.legs[0].id}-${Date.now()}`;
    repository.updateExecutionLeg(prepared.id, executionWithLegs.legs[0].id, {
      status: "CONFIRMED",
      txSignature: firstLegSig,
      actualOut: executionWithLegs.legs[0].expectedOut,
    });
    if (executionWithLegs.feeUsdc > 0) {
      repository.addFee(prepared.id, executionWithLegs.feeUsdc, new Date().toISOString());
    }

    // Position bookkeeping for confirmed leg
    const pos = ensurePosition(executionWithLegs);
    const token = repository.getToken(executionWithLegs.legs[0].mint);
    const decimals = token?.decimals ?? 6;
    if (executionWithLegs.type === "close") {
      repository.upsertPositionLeg(pos.id, executionWithLegs.legs[0].mint, targetBpsFor(executionWithLegs.basketVersionId, executionWithLegs.legs[0].mint), 0);
    } else {
      const uiAmount = Number(executionWithLegs.legs[0].actualOut ?? executionWithLegs.legs[0].expectedOut) / 10 ** decimals;
      repository.upsertPositionLeg(
        pos.id,
        executionWithLegs.legs[0].mint,
        targetBpsFor(executionWithLegs.basketVersionId, executionWithLegs.legs[0].mint),
        uiAmount
      );
    }

    // Outbox event for confirmed leg
    repository.enqueueOutbox("execution.leg.confirmed", {
      executionId: prepared.id,
      legId: executionWithLegs.legs[0].id,
      mint: executionWithLegs.legs[0].mint,
      signature: firstLegSig,
    });

    // Fail second leg (if exists)
    if (executionWithLegs.legs.length > 1) {
      repository.updateExecutionLeg(prepared.id, executionWithLegs.legs[1].id, {
        status: "FAILED",
        error: "SIMULATED_FAILURE",
      });
      repository.enqueueOutbox("execution.leg.failed", {
        executionId: prepared.id,
        legId: executionWithLegs.legs[1].id,
        mint: executionWithLegs.legs[1].mint,
        error: "SIMULATED_FAILURE",
      });
    }

    // Update execution status
    const finalStatus = await recomputeExecutionStatus(prepared.id);

    // Verify state machine
    const finalExecution = repository.getExecution(prepared.id);
    assert.equal(finalExecution.status, "PARTIALLY_COMPLETED");
    assert.equal(finalStatus, "PARTIALLY_COMPLETED");

    // Verify position exists
    const positions = repository.getPositionsForWallet(walletAddress);
    let position = null;
    for (const p of positions) {
      if (p.basketId === "bkt-test") { position = p; break; }
    }
    assert.ok(position);
    assert.equal(position.status, "ACTIVE");

    // Verify outbox events
    const outboxClaims = repository.claimOutbox(100);
    const eventTypes = outboxClaims.map(o => o.event);
    assert.ok(eventTypes.includes("execution.partially_completed"));

    console.log(`✅ Partial completion: ${finalExecution.legs.filter(l => l.status === "CONFIRMED").length} confirmed, ${finalExecution.legs.filter(l => l.status === "FAILED").length} failed`);
  });

  // Helper: Ensure position exists (mimics landing worker)
  function ensurePosition(execution: any): any {
    const existing = repository
      .getPositionsForWallet(execution.walletAddress)
      .find((p) => p.basketId === execution.basketId);
    if (existing) return existing;

    const position = {
      id: `pos-${Math.random().toString(36).slice(2, 12)}`,
      walletAddress: execution.walletAddress,
      basketId: execution.basketId,
      basketVersionId: execution.basketVersionId,
      entryUsdc: Number((execution.totalUsdc - execution.feeUsdc).toFixed(4)),
      currentValueUsd: 0,
      status: "ACTIVE",
      autoRebalance: false,
      driftPct: 0,
      rebalanceAvailable: false,
      legs: execution.legs.map((l: any) => ({
        mint: l.mint,
        symbol: l.symbol,
        targetBps: targetBpsFor(execution.basketVersionId, l.mint),
        currentAmount: 0,
        currentValueUsd: 0,
      })),
      updatedAt: new Date().toISOString(),
    };
    repository.savePosition(position);
    return position;
  }

  // Helper: Get target bps for a mint in a basket version
  function targetBpsFor(basketVersionId: string, mint: string): number {
    const version = repository.getBasketVersion(basketVersionId);
    return version?.legs.find((l) => l.mint === mint)?.weightBps ?? 0;
  }
});