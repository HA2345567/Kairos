import { KairosHttpServer } from "../server";
import { authService, ACCESS_COOKIE, REFRESH_COOKIE, readCookie } from "../services/auth.service";
import { geoCheck, rateLimit } from "../middleware";
import { AppError } from "../errors";
import { config } from "../config";

/** /v1/auth/* — SIWS nonce/verify + refresh (contracts §12; PRD §4.1). */
export function registerAuthRoutes(app: KairosHttpServer): void {
  const nonceGuard = rateLimit("auth-nonce", { max: 20, windowMs: 60_000 });
  const verifyGuard = rateLimit("auth-verify", { max: 20, windowMs: 60_000 });
  const refreshGuard = rateLimit("auth-refresh", { max: 30, windowMs: 60_000 });

  /**
   * FE-03: sessions live in httpOnly cookies — no key material or token is
   * reachable from `localStorage`/JS. `Secure` is on unless the deployment is a
   * loopback dev origin, and the refresh cookie is scoped to /v1/auth so it is
   * never attached to ordinary API reads.
   */
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : config.cluster !== "devnet";
  const cookieBase = `HttpOnly; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  const sessionCookie = (token: string) =>
    `${ACCESS_COOKIE}=${token}; ${cookieBase}; Max-Age=${config.jwtAccessSec}`;
  const refreshCookie = (token: string) =>
    `${REFRESH_COOKIE}=${token}; ${cookieBase}; Path=/v1/auth; Max-Age=${config.jwtRefreshSec}`;
  const clearCookies = () => [
    `${ACCESS_COOKIE}=; ${cookieBase}; Max-Age=0`,
    `${REFRESH_COOKIE}=; ${cookieBase}; Path=/v1/auth; Max-Age=0`,
  ];
  const issueSession = (
    reply: { header: (name: string, value: string | string[]) => void },
    result: { token: string; refreshToken: string }
  ) => {
    reply.header("Set-Cookie", [sessionCookie(result.token), refreshCookie(result.refreshToken)]);
  };
  const presentedRefreshToken = (req: {
    body?: unknown;
    headers: Record<string, string | string[] | undefined>;
  }): string | undefined => {
    const fromBody = (req.body || {}) as { refreshToken?: string };
    return fromBody.refreshToken || readCookie(req, REFRESH_COOKIE);
  };

  app.post("/v1/auth/nonce", async (req, reply) => {
    if (!geoCheck(req, reply)) return;
    if (!nonceGuard(req, reply)) return;
    const { walletAddress } = (req.body || {}) as { walletAddress?: string };
    if (!walletAddress) return reply.status(400).send({ error: "WALLET_ADDRESS_REQUIRED" });
    try {
      const nonce = await authService.generateNonce(walletAddress);
      return { nonce, expiresInSec: 900 };
    } catch (err) {
      throw new AppError("NONCE_ISSUE_FAILED", (err as Error).message, 500);
    }
  });

  app.post("/v1/auth/verify", async (req, reply) => {
    if (!geoCheck(req, reply)) return;
    if (!verifyGuard(req, reply)) return;
    const { walletAddress, signature, message } = (req.body || {}) as {
      walletAddress?: string;
      signature?: string;
      message?: string;
    };
    if (!walletAddress || !signature || !message) {
      return reply.status(400).send({ error: "MISSING_AUTH_FIELDS" });
    }
    const res = await authService.verify(walletAddress, signature, message);
    if (!res) return reply.status(401).send({ error: "INVALID_SIGNATURE_OR_NONCE" });
    issueSession(reply, res);
    return res;
  });

  /**
   * PRD §4.5 Settings "one-click revoke". Idempotent and non-enumerating: an
   * unknown or already-revoked token still answers 200 with `revoked: false`.
   */
  app.post("/v1/auth/logout", async (req, reply) => {
    if (!refreshGuard(req, reply)) return;
    const refreshToken = presentedRefreshToken(req);
    const revoked = refreshToken ? await authService.revokeSession(refreshToken) : false;
    reply.header("Set-Cookie", clearCookies());
    return { revoked };
  });

  app.post("/v1/auth/refresh", async (req, reply) => {
    if (!refreshGuard(req, reply)) return;
    const refreshToken = presentedRefreshToken(req);
    if (!refreshToken) return reply.status(400).send({ error: "REFRESH_TOKEN_REQUIRED" });
    const res = await authService.refresh(refreshToken);
    if (!res) return reply.status(401).send({ error: "INVALID_REFRESH_TOKEN" });
    issueSession(reply, res);
    return res;
  });

  /** FE-03/Settings: is there a live cookie session, and for which wallet? */
  app.get("/v1/auth/session", async (req, reply) => {
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    return { walletAddress: auth.walletAddress, userId: auth.userId, cookieSession: true };
  });
}
