import { repository } from "../db/repository";
import type { NotificationPreferences } from "../db/schema";

/**
 * FR-18 notification preferences.
 *
 * The outbox stays the exactly-once delivery ledger; preferences decide which
 * *channels* and *event classes* a wallet wants. A preference can suppress a
 * notification for a wallet but can never cause a duplicate, and the ledger row
 * is still written — the PRD's unique `(execution_id, event_type)` contract is
 * about the outbox, not about the user's inbox.
 */

export type NotificationEventClass = "execution" | "rebalance" | "version_publish" | "other";

export function classifyEvent(event: string): NotificationEventClass {
  if (event.startsWith("execution.")) return "execution";
  if (event.startsWith("rebalance.") || event.startsWith("position.")) return "rebalance";
  if (event.startsWith("basket.published") || event.startsWith("version.")) return "version_publish";
  return "other";
}

export function interestedInClass(
  prefs: NotificationPreferences,
  eventClass: NotificationEventClass
): boolean {
  switch (eventClass) {
    case "execution":
      return prefs.executionUpdates;
    case "rebalance":
      return prefs.rebalanceUpdates;
    case "version_publish":
      return prefs.versionPublish;
    default:
      return true;
  }
}

export interface NotificationPreferencesPatch {
  inApp?: boolean;
  email?: boolean;
  push?: boolean;
  executionUpdates?: boolean;
  rebalanceUpdates?: boolean;
  versionPublish?: boolean;
}

export function applyPatch(
  current: NotificationPreferences,
  patch: NotificationPreferencesPatch
): Omit<NotificationPreferences, "updatedAt"> {
  const pick = (value: boolean | undefined, fallback: boolean) => value ?? fallback;
  return {
    walletAddress: current.walletAddress,
    inApp: pick(patch.inApp, current.inApp),
    email: pick(patch.email, current.email),
    push: pick(patch.push, current.push),
    executionUpdates: pick(patch.executionUpdates, current.executionUpdates),
    rebalanceUpdates: pick(patch.rebalanceUpdates, current.rebalanceUpdates),
    versionPublish: pick(patch.versionPublish, current.versionPublish),
  };
}

export async function getPreferences(walletAddress: string): Promise<NotificationPreferences> {
  return repository.getNotificationPreferences(walletAddress);
}

export async function updatePreferences(
  walletAddress: string,
  patch: NotificationPreferencesPatch
): Promise<NotificationPreferences> {
  const current = await repository.getNotificationPreferences(walletAddress);
  return repository.saveNotificationPreferences(applyPatch(current, patch));
}

export const notificationsService = {
  classifyEvent,
  interestedInClass,
  getPreferences,
  updatePreferences,
};

export type { NotificationPreferences };
