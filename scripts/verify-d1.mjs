/**
 * Read-only Cloudflare D1 verification.
 *
 *   node scripts/verify-d1.mjs
 *
 * Uses the same three environment variables as the application and performs
 * SELECT statements only. It never modifies, resets or migrates the database.
 */
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!accountId || !databaseId || !apiToken) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_API_TOKEN.');
  process.exit(1);
}

const mask = (v) => (v.length <= 4 ? '****' : v.slice(0, 3) + '****' + v.slice(-2));

async function query(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params: [] }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    const detail = (json.errors || []).map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return json.result?.[0]?.results ?? [];
}

console.log(`Cloudflare account: ${mask(accountId)}`);
console.log(`D1 database id    : ${mask(databaseId)}`);
console.log('');

const tables = await query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('Tables:');
for (const t of tables) console.log(`  - ${t.name}`);

const expected = ['assessments', 'risk_responses'];
const names = tables.map((t) => t.name);
for (const e of expected) {
  if (!names.includes(e)) {
    console.error(`\nMISSING TABLE: ${e} — run "npm run db:migrate:d1" first.`);
    process.exit(1);
  }
}

console.log('\nRow counts:');
for (const t of ['assessments', 'risk_responses', '_migrations']) {
  if (!names.includes(t)) {
    console.log(`  ${t}: (table not present)`);
    continue;
  }
  const rows = await query(`SELECT COUNT(*) AS c FROM ${t}`);
  console.log(`  ${t}: ${rows[0]?.c ?? 0}`);
}

console.log('\nD1 schema looks good (read-only check, nothing was modified).');
