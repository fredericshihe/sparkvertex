'use client';

import { useState, useEffect } from 'react';

export default function AddToHomeScreenGuide() {
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    // Check if mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile && !isStandalone) {
      setShowGuide(true);
      setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    }
  }, []);

  if (!showGuide) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-4 pointer-events-none flex justify-center pb-8">
      <div className="bg-slate-900/90 backdrop-blur-md border border-brand-500/50 shadow-2xl shadow-brand-500/20 rounded-2xl p-4 max-w-sm w-full pointer-events-auto animate-bounce-in-up relative">
        <button 
          onClick={() => setShowGuide(false)}
          className="absolute -top-2 -right-2 w-6 h-6 bg-slate-700 rounded-full text-white flex items-center justify-center text-xs shadow-lg"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
        
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0 text-brand-400">
            <i className="fa-solid fa-mobile-screen-button text-2xl"></i>
          </div>
          <div>
            <h3 className="font-bold text-white text-sm mb-1">获得最佳全屏体验</h3>
            <p className="text-slate-400 text-xs mb-3">
              将此应用添加到主屏幕，即可像原生 App 一样全屏运行，无浏览器干扰。
            </p>
            
            <div className="flex items-center gap-2 text-xs text-brand-300 font-bold bg-brand-500/10 px-3 py-2 rounded-lg">
              {isIOS ? (
                <>
                  <span>点击底部</span>
                  <i className="fa-solid fa-arrow-up-from-bracket text-base mx-1"></i>
                  <span>选择"添加到主屏幕"</span>
                </>
              ) : (
                <>
                  <span>点击右上角菜单</span>
                  <i className="fa-solid fa-ellipsis-vertical text-base mx-1"></i>
                  <span>选择"安装应用"</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Pointing Arrow */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900/90 border-b border-r border-brand-500/50 rotate-45"></div>
      </div>
    </div>
  );
}
