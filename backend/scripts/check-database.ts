// Import applies the same transactional migrations used at application startup.
import { all, closeDatabase } from "../src/db/postgres";

try {
  const columns = await all<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()"
  );
  const existing = new Set(columns.map(row => `${row.table_name}.${row.column_name}`));
  const required = [
    "executions.base_execution_id", "executions.last_valid_block_height",
    "executions.recovery_action", "execution_recoveries.execution_id",
    "execution_legs.side", "execution_legs.input_base_units", "execution_legs.receipt_json",
    "jobs.lease_until_ms", "outbox.dedupe_key",
  ];
  const missing = required.filter(column => !existing.has(column));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
  console.log(`Database connection and migrations passed (${required.length} recovery columns checked).`);
} finally {
  await closeDatabase();
}
