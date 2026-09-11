import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  ADMIN_COOKIE,
  adminAuthConfigured,
  adminCookieClearHeader,
  adminCookieHeader,
  checkAdminPassword,
  createAdminToken,
  verifyAdminToken,
} from './auth';
import {
  answersToMap,
  assessmentIdentityStatus,
  createAssessment,
  getAdminList,
  getAssessmentById,
  getAssessmentDetail,
  getResponses,
  saveResponses,
  submitAssessment,
} from './store';
import { backendName, execRaw } from '@/lib/db';
import { clientKey, rateLimit } from './rate-limit';
import { computeDomainScores, overallScore, ratingFor } from '@/lib/riskQuestions';

export const app = new Hono();

app.onError((err, c) => {
  console.error('[api] error', err);
  const message = err instanceof Error ? err.message : '';
  if (message.startsWith('Cloudflare D1')) {
    return c.json({ error: 'Database unavailable', detail: message }, 503);
  }
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

/* ------------------------------- helpers ------------------------------- */

function isAdmin(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const bearer = c.req.header('authorization');
  if (bearer?.startsWith('Bearer ')) {
    if (verifyAdminToken(bearer.slice(7))) return true;
  }
  return false;
}

function isAdminRequest(c: any): boolean {
  return isAdmin(c) || verifyAdminToken(getCookie(c, ADMIN_COOKIE));
}

function participantToken(c: any): string {
  return c.req.header('x-assessment-token') || '';
}

/** Admin cookies are marked Secure when the request is served over HTTPS. */
function isSecureRequest(c: any): boolean {
  if (process.env.VERCEL) return true;
  try {
    const proto = c.req.header('x-forwarded-proto');
    if (proto) return proto.split(',')[0].trim() === 'https';
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A participant may only read/write the assessment whose session_id matches the
 * capability token they hold. Admins may access any assessment.
 */
async function authorizeAssessment(c: any, id: string) {
  const assessment = await getAssessmentById(id);
  if (!assessment) return { ok: false as const, status: 404, error: 'Assessment not found' };
  if (isAdminRequest(c)) return { ok: true as const, assessment, isAdmin: true };
  const token = participantToken(c);
  if (!token || token !== assessment.sessionId) {
    return { ok: false as const, status: 403, error: 'Forbidden' };
  }
  return { ok: true as const, assessment, isAdmin: false };
}

/* ------------------------------- health -------------------------------- */

app.get('/api/health', async (c) => {
  const base = { backend: backendName(), time: new Date().toISOString() };
  try {
    await execRaw('SELECT 1 AS ok');
    return c.json({ ...base, ok: true, db: 'ok' as const });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Database probe failed';
    return c.json({ ...base, ok: false, db: 'error' as const, dbError: detail }, 500);
  }
});

/* --------------------------- participant flow -------------------------- */

const startSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(200),
  assessedBy: z.string().trim().min(1, 'Person name is required').max(200),
  designation: z.string().trim().min(1, 'Designation is required').max(200),
  email: z.string().trim().email('Enter a valid email').max(200).optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
});

app.post('/api/assessment/start', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, 400);
  }
  const assessment = await createAssessment({
    companyName: parsed.data.companyName,
    assessedBy: parsed.data.assessedBy,
    designation: parsed.data.designation,
    email: parsed.data.email || undefined,
    phone: parsed.data.phone || undefined,
  });
  return c.json({ assessment }, 201);
});

/**
 * Existence check only. Returns `{ status: 'none' | 'in_progress' | 'submitted' }`
 * and deliberately NEVER returns an assessment id, session token or participant
 * data. Resume is based on the capability token held by the participant's own
 * browser (or a resume link), not on their identity details.
 */
app.post('/api/assessment/lookup', async (c) => {
  const limit = rateLimit(clientKey(c.req.raw.headers, 'lookup'), 60, 60 * 1000);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfterSeconds));
    return c.json({ error: 'Too many requests. Please try again shortly.' }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, 400);
  }
  const status = await assessmentIdentityStatus({
    companyName: parsed.data.companyName,
    assessedBy: parsed.data.assessedBy,
    designation: parsed.data.designation,
    email: parsed.data.email || undefined,
    phone: parsed.data.phone || undefined,
  });
  return c.json({ status });
});

app.get('/api/assessment/:id', async (c) => {
  const auth = await authorizeAssessment(c, c.req.param('id'));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status as 403 | 404);
  const responses = await getResponses(auth.assessment.id);
  return c.json({ assessment: { ...auth.assessment, answeredCount: responses.length } });
});

