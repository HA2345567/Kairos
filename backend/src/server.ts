import { IncomingMessage, ServerResponse, createServer } from "http";
import { URL } from "url";
import { recordRequest, newRequestId, logger } from "./observability";
import { config } from "./config";
import { AppError } from "./errors";

export interface InjectOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  payload?: any;
  headers?: Record<string, string>;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  json: () => any;
  text: () => string;
}

export type RouteHandler = (
  req: {
    params: Record<string, string>;
    query: Record<string, string>;
    body: any;
    headers: Record<string, string | string[] | undefined>;
  },
  reply: {
    status: (code: number) => { send: (data: any) => any };
    send: (data: any) => any;
    /** FE-03: httpOnly session cookies need a header escape hatch. */
    header: (name: string, value: string | string[]) => void;
  }
) => Promise<any> | any;

interface RouteEntry {
  method: string;
  path: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

// These endpoints only establish a wallet session or persist Labs community
// data. They do not enqueue, sign, or submit any on-chain execution.
const READ_ONLY_SAFE_WRITES = new Set([
  "POST /v1/auth/nonce",
  "POST /v1/auth/verify",
  "POST /v1/auth/refresh",
  "POST /v1/auth/logout",
  "POST /v1/labs/baskets",
  "POST /v1/labs/baskets/:slug/vote",
  "DELETE /v1/labs/baskets/:slug/vote",
  "POST /v1/labs/baskets/:slug/comments",
  "POST /v1/agent/simulate-graph",
]);

/** Route patterns are logged instead of concrete URLs: ids and wallets are not
 *  log fields, and a matched pattern is what a metric should be keyed by. */

export class KairosHttpServer {
  private routes: RouteEntry[] = [];

  /**
   * FE-04 / T10: CORS is pinned to the configured origins (never `*`), and the
   * allowed origin is echoed with credentials so an httpOnly session cookie can
   * actually be sent. Requests from unknown origins receive no CORS grant at
   * all — the browser then blocks the response, which is the intended default.
   */
  private readonly securityHeaders = {
    "Content-Type": "application/json",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };

  private corsHeaders(requestHeaders: Record<string, any> = {}): Record<string, string> {
    const raw = requestHeaders["origin"] ?? requestHeaders["Origin"];
    const origin = typeof raw === "string" ? raw.replace(/\/$/, "") : "";
    if (!origin || !config.corsOrigins.includes(origin)) return {};
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Idempotency-Key, X-Admin-Token, X-Admin-Approver-Token, X-Region, X-Request-Id, X-Analytics-Session",
      "Access-Control-Expose-Headers": "X-Request-Id, Idempotency-Key, Retry-After",
      Vary: "Origin",
    };
  }

  private headersFor(requestHeaders: Record<string, any> = {}): Record<string, string | string[]> {
    return { ...this.securityHeaders, ...this.corsHeaders(requestHeaders) };
  }

  private register(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const regexPath = path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    const pattern = new RegExp(`^${regexPath}$`);
    this.routes.push({ method: method.toUpperCase(), path, pattern, paramNames, handler });
  }

  get(path: string, handler: RouteHandler) {
    this.register("GET", path, handler);
  }

  post(path: string, handler: RouteHandler) {
    this.register("POST", path, handler);
  }

  put(path: string, handler: RouteHandler) {
    this.register("PUT", path, handler);
  }

  delete(path: string, handler: RouteHandler) {
    this.register("DELETE", path, handler);
  }

