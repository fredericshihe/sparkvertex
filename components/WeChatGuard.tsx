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
    <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-slate-700">
        <i className="fa-brands fa-safari text-4xl text-brand-500"></i>
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-4">{t.wechat_guard.title}</h2>
      <p className="text-slate-400 mb-8 max-w-xs mx-auto">
        {t.wechat_guard.description}
      </p>
      
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 max-w-xs w-full">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">1</div>
            <span className="text-xs text-slate-400">{t.wechat_guard.step1} <i className="fa-solid fa-ellipsis"></i></span>
          </div>
          <div className="w-8 h-[1px] bg-slate-600"></div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">2</div>
            <span className="text-xs text-slate-400">{t.wechat_guard.step2} <i className="fa-regular fa-compass"></i></span>
          </div>
        </div>
        <div className="text-xs text-slate-500 border-t border-slate-700/50 pt-4 mt-2">
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
