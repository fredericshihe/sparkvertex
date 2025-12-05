export default function Loading() {
  return (
    <div className="flex h-[100dvh] pt-16 bg-slate-950 overflow-hidden">
      {/* Sidebar Skeleton */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl hidden md:flex flex-col">
        <div className="p-6">
          <div className="h-6 w-32 bg-slate-800 rounded animate-pulse"></div>
        </div>
        <div className="flex-1 px-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 w-full bg-slate-800/50 rounded-xl animate-pulse"></div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-800">
          <div className="h-24 w-full bg-slate-800/50 rounded-xl animate-pulse"></div>
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header Skeleton */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="space-y-2">
                <div className="h-8 w-48 bg-slate-800 rounded animate-pulse"></div>
                <div className="h-6 w-96 bg-slate-800/50 rounded animate-pulse"></div>
              </div>
              <div className="h-10 w-full md:w-80 bg-slate-800 rounded-xl animate-pulse"></div>
            </div>

            {/* Hero Skeleton */}
            <div className="mb-16 mt-8 h-[450px] bg-slate-900 border border-slate-800 rounded-3xl animate-pulse"></div>

            {/* Grid Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-[4/3] bg-slate-900 border border-slate-800 rounded-xl animate-pulse"></div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
