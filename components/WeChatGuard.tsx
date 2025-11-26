'use client';

import { useEffect, useState } from 'react';

export default function WeChatGuard() {
  const [isWeChat, setIsWeChat] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('micromessenger')) {
        setIsWeChat(true);
        // Prevent scrolling when overlay is active
        document.body.style.overflow = 'hidden';
      }
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!isWeChat) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/95 flex flex-col items-center justify-center p-8 text-center animate-fade-in backdrop-blur-sm">
      <div className="absolute top-4 right-6 animate-bounce">
        <i className="fa-solid fa-arrow-up-long text-4xl text-white"></i>
      </div>
      <div className="w-20 h-20 bg-brand-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-brand-500/30">
        <i className="fa-brands fa-weixin text-4xl text-white"></i>
      </div>
      <h2 className="text-2xl font-bold text-white mb-4">请在浏览器中打开</h2>
      <p className="text-slate-300 mb-8 leading-relaxed">
        为了获得最佳的浏览体验，
        <br />
        请点击右上角 <i className="fa-solid fa-ellipsis"></i> 选择
        <br />
        <span className="text-brand-400 font-bold">"在浏览器打开"</span>
      </p>
      <div className="text-sm text-slate-500">
        SparkVertex
      </div>
    </div>
  );
}
