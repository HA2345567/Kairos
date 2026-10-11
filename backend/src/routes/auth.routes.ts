import { KairosHttpServer } from "../server";
import { authService } from "../services/auth.service";
import { geoCheck, rateLimit } from "../middleware";
import { AppError } from "../errors";

/** /v1/auth/* — SIWS nonce/verify + refresh (contracts §12; PRD §4.1). */
export function registerAuthRoutes(app: KairosHttpServer): void {
  const nonceGuard = rateLimit("auth-nonce", { max: 20, windowMs: 60_000 });
  const verifyGuard = rateLimit("auth-verify", { max: 20, windowMs: 60_000 });
  const refreshGuard = rateLimit("auth-refresh", { max: 30, windowMs: 60_000 });

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
    return res;
  });

  app.post("/v1/auth/refresh", async (req, reply) => {
    if (!refreshGuard(req, reply)) return;
    const { refreshToken } = (req.body || {}) as { refreshToken?: string };
    if (!refreshToken) return reply.status(400).send({ error: "REFRESH_TOKEN_REQUIRED" });
    const res = await authService.refresh(refreshToken);
    if (!res) return reply.status(401).send({ error: "INVALID_REFRESH_TOKEN" });
    return res;
  });
}
