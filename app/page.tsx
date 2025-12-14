import { Suspense } from 'react';
import HomeClient from './HomeClient';

// ISR: 1小时缓存
export const revalidate = 3600;

// 静态骨架屏 - 服务端渲染，秒开
function HomeLoadingSkeleton() {
  return (
    <div className="min-h-screen flex flex-col relative bg-black">
      {/* Hero Section Skeleton */}
      <div className="relative w-full min-h-screen flex flex-col items-center justify-center py-20">
        <div className="text-center px-4 max-w-4xl mx-auto">
          {/* Badge skeleton */}
          <div className="inline-flex mb-8">
            <div className="px-6 py-2.5 bg-zinc-900/90 ring-1 ring-white/10 rounded-full">
              <div className="h-5 w-48 bg-slate-700/50 rounded animate-pulse"></div>
            </div>
          </div>
          
          {/* Title skeleton */}
          <div className="space-y-4 mb-6">
            <div className="h-12 md:h-16 w-3/4 mx-auto bg-slate-800/50 rounded-lg animate-pulse"></div>
            <div className="h-12 md:h-16 w-2/3 mx-auto bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg animate-pulse"></div>
          </div>
          
          {/* Description skeleton */}
          <div className="space-y-3 mb-10 max-w-2xl mx-auto">
            <div className="h-5 w-full bg-slate-800/30 rounded animate-pulse"></div>
            <div className="h-5 w-5/6 mx-auto bg-slate-800/30 rounded animate-pulse"></div>
          </div>
          
          {/* CTA Button skeleton */}
          <div className="flex justify-center">
            <div className="h-14 w-48 bg-white/10 rounded-full animate-pulse"></div>
          </div>
          
          {/* Use Cases skeleton */}
          <div className="mt-16 grid grid-cols-2 md:flex md:flex-row justify-center gap-4 max-w-2xl mx-auto">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-12 w-32 bg-zinc-900/40 border border-white/5 rounded-2xl animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeLoadingSkeleton />}>
      <HomeClient />
    </Suspense>
  );
}
