'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';

export default function Why() {
  const { t } = useLanguage();

  return (
    <div className="page-section relative z-10 pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-10">{t.why.title}</h2>
          
          {/* Era Background Description */}
          <div className="max-w-4xl mx-auto relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/20 to-purple-500/20 rounded-2xl blur-xl opacity-50"></div>
            <div className="relative bg-slate-900/50 border border-slate-700/50 rounded-2xl p-8 md:p-10 backdrop-blur-sm">
              <div className="inline-block px-4 py-1 rounded-full bg-brand-500/10 text-brand-400 text-sm font-bold mb-4 border border-brand-500/20">{t.why.badge}</div>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">{t.why.subtitle}</h3>
              <p className="text-xl text-slate-300 mb-4 font-medium">
                {t.why.desc_short}
              </p>
              <p className="text-lg text-slate-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.why.desc_long }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Feature 1: AI Enhanced */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-brand-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-brand-500/20"></div>
            <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-brand-500/20">
              <i className="fa-solid fa-wand-magic-sparkles text-3xl text-brand-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">{t.why.features.ai.title}</h3>
            <p className="text-slate-400 leading-relaxed flex-grow" dangerouslySetInnerHTML={{ __html: t.why.features.ai.desc }} />
          </div>

          {/* Feature 2: Instant Monetization */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-green-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-green-500/20"></div>
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-green-500/20">
              <i className="fa-solid fa-hand-holding-dollar text-3xl text-green-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">{t.why.features.money.title}</h3>
            <p className="text-slate-400 leading-relaxed flex-grow" dangerouslySetInnerHTML={{ __html: t.why.features.money.desc }} />
          </div>

          {/* Feature 3: Open Source Learning */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-purple-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-purple-500/20"></div>
            <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-purple-500/20">
              <i className="fa-solid fa-code-branch text-3xl text-purple-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">{t.why.features.prompt.title}</h3>
            <p className="text-slate-400 leading-relaxed flex-grow" dangerouslySetInnerHTML={{ __html: t.why.features.prompt.desc }} />
          </div>

          {/* Feature 4: No Install */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-cyan-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-cyan-500/20"></div>
            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-cyan-500/20">
              <i className="fa-solid fa-bolt text-3xl text-cyan-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">{t.why.features.no_install.title}</h3>
            <p className="text-slate-400 leading-relaxed flex-grow" dangerouslySetInnerHTML={{ __html: t.why.features.no_install.desc }} />
          </div>
        </div>

        <div className="mt-20 max-w-3xl mx-auto bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl py-10 px-8 border border-slate-700 relative overflow-hidden text-center shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          <div className="relative z-10">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-8">{t.why.cta_title}</h3>
            <Link href="/create" className="px-8 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-full font-bold text-base shadow-lg shadow-brand-500/30 transition transform hover:scale-105 inline-block">
              {t.why.cta_btn}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