app.get('/api/assessment/:id/responses', async (c) => {
  const auth = await authorizeAssessment(c, c.req.param('id'));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status as 403 | 404);
  const responses = await getResponses(auth.assessment.id);
  return c.json({ responses });
});

const saveSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

app.put('/api/assessment/:id/responses', async (c) => {
  const auth = await authorizeAssessment(c, c.req.param('id'));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status as 403 | 404);
  if (auth.assessment.status === 'SUBMITTED') {
    return c.json({ error: 'Assessment already submitted' }, 409);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid answers payload' }, 400);

  await saveResponses(auth.assessment.id, parsed.data.answers);
  const responses = await getResponses(auth.assessment.id);
  const rows = computeDomainScores(answersToMap(responses));
  const overall = overallScore(rows);
  return c.json({ ok: true, savedAt: new Date().toISOString(), overall, answeredCount: responses.length });
});

app.post('/api/assessment/:id/submit', async (c) => {
  const auth = await authorizeAssessment(c, c.req.param('id'));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status as 403 | 404);
  const assessment = await submitAssessment(auth.assessment.id);
  if (!assessment) return c.json({ error: 'Assessment not found' }, 404);
  return c.json({ assessment });
});

app.get('/api/assessment/:id/report', async (c) => {
  const auth = await authorizeAssessment(c, c.req.param('id'));
  if (!auth.ok) return c.json({ error: auth.error }, auth.status as 403 | 404);
  const responses = await getResponses(auth.assessment.id);
  const rows = computeDomainScores(answersToMap(responses));
  const overall = overallScore(rows);
  const rating = ratingFor(overall.percentage);
  return c.json({
    assessment: auth.assessment,
    responses,
    rows,
    overall,
    ratingKey: rating?.key ?? null,
    generatedAt: new Date().toISOString(),
  });
});

/* ------------------------------- admin --------------------------------- */

const loginSchema = z.object({ password: z.string().min(1) });

app.post('/api/admin/login', async (c) => {
  if (!adminAuthConfigured()) {
    return c.json({ error: 'Admin authentication is not configured on the server' }, 503);
  }
  const limit = rateLimit(clientKey(c.req.raw.headers, 'admin-login'), 10, 5 * 60 * 1000);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfterSeconds));
    return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Password required' }, 400);
  if (!checkAdminPassword(parsed.data.password)) {
    return c.json({ error: 'Invalid password' }, 401);
  }
  const token = createAdminToken();
  c.header('Set-Cookie', adminCookieHeader(token, isSecureRequest(c)));
  return c.json({ ok: true, token });
});

app.post('/api/admin/logout', (c) => {
  c.header('Set-Cookie', adminCookieClearHeader(isSecureRequest(c)));
  return c.json({ ok: true });
});

app.get('/api/admin/session', (c) => c.json({ authenticated: isAdminRequest(c) }));

app.get('/api/admin/assessments', async (c) => {
  if (!isAdminRequest(c)) return c.json({ error: 'Unauthorized' }, 401);
  const data = await getAdminList({ q: c.req.query('q'), status: c.req.query('status') });
  return c.json(data);
});

app.get('/api/admin/assessments/:id', async (c) => {
  if (!isAdminRequest(c)) return c.json({ error: 'Unauthorized' }, 401);
  const detail = await getAssessmentDetail(c.req.param('id'));
  if (!detail) return c.json({ error: 'Assessment not found' }, 404);
  return c.json(detail);
});

app.get('/api/admin/assessments/:id/responses', async (c) => {
  if (!isAdminRequest(c)) return c.json({ error: 'Unauthorized' }, 401);
  const assessment = await getAssessmentById(c.req.param('id'));
  if (!assessment) return c.json({ error: 'Assessment not found' }, 404);
  const responses = await getResponses(assessment.id);
  return c.json({ responses });
});

app.get('/api/admin/assessments/:id/report', async (c) => {
  if (!isAdminRequest(c)) return c.json({ error: 'Unauthorized' }, 401);
  const detail = await getAssessmentDetail(c.req.param('id'));
  if (!detail) return c.json({ error: 'Assessment not found' }, 404);
  const rating = ratingFor(detail.overall.percentage);
  return c.json({
    assessment: detail.assessment,
    responses: detail.responses,
    rows: detail.rows,
    overall: detail.overall,
    ratingKey: rating?.key ?? null,
    generatedAt: new Date().toISOString(),
  });
});
