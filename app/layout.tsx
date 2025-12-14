import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Suspense } from 'react';
import Script from 'next/script';

// 使用系统字体替代 Google Fonts，避免国内访问问题
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
        <link rel="icon" href="/logo.png" />
      </head>
      <body className={systemFontClass}>
        {/* Font Awesome 优化加载 - 添加 font-display: swap 防止 FOIT */}
        <Script
          id="font-awesome-loader"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              // 1. 先注入 font-display: swap 规则，防止字体加载时图标不可见
              var style = document.createElement('style');
              style.textContent = '@font-face { font-family: "Font Awesome 6 Free"; font-display: swap; } @font-face { font-family: "Font Awesome 6 Brands"; font-display: swap; }';
              document.head.appendChild(style);
              
              // 2. 加载 Font Awesome CSS
              var link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = 'https://cdn.bootcdn.net/ajax/libs/font-awesome/6.4.0/css/all.min.css';
              document.head.appendChild(link);
            `
          }}
        />
        <StorageManager />
        <ServiceWorkerRegister />
        <LanguageProvider>
          <WeChatGuard />
          <ToastProvider>
            <ModalProvider>
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