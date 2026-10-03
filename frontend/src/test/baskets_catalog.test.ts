import { describe, it, expect } from "vitest";
import { CURATED_BASKETS, getBasketById } from "../lib/baskets-data";

describe("Kairos — Final Launch Basket Catalog (Locked)", () => {
  it("contains launch baskets and the devnet demo basket", () => {
    expect(CURATED_BASKETS.length).toBeGreaterThanOrEqual(5);
    const demo = CURATED_BASKETS.find((b) => b.id === "solana-infra-governance");
    expect(demo).toBeDefined();
    expect(demo?.isInvestable).toBe(true);
    expect(demo?.tokens).toHaveLength(2);
  });

  it("verifies Basket 1: Solana Infrastructure (CLOUD 10.6%, BP 10%, JUP 9%, JitoSOL 8%, SOL 8%, mSOL 8%, KMNO 8%, RAY 8%, ORCA 8%, MET 8%, ARX 8%, JTO 6.4%)", () => {
    const b = CURATED_BASKETS.find((x) => x.id === "solana-infrastructure")!;
    expect(b.name).toBe("Solana Infrastructure");
    expect(b.id).toBe("solana-infrastructure");
    expect(b.imageUrl).toBe("/baskets/solana-infrastructure.jpg");
    expect(b.tokens).toHaveLength(12);

    const weights = Object.fromEntries(b.tokens.map((t) => [t.symbol, t.weightBps]));
    expect(weights["CLOUD"]).toBe(1060);
    expect(weights["BP"]).toBe(1000);
    expect(weights["JUP"]).toBe(900);
    expect(weights["JitoSOL"]).toBe(800);
    expect(weights["SOL"]).toBe(800);
    expect(weights["mSOL"]).toBe(800);
    expect(weights["KMNO"]).toBe(800);
    expect(weights["RAY"]).toBe(800);
    expect(weights["ORCA"]).toBe(800);
    expect(weights["MET"]).toBe(800);
    expect(weights["ARX"]).toBe(800);
    expect(weights["JTO"]).toBe(640);

    const totalWeight = b.tokens.reduce((acc, t) => acc + t.weightBps, 0);
    expect(totalWeight).toBe(10000);
  });

  it("verifies Basket 2: Solana Sigma Basket (PYTH 35%, JUP 25%, KMNO 20%, RENDER 20%)", () => {
    const b = CURATED_BASKETS.find((x) => x.id === "solana-sigma-basket")!;
    expect(b.name).toBe("Solana Sigma Basket");
    expect(b.description).toContain("Quiet infrastructure that powers everything — no hype needed");
    expect(b.tokens).toHaveLength(4);

    const weights = Object.fromEntries(b.tokens.map((t) => [t.symbol, t.weightBps]));
    expect(weights["PYTH"]).toBe(3500);
    expect(weights["JUP"]).toBe(2500);
    expect(weights["KMNO"]).toBe(2000);
    expect(weights["RENDER"]).toBe(2000);

    const totalWeight = b.tokens.reduce((acc, t) => acc + t.weightBps, 0);
    expect(totalWeight).toBe(10000);
  });

  it("verifies Basket 3: Solana Culture & Memes (BONK 40%, TRUMP 30%, PENGU 30%)", () => {
    const b = CURATED_BASKETS.find((x) => x.id === "solana-culture-memes")!;
    expect(b.name).toBe("Solana Culture & Memes");
    expect(b.description).toContain("Highest-liquidity, longest-standing cultural tokens");
    expect(b.tokens).toHaveLength(3);

    const weights = Object.fromEntries(b.tokens.map((t) => [t.symbol, t.weightBps]));
    expect(weights["BONK"]).toBe(4000);
    expect(weights["TRUMP"]).toBe(3000);
    expect(weights["PENGU"]).toBe(3000);

    const totalWeight = b.tokens.reduce((acc, t) => acc + t.weightBps, 0);
    expect(totalWeight).toBe(10000);
  });

  it("verifies Basket 4: Solana AI & Compute (RENDER 30%, FARTCOIN 25%, PIPPIN 25%, GOAT 20%)", () => {
    const b = CURATED_BASKETS.find((x) => x.id === "solana-ai-compute")!;
    expect(b.name).toBe("Solana AI & Compute");
    expect(b.description).toContain("Agentic economy — established anchor + proven traction leaders");
    expect(b.tokens).toHaveLength(4);

    const weights = Object.fromEntries(b.tokens.map((t) => [t.symbol, t.weightBps]));
    expect(weights["RENDER"]).toBe(3000);
    expect(weights["FARTCOIN"]).toBe(2500);
    expect(weights["PIPPIN"]).toBe(2500);
    expect(weights["GOAT"]).toBe(2000);

    const totalWeight = b.tokens.reduce((acc, t) => acc + t.weightBps, 0);
    expect(totalWeight).toBe(10000);
  });

  it("verifies Basket 5: Solana DePIN Infrastructure (HNT 50%, IOT 25%, MOBILE 25%)", () => {
    const b = CURATED_BASKETS.find((x) => x.id === "solana-depin-infrastructure")!;
    expect(b.name).toBe("Solana DePIN Infrastructure");
    expect(b.description).toContain("Real-world physical infrastructure networks");
    expect(b.tokens).toHaveLength(3);

    const weights = Object.fromEntries(b.tokens.map((t) => [t.symbol, t.weightBps]));
    expect(weights["HNT"]).toBe(5000);
    expect(weights["IOT"]).toBe(2500);
    expect(weights["MOBILE"]).toBe(2500);

    const totalWeight = b.tokens.reduce((acc, t) => acc + t.weightBps, 0);
    expect(totalWeight).toBe(10000);
  });

  it("resolves basket by slug or id correctly using getBasketById", () => {
    expect(getBasketById("solana-infrastructure").name).toBe("Solana Infrastructure");
    expect(getBasketById("solana-defi-blue-chips").name).toBe("Solana Infrastructure");
    expect(getBasketById("solana-sigma-basket").name).toBe("Solana Sigma Basket");
    expect(getBasketById("solana-culture-memes").name).toBe("Solana Culture & Memes");
    expect(getBasketById("solana-ai-compute").name).toBe("Solana AI & Compute");
    expect(getBasketById("solana-depin-infrastructure").name).toBe("Solana DePIN Infrastructure");
  });
});
