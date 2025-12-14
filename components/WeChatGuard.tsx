'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';

export default function WeChatGuard() {
  const [isWeChat, setIsWeChat] = useState(false);
  const { t } = useLanguage();
  const pathname = usePathname();

  useEffect(() => {
    // 只在作品详情页 /p/[id] 显示微信引导
    if (!pathname?.startsWith('/p/')) {
      return;
    }

    const ua = navigator.userAgent.toLowerCase();
    // 检测微信内置浏览器 (MicroMessenger) 和企业微信 (wxwork)
    const isWeChatBrowser = ua.includes('micromessenger') || ua.includes('wxwork');
    
    if (isWeChatBrowser) {
      setIsWeChat(true);
      // Prevent scrolling when overlay is active
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [pathname]);

  if (!isWeChat) return null;

  // 检测是否为 iOS 设备
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-start p-6 text-center overflow-auto">
      {/* 顶部右上角箭头指示 */}
      <div className="fixed top-4 right-4 animate-bounce flex flex-col items-center gap-1">
        <i className="fa-solid fa-arrow-up text-white text-3xl"></i>
        <span className="text-xs text-white/80 bg-black/50 px-2 py-1 rounded-full">{t.wechat_guard.step1}</span>
      </div>

      <div className="mt-24 flex flex-col items-center">
        {/* 微信图标 */}
        <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl">
          <i className="fa-brands fa-weixin text-4xl text-white"></i>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-3">{t.wechat_guard.title}</h2>
        <p className="text-slate-400 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
          {t.wechat_guard.description}
        </p>
        
        {/* 步骤指引 */}
        <div className="bg-white/5 rounded-3xl p-6 border border-white/10 max-w-sm w-full backdrop-blur-md">
          <div className="space-y-4">
            {/* 步骤 1 */}
            <div className="flex items-center gap-4 text-left">
              <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold shrink-0">1</div>
              <div>
                <p className="text-white text-sm font-medium">{t.wechat_guard.step1} <i className="fa-solid fa-ellipsis ml-1 text-slate-400"></i></p>
                <p className="text-xs text-slate-500">{isIOS ? '右上角 ···' : '右上角 ⋮'}</p>
              </div>
            </div>
            
            {/* 步骤 2 */}
            <div className="flex items-center gap-4 text-left">
              <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold shrink-0">2</div>
              <div>
                <p className="text-white text-sm font-medium">{t.wechat_guard.step2}</p>
                <p className="text-xs text-slate-500">{isIOS ? '在 Safari 中打开' : '在浏览器中打开'}</p>
              </div>
            </div>
          </div>
          
          {/* 图示 */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="flex justify-center items-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                  <i className={`fa-brands ${isIOS ? 'fa-safari' : 'fa-chrome'} text-2xl text-white/60`}></i>
                </div>
                <span className="text-[10px] text-slate-500">{isIOS ? 'Safari' : 'Chrome'}</span>
              </div>
              <i className="fa-solid fa-arrow-right text-slate-600"></i>
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 bg-gradient-to-br from-brand-500/20 to-purple-500/20 rounded-xl flex items-center justify-center border border-brand-500/30">
                  <i className="fa-solid fa-check text-xl text-brand-400"></i>
                </div>
                <span className="text-[10px] text-slate-500">完美体验</span>
              </div>
            </div>
          </div>
        </div>

        {/* 底部刷新按钮 */}
        <div className="mt-10">
          <button 
            onClick={() => window.location.reload()}
            className="text-slate-500 text-sm hover:text-white transition flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10 hover:border-white/20"
          >
            <i className="fa-solid fa-rotate-right"></i> {t.wechat_guard.already_in_browser}
          </button>
        </div>
      </div>
    </div>
  );
}
