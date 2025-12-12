import React from 'react';
import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="py-24 bg-transparent border-t border-white/5">
      <div className="container mx-auto px-4 text-center">
        <div className="backdrop-blur-md bg-slate-900/40 border border-white/10 rounded-3xl p-12 md:p-20 shadow-2xl max-w-5xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
          你的下一个伟大想法
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mt-2">
            正在等待诞生
          </span>
        </h2>
        <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10">
          无需等待，无需配置环境。现在就开始，让 AI 帮你实现创意。
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link 
            href="/create"
            className="px-8 py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-lg font-bold transition-all hover:scale-105 shadow-[0_0_20px_rgba(37,99,235,0.3)]"
          >
            <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>
            免费创建我的应用
          </Link>
          <Link 
            href="/explore"
            className="px-8 py-4 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-lg font-medium transition-all border border-slate-700"
          >
            探索社区
          </Link>
        </div>
        </div>
      </div>
    </section>
  );
}
