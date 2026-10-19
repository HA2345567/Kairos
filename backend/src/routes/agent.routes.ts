import { KairosHttpServer } from "../server";
import { simulationService } from "../services/simulation.service";
import { rateLimit } from "../middleware";
import { AppError } from "../errors";
import { composeBasketFromIdea } from "../services/basket-composer.service";

/**
 * /v1/agent/simulate-graph (PRD FR-26, glossary "Simulation").
 *
 * Read-only analytics: accepts a custom allocation and returns a hypothetical
 * series rebased to 1000 plus an honestly-labelled benchmark state. It moves no
 * funds and takes no idempotency key, but it is still rate-limited and mapped
 * through the central error taxonomy.
 */
export function registerAgentRoutes(app: KairosHttpServer): void {
  const readGuard = rateLimit("agent-read", { max: 600, windowMs: 60_000 }); // PRD §10 reads budget
  const composeGuard = rateLimit("agent-compose", { max: 12, windowMs: 60_000 });

  app.post("/v1/agent/compose-basket", async (req, reply) => {
    if (!composeGuard(req, reply)) return;
    const { idea } = (req.body || {}) as { idea?: unknown };
    if (typeof idea !== "string") {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "idea must be a string" });
    }
    try {
      return { draft: await composeBasketFromIdea(idea) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not compose this basket idea.";
      return reply.status(400).send({ error: "INVALID_INPUT", message });
    }
  });

  app.post("/v1/agent/simulate-graph", async (req, reply) => {
    if (!readGuard(req, reply)) return;
    const { allocations, window } = (req.body || {}) as {
      allocations?: Array<{ mint?: string; weightBps?: number }>;
      window?: string;
    };
    if (!Array.isArray(allocations)) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "allocations[] is required" });
    }
    try {
      const result = await simulationService.simulateGraph({
        allocations: allocations.map((allocation) => ({
          mint: String(allocation?.mint ?? ""),
          weightBps: Number(allocation?.weightBps),
        })),
        window,
      });
      return { simulation: result };
    } catch (err) {
      throw AppError.from(err);
    }
  });
}
