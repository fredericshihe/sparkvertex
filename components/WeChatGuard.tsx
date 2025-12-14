'use client';

import { useEffect } from 'react';

// 完全使用原生 DOM 操作，绕过 React hydration 问题
export default function WeChatGuard() {
  useEffect(() => {
    // 检查是否应该显示微信引导
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const isProductPage = pathname.startsWith('/p/');
    const isAppMode = searchParams.get('mode') === 'app';
    
    if (!isProductPage || !isAppMode) {
      return;
    }
    
    const ua = navigator.userAgent.toLowerCase();
    const isWeChatBrowser = ua.includes('micromessenger') || ua.includes('wxwork');
    
    if (!isWeChatBrowser) {
      return;
    }
    
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    
    // 检查是否已经存在遮罩
    if (document.getElementById('wechat-guard-overlay')) {
      return;
    }
    
    // 直接创建 DOM 元素
    const overlay = document.createElement('div');
    overlay.id = 'wechat-guard-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 99999;
      background-color: rgba(0, 0, 0, 0.98);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 24px;
      text-align: center;
      overflow: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    overlay.innerHTML = `
      <div style="position: fixed; top: 16px; right: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; animation: bounce 1s infinite;">
        <i class="fa-solid fa-arrow-up" style="color: white; font-size: 30px;"></i>
        <span style="font-size: 12px; color: white; background: #374151; padding: 4px 8px; border-radius: 9999px;">点击右上角</span>
      </div>
      
      <div style="margin-top: 96px; display: flex; flex-direction: column; align-items: center;">
        <div style="width: 80px; height: 80px; border-radius: 24px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);">
          <i class="fa-brands fa-weixin" style="font-size: 40px; color: white;"></i>
        </div>
        
        <h2 style="font-size: 24px; font-weight: bold; color: white; margin-bottom: 12px;">请在浏览器中打开</h2>
        <p style="color: #9ca3af; margin-bottom: 32px; max-width: 280px; font-size: 14px; line-height: 1.6;">
          微信内置浏览器不支持部分功能，请跳转至系统浏览器继续访问
        </p>
        
        <div style="border-radius: 24px; padding: 24px; border: 1px solid #374151; max-width: 320px; width: 100%; background: rgba(255, 255, 255, 0.05);">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 16px; text-align: left;">
              <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; background: rgba(14, 165, 233, 0.2); color: #0ea5e9;">1</div>
              <div>
                <p style="color: white; font-size: 14px; font-weight: 500; margin: 0;">点击右上角 <i class="fa-solid fa-ellipsis" style="color: #9ca3af; margin-left: 4px;"></i></p>
                <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0 0;">${isIOS ? '右上角 ···' : '右上角 ⋮'}</p>
              </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 16px; text-align: left;">
              <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; background: rgba(14, 165, 233, 0.2); color: #0ea5e9;">2</div>
              <div>
                <p style="color: white; font-size: 14px; font-weight: 500; margin: 0;">在浏览器中打开</p>
                <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0 0;">${isIOS ? '在 Safari 中打开' : '在浏览器中打开'}</p>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #374151;">
            <div style="display: flex; justify-content: center; align-items: center; gap: 24px;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div style="width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.1);">
                  <i class="fa-brands ${isIOS ? 'fa-safari' : 'fa-chrome'}" style="font-size: 24px; color: #9ca3af;"></i>
                </div>
                <span style="font-size: 12px; color: #6b7280;">${isIOS ? 'Safari' : 'Chrome'}</span>
              </div>
              <i class="fa-solid fa-arrow-right" style="color: #4b5563;"></i>
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div style="width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(14, 165, 233, 0.3); background: linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%);">
                  <i class="fa-solid fa-check" style="font-size: 20px; color: #0ea5e9;"></i>
                </div>
                <span style="font-size: 12px; color: #6b7280;">完美体验</span>
              </div>
            </div>
          </div>
        </div>
        
        <div style="margin-top: 40px;">
          <button 
            onclick="document.getElementById('wechat-guard-overlay').remove(); document.body.style.overflow = '';"
            style="color: #9ca3af; font-size: 14px; display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 9999px; border: 1px solid #374151; background: rgba(255, 255, 255, 0.05); cursor: pointer;"
          >
            <i class="fa-solid fa-rotate-right"></i> 已在浏览器中？刷新页面
          </button>
        </div>
      </div>
      
      <style>
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      </style>
    `;
    
    // 阻止滚动
    document.body.style.overflow = 'hidden';
    
    // 添加到 body
    document.body.appendChild(overlay);
    
    return () => {
      const existingOverlay = document.getElementById('wechat-guard-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
      }
      document.body.style.overflow = '';
    };
  }, []);

  // 不渲染任何 React 内容，完全由原生 DOM 处理
  return null;
}
