import { beforeEach, expect, it } from "vitest";
import { cacheMarketHistoryResult, readMarketHistoryCache, writeMarketHistoryCache } from "@/lib/market-history-cache";
import type { BasketMarketNavHistoryResponse } from "@/lib/api-types";

function snapshot(length: number, coverage = 10_000): BasketMarketNavHistoryResponse {
  return {
    history: Array.from({ length }, (_, index) => ({ navValue: 100 + index })),
    progress: { coverageWeightBps: coverage },
  } as BasketMarketNavHistoryResponse;
}

beforeEach(() => window.localStorage.clear());

it("updates a rolling window even when it has fewer candles", async () => {
  writeMarketHistoryCache("basket:1W", snapshot(8));
  const fresh = snapshot(7);
  expect(await cacheMarketHistoryResult("basket:1W", async () => fresh)).toEqual(fresh);
  expect(readMarketHistoryCache("basket:1W")?.data.history).toHaveLength(7);
});

it("preserves verified history while a cold backend returns empty data", async () => {
  const saved = snapshot(7);
  writeMarketHistoryCache("basket:1W", saved);
  expect(await cacheMarketHistoryResult("basket:1W", async () => snapshot(0, 0))).toEqual(saved);
});
