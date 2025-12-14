import type { Metadata, Viewport } from 'next';
import '../globals.css';

const systemFontClass = 'font-sans';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export const metadata: Metadata = {
  title: 'SparkVertex Runner',
  description: 'Run your apps instantly.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SparkVertex',
  },
};

import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import ConsoleSilencer from '@/components/ConsoleSilencer';

export default function RunnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/logo.png" />
      </head>
      <body className={systemFontClass}>
        <ServiceWorkerRegister />
        <main className="min-h-screen bg-white">
          {children}
        </main>
        <ConsoleSilencer />
      </body>
    </html>
  );
}
