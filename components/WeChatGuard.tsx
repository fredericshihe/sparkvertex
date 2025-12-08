'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

export default function WeChatGuard() {
  const [isWeChat, setIsWeChat] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    // Check for WeChat (MicroMessenger)
    if (ua.includes('micromessenger')) {
      setIsWeChat(true);
      // Prevent scrolling when overlay is active
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!isWeChat) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6 shadow-xl border border-white/10 backdrop-blur-md">
        <i className="fa-brands fa-safari text-4xl text-brand-500"></i>
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-4">{t.wechat_guard.title}</h2>
      <p className="text-slate-400 mb-8 max-w-xs mx-auto">
        {t.wechat_guard.description}
      </p>
      
      <div className="bg-white/5 rounded-3xl p-6 border border-white/10 max-w-xs w-full backdrop-blur-md">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold border border-white/5">1</div>
            <span className="text-xs text-slate-400">{t.wechat_guard.step1} <i className="fa-solid fa-ellipsis"></i></span>
          </div>
          <div className="w-8 h-[1px] bg-white/10"></div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold border border-white/5">2</div>
            <span className="text-xs text-slate-400">{t.wechat_guard.step2} <i className="fa-regular fa-compass"></i></span>
          </div>
        </div>
        <div className="text-xs text-slate-500 border-t border-white/10 pt-4 mt-2">
          <p className="mb-2">{t.wechat_guard.how_to}</p>
          <div className="flex justify-center gap-2 text-xl text-slate-400">
            <i className="fa-brands fa-android"></i>
            <i className="fa-brands fa-apple"></i>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <button 
          onClick={() => window.location.reload()}
          className="text-slate-500 text-sm hover:text-white transition flex items-center gap-2"
        >
          <i className="fa-solid fa-rotate-right"></i> {t.wechat_guard.already_in_browser} {t.wechat_guard.refresh}
        </button>
      </div>
      
      {/* Arrow pointing to top right */}
      <div className="fixed top-4 right-6 animate-bounce text-white text-4xl">
        <i className="fa-solid fa-arrow-up-right-from-square"></i>
      </div>
    </div>
  );
}
