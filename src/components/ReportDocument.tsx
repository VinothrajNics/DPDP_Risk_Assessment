import {
  answerValue,
  computeDomainScores,
  overallScore,
  ratingByKey,
  ratingFor,
  RISK_QUESTIONS,
  RISK_RATINGS,
  type RiskRating,
} from '@/lib/riskQuestions';
import { fmtDateTime, ratingColor } from '@/lib/format';
import type { ReportResponse } from '@/lib/api-client';

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function shortLabel(r: RiskRating | null): string {
  if (!r) return '—';
  return r.label.split('\u2013')[0].trim();
}

interface GapFinding {
  id: string;
  domain: string;
  question: string;
  answer: string;
  weight: number;
  assigned: number | null;
  maximum: number;
  severity: 'High' | 'Medium';
}

function buildGaps(data: ReportResponse): GapFinding[] {
  const map: Record<string, string> = {};
  for (const r of data.responses) map[r.questionId] = r.answer;

  const gaps: GapFinding[] = [];
  for (const q of RISK_QUESTIONS) {
    const answer = map[q.id];
    if (answer === 'N/A') continue;
    const val = answerValue(answer);
    if (val === null) {
      gaps.push({
        id: q.id,
        domain: q.domain,
        question: q.question,
        answer: 'Unanswered',
        weight: q.weight,
        assigned: null,
        maximum: q.weight * 3,
        severity: 'Medium',
      });
    } else if (val <= 1) {
      gaps.push({
        id: q.id,
        domain: q.domain,
        question: q.question,
        answer: val === 1 ? 'Weak' : 'None',
        weight: q.weight,
        assigned: q.weight * val,
        maximum: q.weight * 3,
        severity: 'High',
      });
    } else if (val === 2) {
      gaps.push({
        id: q.id,
        domain: q.domain,
        question: q.question,
        answer: 'Partial',
        weight: q.weight,
        assigned: q.weight * 2,
        maximum: q.weight * 3,
        severity: 'Medium',
      });
    }
  }
  return gaps.sort((a, b) => (a.severity === b.severity ? b.weight - a.weight : a.severity === 'High' ? -1 : 1));
}

