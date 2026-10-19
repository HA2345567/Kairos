/**
 * Slice F contract suite: the PRD items that were still missing after Slices
 * B–E — FR-04 eligibility, FR-27 annotations, FR-18 notification preferences,
 * FR-25 Labs persistence/moderation, FE-09 analytics, NFR-10 retention,
 * FE-03 httpOnly cookie sessions and FE-04 pinned CORS.
 *
 * Chain-free and deterministic: nothing here touches an RPC endpoint.
 */
process.env.KAIROS_DB_PATH = ":memory:";
process.env.ADMIN_TOKEN = "slice-f-admin";
process.env.ADMIN_ACTOR_ID = "admin-slice-f";
process.env.ADMIN_APPROVER_TOKEN = "slice-f-approver";
process.env.ADMIN_APPROVER_ID = "approver-slice-f";
// §14.3 chaos drill: pause the reconciler for this suite and assert the pause
// is reported rather than silently ignored.
process.env.KAIROS_CHAOS_PAUSE_RECONCILER_MS = "600000";

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const { repository } = await import("../src/db/repository");
const { authService } = await import("../src/services/auth.service");
const { buildApp } = await import("../src/index");
const { runReconcilerOnce } = await import("../src/workers/reconciler");

const FIXTURE_MINT = "0SLICEFMINT11111111111111111111111111111111";
const DENIED_MINT = "0SLICEFDENIED11111111111111111111111111111";
const BASKET_SLUG = "0-slice-f-basket";

async function seedFixtures(): Promise<void> {
  for (const [mint, denylisted] of [
    [FIXTURE_MINT, false],
    [DENIED_MINT, true],
  ] as Array<[string, boolean]>) {
    await repository.saveToken({
      mint,
      symbol: mint === FIXTURE_MINT ? "tSLICEF" : "tDENYF",
      name: "Slice F fixture",
      decimals: 6,
      type: "spl",
      tradingStatus: "active",
      denylisted,
      priceUsd: 12,
      liquidityUsd: 250_000,
      liquiditySource: "test-fixture",
      liquidityCheckedAt: new Date().toISOString(),
    });
  }
  const versionId = "bv-slicef";
  await repository.saveBasketVersion({
    id: versionId,
    basketId: "bkt-slicef",
    version: 1,
    changelog: "slice-f fixture",
    publishedBy: "tests",
    publishedAt: new Date().toISOString(),
    legs: [{ id: "l-slicef", versionId, mint: FIXTURE_MINT, weightBps: 10_000, legType: "spl" }],
  });
  await repository.saveBasket({
    id: "bkt-slicef",
    slug: BASKET_SLUG,
    name: "Slice F Basket",
    thesis: "fixture",
    category: "slice-f",
    status: "active",
    activeVersionId: versionId,
    minUsdc: 25,
    protocols: [],
  });
}

async function session(wallet: Keypair) {
  const address = wallet.publicKey.toBase58();
  const nonce = await authService.generateNonce(address);
  const message = `kairos-devnet-login:${nonce}`;
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey));
  const result = await authService.verify(address, signature, message);
  assert.ok(result, "expected a session for a valid signature");
  return result;
}

describe("FR-04 eligibility gate", () => {
  before(async () => seedFixtures());

  test("a restricted account is refused on prepare with ELIGIBILITY_REQUIRED", async () => {
    const wallet = Keypair.generate();
    const { token } = await session(wallet);
    const address = wallet.publicKey.toBase58();

    const admin = await buildApp().inject({
      method: "POST",
      url: "/v1/admin/eligibility",
      headers: { "x-admin-token": "slice-f-admin" },
      payload: { walletAddress: address, status: "requires_action" },
    });
    assert.equal(admin.statusCode, 200);
    assert.equal(admin.json().eligibility.status, "requires_action");

    const refused = await buildApp().inject({
      method: "POST",
      url: "/v1/positions/prepare",
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "elig-1" },
      payload: { basket: BASKET_SLUG, usdc: 50, walletAddress: address },
    });
    assert.equal(refused.statusCode, 403);
    assert.equal(refused.json().error, "ELIGIBILITY_REQUIRED");

    const confirm = await buildApp().inject({
      method: "POST",
      url: "/v1/eligibility/confirm",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ageConfirmed: true, region: "US" },
    });
    assert.equal(confirm.statusCode, 200);
    assert.equal(confirm.json().eligibility.ageVerified, true);
    assert.equal(
      confirm.json().eligibility.status,
      "eligible",
      "the age/ToS attestation clears requires_action"
    );
    assert.equal(confirm.json().eligibility.eligible, true);

    // A compliance hold is different: attesting must not lift it.
    await buildApp().inject({
      method: "POST",
      url: "/v1/admin/eligibility",
      headers: { "x-admin-token": "slice-f-admin" },
      payload: { walletAddress: address, status: "restricted" },
    });
    const held = await buildApp().inject({
      method: "POST",
      url: "/v1/eligibility/confirm",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ageConfirmed: true, region: "US" },
    });
    assert.equal(held.json().eligibility.status, "restricted");
    assert.equal(held.json().eligibility.eligible, false);

    const refusedAgain = await buildApp().inject({
      method: "POST",
      url: "/v1/positions/prepare",
      headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": "elig-2" },
      payload: { basket: BASKET_SLUG, usdc: 50, walletAddress: address },
    });
    assert.equal(refusedAgain.statusCode, 403);
    assert.equal(refusedAgain.json().error, "ELIGIBILITY_REQUIRED");
  });

  test("a sanctioned region cannot attest into eligibility", async () => {
    const { token } = await session(Keypair.generate());
    const response = await buildApp().inject({
      method: "POST",
      url: "/v1/eligibility/confirm",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ageConfirmed: true, region: "KP" },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "REGION_BLOCKED");
  });
});

