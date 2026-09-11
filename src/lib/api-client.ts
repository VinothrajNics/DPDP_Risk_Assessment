import type {
  AdminListResponse,
  Assessment,
  AssessmentDetailResponse,
  AssessmentSummary,
  StartAssessmentInput,
} from './types';
import type { DomainScore } from './riskQuestions';

const TOKEN_PREFIX = 'dpdp:token:';
const SESSION_LIST_KEY = 'dpdp:sessions';

export function storeToken(assessmentId: string, token: string) {
  try {
    localStorage.setItem(TOKEN_PREFIX + assessmentId, token);
  } catch {
    /* ignore */
  }
}

export function getToken(assessmentId: string): string | null {
  try {
    return localStorage.getItem(TOKEN_PREFIX + assessmentId);
  } catch {
    return null;
  }
}

export interface LocalSession {
  id: string;
  token: string;
  companyName: string;
  assessedBy: string;
  designation: string;
  startedAt: string;
}

/**
 * The participant's own browser keeps a list of assessments it has started.
 * This is what enables secure "continue / already submitted" recovery without
 * ever exposing another participant's session token through the API.
 */
function readLocalSessions(): LocalSession[] {
  try {
    const raw = localStorage.getItem(SESSION_LIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LocalSession[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSessions(list: LocalSession[]) {
  try {
    localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

export function rememberSession(a: {
  id: string;
  sessionId: string;
  companyName: string;
  assessedBy: string;
  designation: string;
  startedAt: string;
}) {
  storeToken(a.id, a.sessionId);
  const list = readLocalSessions().filter((s) => s.id !== a.id);
  list.unshift({
    id: a.id,
    token: a.sessionId,
    companyName: a.companyName,
    assessedBy: a.assessedBy,
    designation: a.designation,
    startedAt: a.startedAt,
  });
  writeLocalSessions(list);
}

export function findLocalSession(match: {
  companyName: string;
  assessedBy: string;
  designation: string;
}): LocalSession | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const found = readLocalSessions().find(
    (s) =>
      norm(s.companyName) === norm(match.companyName) &&
      norm(s.assessedBy) === norm(match.assessedBy) &&
      norm(s.designation) === norm(match.designation),
  );
  if (found) storeToken(found.id, found.token);
  return found ?? null;
}

export function removeLocalSession(id: string) {
  writeLocalSessions(readLocalSessions().filter((s) => s.id !== id));
}

/** Supports capability resume links of the form /assessment/<id>?t=<token>. */
export function applyTokenFromUrl(id: string): boolean {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('t');
    if (!t) return false;
    storeToken(id, t);
    url.searchParams.delete('t');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    return true;
  } catch {
    return false;
  }
}

export function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function buildResumeUrl(id: string, token: string): string {
  return `${appBaseUrl()}/assessment/${id}?t=${encodeURIComponent(token)}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers['x-assessment-token'] = token;

  const res = await fetch(path, { ...init, headers, cache: 'no-store' });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

/* ------------------------------ participant ---------------------------- */

export async function startAssessment(input: StartAssessmentInput): Promise<{ assessment: Assessment; token: string }> {
  const data = await request<{ assessment: Assessment }>('/api/assessment/start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  rememberSession(data.assessment);
  return { assessment: data.assessment, token: data.assessment.sessionId };
}

export type LookupStatus = 'none' | 'in_progress' | 'submitted';

/**
 * Non-authenticating existence check. The server returns only a status string;
 * it never returns a session token or participant data.
 */
export async function lookupAssessment(input: StartAssessmentInput): Promise<{ status: LookupStatus }> {
  return request<{ status: LookupStatus }>('/api/assessment/lookup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getAssessment(id: string) {
  return request<{ assessment: AssessmentSummary }>(`/api/assessment/${id}`, {}, getToken(id));
}

export async function getResponses(id: string) {
  return request<{ responses: { questionId: string; answer: string; updatedAt: string }[] }>(
    `/api/assessment/${id}/responses`,
    {},
    getToken(id),
  );
}

export async function saveResponses(id: string, answers: Record<string, string>) {
  return request<{
    ok: boolean;
    savedAt: string;
    overall: { assigned: number; total: number; percentage: number | null };
    answeredCount: number;
  }>(`/api/assessment/${id}/responses`, { method: 'PUT', body: JSON.stringify({ answers }) }, getToken(id));
}

export async function submitAssessment(id: string) {
  return request<{ assessment: Assessment }>(
    `/api/assessment/${id}/submit`,
    { method: 'POST', body: '{}' },
    getToken(id),
  );
}

export interface ReportResponse {
  assessment: Assessment;
  responses: { questionId: string; answer: string; updatedAt?: string }[];
  rows: DomainScore[];
  overall: { assigned: number; total: number; percentage: number | null };
  ratingKey: string | null;
  generatedAt: string;
}

export async function getReport(id: string, admin = false) {
  const path = admin ? `/api/admin/assessments/${id}/report` : `/api/assessment/${id}/report`;
  return request<ReportResponse>(path, {}, admin ? null : getToken(id));
}

/* -------------------------------- admin -------------------------------- */

export async function adminLogin(password: string) {
  return request<{ ok: boolean; token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function adminLogout() {
  return request<{ ok: boolean }>('/api/admin/logout', { method: 'POST', body: '{}' });
}

export async function adminSession() {
  return request<{ authenticated: boolean }>('/api/admin/session');
}

export async function adminList(params: { q?: string; status?: string } = {}) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  const qs = search.toString();
  return request<AdminListResponse>(`/api/admin/assessments${qs ? `?${qs}` : ''}`);
}

export async function adminDetail(id: string) {
  return request<AssessmentDetailResponse>(`/api/admin/assessments/${id}`);
}
