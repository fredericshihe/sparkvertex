/**
 * Centralized logic for injecting mobile adaptation styles and meta tags into HTML content.
 * This ensures consistent behavior across Upload Preview, Detail Modal, and Standalone PWA views.
 */
export const getPreviewContent = (content: string | null) => {
  if (!content) return '';

  // --- HOT PATCH: Fix Legacy Apps (White Screen Issue) ---
  // Replace unstable/broken CDN links in existing database records with stable ones.
  let patchedContent = content;

  // 1. Fix React & ReactDOM (Use cdnjs for stability)
  patchedContent = patchedContent.replace(
    /<script.*src=".*react(\.development|\.production\.min)\.js".*><\/script>/g,
    ''
  ).replace(
    /<script.*src=".*react-dom(\.development|\.production\.min)\.js".*><\/script>/g,
    ''
  );

  // 2. Fix Lucide React (Use specific stable version 0.263.1 from jsdelivr)
  patchedContent = patchedContent.replace(
    /<script.*src=".*lucide-react.*\.js".*><\/script>/g,
    ''
  );

  // 3. Fix Babel (Use cdnjs)
  patchedContent = patchedContent.replace(
    /<script.*src=".*babel.*\.js".*><\/script>/g,
    ''
  );

  // 3.1 Fix Framer Motion (Broken CDN link -> Remove or Replace)
  // The user reported a 404 for cdnjs/framer-motion. We should remove it to prevent errors.
  // If the code relies on it, it might break, but a 404 breaks it anyway.
  // We can try to replace it with a working ESM link if we really wanted, but for now, stripping it is safer
  // as we are moving to Tailwind/CSS animations.
  patchedContent = patchedContent.replace(
    /<script.*src=".*framer-motion.*\.js".*><\/script>/g,
    ''
  );

  // 4. Fix Broken Unsplash URLs (AI sometimes outputs just the ID)
  // Example: src="photo-123..." -> src="https://images.unsplash.com/photo-123..."
  patchedContent = patchedContent.replace(
    /src=["'](photo-[^"']+)["']/g, 
    'src="https://images.unsplash.com/$1?auto=format&fit=crop&w=800&q=80"'
  );
  // Handle unquoted src (e.g. src=photo-123)
  patchedContent = patchedContent.replace(
    /src=(photo-[^"'\s>]+)/g, 
    'src="https://images.unsplash.com/$1?auto=format&fit=crop&w=800&q=80"'
  );
  patchedContent = patchedContent.replace(
    /url\(['"]?(photo-[^'"\)]+)['"]?\)/g, 
    'url("https://images.unsplash.com/$1?auto=format&fit=crop&w=800&q=80")'
  );

  // 5. Re-inject stable scripts at the beginning of head
  // We inject them before any other scripts to ensure they are available.
  // Using cdn.staticfile.org (Seven Niu Cloud) for maximum stability in China, and jsdelivr for others.
  
  // Check if the content uses ESM React imports to avoid dual-loading
  const hasESMReact = patchedContent.includes('esm.sh/react');
  
  const stableScripts = `
    ${!hasESMReact ? '<script src="https://cdn.staticfile.org/react/18.2.0/umd/react.production.min.js"></script>' : ''}
    ${!hasESMReact ? '<script src="https://cdn.staticfile.org/react-dom/18.2.0/umd/react-dom.production.min.js"></script>' : ''}
    <script src="https://cdn.staticfile.org/prop-types/15.8.1/prop-types.min.js"></script>
    ${!hasESMReact ? '<script src="https://unpkg.com/lucide-react@0.263.1/dist/umd/lucide-react.min.js"></script>' : ''}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/recharts/2.12.0/Recharts.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.23.5/babel.min.js"></script>
    <script>
      // Polyfill for legacy code expecting global lucideReact
      // The UMD build exports as 'lucide' (lowercase) in newer versions, or 'LucideReact' in older ones.
      // We check all possibilities.
      const source = window.lucide || window.LucideReact || window.lucideReact || {};
      
      window.lucideReact = new Proxy(source, {
        get: function(target, prop) {
          if (prop in target) {
            return target[prop];
          }
          // If the icon is missing, return a dummy component to prevent crash
          return function() { return null; };
        }
      });

      // Polyfill for Recharts
      // Ensure window.Recharts is available and proxied to prevent crashes if a component is missing
      const rechartsSource = window.Recharts || {};
      window.Recharts = new Proxy(rechartsSource, {
        get: function(target, prop) {
          if (prop in target) {
            return target[prop];
          }
          console.warn('Missing Recharts component:', prop);
          return function() { return null; };
        }
      });
    </script>
  `;

  if (patchedContent.includes('<head>')) {
    patchedContent = patchedContent.replace('<head>', `<head>${stableScripts}`);
  } else {
    patchedContent = `<head>${stableScripts}</head>${patchedContent}`;
  }
  // -------------------------------------------------------
  
  // Inject viewport for mobile adaptation and disable selection/callout
  // viewport-fit=cover is important for notches
  const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">';
  
  // Script to prevent crashes on iOS/Safari when accessing localStorage/sessionStorage in data: URI
  // AND Security: Namespace storage to prevent collision/overwriting parent data
  const safetyScript = `<script>
    (function() {
      var mockStorage = {
        _data: {},
        getItem: function(k) { return this._data[k] || null; },
        setItem: function(k, v) { this._data[k] = String(v); },
        removeItem: function(k) { delete this._data[k]; },
        clear: function() { this._data = {}; },
        length: 0,
        key: function(i) { return Object.keys(this._data)[i] || null; }
      };

      function patchStoragePrototype() {
         try {
             // If we can't replace the global object, we patch the prototype to use memory storage
             // This affects all Storage instances (localStorage and sessionStorage)
             var memoryStore = {}; // Shared store for fallback
             
             Storage.prototype.setItem = function(k, v) { memoryStore[k] = String(v); };
             Storage.prototype.getItem = function(k) { return memoryStore[k] || null; };
             Storage.prototype.removeItem = function(k) { delete memoryStore[k]; };
             Storage.prototype.clear = function() { memoryStore = {}; };
             Storage.prototype.key = function(i) { return Object.keys(memoryStore)[i] || null; };
             console.warn('Patched Storage.prototype to use memory store');
         } catch(e) {
             console.error('Failed to patch Storage prototype', e);
         }
      }

      try {
        // 0. Test Storage Access
        // This will throw SecurityError in restricted iframes (e.g. Safari) immediately
        window.localStorage.setItem('__test__', '1');
        window.localStorage.removeItem('__test__');

        // 1. Storage Protection & Namespacing (If storage works)
        // We wrap localStorage to prefix keys, preventing the app from accidentally overwriting parent site data.
        
        var originalSetItem = Storage.prototype.setItem;
        var originalGetItem = Storage.prototype.getItem;
        var originalRemoveItem = Storage.prototype.removeItem;
        var originalClear = Storage.prototype.clear;
        var originalKey = Storage.prototype.key;
        
        var PREFIX = 'app_data_'; 
        
        Storage.prototype.setItem = function(key, value) {
            if (key.startsWith(PREFIX)) {
                return originalSetItem.call(this, key, value);
            }
            return originalSetItem.call(this, PREFIX + key, value);
        };
        
        Storage.prototype.getItem = function(key) {
            if (key.startsWith(PREFIX)) {
                return originalGetItem.call(this, key);
            }
            return originalGetItem.call(this, PREFIX + key);
        };

        Storage.prototype.removeItem = function(key) {
            if (key.startsWith(PREFIX)) {
                return originalRemoveItem.call(this, key);
            }
            return originalRemoveItem.call(this, PREFIX + key);
        };
        
        Storage.prototype.clear = function() {
            var keysToRemove = [];
            for (var i = 0; i < this.length; i++) {
                var key = originalKey.call(this, i);
                if (key && key.startsWith(PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(function(k) {
                originalRemoveItem.call(this, k);
            }.bind(this));
        };

      } catch (e) {
        // Fallback for restricted environments
        // console.log('Storage access restricted, switching to memory storage');
        
        try {
          // Try to replace the global properties
          Object.defineProperty(window, 'localStorage', { value: mockStorage, configurable: true, writable: true });
          Object.defineProperty(window, 'sessionStorage', { value: mockStorage, configurable: true, writable: true });
        } catch(e2) {
            console.warn("Failed to replace global storage objects, attempting prototype patch", e2);
            patchStoragePrototype();
        }
      }
      
      // 2. Security: Block Top Navigation
      // Prevent the iframe from redirecting the main window
      window.onbeforeunload = function() {
        return null; // Prevent navigation if possible
      };
      
      try {
          // Attempt to freeze parent access (Soft protection)
          if (window.parent !== window) {
             // We cannot truly block window.parent access with allow-same-origin
             // But we can try to hide it from casual scripts
             // Object.defineProperty(window, 'parent', { value: null, writable: false }); // This often throws
          }
      } catch(e) {}

      // Error handling
      window.onerror = function(msg, url, line) {
        // Suppress "Script error." which is common in cross-origin iframes and provides no value
        if (msg === 'Script error.' || msg === 'Script error') {
            return true;
        }
        // Suppress "SecurityError: The operation is insecure." which happens when accessing storage in restricted iframes
        if (String(msg).includes('SecurityError') || String(msg).includes('The operation is insecure')) {
            console.warn('Suppressed SecurityError:', msg);
            return true;
        }
        console.log('App Error:', msg);
        // Notify parent about the error
        try {
            window.parent.postMessage({ type: 'spark-app-error', error: String(msg) }, '*');
        } catch(e) {}
        return false;
      };

      // Global Promise Rejection Handler for SecurityError
      window.onunhandledrejection = function(event) {
        const reason = String(event.reason);
        if (reason.includes('SecurityError') || reason.includes('The operation is insecure')) {
            console.warn('Suppressed Unhandled SecurityError:', event.reason);
            event.preventDefault();
        }
        // Suppress Audio Autoplay errors (NotAllowedError: play() failed)
        if (reason.includes('NotAllowedError') || reason.includes('play failed')) {
             console.warn('Suppressed Autoplay Error:', event.reason);
             event.preventDefault();
        }
      };

      // Mobile Audio Unlocker
      document.addEventListener('click', function() {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          var ctx = new AudioContext();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
        }
      }, { once: true });
      document.addEventListener('touchstart', function() {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          var ctx = new AudioContext();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
        }
      }, { once: true });
    })();
  </script>`;

  const injectedStyle = `<style>
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    html { width: 100%; height: 100%; overflow: hidden; }
    body { 
      margin: 0; 
      padding: 0; 
      width: 100%; 
      height: 100%; 
      overflow-x: hidden; 
      overflow-y: auto;
      user-select: none; 
      -webkit-user-select: none; 
      -webkit-touch-callout: none; 
      background-color: #0f172a;
      color: #ffffff;
      /* Safe area handling */
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
    ::-webkit-scrollbar { width: 0px; background: transparent; }
    body { -ms-overflow-style: none; scrollbar-width: none; }
    #root { width: 100%; height: 100%; }
  </style>`;
  
  const probeScript = `
    <style>
      .__spark_highlight__ {
        outline: 2px dashed #3b82f6 !important;
        background-color: rgba(59, 130, 246, 0.1) !important;
        cursor: crosshair !important;
        transition: all 0.1s ease;
        position: relative;
        z-index: 9999;
      }
    </style>
    <script>
      (function() {
        let isEditMode = false;
        let hoveredElement = null;
        const originalRAF = window.requestAnimationFrame;

        function getElementPath(element) {
            const path = [];
            while (element && element.nodeType === Node.ELEMENT_NODE) {
                let selector = element.nodeName.toLowerCase();
                if (element.id) {
                    selector += '#' + element.id;
                    path.unshift(selector);
                    break;
                } else {
                    let sib = element, nth = 1;
                    while (sib = sib.previousElementSibling) {
                        if (sib.nodeName.toLowerCase() == selector)
                           nth++;
                    }
                    if (nth != 1)
                        selector += ":nth-of-type("+nth+")";
                }
                path.unshift(selector);
                element = element.parentNode;
            }
            return path.join(" > ");
        }

        function handleMouseOver(e) {
          if (!isEditMode) return;
          e.stopPropagation();
          if (hoveredElement) {
            hoveredElement.classList.remove('__spark_highlight__');
          }
          hoveredElement = e.target;
          hoveredElement.classList.add('__spark_highlight__');
        }

        function handleMouseOut(e) {
          if (!isEditMode) return;
          e.stopPropagation();
          if (hoveredElement) {
            hoveredElement.classList.remove('__spark_highlight__');
            hoveredElement = null;
          }
        }

        function handleClick(e) {
          if (!isEditMode) return;
          e.preventDefault();
          e.stopPropagation();
          
          const el = e.target;
          const info = {
            tagName: el.tagName.toLowerCase(),
            className: el.className.replace('__spark_highlight__', '').trim(),
            innerText: el.innerText ? el.innerText.substring(0, 50) : '',
            path: getElementPath(el)
          };
          
          window.parent.postMessage({ type: 'spark-element-selected', payload: info }, '*');
        }

        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'toggle-edit-mode') {
            isEditMode = event.data.enabled;
            if (isEditMode) {
              document.body.addEventListener('mouseover', handleMouseOver, true);
              document.body.addEventListener('mouseout', handleMouseOut, true);
              document.body.addEventListener('click', handleClick, true);
              
              // Pause animations for easier selection
              const style = document.createElement('style');
              style.id = 'spark-pause-animations';
              style.innerHTML = '* { animation-play-state: paused !important; transition: none !important; }';
              document.head.appendChild(style);

              // Freeze JS animations (RAF)
              window.requestAnimationFrame = function() { return -1; };
            } else {
              document.body.removeEventListener('mouseover', handleMouseOver, true);
              document.body.removeEventListener('mouseout', handleMouseOut, true);
              document.body.removeEventListener('click', handleClick, true);
              if (hoveredElement) {
                hoveredElement.classList.remove('__spark_highlight__');
                hoveredElement = null;
              }
              
              // Resume animations
              const style = document.getElementById('spark-pause-animations');
              if (style) style.remove();

              // Restore RAF
              window.requestAnimationFrame = originalRAF;
            }
          }
        });
      })();
    </script>
  `;

  let newContent = patchedContent;
  if (newContent.includes('<head>')) {
      newContent = newContent.replace('<head>', `<head>${viewportMeta}${safetyScript}${injectedStyle}`);
  } else if (newContent.includes('<html>')) {
      newContent = newContent.replace('<html>', `<html><head>${viewportMeta}${safetyScript}${injectedStyle}</head>`);
  } else {
      newContent = `<head>${viewportMeta}${safetyScript}${injectedStyle}</head>${newContent}`;
  }
  
  // Inject probe script before body end
  if (newContent.includes('</body>')) {
      newContent = newContent.replace('</body>', `${probeScript}</body>`);
  } else {
      newContent += probeScript;
  }

  return newContent;
};
