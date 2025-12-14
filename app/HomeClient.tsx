'use client';

import { useEffect, useState, memo } from 'react';
import dynamic from 'next/dynamic';
import Hero from '@/components/Hero';

// 懒加载非首屏组件 - 减少首屏 JS 体积
const FeatureCreation = dynamic(() => import('@/components/landing/FeatureCreation'), {
  ssr: false,
  loading: () => <div className="py-20 min-h-[600px]" />
});
const FeatureBackend = dynamic(() => import('@/components/landing/FeatureBackend'), {
  ssr: false,
  loading: () => <div className="py-20 min-h-[500px]" />
});
const CTASection = dynamic(() => import('@/components/landing/CTASection'), {
  ssr: false,
  loading: () => <div className="py-20 min-h-[300px]" />
});

// Galaxy 背景懒加载
const Galaxy = dynamic(() => import('@/components/Galaxy'), { ssr: false });

interface HomeClientProps {
  // No props needed anymore
}

function HomeClient() {
  const [mounted, setMounted] = useState(false);
  const [showGalaxy, setShowGalaxy] = useState(false);
  const [showBelowFold, setShowBelowFold] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // 立即标记 mounted 以快速显示首屏
    setMounted(true);
    
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // 首屏渲染完成后，延迟加载 Galaxy 和非首屏内容
    // 使用 requestAnimationFrame 确保首屏已绘制
    requestAnimationFrame(() => {
      // 非首屏内容在下一帧加载
      setShowBelowFold(true);
      
      // Galaxy 在空闲时加载
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          setShowGalaxy(true);
        }, { timeout: 1500 });
      } else {
        setTimeout(() => {
          setShowGalaxy(true);
        }, 300);
      }
    });
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative bg-black">
      {/* Global Fixed Background */}
      <div 
        className={`fixed inset-0 z-0 pointer-events-none transition-opacity duration-[2000ms] ease-in-out ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {showGalaxy && (
          <Galaxy 
            mouseRepulsion={true}
            mouseInteraction={true}
            density={1.5}
            glowIntensity={0.5}
            saturation={0.8}
            hueShift={240}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Scrollable Content */}
      <div className="relative z-10">
        <Hero />
        {/* 非首屏内容延迟加载 */}
        {showBelowFold && (
          <>
            <FeatureCreation />
            <FeatureBackend />
            <CTASection />
          </>
        )}
      </div>
    </div>
  );
}

// 使用 memo 避免不必要的重渲染
export default memo(HomeClient);