describe("FR-18 notification preferences are writable", () => {
  test("GET returns defaults and PUT persists channel + class choices", async () => {
    const wallet = Keypair.generate();
    const { token } = await session(wallet);
    const headers = { Authorization: `Bearer ${token}` };

    const defaults = await buildApp().inject({ method: "GET", url: "/v1/notifications/preferences", headers });
    assert.equal(defaults.statusCode, 200);
    assert.equal(defaults.json().preferences.inApp, true);
    assert.equal(defaults.json().preferences.email, false);
    assert.equal(defaults.json().preferences.executionUpdates, true);

    const updated = await buildApp().inject({
      method: "PUT",
      url: "/v1/notifications/preferences",
      headers,
      payload: { email: true, executionUpdates: false },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().preferences.email, true);
    assert.equal(updated.json().preferences.executionUpdates, false);

    const reread = await buildApp().inject({ method: "GET", url: "/v1/notifications/preferences", headers });
    assert.equal(reread.json().preferences.executionUpdates, false);

    const invalid = await buildApp().inject({
      method: "PUT",
      url: "/v1/notifications/preferences",
      headers,
      payload: { email: "yes" },
    });
    assert.equal(invalid.statusCode, 400);
  });
});

describe("FR-27 annotation layer", () => {
  test("admin creates annotations and the public read groups them by kind", async () => {
    const created = await buildApp().inject({
      method: "POST",
      url: `/v1/admin/baskets/${BASKET_SLUG}/annotations`,
      headers: { "x-admin-token": "slice-f-admin" },
      payload: {
        kind: "event",
        title: "Earnings release",
        body: "Fixture event",
        impact: "positive",
        source: "test",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().annotation.kind, "event");

    const checkpoint = await buildApp().inject({
      method: "POST",
      url: `/v1/admin/baskets/${BASKET_SLUG}/annotations`,
      headers: { "x-admin-token": "slice-f-admin" },
      payload: { kind: "checkpoint", title: "v1 reweight", body: "weights updated" },
    });
    assert.equal(checkpoint.statusCode, 201);

    const invalid = await buildApp().inject({
      method: "POST",
      url: `/v1/admin/baskets/${BASKET_SLUG}/annotations`,
      headers: { "x-admin-token": "slice-f-admin" },
      payload: { kind: "gossip", title: "nope" },
    });
    assert.equal(invalid.statusCode, 400);

    const listed = await buildApp().inject({
      method: "GET",
      url: `/v1/baskets/${BASKET_SLUG}/annotations`,
    });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().byKind.event.length, 1);
    assert.equal(listed.json().byKind.checkpoint.length, 1);

    const deleted = await buildApp().inject({
      method: "DELETE",
      url: `/v1/admin/annotations/${created.json().annotation.id}`,
      headers: { "x-admin-token": "slice-f-admin" },
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.json().deleted, true);
  });
});

describe("FR-25 Labs persistence, voting and moderation", () => {
  test("submissions validate weights, persist, vote idempotently and promote to a paused basket", async () => {
    const wallet = Keypair.generate();
    const { token } = await session(wallet);
    const headers = { Authorization: `Bearer ${token}` };

    const badWeights = await buildApp().inject({
      method: "POST",
      url: "/v1/labs/baskets",
      headers,
      payload: { name: "Bad weights", allocations: [{ mint: FIXTURE_MINT, weightBps: 9_000 }] },
    });
    assert.equal(badWeights.statusCode, 422);
    assert.equal(badWeights.json().error, "WEIGHT_SUM_INVALID");

    const created = await buildApp().inject({
      method: "POST",
      url: "/v1/labs/baskets",
      headers,
      payload: { name: "Slice F Labs", thesis: "fixture", allocations: [{ mint: FIXTURE_MINT, weightBps: 10_000 }] },
    });
    assert.equal(created.statusCode, 201);
    const labsSlug = created.json().labsBasket.slug;
    assert.equal(created.json().labsBasket.status, "submitted");

    const anonymous = await buildApp().inject({ method: "GET", url: "/v1/labs/baskets" });
    assert.ok(anonymous.json().labsBaskets.some((basket: { slug: string }) => basket.slug === labsSlug));

    const vote = await buildApp().inject({ method: "POST", url: `/v1/labs/baskets/${labsSlug}/vote`, headers });
    assert.equal(vote.statusCode, 200);
    assert.equal(vote.json().counted, true);
    assert.equal(vote.json().labsBasket.votes, 1);

    const repeat = await buildApp().inject({ method: "POST", url: `/v1/labs/baskets/${labsSlug}/vote`, headers });
    assert.equal(repeat.json().counted, false, "a second vote must not double count");
    assert.equal(repeat.json().labsBasket.votes, 1);

    const unvote = await buildApp().inject({ method: "DELETE", url: `/v1/labs/baskets/${labsSlug}/vote`, headers });
    assert.equal(unvote.statusCode, 200);
    assert.equal(unvote.json().removed, true);
    assert.equal(unvote.json().labsBasket.votes, 0);
    const unvoteAgain = await buildApp().inject({ method: "DELETE", url: `/v1/labs/baskets/${labsSlug}/vote`, headers });
    assert.equal(unvoteAgain.json().removed, false, "removing an absent vote must be idempotent");
    const voteAgain = await buildApp().inject({ method: "POST", url: `/v1/labs/baskets/${labsSlug}/vote`, headers });
    assert.equal(voteAgain.json().labsBasket.votes, 1);

    const comment = await buildApp().inject({
      method: "POST",
      url: `/v1/labs/baskets/${labsSlug}/comments`,
      headers,
      payload: { body: "Looks interesting" },
    });
    assert.equal(comment.statusCode, 201);

    const promoteBeforeApproval = await buildApp().inject({
      method: "POST",
      url: `/v1/admin/labs/${labsSlug}/promote`,
      headers: { "x-admin-token": "slice-f-admin" },
    });
    assert.equal(promoteBeforeApproval.statusCode, 422);
    assert.equal(promoteBeforeApproval.json().error, "LABS_BASKET_NOT_APPROVED");

    const moderate = await buildApp().inject({
      method: "POST",
      url: `/v1/admin/labs/${labsSlug}/moderate`,
      headers: { "x-admin-token": "slice-f-admin" },
      payload: { decision: "approved", note: "ok" },
    });
    assert.equal(moderate.statusCode, 200);
    assert.equal(moderate.json().labsBasket.status, "approved");

    const promote = await buildApp().inject({
      method: "POST",
      url: `/v1/admin/labs/${labsSlug}/promote`,
      headers: { "x-admin-token": "slice-f-admin" },
    });
    assert.equal(promote.statusCode, 200);
    assert.equal(promote.json().labsBasket.status, "promoted");
    const promoted = await repository.getBasket(promote.json().basketId);
    assert.ok(promoted, "promotion must create a real basket shell");
    assert.equal(promoted.status, "paused", "a promoted basket stays paused until an admin activates it");

    const rejected = await buildApp().inject({
      method: "POST",
      url: "/v1/labs/baskets",
      headers,
      payload: { name: "Rejected Labs", allocations: [{ mint: FIXTURE_MINT, weightBps: 10_000 }] },
    });
    const rejectedSlug = rejected.json().labsBasket.slug;
    await buildApp().inject({
      method: "POST",
      url: `/v1/admin/labs/${rejectedSlug}/moderate`,
      headers: { "x-admin-token": "slice-f-admin" },
      payload: { decision: "rejected", note: "not eligible" },
    });
    const publicFeed = await buildApp().inject({ method: "GET", url: "/v1/labs/baskets?status=rejected" });
    assert.ok(!publicFeed.json().labsBaskets.some((basket: { slug: string }) => basket.slug === rejectedSlug));
  });
});

describe("FE-09 analytics + NFR-10 retention", () => {
  test("page views are accepted anonymously and retention purges what it says it purges", async () => {
    const accepted = await buildApp().inject({
      method: "POST",
      url: "/v1/analytics/page-view",
      headers: { "x-forwarded-for": "203.0.113.9" },
      payload: { name: "page_view", path: "/markets?wallet=SECRETS" },
    });
    assert.equal(accepted.statusCode, 202);

    const since = new Date(0).toISOString();
    const before = await repository.countAnalyticsSince(since);
    assert.ok(before >= 1);

    const oldEvent = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    await repository.recordAnalyticsEvent({
      name: "page_view",
      path: "/old",
      region: null,
      sessionHash: "old-session",
      ts: oldEvent,
    });
    await repository.createNonce("0-expired-wallet", "kairos-auth-expired", Date.now() - 1000);

    const sweep = await buildApp().inject({
      method: "POST",
      url: "/v1/admin/retention/run",
      headers: { "x-admin-token": "slice-f-admin" },
    });
    assert.equal(sweep.statusCode, 200);
    const report = sweep.json().report;
    assert.ok(report.analyticsPurged >= 1, "analytics older than 30 days must be purged");
    assert.ok(report.noncesPurged >= 1, "expired nonces must be purged");
    assert.equal(report.windows.analyticsDays, 30);
    assert.equal(report.windows.auditDays, 2555);

    const after = await repository.countAnalyticsSince(since);
    assert.ok(after < before + 1, "the old analytics row must be gone");
  });
});

describe("§14.3 chaos switch: indexer pause", () => {
  test("a paused reconciler reports the pause and checks nothing", async () => {
    const summary = await runReconcilerOnce();
    assert.equal(summary.paused, true);
    assert.equal(summary.checked, 0);
    assert.ok(summary.pausedUntil, "the drill must report when reconciliation resumes");
  });
});

describe("FE-04 pinned CORS", () => {
  test("a configured origin is echoed with credentials while an unknown origin gets no grant", async () => {
    const allowed = await buildApp().inject({
      method: "GET",
      url: "/v1/config",
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(allowed.headers["Access-Control-Allow-Origin"], "http://localhost:5173");
    assert.equal(allowed.headers["Access-Control-Allow-Credentials"], "true");
    assert.equal(allowed.headers.Vary, "Origin");

    const denied = await buildApp().inject({
      method: "GET",
      url: "/v1/config",
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(denied.headers["Access-Control-Allow-Origin"], undefined);
  });
});

describe("FE-03 httpOnly cookie sessions", () => {
  test("verify sets HttpOnly cookies and a cookie alone authenticates a request", async () => {
    const wallet = Keypair.generate();
    const address = wallet.publicKey.toBase58();
    const nonce = await authService.generateNonce(address);
    const message = `kairos-devnet-login:${nonce}`;
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey));

    const verified = await buildApp().inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: { walletAddress: address, signature, message },
    });
    assert.equal(verified.statusCode, 200);

    const raw = verified.headers["Set-Cookie"];
    const cookies = Array.isArray(raw) ? raw : [raw as string];
    assert.ok(cookies.length >= 2, "both the session and refresh cookies must be set");
    assert.ok(cookies.every((cookie) => /HttpOnly/.test(cookie)), "no session cookie may be JS-readable");
    assert.ok(cookies.some((cookie) => cookie.startsWith("kairos_session=")));
    assert.ok(cookies.some((cookie) => cookie.startsWith("kairos_refresh=") && /Path=\/v1\/auth/.test(cookie)));

    const token = verified.json().token as string;
    const session = await buildApp().inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie: `kairos_session=${token}` },
    });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json().walletAddress, address);
  });
});

describe("FR-03 liquidity evidence", () => {
  test("admin-recorded liquidity surfaces on the registry read and the filter works", async () => {
    const updated = await buildApp().inject({
      method: "POST",
      url: `/v1/admin/tokens/${FIXTURE_MINT}/liquidity`,
      headers: { "x-admin-token": "slice-f-admin" },
      payload: { liquidityUsd: 123_456, source: "test-feed", backtestable: false },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().token.liquidityUsd, 123_456);
    assert.equal(updated.json().token.backtestable, false);

    const filtered = await buildApp().inject({ method: "GET", url: "/v1/tokens?backtestable=false" });
    assert.ok(
      filtered.json().tokens.some((token: { mint: string }) => token.mint === FIXTURE_MINT),
      "the backtestable filter must expose evidence state"
    );
  });
});
