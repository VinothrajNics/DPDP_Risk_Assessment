'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/assessment', label: 'Start Assessment' },
  { href: '/qr', label: 'QR Code' },
  { href: '/admin', label: 'Admin' },
];

export default function TopNav() {
  const pathname = usePathname();
  const isReport = pathname?.includes('/report');
  if (isReport) return null;

  return (
    <nav className="topnav no-print">
      <div className="brand">
        <span className="brand-mark">DP</span>
        <span>
          DPDP Risk Assessment
          <small>Digital Personal Data Protection Act, 2023</small>
        </span>
      </div>
      <span className="spacer" />
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            'navlink ' +
            (l.href === '/' ? (pathname === '/' ? 'active' : '') : pathname?.startsWith(l.href) ? 'active' : '')
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
