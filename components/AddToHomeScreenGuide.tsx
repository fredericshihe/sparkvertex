'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';

interface AddToHomeScreenGuideProps {
  isActive?: boolean;
}

export default function AddToHomeScreenGuide({ isActive = true }: AddToHomeScreenGuideProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (!isActive) {
      setShowGuide(false);
      return;
    }

    // Check if running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    // Check if mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile && !isStandalone) {
      setShowGuide(true);
      setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    }
  }, [isActive]);

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
          </div>
        </div>
        
        {/* Pointing Arrow */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-black/80 border-b border-r border-brand-500/50 rotate-45 backdrop-blur-xl"></div>
      </div>
    </div>
  );
}
