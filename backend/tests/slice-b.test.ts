/**
 * Slice B contract suite: PRD §10 per-wallet prepare budgets, cursor pagination
 * and registry filters, and the FR-26 simulation endpoint.
 *
 * Deterministic and chain-free. Fixtures use "0"-prefixed slugs/mints so that
 * cursor ordering is independent of any fixture another test file seeds.
 */
process.env.KAIROS_DB_PATH = ":memory:";

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const { repository } = await import("../src/db/repository");
const { authService } = await import("../src/services/auth.service");
const { buildApp } = await import("../src/index");
const { SIMULATION_BASE } = await import("../src/services/simulation.service");

const RESPONSIVE_MINT = "0RESPONSIVE1111111111111111111111111111111";
const STEADY_MINT = "0STEADY11111111111111111111111111111111111";
const STALE_MINT = "0STALEWITHOUTHISTORY1111111111111111111";
const DENIED_MINT = "0DENIED11111111111111111111111111111111111";

const BASKET_SLUGS = ["0-alpha-basket", "0-beta-basket", "0-gamma-basket"];

async function seedFixtures(): Promise<void> {
  const tokens = [
    { mint: RESPONSIVE_MINT, symbol: "tRESP", decimals: 6, type: "spl" as const, denylisted: false },
    { mint: STEADY_MINT, symbol: "tSTEDY", decimals: 6, type: "spl" as const, denylisted: false },
    { mint: STALE_MINT, symbol: "tSTALE", decimals: 6, type: "ondo" as const, denylisted: false },
    { mint: DENIED_MINT, symbol: "tDENY", decimals: 6, type: "ondo" as const, denylisted: true },
  ];
  for (const token of tokens) {
    (await repository.saveToken({
      mint: token.mint,
      symbol: token.symbol,
      name: token.symbol,
      decimals: token.decimals,
      type: token.type,
      tradingStatus: "active",
      denylisted: token.denylisted,
      priceUsd: 10,
    }));
  }

  const now = Date.now();
  for (let hour = 0; hour < 12; hour++) {
    const ts = new Date(now - (11 - hour) * 3600_000).toISOString();
    (await repository.addSnapshot(RESPONSIVE_MINT, ts, 10 + hour * 0.1, "pyth"));
    (await repository.addSnapshot(STEADY_MINT, ts, 25 - hour * 0.05, "pyth"));
  }

  for (const [index, slug] of BASKET_SLUGS.entries()) {
    const versionId = `bv-sliceb-${index}`;
    (await repository.saveBasketVersion({
      id: versionId,
      basketId: `bkt-sliceb-${index}`,
      version: 1,
      changelog: "slice-b fixture",
      publishedBy: "tests",
      publishedAt: new Date().toISOString(),
      legs: [{ id: `l-${index}`, versionId, mint: RESPONSIVE_MINT, weightBps: 10_000, legType: "spl" }],
    }));
    (await repository.saveBasket({
      id: `bkt-sliceb-${index}`,
      slug,
      name: `Slice B ${slug}`,
      thesis: "fixture",
      category: "slice-b",
      status: "active",
      activeVersionId: versionId,
      minUsdc: 25,
      protocols: [],
    }));
  }
}

async function sessionToken(wallet: Keypair): Promise<string> {
  const address = wallet.publicKey.toBase58();
  const nonce = await authService.generateNonce(address);
  const message = `kairos-devnet-login:${nonce}`;
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey));
  const session = await authService.verify(address, signature, message);
  assert.ok(session, "expected a session for a valid signature");
  return session.token;
}

describe("per-wallet prepare budget (PRD §10: 20 prepares / wallet / 10 min)", () => {
  before(async () => (await seedFixtures()));

  test("the 21st prepare from one wallet is refused while earlier ones are not", async () => {
    const token = await sessionToken(Keypair.generate());
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await buildApp().inject({
        method: "POST",
        url: "/v1/positions/prepare",
        // A distinct forwarded IP per attempt isolates the per-wallet budget
        // from the coarse per-IP money guard.
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `wallet-budget-${attempt}`,
          "x-forwarded-for": `10.9.0.${attempt}`,
        },
        payload: { basket: "0-no-such-basket", usdc: 50, walletAddress: Keypair.generate().publicKey.toBase58() },
      });
      statuses.push(response.statusCode);
    }

    const firstTwenty = statuses.slice(0, 20);
    assert.ok(
      firstTwenty.every((status) => status !== 429),
      `expected the first 20 prepares to be allowed, saw ${firstTwenty.join(",")}`
    );
    assert.equal(statuses[20], 429);
  });

  test("a different wallet is unaffected by another wallet's exhausted budget", async () => {
    const token = await sessionToken(Keypair.generate());
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/positions/prepare",
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "fresh-wallet-budget",
        "x-forwarded-for": "10.9.9.9",
      },
      payload: { basket: "0-no-such-basket", usdc: 50, walletAddress: Keypair.generate().publicKey.toBase58() },
    });
    assert.notEqual(response.statusCode, 429);
  });
});

