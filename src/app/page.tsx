import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <h1 className="page-title">DPDP Risk &amp; Compliance Assessment</h1>
      <p className="page-sub">
        A public, QR-code driven assessment built on the Digital Personal Data Protection Act, 2023. Participants
        answer 50 weighted questions across 21 compliance domains and receive an instant rating and gap report.
      </p>

      <div className="grid grid-3">
        <div className="card stat-card">
          <div className="stat-num">50</div>
          <div className="stat-label">Assessment Questions</div>
          <p className="field-hint">DPDP-001 to DPDP-050 across the original compliance domains.</p>
        </div>
        <div className="card stat-card med">
          <div className="stat-num">5</div>
          <div className="stat-label">Rating Bands</div>
          <p className="field-hint">Strong, Moderate, Weak, Poor and Critical — used for the score and report.</p>
        </div>
        <div className="card stat-card neutral">
          <div className="stat-num">1</div>
          <div className="stat-label">Shared QR Code</div>
          <p className="field-hint">Every participant scans the same code and gets an independent session.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Run the assessment
        </div>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Show the QR code on the auditorium screen so participants can scan and start. You can also open the
          assessment link directly.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className="btn lg" href="/qr">
            Show QR Code
          </Link>
          <Link className="btn secondary lg" href="/assessment">
            Open Assessment
          </Link>
          <Link className="btn ghost lg" href="/admin">
            Admin Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
