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
import PaymentModal from '@/components/PaymentModal';
import RewardModal from '@/components/RewardModal';
import CreditPurchaseModal from '@/components/CreditPurchaseModal';
import ConfirmModal from '@/components/ConfirmModal';
import CityBackground from '@/components/CityBackground';
import WeChatGuard from '@/components/WeChatGuard';
import StorageManager from '@/components/StorageManager';
import { ModalProvider } from '@/context/ModalContext';
import { ToastProvider } from '@/context/ToastContext';
import { LanguageProvider } from '@/context/LanguageContext';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import ConsoleSilencer from '@/components/ConsoleSilencer';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        {/* DNS Prefetch & Preconnect for critical domains */}
        <link rel="dns-prefetch" href="https://waesizzoqodntrlvrwhw.supabase.co" />
        <link rel="preconnect" href="https://waesizzoqodntrlvrwhw.supabase.co" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.bootcdn.net" />
        <link rel="preconnect" href="https://cdn.bootcdn.net" crossOrigin="anonymous" />
        
        {/* 预加载关键资源 */}
        <link rel="preload" href="/logo.png" as="image" />
        
        {/* 使用 BootCDN 加载 Font Awesome（国内访问稳定） */}
        <link 
          rel="stylesheet" 
          href="https://cdn.bootcdn.net/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
        />
        <link rel="icon" href="/logo.png" />
      </head>
      <body className={inter.className}>
        <StorageManager />
        <ServiceWorkerRegister />
        <LanguageProvider>
          <WeChatGuard />
          <ToastProvider>
            <ModalProvider>
              <canvas id="fluid-canvas" className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 opacity-20"></canvas>
              {/* <CityBackground /> */}
              <Navbar />
              <main className="min-h-screen pb-0">
                {children}
              </main>
              <Footer />
              <LoginModal />
              <DetailModal />
              <FeedbackModal />
              <EditProfileModal />
              <PaymentModal />
              <RewardModal />
              <CreditPurchaseModal />
              <ConfirmModal />
            </ModalProvider>
          </ToastProvider>
        </LanguageProvider>
        <ConsoleSilencer />
      </body>
    </html>
  );
}