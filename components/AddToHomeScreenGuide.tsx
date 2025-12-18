'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';

interface AddToHomeScreenGuideProps {
  isActive?: boolean;
}

export default function AddToHomeScreenGuide({ isActive = true }: AddToHomeScreenGuideProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null); // 存储安装事件
  const { t } = useLanguage();

  useEffect(() => {
    if (!isActive) {
      setShowGuide(false);
      return;
    }

    // 1. 监听浏览器的安装事件 (Android / Desktop Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // 阻止默认的横幅
      setDeferredPrompt(e); // 保存事件，供稍后触发
      setShowGuide(true); // 显示自定义 UI
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 2. 检查环境 (iOS / 已安装状态)
    const ua = navigator.userAgent.toLowerCase();
    const isWeChat = ua.includes('micromessenger') || ua.includes('wxwork');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    const isDeviceIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    setIsIOS(isDeviceIOS);

    // 如果是 iOS 且未安装，或者是 Android 但还没触发事件（作为兜底），显示指引
    // 注意：Android 通常等待 beforeinstallprompt 触发后再显示，体验更好
    if (!isStandalone && !isWeChat) {
        if (isDeviceIOS) {
            setShowGuide(true);
        }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isActive]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // 触发原生安装弹窗
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowGuide(false);
      }
    } else {
      // iOS 或不支持自动安装的环境，仅关闭弹窗（用户需手动操作）
      setShowGuide(false);
    }
  };

  if (!showGuide) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[10000] p-4 pointer-events-none flex justify-center pb-8">
      <div className="bg-black/80 backdrop-blur-xl border border-brand-500/50 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-3xl p-4 max-w-sm w-full pointer-events-auto animate-bounce-in-up relative ring-1 ring-white/5">
        <button 
          onClick={() => setShowGuide(false)}
          className="absolute -top-2 -right-2 w-6 h-6 bg-white/10 rounded-full text-white flex items-center justify-center text-xs shadow-lg backdrop-blur-md border border-white/10"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
        
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0 text-brand-400">
            <i className="fa-solid fa-mobile-screen-button text-2xl"></i>
          </div>
          <div>
            <h3 className="font-bold text-white text-sm mb-1">{t.pwa_guide.title}</h3>
            <p className="text-slate-400 text-xs mb-3">
              {t.pwa_guide.description}
            </p>
            
            {/* 核心修改：如果是 Android/Desktop 且捕获了事件，显示可点击的安装按钮 */}
            {deferredPrompt ? (
               <button 
                 onClick={handleInstallClick}
                 className="w-full mt-1 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
               >
                 <i className="fa-solid fa-download"></i>
                 点击安装应用
               </button>
            ) : (
                // iOS 或无事件时的静态指引
                <div className="flex items-center gap-2 text-xs text-brand-300 font-bold bg-brand-500/10 px-3 py-2 rounded-lg">
                  {isIOS ? (
                    <>
                      <span>{t.pwa_guide.ios_step1}</span>
                      <i className="fa-solid fa-arrow-up-from-bracket text-base mx-1"></i>
                      <span>{t.pwa_guide.ios_step2}</span>
                    </>
                  ) : (
                    <>
                      <span>{t.pwa_guide.android_step1}</span>
                      <i className="fa-solid fa-ellipsis-vertical text-base mx-1"></i>
                      <span>{t.pwa_guide.android_step2}</span>
                    </>
                  )}
                </div>
            )}
          </div>
        </div>
        
        {/* Pointing Arrow (仅在非自动安装模式下显示) */}
        {!deferredPrompt && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/80 border-b border-r border-brand-500/50 rotate-45 backdrop-blur-xl"></div>
        )}
      </div>
    </div>
  );
}
