/**
 * NFR probe (PRD §13).
 *
 * Measures the two latency budgets the PRD states numerically — NFR-02 (read
 * p95 ≤ 250 ms) and NFR-01 (prepare p95 ≤ 3 s) — against a running API, and
 * checks NFR-09 traceability by reading the created execution back through the
 * status route and (when an admin token is present) through /v1/admin/metrics.
 *
 * Three verdicts, deliberately distinct:
 *   pass    — measured inside the budget
 *   fail    — measured outside the budget (script exits 1)
 *   blocked — prerequisite missing (no live basket, no session, API absent);
 *             never reported as a pass
 *
 * Usage: bun scripts/nfr-probe.ts [--base http://localhost:3001] [--requests 60]
 */

import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

type Verdict = "pass" | "fail" | "blocked";

interface Gate {
  id: string;
  requirement: string;
  verdict: Verdict;
  measured: string;
  detail?: string;
}

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const BASE = (argValue("--base") || process.env.KAIROS_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const REQUEST_COUNT = Number(argValue("--requests") || 60);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const READ_BUDGET_MS = 250;
const PREPARE_BUDGET_MS = 3_000;

const gates: Gate[] = [];
const notes: string[] = [];

async function timed(url: string, init?: RequestInit): Promise<{ ms: number; status: number; body: any }> {
  const started = performance.now();
  const response = await fetch(url, init);
  const text = await response.text();
  const ms = performance.now() - started;
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ms, status: response.status, body };
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

async function main(): Promise<void> {
  // ---- Reachability ------------------------------------------------------
  try {
    const health = await timed(`${BASE}/health`);
    if (health.status !== 200) {
      gates.push({
        id: "api-reachable",
        requirement: "API answers /health",
        verdict: "blocked",
        measured: `HTTP ${health.status}`,
      });
      return report();
    }
  } catch (error) {
    gates.push({
      id: "api-reachable",
      requirement: "API answers /health",
      verdict: "blocked",
      measured: "no response",
      detail: error instanceof Error ? error.message : String(error),
    });
    return report();
  }

  // ---- NFR-02: read latency ---------------------------------------------
  const readPaths = ["/v1/baskets", "/v1/tokens", "/v1/config"];
  const readSamples: number[] = [];
  const perPath: Record<string, number[]> = {};
  for (let i = 0; i < REQUEST_COUNT; i++) {
    const path = readPaths[i % readPaths.length];
    try {
      const { ms, status } = await timed(`${BASE}${path}`);
      if (status >= 400) continue;
      readSamples.push(ms);
      (perPath[path] ??= []).push(ms);
    } catch {
      /* transient; the sample set records only successes */
    }
  }
  if (readSamples.length < 10) {
    gates.push({
      id: "NFR-02",
      requirement: "read p95 ≤ 250 ms",
      verdict: "blocked",
      measured: `${readSamples.length} successful samples`,
      detail: "not enough successful reads to compute a p95",
    });
  } else {
    const p95 = percentile(readSamples, 95);
    gates.push({
      id: "NFR-02",
      requirement: "read p95 ≤ 250 ms",
      verdict: p95 <= READ_BUDGET_MS ? "pass" : "fail",
      measured: `p95 ${p95.toFixed(1)} ms over ${readSamples.length} reads`,
      detail: Object.entries(perPath)
        .map(([path, samples]) => `${path} p95 ${percentile(samples, 95).toFixed(1)} ms`)
        .join(", "),
    });
  }

  // ---- NFR-01: prepare latency + NFR-09 traceability ---------------------
  const baskets = await timed(`${BASE}/v1/baskets`);
  const candidates: Array<{ slug: string; minUsdc: number }> = Array.isArray(baskets.body?.baskets)
    ? baskets.body.baskets
        .filter((basket: any) => basket?.status === "active" && typeof basket?.slug === "string")
        .map((basket: any) => ({ slug: basket.slug, minUsdc: Number(basket.minUsdc) || 25 }))
    : [];
  if (candidates.length === 0) {
    gates.push({
      id: "NFR-01",
      requirement: "prepare p95 ≤ 3 s for ≤ 6 legs",
      verdict: "blocked",
      measured: "no active basket",
      detail: "prepare needs a live basket; seed the registry first",
    });
    gates.push({
      id: "NFR-09",
      requirement: "every execution traceable by execution_id",
      verdict: "blocked",
      measured: "no execution created",
    });
    return report();
  }

  const basket = candidates[0];
  const wallet = Keypair.generate();
  const address = wallet.publicKey.toBase58();
  const nonceResponse = await timed(`${BASE}/v1/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  });
  const nonce = nonceResponse.body?.nonce;
  if (!nonce) {
    gates.push({
      id: "NFR-01",
      requirement: "prepare p95 ≤ 3 s for ≤ 6 legs",
      verdict: "blocked",
      measured: "no SIWS session",
      detail: `nonce request answered HTTP ${nonceResponse.status}`,
    });
    gates.push({ id: "NFR-09", requirement: "every execution traceable by execution_id", verdict: "blocked", measured: "no session" });
    return report();
  }

  const message = `kairos-devnet-login:${nonce}`;
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey));
  const verified = await timed(`${BASE}/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address, signature, message }),
  });
  const token = verified.body?.token;
  if (!token) {
    gates.push({
      id: "NFR-01",
      requirement: "prepare p95 ≤ 3 s for ≤ 6 legs",
      verdict: "blocked",
      measured: "sign-in rejected",
      detail: `verify answered HTTP ${verified.status}`,
    });
    gates.push({ id: "NFR-09", requirement: "every execution traceable by execution_id", verdict: "blocked", measured: "no session" });
    return report();
  }

  const prepareSamples: number[] = [];
  const prepareFailures: string[] = [];
  let firstExecutionId: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { ms, status, body } = await timed(`${BASE}/v1/positions/prepare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `nfr-probe-${attempt}-${Date.now()}`,
        "x-forwarded-for": `10.20.0.${attempt}`,
      },
      body: JSON.stringify({ basket: basket.slug, usdc: Math.max(basket.minUsdc, 25), walletAddress: address }),
    });
    if (status === 200 && body?.execution?.id) {
      prepareSamples.push(ms);
      firstExecutionId ??= body.execution.id;
    } else {
      prepareFailures.push(`HTTP ${status} ${body?.error ?? ""}`.trim());
    }
  }

  if (prepareSamples.length === 0) {
    gates.push({
      id: "NFR-01",
      requirement: "prepare p95 ≤ 3 s for ≤ 6 legs",
      verdict: "blocked",
      measured: "0 successful prepares",
      detail: [...new Set(prepareFailures)].join(" | ") || "prepare refused",
    });
  } else {
    const p95 = percentile(prepareSamples, 95);
    gates.push({
      id: "NFR-01",
      requirement: "prepare p95 ≤ 3 s for ≤ 6 legs",
      verdict: p95 <= PREPARE_BUDGET_MS ? "pass" : "fail",
      measured: `p95 ${p95.toFixed(0)} ms over ${prepareSamples.length} prepares`,
      detail: prepareFailures.length ? `${prepareFailures.length} attempts refused: ${[...new Set(prepareFailures)].join(" | ")}` : undefined,
    });
  }

  if (firstExecutionId) {
    const status = await timed(`${BASE}/v1/executions/${firstExecutionId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const legs = Array.isArray(status.body?.legs) ? status.body.legs.length : 0;
    gates.push({
      id: "NFR-09",
      requirement: "every execution traceable by execution_id",
      verdict: status.status === 200 && legs > 0 ? "pass" : "fail",
      measured: `execution ${firstExecutionId.slice(0, 8)}… status route HTTP ${status.status} with ${legs} legs`,
      detail: status.body?.seq !== undefined ? `stream cursor ${status.body.seq}` : undefined,
    });
  } else {
    gates.push({ id: "NFR-09", requirement: "every execution traceable by execution_id", verdict: "blocked", measured: "no execution created" });
  }

  // ---- Metrics surface ---------------------------------------------------
  if (!ADMIN_TOKEN) {
    gates.push({
      id: "metrics-surface",
      requirement: "/v1/admin/metrics exposes NFR samples",
      verdict: "blocked",
      measured: "ADMIN_TOKEN not set",
    });
  } else {
    const metrics = await timed(`${BASE}/v1/admin/metrics`, { headers: { "x-admin-token": ADMIN_TOKEN } });
    const routes: any[] = Array.isArray(metrics.body?.routes) ? metrics.body.routes : [];
    const prepareRoute = routes.find((route) => route.route === "/v1/positions/prepare");
    gates.push({
      id: "metrics-surface",
      requirement: "/v1/admin/metrics exposes NFR samples",
      verdict: metrics.status === 200 && Boolean(prepareRoute) ? "pass" : "fail",
      measured: `HTTP ${metrics.status}, ${routes.length} route series`,
      detail: prepareRoute
        ? `prepare route count ${prepareRoute.count}, p95 ${prepareRoute.p95Ms} ms`
        : "prepare route not present in metrics",
    });
  }

  if (basket.minUsdc > 25) notes.push(`prepare used the basket minimum of ${basket.minUsdc} USDC`);
  return report();
}

function report(): void {
  const counts = { pass: 0, fail: 0, blocked: 0 };
  for (const gate of gates) counts[gate.verdict] += 1;
  console.log(
    JSON.stringify(
      {
        base: BASE,
        generatedAt: new Date().toISOString(),
        thresholds: { readP95Ms: READ_BUDGET_MS, prepareP95Ms: PREPARE_BUDGET_MS },
        counts,
        gates,
        notes,
      },
      null,
      2,
    ),
  );
  if (counts.fail > 0) process.exit(1);
  if (counts.blocked > 0) process.exit(2);
  process.exit(0);
}

await main();
