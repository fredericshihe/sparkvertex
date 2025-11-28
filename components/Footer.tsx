'use client';

import { useModal } from '@/context/ModalContext';
import { usePathname } from 'next/navigation';

export default function Footer() {
  const { openFeedbackModal } = useModal();
  const pathname = usePathname();

  // Hide Footer on standalone product pages and Homepage (Hero handles it)
  if (pathname?.startsWith('/p/') || pathname === '/') return null;

  return (
    <footer className="w-full py-6 mt-0 text-center relative z-10 bg-transparent">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-center items-center mb-4 opacity-50 hover:opacity-100 transition duration-300">
          <img 
            src="/logo.png" 
            alt="Logo" 
            className="w-5 h-5 mr-2 object-contain mix-blend-screen transition" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="font-bold text-sm text-slate-500 hover:text-slate-300 transition">SparkVertex</span>
        </div>
        <div className="text-slate-700 text-[10px]">
          &copy; 2025 SparkVertex. <button onClick={openFeedbackModal} className="hover:text-brand-400 transition ml-2">反馈</button>
        </div>
      </div>
    </footer>
  );
}
