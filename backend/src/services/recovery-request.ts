import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { Execution } from "../db/schema";
import { repository } from "../db/repository";
import { getRecovery, type RecoveryAction } from "../db/recovery";
import { withFailover } from "../chain/connection";
import { config } from "../config";
import { AppError } from "../errors";

export async function recoveryRequest(
  source: Execution, key: string, action: RecoveryAction
): Promise<{ existing?: Execution; replaceId?: string }> {
  const replay = await repository.getExecutionByIdempotency(key, source.walletAddress);
  if (replay) {
    if (replay.baseExecutionId !== source.id || replay.recoveryAction !== action) {
      throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key belongs to a different recovery", 409);
    }
    return { existing: replay };
  }
  const current = await getRecovery(source.id, action);
  if (!current) return {};
  if (!["PREPARED", "EXPIRED"].includes(current.status) || Date.parse(current.expiresAt) > Date.now()) {
    return { existing: current };
  }
  await assertRecoveryExpired(current);
  return { replaceId: current.id };
}

/** UI quote expiry does not invalidate signed bytes. Verify chain expiry first. */
export async function assertRecoveryExpired(execution: Execution): Promise<void> {
  if (config.simulateLanding) return;
  if (!execution.lastValidBlockHeight || execution.preparedTxs.length !== execution.legs.length || !execution.legs.length) {
    throw new AppError("RECOVERY_METADATA_MISSING", "Cannot verify the previous recovery's chain expiry", 409);
  }
  const signatures = execution.preparedTxs.map(raw => {
    const tx = VersionedTransaction.deserialize(Buffer.from(raw, "base64"));
    const signature = tx.signatures[0];
    if (!signature || signature.every(byte => byte === 0)) {
      throw new AppError("RECOVERY_METADATA_MISSING", "Previous recovery has no known transaction signature", 409);
    }
    return bs58.encode(signature);
  });
  const proof = await withFailover(async connection => {
    const height = await connection.getBlockHeight("finalized");
    const statuses = await connection.getSignatureStatuses(signatures, { searchTransactionHistory: true });
    return { height, statuses: statuses.value };
  });
  // Failover handles transport errors only. A known outcome must never be
  // overridden by a second provider whose history index is behind.
  if (proof.height <= execution.lastValidBlockHeight) {
    throw new AppError("RECOVERY_STILL_VALID", "Previous signed transactions are still valid; wait before refreshing", 409);
  }
  if (proof.statuses.length !== signatures.length || proof.statuses.some(status => status !== null)) {
    throw new AppError("RECOVERY_ALREADY_BROADCAST", "Previous recovery has a chain outcome; reconcile it before refreshing", 409);
  }
}
