import type { IncomingMessage, ServerResponse } from "node:http";
import { waitUntil } from "@vercel/functions";
import { buildApp } from "../src/index";
import { config } from "../src/config";
import { pendingMarketDataWork } from "../src/services/market-data.service";
import { processLandingJobsOnce } from "../src/workers/landing";

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (value: unknown) => VercelResponse;
};

async function readBody(req: VercelRequest): Promise<unknown> {
  if (req.body !== undefined) {
    return req.body;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = await readBody(req);
  const app = buildApp();
  const result = await app.handleRequest(
    req.method || "GET",
    req.url || "/",
    body,
    req.headers
  );

  res.statusCode = result.statusCode;
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  // Provider candles are fetched progressively. Without waitUntil, Vercel may
  // freeze this instance before their shared cache writes finish, leaving every
  // subsequent history request empty after a cold start.
  if (req.method === "GET" && /\/market-(nav-history|data)(?:\?|$)/.test(req.url || "")) {
    waitUntil(pendingMarketDataWork());
  }
  // The HTTP function has no interval worker. Start the durable landing queue
  // immediately after an accepted Devnet submit, and resume it on status polls.
  // The DB lease and signed-message identity keep concurrent invocations safe.
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const acceptedSubmit = req.method === "POST" && pathname === "/v1/positions/submit";
  const authorizedStatus = req.method === "GET" && /^\/v1\/executions\/[^/]+\/status$/.test(pathname);
  const execution = acceptedSubmit ? result.data?.execution : authorizedStatus ? result.data : undefined;
  const executionId = acceptedSubmit ? execution?.id : execution?.executionId;
  if (config.isDevnet() && !config.readOnlyApi && config.landingWorkerEnabled && !config.simulateLanding &&
      result.statusCode >= 200 && result.statusCode < 300 && typeof executionId === "string" &&
      ["SUBMITTED", "LANDING"].includes(execution?.status)) {
    waitUntil(processLandingJobsOnce(executionId).catch((error) => {
      console.error("[landing] serverless queue drain failed:", error instanceof Error ? error.message : String(error));
    }));
  }
  res.end(JSON.stringify(result.data));
}
