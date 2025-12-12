'use client';

import React from 'react';
import TiltedCard from '../TiltedCard';

export default function FeatureCreation() {
  const useCases = [
    {
      title: '原创网页小游戏',
      icon: 'fa-gamepad',
      color: 'text-pink-400',
      bg: 'bg-pink-500/10',
      border: 'border-pink-500/20',
      desc: '描述规则，即刻生成贪吃蛇、俄罗斯方块等完整游戏。',
      id: 'feature-game'
    },
    {
      title: '个人作品集网站',
      icon: 'fa-user-tie',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      desc: '无需代码，为设计师、摄影师打造专业级个人作品集网站。',
      id: 'feature-portfolio'
    },
    {
      title: '超级个体预约门面',
      icon: 'fa-store',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      desc: '集成展示与预约功能，为自由职业者打造 24 小时私域入口。',
      id: 'feature-appointment'
    },
    {
      title: '教学课件',
      icon: 'fa-graduation-cap',
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      desc: '支持互动演示与在线测验，让知识点可视化，教学更生动。',
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
                AI 驱动开发
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                像聊天一样简单
                <span className="block text-blue-500">瞬间生成网页应用</span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                不需要懂复杂的代码。只需告诉 AI 你想要什么——
                <span className="text-slate-200">"一个旅行记账本"</span>、
                <span className="text-slate-200">"一个活动报名页"</span> 或 
                <span className="text-slate-200">"个人博客"</span>。
              </p>
              <p className="text-slate-400 text-lg leading-relaxed">
                AI 会自动为您编写代码、设计界面，并实时预览。所见即所得，创意即刻落地。
              </p>
              
              <div className="pt-4 flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <i className="fa-solid fa-check-circle text-green-500"></i>
                  <span>自然语言交互</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <i className="fa-solid fa-check-circle text-green-500"></i>
                  <span>实时预览修改</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <i className="fa-solid fa-check-circle text-green-500"></i>
                  <span>自动错误修复</span>
                </div>
              </div>
            </div>

            {/* Right: Visual */}
            <div className="w-full md:w-1/2 h-[400px]">
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
                    <div className="h-10 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#FF5F56] shadow-sm"></div>
                        <div className="w-3 h-3 rounded-full bg-[#FFBD2E] shadow-sm"></div>
                        <div className="w-3 h-3 rounded-full bg-[#27C93F] shadow-sm"></div>
                        <div className="ml-4 text-xs text-slate-400 font-medium flex items-center gap-2">
                            <i className="fa-solid fa-robot"></i>
                            SparkVertex AI
                        </div>
                    </div>
                    
                    {/* Chat Content */}
                    <div className="flex-1 p-6 space-y-6 overflow-hidden relative bg-gradient-to-b from-slate-900/50 to-slate-900/80 flex flex-col justify-center">
                        
                        {/* Simplified Flow */}
                        <div className="space-y-6">
                            {/* 1. Input */}
                            <div className="flex items-center gap-4 animate-in slide-in-from-left duration-700">
                                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-600/20">
                                    <i className="fa-solid fa-user text-white text-sm"></i>
                                </div>
                                <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tr-none p-4 text-blue-100 text-sm shadow-lg backdrop-blur-sm flex-1">
                                    "帮我做一个活动报名页"
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex justify-center animate-in fade-in duration-700 delay-300">
                                <i className="fa-solid fa-arrow-down text-slate-500 text-xl animate-bounce"></i>
                            </div>

                            {/* 2. Result & QR */}
                            <div className="bg-slate-800/80 border border-white/5 rounded-2xl p-5 shadow-xl backdrop-blur-sm animate-in slide-in-from-bottom duration-700 delay-500">
                                <div className="flex items-center gap-4">
                                    {/* QR Code */}
                                    <div className="w-24 h-24 bg-black rounded-lg shadow-lg flex-shrink-0 flex items-center justify-center border border-white/10">
                                        <i className="fa-solid fa-qrcode text-5xl text-white"></i>
                                    </div>
                                    
                                    {/* Info */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
                                            <i className="fa-solid fa-check-circle"></i>
                                            <span>生成成功！</span>
                                        </div>
                                        <div className="text-slate-300 text-xs leading-relaxed">
                                            无需下载 App，手机扫码即刻体验。
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <div className="px-3 py-1.5 bg-white/10 rounded-lg text-[10px] text-slate-300 border border-white/10 flex items-center gap-1.5">
                                                <i className="fa-brands fa-apple"></i> iOS
                                            </div>
                                            <div className="px-3 py-1.5 bg-white/10 rounded-lg text-[10px] text-slate-300 border border-white/10 flex items-center gap-1.5">
                                                <i className="fa-brands fa-android"></i> Android
                                            </div>
                                            <div className="px-3 py-1.5 bg-white/10 rounded-lg text-[10px] text-slate-300 border border-white/10 flex items-center gap-1.5">
                                                <i className="fa-solid fa-desktop"></i> Web
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            {useCases.map((item, index) => (
              <a 
                key={index} 
                href={`#${item.id}`}
                className="group p-6 rounded-xl border border-white/5 bg-slate-800/50 backdrop-blur-sm hover:bg-slate-800 hover:border-white/10 transition-all duration-300 cursor-pointer block"
              >
                <div className={`w-12 h-12 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <i className={`fa-solid ${item.icon} text-xl ${item.color}`}></i>
                </div>
                <h3 className="text-white font-bold text-lg mb-2 group-hover:text-blue-400 transition-colors">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed line-clamp-3 mb-4">
                  {item.desc}
                </p>
                <div className="flex items-center text-xs font-medium text-slate-500 group-hover:text-blue-400 transition-colors">
                  查看详情 <i className="fa-solid fa-arrow-right ml-1 group-hover:translate-x-1 transition-transform"></i>
                </div>
              </a>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
