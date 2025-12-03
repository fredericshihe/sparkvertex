'use client';

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
    <footer className="w-full py-6 mt-0 text-center relative z-10 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 flex flex-col items-center">
        
        {/* Product Hunt Badge */}
        <div className="mb-4 hover:scale-105 transition-transform duration-300">
          <a href="https://www.producthunt.com/products/spark-vertex-ai-app-generator?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-spark-vertex-ai-app-generator" target="_blank">
            <img 
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1045334&theme=dark&t=1764722115808" 
              alt="Spark Vertex - AI App Generator - Turn text into production-ready React apps in seconds ⚡️ | Product Hunt" 
              style={{ width: '250px', height: '54px' }} 
              width="250" 
              height="54" 
            />
          </a>
        </div>

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
          &copy; 2025 SparkVertex. <button onClick={openFeedbackModal} className="hover:text-brand-400 transition ml-2">{t.nav.feedback}</button>
        </div>
      </div>
    </footer>
  );
}
