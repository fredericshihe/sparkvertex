'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Hero from '@/components/Hero';
import FeatureCreation from '@/components/landing/FeatureCreation';
import FeatureBackend from '@/components/landing/FeatureBackend';
import CTASection from '@/components/landing/CTASection';

const Galaxy = dynamic(() => import('@/components/Galaxy'), { ssr: false });

interface HomeClientProps {
  // No props needed anymore
}

export default function HomeClient() {
  const [mounted, setMounted] = useState(false);
  const [showGalaxy, setShowGalaxy] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Delay Galaxy loading using requestIdleCallback for better performance
    // This allows the main content to render first before initializing WebGL
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        setShowGalaxy(true);
      }, { timeout: 2000 });
    } else {
      // Fallback for browsers that don't support requestIdleCallback
      setTimeout(() => {
        setShowGalaxy(true);
      }, 500);
    }
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
          />
        )}
      </div>

      {/* Scrollable Content */}
      <div className="relative z-10">
        <Hero />
        <FeatureCreation />
        <FeatureBackend />
        <CTASection />
      </div>
    </div>
  );
}
