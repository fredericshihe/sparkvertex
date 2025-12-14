'use client';

import { memo } from 'react';

interface CardSkeletonProps {
  count?: number;
}

/**
 * 卡片骨架屏组件 - 用于灵枢广场秒开体验
 * 使用静态 CSS 动画，无 JavaScript 开销
 */
function CardSkeleton({ count = 12 }: CardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="h-72 md:h-80 rounded-2xl overflow-hidden border border-white/10 bg-slate-900/40 flex flex-col"
        >
          {/* 预览区骨架 */}
          <div className="h-40 md:h-44 bg-slate-800/50 flex-shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-700/30 to-transparent skeleton-shimmer" />
          </div>
          
          {/* 内容区骨架 */}
          <div className="p-2 md:p-3 flex flex-col flex-grow">
            {/* 标题 */}
            <div className="h-4 w-3/4 bg-slate-700/50 rounded mb-2" />
            {/* 描述 */}
            <div className="h-3 w-full bg-slate-800/50 rounded mb-1" />
            <div className="h-3 w-2/3 bg-slate-800/50 rounded" />
            
            <div className="flex-grow" />
            
            {/* 底部 */}
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
    </>
  );
}

export default memo(CardSkeleton);
