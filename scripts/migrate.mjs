/**
 * Migration runner.
 *
 *   node scripts/migrate.mjs            # local SQLite (node:sqlite)
 *   node scripts/migrate.mjs --remote   # Cloudflare D1 via REST API
 *
 * Applies every *.sql file in database/migrations in filename order and records
 * what has been applied in the _migrations table.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'database', 'migrations');

const remote = process.argv.includes('--remote');
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const localDbPath = process.env.LOCAL_DB_PATH?.trim() || join(__dirname, '..', 'database', 'local.db');

function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function d1Query(sql, params) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params: params ?? [] }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    const detail = (json.errors || []).map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`D1 request failed: ${detail}`);
  }
  return json.result?.[0]?.results ?? [];
}

async function runRemote() {
  if (!accountId || !databaseId || !apiToken) {
    console.error('Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_API_TOKEN.');
    process.exit(1);
  }
  await d1Query(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)',
  );
  const applied = new Set((await d1Query('SELECT name FROM _migrations')).map((r) => r.name));
  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of splitStatements(sql)) {
      await d1Query(statement);
    }
    await d1Query('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)', [file, new Date().toISOString()]);
    console.log(`applied (remote): ${file}`);
  }
  console.log('Cloudflare D1 migrations up to date.');
}

async function runLocal() {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(localDbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);');
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN;');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
    console.log(`applied (local): ${file}`);
  }
  db.close();
  console.log(`Local database ready at ${localDbPath}`);
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

if (remote) {
  await runRemote();
} else {
  await runLocal();
}
