import type { Metadata, Viewport } from 'next';
import './runner.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata: Metadata = {
  title: 'SparkVertex Runner',
  description: 'Run your apps instantly.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SparkVertex',
  },
};

export default function RunnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/logo.png" />
      </head>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
