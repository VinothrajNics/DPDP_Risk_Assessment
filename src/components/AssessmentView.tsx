'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  answerValue,
  computeDomainScores,
  overallScore,
  ratingFor,
  RISK_ANSWER_CHOICES,
  RISK_NA_CHOICE,
  RISK_QUESTIONS,
  RISK_RATINGS,
  type RiskQuestion,
} from '@/lib/riskQuestions';
import {
  ApiError,
  applyTokenFromUrl,
  buildResumeUrl,
  getAssessment,
  getResponses,
  getToken,
  rememberSession,
  saveResponses,
  submitAssessment,
} from '@/lib/api-client';
import { fmtTime, ratingColor } from '@/lib/format';
import type { AssessmentSummary } from '@/lib/types';

const SAVE_DEBOUNCE_MS = 400;
const DRAFT_PREFIX = 'dpdp:draft:';

function draftKey(id: string): string {
  return DRAFT_PREFIX + id;
}

function readDraft(id: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, answers: Record<string, string>): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(answers));
  } catch {
    /* storage unavailable */
  }
}

function clearDraft(id: string): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable */
  }
}

function ratingRange(r: { min: number; max: number }): string {
  return r.min + '\u2013' + r.max + '%';
}

export default function AssessmentView({ id }: { id: string }) {
  const [assessment, setAssessment] = useState<AssessmentSummary | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Support capability resume links: /assessment/<id>?t=<token>
        applyTokenFromUrl(id);
        const [{ assessment }, { responses }] = await Promise.all([getAssessment(id), getResponses(id)]);
        if (cancelled) return;
        rememberSession(assessment);
        setAssessment(assessment);
        const map: Record<string, string> = {};
        for (const r of responses) map[r.questionId] = r.answer;

        if (assessment.status === 'SUBMITTED') {
          clearDraft(id);
          setAnswers(map);
        } else {
          const draft = readDraft(id);
          if (draft) {
            // The local draft is the latest state and may include answers that were
            // still inside the 400ms debounce window when the page was refreshed.
            setAnswers(draft);
            if (JSON.stringify(draft) !== JSON.stringify(map)) {
              saveResponses(id, draft).catch(() => undefined);
            }
          } else {
            setAnswers(map);
          }
        }
        setLastSaved(assessment.lastSavedAt);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setLoadError('You do not have access to this assessment. Please start a new assessment from the entry page.');
        } else if (err instanceof ApiError && err.status === 404) {
          setLoadError('This assessment could not be found.');
        } else {
          setLoadError('Could not load the assessment. Please refresh and try again.');
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const persist = useCallback(
    (map: Record<string, string>) => {
      if (timer.current) clearTimeout(timer.current);
      setSaving(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        saveResponses(id, map)
          .then((res) => {
            setLastSaved(res.savedAt);
            setSaving(false);
          })
          .catch((err) => {
            setSaving(false);
            notify(err instanceof ApiError ? err.message : 'Save failed', true);
          });
      }, SAVE_DEBOUNCE_MS);
    },
    [id, notify],
  );

  const setAnswer = (qid: string, value: string) => {
    const next = { ...answers };
    if (value === '') delete next[qid];
    else next[qid] = value;
    setAnswers(next);
    // Persist locally immediately so a refresh never loses the answer, even if
    // the debounced server save has not fired yet.
    writeDraft(id, next);
    persist(next);
  };

  const answersRef = useRef<Record<string, string>>({});
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Best-effort flush of a still-debounced save when the page is hidden or
  // refreshed, so the server has the latest answers as early as possible.
  useEffect(() => {
    const onHide = () => {
      if (!timer.current) return;
      const token = getToken(id);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-assessment-token'] = token;
      try {
        fetch(`/api/assessment/${id}/responses`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ answers: answersRef.current }),
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [id]);

  const rows = useMemo(() => computeDomainScores(answers), [answers]);
  const overall = useMemo(() => overallScore(rows), [rows]);
  const overallRating = ratingFor(overall.percentage);
  const answeredCount = RISK_QUESTIONS.filter((q) => answers[q.id]).length;
  const unanswered = RISK_QUESTIONS.length - answeredCount;

  const rankedDomains = useMemo(() => {
    const totalWeight = rows.reduce((s, r) => s + r.total, 0);
    return [...rows]
      .map((r) => ({ ...r, share: totalWeight > 0 ? Math.round((r.total / totalWeight) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const groups = useMemo(() => {
    const m = new Map<string, RiskQuestion[]>();
    for (const q of RISK_QUESTIONS) {
      const arr = m.get(q.domain) || [];
      arr.push(q);
      m.set(q.domain, arr);
    }
    return Array.from(m.entries()).map(([domain, items]) => ({ domain, items }));
  }, []);

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const { assessment: updated } = await submitAssessment(id);
      clearDraft(id);
      setAssessment({ ...updated, answeredCount });
      setShowSubmit(false);
      notify('Assessment submitted successfully.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Submission failed', true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <main className="page">
        <div className="empty-state">Loading assessment…</div>
      </main>
    );
  }

  if (loadError || !assessment) {
    return (
      <main className="page narrow">
        <div className="empty-state">
          {loadError || 'Assessment not found.'}
          <div style={{ marginTop: 14 }}>
            <Link className="btn" href="/assessment">
              Start a new assessment
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isSubmitted = assessment.status === 'SUBMITTED';

  if (isSubmitted) {
    const finalRating = ratingFor(assessment.overallScore);
    return (
      <main className="page narrow">
        <div className="card risk-summary-card">
          <div className="risk-rating-title">
            <span className="risk-emoji-big">&#9989;</span>
            <span style={{ color: 'var(--navy)' }}>Assessment Completed</span>
          </div>
          <p className="risk-summary-text">
            Your DPDP Risk &amp; Compliance Assessment has been successfully submitted.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 24,
              flexWrap: 'wrap',
              margin: '18px 0',
              padding: '16px 0',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--navy)' }}>
                {assessment.overallScore === null ? '—' : assessment.overallScore + '%'}
              </div>
              <div className="field-hint">Final score</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: ratingColor(finalRating?.key) }}>
                {finalRating ? `${finalRating.emoji} ${finalRating.label}` : assessment.overallRating || '—'}
              </div>
              <div className="field-hint">Rating</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
                {answeredCount}/{RISK_QUESTIONS.length}
              </div>
              <div className="field-hint">Questions answered</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn lg" href={`/assessment/${id}/report`}>
              View Report
            </Link>
            <Link className="btn secondary lg" href={`/assessment/${id}/report?print=1`}>
              Print / Save as PDF
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="banner">
        <b>{assessment.companyName}</b> &mdash; answer each question on a{' '}
        <b>3 = Strong &middot; 2 = Partial &middot; 1 = Weak &middot; 0 = None</b> scale. Questions marked N/A are
        excluded from scoring. <b>{answeredCount}</b> of {RISK_QUESTIONS.length} answered.
        <span className="hint">
          {' '}
          {saving
            ? 'Saving…'
            : lastSaved
              ? `Last saved ${fmtTime(lastSaved)}`
              : ''}
        </span>
      </div>

      <ResumeLinkCard id={id} />

      <div className="card risk-summary-card">
        <div className="grid risk-overall-grid">
          <div>
            <div className="risk-rating-title">
              {overallRating ? (
                <>
                  <span className="risk-emoji-big">{overallRating.emoji}</span>
                  <span style={{ color: ratingColor(overallRating.key) }}>{overallRating.label}</span>
                </>
              ) : (
                'Not yet rated'
              )}
            </div>
            {overallRating ? (
              <p className="risk-summary-text">{overallRating.summary}</p>
            ) : (
              <p className="risk-summary-text">
                Answer the questionnaire below to see the overall assessment summary.
              </p>
            )}
            <div className="risk-answered-line">
              {answeredCount} of {RISK_QUESTIONS.length} questions answered &middot;{' '}
              {rows.filter((r) => r.answered > 0).length} of {rows.length} domains scored
            </div>
          </div>
          <div className="risk-score-panel">
            <div className="risk-pct">{overall.percentage === null ? '—' : overall.percentage + '%'}</div>
            <div className="risk-pct-label">Overall compliance score</div>
            <div className="risk-pct-sub">
              {overall.assigned} points assigned of {overall.total} possible
            </div>
            {overallRating && (
              <div className="risk-pct-rating" style={{ borderColor: ratingColor(overallRating.key) }}>
                {overallRating.emoji} {overallRating.label}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ margin: '0 0 10px' }}>
          Rating Guide
        </div>
        <div className="grid grid-5 risk-rating-strip">
          {RISK_RATINGS.map((r) => (
            <div
              key={r.key}
              style={{
                borderTop: '3px solid ' + ratingColor(r.key),
                padding: '6px 8px',
                background: 'var(--panel)',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 700, color: ratingColor(r.key) }}>
                {r.emoji} {r.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ratingRange(r)}</div>
            </div>
          ))}
        </div>
      </div>

      {overallRating && (
        <div className="card risk-next-card" style={{ borderLeft: '4px solid ' + ratingColor(overallRating.key) }}>
          <div className="section-title" style={{ margin: '0 0 6px' }}>
            Recommended Next Step
          </div>
          <p style={{ margin: 0, fontSize: 13 }}>
            <b>{overallRating.label}</b> — {overallRating.summary}
          </p>
        </div>
      )}

      <div className="card">
        <div className="section-title" style={{ margin: '0 0 4px' }}>
          Domain Ranking by Assessment Weight
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          Start here — the highest-weight domains carry the most assessment points and should be prioritised for
          remediation.
        </p>
        <div className="grid risk-domain-grid">
          {rankedDomains.map((d) => {
            const rt = ratingFor(d.percentage);
            const barPct = d.total > 0 ? Math.round((d.assigned / d.total) * 100) : 0;
            return (
              <div key={d.domain} className="risk-domain-card">
                <div className="risk-domain-head">
                  <b>{d.domain}</b>
                  <span className="risk-domain-pts">{d.total} pts</span>
                </div>
                <div className="risk-domain-share">{d.share}% of total weight</div>
                <div className="risk-bar">
                  <div
                    className="risk-bar-fill"
                    style={{ width: barPct + '%', background: rt ? ratingColor(rt.key) : 'var(--border)' }}
                  />
                </div>
                <div className="risk-domain-foot">
                  <span>
                    {d.assigned} of {d.total} assigned ({d.percentage === null ? '—' : d.percentage + '%'})
                  </span>
                  {rt ? (
                    <span
                      className="badge"
                      style={{ background: ratingColor(rt.key) + '22', color: ratingColor(rt.key), fontWeight: 700 }}
                    >
                      {rt.emoji} {rt.label.split('\u2013')[0].trim()}
                    </span>
                  ) : (
                    <span className="field-hint">Not rated</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-title">Questionnaire</div>
      {groups.map((g) => {
        const domainRow = rows.find((r) => r.domain === g.domain);
        const domainRating = ratingFor(domainRow ? domainRow.percentage : null);
        return (
          <div key={g.domain} className="card">
            <div className="section-title" style={{ margin: '0 0 10px' }}>
              {g.domain}
              <span className="hint">
                {domainRow && domainRating
                  ? ` ${domainRow.assigned} / ${domainRow.total} · ${domainRow.percentage}% · ${domainRating.emoji} ${domainRating.label}`
                  : ''}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>ID</th>
                    <th>Assessment Question</th>
                    <th style={{ width: 130 }}>Answer</th>
                    <th style={{ width: 110 }}>Assigned Score</th>
                    <th style={{ width: 90 }}>Total Score</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((q) => {
                    const ans = answers[q.id] || '';
                    const val = answerValue(ans);
                    const assigned = val === null ? '' : q.weight * val;
                    const total = q.weight * 3;
                    return (
                      <tr key={q.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{q.id}</td>
                        <td>{q.question}</td>
                        <td>
                          <select
                            aria-label={`Answer for ${q.id}`}
                            style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12.5 }}
                            value={ans}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                          >
                            <option value="">--</option>
                            {[...RISK_ANSWER_CHOICES, ...(q.na ? [RISK_NA_CHOICE] : [])].map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.value === 'N/A' ? 'N/A' : `${o.value} \u2013 ${o.label}`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <b>{ans === 'N/A' ? <span className="field-hint">N/A</span> : assigned === '' ? '-' : assigned}</b>
                        </td>
                        <td>{q.weight === 0 ? '-' : total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--navy)' }}>
            Answered: {answeredCount} / {RISK_QUESTIONS.length}
          </div>
          <div className="field-hint">
            Current Score: {overall.percentage === null ? '—' : overall.percentage + '%'} · Current Rating:{' '}
            {overallRating ? overallRating.label : 'Not yet rated'}
          </div>
        </div>
        <span className="spacer" />
        <button className="btn lg" onClick={() => setShowSubmit(true)}>
          Submit Assessment
        </button>
      </div>

      {showSubmit && (
        <div className="modal-overlay open no-print" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3>Submit Assessment</h3>
              <button className="btn ghost sm" onClick={() => setShowSubmit(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                Answered: <b>{answeredCount}</b> / {RISK_QUESTIONS.length}
                <br />
                Current Score: <b>{overall.percentage === null ? '—' : overall.percentage + '%'}</b>
                <br />
                Current Rating: <b>{overallRating ? overallRating.label : 'Not yet rated'}</b>
              </p>
              {unanswered > 0 && (
                <div className="banner" style={{ marginBottom: 0 }}>
                  You have answered {answeredCount} of {RISK_QUESTIONS.length} questions.
                  <br />
                  <b>{unanswered}</b> questions are unanswered.
                  <br />
                  Unanswered questions will affect the final score.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn ghost" onClick={() => setShowSubmit(false)}>
                Go Back
              </button>
              <button className="btn" onClick={doSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : unanswered > 0 ? 'Submit Anyway' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'toast ' + (toast.error ? 'error' : '')}>{toast.msg}</div>}
    </main>
  );
}

function ResumeLinkCard({ id }: { id: string }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = getToken(id);
    if (token) setUrl(buildResumeUrl(id, token));
  }, [id]);

  if (!url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--navy)' }}>Resume link</div>
        <div className="field-hint">
          Save this private link to continue this assessment on another device or browser.
        </div>
      </div>
      <span className="spacer" />
      <button className="btn secondary sm" onClick={copy}>
        {copied ? 'Copied!' : 'Copy resume link'}
      </button>
    </div>
  );
}
