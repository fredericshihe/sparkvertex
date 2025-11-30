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

  // 4. Re-inject stable scripts at the beginning of head
  // We inject them before any other scripts to ensure they are available.
  // Using cdn.staticfile.org (Seven Niu Cloud) for maximum stability in China, and jsdelivr for others.
  const stableScripts = `
    <script src="https://cdn.staticfile.org/react/18.2.0/umd/react.production.min.js"></script>
    <script src="https://cdn.staticfile.org/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
    <script src="https://cdn.staticfile.org/prop-types/15.8.1/prop-types.min.js"></script>
    <script src="https://cdn.staticfile.org/babel-standalone/7.23.5/babel.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/lucide-react@0.263.1/dist/umd/lucide-react.min.js"></script>
    <script>
      // Polyfill for legacy code expecting global lucideReact
      window.lucideReact = window.lucideReact || {};
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
      try {
        // 1. Storage Protection & Namespacing
        // We wrap localStorage to prefix keys, preventing the app from accidentally overwriting parent site data.
        // Note: This is a soft protection. Malicious code can still access window.parent.localStorage if allow-same-origin is on.
        // But for "tools", this prevents collisions.
        
        var originalSetItem = Storage.prototype.setItem;
        var originalGetItem = Storage.prototype.getItem;
        var originalRemoveItem = Storage.prototype.removeItem;
        var originalClear = Storage.prototype.clear;
        var originalKey = Storage.prototype.key;
        
        // Prefix for this specific iframe context (if we could inject ID, it would be better, but generic is safer than raw)
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
        
        // Clear only app data, not parent data
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
        console.warn('Storage access restricted, using memory storage');
        var mockStorage = {
          _data: {},
          getItem: function(k) { return this._data[k] || null; },
          setItem: function(k, v) { this._data[k] = String(v); },
          removeItem: function(k) { delete this._data[k]; },
          clear: function() { this._data = {}; },
          length: 0,
          key: function(i) { return Object.keys(this._data)[i] || null; }
        };
        try {
          Object.defineProperty(window, 'localStorage', { value: mockStorage });
          Object.defineProperty(window, 'sessionStorage', { value: mockStorage });
        } catch(e) {}
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
            return true;
        }
        console.log('App Error:', msg);
        return false;
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
      background-color: #ffffff;
      /* Safe area handling */
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
    ::-webkit-scrollbar { width: 0px; background: transparent; }
    body { -ms-overflow-style: none; scrollbar-width: none; }
  </style>`;
  
  let newContent = patchedContent;
  if (newContent.includes('<head>')) {
      newContent = newContent.replace('<head>', `<head>${viewportMeta}${safetyScript}${injectedStyle}`);
  } else if (newContent.includes('<html>')) {
      newContent = newContent.replace('<html>', `<html><head>${viewportMeta}${safetyScript}${injectedStyle}</head>`);
  } else {
      newContent = `<head>${viewportMeta}${safetyScript}${injectedStyle}</head>${newContent}`;
  }
  return newContent;
};