describe("cursor pagination and registry filters (PRD §10)", () => {
  before(async () => (await seedFixtures()));

  test("baskets page by slug cursor and stop with a null cursor", async () => {
    const first = await buildApp().inject({
      method: "GET",
      url: "/v1/baskets?category=slice-b&limit=2",
    });
    assert.equal(first.statusCode, 200);
    const firstBody = first.json();
    assert.deepEqual(firstBody.baskets.map((b: { slug: string }) => b.slug), [
      "0-alpha-basket",
      "0-beta-basket",
    ]);
    assert.equal(firstBody.nextCursor, "0-beta-basket");

    const second = await buildApp().inject({
      method: "GET",
      url: `/v1/baskets?category=slice-b&limit=2&after=${firstBody.nextCursor}`,
    });
    assert.deepEqual(second.json().baskets.map((b: { slug: string }) => b.slug), ["0-gamma-basket"]);
    assert.equal(second.json().nextCursor, null);
  });

  test("tokens filter by type and denylist state", async () => {
    const ondoDefault = await buildApp().inject({ method: "GET", url: "/v1/tokens?type=ondo" });
    const defaultMints = ondoDefault.json().tokens.map((t: { mint: string }) => t.mint);
    assert.ok(defaultMints.includes(STALE_MINT));
    assert.ok(!defaultMints.includes(RESPONSIVE_MINT), "type filter must exclude other types");
    assert.ok(
      !defaultMints.includes(DENIED_MINT),
      "a default registry read keeps hiding denylisted mints"
    );

    const ondoAll = await buildApp().inject({ method: "GET", url: "/v1/tokens?type=ondo&denylisted=all" });
    const allMints = ondoAll.json().tokens.map((t: { mint: string }) => t.mint);
    assert.ok(allMints.includes(STALE_MINT));
    assert.ok(allMints.includes(DENIED_MINT), "denylisted=all must expose denylisted rows");

    const deniedOnly = await buildApp().inject({ method: "GET", url: "/v1/tokens?denylisted=true" });
    const deniedMints = deniedOnly.json().tokens.map((t: { mint: string }) => t.mint);
    assert.ok(deniedMints.includes(DENIED_MINT));
    assert.ok(!deniedMints.includes(STALE_MINT));
  });

  test("tokens page by mint cursor", async () => {
    const page = await buildApp().inject({
      method: "GET",
      url: `/v1/tokens?limit=1&after=${RESPONSIVE_MINT}`,
    });
    assert.equal(page.json().tokens.length, 1);
    assert.ok(
      page.json().tokens[0].mint > RESPONSIVE_MINT,
      "a cursor page must only contain rows after `after`"
    );
    const nextCursor = page.json().nextCursor;
    assert.ok(nextCursor === null || nextCursor > RESPONSIVE_MINT);
  });
});

describe("simulation endpoint (PRD FR-26)", () => {
  before(async () => (await seedFixtures()));

  test("returns a hypothetical series rebased to 1000 with an honest benchmark state", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: {
        allocations: [
          { mint: RESPONSIVE_MINT, weightBps: 6000 },
          { mint: STEADY_MINT, weightBps: 4000 },
        ],
      },
    });
    assert.equal(response.statusCode, 200);
    const simulation = response.json().simulation;
    assert.equal(simulation.base, SIMULATION_BASE);
    assert.equal(simulation.series[0].value, SIMULATION_BASE);
    assert.ok(simulation.series.length >= 10);
    assert.equal(simulation.isHypothetical, true);
    assert.equal(typeof simulation.returnPct, "number");
    assert.ok(simulation.disclaimer.length > 0);
    assert.equal(simulation.excluded.length, 0);
    assert.ok(simulation.allocations.every((a: { included: boolean }) => a.included));
    // No verified benchmark feed is configured in this environment: the endpoint
    // must say so rather than fabricate a comparison.
    assert.equal(simulation.benchmark.available, false);
    assert.equal(simulation.benchmark.returnPct, null);
    assert.deepEqual(simulation.benchmark.series, []);
    assert.match(simulation.benchmark.label, /Unavailable/);
  });

  test("excludes a leg without history and reports why instead of guessing", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: {
        allocations: [
          { mint: RESPONSIVE_MINT, weightBps: 5000 },
          { mint: STALE_MINT, weightBps: 5000 },
        ],
      },
    });
    assert.equal(response.statusCode, 200);
    const simulation = response.json().simulation;
    assert.equal(simulation.excluded.length, 1);
    assert.equal(simulation.excluded[0].mint, STALE_MINT);
    assert.match(simulation.excluded[0].reason, /insufficient verified snapshot history/);
    assert.ok(simulation.series.length > 0, "the leg with history must still be simulated");
  });

  test("returns an explicit unavailable state when no leg can be simulated", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: { allocations: [{ mint: STALE_MINT, weightBps: 10_000 }] },
    });
    assert.equal(response.statusCode, 200);
    const simulation = response.json().simulation;
    assert.deepEqual(simulation.series, []);
    assert.equal(simulation.returnPct, null);
    assert.match(simulation.unavailableReason, /No allocated asset has enough verified snapshot history/);
  });

  test("rejects weights that do not sum to 10000", async () => {
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: {
        allocations: [
          { mint: RESPONSIVE_MINT, weightBps: 6000 },
          { mint: STEADY_MINT, weightBps: 3000 },
        ],
      },
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error, "WEIGHT_SUM_INVALID");
  });

  test("rejects unknown and denylisted mints", async () => {
    const unknown = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: { allocations: [{ mint: "0unknown111111111111111111111111111111111111", weightBps: 10_000 }] },
    });
    assert.equal(unknown.statusCode, 422);
    assert.equal(unknown.json().error, "MINT_NOT_ALLOWED");

    const denied = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: { allocations: [{ mint: DENIED_MINT, weightBps: 10_000 }] },
    });
    assert.equal(denied.statusCode, 422);
    assert.equal(denied.json().error, "MINT_NOT_ALLOWED");
  });

  test("rejects an unsupported window and missing allocations", async () => {
    const badWindow = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: { allocations: [{ mint: RESPONSIVE_MINT, weightBps: 10_000 }], window: "10Y" },
    });
    assert.equal(badWindow.statusCode, 422);
    assert.equal(badWindow.json().error, "INVALID_INPUT");

    const missing = await buildApp().inject({
      method: "POST",
      url: "/v1/agent/simulate-graph",
      payload: {},
    });
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().error, "INVALID_INPUT");
  });
});
