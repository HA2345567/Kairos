/**
 * Slice C contract suite: PRD §10 stream contract, notification read surface,
 * execution status resume shape, security headers/log correlation (FE-04,
 * NFR-09) and admin metrics (NFR-01/02/07).
 *
 * Chain-free and deterministic: all state comes from the in-memory DB.
 */
process.env.KAIROS_DB_PATH = ":memory:";
process.env.ADMIN_TOKEN = "slice-c-admin-token";

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const { repository } = await import("../src/db/repository");
const { authService } = await import("../src/services/auth.service");
const { buildApp } = await import("../src/index");
const { publishEvent, readEvents, resetEventStream, executionResource, SCHEMA_VERSION } = await import(
  "../src/services/event-stream"
);

const TOKEN = Keypair.generate();
const OTHER = Keypair.generate();
const WALLET = TOKEN.publicKey.toBase58();
const OTHER_WALLET = OTHER.publicKey.toBase58();
const MINT = "0SLICECMINT11111111111111111111111111111111";

async function sessionToken(wallet: Keypair): Promise<string> {
  const address = wallet.publicKey.toBase58();
  const nonce = await authService.generateNonce(address);
  const message = `kairos-devnet-login:${nonce}`;
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey));
  const session = await authService.verify(address, signature, message);
  assert.ok(session, "expected a session for a valid signature");
  return session.token;
}

function executionFixture(id: string, walletAddress: string) {
  const now = new Date().toISOString();
  return {
    id,
    walletId: `wal-${id}`,
    walletAddress,
    basketId: "bkt-slicec",
    basketVersionId: "bv-slicec",
    type: "open" as const,
    status: "LANDING" as const,
    idempotencyKey: `idem-${id}`,
    totalUsdc: 50,
    feeUsdc: 0.1,
    preparedTxs: [],
    messageHashes: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: now,
    updatedAt: now,
    legs: [],
  };
}

describe("event stream contract (PRD §10)", () => {
  before(() => resetEventStream());

  test("sequence numbers are monotonic per resource and carry schema_version", () => {
    const first = publishEvent(executionResource("exec-stream"), "execution.submitted", { status: "SUBMITTED" });
    const second = publishEvent(executionResource("exec-stream"), "execution.completed", { status: "COMPLETED" });
    assert.equal(first.seq, 1);
    assert.equal(second.seq, 2);
    assert.equal(first.schema_version, SCHEMA_VERSION);

    const slice = readEvents(executionResource("exec-stream"), 1);
    assert.equal(slice.seq, 2);
    assert.equal(slice.events.length, 1);
    assert.equal(slice.events[0].seq, 2);
    assert.equal(slice.resyncRequired, false);
  });

  test("the tail is returned when no cursor is supplied", () => {
    const slice = readEvents(executionResource("exec-stream"), 0);
    assert.equal(slice.events.length, 1);
    assert.equal(slice.events[0].seq, 2);
  });

  test("a cursor behind the retained window forces a resync", () => {
    const resource = executionResource("exec-gap");
    for (let i = 0; i < 205; i++) publishEvent(resource, "execution.leg.updated", { i });
    // Cursor 1: sequence 2 has been evicted, so events 2..5 are unrecoverable.
    const slice = readEvents(resource, 1);
    assert.equal(slice.resyncRequired, true);
    assert.equal(slice.seq, 205);
  });

  test("resources are isolated from each other", () => {
    const other = readEvents(executionResource("exec-untouched"), 0);
    assert.equal(other.seq, 0);
    assert.equal(other.events.length, 0);
    assert.equal(other.resyncRequired, false);
  });
});

describe("stream routes", () => {
  before(async () => {
    await repository.saveExecution(executionFixture("exec-slicec-owned", WALLET));
    await repository.saveExecution(executionFixture("exec-slicec-foreign", OTHER_WALLET));
    publishEvent(executionResource("exec-slicec-owned"), "execution.landing", { status: "LANDING" });
  });

  test("an unauthenticated read is rejected", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/v1/stream/executions/exec-slicec-owned" });
    assert.equal(response.statusCode, 401);
  });

  test("a wallet cannot stream another wallet's execution", async () => {
    const token = await sessionToken(TOKEN);
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/stream/executions/exec-slicec-foreign",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 403);
  });

  test("the owner reads the projected events with a cursor", async () => {
    const token = await sessionToken(TOKEN);
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/stream/executions/exec-slicec-owned?afterSeq=0",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.schema_version, SCHEMA_VERSION);
    assert.ok(body.seq >= 1);
    assert.equal(body.events[0].event, "execution.landing");
  });

  test("price streams stay public and carry no wallet fields", async () => {
    publishEvent(`price.${MINT}`, "price.snapshot", { mint: MINT, priceUsd: 10 });
    const response = await buildApp().inject({ method: "GET", url: `/v1/stream/prices/${MINT}` });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(!JSON.stringify(body).includes(WALLET));
  });
});

