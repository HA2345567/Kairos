import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  fetchJupiterQuote,
  fetchSwapInstructions,
  parseAndCategorizeSwapInstruction,
} from "../../../scripts/jupiter-client";
import { FIXED_ROUTER_ACCOUNTS } from "../../../scripts/alt-manager";

describe("Kairos Router - Jupiter v6 Route & Swap Instruction Fetch Standalone Tests", () => {
  const dummyUser = Keypair.generate().publicKey;
  const USDC_MINT = FIXED_ROUTER_ACCOUNTS.USDC_MINT.toBase58();
  const WSOL_MINT = FIXED_ROUTER_ACCOUNTS.WSOL_MINT.toBase58();
  const JTO_MINT = FIXED_ROUTER_ACCOUNTS.JTO_MINT.toBase58();

  // Test with $0.50 USDC (500,000 atomic units, 6 decimals) for each leg
  const usdcAmountPerLeg = 500000n;

  it("fetches quote, retrieves swap instructions, and categorizes accounts for SOL leg", async () => {
    // 1. Fetch quote
    const quote = await fetchJupiterQuote(USDC_MINT, WSOL_MINT, usdcAmountPerLeg, 50);
    expect(quote).toBeDefined();
    expect(quote.inputMint).toBe(USDC_MINT);
    expect(quote.outputMint).toBe(WSOL_MINT);
    expect(BigInt(quote.outAmount)).toBeGreaterThan(0n);

    // 2. Fetch swap instructions
    const swapIxRes = await fetchSwapInstructions(dummyUser.toBase58(), quote);
    expect(swapIxRes).toBeDefined();
    expect(swapIxRes.swapInstruction).toBeDefined();
    expect(swapIxRes.swapInstruction.programId).toBe(
      FIXED_ROUTER_ACCOUNTS.JUPITER_PROGRAM_ID.toBase58()
    );

    // 3. Categorize accounts into fixed vs dynamic remaining accounts
    const staticKeys = new Set<string>([
      dummyUser.toBase58(),
      USDC_MINT,
      WSOL_MINT,
      FIXED_ROUTER_ACCOUNTS.TOKEN_PROGRAM_ID.toBase58(),
      FIXED_ROUTER_ACCOUNTS.ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      FIXED_ROUTER_ACCOUNTS.SYSTEM_PROGRAM_ID.toBase58(),
    ]);

    const minAmountOut = BigInt(quote.otherAmountThreshold);
    const parsed = parseAndCategorizeSwapInstruction(
      swapIxRes.swapInstruction,
      minAmountOut,
      staticKeys
    );

    expect(parsed.programId.equals(FIXED_ROUTER_ACCOUNTS.JUPITER_PROGRAM_ID)).toBe(true);
    expect(parsed.data.length).toBeGreaterThan(0);
    expect(parsed.dynamicRemainingAccounts.length).toBeGreaterThan(0);
    expect(parsed.minAmountOut).toBeGreaterThan(0n);

    console.log(
      `[SOL Leg] Quote Out: ${quote.outAmount} atomic units. Accounts total: ${swapIxRes.swapInstruction.accounts.length}, Dynamic: ${parsed.dynamicRemainingAccounts.length}`
    );
  }, 15000);

  it("fetches quote, retrieves swap instructions, and categorizes accounts for JTO leg", async () => {
    // 1. Fetch quote
    const quote = await fetchJupiterQuote(USDC_MINT, JTO_MINT, usdcAmountPerLeg, 50);
    expect(quote).toBeDefined();
    expect(quote.inputMint).toBe(USDC_MINT);
    expect(quote.outputMint).toBe(JTO_MINT);
    expect(BigInt(quote.outAmount)).toBeGreaterThan(0n);

    // 2. Fetch swap instructions
    const swapIxRes = await fetchSwapInstructions(dummyUser.toBase58(), quote);
    expect(swapIxRes).toBeDefined();
    expect(swapIxRes.swapInstruction).toBeDefined();
    expect(swapIxRes.swapInstruction.programId).toBe(
      FIXED_ROUTER_ACCOUNTS.JUPITER_PROGRAM_ID.toBase58()
    );

    // 3. Categorize accounts into fixed vs dynamic remaining accounts
    const staticKeys = new Set<string>([
      dummyUser.toBase58(),
      USDC_MINT,
      JTO_MINT,
      FIXED_ROUTER_ACCOUNTS.TOKEN_PROGRAM_ID.toBase58(),
      FIXED_ROUTER_ACCOUNTS.ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      FIXED_ROUTER_ACCOUNTS.SYSTEM_PROGRAM_ID.toBase58(),
    ]);

    const minAmountOut = BigInt(quote.otherAmountThreshold);
    const parsed = parseAndCategorizeSwapInstruction(
      swapIxRes.swapInstruction,
      minAmountOut,
      staticKeys
    );

    expect(parsed.programId.equals(FIXED_ROUTER_ACCOUNTS.JUPITER_PROGRAM_ID)).toBe(true);
    expect(parsed.data.length).toBeGreaterThan(0);
    expect(parsed.dynamicRemainingAccounts.length).toBeGreaterThan(0);
    expect(parsed.minAmountOut).toBeGreaterThan(0n);

    console.log(
      `[JTO Leg] Quote Out: ${quote.outAmount} atomic units. Accounts total: ${swapIxRes.swapInstruction.accounts.length}, Dynamic: ${parsed.dynamicRemainingAccounts.length}`
    );
  }, 15000);
});