  /**
   * Timing, structured logging and metrics wrapper (NFR-02, NFR-09). The
   * dispatch path keeps its historical return shape; instrumentation is added
   * here so no handler has to care about it.
   */
  async handleRequest(
    method: string,
    rawUrl: string,
    body: any,
    headers: Record<string, any> = {}
  ): Promise<{ statusCode: number; data: any; headers: Record<string, string | string[]> }> {
    const started = performance.now();
    const incomingRequestId = headers["x-request-id"];
    const requestId =
      typeof incomingRequestId === "string" && incomingRequestId ? incomingRequestId : newRequestId();
    let route = "unmatched";
    try {
      const res = await this.dispatch(method, rawUrl, body, headers, (matched) => {
        route = matched;
      });
      const durationMs = Number((performance.now() - started).toFixed(2));
      recordRequest(method, route, res.statusCode, durationMs);
      const log = res.statusCode >= 500 ? logger.error : res.statusCode >= 400 ? logger.warn : logger.info;
      log("http_request", {
        request_id: requestId,
        method: method.toUpperCase(),
        route,
        status: res.statusCode,
        duration_ms: durationMs,
      });
      return { ...res, headers: { ...res.headers, "X-Request-Id": requestId } };
    } catch (err) {
      const durationMs = Number((performance.now() - started).toFixed(2));
      recordRequest(method, route, 500, durationMs);
      logger.error("http_request_unhandled", {
        request_id: requestId,
        method: method.toUpperCase(),
        route,
        duration_ms: durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async dispatch(
    method: string,
    rawUrl: string,
    body: any,
    headers: Record<string, any>,
    onMatch: (route: string) => void
  ): Promise<{ statusCode: number; data: any; headers: Record<string, string | string[]> }> {
    const parsedUrl = new URL(rawUrl, "http://localhost");
    const pathname = parsedUrl.pathname;
    const query: Record<string, string> = {};
    parsedUrl.searchParams.forEach((v, k) => (query[k] = v));

    let matchedRoute: RouteEntry | undefined;
    let matchedParams: Record<string, string> = {};

    for (const r of this.routes) {
      if (r.method === method.toUpperCase()) {
        const match = pathname.match(r.pattern);
        if (match) {
          matchedRoute = r;
          onMatch(r.path);
          r.paramNames.forEach((name, idx) => {
            matchedParams[name] = match[idx + 1];
          });
          break;
        }
      }
    }

    if (!matchedRoute) {
      return {
        statusCode: 404,
        data: { error: "NOT_FOUND", path: pathname },
        headers: this.headersFor(headers),
      };
    }

    const mutationKey = `${method.toUpperCase()} ${pathname}`;
    const mutationRouteKey = `${method.toUpperCase()} ${matchedRoute.path}`;
    if (
      config.readOnlyApi &&
      !["GET", "HEAD"].includes(method.toUpperCase()) &&
      !READ_ONLY_SAFE_WRITES.has(mutationKey) &&
      !READ_ONLY_SAFE_WRITES.has(mutationRouteKey)
    ) {
      return {
        statusCode: 503,
        data: {
          error: "READ_ONLY_MODE",
          message: "This backend is in read-only mode; this operation is disabled.",
        },
        headers: this.headersFor(headers),
      };
    }

    let statusCode = 200;
    let responseData: any;
    const extraHeaders: Record<string, string | string[]> = {};

    const reply = {
      status: (code: number) => ({
        send: (data: any) => {
          statusCode = code;
          responseData = data;
          return data;
        },
      }),
      send: (data: any) => {
        responseData = data;
        return data;
      },
      header: (name: string, value: string | string[]) => {
        extraHeaders[name] = value;
      },
    };

    try {
      const res = await matchedRoute.handler(
        {
          params: matchedParams,
          query,
          body,
          headers,
        },
        reply
      );
      if (responseData === undefined) {
        responseData = res;
      }
      return {
        statusCode,
        data: responseData,
        headers: { ...this.headersFor(headers), ...extraHeaders },
      };
    } catch (err: any) {
      const appError = AppError.from(err);
      return {
        statusCode: appError.status ?? (statusCode === 200 ? 500 : statusCode),
        data: { error: appError.code, message: appError.message },
        headers: { ...this.headersFor(headers), ...extraHeaders },
      };
    }
  }

  async inject(opts: InjectOptions): Promise<InjectResponse> {
    const res = await this.handleRequest(
      opts.method,
      opts.url,
      opts.payload,
      opts.headers || {}
    );

    return {
      statusCode: res.statusCode,
      headers: res.headers,
      json: () => res.data,
      text: () => JSON.stringify(res.data),
    };
  }

  listen(port: number, host = "0.0.0.0"): Promise<string> {
    return new Promise((resolve) => {
      const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        // CORS is pinned per request origin (FE-04); there is no wildcard.
        const cors = this.corsHeaders(req.headers as Record<string, any>);
        for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        // NFR-11: the API serves JSON only, so it needs no resource origins at
        // all. The SPA's own policy is declared at the edge (frontend/vercel.json).
        res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        let body: any = null;
        if (req.method !== "GET" && req.method !== "HEAD") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          const raw = Buffer.concat(chunks).toString("utf-8");
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
        }

        const out = await this.handleRequest(
          req.method || "GET",
          req.url || "/",
          body,
          req.headers
        );

        res.writeHead(out.statusCode, out.headers);
        res.end(JSON.stringify(out.data));
      });

      server.listen(port, host, () => {
        resolve(`http://${host}:${port}`);
      });
    });
  }
}
