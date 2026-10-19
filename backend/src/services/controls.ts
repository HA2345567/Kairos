import { config } from "../config";
import { repository } from "../db/repository";
import { AppError } from "../errors";
import { RELAYER_FUNDED_MIN_SOL, relayerService } from "./relayer.service";

/**
 * Trading controls — one place decides whether a money path may proceed
 * (PRD FR-17, X11, NFR-05).
 *
 * Kill switch (FR-17 / X11):
 *   - blocks NEW buys: opens, buy-side rebalances, and retries that buy;
 *   - never blocks close, unwind, sell-only rebalances, or direct withdrawal.
 *
 * Degrade closed (NFR-05):
 *   - a prepare that would buy is refused when relayer or RPC health is
 *     unknown, so an unreachable chain cannot produce a transaction a user
 *     signs and cannot land;
 *   - reads, sells, close, unwind and withdrawal stay available.
 */

export async function isKillSwitchActive(): Promise<boolean> {
  return (await repository.getSetting("global_kill_switch")) === "true";
}

/**
 * Pure decision for the pause rules, so the buy/sell exemption boundary is
 * testable without any chain access.
 */
export function tradingPauseError(paused: boolean, hasBuys: boolean, action: string): AppError | null {
  if (!paused || !hasBuys) return null;
  return new AppError("KILL_SWITCH_ACTIVE", `${action} is halted by the kill switch`, 503);
}

/** Throws KILL_SWITCH_ACTIVE when a paused system would otherwise open new exposure. */
export async function assertTradingOpen(hasBuys: boolean, action: string): Promise<void> {
  const error = tradingPauseError(await isKillSwitchActive(), hasBuys, action);
  if (error) throw error;
}

export interface PrepareHealthOverrides {
  /** Test seam: forces the live/simulation decision instead of reading config. */
  simulate?: boolean;
  /** Test seam: relayer SOL balance; a negative value means "unknown". */
  solBalance?: number;
}

/**
 * Fail-closed prepare health gate (NFR-05). Sell-only work (close, unwind) is
 * never gated: the PRD keeps exits available while trading is degraded.
 */
export async function assertPrepareHealth(
  hasBuys: boolean,
  overrides: PrepareHealthOverrides = {}
): Promise<void> {
  if (!hasBuys) return;

  // Offline control-plane mode (KAIROS_SIMULATE_LANDING) has no validator and
  // makes no live claim; it is a documented test path, not a health signal.
  const simulate = overrides.simulate ?? config.simulateLanding;
  if (simulate) return;

  const balance = overrides.solBalance ?? (await relayerService.getSolBalance());
  if (balance < 0) {
    throw new AppError(
      "ALL_AGGREGATORS_DOWN",
      "RPC/venue health is unknown; new buys are refused until health is confirmed",
      503
    );
  }
  if (balance <= RELAYER_FUNDED_MIN_SOL) {
    throw new AppError(
      "RELAYER_LOW",
      `Relayer SOL balance ${balance} is below the operating floor of ${RELAYER_FUNDED_MIN_SOL} SOL`,
      503
    );
  }
}
