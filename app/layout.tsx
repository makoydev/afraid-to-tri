import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Afraid to Tri',
    template: '%s · Afraid to Tri',
  },
  description:
    'Triathlon training for people who want to do one but are quietly terrified of it. A plan that tells you what to do today, and adapts when life gets in the way.',
  applicationName: 'Afraid to Tri',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Afraid to Tri' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