export default function ReportDocument({
  data,
  audience = 'admin',
}: {
  data: ReportResponse;
  audience?: 'participant' | 'admin';
}) {
  const a = data.assessment;
  const rows = data.rows.length ? data.rows : computeDomainScores({});
  const overall = data.overall ?? overallScore(rows);
  const rating = ratingByKey(data.ratingKey) ?? ratingFor(overall.percentage);

  const responsesByQ: Record<string, string> = {};
  for (const r of data.responses) responsesByQ[r.questionId] = r.answer;
  const answeredCount = RISK_QUESTIONS.filter((q) => responsesByQ[q.id]).length;
  const totalWeight = rows.reduce((s, r) => s + r.total, 0);
  const rankedDomains = [...rows]
    .map((r) => ({ ...r, share: totalWeight > 0 ? Math.round((r.total / totalWeight) * 100) : 0 }))
    .sort((x, y) => y.total - x.total);

  const gaps = buildGaps(data);
  const highGaps = gaps.filter((g) => g.severity === 'High').length;
  const mediumGaps = gaps.filter((g) => g.severity === 'Medium').length;

  const domains = Array.from(new Set(RISK_QUESTIONS.map((q) => q.domain)));

  return (
    <div className="rpt-page">
      <div className="rpt-letterhead">
        <div className="rpt-brand">
          <div className="rpt-mark">DP</div>
          <div>
            <h2>DPDP Risk &amp; Compliance Assessment</h2>
            <div className="tag">Digital Personal Data Protection Act, 2023</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>
          <div>Report generated</div>
          <div>
            <b style={{ color: 'var(--navy)' }}>{fmtDateTime(data.generatedAt)}</b>
          </div>
        </div>
      </div>

      <div className="rpt-title">DPDP Risk &amp; Gap Assessment</div>
      <div className="rpt-sub">
        Confidential &mdash; prepared for internal management review under the Digital Personal Data Protection Act,
        2023.
      </div>

      <div className="rpt-section">
        <h4>1. Assessment Details</h4>
        {audience === 'participant' ? (
          <div className="rpt-meta-grid">
            <div>
              <div className="row">
                <span>Company</span>
                <b>{esc(a.companyName)}</b>
              </div>
              <div className="row">
                <span>Assessed By</span>
                <b>{esc(a.assessedBy)}</b>
              </div>
              <div className="row">
                <span>Designation</span>
                <b>{esc(a.designation)}</b>
              </div>
            </div>
            <div>
              <div className="row">
                <span>Email</span>
                <b>{esc(a.email || '—')}</b>
              </div>
              {a.phone ? (
                <div className="row">
                  <span>Phone</span>
                  <b>{esc(a.phone)}</b>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rpt-meta-grid">
            <div>
              <div className="row">
                <span>Company</span>
                <b>{esc(a.companyName)}</b>
              </div>
              <div className="row">
                <span>Assessed By</span>
                <b>{esc(a.assessedBy)}</b>
              </div>
              <div className="row">
                <span>Designation</span>
                <b>{esc(a.designation)}</b>
              </div>
              <div className="row">
                <span>Email</span>
                <b>{esc(a.email || '—')}</b>
              </div>
            </div>
            <div>
              <div className="row">
                <span>Phone</span>
                <b>{esc(a.phone || '—')}</b>
              </div>
              <div className="row">
                <span>Session ID</span>
                <b style={{ fontFamily: 'monospace', fontSize: 10.5 }}>{esc(a.sessionId)}</b>
              </div>
              <div className="row">
                <span>Started</span>
                <b>{fmtDateTime(a.startedAt)}</b>
              </div>
              <div className="row">
                <span>Submitted</span>
                <b>{a.submittedAt ? fmtDateTime(a.submittedAt) : 'Not submitted'}</b>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rpt-section">
        <h4>2. Overall Result</h4>
        <div className="card risk-summary-card">
          <div className="grid risk-overall-grid">
            <div>
              <div className="risk-rating-title">
                {rating ? (
                  <>
                    <span className="risk-emoji-big">{rating.emoji}</span>
                    <span style={{ color: ratingColor(rating.key) }}>{esc(rating.label)}</span>
                  </>
                ) : (
                  'Not yet rated'
                )}
              </div>
              {rating ? (
                <p className="risk-summary-text">{esc(rating.summary)}</p>
              ) : (
                <p className="risk-summary-text">
                  Not enough answers were provided to compute a rating.
                </p>
              )}
              <div className="risk-answered-line">
                {answeredCount} of {RISK_QUESTIONS.length} questions answered &middot;{' '}
                {rows.filter((r) => r.answered > 0).length} of {rows.length} domains scored &middot; {highGaps} high and{' '}
                {mediumGaps} medium gap findings
              </div>
            </div>
            <div className="risk-score-panel">
              <div className="risk-pct">{overall.percentage === null ? '—' : overall.percentage + '%'}</div>
              <div className="risk-pct-label">Overall compliance score</div>
              <div className="risk-pct-sub">
                {overall.assigned} points assigned of {overall.total} possible
              </div>
              {rating && (
                <div className="risk-pct-rating" style={{ borderColor: ratingColor(rating.key) }}>
                  {rating.emoji} {esc(rating.label)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rpt-section">
        <h4>3. Rating Guide</h4>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: ratingColor(r.key) }}>
                {r.emoji} {esc(r.label)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {r.min}&ndash;{r.max}%
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rpt-section">
        <h4>4. Domain Results</h4>
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Weight</th>
              <th>Assigned</th>
              <th>Maximum</th>
              <th>Score</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {rankedDomains.map((d) => {
              const dr = ratingFor(d.percentage);
              return (
                <tr key={d.domain}>
                  <td>{esc(d.domain)}</td>
                  <td>{d.total}</td>
                  <td>{d.assigned}</td>
                  <td>{d.total}</td>
                  <td>{d.percentage === null ? '—' : d.percentage + '%'}</td>
                  <td style={{ color: ratingColor(dr?.key), fontWeight: 600 }}>{shortLabel(dr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rpt-section">
        <h4>5. Gap Findings</h4>
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>ID</th>
              <th>Question</th>
              <th>Domain</th>
              <th>Answer</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {gaps.length ? (
              gaps.map((g) => (
                <tr key={g.id}>
                  <td style={{ color: g.severity === 'High' ? 'var(--danger)' : 'var(--medium)', fontWeight: 700 }}>
                    {g.severity}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{g.id}</td>
                  <td>{esc(g.question)}</td>
                  <td>{esc(g.domain)}</td>
                  <td>{esc(g.answer)}</td>
                  <td>
                    {g.assigned === null ? '—' : g.assigned} / {g.maximum}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>No gap findings — all applicable questions were answered Strong.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rpt-section">
        <h4>6. Recommended Next Steps</h4>
        {rating && (
          <p className="rich-summary">
            <b style={{ color: ratingColor(rating.key) }}>
              {rating.emoji} {esc(rating.label)}
            </b>{' '}
            &mdash; {esc(rating.summary)}
          </p>
        )}
        <p className="rich-summary">
          Based on the findings above, a structured DPDP compliance programme is recommended: complete a formal gap
          assessment, perform data discovery and mapping, identify purposes and lawful bases, strengthen notices and
          consent management, operationalise Data Principal rights and grievance handling, define retention and
          deletion, uplift security and breach response, formalise third-party and cross-border controls, and establish
          periodic monitoring with documented evidence.
        </p>
      </div>

      <div className="rpt-section">
        <h4>7. Detailed Questionnaire Responses</h4>
        {domains.map((domain) => {
          const items = RISK_QUESTIONS.filter((q) => q.domain === domain);
          return (
            <div key={domain} style={{ marginBottom: 10 }}>
              <div className="section-title" style={{ margin: '12px 0 6px', fontSize: 13 }}>
                {esc(domain)}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th>Question</th>
                    {audience === 'admin' ? <th style={{ width: 46 }}>Weight</th> : null}
                    <th style={{ width: 66 }}>Answer</th>
                    <th style={{ width: 66 }}>Assigned</th>
                    <th style={{ width: 58 }}>Max</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((q) => {
                    const answer = responsesByQ[q.id];
                    const val = answerValue(answer);
                    const isNa = answer === 'N/A';
                    return (
                      <tr key={q.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{q.id}</td>
                        <td>{esc(q.question)}</td>
                        {audience === 'admin' ? <td>{q.weight}</td> : null}
                        <td>{answer ? (isNa ? 'N/A' : labelFor(val)) : '—'}</td>
                        <td>{isNa ? 'N/A' : val === null ? '—' : q.weight * val}</td>
                        <td>{q.weight === 0 ? '—' : q.weight * 3}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function labelFor(val: number | null): string {
  if (val === 3) return 'Strong';
  if (val === 2) return 'Partial';
  if (val === 1) return 'Weak';
  if (val === 0) return 'None';
  return '—';
}
