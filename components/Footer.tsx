'use client';

import Image from 'next/image';
import { useModal } from '@/context/ModalContext';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';

export default function Footer() {
  const { openFeedbackModal } = useModal();
  const { t } = useLanguage();
  const pathname = usePathname();

  // Hide Footer on standalone product pages, Homepage (Hero handles it), and Create page (App-like UI)
  if (pathname?.startsWith('/p/') || pathname === '/' || pathname === '/create') return null;

  return (
    <footer className="w-full py-6 pb-24 md:pb-6 mt-0 text-center relative z-10 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 flex flex-col items-center">
        


        <div className="flex justify-center items-center mb-4 opacity-50 hover:opacity-100 transition duration-300">
          <Image 
            src="/logo.png" 
            alt="Logo" 
            width={20}
            height={20}
            className="mr-2 object-contain mix-blend-screen transition"
          />
          <span className="font-bold text-sm text-slate-500 hover:text-slate-300 transition">SparkVertex</span>
        </div>
        <div className="text-slate-700 text-[10px]">
          &copy; 2025 SparkVertex. <button onClick={openFeedbackModal} className="hover:text-brand-400 transition ml-2">{t.nav.feedback}</button>
        </div>
      </div>
    </footer>
  );
}
