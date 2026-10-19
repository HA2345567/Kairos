import { config } from "../config";
import { repository } from "../db/repository";

/**
 * NFR-10 data retention + NFR-12 privacy.
 *
 * One bounded, idempotent sweep:
 *   - expired login nonces and expired/revoked refresh tokens (PII-adjacent);
 *   - analytics rows older than 30 days (they carry only a hashed session id);
 *   - audit-log rows older than the configured window (default 7 years, the
 *     counsel note in §11 NFR-10).
 *
 * The sweep is safe to run repeatedly and reports what it removed so a drill
 * has evidence rather than a claim.
 */

export const ANALYTICS_RETENTION_DAYS = 30;

export interface RetentionReport {
  ranAt: string;
  noncesPurged: number;
  refreshTokensPurged: number;
  analyticsPurged: number;
  auditPurged: number;
  windows: { analyticsDays: number; auditDays: number };
}

export async function runRetentionSweep(now = Date.now()): Promise<RetentionReport> {
  const analyticsCutoff = new Date(now - ANALYTICS_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const auditCutoff = new Date(now - config.auditRetentionDays * 24 * 3600 * 1000).toISOString();

  const [noncesPurged, refreshTokensPurged, analyticsPurged, auditPurged] = await Promise.all([
    repository.purgeExpiredNonces(now),
    repository.purgeExpiredRefreshTokens(now),
    repository.purgeAnalyticsBefore(analyticsCutoff),
    repository.purgeAuditBefore(auditCutoff),
  ]);

  const report: RetentionReport = {
    ranAt: new Date(now).toISOString(),
    noncesPurged,
    refreshTokensPurged,
    analyticsPurged,
    auditPurged,
    windows: { analyticsDays: ANALYTICS_RETENTION_DAYS, auditDays: config.auditRetentionDays },
  };
  await repository.logAudit({
    actor: "system",
    action: "RETENTION_SWEEP",
    entity: "system",
    entityId: "retention",
    after: report,
  });
  return report;
}

export const retentionService = { runRetentionSweep, ANALYTICS_RETENTION_DAYS };
