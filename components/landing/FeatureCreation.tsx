'use client';

import React from 'react';
import TiltedCard from '../TiltedCard';
import { useLanguage } from '@/context/LanguageContext';

export default function FeatureCreation() {
  const { t } = useLanguage();
  
  const useCases = [
    {
      title: t.home.use_cases.games,
      icon: 'fa-gamepad',
      color: 'text-pink-400',
      bg: 'bg-pink-500/10',
      border: 'border-pink-500/20',
      desc: t.home.feature_creation.use_case_desc_game,
      id: 'feature-game'
    },
    {
      title: t.home.use_cases.personal,
      icon: 'fa-user-tie',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      desc: t.home.feature_creation.use_case_desc_portfolio,
      id: 'feature-portfolio'
    },
    {
      title: t.home.use_cases.storefront,
      icon: 'fa-store',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      desc: t.home.feature_creation.use_case_desc_appointment,
      id: 'feature-appointment'
    },
    {
      title: t.home.use_cases.courseware,
      icon: 'fa-graduation-cap',
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      desc: t.home.feature_creation.use_case_desc_courseware,
      id: 'feature-courseware'
    }
  ];

  return (
    <section className="py-20 bg-transparent relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="backdrop-blur-md bg-slate-900/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          
          <div className="flex flex-col md:flex-row items-center gap-12 mb-20">
            {/* Left: Text */}
            <div className="w-full md:w-1/2 space-y-6">
              <div className="inline-block px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-2">
                {t.home.feature_creation.badge}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                {t.home.feature_creation.title_1}
                <span className="block text-blue-500">{t.home.feature_creation.title_2}</span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                {t.home.feature_creation.desc_1}
                <span className="text-slate-200">{t.home.feature_creation.example_1}</span>、
                <span className="text-slate-200">{t.home.feature_creation.example_2}</span> 或 
                <span className="text-slate-200">{t.home.feature_creation.example_3}</span>。
              </p>
              <p className="text-slate-400 text-lg leading-relaxed">
                {t.home.feature_creation.desc_2}
              </p>
              
              <div className="pt-4 flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <i className="fa-solid fa-check-circle text-green-500"></i>
                  <span>{t.home.feature_creation.feature_1}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <i className="fa-solid fa-check-circle text-green-500"></i>
                  <span>{t.home.feature_creation.feature_2}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <i className="fa-solid fa-check-circle text-green-500"></i>
                  <span>{t.home.feature_creation.feature_3}</span>
                </div>
              </div>
            </div>

            {/* Right: Visual */}
            <div className="w-full md:w-1/2 h-[300px] md:h-[400px]">
              <TiltedCard
                imageHeight="100%"
                imageWidth="100%"
                containerHeight="100%"
                containerWidth="100%"
                rotateAmplitude={10}
                scaleOnHover={1.05}
                showMobileWarning={false}
                showTooltip={false}
                displayOverlayContent={true}
                overlayContent={null}
              >
                <div className="w-full h-full bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl">
                    {/* Mac Title Bar */}
                    <div className="h-8 md:h-10 bg-white/5 border-b border-white/5 flex items-center px-3 md:px-4 gap-1.5 md:gap-2">
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#FF5F56] shadow-sm"></div>
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#FFBD2E] shadow-sm"></div>
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#27C93F] shadow-sm"></div>
                        <div className="ml-2 md:ml-4 text-[10px] md:text-xs text-slate-400 font-medium flex items-center gap-1.5 md:gap-2">
                            <i className="fa-solid fa-robot"></i>
                            <span className="hidden sm:inline">SparkVertex AI</span>
                        </div>
                    </div>
                    
                    {/* Chat Content */}
                    <div className="flex-1 p-3 md:p-6 space-y-3 md:space-y-6 overflow-hidden relative bg-gradient-to-b from-slate-900/50 to-slate-900/80 flex flex-col justify-center">
                        
                        {/* Simplified Flow */}
                        <div className="space-y-3 md:space-y-6">
                            {/* 1. Input */}
                            <div className="flex items-center gap-2 md:gap-4 animate-in slide-in-from-left duration-700">
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-600/20">
                                    <i className="fa-solid fa-user text-white text-xs md:text-sm"></i>
                                </div>
                                <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tr-none p-2.5 md:p-4 text-blue-100 text-xs md:text-sm shadow-lg backdrop-blur-sm flex-1">
                                    {t.home.feature_creation.demo_user_input}
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex justify-center animate-in fade-in duration-700 delay-300">
                                <i className="fa-solid fa-arrow-down text-slate-500 text-base md:text-xl animate-bounce"></i>
                            </div>

                            {/* 2. Result & QR */}
                            <div className="bg-slate-800/80 border border-white/5 rounded-2xl p-3 md:p-5 shadow-xl backdrop-blur-sm animate-in slide-in-from-bottom duration-700 delay-500">
                                <div className="flex items-center gap-2 md:gap-4">
                                    {/* QR Code */}
                                    <div className="w-16 h-16 md:w-24 md:h-24 bg-black rounded-lg shadow-lg flex-shrink-0 flex items-center justify-center border border-white/10">
                                        <i className="fa-solid fa-qrcode text-3xl md:text-5xl text-white"></i>
                                    </div>
                                    
                                    {/* Info */}
                                    <div className="flex-1 space-y-1 md:space-y-2 min-w-0">
                                        <div className="flex items-center gap-1.5 md:gap-2 text-green-400 font-bold text-xs md:text-sm">
                                            <i className="fa-solid fa-check-circle"></i>
                                            <span>{t.home.feature_creation.demo_success}</span>
                                        </div>
                                        <div className="text-slate-300 text-[10px] md:text-xs leading-relaxed">
                                            {t.home.feature_creation.demo_scan_hint}
                                        </div>
                                        <div className="flex flex-wrap gap-1 md:gap-2 mt-1 md:mt-2">
                                            <div className="px-2 md:px-3 py-1 md:py-1.5 bg-white/10 rounded-lg text-[8px] md:text-[10px] text-slate-300 border border-white/10 flex items-center gap-1 md:gap-1.5">
                                                <i className="fa-brands fa-apple"></i> <span>iOS</span>
                                            </div>
                                            <div className="px-2 md:px-3 py-1 md:py-1.5 bg-white/10 rounded-lg text-[8px] md:text-[10px] text-slate-300 border border-white/10 flex items-center gap-1 md:gap-1.5">
                                                <i className="fa-brands fa-android"></i> <span>Android</span>
                                            </div>
                                            <div className="px-2 md:px-3 py-1 md:py-1.5 bg-white/10 rounded-lg text-[8px] md:text-[10px] text-slate-300 border border-white/10 flex items-center gap-1 md:gap-1.5">
                                                <i className="fa-solid fa-desktop"></i> <span>Web</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                    </div>
                </div>
              </TiltedCard>
            </div>

          </div>

          {/* Use Cases Grid */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mt-12">
            {useCases.map((item, index) => (
              <a 
                key={index} 
                href={`#${item.id}`}
                className="group p-4 md:p-6 rounded-xl border border-white/5 bg-slate-800/50 backdrop-blur-sm hover:bg-slate-800 hover:border-white/10 transition-all duration-300 cursor-pointer block"
              >
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform`}>
                  <i className={`fa-solid ${item.icon} text-lg md:text-xl ${item.color}`}></i>
                </div>
                <h3 className="text-white font-bold text-sm md:text-lg mb-1.5 md:mb-2 group-hover:text-blue-400 transition-colors leading-snug">{item.title}</h3>
                <p className="text-slate-400 text-xs md:text-sm leading-relaxed line-clamp-3 mb-2 md:mb-4">
                  {item.desc}
                </p>
                <div className="flex items-center text-[10px] md:text-xs font-medium text-slate-500 group-hover:text-blue-400 transition-colors">
                  {t.home.feature_creation.view_details} <i className="fa-solid fa-arrow-right ml-1 group-hover:translate-x-1 transition-transform"></i>
                </div>
              </a>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
