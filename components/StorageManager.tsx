'use client';

import { useEffect } from 'react';

export default function StorageManager() {
  useEffect(() => {
    async function initStorage() {
      // Check if the API is supported
      if (navigator.storage && navigator.storage.persist) {
        try {
          // Check if we already have permission
          const isPersisted = await navigator.storage.persisted();
          if (!isPersisted) {
            // Request permission
            const result = await navigator.storage.persist();
            console.log(`Storage Persisted: ${result}`);
          } else {
            console.log('Storage is already persisted');
          }
          
          // Log quota usage for debugging
          if (navigator.storage.estimate) {
            const { quota, usage } = await navigator.storage.estimate();
            console.log(`Storage Quota: ${usage} / ${quota} bytes`);
          }
        } catch (err) {
          console.error('Storage persistence request failed:', err);
        }
      }
    }
    
    initStorage();
  }, []);

  return null;
}
