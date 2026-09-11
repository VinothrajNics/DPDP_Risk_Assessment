import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { assessments, riskResponses, type AssessmentRow, type RiskResponseRow } from '@db/schema';
import type {
  Assessment,
  AssessmentDetailResponse,
  AssessmentStatus,
  AssessmentSummary,
  AdminCounts,
  StartAssessmentInput,
} from '@/lib/types';
import { computeDomainScores, overallScore, RISK_QUESTIONS, ratingFor } from '@/lib/riskQuestions';

const VALID_QUESTION_IDS = new Set(RISK_QUESTIONS.map((q) => q.id));
const VALID_ANSWERS = new Set(['3', '2', '1', '0', 'N/A']);

function nowIso(): string {
  return new Date().toISOString();
}

function toAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    sessionId: row.sessionId,
    companyName: row.companyName,
    assessedBy: row.assessedBy,
    designation: row.designation,
    email: row.email ?? null,
    phone: row.phone ?? null,
    startedAt: row.startedAt,
    lastSavedAt: row.lastSavedAt,
    submittedAt: row.submittedAt ?? null,
    status: row.status as AssessmentStatus,
    overallScore: row.overallScore ?? null,
    overallRating: row.overallRating ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createAssessment(input: StartAssessmentInput): Promise<Assessment> {
  const id = randomUUID();
  const sessionId = randomBytes(32).toString('base64url');
  const ts = nowIso();
  await db.insert(assessments).values({
    id,
    sessionId,
    companyName: input.companyName.trim(),
    assessedBy: input.assessedBy.trim(),
    designation: input.designation.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    startedAt: ts,
    lastSavedAt: ts,
    submittedAt: null,
    status: 'IN_PROGRESS',
    overallScore: null,
    overallRating: null,
    createdAt: ts,
    updatedAt: ts,
  });
  const created = await getAssessmentById(id);
  if (!created) throw new Error('Failed to create assessment');
  return created;
}

export async function getAssessmentById(id: string): Promise<Assessment | null> {
  const rows = await db.select().from(assessments).where(eq(assessments.id, id)).limit(1);
  return rows[0] ? toAssessment(rows[0]) : null;
}

/**
 * Non-authenticating existence check used only to warn a returning participant
 * that a session with the same details already exists.
 *
 * It deliberately returns ONLY a status string — never the assessment id, the
 * session capability token, or any participant data — so it cannot be used to
 * recover another person's session.
 */
export async function assessmentIdentityStatus(
  input: StartAssessmentInput,
): Promise<'none' | 'in_progress' | 'submitted'> {
  const company = input.companyName.trim().toLowerCase();
  const person = input.assessedBy.trim().toLowerCase();
  const designation = input.designation.trim().toLowerCase();

  const rows: AssessmentRow[] = await db
    .select()
    .from(assessments)
    .where(
      and(
        sql`lower(${assessments.companyName}) = ${company}`,
        sql`lower(${assessments.assessedBy}) = ${person}`,
        sql`lower(${assessments.designation}) = ${designation}`,
      ),
    )
    .orderBy(desc(assessments.startedAt));

  const email = input.email?.trim().toLowerCase() || '';
  const phone = input.phone?.trim() || '';

  const matches = rows.filter((r) => {
    if (email) {
      const stored = (r.email ?? '').trim().toLowerCase();
      if (stored && stored !== email) return false;
    }
    if (phone) {
      const stored = (r.phone ?? '').trim();
      if (stored && stored !== phone) return false;
    }
    return true;
  });

  if (matches.length === 0) return 'none';
  if (matches.some((r) => r.status !== 'SUBMITTED')) return 'in_progress';
  return 'submitted';
}

export async function getResponses(assessmentId: string) {
  const rows: RiskResponseRow[] = await db
    .select()
    .from(riskResponses)
    .where(eq(riskResponses.assessmentId, assessmentId));
  return rows.map((r) => ({ questionId: r.questionId, answer: r.answer, updatedAt: r.updatedAt }));
}

export function answersToMap(rows: { questionId: string; answer: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) map[r.questionId] = r.answer;
  return map;
}

/**
 * Saves answers with a minimal-write strategy: only changed/added answers are
 * upserted and only removed answers are deleted. This keeps D1 write volume low
 * and avoids the delete-all + insert-all pattern on every 400ms autosave.
 */
