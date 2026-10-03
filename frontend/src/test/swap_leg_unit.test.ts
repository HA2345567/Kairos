import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";

const OFFICIAL_JUPITER_PROGRAM_ID = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

interface BasketItem {
  mint: PublicKey;
  weightBps: number;
}

interface BasketConfig {
  basketId: string;
  isActive: boolean;
  items: [BasketItem, BasketItem];
}

interface SwapLegValidationParams {
  user: PublicKey;
  userUsdcAtaOwner: PublicKey;
  userDestAtaOwner: PublicKey;
  userDestMint: PublicKey;
  basket: BasketConfig;
  jupiterProgramId: PublicKey;
  startBalance: bigint;
  endBalance: bigint;
  minAmountOut: bigint;
}

function simulateSwapLegValidation(params: SwapLegValidationParams) {
  // 1. Program ID check
  if (!params.jupiterProgramId.equals(OFFICIAL_JUPITER_PROGRAM_ID)) {
    throw new Error("Invalid Jupiter Aggregator program passed");
  }

  // 2. User ATA ownership checks
  if (!params.userUsdcAtaOwner.equals(params.user)) {
    throw new Error("Invalid user USDC ATA: owner mismatch");
  }
  if (!params.userDestAtaOwner.equals(params.user)) {
    throw new Error("Invalid user destination ATA: owner mismatch");
  }

  // 3. Basket active check
  if (!params.basket.isActive) {
    throw new Error("Basket is currently paused or inactive");
  }

  // 4. Target mint belongs to basket check
  const isConstituent = params.basket.items.some((item) =>
    item.mint.equals(params.userDestMint)
  );
  if (!isConstituent) {
    throw new Error("Destination mint does not belong to the target basket");
  }

  // 5. Slippage delta check
  if (params.endBalance < params.startBalance) {
    throw new Error("Arithmetic underflow: balance decreased");
  }
  const amountOut = params.endBalance - params.startBalance;
  if (amountOut < params.minAmountOut) {
    throw new Error("Output tokens received is less than min_amount_out");
  }

  return {
    success: true,
    amountOut,
  };
}

describe("Kairos Router - swap_and_distribute_leg Unit Tests", () => {
  const userKey = Keypair.generate().publicKey;
  const wsolMint = new PublicKey("So11111111111111111111111111111111111111112");
  const jtoMint = new PublicKey("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");
  const randomMint = Keypair.generate().publicKey;

  const validBasket: BasketConfig = {
    basketId: "sol_jto_50_50",
    isActive: true,
    items: [
      { mint: wsolMint, weightBps: 5000 },
      { mint: jtoMint, weightBps: 5000 },
    ],
  };

  it("passes when all account constraints and slippage thresholds are met", () => {
    const result = simulateSwapLegValidation({
      user: userKey,
      userUsdcAtaOwner: userKey,
      userDestAtaOwner: userKey,
      userDestMint: wsolMint,
      basket: validBasket,
      jupiterProgramId: OFFICIAL_JUPITER_PROGRAM_ID,
      startBalance: 1000000n,
      endBalance: 1500000n,
      minAmountOut: 450000n, // Received 500,000 >= 450,000
    });

    expect(result.success).toBe(true);
    expect(result.amountOut).toBe(500000n);
  });

  it("fails if slippage threshold is breached (amountOut < minAmountOut)", () => {
    expect(() =>
      simulateSwapLegValidation({
        user: userKey,
        userUsdcAtaOwner: userKey,
        userDestAtaOwner: userKey,
        userDestMint: jtoMint,
        basket: validBasket,
        jupiterProgramId: OFFICIAL_JUPITER_PROGRAM_ID,
        startBalance: 0n,
        endBalance: 90000n,
        minAmountOut: 100000n, // Expected at least 100,000, only got 90,000
      })
    ).toThrow("Output tokens received is less than min_amount_out");
  });

  it("fails if an invalid Jupiter program ID is passed", () => {
    const fakeJupiter = Keypair.generate().publicKey;
    expect(() =>
      simulateSwapLegValidation({
        user: userKey,
        userUsdcAtaOwner: userKey,
        userDestAtaOwner: userKey,
        userDestMint: wsolMint,
        basket: validBasket,
        jupiterProgramId: fakeJupiter,
        startBalance: 0n,
        endBalance: 1000n,
        minAmountOut: 1000n,
      })
    ).toThrow("Invalid Jupiter Aggregator program passed");
  });

  it("fails if destination token account is not owned by the signer", () => {
    const attackerKey = Keypair.generate().publicKey;
    expect(() =>
      simulateSwapLegValidation({
        user: userKey,
        userUsdcAtaOwner: userKey,
        userDestAtaOwner: attackerKey, // ATA owned by someone else
        userDestMint: wsolMint,
        basket: validBasket,
        jupiterProgramId: OFFICIAL_JUPITER_PROGRAM_ID,
        startBalance: 0n,
        endBalance: 1000n,
        minAmountOut: 1000n,
      })
    ).toThrow("Invalid user destination ATA: owner mismatch");
  });

  it("fails if destination mint is not part of the active basket", () => {
    expect(() =>
      simulateSwapLegValidation({
        user: userKey,
        userUsdcAtaOwner: userKey,
        userDestAtaOwner: userKey,
        userDestMint: randomMint, // Not WSOL or JTO
        basket: validBasket,
        jupiterProgramId: OFFICIAL_JUPITER_PROGRAM_ID,
        startBalance: 0n,
        endBalance: 1000n,
        minAmountOut: 1000n,
      })
    ).toThrow("Destination mint does not belong to the target basket");
  });

  it("fails if the basket is inactive/paused", () => {
    const pausedBasket: BasketConfig = {
      ...validBasket,
      isActive: false,
    };

    expect(() =>
      simulateSwapLegValidation({
        user: userKey,
        userUsdcAtaOwner: userKey,
        userDestAtaOwner: userKey,
        userDestMint: wsolMint,
        basket: pausedBasket,
        jupiterProgramId: OFFICIAL_JUPITER_PROGRAM_ID,
        startBalance: 0n,
        endBalance: 1000n,
        minAmountOut: 1000n,
      })
    ).toThrow("Basket is currently paused or inactive");
  });
});
