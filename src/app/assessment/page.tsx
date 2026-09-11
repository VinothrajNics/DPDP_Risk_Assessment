'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  findLocalSession,
  getAssessment,
  lookupAssessment,
  removeLocalSession,
  startAssessment,
} from '@/lib/api-client';
import { fmtDateTime } from '@/lib/format';
import type { Assessment } from '@/lib/types';

type Modal =
  | { kind: 'resume'; assessment: Assessment }
  | { kind: 'submitted'; assessment: Assessment }
  | { kind: 'exists'; status: 'in_progress' | 'submitted' };

export default function AssessmentEntryPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [assessedBy, setAssessedBy] = useState('');
  const [designation, setDesignation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);

  const details = () => ({
    companyName,
    assessedBy,
    designation,
    email: email || undefined,
    phone: phone || undefined,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!companyName.trim() || !assessedBy.trim() || !designation.trim()) {
      setError('Company name, person name and designation are required.');
      return;
    }
    setBusy(true);
    try {
      // 1) Resume is only possible with the capability token this browser holds.
      const local = findLocalSession({ companyName, assessedBy, designation });
      if (local) {
        try {
          const { assessment } = await getAssessment(local.id);
          setModal({
            kind: assessment.status === 'SUBMITTED' ? 'submitted' : 'resume',
            assessment,
          });
          setBusy(false);
          return;
        } catch {
          removeLocalSession(local.id);
        }
      }

      // 2) Server-side existence check returns ONLY a status (no token).
      const found = await lookupAssessment(details());
      if (found.status === 'none') {
        const { assessment } = await startAssessment(details());
        router.push(`/assessment/${assessment.id}`);
        return;
      }
      setModal({ kind: 'exists', status: found.status });
      setBusy(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the assessment. Please try again.');
      setBusy(false);
    }
  };

  const createNew = async () => {
    setBusy(true);
    try {
      const { assessment } = await startAssessment(details());
      router.push(`/assessment/${assessment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the assessment. Please try again.');
      setBusy(false);
      setModal(null);
    }
  };

  const openLocal = () => {
    if (modal && (modal.kind === 'resume' || modal.kind === 'submitted')) {
      router.push(`/assessment/${modal.assessment.id}`);
    }
  };

  return (
    <main className="page narrow">
      <h1 className="page-title">Start your DPDP Risk &amp; Compliance Assessment</h1>
      <p className="page-sub">
        Answer 50 weighted questions covering governance, data management, consent, rights, security and more. Your
        answers are saved automatically so you can refresh or continue later.
      </p>

      <form className="card" onSubmit={submit}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Participant Details
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>
              Company Name <span className="req">*</span>
            </label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="ABC Technologies" />
          </div>
          <div className="form-row">
            <label>
              Person Name <span className="req">*</span>
            </label>
            <input value={assessedBy} onChange={(e) => setAssessedBy(e.target.value)} placeholder="Rahul Kumar" />
          </div>
          <div className="form-row">
            <label>
              Designation <span className="req">*</span>
            </label>
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="IT Manager" />
          </div>
          <div className="form-row">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </div>
          <div className="form-row">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button className="btn lg" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : 'Start Assessment'}
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 12 }}>
          A unique, private assessment session is created for you. If you already started or submitted an assessment in
          this browser, you will be offered the option to continue it.
        </p>
      </form>

      {modal && (
        <div className="modal-overlay open no-print" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {modal.kind === 'resume' && 'Continue Assessment'}
                {modal.kind === 'submitted' && 'Assessment Already Submitted'}
                {modal.kind === 'exists' && 'Existing Assessment Found'}
              </h3>
            </div>
            <div className="modal-body">
              {(modal.kind === 'resume' || modal.kind === 'submitted') && (
                <p style={{ marginTop: 0 }}>
                  An assessment for <b>{modal.assessment.companyName}</b> &mdash;{' '}
                  <b>{modal.assessment.assessedBy}</b> ({modal.assessment.designation})
                  {modal.kind === 'submitted' ? (
                    <>
                      {' '}
                      was already submitted on{' '}
                      <b>{fmtDateTime(modal.assessment.submittedAt || modal.assessment.lastSavedAt)}</b>. Click{' '}
                      <b>OK</b> to view the result and the generated report.
                    </>
                  ) : (
                    <>
                      {' '}
                      is already in progress. Click <b>Continue</b> to resume from where you stopped.
                    </>
                  )}
                </p>
              )}
              {modal.kind === 'exists' && (
                <p style={{ marginTop: 0 }}>
                  An assessment with these details already exists
                  {modal.status === 'submitted' ? ' and has been submitted' : ' and is in progress'}. For security, it
                  can only be opened from the browser/device where it was started, or through the participant&apos;s
                  saved resume link.
                  <br />
                  <br />
                  You may go back and open it on that device, or start a new assessment. Starting a new one creates a
                  separate session.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn ghost" onClick={() => setModal(null)}>
                {modal.kind === 'exists' ? 'Go Back' : 'Cancel'}
              </button>
              {(modal.kind === 'resume' || modal.kind === 'submitted') && (
                <button className="btn" onClick={openLocal}>
                  {modal.kind === 'submitted' ? 'OK' : 'Continue'}
                </button>
              )}
              {modal.kind === 'exists' && (
                <button className="btn" onClick={createNew} disabled={busy}>
                  {busy ? 'Starting…' : 'Start New Assessment'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
