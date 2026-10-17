import { pathToFileURL } from "node:url";
import { KairosHttpServer } from "./server";
import { config } from "./config";
import { repository } from "./db/repository"; // module load runs migrations
import { seedDatabase } from "./db/seed";
import { loadDevnetState } from "./chain/devnetState";
import { registerRoutes } from "./routes/api.routes";
import { relayerService } from "./services/relayer.service";
import { startOutboxWorker } from "./workers/outbox";
import { startPriceSnapshotWorker } from "./workers/price-snapshots";

/**
 * Kairos backend entrypoint (plan.md §6 GLUE). Boot order:
 *   migrations (repository import) → devnet-state check → fallback seed →
 *   workers (landing, reconciler, outbox) → HTTP listen.
 *
 * Landing/reconciler workers are imported lazily so a broken worker module
 * fails its own startup guard instead of killing the whole boot.
 */

export function buildApp(): KairosHttpServer {
  const app = new KairosHttpServer();

  app.get("/health", async () => ({
    status: "ok",
    service: "kairos-backend",
    cluster: config.cluster,
    simulateLanding: config.simulateLanding,
    pythFeedsConfigured: Object.keys(config.pythFeeds).length,
    pythIngestionEnabled: Boolean(config.pythApiKey && Object.keys(config.pythFeeds).length),
    killSwitchActive: (await repository.getSetting("global_kill_switch")) === "true",
    devnetInitialized: loadDevnetState() !== null,
    timestamp: new Date().toISOString(),
  }));

  app.get("/healthz", async () => {
    const [sol, funded] = await Promise.all([
      relayerService.getSolBalance().catch(() => -1),
      relayerService.isFunded().catch(() => false),
    ]);
    return {
      status: "ok",
      service: "kairos-backend",
      cluster: config.cluster,
      killSwitchActive: (await repository.getSetting("global_kill_switch")) === "true",
      devnet: { initialized: loadDevnetState() !== null },
      prices: {
        pythEnabled: Boolean(config.pythApiKey && Object.keys(config.pythFeeds).length),
        pythFeedMints: Object.keys(config.pythFeeds).length,
      },
      relayer: { pubkey: relayerService.getPublicKey().toBase58(), solBalance: sol, funded },
      counts: {
        baskets: (await repository.getAllBaskets()).length,
        tokens: (await repository.getAllTokens()).length,
        executions: (await repository.listExecutions(undefined, 1000)).length,
      },
      timestamp: new Date().toISOString(),
    };
  });

  registerRoutes(app);
  return app;
}

async function startWorkers(): Promise<void> {
  startOutboxWorker();
  (await startPriceSnapshotWorker());
  try {
    const { startLandingWorker } = await import("./workers/landing");
    startLandingWorker();
  } catch (err) {
    console.error("[boot] landing worker failed to start:", err);
  }
  try {
    const { startReconciler } = await import("./workers/reconciler");
    (await startReconciler());
  } catch (err) {
    console.error("[boot] reconciler failed to start:", err);
  }
}

export async function start(): Promise<void> {
  const state = loadDevnetState();
  if (config.isDevnet() && !state) {
    console.warn(
      "[boot] backend/data/devnet-state.json missing — run `bun run setup` from backend/ before investing; reads still work."
    );
  }
  (await seedDatabase()); // no-op when devnet-state exists; fallback registry otherwise
  await startWorkers();

  const app = buildApp();
  const address = await app.listen(config.port, config.host);
  console.log(`[Kairos] backend listening on ${address} (cluster=${config.cluster})`);
}

// Direct-run check that works under tsx on Windows (import.meta.main is bun-only).
const invoked = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invoked) {
  start().catch((err) => {
    console.error("[Kairos] fatal boot error:", err);
    process.exit(1);
  });
}
