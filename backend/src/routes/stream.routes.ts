import { KairosHttpServer } from "../server";
import { config } from "../config";
import { repository } from "../db/repository";
import { authService } from "../services/auth.service";
import { rateLimit } from "../middleware";
import {
  executionResource,
  positionResource,
  priceResource,
  readEvents,
  SCHEMA_VERSION,
} from "../services/event-stream";
import { loadDevnetState } from "../chain/devnetState";
import { notificationsService } from "../services/notifications.service";

/**
 * /v1/config, /v1/notifications, /v1/stream/*.
 *
 * - `/v1/config` removes the frontend's hardcoded devnet USDC mint and gives it
 *   the authoritative cluster so it can detect a wallet pointed elsewhere.
 * - `/v1/notifications` is the read surface for the FR-18 outbox.
 * - `/v1/stream/*` serves the PRD §10 stream *contract* over HTTP polling
 *   (schema_version + monotonic seq + resyncRequired). See
 *   `services/event-stream.ts` for the transport deviation note.
 */

export function registerStreamRoutes(app: KairosHttpServer): void {
  const readGuard = rateLimit("stream-read", { max: 600, windowMs: 60_000 });

  app.get("/v1/config", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const state = loadDevnetState();
    return {
      schemaVersion: SCHEMA_VERSION,
      cluster: config.cluster,
      devnetInitialized: state !== null,
      usdcMint: state?.usdc.mint ?? null,
      usdcDecimals: state?.usdc.decimals ?? null,
      platformFeeBps: config.platformFeeBps,
      rebalanceFeeBps: config.rebalanceFeeBps,
      minBasketUsdc: config.minBasketUsdc,
      dustThresholdUsdc: config.dustThresholdUsdc,
      quoteValiditySec: config.quoteValiditySec,
      simulateLanding: config.simulateLanding,
      swapBuilder: config.swapBuilder,
    };
  });

  app.get("/v1/notifications", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const { walletAddress, limit } = req.query as { walletAddress?: string; limit?: string };
    if (walletAddress && walletAddress !== auth.walletAddress) {
      return reply.status(403).send({ error: "WALLET_SESSION_MISMATCH" });
    }
    const notifications = (await repository.listNotificationsForWallet(
      auth.walletAddress,
      limit ? Number(limit) : 100
    ));
    return { notifications, deliveredOnly: true };
  });

  /**
   * FR-18 preferences: delivery channels and event classes per wallet. Defaults
   * are in-app on, email/push off; an explicit write registers exactly what the
   * Settings page shows.
   */
  app.get("/v1/notifications/preferences", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    return { preferences: await notificationsService.getPreferences(auth.walletAddress) };
  });

  app.put("/v1/notifications/preferences", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const body = (req.body || {}) as Record<string, unknown>;
    const patch: Record<string, boolean> = {};
    for (const key of [
      "inApp",
      "email",
      "push",
      "executionUpdates",
      "rebalanceUpdates",
      "versionPublish",
    ] as const) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== "boolean") {
          return reply.status(400).send({ error: "INVALID_INPUT", message: `${key} must be a boolean` });
        }
        patch[key] = body[key] as boolean;
      }
    }
    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "No preference fields supplied" });
    }
    const preferences = await notificationsService.updatePreferences(auth.walletAddress, patch);
    return { preferences };
  });

  app.get("/v1/stream/executions/:id", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const execution = (await repository.getExecution(req.params.id));
    if (!execution) return reply.status(404).send({ error: "EXECUTION_NOT_FOUND" });
    if (execution.walletAddress !== auth.walletAddress) {
      return reply.status(403).send({ error: "EXECUTION_NOT_OWNED_BY_WALLET" });
    }
    const afterSeq = Number((req.query as { afterSeq?: string }).afterSeq) || 0;
    return readEvents(executionResource(req.params.id), afterSeq);
  });

  app.get("/v1/stream/positions/:id", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const position = (await repository.getPosition(req.params.id));
    if (!position) return reply.status(404).send({ error: "POSITION_NOT_FOUND" });
    if (position.walletAddress !== auth.walletAddress) {
      return reply.status(403).send({ error: "POSITION_NOT_OWNED_BY_WALLET" });
    }
    const afterSeq = Number((req.query as { afterSeq?: string }).afterSeq) || 0;
    return readEvents(positionResource(req.params.id), afterSeq);
  });

  // Price snapshots are public market data; they carry no wallet information.
  app.get("/v1/stream/prices/:mint", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const afterSeq = Number((req.query as { afterSeq?: string }).afterSeq) || 0;
    return readEvents(priceResource(req.params.mint), afterSeq);
  });
}
