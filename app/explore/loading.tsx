export default function Loading() {
  return (
    <div className="flex h-[100dvh] pt-16 bg-zinc-950 overflow-hidden">
      {/* Sidebar Skeleton */}
      <aside className="w-64 flex-shrink-0 border-r border-white/5 bg-zinc-900/30 backdrop-blur-xl hidden md:flex flex-col">
        <div className="p-6">
          <div className="h-6 w-32 bg-white/5 rounded animate-pulse"></div>
        </div>
        <div className="flex-1 px-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 w-full bg-white/5 rounded-xl animate-pulse"></div>
          ))}
        </div>
        <div className="p-4 border-t border-white/5">
          <div className="h-24 w-full bg-white/5 rounded-xl animate-pulse"></div>
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 relative">
        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header Skeleton */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="space-y-2">
                <div className="h-8 w-48 bg-white/10 rounded animate-pulse"></div>
                <div className="h-6 w-96 bg-white/5 rounded animate-pulse hidden md:block"></div>
              </div>
              <div className="h-10 w-full md:w-80 bg-white/5 rounded-xl animate-pulse"></div>
            </div>

            {/* Hero Skeleton */}
            <div className="mb-16 mt-8 h-[450px] bg-white/5 border border-white/10 rounded-3xl animate-pulse"></div>

            {/* Grid Skeleton - Matching ProjectCard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
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
        </main>
      </div>
    </div>
  );
}