export async function saveResponses(
  assessmentId: string,
  answers: Record<string, string>,
): Promise<{ changed: number }> {
  const ts = nowIso();

  const incoming = new Map<string, string>();
  for (const [qid, answer] of Object.entries(answers)) {
    if (VALID_QUESTION_IDS.has(qid) && VALID_ANSWERS.has(String(answer))) {
      incoming.set(qid, String(answer));
    }
  }

  const existingRows: { questionId: string; answer: string }[] = await db
    .select({ questionId: riskResponses.questionId, answer: riskResponses.answer })
    .from(riskResponses)
    .where(eq(riskResponses.assessmentId, assessmentId));
  const existing = new Map(existingRows.map((r) => [r.questionId, r.answer]));

  const toDelete: string[] = [];
  for (const qid of existing.keys()) {
    if (!incoming.has(qid)) toDelete.push(qid);
  }

  const toUpsert = [] as {
    id: string;
    assessmentId: string;
    questionId: string;
    answer: string;
    createdAt: string;
    updatedAt: string;
  }[];
  for (const [questionId, answer] of incoming) {
    if (existing.get(questionId) !== answer) {
      toUpsert.push({
        id: randomUUID(),
        assessmentId,
        questionId,
        answer,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  // Cloudflare D1 caps bound parameters per query (100), so bulk writes are
  // chunked: insert chunk = 15 rows x 6 columns = 90 params; delete chunk = 80.
  const INSERT_CHUNK = 15;
  const DELETE_CHUNK = 80;

  for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
    const chunk = toDelete.slice(i, i + DELETE_CHUNK);
    await db
      .delete(riskResponses)
      .where(
        and(
          eq(riskResponses.assessmentId, assessmentId),
          inArray(riskResponses.questionId, chunk),
        ),
      );
  }

  for (let i = 0; i < toUpsert.length; i += INSERT_CHUNK) {
    const chunk = toUpsert.slice(i, i + INSERT_CHUNK);
    await db
      .insert(riskResponses)
      .values(chunk)
      .onConflictDoUpdate({
        target: [riskResponses.assessmentId, riskResponses.questionId],
        set: {
          answer: sql`excluded.answer`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  if (toDelete.length > 0 || toUpsert.length > 0) {
    await db
      .update(assessments)
      .set({ lastSavedAt: ts, updatedAt: ts })
      .where(eq(assessments.id, assessmentId));
  }

  return { changed: toUpsert.length + toDelete.length };
}

export async function submitAssessment(assessmentId: string): Promise<Assessment | null> {
  const responses = await getResponses(assessmentId);
  const map = answersToMap(responses);
  const rows = computeDomainScores(map);
  const overall = overallScore(rows);
  const rating = ratingFor(overall.percentage);
  const ts = nowIso();

  await db
    .update(assessments)
    .set({
      status: 'SUBMITTED',
      overallScore: overall.percentage,
      overallRating: rating?.label ?? null,
      submittedAt: ts,
      lastSavedAt: ts,
      updatedAt: ts,
    })
    .where(eq(assessments.id, assessmentId));

  return getAssessmentById(assessmentId);
}

function categoryOf(assessment: Assessment, answeredCount: number): 'submitted' | 'in_progress' | 'incomplete' {
  if (assessment.status === 'SUBMITTED') return 'submitted';
  return answeredCount > 0 ? 'in_progress' : 'incomplete';
}

export async function getAdminList(query: { q?: string; status?: string } = {}): Promise<{
  counts: AdminCounts;
  assessments: AssessmentSummary[];
}> {
  const rows: AssessmentRow[] = await db
    .select()
    .from(assessments)
    .orderBy(desc(assessments.startedAt));

  const countRows = await db
    .select({
      assessmentId: riskResponses.assessmentId,
      count: sql<number>`count(*)`,
    })
    .from(riskResponses)
    .groupBy(riskResponses.assessmentId);

  const countMap = new Map<string, number>();
  for (const c of countRows) countMap.set(c.assessmentId, Number(c.count));

  const all: AssessmentSummary[] = rows.map((row) => ({
    ...toAssessment(row),
    answeredCount: countMap.get(row.id) ?? 0,
  }));

  const counts: AdminCounts = { total: 0, submitted: 0, inProgress: 0, incomplete: 0 };
  for (const a of all) {
    counts.total += 1;
    const cat = categoryOf(a, a.answeredCount);
    if (cat === 'submitted') counts.submitted += 1;
    else if (cat === 'in_progress') counts.inProgress += 1;
    else counts.incomplete += 1;
  }

  let filtered = all;
  const status = (query.status || 'all').toLowerCase();
  if (status === 'submitted') filtered = filtered.filter((a) => a.status === 'SUBMITTED');
  else if (status === 'in_progress') filtered = filtered.filter((a) => categoryOf(a, a.answeredCount) === 'in_progress');
  else if (status === 'incomplete') filtered = filtered.filter((a) => categoryOf(a, a.answeredCount) === 'incomplete');

  const q = query.q?.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((a) =>
      [a.companyName, a.assessedBy, a.designation, a.email ?? '', a.sessionId, a.id]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }

  return { counts, assessments: filtered };
}

export async function getAssessmentDetail(assessmentId: string): Promise<AssessmentDetailResponse | null> {
  const assessment = await getAssessmentById(assessmentId);
  if (!assessment) return null;
  const responses = await getResponses(assessmentId);
  const map = answersToMap(responses);
  const rows = computeDomainScores(map);
  const overall = overallScore(rows);
  return {
    assessment: { ...assessment, answeredCount: responses.length },
    responses,
    rows,
    overall,
  };
}
