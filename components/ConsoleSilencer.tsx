'use client';

import { useEffect } from 'react';

/**
 * ConsoleSilencer component
 * 
 * This component suppresses console logs in production environments to prevent
 * leaking implementation details, build information, or algorithms to the user.
 * It should be mounted at the root of the application (e.g., in layout.tsx).
 */
export default function ConsoleSilencer() {
  useEffect(() => {
    // 在开发环境下过滤掉 CDN 相关的警告（这些是预览模式的正常行为）
    if (process.env.NODE_ENV === 'development') {
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        const message = args[0]?.toString() || '';
        // 过滤 Babel 和 Tailwind CDN 的警告
        if (message.includes('in-browser Babel transformer') || 
            message.includes('cdn.tailwindcss.com should not be used in production')) {
          return;
        }
        originalWarn.apply(console, args);
      };
    }
    
    // Only silence in production
    if (process.env.NODE_ENV === 'production') {
      const noop = () => {};
      
      // Save original methods in case we need them for emergency debugging (hidden)
      // (Optional: could attach to window.__originalConsole if really needed, but better to just silence)
      
      // Silence all common log levels
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.warn = noop;
      console.error = noop;
      
      // Clear any existing logs
      console.clear();
    }
  }, []);

  return null;
}
