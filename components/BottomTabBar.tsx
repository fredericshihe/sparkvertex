'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';

export default function BottomTabBar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  // Hide on Create page (it has its own layout) or App mode
  if (pathname === '/create' || pathname?.startsWith('/p/') || pathname?.includes('/preview/')) return null;

  const isActive = (path: string) => pathname === path;

  return (
    <div className="md:hidden fixed bottom-0 left-0 w-full z-50 pb-safe bg-black/80 backdrop-blur-xl border-t border-white/10">
      <div className="flex items-center justify-around h-16 px-2">
        <Link 
          href="/" 
          className={`flex flex-col items-center justify-center w-14 h-full space-y-1 active-scale ${isActive('/') ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
        >
          <i className={`fa-solid fa-house text-xl ${isActive('/') ? 'text-brand-400' : ''}`}></i>
          <span className="text-[10px] font-medium">{t.nav.home}</span>
        </Link>

        <Link 
          href="/explore" 
          className={`flex flex-col items-center justify-center w-14 h-full space-y-1 active-scale ${isActive('/explore') ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
        >
          <i className={`fa-solid fa-compass text-xl ${isActive('/explore') ? 'text-brand-400' : ''}`}></i>
          <span className="text-[10px] font-medium">{t.nav.explore}</span>
        </Link>

        <Link 
          href="/create" 
          className="flex flex-col items-center justify-center w-16 h-full -mt-6 active-scale"
        >
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-brand-600 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30 border border-white/20">
            <i className="fa-solid fa-wand-magic-sparkles text-2xl text-white"></i>
          </div>
          <span className="text-[10px] font-medium text-white mt-1">{t.nav.create}</span>
        </Link>

        <Link 
          href="/upload" 
          className={`flex flex-col items-center justify-center w-14 h-full space-y-1 active-scale ${isActive('/upload') ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
        >
          <i className={`fa-solid fa-cloud-arrow-up text-xl ${isActive('/upload') ? 'text-brand-400' : ''}`}></i>
          <span className="text-[10px] font-medium">{t.nav.upload}</span>
        </Link>

        <Link 
          href="/profile" 
          className={`flex flex-col items-center justify-center w-14 h-full space-y-1 active-scale ${isActive('/profile') ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
        >
          <i className={`fa-solid fa-user text-xl ${isActive('/profile') ? 'text-brand-400' : ''}`}></i>
          <span className="text-[10px] font-medium">{t.nav.profile}</span>
        </Link>
      </div>
    </div>
  );
}
