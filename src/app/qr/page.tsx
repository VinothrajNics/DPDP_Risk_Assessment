'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export default function QrPage() {
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    setBaseUrl(resolveBaseUrl());
  }, []);

  const assessmentUrl = baseUrl ? `${baseUrl}/assessment` : '';

  return (
    <main className="page narrow">
      <div className="card qr-card">
        <h1>DPDP Risk &amp; Compliance Assessment</h1>
        <p className="hint" style={{ margin: 0 }}>
          Scan to start the assessment
        </p>

        <div className="qr-frame">
          {assessmentUrl ? (
            <QRCodeSVG value={assessmentUrl} size={260} level="M" includeMargin />
          ) : (
            <div style={{ width: 260, height: 260 }} />
          )}
        </div>

        <p style={{ margin: '4px 0 0', fontWeight: 600, color: 'var(--navy)' }}>
          Scan this QR code using your phone
        </p>
        <p className="qr-url" style={{ marginTop: 10 }}>
          {assessmentUrl || 'Resolving application URL…'}
        </p>

        {!process.env.NEXT_PUBLIC_APP_URL && (
          <p className="field-hint" style={{ marginTop: 12 }}>
            Using the current browser origin. Set <code>NEXT_PUBLIC_APP_URL</code> in production so the QR code
            always points to the deployed URL.
          </p>
        )}
      </div>
    </main>
  );
}
