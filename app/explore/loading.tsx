export default function Loading() {
  return (
    <div className="flex h-[100dvh] pt-20 md:pt-16 overflow-hidden relative">
      {/* Fixed background to prevent edge visibility */}
      <div className="fixed inset-0 bg-zinc-950 -z-10" />
      
      {/* Sidebar Skeleton */}
      <aside className="w-64 flex-shrink-0 border-r border-white/5 bg-zinc-900/30 backdrop-blur-xl hidden md:flex flex-col">
        <div className="p-6">
          <div className="h-6 w-32 bg-white/5 rounded"></div>
        </div>
        <div className="flex-1 px-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 w-full bg-white/5 rounded-xl"></div>
          ))}
        </div>
        <div className="p-4 border-t border-white/5">
          <div className="h-24 w-full bg-white/5 rounded-xl"></div>
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile header skeleton */}
        <div className="md:hidden z-30 bg-black/80 border-b border-white/10 px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <div className="h-8 w-8 bg-slate-800 rounded-lg"></div>
          <div className="flex-1 flex gap-1.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-6 w-16 bg-slate-800 rounded-full"></div>
            ))}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header Skeleton - Desktop only */}
            <div className="hidden md:flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="h-10 w-96 bg-white/5 rounded-lg"></div>
              <div className="h-10 w-80 bg-white/5 rounded-xl"></div>
            </div>

            {/* Hero Skeleton */}
            <div className="mb-6 md:mb-16 mt-4 md:mt-8">
              <div className="h-40 md:h-[350px] bg-slate-900/40 border border-white/10 rounded-2xl md:rounded-3xl overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-800/30 to-transparent skeleton-shimmer" />
              </div>
            </div>

            {/* Grid Skeleton - 使用 grid-cols-2 适配移动端 */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-72 md:h-80 rounded-2xl overflow-hidden border border-white/10 bg-slate-900/40 flex flex-col">
                  {/* 预览区骨架 */}
                  <div className="h-40 md:h-44 bg-slate-800/50 flex-shrink-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-700/30 to-transparent skeleton-shimmer" />
                  </div>
                  
                  {/* 内容区骨架 */}
                  <div className="p-2 md:p-3 flex flex-col flex-grow">
                    <div className="h-4 w-3/4 bg-slate-700/50 rounded mb-2" />
                    <div className="h-3 w-full bg-slate-800/50 rounded mb-1" />
                    <div className="h-3 w-2/3 bg-slate-800/50 rounded" />
                    
                    <div className="flex-grow" />
                    
                    <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-slate-700/50" />
                        <div className="h-3 w-16 bg-slate-800/50 rounded" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-3 w-8 bg-slate-800/50 rounded" />
                        <div className="h-3 w-8 bg-slate-800/50 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
