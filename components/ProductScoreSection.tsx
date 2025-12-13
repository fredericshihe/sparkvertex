'use client';

import { useState } from 'react';
import { Item } from '@/types/supabase';

interface ProductScoreSectionProps {
  item: Item;
  language: 'zh' | 'en';
  t: any; // translations object
}

export default function ProductScoreSection({ item, language, t }: ProductScoreSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't render if no score
  if (!item.total_score || item.total_score <= 0) {
    return null;
  }

  return (
    <div 
      className={`mb-8 bg-slate-800/30 rounded-xl p-4 border border-slate-700/50 transition-all duration-300 ${
        'cursor-pointer md:cursor-default hover:bg-slate-800/50 md:hover:bg-slate-800/30'
      }`}
      onClick={() => {
        if (window.innerWidth < 768) {
          setIsExpanded(!isExpanded);
        }
      }}
    >
      <div className="flex items-center justify-between mb-0">
        <h3 className="text-xs font-bold text-brand-400 uppercase tracking-wider flex items-center gap-2">
          <i className="fa-solid fa-wand-magic-sparkles"></i> {t.detail.ai_analysis}
          <i className={`fa-solid fa-chevron-down md:hidden transition-transform duration-300 ml-2 ${isExpanded ? 'rotate-180' : ''}`}></i>
        </h3>
        <div className="flex items-center gap-1 bg-brand-500/20 px-2 py-1 rounded-lg border border-brand-500/30">
          <span className="text-xs text-brand-300 font-bold">{t.detail.score}</span>
          <span className="text-lg font-black text-brand-400 leading-none">{item.total_score}</span>
        </div>
      </div>
      
      <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0 md:max-h-96 md:opacity-100 md:mt-4'}`}>
        <div className="space-y-3 mb-4">
          {/* Quality */}
          <div>
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
              <span>{t.detail.quality}</span>
              <span>{item.quality_score || 0}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${item.quality_score || 0}%` }}></div>
            </div>
          </div>
          {/* Richness */}
          <div>
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
              <span>{t.detail.richness}</span>
              <span>{item.richness_score || 0}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${item.richness_score || 0}%` }}></div>
            </div>
          </div>
          {/* Utility */}
          <div>
            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
              <span>{t.detail.utility}</span>
              <span>{item.utility_score || 0}</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${item.utility_score || 0}%` }}></div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-300 italic border-l-2 border-slate-600 pl-3 py-1">
          "{language === 'en' ? (item.analysis_reason_en || item.analysis_reason) : (item.analysis_reason || item.analysis_reason_en)}"
        </div>
      </div>
    </div>
  );
}
