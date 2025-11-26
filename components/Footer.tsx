'use client';

import { useModal } from '@/context/ModalContext';
import { usePathname } from 'next/navigation';

export default function Footer() {
  const { openFeedbackModal } = useModal();
  const pathname = usePathname();

  // Hide Footer on standalone product pages
  if (pathname?.startsWith('/p/')) return null;

  return (
    <footer className="bg-slate-900 border-t border-slate-800 py-12 mt-12">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <div className="flex justify-center items-center mb-6">
          <img 
            src="/logo.png" 
            alt="Logo" 
            className="w-6 h-6 mr-2 object-contain mix-blend-screen" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="font-bold text-lg">SparkVertex</span>
        </div>
        <p className="text-slate-500 text-sm mb-6">Local-First. Offline-Ready. Geek-Approved.</p>
        <div className="text-slate-600 text-xs">
          &copy; 2025 SparkVertex. All rights reserved.
          <button onClick={openFeedbackModal} className="hover:text-brand-400 transition ml-4">问题反馈</button>
        </div>
      </div>
    </footer>
  );
}
