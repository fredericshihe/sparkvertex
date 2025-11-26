import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'SparkVertex - 灵枢 | Local-First Tools',
  description: 'Local-First. Offline-Ready. Geek-Approved.',
  // manifest: '/manifest.json', // Temporarily disabled to fix 404
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
import ManageOrdersModal from '@/components/ManageOrdersModal';
import CityBackground from '@/components/CityBackground';
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
      </head>
      <body className={inter.className}>
        <ToastProvider>
          <ModalProvider>
            <canvas id="fluid-canvas" className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 opacity-20"></canvas>
            <CityBackground />
            <Navbar />
          {children}
          <Footer />
          <LoginModal />
          <DetailModal />
          <FeedbackModal />
          <EditProfileModal />
          <PaymentQRModal />
          <PaymentModal />
            <ManageOrdersModal />
          </ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}