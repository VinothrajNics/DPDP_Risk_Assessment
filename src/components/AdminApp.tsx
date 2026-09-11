'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminList, adminLogin, adminLogout, adminSession, ApiError } from '@/lib/api-client';
import { ratingFor } from '@/lib/riskQuestions';
import { fmtDateTime, fmtTime, ratingColor } from '@/lib/format';
import type { AdminCounts, AssessmentSummary } from '@/lib/types';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'incomplete', label: 'Incomplete' },
];

function category(a: AssessmentSummary): 'submitted' | 'in_progress' | 'incomplete' {
  if (a.status === 'SUBMITTED') return 'submitted';
  return a.answeredCount > 0 ? 'in_progress' : 'incomplete';
}

function statusBadge(a: AssessmentSummary) {
  const cat = category(a);
  if (cat === 'submitted') return <span className="badge ok">Submitted</span>;
  if (cat === 'in_progress') return <span className="badge medium">In Progress</span>;
  return <span className="badge neutral">Incomplete</span>;
}

export default function AdminApp() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [counts, setCounts] = useState<AdminCounts>({ total: 0, submitted: 0, inProgress: 0, incomplete: 0 });
  const [rows, setRows] = useState<AssessmentSummary[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminSession()
      .then((r) => setAuthenticated(r.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminList({ q, status });
      setCounts(data.counts);
      setRows(data.assessments);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    if (!authenticated) return;
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [authenticated, load, q]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      await adminLogin(password);
      setPassword('');
      setAuthenticated(true);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    await adminLogout();
    setAuthenticated(false);
    setRows([]);
  };

  if (checking) {
    return (
      <main className="page">
        <div className="empty-state">Checking session…</div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="page narrow">
        <h1 className="page-title">Admin Sign In</h1>
        <p className="page-sub">Restricted area — organiser access only.</p>
        <form className="card" onSubmit={login}>
          <div className="form-row">
            <label>Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
            />
          </div>
          {loginError && <p className="error-text">{loginError}</p>}
          <button className="btn" type="submit" disabled={loggingIn}>
            {loggingIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Admin Dashboard
          </h1>
          <p className="page-sub" style={{ margin: 0 }}>
            Monitor all public assessment sessions.
          </p>
        </div>
        <span className="spacer" />
        <button className="btn ghost" onClick={logout}>
          Sign Out
        </button>
      </div>

      <div className="grid grid-4" style={{ marginTop: 18 }}>
        <div className="card stat-card">
          <div className="stat-num">{counts.total}</div>
          <div className="stat-label">Total Assessments</div>
        </div>
        <div className="card stat-card ok">
          <div className="stat-num">{counts.submitted}</div>
          <div className="stat-label">Submitted</div>
        </div>
        <div className="card stat-card med">
          <div className="stat-num">{counts.inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="card stat-card neutral">
          <div className="stat-num">{counts.incomplete}</div>
          <div className="stat-label">Incomplete</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 18 }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, person, email or session ID"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="hint">{loading ? 'Loading…' : `${rows.length} shown`}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Person</th>
              <th>Designation</th>
              <th>Progress</th>
              <th>Score</th>
              <th>Rating</th>
              <th>Status</th>
              <th>Started</th>
              <th>Last Saved</th>
              <th>Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
                  No assessments yet.
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const rt = a.overallScore !== null ? ratingFor(a.overallScore) : null;
                return (
                  <tr key={a.id}>
                    <td>
                      <b>{a.companyName}</b>
                    </td>
                    <td>{a.assessedBy}</td>
                    <td>{a.designation}</td>
                    <td>{a.answeredCount}/50</td>
                    <td>{a.overallScore === null ? '—' : a.overallScore + '%'}</td>
                    <td style={{ color: ratingColor(rt?.key), fontWeight: 600 }}>
                      {rt ? rt.label.split('\u2013')[0].trim() : '—'}
                    </td>
                    <td>{statusBadge(a)}</td>
                    <td>{fmtTime(a.startedAt)}</td>
                    <td>{fmtTime(a.lastSavedAt)}</td>
                    <td>{a.submittedAt ? fmtTime(a.submittedAt) : '—'}</td>
                    <td>
                      <Link className="btn secondary sm" href={`/admin/${a.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="field-hint" style={{ marginTop: 10 }}>
        Incomplete = session started but no questions answered yet. In Progress = at least one answer saved and not yet
        submitted. Last refreshed data is live from the database.
      </p>
      <p className="field-hint">Generated {fmtDateTime(new Date().toISOString())}</p>
    </main>
  );
}
