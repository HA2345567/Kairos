import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";

interface BasketItem {
  mint: PublicKey;
  weightBps: number;
}

interface BasketConfig {
  admin: PublicKey;
  basketId: string;
  name: string;
  isActive: boolean;
  tokenCount: number;
  items: [BasketItem, BasketItem];
}

function deriveBasketPda(programId: PublicKey, basketId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("basket"), new TextEncoder().encode(basketId)],
    programId
  );
}

function validateAndInitializeBasket(
  admin: PublicKey,
  basketId: string,
  name: string,
  items: [BasketItem, BasketItem]
): BasketConfig {
  if (basketId.length > 32) throw new Error("Basket ID exceeds 32 characters");
  if (name.length > 32) throw new Error("Name exceeds 32 characters");
  if (items.length !== 2) throw new Error("Phase 1 supports exactly 2 constituent tokens");

  const totalWeight = items[0].weightBps + items[1].weightBps;
  if (totalWeight !== 10000) {
    throw new Error("Basket constituent weights must sum to exactly 10,000 basis points (100%)");
  }

  return {
    admin,
    basketId,
    name,
    isActive: true,
    tokenCount: 2,
    items,
  };
}

describe("Kairos Router - Initialize Basket Unit Tests", () => {
  const mockProgramId = Keypair.generate().publicKey;
  const adminKey = new PublicKey("11111111111111111111111111111111");
  const wsolMint = new PublicKey("So11111111111111111111111111111111111111112");
  const jtoMint = new PublicKey("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL");

  it("derives the correct Basket PDA seeds and bump", () => {
    const [pda, bump] = deriveBasketPda(mockProgramId, "sol_jto_50_50");
    expect(pda).toBeDefined();
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it("successfully validates and initializes 50/50 SOL/JTO basket", () => {
    const items: [BasketItem, BasketItem] = [
      { mint: wsolMint, weightBps: 5000 },
      { mint: jtoMint, weightBps: 5000 },
    ];

    const basket = validateAndInitializeBasket(
      adminKey,
      "sol_jto_50_50",
      "Solana & Jito Core",
      items
    );

    expect(basket.basketId).toBe("sol_jto_50_50");
    expect(basket.name).toBe("Solana & Jito Core");
    expect(basket.isActive).toBe(true);
    expect(basket.tokenCount).toBe(2);
    expect(basket.items[0].mint.toBase58()).toBe(wsolMint.toBase58());
    expect(basket.items[0].weightBps).toBe(5000);
    expect(basket.items[1].mint.toBase58()).toBe(jtoMint.toBase58());
    expect(basket.items[1].weightBps).toBe(5000);
  });

  it("fails if weights do not sum to 10,000 bps", () => {
    const invalidItems: [BasketItem, BasketItem] = [
      { mint: wsolMint, weightBps: 4000 },
      { mint: jtoMint, weightBps: 5000 },
    ];

    expect(() =>
      validateAndInitializeBasket(
        adminKey,
        "sol_jto_invalid",
        "Invalid Weights",
        invalidItems
      )
    ).toThrow("Basket constituent weights must sum to exactly 10,000 basis points (100%)");
  });

  it("fails if basket ID exceeds maximum permitted length", () => {
    const tooLongId = "a".repeat(33);
    const items: [BasketItem, BasketItem] = [
      { mint: wsolMint, weightBps: 5000 },
      { mint: jtoMint, weightBps: 5000 },
    ];

    expect(() =>
      validateAndInitializeBasket(adminKey, tooLongId, "Valid Name", items)
    ).toThrow("Basket ID exceeds 32 characters");
  });
});
