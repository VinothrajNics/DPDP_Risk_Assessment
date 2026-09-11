'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReportDocument from '@/components/ReportDocument';
import { ApiError, getReport, type ReportResponse } from '@/lib/api-client';
import { printPage } from '@/lib/print';

export default function AdminReportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState('');
  const autoPrinted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getReport(id, true)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 401
              ? 'Unauthorized. Please sign in to the admin dashboard.'
              : 'Could not load the report.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!data) return;
    const shouldPrint = new URLSearchParams(window.location.search).get('print');
    if (!shouldPrint || autoPrinted.current) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled || autoPrinted.current) return;
      autoPrinted.current = true;
      printPage();
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [data]);

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

  if (!data) {
    return (
      <main className="page">
        <div className="empty-state">Preparing report…</div>
      </main>
    );
  }

  return (
    <>
      <div className="report-toolbar no-print">
        <Link className="btn ghost" href={`/admin/${id}`}>
          &larr; Back
        </Link>
        <span className="spacer" />
        <button className="btn" onClick={() => printPage()}>
          &#128438; Print / Save as PDF
        </button>
      </div>
      <div className="page">
        <ReportDocument data={data} audience="admin" />
      </div>
    </>
  );
}
