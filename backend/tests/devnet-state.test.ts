import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";
import { config } from "../src/config";
import { loadDevnetState } from "../src/chain/devnetState";

const validState = {
  cluster: "devnet",
  usdc: { mint: "So11111111111111111111111111111111111111112", decimals: 6, authority: "So11111111111111111111111111111111111111112" },
  treasury: { pubkey: "So11111111111111111111111111111111111111112" },
  relayer: { pubkey: "So11111111111111111111111111111111111111112" },
  assets: [{ symbol: "tUSDY", mint: "So11111111111111111111111111111111111111112", decimals: 6, priceUsd: 1, legType: "spl" }],
  updatedAt: "2026-10-21T00:00:00.000Z",
};

describe("Devnet state loading", () => {
  test("loads a valid state from the serverless environment when no file is required", () => {
    const previous = process.env.KAIROS_DEVNET_STATE_JSON;
    process.env.KAIROS_DEVNET_STATE_JSON = JSON.stringify(validState);
    try {
      assert.deepEqual(loadDevnetState(), validState);
    } finally {
      if (previous === undefined) delete process.env.KAIROS_DEVNET_STATE_JSON;
      else process.env.KAIROS_DEVNET_STATE_JSON = previous;
    }
  });

  test("rejects malformed or non-Devnet environment state", () => {
    const previous = process.env.KAIROS_DEVNET_STATE_JSON;
    const previousPath = config.devnetStatePath;
    process.env.KAIROS_DEVNET_STATE_JSON = JSON.stringify({ ...validState, cluster: "mainnet-beta" });
    config.devnetStatePath = join(tmpdir(), `kairos-no-state-${randomUUID()}.json`);
    try {
      assert.equal(loadDevnetState(), null);
    } finally {
      config.devnetStatePath = previousPath;
      if (previous === undefined) delete process.env.KAIROS_DEVNET_STATE_JSON;
      else process.env.KAIROS_DEVNET_STATE_JSON = previous;
    }
  });
});
