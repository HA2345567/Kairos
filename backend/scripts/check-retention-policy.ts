/**
 * NFR-10 / NFR-12 retention policy check — safe to run in CI.
 *
 * Verifies the retention constants and configuration invariants the PRD
 * requires, without touching a database:
 *   - analytics/PII rows expire within 30 days of user deletion (§11 NFR-10);
 *   - the audit-log window is at least 7 years (2555 days) per the counsel note;
 *   - a retention sweep exists and is reachable from the admin surface.
 *
 * Exit codes: 0 = policy holds, 1 = a policy invariant is violated.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config";
import { ANALYTICS_RETENTION_DAYS } from "../src/services/retention.service";

const MIN_AUDIT_RETENTION_DAYS = 2555; // 7 years
const MAX_ANALYTICS_RETENTION_DAYS = 30;

const failures: string[] = [];

if (ANALYTICS_RETENTION_DAYS > MAX_ANALYTICS_RETENTION_DAYS) {
  failures.push(
    `analytics retention is ${ANALYTICS_RETENTION_DAYS} days, must be ≤ ${MAX_ANALYTICS_RETENTION_DAYS}`
  );
}
if (config.auditRetentionDays < MIN_AUDIT_RETENTION_DAYS) {
  failures.push(
    `audit retention is ${config.auditRetentionDays} days, must be ≥ ${MIN_AUDIT_RETENTION_DAYS} (7 years)`
  );
}

// The sweep + its admin trigger must exist in the tree, not only in a comment.
const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoutes = readFileSync(path.resolve(here, "../src/routes/admin.routes.ts"), "utf8");
if (!adminRoutes.includes("/v1/admin/retention/run")) {
  failures.push("admin retention trigger /v1/admin/retention/run is missing");
}
const retentionService = readFileSync(
  path.resolve(here, "../src/services/retention.service.ts"),
  "utf8"
);
for (const purge of ["purgeExpiredNonces", "purgeExpiredRefreshTokens", "purgeAnalyticsBefore", "purgeAuditBefore"]) {
  if (!retentionService.includes(purge)) failures.push(`retention sweep is missing ${purge}`);
}

if (failures.length > 0) {
  console.error("[retention-policy] FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("[retention-policy] PASS");
console.log(`  analytics retention: ${ANALYTICS_RETENTION_DAYS} days (≤ 30)`);
console.log(`  audit retention:     ${config.auditRetentionDays} days (≥ 2555)`);
console.log("  sweep + admin trigger present");
