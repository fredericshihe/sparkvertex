'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

interface HeroProps {
  initialItems?: any[];
}

export default function Hero({ initialItems = [] }: HeroProps) {
  const { t, language } = useLanguage();
  const [typingText, setTypingText] = useState(t.home.typing_texts[0]);

  useEffect(() => {
    const texts = t.home.typing_texts;
    let count = 0;
    let index = 0;
    let currentText = '';
    let letter = '';

    const type = () => {
      if (count === texts.length) {
        count = 0;
      }
      currentText = texts[count];
      letter = currentText.slice(0, ++index);

      setTypingText(letter);

      if (letter.length === currentText.length) {
        count++;
        index = 0;
        setTimeout(type, 2000);
      } else {
        setTimeout(type, 150);
      }
    };

    const timer = setTimeout(type, 2000);
    return () => clearTimeout(timer);
  }, [language]);

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden bg-transparent">
      
      {/* Content Overlay */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        
        {/* Smart Developer Badge */}
        <div className="inline-flex relative group cursor-default mb-8 select-none">
            {/* Hazy Illuminated Contour */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full opacity-0 group-hover:opacity-100 blur transition duration-500 group-hover:duration-200 transform-gpu"></div>
            <div className="absolute -inset-2 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 rounded-full opacity-0 group-hover:opacity-30 blur-xl transition duration-500 group-hover:duration-200 transform-gpu"></div>

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

        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-tight mb-6 text-white drop-shadow-2xl">
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
            className="px-8 py-4 rounded-full bg-white text-black font-bold text-lg hover:bg-slate-200 transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center gap-2"
          >
            <i className="fa-solid fa-wand-magic-sparkles"></i>
            {t.home.hero_create_cta || t.nav.create}
          </Link>
          
          <Link 
            href="/explore"
            className="px-8 py-4 rounded-full bg-white/10 text-white font-bold text-lg border border-white/20 hover:bg-white/20 transition-all backdrop-blur-sm flex items-center gap-2"
          >
            <i className="fa-solid fa-compass"></i>
            {t.home.explore_ideas}
          </Link>
        </div>

        {/* Use Cases Tags */}
        <div className="mt-12 flex flex-wrap justify-center gap-3 opacity-80">
            {[
                { icon: 'fa-gamepad', text: t.home.use_cases?.games || '原创网页小游戏' },
                { icon: 'fa-user-tie', text: t.home.use_cases?.personal || '个人作品集网站' },
                { icon: 'fa-store', text: t.home.use_cases?.storefront || '超级个体预约门面' },
                { icon: 'fa-graduation-cap', text: t.home.use_cases?.courseware || '教学课件' }
            ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-slate-300 text-sm backdrop-blur-sm">
                <i className={`fa-solid ${item.icon} text-brand-400`}></i>
                <span>{item.text}</span>
                </div>
            ))}
        </div>

      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/50 pointer-events-none">
        <i className="fa-solid fa-chevron-down text-2xl"></i>
      </div>
    </div>
  );
}
