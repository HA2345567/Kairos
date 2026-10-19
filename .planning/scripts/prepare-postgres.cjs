const fs = require('node:fs');
const root = process.cwd();
const file = (p) => `${root}/${p}`;
let migrate = fs.readFileSync(file('backend/src/db/migrate.ts'), 'utf8');
let ddl = migrate.slice(migrate.indexOf('const DDL = `'), migrate.indexOf('export function applyMigrations'));
ddl = ddl.replace('const DDL', 'export const DDL')
  .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGSERIAL PRIMARY KEY')
  .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
  .replace(/((?:expires_at_ms|run_at_ms)\s+)INTEGER/g, '$1BIGINT')
  .replace(/CREATE TABLE IF NOT EXISTS (\w+) \(/g, '$&\n  rowid BIGSERIAL UNIQUE,');
fs.writeFileSync(file('backend/src/db/migrate.ts'), '// PostgreSQL schema. Versioned additions must use idempotent ALTER statements.\n' + ddl);
let repo = fs.readFileSync(file('backend/src/db/repository.ts'), 'utf8');
repo = repo.replace('import type { StatementSync } from "node:sqlite";\n', '');
repo = repo.replace(/import \{ db, migrate \} from "\.\/sqlite";[\s\S]*?\/\/ ---- row mappers ----/, 'import { all, one, run, tx } from "./postgres";\n\ntype Row = Record<string, unknown>;\n\n// ---- row mappers ----');
fs.writeFileSync(file('backend/src/db/repository.ts'), repo);
console.log('Prepared PostgreSQL schema and repository query imports.');
