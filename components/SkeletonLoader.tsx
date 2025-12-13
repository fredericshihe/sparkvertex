'use client';

export default function SkeletonLoader() {
  return (
    <div className="page-section relative z-10 pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-8 animate-pulse">
          <div className="h-10 w-48 bg-white/10 rounded-lg"></div>
          <div className="h-10 w-80 bg-white/5 rounded-lg hidden md:block"></div>
        </div>

        {/* Featured Card Skeleton */}
        <div className="mb-12 animate-pulse">
          <div className="h-96 bg-white/5 rounded-3xl border border-white/10"></div>
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden h-full flex flex-col animate-pulse">
              {/* Image Area */}
              <div className="h-40 md:h-44 bg-white/5 w-full flex-shrink-0"></div>
              
              {/* Content Area */}
              <div className="p-2 md:p-3 flex flex-col flex-grow">
                {/* Title */}
                <div className="h-4 w-3/4 bg-white/10 rounded mb-2"></div>
                {/* Description */}
                <div className="h-3 w-full bg-white/5 rounded mb-1"></div>
                <div className="h-3 w-2/3 bg-white/5 rounded mb-2"></div>
                
                <div className="flex-grow"></div>
                
                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-white/10"></div>
                    <div className="h-3 w-16 bg-white/5 rounded"></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-3 w-8 bg-white/5 rounded"></div>
                    <div className="h-3 w-8 bg-white/5 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
