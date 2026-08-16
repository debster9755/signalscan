import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignalScan — Opportunity Scan',
  description:
    'One scored, cited, human-approved agentic marketing recommendation with a business case.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
