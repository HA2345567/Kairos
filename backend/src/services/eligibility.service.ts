import { config } from "../config";
import { repository } from "../db/repository";
import { AppError } from "../errors";
import type { User } from "../db/schema";

/**
 * FR-04 / §13.1 eligibility + region gate.
 *
 * The region gate itself runs at the edge (`middleware.geoCheck`, answering
 * REGION_BLOCKED without an aggregator call). This service owns the *account*
 * side that the PRD keeps behind plumbing until mainnet:
 *
 *   - `eligible`         normal path
 *   - `requires_action`  the user must complete the age/ToS attestation
 *   - `restricted`       compliance has blocked this account
 *
 * Money paths call `assertEligibleForWallet`; the check answers
 * ELIGIBILITY_REQUIRED (403) and never reaches quoting. The PRD only requires
 * the plumbing to be activatable, so a fresh SIWS account starts `eligible`
 * and only an explicit compliance action flips it — a devnet demo is not
 * silently blocked by a missing attestation row.
 */

export interface EligibilityView {
  walletAddress: string;
  region: string;
  status: User["eligibilityStatus"];
  ageVerified: boolean;
  regionEligible: boolean;
  /** True when the wallet may prepare/submit money movements right now. */
  eligible: boolean;
  reason: string | null;
}

function view(walletAddress: string, user: User): EligibilityView {
  const regionEligible = !config.restrictedRegions.includes(user.region.toUpperCase());
  const status = user.eligibilityStatus;
  const eligible = status === "eligible" && user.status !== "suspended" && regionEligible;
  return {
    walletAddress,
    region: user.region,
    status,
    ageVerified: user.ageVerified,
    regionEligible,
    eligible,
    reason: eligible
      ? null
      : !regionEligible
        ? "REGION_BLOCKED"
        : status === "restricted"
          ? "ELIGIBILITY_RESTRICTED"
          : status === "requires_action"
            ? "ELIGIBILITY_REQUIRED"
            : "ACCOUNT_SUSPENDED",
  };
}

async function userForWallet(walletAddress: string): Promise<User | undefined> {
  const wallet = await repository.getWalletByAddress(walletAddress);
  if (!wallet) return undefined;
  return repository.getUser(wallet.userId);
}

export async function getEligibility(walletAddress: string): Promise<EligibilityView | null> {
  const user = await userForWallet(walletAddress);
  return user ? view(walletAddress, user) : null;
}

/**
 * Throw ELIGIBILITY_REQUIRED when the account is not allowed to move money.
 * Unknown wallets are left to the session guard, which answers 401 first.
 */
export async function assertEligibleForWallet(walletAddress: string): Promise<void> {
  const eligibility = await getEligibility(walletAddress);
  if (!eligibility) return;
  if (eligibility.eligible) return;
  if (eligibility.reason === "REGION_BLOCKED") {
    throw new AppError("REGION_BLOCKED", "Trading is not available in this region");
  }
  throw new AppError(
    "ELIGIBILITY_REQUIRED",
    "Complete eligibility verification before trading"
  );
}

/** §13.1 age attestation. Recording it does not lift a compliance restriction. */
export async function confirmEligibility(
  walletAddress: string,
  input: { ageConfirmed: boolean; region?: string }
): Promise<EligibilityView | null> {
  const user = await userForWallet(walletAddress);
  if (!user) return null;
  if (!input.ageConfirmed) {
    throw new AppError("ELIGIBILITY_REQUIRED", "An 18+ attestation is required");
  }
  const region = (input.region ?? user.region ?? "unknown").toUpperCase();
  if (config.restrictedRegions.includes(region)) {
    throw new AppError("REGION_BLOCKED", "Trading is not available in this region");
  }
  const nextStatus = user.eligibilityStatus === "restricted" ? "restricted" : "eligible";
  const updated = await repository.updateUserEligibility(user.id, {
    ageVerified: true,
    eligibilityStatus: nextStatus,
    region,
  });
  if (!updated) return null;
  await repository.logAudit({
    actor: walletAddress,
    action: "CONFIRM_ELIGIBILITY",
    entity: "user",
    entityId: user.id,
    before: { ageVerified: user.ageVerified, status: user.eligibilityStatus },
    after: { ageVerified: true, status: nextStatus, region },
  });
  return view(walletAddress, updated);
}

/** Admin/compliance action: activate the gate for a wallet (mainnet readiness). */
export async function setEligibilityStatus(
  walletAddress: string,
  status: User["eligibilityStatus"],
  actor: string
): Promise<EligibilityView | null> {
  const user = await userForWallet(walletAddress);
  if (!user) return null;
  const updated = await repository.updateUserEligibility(user.id, { eligibilityStatus: status });
  if (!updated) return null;
  await repository.logAudit({
    actor,
    action: "SET_ELIGIBILITY_STATUS",
    entity: "user",
    entityId: user.id,
    before: { status: user.eligibilityStatus },
    after: { status },
  });
  return view(walletAddress, updated);
}

export const eligibilityService = {
  getEligibility,
  assertEligibleForWallet,
  confirmEligibility,
  setEligibilityStatus,
};
