import type { Metadata, Viewport } from 'next';
import '../globals.css';

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
// import CityBackground from '@/components/CityBackground';
import WeChatGuard from '@/components/WeChatGuard';
import StorageManager from '@/components/StorageManager';
import { ModalProvider } from '@/context/ModalContext';
import { ToastProvider } from '@/context/ToastContext';
import { LanguageProvider } from '@/context/LanguageContext';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import ConsoleSilencer from '@/components/ConsoleSilencer';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        {/* PWA 标准 meta 标签 */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* 显式暴露 manifest，确保浏览器能发现图标 */}
        <link rel="manifest" href="/manifest.json" />
        {/* Preload critical font to avoid "preloaded but not used" warning and improve loading speed */}
        <link rel="preload" href="/fontawesome/webfonts/fa-solid-900.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Font Awesome 本地自托管 - 避免 CDN 依赖，确保国内秒加载 */}
        <link rel="stylesheet" href="/fontawesome/css/all.min.css" />
        {/* DNS Prefetch & Preconnect for critical domains */}
        <link rel="dns-prefetch" href="https://waesizzoqodntrlvrwhw.supabase.co" />
        <link rel="preconnect" href="https://waesizzoqodntrlvrwhw.supabase.co" crossOrigin="anonymous" />
        <link rel="icon" href="/logo.png" />
      </head>
      <body className={systemFontClass}>
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
