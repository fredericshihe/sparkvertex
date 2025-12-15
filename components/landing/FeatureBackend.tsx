'use client';

import React from 'react';
import TiltedCard from '../TiltedCard';
import { useLanguage } from '@/context/LanguageContext';

export default function FeatureBackend() {
  const { t } = useLanguage();
  const fb = t.home.feature_backend;

  return (
    <section className="py-20 bg-transparent relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-blue-900/10 to-transparent pointer-events-none"></div>
      
      <div className="container mx-auto px-4 relative z-10 space-y-24">
        
        {/* 1. Game: Web Game */}
        <div id="feature-game" className="backdrop-blur-md bg-slate-900/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl scroll-mt-24">
          <div className="flex flex-col md:flex-row items-center gap-12">
            {/* Right: Text */}
            <div className="w-full md:w-1/2 space-y-6">
              <div className="inline-block px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 text-sm font-medium mb-2">
                {fb.game_badge}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                {fb.game_title_1}
                <span className="block text-pink-500">{fb.game_title_2}</span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                {fb.game_desc}
              </p>
            </div>

            {/* Left: Visual */}
            <div className="w-full md:w-1/2">
              <div className="w-full h-[280px] md:h-[320px]">
                <TiltedCard
                    imageHeight="100%"
                    imageWidth="100%"
                    containerHeight="100%"
                    containerWidth="100%"
                    rotateAmplitude={8}
                    scaleOnHover={1.02}
                    showMobileWarning={false}
                    showTooltip={false}
                    displayOverlayContent={true}
                    overlayContent={null}
                >
                    <div className="w-full h-full bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Mac Title Bar */}
                        <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></div>
                            <div className="ml-3 text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                                <i className="fa-solid fa-gamepad"></i>
                                {fb.game_filename}
                            </div>
                        </div>
                        
                        <div className="flex-1 relative bg-[#2b2b2b] flex flex-col">
                            <div className="h-10 bg-[#333] flex items-center px-4 gap-4 border-b border-white/5 justify-between">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                </div>
                                <span className="text-sm text-green-400 font-mono font-bold">{fb.game_score}: 120</span>
                            </div>
                            <div className="flex-1 relative p-6 flex items-center justify-center">
                                {/* Snake Grid */}
                                <div className="w-48 h-48 bg-[#1a1a1a] grid grid-cols-8 grid-rows-8 gap-0.5 border border-white/10 shadow-lg relative">
                                    {/* Snake Body */}
                                    <div className="col-start-3 row-start-4 bg-green-500 rounded-sm shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                    <div className="col-start-4 row-start-4 bg-green-500 rounded-sm shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                    <div className="col-start-5 row-start-4 bg-green-500 rounded-sm shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                    <div className="col-start-5 row-start-3 bg-green-500 rounded-sm shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                                    {/* Food */}
                                    <div className="col-start-7 row-start-6 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
                                </div>
                                {/* Controls Overlay */}
                                <div className="absolute bottom-4 right-4 opacity-50">
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center"><i className="fa-solid fa-caret-up text-xs text-white"></i></div>
                                        <div className="flex gap-1">
                                            <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center"><i className="fa-solid fa-caret-left text-xs text-white"></i></div>
                                            <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center"><i className="fa-solid fa-caret-down text-xs text-white"></i></div>
                                            <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center"><i className="fa-solid fa-caret-right text-xs text-white"></i></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </TiltedCard>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Portfolio: Personal Website */}
        <div id="feature-portfolio" className="backdrop-blur-md bg-slate-900/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl scroll-mt-24">
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            {/* Right: Text */}
            <div className="w-full md:w-1/2 space-y-6">
              <div className="inline-block px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-2">
                {fb.portfolio_badge}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                {fb.portfolio_title_1}
                <span className="block text-blue-500">{fb.portfolio_title_2}</span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                {fb.portfolio_desc}
              </p>
            </div>

            {/* Left: Visual */}
            <div className="w-full md:w-1/2">
              <div className="w-full h-[280px] md:h-[320px]">
                <TiltedCard
                    imageHeight="100%"
                    imageWidth="100%"
                    containerHeight="100%"
                    containerWidth="100%"
                    rotateAmplitude={8}
                    scaleOnHover={1.02}
                    showMobileWarning={false}
                    showTooltip={false}
                    displayOverlayContent={true}
                    overlayContent={null}
                >
                    <div className="w-full h-full bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Mac Title Bar */}
                        <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></div>
                            <div className="ml-3 text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                                <i className="fa-solid fa-globe"></i>
                                {fb.portfolio_filename}
                            </div>
                        </div>
                        
                        <div className="flex-1 relative bg-white flex flex-col overflow-hidden">
                            {/* Header */}
                            <div className="h-32 bg-slate-100 relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20"></div>
                                <div className="absolute bottom-4 right-4 flex gap-3 text-[10px] font-medium text-slate-600">
                                    <span className="hover:text-blue-500 cursor-pointer">{fb.portfolio_nav_home}</span>
                                    <span className="hover:text-blue-500 cursor-pointer">{fb.portfolio_nav_works}</span>
                                    <span className="hover:text-blue-500 cursor-pointer">{fb.portfolio_nav_about}</span>
                                </div>
                            </div>
                            
                            {/* Avatar - Positioned absolutely relative to the content container to ensure z-index correctness */}
                            <div className="absolute top-0 left-8 w-20 h-20 rounded-full bg-white p-1.5 shadow-lg z-20">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Vivian" className="w-full h-full rounded-full bg-slate-100" />
                            </div>

                            <div className="mt-10 px-8">
                                <div className="h-4 w-32 bg-slate-800 rounded mb-2"></div>
                                <div className="h-2 w-48 bg-slate-400 rounded mb-6"></div>
                                {/* Gallery */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="aspect-square bg-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative">
                                        <div className="w-full h-full bg-slate-300"></div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {fb.portfolio_work_1}
                                        </div>
                                    </div>
                                    <div className="aspect-square bg-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative">
                                        <div className="w-full h-full bg-slate-300"></div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {fb.portfolio_work_2}
                                        </div>
                                    </div>
                                    <div className="aspect-square bg-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative">
                                        <div className="w-full h-full bg-slate-300"></div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {fb.portfolio_work_3}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </TiltedCard>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Super Individual: Appointment (Moved from 4) */}
        <div id="feature-appointment" className="backdrop-blur-md bg-slate-900/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl scroll-mt-24">
          <div className="flex flex-col md:flex-row items-center gap-12">
          {/* Right: Text */}
          <div className="w-full md:w-1/2 space-y-6">
            <div className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-2">
              {fb.appointment_badge}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
              {fb.appointment_title_1}
              <span className="block text-purple-500">{fb.appointment_title_2}</span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              {fb.appointment_desc}
              <br/>
              <span className="text-sm text-slate-500 mt-2 block">
                {fb.appointment_note}
              </span>
            </p>
          </div>

          {/* Left: Visual */}
          <div className="w-full md:w-1/2 flex flex-col gap-8">
            
            {/* Simulation Card */}
            <div className="w-full h-[280px] md:h-[320px]">
                <TiltedCard
                    imageHeight="100%"
                    imageWidth="100%"
                    containerHeight="100%"
                    containerWidth="100%"
                    rotateAmplitude={8}
                    scaleOnHover={1.02}
                    showMobileWarning={false}
                    showTooltip={false}
                    displayOverlayContent={true}
                    overlayContent={null}
                >
                    <div className="w-full h-full bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Mac Title Bar */}
                        <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></div>
                            <div className="ml-3 text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                                <i className="fa-solid fa-server"></i>
                                {fb.appointment_backend}
                            </div>
                        </div>
                        
                        <div className="flex-1 p-5 grid grid-cols-2 gap-4 bg-gradient-to-b from-slate-900/50 to-slate-900/80">
                            {/* User Side */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                                    <i className="fa-solid fa-mobile-screen"></i> {fb.appointment_user_view}
                                </div>
                                <div className="bg-white rounded-lg p-3 shadow-lg border border-slate-200 h-full relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" className="w-full h-full rounded-full" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-bold text-slate-800 leading-tight">{fb.appointment_service}</div>
                                            <div className="text-[8px] text-slate-500">{fb.appointment_price}</div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 mb-3">
                                        <div className="flex gap-1">
                                            <div className="h-1.5 bg-slate-100 rounded w-8"></div>
                                            <div className="h-1.5 bg-slate-100 rounded w-4"></div>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded w-full"></div>
                                    </div>
                                    <div className="w-full py-1.5 bg-purple-600 text-white text-[10px] font-bold rounded text-center shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform cursor-pointer">
                                        {fb.appointment_book_now}
                                    </div>
                                </div>
                            </div>

                            {/* Admin Side */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-[10px] text-green-400 font-bold uppercase tracking-wider">
                                    <i className="fa-solid fa-database"></i> {fb.appointment_admin_view}
                                </div>
                                <div className="bg-slate-800 rounded-lg border border-slate-700 h-full overflow-hidden flex flex-col shadow-inner">
                                    <div className="bg-slate-700/50 px-2 py-1.5 border-b border-slate-700 flex justify-between items-center">
                                        <span className="text-[8px] text-slate-400">{fb.appointment_latest_orders}</span>
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        <div className="bg-slate-700/30 rounded p-1.5 border border-slate-700/50 animate-pulse">
                                            <div className="flex justify-between mb-1">
                                                <div className="text-[8px] text-white">{fb.appointment_customer_1}</div>
                                                <div className="text-[8px] text-green-400">{fb.appointment_new_booking}</div>
                                            </div>
                                            <div className="text-[7px] text-slate-500">2024-05-20 14:00</div>
                                        </div>
                                        <div className="bg-slate-700/30 rounded p-1.5 border border-slate-700/50 opacity-50">
                                            <div className="flex justify-between mb-1">
                                                <div className="text-[8px] text-white">{fb.appointment_customer_2}</div>
                                                <div className="text-[8px] text-slate-400">{fb.appointment_pending}</div>
                                            </div>
                                            <div className="text-[7px] text-slate-500">2024-05-21 10:00</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </TiltedCard>
            </div>
          </div>
        </div>
        </div>

        {/* 4. Courseware: Education (Moved from 3) */}
        <div id="feature-courseware" className="backdrop-blur-md bg-slate-900/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl scroll-mt-24">
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            {/* Right: Text */}
            <div className="w-full md:w-1/2 space-y-6">
              <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-2">
                {fb.courseware_badge}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                {fb.courseware_title_1}
                <span className="block text-green-500">{fb.courseware_title_2}</span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                {fb.courseware_desc}
              </p>
            </div>

            {/* Left: Visual */}
            <div className="w-full md:w-1/2">
              <div className="w-full h-[280px] md:h-[320px]">
                <TiltedCard
                    imageHeight="100%"
                    imageWidth="100%"
                    containerHeight="100%"
                    containerWidth="100%"
                    rotateAmplitude={8}
                    scaleOnHover={1.02}
                    showMobileWarning={false}
                    showTooltip={false}
                    displayOverlayContent={true}
                    overlayContent={null}
                >
                    <div className="w-full h-full bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Mac Title Bar */}
                        <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></div>
                            <div className="ml-3 text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                                <i className="fa-solid fa-graduation-cap"></i>
                                {fb.courseware_filename}
                            </div>
                        </div>
                        
                        <div className="flex-1 relative bg-[#1e293b] flex flex-col p-4">
                            <div className="flex justify-between items-center mb-3">
                                <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider">{fb.courseware_subject}</div>
                                <div className="text-[10px] text-slate-400 bg-slate-800 px-2 py-1 rounded-full">{fb.courseware_progress}</div>
                            </div>
                            <div className="bg-slate-700/50 rounded-xl p-4 mb-2 border border-slate-600 shadow-lg">
                                <div className="text-sm text-white font-medium mb-3">{fb.courseware_question}</div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/50 cursor-pointer transition-colors hover:bg-emerald-500/30">
                                        <div className="w-4 h-4 rounded-full border border-emerald-400 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                        </div>
                                        <span className="text-xs text-emerald-100 font-mono">F = m * a</span>
                                    </div>
                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-700 border border-slate-600 opacity-50 cursor-pointer hover:opacity-75 transition-opacity">
                                        <div className="w-4 h-4 rounded-full border border-slate-500"></div>
                                        <span className="text-xs text-slate-400 font-mono">E = mc^2</span>
                                    </div>
                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-700 border border-slate-600 opacity-50 cursor-pointer hover:opacity-75 transition-opacity">
                                        <div className="w-4 h-4 rounded-full border border-slate-500"></div>
                                        <span className="text-xs text-slate-400 font-mono">V = I * R</span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-auto flex justify-end pb-1">
                                <div className="px-4 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full shadow-lg shadow-emerald-500/20 flex items-center gap-1 cursor-pointer hover:bg-emerald-600 transition-colors">
                                    {fb.courseware_next} <i className="fa-solid fa-arrow-right"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </TiltedCard>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
