'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminDetail, ApiError } from '@/lib/api-client';
import { answerValue, ratingFor, RISK_QUESTIONS } from '@/lib/riskQuestions';
import { fmtDateTime, ratingColor } from '@/lib/format';
import type { AssessmentDetailResponse } from '@/lib/types';

export default function AdminDetailView({ id }: { id: string }) {
  const [detail, setDetail] = useState<AssessmentDetailResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminDetail(id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 401
              ? 'Unauthorized. Please sign in to the admin dashboard.'
              : 'Could not load this assessment.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="page narrow">
        <div className="empty-state">
          {error}
          <div style={{ marginTop: 14 }}>
            <Link className="btn" href="/admin">
              Back to Admin
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="page">
        <div className="empty-state">Loading…</div>
      </main>
    );
  }

  const a = detail.assessment;
  const responses: Record<string, string> = {};
  for (const r of detail.responses) responses[r.questionId] = r.answer;
  const rt = a.overallScore !== null ? ratingFor(a.overallScore) : null;
  const domains = Array.from(new Set(RISK_QUESTIONS.map((q) => q.domain)));

  return (
    <main className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {a.companyName}
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {a.assessedBy} &middot; {a.designation}
          </p>
        </div>
        <span className="spacer" />
        <Link className="btn ghost" href="/admin">
          &larr; Dashboard
        </Link>
        <Link className="btn secondary" href={`/admin/${id}/report`}>
          View Report
        </Link>
        <Link className="btn" href={`/admin/${id}/report?print=1`}>
          &#128438; Print Report
        </Link>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          Assessment Information
        </div>
        <div className="form-grid">
          <div>
            <div className="sign-fields">
              <div>
                <b>Company:</b> {a.companyName}
              </div>
              <div>
                <b>Person:</b> {a.assessedBy}
              </div>
              <div>
                <b>Designation:</b> {a.designation}
              </div>
              <div>
                <b>Email:</b> {a.email || '—'}
              </div>
              <div>
                <b>Phone:</b> {a.phone || '—'}
              </div>
              <div>
                <b>Session ID:</b> <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{a.sessionId}</span>
              </div>
            </div>
          </div>
          <div>
            <div className="sign-fields">
              <div>
                <b>Started At:</b> {fmtDateTime(a.startedAt)}
              </div>
              <div>
                <b>Last Saved:</b> {fmtDateTime(a.lastSavedAt)}
              </div>
              <div>
                <b>Submitted At:</b> {a.submittedAt ? fmtDateTime(a.submittedAt) : '—'}
              </div>
              <div>
                <b>Questions Answered:</b> {a.answeredCount} / {RISK_QUESTIONS.length}
              </div>
              <div>
                <b>Overall Score:</b>{' '}
                <span style={{ fontWeight: 700 }}>{a.overallScore === null ? '—' : a.overallScore + '%'}</span>
              </div>
              <div>
                <b>Overall Rating:</b>{' '}
                <span style={{ color: ratingColor(rt?.key), fontWeight: 700 }}>
                  {rt ? `${rt.emoji} ${rt.label}` : a.overallRating || '—'}
                </span>
              </div>
              <div>
                <b>Status:</b> {a.status}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          Domain Results
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Assigned</th>
                <th>Total</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((r) => (
                <tr key={r.domain}>
                  <td>{r.domain}</td>
                  <td>{r.assigned}</td>
                  <td>{r.total}</td>
                  <td>{r.percentage === null ? '—' : r.percentage + '%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-title">Responses</div>
      {domains.map((domain) => {
        const items = RISK_QUESTIONS.filter((q) => q.domain === domain);
        return (
          <div key={domain} className="card">
            <div className="section-title" style={{ margin: '0 0 10px' }}>
              {domain}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>ID</th>
                    <th>Question</th>
                    <th style={{ width: 90 }}>Answer</th>
                    <th style={{ width: 60 }}>Weight</th>
                    <th style={{ width: 90 }}>Assigned</th>
                    <th style={{ width: 80 }}>Maximum</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((q) => {
                    const ans = responses[q.id];
                    const val = answerValue(ans);
                    const isNa = ans === 'N/A';
                    const label = !ans ? '—' : isNa ? 'N/A' : val === 3 ? 'Strong' : val === 2 ? 'Partial' : val === 1 ? 'Weak' : 'None';
                    return (
                      <tr key={q.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{q.id}</td>
                        <td>{q.question}</td>
                        <td>
                          <b>{label}</b>
                        </td>
                        <td>{q.weight}</td>
                        <td>{isNa ? 'N/A' : val === null ? '—' : q.weight * val}</td>
                        <td>{q.weight === 0 ? '—' : q.weight * 3}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </main>
  );
}
