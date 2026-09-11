/**
 * D1-compatible SQL execution layer.
 *
 * Production : Cloudflare D1 over the HTTP REST API (works on Vercel serverless).
 * Local dev  : Node's built-in `node:sqlite` against a local SQLite file
 *              (same SQL dialect as D1, no native build step required).
 *
 * Both paths expose the exact callback signature used by drizzle-orm/sqlite-proxy.
 */

export type QueryMethod = 'run' | 'all' | 'get' | 'values';
export type RowValues = unknown[];

export interface ProxyResult {
  rows: RowValues[];
}

const D1_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const D1_DATABASE_ID = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
const D1_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH?.trim() || 'database/local.db';

export function isD1Configured(): boolean {
  return Boolean(D1_ACCOUNT_ID && D1_DATABASE_ID && D1_API_TOKEN);
}

export function backendName(): 'd1-rest' | 'local-sqlite' {
  return isD1Configured() ? 'd1-rest' : 'local-sqlite';
}

interface SqliteStatement {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
}

interface SqliteDatabase {
  prepare: (sql: string) => SqliteStatement;
  exec: (sql: string) => void;
}

/**
 * `node:sqlite` is a built-in module available in the local Node runtime. It is
 * resolved at runtime via `process.getBuiltinModule` so it is never evaluated in
 * production (where Cloudflare D1 is used) and so bundlers never try to resolve it.
 */
function loadNodeSqlite(): { DatabaseSync: new (path: string) => SqliteDatabase } {
  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule;
  if (!getBuiltin) {
    throw new Error(
      'node:sqlite is unavailable in this runtime. Configure Cloudflare D1 variables for production.',
    );
  }
  return getBuiltin('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDatabase };
}

let localDbPromise: Promise<SqliteDatabase> | null = null;

async function getLocalDb(): Promise<SqliteDatabase> {
  if (process.env.VERCEL) {
    throw new Error(
      'Cloudflare D1 is not configured for this deployment. Set CLOUDFLARE_ACCOUNT_ID, ' +
        'CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN in the Vercel environment. ' +
        'Local SQLite is development-only.',
    );
  }
  if (!localDbPromise) {
    localDbPromise = (async () => {
      const { DatabaseSync } = loadNodeSqlite();
      const db = new DatabaseSync(LOCAL_DB_PATH);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
      return db;
    })();
  }
  return localDbPromise;
}

interface D1RestResponse {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: unknown;
}

interface D1EndpointResult {
  ok: boolean;
  errorDetail?: string;
  rows: unknown[];
}

function rowsToValues(rows: unknown[]): RowValues[] {
  return rows.map((row) =>
    Array.isArray(row) ? (row as RowValues) : Object.values(row as Record<string, unknown>),
  );
}

async function d1Call(
  endpoint: 'raw' | 'query',
  sql: string,
  params: unknown[],
): Promise<D1EndpointResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => null)) as D1RestResponse | null;
  if (!res.ok || !json || !json.success) {
    const detail = json?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    return { ok: false, errorDetail: detail, rows: [] };
  }

  const first = Array.isArray(json.result) ? json.result[0] : json.result;
  let rows: unknown[] = [];
  if (first && typeof first === 'object' && Array.isArray((first as { results?: unknown }).results)) {
    rows = (first as { results: unknown[] }).results;
  } else if (Array.isArray(first)) {
    rows = first as unknown[];
  }
  return { ok: true, rows };
}

async function d1RestQuery(sql: string, params: unknown[]): Promise<RowValues[]> {
  // The `/raw` endpoint returns rows as arrays of column values, which is exactly
  // the shape drizzle-orm/sqlite-proxy expects. If it is unavailable we fall back
  // to `/query` (rows as objects) and convert.
  const raw = await d1Call('raw', sql, params);
  if (raw.ok) return rowsToValues(raw.rows);

  const fallback = await d1Call('query', sql, params);
  if (!fallback.ok) {
    throw new Error(`Cloudflare D1 request failed: ${fallback.errorDetail}`);
  }
  return rowsToValues(fallback.rows);
}

/**
 * drizzle-orm/sqlite-proxy entry point.
 * sqlite-proxy expects raw column-value arrays for all/values/get.
 */
export async function runQuery(
  sql: string,
  params: unknown[],
  method: QueryMethod,
): Promise<ProxyResult> {
  if (isD1Configured()) {
    return { rows: await d1RestQuery(sql, params) };
  }

  const db = await getLocalDb();
  const stmt = db.prepare(sql);

  const args = params as unknown[];

  if (method === 'run') {
    stmt.run(...args);
    return { rows: [] };
  }

  if (method === 'get') {
    const row = stmt.get(...args);
    return { rows: row ? [Object.values(row)] : [] };
  }

  const rows = stmt.all(...args);
  return { rows: rows.map((r) => Object.values(r)) };
}

/**
 * Direct helper (non-drizzle) used by the migration runner and health check.
 */
export async function execRaw(sql: string, params: unknown[] = []): Promise<RowValues[]> {
  return (await runQuery(sql, params, 'all')).rows;
}
