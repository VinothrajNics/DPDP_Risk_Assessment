import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'DPDP Risk & Compliance Assessment',
  description:
    'Public DPDP Risk & Compliance Assessment — scan, answer 50 questions and receive a rating and gap report.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