describe("execution status resume shape (PRD §4.5)", () => {
  test("the owner gets a terminal flag and stream cursor", async () => {
    const token = await sessionToken(TOKEN);
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/executions/exec-slicec-owned/status",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.executionId, "exec-slicec-owned");
    assert.equal(body.status, "LANDING");
    assert.equal(body.terminal, false);
    assert.equal(typeof body.seq, "number");
    assert.ok(body.seq >= 1);
  });

  test("COMPLETED executions report terminal=true", async () => {
    await repository.saveExecution({ ...executionFixture("exec-slicec-done", WALLET), status: "COMPLETED" });
    const token = await sessionToken(TOKEN);
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/executions/exec-slicec-done/status",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().terminal, true);
  });

  test("another wallet cannot read the status", async () => {
    const token = await sessionToken(OTHER);
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/executions/exec-slicec-owned/status",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 403);
  });
});

describe("notifications read surface (FR-18)", () => {
  before(async () => {
    await repository.saveExecution(executionFixture("exec-slicec-notify", WALLET));
    await repository.enqueueOutbox("execution.completed", {
      executionId: "exec-slicec-notify",
      basketId: "bkt-slicec",
      type: "open",
    });
  });

  test("requires a session", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/v1/notifications" });
    assert.equal(response.statusCode, 401);
  });

  test("returns only the session wallet's notifications", async () => {
    const token = await sessionToken(TOKEN);
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/notifications",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(Array.isArray(body.notifications));
    assert.ok(body.notifications.length >= 1);
    assert.ok(body.notifications.every((n: { executionId: string }) => n.executionId === "exec-slicec-notify"));
  });

  test("a walletAddress query for a different wallet is refused", async () => {
    const token = await sessionToken(TOKEN);
    const response = await buildApp().inject({
      method: "GET",
      url: `/v1/notifications?walletAddress=${OTHER_WALLET}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 403);
  });
});

describe("/v1/config (removes hardcoded devnet constants)", () => {
  test("exposes the cluster and schema version without any secret", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/v1/config" });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.cluster, "devnet");
    assert.equal(body.schemaVersion, SCHEMA_VERSION);
    const serialised = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["jwtsecret", "relayerkeypair", "privatekey", "admin_token"]) {
      assert.ok(!serialised.includes(forbidden), `config leaked ${forbidden}`);
    }
  });
});

describe("security headers and log correlation (FE-04, NFR-09)", () => {
  test("responses carry CSP, HSTS, nosniff and a request id", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    const headers = response.headers as Record<string, string>;
    assert.match(headers["Content-Security-Policy"], /default-src 'none'/);
    assert.match(headers["Strict-Transport-Security"], /max-age=/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.ok(headers["X-Request-Id"] && headers["X-Request-Id"].length > 10);
  });

  test("an inbound request id is preserved so traces can join across hops", async () => {
    const response = await buildApp().inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "slice-c-trace-1" },
    });
    assert.equal((response.headers as Record<string, string>)["X-Request-Id"], "slice-c-trace-1");
  });
});

describe("admin metrics (NFR-01/02/07)", () => {
  test("requires the admin token", async () => {
    const response = await buildApp().inject({ method: "GET", url: "/v1/admin/metrics" });
    assert.equal(response.statusCode, 403);
  });

  test("keys metrics by route pattern rather than concrete id", async () => {
    const token = await sessionToken(TOKEN);
    await buildApp().inject({
      method: "GET",
      url: "/v1/executions/exec-slicec-owned",
      headers: { Authorization: `Bearer ${token}` },
    });
    const response = await buildApp().inject({
      method: "GET",
      url: "/v1/admin/metrics",
      headers: { "x-admin-token": "slice-c-admin-token" },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.routes.some((route: { route: string; count: number }) =>
      route.route === "/v1/executions/:id" && route.count >= 1
    ));
    assert.ok(!JSON.stringify(body).includes("exec-slicec-owned"));
    assert.ok(body.nfr.prepareLatencyMs);
    assert.ok(body.nfr.legTerminalLatencyMs);
  });
});
