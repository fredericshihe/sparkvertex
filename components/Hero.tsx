'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

interface HeroProps {
  // No props needed
}

export default function Hero({}: HeroProps) {
  const { t, language } = useLanguage();
  const [typingText, setTypingText] = useState('');

  useEffect(() => {
    const texts = t.home.typing_texts;
    if (!texts || texts.length === 0) return;
    
    let count = 0;
    let index = 0;
    let timeoutId: NodeJS.Timeout;

    const type = () => {
      const currentText = texts[count];
      
      if (index < currentText.length) {
        // 正在打字
        index++;
        setTypingText(currentText.slice(0, index));
        timeoutId = setTimeout(type, 80); // 加快打字速度
      } else {
        // 当前文字打完，等待后切换下一段
        count = (count + 1) % texts.length;
        index = 0;
        timeoutId = setTimeout(type, 2000);
      }
    };

    // 立即开始打字，无延迟
    type();
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [t.home.typing_texts, language]);

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-transparent py-20 pb-32 md:pb-20">
      
      {/* Content Overlay */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        
        {/* Smart Developer Badge */}
        <div className="inline-flex relative group cursor-default mb-8 select-none">
            {/* Hazy Illuminated Contour */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full opacity-0 group-hover:opacity-100 blur transition duration-500 group-hover:duration-200 transform-gpu will-change-[opacity]"></div>
            <div className="absolute -inset-2 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full opacity-0 group-hover:opacity-30 blur-xl transition duration-500 group-hover:duration-200 transform-gpu will-change-[opacity]"></div>

            <div className="relative px-6 py-2.5 bg-zinc-900/90 ring-1 ring-white/10 rounded-full leading-none flex items-center gap-3 backdrop-blur-sm shadow-2xl">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-purple-600 text-white shadow-lg shadow-brand-500/20">
                <i className="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
            </div>
            <div className="flex items-center">
                <span className="font-mono text-slate-200 font-bold tracking-wide text-sm md:text-base">{typingText}</span>
                <span className="w-1.5 h-4 bg-brand-400 ml-2 animate-pulse rounded-full"></span>
            </div>
            </div>
        </div>

        <h1 className="text-4xl md:text-7xl font-bold tracking-tighter leading-tight mb-6 text-white drop-shadow-2xl">
          {t.home.hero_title_1}
          <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            {t.home.hero_title_2}
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-300 leading-relaxed mb-10 max-w-2xl mx-auto drop-shadow-md">
          {t.home.hero_desc}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link 
            href="/create"
            prefetch={true}
            className="px-8 py-4 rounded-full bg-white text-black font-bold text-lg hover:bg-slate-200 transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center gap-2"
          >
            <i className="fa-solid fa-wand-magic-sparkles"></i>
            {t.home.hero_create_cta || t.nav.create}
          </Link>
        </div>

        {/* Use Cases Tags */}
        <div className="mt-16 grid grid-cols-2 md:flex md:flex-row justify-center gap-4 max-w-2xl mx-auto px-4">
            {[
                { icon: 'fa-gamepad', text: t.home.use_cases?.games || '网页游戏', category: 'game', color: 'from-purple-500 to-indigo-500' },
                { icon: 'fa-user-tie', text: t.home.use_cases?.personal || '个人主页', category: 'portfolio', color: 'from-blue-500 to-cyan-500' },
                { icon: 'fa-store', text: t.home.use_cases?.storefront || '服务预约', category: 'appointment', color: 'from-emerald-500 to-teal-500' },
                { icon: 'fa-graduation-cap', text: t.home.use_cases?.courseware || '教学课件', category: 'education', color: 'from-orange-500 to-amber-500' }
            ].map((item, i) => (
                <Link 
                  key={i} 
                  href={`/explore?category=${item.category}`} 
                  className="group relative flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/10 overflow-hidden"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}></div>
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center text-white shadow-lg`}>
                    <i className={`fa-solid ${item.icon} text-xs`}></i>
                  </div>
                  <span className="text-slate-300 font-medium text-sm group-hover:text-white transition-colors">{item.text}</span>
                </Link>
            ))}
        </div>

      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/50 pointer-events-none">
        <i className="fa-solid fa-chevron-down text-2xl"></i>
      </div>

      {/* Legal Footer - Required for Paddle compliance */}
      <div className="absolute bottom-2 left-0 right-0 flex flex-wrap justify-center gap-3 md:gap-6 text-[10px] md:text-xs text-slate-600 px-4">
        <Link href="/legal/privacy" className="hover:text-slate-400 transition">
          {language === 'zh' ? '隐私政策' : 'Privacy Policy'}
        </Link>
        <span className="text-slate-700">|</span>
        <Link href="/legal/terms" className="hover:text-slate-400 transition">
          {language === 'zh' ? '服务条款' : 'Terms of Service'}
        </Link>
        <span className="text-slate-700">|</span>
        <Link href="/legal/refund" className="hover:text-slate-400 transition">
          {language === 'zh' ? '退款政策' : 'Refund Policy'}
        </Link>
        <span className="text-slate-700">|</span>
        <Link href="/legal/contact" className="hover:text-slate-400 transition">
          {language === 'zh' ? '联系我们' : 'Contact'}
        </Link>
      </div>
    </div>
  );
}
