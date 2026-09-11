/**
 * Deletes the local SQLite database (and its WAL files) then re-applies all
 * migrations, giving a clean local database.
 *
 *   node scripts/reset.mjs
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.env.LOCAL_DB_PATH?.trim() || join(__dirname, '..', 'database', 'local.db');
const full = resolve(base);

for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(full + suffix, { force: true });
  } catch {
    /* ignore */
  }
}
console.log(`Removed local database: ${full}`);

await import('./migrate.mjs');
