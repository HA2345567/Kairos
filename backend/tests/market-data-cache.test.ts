process.env.KAIROS_DB_PATH = ":memory:";
process.env.NODE_ENV = "test";

import { test } from "node:test";
import assert from "node:assert/strict";

const { getBasketMarketNavHistory, getBasketMarketData, pendingMarketDataWork, SOLANA_MINTS } = await import("../src/services/market-data.service");
const { all } = await import("../src/db/postgres");

test("cold market candles backfill into the shared cache and become visible", { timeout: 20_000 }, async () => {
  const originalFetch = globalThis.fetch;
  const mint = SOLANA_MINTS.SOL;
  const pool = "SoLPooL11111111111111111111111111111111111";
  const day = 86_400;
  const today = Math.floor(Date.now() / 1000 / day) * day;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/tokens/multi/")) {
      return Response.json({
        data: [{ id: `solana_${mint}`, attributes: { symbol: "SOL", price_usd: "110", total_reserve_in_usd: "100000" }, relationships: { top_pools: { data: [{ id: `solana_${pool}` }] } } }],
        included: [{ id: `solana_${pool}`, attributes: { address: pool, price_change_percentage: { h24: "5" } } }],
      });
    }
    if (url.includes("/ohlcv/day")) {
      return Response.json({ data: { attributes: { ohlcv_list: [[today - 2 * day, 100, 100, 100, 100, 1], [today - day, 105, 105, 105, 105, 1]] } } });
    }
    if (url.includes("/ohlcv/hour")) {
      return Response.json({ data: { attributes: { ohlcv_list: [[today - 3600, 100, 100, 100, 100, 1], [today, 110, 110, 110, 110, 1]] } } });
    }
    throw new Error(`Unexpected market request: ${url}`);
  };

  try {
    const tokens = [{ mint: "DevnetSOLReference111111111111111111111111", symbol: "SOL", weightBps: 10_000 }];
    const cold = await getBasketMarketNavHistory(tokens, "1Y");
    assert.equal(cold.progress.loaded, 0);
    await pendingMarketDataWork();

    const warm = await getBasketMarketNavHistory(tokens, "1Y");
    assert.ok(warm.history.length >= 2);
    assert.equal(warm.progress.coverageWeightBps, 10_000);
    const market = await getBasketMarketData(tokens);
    assert.equal(market.assets[0].sparklineStatus, "ready");
    assert.ok((market.assets[0].sparkline24h?.length ?? 0) >= 2);
    const stored = await all<{ timeframe: string }>("SELECT timeframe FROM market_reference_candle_cache WHERE market_mint = ?", mint);
    assert.deepEqual(stored.map((row) => row.timeframe).sort(), ["day", "hour"]);
    const snapshots = await all<{ payload_json: string }>("SELECT payload_json FROM basket_market_data_cache");
    assert.ok(snapshots.some((row) => JSON.parse(row.payload_json).assets.some((asset: { marketMint: string }) => asset.marketMint === mint)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
