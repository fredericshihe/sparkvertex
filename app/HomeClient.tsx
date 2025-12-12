'use client';

import dynamic from 'next/dynamic';
import Hero from '@/components/Hero';
import FeatureCreation from '@/components/landing/FeatureCreation';
import FeatureBackend from '@/components/landing/FeatureBackend';
import Showcase from '@/components/landing/Showcase';
import CTASection from '@/components/landing/CTASection';

const Galaxy = dynamic(() => import('@/components/Galaxy'), { ssr: false });

interface HomeClientProps {
  heroItems: any[];
}

export default function HomeClient({ heroItems }: HomeClientProps) {
  return (
    <div className="min-h-screen flex flex-col relative bg-black">
      {/* Global Fixed Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Galaxy 
          mouseRepulsion={true}
          mouseInteraction={true}
          density={1.5}
          glowIntensity={0.5}
          saturation={0.8}
          hueShift={240}
        />
      </div>

      {/* Scrollable Content */}
      <div className="relative z-10">
        <Hero initialItems={heroItems} />
        <FeatureCreation />
        <FeatureBackend />
        <Showcase items={heroItems} />
        <CTASection />
      </div>
    </div>
  );
}
