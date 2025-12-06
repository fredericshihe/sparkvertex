'use client';

export default function SkeletonLoader() {
  return (
    <div className="page-section relative z-10 pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-8 animate-pulse">
          <div className="h-10 w-48 bg-slate-800 rounded-lg"></div>
          <div className="h-10 w-80 bg-slate-800 rounded-lg hidden md:block"></div>
        </div>

        {/* Featured Card Skeleton */}
        <div className="mb-12 animate-pulse">
          <div className="h-96 bg-slate-800/50 rounded-3xl border border-slate-700"></div>
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-80 bg-slate-800/50 rounded-2xl border border-slate-700"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
