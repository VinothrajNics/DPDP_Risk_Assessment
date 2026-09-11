/**
 * Very small in-memory rate limiter.
 *
 * Vercel serverless instances are ephemeral, so this is best-effort protection
 * (it resets per instance/cold start). It still meaningfully slows down brute
 * force attempts within a warm instance without adding any dependency or cost.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

export function clientKey(headers: Headers, prefix: string): string {
  const fwd = headers.get('x-forwarded-for') || '';
  const ip = fwd.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
  return `${prefix}:${ip}`;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) buckets.clear();

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
