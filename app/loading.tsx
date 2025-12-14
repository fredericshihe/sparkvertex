'use client';

/**
 * 首页骨架屏 - 实现秒开体验
 * 在首页 JS 加载完成前显示，避免白屏
 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen flex flex-col relative bg-black">
      {/* 首屏 Hero 骨架 */}
      <div className="relative w-full min-h-screen flex flex-col items-center justify-center py-20 pb-32 md:pb-20">
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          
          {/* Badge 骨架 */}
          <div className="inline-flex mb-8">
            <div className="px-6 py-2.5 bg-zinc-900/90 ring-1 ring-white/10 rounded-full flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-purple-600 skeleton-shimmer"></div>
              <div className="w-32 h-4 bg-slate-700 rounded skeleton-shimmer"></div>
            </div>
          </div>

          {/* 标题骨架 */}
          <div className="space-y-4 mb-6">
            <div className="h-12 md:h-16 bg-slate-800 rounded-lg w-3/4 mx-auto skeleton-shimmer"></div>
            <div className="h-12 md:h-16 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg w-2/3 mx-auto skeleton-shimmer"></div>
          </div>

          {/* 描述骨架 */}
          <div className="space-y-2 mb-10 max-w-2xl mx-auto">
            <div className="h-5 bg-slate-800/60 rounded w-full skeleton-shimmer"></div>
            <div className="h-5 bg-slate-800/60 rounded w-4/5 mx-auto skeleton-shimmer"></div>
          </div>

          {/* CTA 按钮骨架 */}
          <div className="flex justify-center">
            <div className="w-48 h-14 bg-white/10 rounded-full skeleton-shimmer"></div>
          </div>

          {/* Use Cases 骨架 */}
          <div className="mt-16 grid grid-cols-2 md:flex md:flex-row justify-center gap-4 max-w-2xl mx-auto px-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-zinc-900/40 border border-white/5">
                <div className="w-8 h-8 rounded-lg bg-slate-700 skeleton-shimmer"></div>
                <div className="w-16 h-4 bg-slate-700 rounded skeleton-shimmer"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll Indicator 骨架 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-6 h-6 bg-white/20 rounded skeleton-shimmer"></div>
        </div>
      </div>
    </div>
  );
}
