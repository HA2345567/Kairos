import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "./migrate";

// Single module-level SQLite connection (node:sqlite, synchronous).
// Default location: backend/data/kairos.db (directory auto-created, gitignored).
// Overrides:
//   KAIROS_DB_PATH=/abs/path.db  -> custom file location
//   KAIROS_DB_PATH=:memory:      -> in-memory DB (tests)

let connection: DatabaseSync | null = null;

const moduleDir = path.dirname(fileURLToPath(import.meta.url)); // backend/src/db

export function resolveDbPath(): string {
  const override = process.env.KAIROS_DB_PATH;
  if (override === ":memory:") return ":memory:";
  if (override && override.length > 0) return path.resolve(override);
  return path.join(path.resolve(moduleDir, "..", "..", "data"), "kairos.db");
}

function openDb(): DatabaseSync {
  const dbPath = resolveDbPath();
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const conn = new DatabaseSync(dbPath);
  conn.exec("PRAGMA journal_mode = WAL;");
  conn.exec("PRAGMA synchronous = NORMAL;");
  conn.exec("PRAGMA foreign_keys = ON;");
  conn.exec("PRAGMA busy_timeout = 5000;");
  return conn;
}

export function getDb(): DatabaseSync {
  if (!connection) connection = openDb();
  return connection;
}

// `db` opens lazily: the Proxy forwards member access to the real connection,
// which is created on first use.
export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const conn = getDb() as unknown as Record<string | symbol, unknown>;
    const value = conn[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(conn);
    }
    return value;
  },
  has(_target, prop) {
    return prop in (getDb() as unknown as object);
  },
});

// Runs the idempotent DDL from db/migrate.ts. Called once at repository module
// load (contracts.md §1).
export function migrate(): void {
  applyMigrations(getDb());
}
