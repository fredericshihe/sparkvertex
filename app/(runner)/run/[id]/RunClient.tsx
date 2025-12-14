'use client';

import { useMemo } from 'react';
import { getPreviewContent } from '@/lib/preview';
import { Item } from '@/types/supabase';

export default function RunClient({ item }: { item: Item }) {
  // 使用 useMemo 缓存内容，只在 item 变化时重新计算
  const content = useMemo(() => {
    // 在客户端获取 origin
    const apiBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    // 🚀 优先使用预编译内容（无需浏览器端 Babel，节省 1.4MB + 2-3秒解析时间）
    const contentToRender = item.content || '';
    const isPrecompiled = false;
    return getPreviewContent(contentToRender, { raw: true, appId: String(item.id), apiBaseUrl, isPrecompiled });
  }, [item.content, item.id]);

  return (
    <div className="fixed inset-0 w-full h-full bg-white">
      <iframe 
        srcDoc={content}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-modals allow-forms allow-popups allow-downloads"
        allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay; fullscreen; picture-in-picture; display-capture; screen-wake-lock"
        style={{ touchAction: 'manipulation' }}
      />
    </div>
  );
}
