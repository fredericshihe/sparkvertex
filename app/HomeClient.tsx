'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Hero from '@/components/Hero';

// 延迟加载非首屏组件
const FeatureCreation = dynamic(() => import('@/components/landing/FeatureCreation'), {
  ssr: false,
  loading: () => <div className="h-[600px] bg-transparent" />
});

const FeatureBackend = dynamic(() => import('@/components/landing/FeatureBackend'), {
  ssr: false,
  loading: () => <div className="h-[500px] bg-transparent" />
});

const CTASection = dynamic(() => import('@/components/landing/CTASection'), {
  ssr: false,
  loading: () => <div className="h-[300px] bg-transparent" />
});

const Galaxy = dynamic(() => import('@/components/Galaxy'), { ssr: false });

export default function HomeClient() {
  const [mounted, setMounted] = useState(false);
  const [showGalaxy, setShowGalaxy] = useState(false);
  const [showBelowFold, setShowBelowFold] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // 延迟加载 Galaxy 背景
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        setShowGalaxy(true);
      }, { timeout: 2000 });
    } else {
      setTimeout(() => {
        setShowGalaxy(true);
      }, 500);
    }

    // 延迟加载首屏以下内容（用户滚动或 1 秒后自动加载）
    const loadBelowFold = () => {
      setShowBelowFold(true);
      window.removeEventListener('scroll', handleScroll);
    };

    const handleScroll = () => {
      if (window.scrollY > 100) {
        loadBelowFold();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // 1秒后自动加载，确保用户不滚动也能看到内容
    const timer = setTimeout(loadBelowFold, 1000);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
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
