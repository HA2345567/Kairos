import dotenv from "dotenv";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { DDL } from "./migrate";

// Resolve backend/.env from this module so root Bun scripts load the same
// database credentials as `bun --cwd backend ...` without leaking secrets.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number | null; affectedRows?: number };
type Connection = { query(sql: string, params?: unknown[]): Promise<QueryResult> };
const transactionContext = new AsyncLocalStorage<Connection>();
const inMemory = process.env.KAIROS_DB_PATH === ":memory:";
const schema = process.env.KAIROS_DB_SCHEMA || "kairos";
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid KAIROS_DB_SCHEMA");
const connectionString = process.env.DATABASE_URL || process.env.NeonDB_DATABASE_URL;
if (!inMemory && !connectionString) throw new Error("DATABASE_URL is required (PostgreSQL).");
const neonPooler = connectionString?.includes("-pooler.") ?? false;
if (!inMemory && neonPooler && schema !== "public") {
  throw new Error("Neon pooled connections require KAIROS_DB_SCHEMA=public; session startup parameters are unsupported.");
}
const pool = inMemory ? null : new Pool({
  connectionString,
  max: 8,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 10_000,
  ...(schema === "public" ? {} : { options: `-c search_path=${schema}` }),
});
const memory = inMemory ? new (await import("@electric-sql/pglite")).PGlite() : null;
const connection: Connection = memory || pool!;

// Migrate under a transaction lock so simultaneous application starts are safe.
async function initialize(): Promise<void> {
  if (memory) { await memory.exec(DDL); return; }
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`kairos:migrate:${schema}`]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(DDL);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
await initialize();

function bindings(sql: string): string {
  let index = 0;
  // Leave quoted literals untouched while translating repository placeholders.
  return sql.replace(/'(?:''|[^'])*'|\?/g, (token) => token === "?" ? `$${++index}` : token);
}
async function query(sql: string, params: unknown[]): Promise<QueryResult> {
  return (transactionContext.getStore() || connection).query(bindings(sql), params.map(value =>
    value === undefined ? null : typeof value === "boolean" ? Number(value) : value));
}
export async function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await query(sql, params)).rows as T[];
}
export async function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}
export async function run(sql: string, ...params: unknown[]): Promise<number> {
  const result = await query(sql, params);
  return result.rowCount ?? result.affectedRows ?? 0;
}
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) return fn();
  if (memory) return memory.transaction(client => transactionContext.run(client, fn));
  const client: PoolClient = await pool!.connect();
  try {
    await client.query("BEGIN");
    const result = await transactionContext.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
export async function closeDatabase(): Promise<void> {
  await pool?.end();
  await memory?.close();
}
