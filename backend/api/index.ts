import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/index";

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
  res.end(JSON.stringify(result.data));
}
