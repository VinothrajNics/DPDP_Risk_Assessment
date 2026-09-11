import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Admin authentication.
 *
 * Both values MUST be provided through server-side environment variables.
 * There is deliberately no hardcoded fallback: if ADMIN_PASSWORD or
 * ADMIN_SESSION_SECRET is missing, admin authentication is disabled rather than
 * falling back to a known/default secret.
 */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() ?? '';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const ADMIN_COOKIE = 'dpdp_admin';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(data: string): string {
  return createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True only when both required admin secrets are configured server-side. */
export function adminAuthConfigured(): boolean {
  return ADMIN_PASSWORD.length > 0 && SESSION_SECRET.length > 0;
}

export function checkAdminPassword(password: string): boolean {
  if (!adminAuthConfigured()) return false;
  return safeEqual(password, ADMIN_PASSWORD);
}

export function createAdminToken(): string {
  if (!adminAuthConfigured()) throw new Error('Admin authentication is not configured');
  const payload = base64url(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  return `${payload}.${hmac(payload)}`;
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!adminAuthConfigured()) return false;
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = hmac(payload);
  if (!safeEqual(signature, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp: number };
    return typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function adminCookieHeader(token: string, secure: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secureFlag = secure ? '; Secure' : '';
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Max-Age=${maxAge}`;
}

export function adminCookieClearHeader(secure: boolean): string {
  const secureFlag = secure ? '; Secure' : '';
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Max-Age=0`;
}
