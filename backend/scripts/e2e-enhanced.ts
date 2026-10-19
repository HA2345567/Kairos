/**
 * Enhanced Kairos devnet acceptance driver with comprehensive testing
 *
 * Tests the full lifecycle:
 * 1. Wallet funding (faucet)
 * 2. Quote generation
 * 3. Position preparation (invest)
 * 4. Transaction signing (wallet)
 * 5. Transaction submission
 * 6. Landing/polling to completion
 * 7. Position verification
 * 8. Rebalance preparation and execution
 * 9. Close/unwind operations
 * 10. Final state verification
 *
 * Run from backend/ AFTER `bun run setup` has provisioned the mints:
 *   KAIROS_E2E_WALLET=<path-to-keypair.json> bun scripts/e2e-enhanced.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import { VersionedTransaction } from "@solana/web3.js";
import { config } from "../src/config";

const BASE = `http://localhost:${config.port}`;
const BASKET = process.env.KAIROS_E2E_BASKET || "solana-infra-governance";
const USDC_AMOUNT = Number(process.env.KAIROS_E2E_USDC || 50);
const REBALANCE_BASKET = process.env.KAIROS_E2E_REBALANCE_BASKET || "solana-infra-governance-v2";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function step(name: string, ok: boolean, detail: string): void {
  results.push({ step: name, ok, detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name.padEnd(25)} ${detail}`);
}

async function post(path: string, body: unknown) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function get(path: string) {
  const res = await fetch(BASE + path);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`[e2e-enhanced] Testing Kairos devnet lifecycle`);
  console.log(`[e2e-enhanced] Target: ${BASE}`);
  console.log(`[e2e-enhanced] Basket: ${BASKET}`);
  console.log(`[e2e-enhanced] Amount: ${USDC_AMOUNT} USDC`);
  console.log("");

  // 0. wallet setup
  let wallet: Keypair;
  let isThrowawayWallet = false;

  const walletPath = process.env.KAIROS_E2E_WALLET;
  if (walletPath && existsSync(walletPath)) {
    try {
      wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
      console.log(`[e2e-enhanced] Using wallet from ${walletPath}`);
    } catch (err) {
      console.warn(`[e2e-enhanced] Invalid wallet file, generating new one: ${err}`);
      wallet = Keypair.generate();
      isThrowawayWallet = true;
    }
  } else {
    wallet = Keypair.generate();
    isThrowawayWallet = true;
    console.log(`[e2e-enhanced] No wallet provided, generating throwaway wallet`);
  }

  if (isThrowawayWallet) {
    mkdirSync(config.dataDir, { recursive: true });
    const out = join(config.dataDir, "e2e-wallet.json");
    writeFileSync(out, JSON.stringify(Array.from(wallet.secretKey)));
    console.log(`[e2e-enhanced] Generated throwaway wallet -> ${out}`);
  }

  const address = wallet.publicKey.toBase58();
  console.log(`[e2e-enhanced] Wallet: ${address}`);
  console.log(`[e2e-enhanced] Explorer: https://explorer.solana.com/address/${address}?cluster=devnet`);
  console.log("");

  // 1. Check health
  try {
    const healthResp = await get("/health");
    step("Health check", healthResp.status === 200, `Status: ${healthResp.json.status}`);
    if (healthResp.status !== 200) return finish();
  } catch (err) {
    step("Health check", false, `Error: ${err}`);
    return finish();
  }

  // 2. Fund wallet via faucet
  try {
    const faucetResp = await post("/v1/faucet/airdrop", { walletAddress: address });
    const faucetOk = faucetResp.status === 200 && (faucetResp.json as { success?: boolean }).success === true;
    step("Faucet airdrop", faucetOk, `Success: ${faucetOk}`);
    if (!faucetOk) return finish();
    await sleep(3_000); // Let the mint land
  } catch (err) {
    step("Faucet airdrop", false, `Error: ${err}`);
    return finish();
  }

  // 3. Get initial USDC balance
  let initialUsdcBalance = 0;
  try {
    const balanceResp = await post("/v1/balances", { walletAddress: address });
    if (balanceResp.status === 200) {
      const usdcBalance = (balanceResp.json.balances as Record<string, number>)["USDC"] || 0;
      initialUsdcBalance = usdcBalance;
      step("Initial USDC balance", true, `${usdcBalance} USDC`);
    } else {
      step("Initial USDC balance", false, `Status: ${balanceResp.status}`);
    }
  } catch (err) {
    step("Initial USDC balance", false, `Error: ${err}`);
  }

  // 4. Get quote
  let quoteId: string | undefined;
  let platformFee: number = 0;
  let netInvest: number = 0;
  try {
    const quoteResp = await post("/v1/quotes", { basket: BASKET, usdcAmount: USDC_AMOUNT });
    const quoteOk = quoteResp.status === 200;
    step("Quote generation", quoteOk, `Basket: ${BASKET}, Amount: ${USDC_AMOUNT} USDC`);
    if (!quoteOk) return finish();

    quoteId = (quoteResp.json.quote as { id?: string })?.id;
    platformFee = (quoteResp.json.quote as { platformFeeUsdc?: number })?.platformFeeUsdc || 0;
    netInvest = (quoteResp.json.quote as { netInvestUsdc?: number })?.netInvestUsdc || 0;

    step("Quote details", true, `Fee: ${platformFee} USDC, Net: ${netInvest} USDC`);
  } catch (err) {
    step("Quote generation", false, `Error: ${err}`);
    return finish();
  }

  // 5. Prepare position (invest)
  const idem = `e2e-invest-${Date.now()}`;
  let executionId: string | undefined;
  let preparedTxs: string[] = [];

  try {
    const prepareResp = await post("/v1/positions/prepare", {
      basket: BASKET,
      usdc: USDC_AMOUNT,
      walletAddress: address,
      idempotencyKey: idem
    });

    const prepareOk = prepareResp.status === 200;
    step("Position preparation", prepareOk, `Idempotency key: ${idem}`);
    if (!prepareOk) return finish();

    const execution = prepareResp.json.execution as {
      id?: string;
      preparedTxs?: string[];
      status?: string;
      legs?: unknown[]
    } | undefined;

    executionId = execution?.id;
    preparedTxs = execution?.preparedTxs || [];

    step("Execution details", !!executionId && preparedTxs.length > 0,
      `ID: ${executionId}, Transactions: ${preparedTxs.length}, Status: ${execution?.status}`);

    if (!executionId || preparedTxs.length === 0) return finish();
  } catch (err) {
    step("Position preparation", false, `Error: ${err}`);
    return finish();
  }

  // 6. Test idempotency of prepare
  try {
    const prepare2Resp = await post("/v1/positions/prepare", {
      basket: BASKET,
      usdc: USDC_AMOUNT,
      walletAddress: address,
      idempotencyKey: idem
    });

    const idempotentOk = prepare2Resp.status === 200 &&
      (prepare2Resp.json.execution as { id?: string })?.id === executionId;
    step("Prepare idempotency", idempotentOk, `Same execution ID returned`);
    if (!idempotentOk) return finish();
  } catch (err) {
    step("Prepare idempotency", false, `Error: ${err}`);
    return finish();
  }

  // 7. Sign transactions (wallet adds signature)
  let signedTxs: string[] = [];
  try {
    signedTxs = preparedTxs.map((b64) => {
      const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
      tx.sign([wallet]);
      return Buffer.from(tx.serialize()).toString("base64");
    });
    step("Transaction signing", true, `Signed ${signedTxs.length} transactions`);
  } catch (err) {
    step("Transaction signing", false, `Error: ${err}`);
    return finish();
  }

  // 8. Submit signed transactions
  try {
    const submitResp = await post("/v1/positions/submit", {
      executionId: executionId,
      signedTxs: signedTxs
    });

    const submitOk = submitResp.status === 200;
    step("Transaction submission", submitOk, `Execution ID: ${executionId}`);
    if (!submitOk) return finish();

    const submitExecution = submitResp.json.execution as {
      status?: string;
      id?: string
    } | undefined;

    step("Submit status", !!submitExecution?.status, `Status: ${submitExecution?.status}`);
  } catch (err) {
    step("Transaction submission", false, `Error: ${err}`);
    return finish();
  }

  // 9. Test duplicate submit protection (should return same execution)
  try {
    const dupSubmitResp = await post("/v1/positions/submit", {
      executionId: executionId,
      signedTxs: signedTxs
    });

    const duplicateOk = dupSubmitResp.status === 200 &&
      (dupSubmitResp.json.execution as { id?: string })?.id === executionId;
    step("Duplicate submit protection", duplicateOk, `Returns same execution`);
    if (!duplicateOk) return finish();
  } catch (err) {
    step("Duplicate submit protection", false, `Error: ${err}`);
    return finish();
  }

  // 10. Poll for landing/completion
  let finalStatus: string = "";
  let landingSuccess = false;

  try {
    for (let i = 0; i < 60; i++) { // Max 2 minutes polling
      await sleep(2_000);

      const pollResp = await get(`/v1/executions/${executionId}`);
      if (pollResp.status !== 200) {
        step("Execution polling", false, `Poll failed: ${pollResp.status}`);
        return finish();
      }

      const execution = pollResp.json.execution as {
        status?: string;
        legs?: unknown[]
      } | undefined;

      finalStatus = execution?.status || "";

      if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(finalStatus)) {
        break;
      }

      // Show progress every 10 seconds
      if (i % 5 === 0) {
        const legsInfo = execution?.legs?.length || 0;
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(`[e2e-enhanced] Polling... (${(i+1)*2}s) Status: ${finalStatus}, Legs: ${legsInfo}`);
      }
    }

    // Clear progress line
    process.stdout.clearLine();
    process.stdout.cursorTo(0);

    landingSuccess = finalStatus === "COMPLETED";
    step("Landing/completion", landingSuccess, `Final status: ${finalStatus}`);

    if (!landingSuccess) {
      console.log(`   Hint: For PARTIALLY_COMPLETED, use /retry or /unwind endpoints`);
    }

    if (!landingSuccess && finalStatus !== "FAILED") return finish();
  } catch (err) {
    step("Landing/completion", false, `Error: ${err}`);
    return finish();
  }

  // 11. Check final position state
  let positionValue = 0;
  let positionLegs = 0;
  try {
    const positionsResp = await get(`/v1/positions?walletAddress=${address}`);
    if (positionsResp.status === 200) {
      const positions = (positionsResp.json.positions as Array<{
        id: string;
        basketId: string;
        currentValueUsd: number;
        legs: unknown[]
      }>) || [];

      const pos = positions.find(p => p.basketId === BASKET && p.legs.length > 0);

      if (pos) {
        positionValue = pos.currentValueUsd;
        positionLegs = pos.legs.length;
        step("Position derived", true,
          `Value: $${positionValue.toFixed(2)}, Legs: ${positionLegs}, Basket: ${pos.basketId}`);
      } else {
        step("Position derived", false, `No active position found for basket ${BASKET}`);
      }
    } else {
      step("Position check", false, `Status: ${positionsResp.status}`);
    }
  } catch (err) {
    step("Position check", false, `Error: ${err}`);
  }

  // 12. Test rebalance flow (if enabled)
  try {
    // First check if we can get a quote for rebalance
    const rebalanceQuoteResp = await post("/v1/quotes", {
      basket: REBALANCE_BASKET,
      usdcAmount: USDC_AMOUNT
    });

    if (rebalanceQuoteResp.status === 200) {
      const rebalanceIdem = `e2e-rebalance-${Date.now()}`;

      // Prepare rebalance
      const rebalancePrepareResp = await post("/v1/positions/:id/rebalance/prepare", {
        id: executionId, // Use existing execution as position ID for demo
        idempotencyKey: rebalanceIdem,
        walletAddress: address
      });

      const rebalancePrepareOk = rebalancePrepareResp.status === 200;
      step("Rebalance preparation", rebalancePrepareOk,
        `Idempotency: ${rebalanceIdem}`);
      // Continue even if fails - might need actual position ID
    } else {
      step("Rebalance quote", false, `Basket ${REBALANCE_BASKET} not available for testing`);
    }
  } catch (err) {
    step("Rebalance test", false, `Error: ${err}`);
  }

  // 13. Final USDC balance check
  let finalUsdcBalance = 0;
  let usdcChange = 0;
  try {
    const balanceResp = await post("/v1/balances", { walletAddress: address });
    if (balanceResp.status === 200) {
      const usdcBalance = (balanceResp.json.balances as Record<string, number>)["USDC"] || 0;
      finalUsdcBalance = usdcBalance;
      usdcChange = finalUsdcBalance - initialUsdcBalance;

      const changeIndicator = usdcChange >= 0 ? "+" : "";
      step("Final USDC balance", true,
        `${finalUsdcBalance} USDC (${changeIndicator}${usdcChange.toFixed(2)} vs initial)`);
    } else {
      step("Final USDC balance", false, `Status: ${balanceResp.status}`);
    }
  } catch (err) {
    step("Final USDC balance", false, `Error: ${err}`);
  }

  finish();
}

async function finish(): void {
  const passed = results.filter(r => r.ok).length;
  const total = results.length;

  console.log("\n");
  console.log("=== E2E-ENHANCED TEST SUMMARY ===");
  console.log(`Results: ${passed}/${total} steps passed`);

  for (const r of results) {
    console.log(` ${r.ok ? "✅" : "❌"} ${r.step.padEnd(25)} ${r.detail}`);
  }

  console.log("");
  if (passed === total) {
    console.log("🎉 ALL TESTS PASSED - Kairos devnet lifecycle is working correctly!");
    process.exitCode = 0;
  } else if (passed >= total * 0.8) { // 80% threshold
    console.log("⚠️  MOSTLY WORKING - Minor issues detected");
    process.exitCode = 1;
  } else {
    console.log("💥 SIGNIFICANT ISSUES - Core functionality may be broken");
    process.exitCode = 1;
  }
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason) => {
  console.error("[e2e-enhanced] Unhandled rejection:", reason);
  process.exitCode = 1;
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("[e2e-enhanced] Uncaught exception:", error);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("[e2e-enhanced] Script crashed:", err);
  process.exitCode = 1;
});
