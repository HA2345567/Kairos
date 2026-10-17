import type { Execution } from "./schema";
import { repository } from "./repository";
import { one, run } from "./postgres";
import { AppError } from "../errors";

export type RecoveryAction = NonNullable<Execution["recoveryAction"]>;

export async function getRecovery(baseId: string, action: RecoveryAction): Promise<Execution | undefined> {
  const row = await one<{ execution_id: string }>(
    "SELECT execution_id FROM execution_recoveries WHERE base_execution_id = ? AND action = ?", baseId, action
  );
  if (row) return repository.getExecution(row.execution_id);
  // Never silently create a second branch beside an older untracked recovery.
  const legacy = await one("SELECT id FROM executions WHERE base_execution_id = ? AND recovery_action IS NULL LIMIT 1", baseId);
  if (legacy) throw new AppError("RECOVERY_METADATA_MISSING", "An older recovery exists; review its execution history", 409);
}

/** A source row lock serializes competing keys; all writes share its transaction. */
export async function saveRecovery(candidate: Execution, replaceId?: string): Promise<Execution> {
  if (!candidate.baseExecutionId || !candidate.recoveryAction) throw new Error("RECOVERY_SOURCE_REQUIRED");
  const action = candidate.recoveryAction;
  return repository.withExecutionLock(candidate.baseExecutionId, async source => {
    if (candidate.walletAddress !== source.walletAddress || candidate.basketId !== source.basketId) {
      throw new AppError("UNAUTHORIZED", "Recovery source does not match the wallet and basket", 403);
    }
    if (!["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "EXPIRED"].includes(source.status)) {
      throw new AppError("EXECUTION_STILL_PENDING", "Source execution is not settled", 409);
    }
    const current = await getRecovery(source.id, action);
    if (current) {
      if (current.id !== replaceId) return current;
      const replaceable = await repository.withExecutionLock(current.id, async locked => {
        if (!["PREPARED", "EXPIRED"].includes(locked.status) || Date.parse(locked.expiresAt) > Date.now()) return false;
        await repository.updateExecutionStatus(locked.id, "EXPIRED");
        return true;
      });
      if (!replaceable) return (await repository.getExecution(current.id))!;
    }
    const replay = await repository.getExecutionByIdempotency(candidate.idempotencyKey, candidate.walletAddress);
    if (replay) {
      if (replay.baseExecutionId !== source.id || replay.recoveryAction !== candidate.recoveryAction) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key belongs to a different recovery", 409);
      }
      return replay;
    }
    await repository.saveExecution(candidate);
    await run(
      `INSERT INTO execution_recoveries (base_execution_id, action, execution_id) VALUES (?, ?, ?)
       ON CONFLICT (base_execution_id, action) DO UPDATE SET execution_id = excluded.execution_id`,
      source.id, candidate.recoveryAction, candidate.id
    );
    await repository.logAudit({
      actor: candidate.walletAddress, action: `PREPARE_RECOVERY_${action.toUpperCase()}`,
      entity: "execution", entityId: candidate.id,
      after: { baseExecutionId: source.id, replacedExecutionId: replaceId, legs: candidate.legs.length },
    });
    return candidate;
  });
}
