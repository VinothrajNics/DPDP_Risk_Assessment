'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReportDocument from '@/components/ReportDocument';
import { ApiError, applyTokenFromUrl, getReport, type ReportResponse } from '@/lib/api-client';
import { printPage } from '@/lib/print';

export default function ParticipantReportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState('');
  const autoPrinted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    applyTokenFromUrl(id);
    getReport(id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load the report.');
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
        <div className="empty-state">{error}</div>
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
        <Link className="btn ghost" href={`/assessment/${id}`}>
          &larr; Back
        </Link>
        <span className="spacer" />
        <button className="btn" onClick={() => printPage()}>
          &#128438; Print / Save as PDF
        </button>
      </div>
      <div className="page">
        <ReportDocument data={data} audience="participant" />
      </div>
    </>
  );
}
