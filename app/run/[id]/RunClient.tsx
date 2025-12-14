'use client';

import { useEffect, useState } from 'react';
import { getPreviewContent } from '@/lib/preview';
import { Item } from '@/types/supabase';

export default function RunClient({ item }: { item: Item }) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiBaseUrl(window.location.origin);
    }
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full bg-white">
      <iframe 
        srcDoc={getPreviewContent(item.content || '', { raw: true, appId: String(item.id), apiBaseUrl })}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-modals allow-forms allow-popups allow-downloads"
        allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay; fullscreen; picture-in-picture; display-capture; screen-wake-lock"
        style={{ touchAction: 'manipulation' }}
      />
    </div>
  );
}
