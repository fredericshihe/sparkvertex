'use client';

import { useEffect, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';

// 全局变量保持微信检测状态，避免组件重新挂载时丢失
let globalWeChatDetected: boolean | null = null;
let globalIsIOS = false;

function WeChatGuardContent() {
  // 初始化时使用全局状态
  const [isWeChat, setIsWeChat] = useState(() => globalWeChatDetected === true);
  const [isIOS, setIsIOS] = useState(() => globalIsIOS);
  const { t } = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // 如果已经检测过，直接使用缓存的结果
    if (globalWeChatDetected !== null) {
      setIsWeChat(globalWeChatDetected);
      setIsIOS(globalIsIOS);
      if (globalWeChatDetected) {
        document.body.style.overflow = 'hidden';
      }
      return;
    }
    
    // 只在独立作品详情页 /p/[id] 且带有 mode=app 参数时显示微信引导
    const isProductPage = pathname?.startsWith('/p/');
    const isAppMode = searchParams?.get('mode') === 'app';
    
    if (!isProductPage || !isAppMode) {
      globalWeChatDetected = false;
      return;
    }
    
    const ua = navigator.userAgent.toLowerCase();
    // 检测微信内置浏览器 (MicroMessenger) 和企业微信 (wxwork)
    const isWeChatBrowser = ua.includes('micromessenger') || ua.includes('wxwork');
    
    // 缓存检测结果到全局变量
    globalWeChatDetected = isWeChatBrowser;
    globalIsIOS = /iphone|ipad|ipod/i.test(ua);
    
    if (isWeChatBrowser) {
      setIsWeChat(true);
      setIsIOS(globalIsIOS);
      // Prevent scrolling when overlay is active
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [pathname, searchParams]);

  if (!isWeChat) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-start p-6 text-center overflow-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.98)' }}
    >
      {/* 顶部右上角箭头指示 */}
      <div className="fixed top-4 right-4 animate-bounce flex flex-col items-center gap-1">
        <i className="fa-solid fa-arrow-up text-white text-3xl"></i>
        <span className="text-xs text-white bg-gray-800 px-2 py-1 rounded-full">{t.wechat_guard.step1}</span>
      </div>

      <div className="mt-24 flex flex-col items-center">
        {/* 微信图标 */}
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
          <i className="fa-brands fa-weixin text-4xl text-white"></i>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-3">{t.wechat_guard.title}</h2>
        <p className="text-gray-400 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
          {t.wechat_guard.description}
        </p>
        
        {/* 步骤指引 */}
        <div className="rounded-3xl p-6 border border-gray-700 max-w-sm w-full" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <div className="space-y-4">
            {/* 步骤 1 */}
            <div className="flex items-center gap-4 text-left">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}>1</div>
              <div>
                <p className="text-white text-sm font-medium">{t.wechat_guard.step1} <i className="fa-solid fa-ellipsis ml-1 text-gray-400"></i></p>
                <p className="text-xs text-gray-500">{isIOS ? '右上角 ···' : '右上角 ⋮'}</p>
              </div>
            </div>
            
            {/* 步骤 2 */}
            <div className="flex items-center gap-4 text-left">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: 'rgba(14, 165, 233, 0.2)', color: '#0ea5e9' }}>2</div>
              <div>
                <p className="text-white text-sm font-medium">{t.wechat_guard.step2}</p>
                <p className="text-xs text-gray-500">{isIOS ? '在 Safari 中打开' : '在浏览器中打开'}</p>
              </div>
            </div>
          </div>
          
          {/* 图示 */}
          <div className="mt-6 pt-4 border-t border-gray-700">
            <div className="flex justify-center items-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <i className={`fa-brands ${isIOS ? 'fa-safari' : 'fa-chrome'} text-2xl text-gray-400`}></i>
                </div>
                <span className="text-xs text-gray-500">{isIOS ? 'Safari' : 'Chrome'}</span>
              </div>
              <i className="fa-solid fa-arrow-right text-gray-600"></i>
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center border" style={{ background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)', borderColor: 'rgba(14, 165, 233, 0.3)' }}>
                  <i className="fa-solid fa-check text-xl" style={{ color: '#0ea5e9' }}></i>
                </div>
                <span className="text-xs text-gray-500">完美体验</span>
              </div>
            </div>
          </div>
        </div>

        {/* 底部刷新按钮 */}
        <div className="mt-10">
          <button 
            onClick={() => window.location.reload()}
            className="text-gray-400 text-sm transition flex items-center gap-2 px-4 py-2 rounded-full border border-gray-700"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
          >
            <i className="fa-solid fa-rotate-right"></i> {t.wechat_guard.already_in_browser}
          </button>
        </div>
      </div>
    </div>
  );
}

// 导出包装后的组件，使用 Suspense 避免静态生成错误
export default function WeChatGuard() {
  return (
    <Suspense fallback={null}>
      <WeChatGuardContent />
    </Suspense>
  );
}
