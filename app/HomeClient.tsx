'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Hero from '@/components/Hero';
import FeatureCreation from '@/components/landing/FeatureCreation';
import FeatureBackend from '@/components/landing/FeatureBackend';
import CTASection from '@/components/landing/CTASection';

// Galaxy 使用低优先级加载，不阻塞主内容
const Galaxy = dynamic(() => import('@/components/Galaxy'), { 
  ssr: false,
  loading: () => null // 不显示加载占位符，让背景直接显示黑色
});

// 预加载创作页面的关键模块
const preloadCreatePageModules = () => {
  // 预加载 CreateClient 和其关键依赖
  import('@/app/create/CreateClient');
};

interface HomeClientProps {
  // No props needed anymore
}

export default function HomeClient() {
  const [showGalaxy, setShowGalaxy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // 延迟加载 Galaxy，让主内容先渲染完成
    // 使用 requestAnimationFrame 确保在下一帧才开始加载 Galaxy
    requestAnimationFrame(() => {
      setShowGalaxy(true);
    });
    
    // 在空闲时预加载创作页面模块
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(preloadCreatePageModules, { timeout: 3000 });
    } else {
      // 移动端兼容：2秒后预加载
      setTimeout(preloadCreatePageModules, 2000);
    }
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Fixed background - ensures full coverage on all devices */}
      <div className="fixed inset-0 bg-black -z-20" />
      
      {/* Global Fixed Background - Galaxy loads after main content */}
      {showGalaxy && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <Galaxy 
            mouseRepulsion={true}
            mouseInteraction={true}
            density={1.5}
            glowIntensity={0.5}
            saturation={0.8}
            hueShift={240}
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Scrollable Content - 立即渲染，无需等待 */}
      <div className="relative z-10">
        <Hero />
        <FeatureCreation />
        <FeatureBackend />
        <CTASection />
      </div>
    </div>
  );
}
