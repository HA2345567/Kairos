import { describe, expect, it } from "vitest";
import type { BasketCatalogItem } from "../lib/api-types";
import { mapCatalogBasket } from "../lib/baskets-data";

describe("mapCatalogBasket", () => {
  it("uses backend identity, active-version weights and token metadata", () => {
    const item: BasketCatalogItem = {
      id: "bkt-digital-gold",
      slug: "digital-gold",
      name: "Digital Gold",
      thesis: "A devnet test basket for tokenized gold.",
      category: "commodities",
      status: "active",
      activeVersionId: "version-1",
      minUsdc: 25,
      protocols: ["Kairos Router"],
      activeVersion: {
        id: "version-1",
        basketId: "bkt-digital-gold",
        version: 1,
        changelog: "Initial composition",
        publishedBy: "curator",
        publishedAt: "2026-01-01T00:00:00.000Z",
        legs: [{ id: "leg-1", versionId: "version-1", mint: "MintGold", weightBps: 10000, legType: "spl" }],
      },
      tokens: [{
        mint: "MintGold",
        symbol: "tGOLD",
        name: "Kairos Devnet tGOLD",
        decimals: 6,
        type: "spl",
        tradingStatus: "active",
        denylisted: false,
        priceUsd: 2,
        weightBps: 10000,
      }],
    };

    const basket = mapCatalogBasket(item);
    expect(basket.slug).toBe("digital-gold");
    expect(basket.tokens).toMatchObject([{
      mint: "MintGold",
      symbol: "GOLD",
      name: "GOLD",
      weightBps: 10000,
      icon: "/tokens/gold.png",
      priceUsd: 2,
    }]);
    expect(basket.tvlUsd).toBeNull();
    expect(basket.isInvestable).toBe(true);
  });
});
