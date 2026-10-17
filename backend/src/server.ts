import { IncomingMessage, ServerResponse, createServer } from "http";
import { URL } from "url";

export interface InjectOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  payload?: any;
  headers?: Record<string, string>;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, string>;
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
  }
) => Promise<any> | any;

interface RouteEntry {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class KairosHttpServer {
  private routes: RouteEntry[] = [];

  private readonly responseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };

  private register(method: string, path: string, handler: RouteHandler) {
    const paramNames: string[] = [];
    const regexPath = path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    const pattern = new RegExp(`^${regexPath}$`);
    this.routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
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

  async handleRequest(
    method: string,
    rawUrl: string,
    body: any,
    headers: Record<string, any> = {}
  ): Promise<{ statusCode: number; data: any; headers: Record<string, string> }> {
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
        headers: this.responseHeaders,
      };
    }

    let statusCode = 200;
    let responseData: any;

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
        headers: this.responseHeaders,
      };
    } catch (err: any) {
      return {
        statusCode: statusCode === 200 ? 500 : statusCode,
        data: { error: err.message || "INTERNAL_SERVER_ERROR" },
        headers: this.responseHeaders,
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
        // CORS Preflight
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token, X-Admin-Approver-Token");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

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
