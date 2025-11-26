import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Suspense } from 'react';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export const metadata: Metadata = {
  title: 'SparkVertex - 灵枢 | Local-First Tools',
  description: 'Local-First. Offline-Ready. Geek-Approved.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SparkVertex',
  },
};

import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import LoginModal from '@/components/LoginModal';
import DetailModal from '@/components/DetailModal';
import FeedbackModal from '@/components/FeedbackModal';
import EditProfileModal from '@/components/EditProfileModal';
import PaymentQRModal from '@/components/PaymentQRModal';
import PaymentModal from '@/components/PaymentModal';
import RewardModal from '@/components/RewardModal';
import ManageOrdersModal from '@/components/ManageOrdersModal';
import CityBackground from '@/components/CityBackground';
import WeChatGuard from '@/components/WeChatGuard';
import { ModalProvider } from '@/context/ModalContext';
import { ToastProvider } from '@/context/ToastContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link rel="icon" href="/logo.png" />
      </head>
      <body className={inter.className}>
        <WeChatGuard />
        <ToastProvider>
          <ModalProvider>
            <canvas id="fluid-canvas" className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 opacity-20"></canvas>
            <CityBackground />
            <Suspense fallback={<div className="h-16 bg-white/80 backdrop-blur-md fixed top-0 left-0 right-0 z-50 border-b border-gray-100" />}>
              <Navbar />
            </Suspense>
            <main className="min-h-screen">
              {children}
            </main>
            <Footer />
            <LoginModal />
            <DetailModal />
            <FeedbackModal />
            <EditProfileModal />
            <PaymentQRModal />
            <PaymentModal />
            <RewardModal />
            <ManageOrdersModal />
          </ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}