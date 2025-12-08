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
