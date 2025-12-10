/**
 * Centralized logic for injecting iframe safety scripts and point-and-click edit support.
 * Minimal modifications for maximum fidelity to double-click open behavior.
 * 
 * @param content - The HTML content to process
 * @param options - Configuration options (kept for backward compatibility, currently ignored)
 */
export const getPreviewContent = (content: string | null, options?: { raw?: boolean; appId?: string; userId?: string; apiBaseUrl?: string }): string => {
  if (!content) return '';

  // Debug: Log received options
  console.log('[preview.ts] getPreviewContent called with options:', JSON.stringify({
    appId: options?.appId,
    userId: options?.userId,
    apiBaseUrl: options?.apiBaseUrl?.substring(0, 30),
    hasContent: !!content
  }));

  // Generate SPARK_APP_ID for backend integration
  // In preview mode: draft_{user_id}, after publish: use the actual app ID (numeric)
  const userId = options?.userId || '';
  // IMPORTANT: Use provided appId directly, don't fallback to draft format for published apps
  let appId = options?.appId || '';
  
  // Only generate draft ID if no appId was provided at all
  if (!appId) {
    if (userId) {
      appId = `draft_${userId}`;
    } else {
      appId = 'draft_demo_' + Math.random().toString(36).substring(7);
    }
  }
  
  // Debug log (will appear in server console during SSR)
  console.log('[preview.ts] Final appId:', appId);
  
  const providedApiBase = options?.apiBaseUrl || '';
  
  // Inject SPARK_APP_ID for backend API calls
  // If userId not provided, request from parent window
  // Also inject API base URL and fetch interceptor for srcdoc iframe
  const sparkAppIdScript = `<script>
    (function() {
      // ============================================
      // 端到端加密工具
      // ============================================
      window.SparkCrypto = {
        // ArrayBuffer 转 Base64
        arrayBufferToBase64: function(buffer) {
          var bytes = new Uint8Array(buffer);
          var binary = '';
          for (var i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        },
        
        // AES 加密
        aesEncrypt: async function(data) {
          var aesKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );
          
          var iv = crypto.getRandomValues(new Uint8Array(12));
          var encoded = new TextEncoder().encode(data);
          
          var encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            encoded
          );
          
          var rawKey = await crypto.subtle.exportKey('raw', aesKey);
          
          return {
            encrypted: this.arrayBufferToBase64(encrypted),
            key: rawKey,
            iv: iv
          };
        },
        
        // 混合加密（AES + RSA）
        encryptData: async function(data, publicKeyJWK) {
          // 导入公钥
          var publicKey = await crypto.subtle.importKey(
            'jwk',
            publicKeyJWK,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['encrypt']
          );
          
          var jsonData = JSON.stringify(data);
          
          // 1. AES 加密数据
          var aesResult = await this.aesEncrypt(jsonData);
          
          // 2. RSA 加密 AES 密钥
          var encryptedKey = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            publicKey,
            aesResult.key
          );
          
          // 3. 打包
          return JSON.stringify({
            v: 1,
            d: aesResult.encrypted,
            k: this.arrayBufferToBase64(encryptedKey),
            i: this.arrayBufferToBase64(aesResult.iv.buffer)
          });
        }
      };
      
      // 公钥存储
      window.SPARK_PUBLIC_KEY = null;
      
      // ============================================
      // CMS 内容管理工具
      // ============================================
      window.SparkCMS = {
        // 内容缓存
        _cache: {},
        _initialized: false,
        
        // 初始化：预加载所有内容到缓存
        init: async function() {
          if (this._initialized || !window.SPARK_APP_ID) return;
          
          try {
            if (window.supabase) {
              var { data, error } = await window.supabase
                .from('public_content')
                .select('slug, content')
                .eq('app_id', window.SPARK_APP_ID);
                
              if (!error && data) {
                data.forEach(function(item) {
                  window.SparkCMS._cache[item.slug] = item.content;
                });
                this._initialized = true;
                console.log('[SparkCMS] Loaded', data.length, 'content items');
              }
            }
          } catch (e) {
            console.warn('[SparkCMS] Init failed:', e);
          }
        },
        
        // 获取内容 (同步，从缓存读取，支持默认值)
        getContent: function(slug, defaultValue) {
          // 如果缓存中有，返回缓存
          if (this._cache[slug] !== undefined) {
            return this._cache[slug];
          }
          // 否则返回默认值
          return defaultValue !== undefined ? defaultValue : '';
        },
        
        // 异步获取单条内容（会更新缓存）
        fetchContent: async function(slug, defaultValue) {
          if (!window.SPARK_APP_ID) {
            console.warn('SparkCMS: App ID not found');
            return defaultValue || '';
          }
          
          try {
            // 尝试通过 Supabase Client 获取 (如果存在)
            if (window.supabase) {
              var { data, error } = await window.supabase
                .from('public_content')
                .select('content')
                .eq('app_id', window.SPARK_APP_ID)
                .eq('slug', slug)
                .single();
                
              if (!error && data) {
                this._cache[slug] = data.content;
                return data.content;
              }
            }
            
            // 降级：尝试通过 API 获取
            var response = await fetch('/api/cms/content?appId=' + window.SPARK_APP_ID + '&slug=' + slug);
            if (response.ok) {
              var result = await response.json();
              if (result && result.content) {
                this._cache[slug] = result.content;
                return result.content;
              }
            }
          } catch (e) {
            console.error('SparkCMS: Failed to fetch content', e);
          }
          return defaultValue || '';
        },
        
        // 获取 HTML 内容 (如果是 Markdown 则转换)
        getHtml: async function(slug, defaultValue) {
          var content = await this.fetchContent(slug, defaultValue);
          // 简单的 Markdown 转 HTML (如果引入了 marked 库则使用)
          if (window.marked && content) {
            return window.marked.parse(content);
          }
          return content;
        },
        
        // 刷新所有动态内容 (应用 data-cms 属性的元素)
        refreshAll: function() {
          var self = this;
          // 刷新文本内容
          document.querySelectorAll('[data-cms]').forEach(function(el) {
            var slug = el.dataset.cms;
            var content = self.getContent(slug, el.textContent);
            if (content && content !== el.textContent) {
              el.textContent = content;
            }
          });
          // 刷新图片 src
          document.querySelectorAll('[data-cms-src]').forEach(function(el) {
            var slug = el.dataset.cmsSrc;
            var src = self.getContent(slug, el.src);
            if (src && src !== el.src) {
              el.src = src;
            }
          });
          // 刷新链接 href
          document.querySelectorAll('[data-cms-href]').forEach(function(el) {
            var slug = el.dataset.cmsHref;
            var href = self.getContent(slug, el.href);
            if (href && href !== el.href) {
              el.href = href;
            }
          });
          console.log('[SparkCMS] Refreshed all dynamic content');
        },
        
        // 更新单个内容（从外部调用，如父窗口 postMessage）
        updateContent: function(slug, content) {
          this._cache[slug] = content;
          // 立即更新 DOM
          document.querySelectorAll('[data-cms="' + slug + '"]').forEach(function(el) {
            el.textContent = content;
          });
          document.querySelectorAll('[data-cms-src="' + slug + '"]').forEach(function(el) {
            el.src = content;
          });
          document.querySelectorAll('[data-cms-href="' + slug + '"]').forEach(function(el) {
            el.href = content;
          });
        }
      };
      
      // 自动初始化 CMS 内容并应用到 DOM
      setTimeout(function() {
        window.SparkCMS.init().then(function() {
          window.SparkCMS.refreshAll();
        });
      }, 100);
      
      // 监听来自父窗口的内容更新消息
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'SPARK_CMS_UPDATE') {
          var updates = event.data.updates;
          if (updates && typeof updates === 'object') {
            Object.keys(updates).forEach(function(slug) {
              window.SparkCMS.updateContent(slug, updates[slug]);
            });
          }
        } else if (event.data && event.data.type === 'SPARK_CMS_REFRESH') {
          // 重新从数据库加载所有内容
          window.SparkCMS._initialized = false;
          window.SparkCMS.init().then(function() {
            window.SparkCMS.refreshAll();
          });
        }
      });

      // ============================================
      // API 配置
      // ============================================
      // Get the actual API base URL from parent window origin
      // This is needed because srcdoc iframes have origin "null" or "about:srcdoc"
      var apiBaseUrl = "${providedApiBase}";
      
      if (!apiBaseUrl) {
        try {
          // Try to get from referrer first
          if (document.referrer) {
            var url = new URL(document.referrer);
            apiBaseUrl = url.origin;
          }
        } catch(e) {}
      }
      
      // Fallback: try to detect from parent window or use current location
      if (!apiBaseUrl) {
        try {
          // Try parent window location
          if (window.parent && window.parent.location && window.parent.location.origin) {
            apiBaseUrl = window.parent.location.origin;
          }
        } catch(e) {
          // Cross-origin access blocked, use a smarter fallback
        }
      }
      
      // Final fallback: detect port from URL or use default
      if (!apiBaseUrl) {
        // Check if we're on a non-standard port in development
        var defaultPort = window.location.port || '3000';
        apiBaseUrl = 'http://' + (window.location.hostname || 'localhost') + ':' + defaultPort;
      }
      
      window.SPARK_API_BASE = apiBaseUrl;
      console.log('[Spark] Initial SPARK_API_BASE:', window.SPARK_API_BASE);
      
      // Set initial values if provided
      window.SPARK_APP_ID = "${appId}" || null;
      window.SPARK_USER_ID = "${userId}" || null;
      
      // Log initial values for debugging
      console.log('[Spark] Initial SPARK_APP_ID:', window.SPARK_APP_ID);
      
      // Always request the latest appId from parent to handle userId changes
      // This ensures we get the correct appId even if userId wasn't available initially
      window.parent.postMessage({ type: 'spark-request-user-id' }, '*');
      
      // Intercept fetch to rewrite /api/ URLs to use correct base
      var originalFetch = window.fetch;
      window.fetch = function(url, options) {
        var newUrl = url;
        var isApi = false;
        
        if (typeof url === 'string' && url.startsWith('/api/')) {
          newUrl = window.SPARK_API_BASE + url;
          console.log('[Spark] Rewriting API URL:', url, '->', newUrl);
          isApi = true;
        } else if (typeof url === 'object' && url && url.url) {
           // Handle Request object
           var urlStr = url.url;
           // If the URL is resolved to about:srcdoc (iframe base), we need to fix it
           if (urlStr.includes('/api/') && (urlStr.startsWith('about:') || urlStr.startsWith('blob:') || urlStr.startsWith('data:'))) {
              try {
                 var apiPath = urlStr.substring(urlStr.indexOf('/api/'));
                 var newUrlStr = window.SPARK_API_BASE + apiPath;
                 console.log('[Spark] Rewriting API Request URL:', urlStr, '->', newUrlStr);
                 // Create new request with updated URL but keep other properties
                 newUrl = new Request(newUrlStr, url);
                 isApi = true;
              } catch(e) {
                 console.error('[Spark] Failed to rewrite Request object:', e);
              }
           }
        }
        
        // Add App ID header if it's an API call
        if (isApi && window.SPARK_APP_ID) {
            if (!options) options = {};
            
            // Handle different header formats
            if (!options.headers) {
                options.headers = { 'X-Spark-App-Id': window.SPARK_APP_ID };
            } else if (options.headers instanceof Headers) {
                options.headers.set('X-Spark-App-Id', window.SPARK_APP_ID);
            } else if (Array.isArray(options.headers)) {
                options.headers.push(['X-Spark-App-Id', window.SPARK_APP_ID]);
            } else {
                // Plain object
                options.headers['X-Spark-App-Id'] = window.SPARK_APP_ID;
            }
        }

        // Auto-wrap body for /api/mailbox/submit if needed
        // This fixes the 400 Bad Request error when generated code sends raw JSON
        if (isApi && typeof newUrl === 'string' && newUrl.includes('/api/mailbox/submit')) {
             if (options && options.body && typeof options.body === 'string') {
                 try {
                     var bodyContent = JSON.parse(options.body);
                     // Only wrap if it doesn't look like it's already wrapped
                     if (!bodyContent.app_id && !bodyContent.payload) {
                         console.log('[Spark] Auto-wrapping body for Mailbox API');
                         var wrapped = {
                             app_id: window.SPARK_APP_ID,
                             payload: bodyContent,
                             metadata: {
                                 title: document.title,
                                 url: window.location.href,
                                 timestamp: Date.now()
                             }
                         };
                         options.body = JSON.stringify(wrapped);
                     }
                 } catch(e) {
                     // Ignore parse errors (maybe not JSON)
                 }
             }
        }
        
        return originalFetch.call(this, newUrl, options);
      };

      // Intercept XMLHttpRequest to rewrite /api/ URLs
      var originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        var args = Array.prototype.slice.call(arguments);
        var newUrl = url;
        var isApi = false;
        
        if (typeof url === 'string' && url.startsWith('/api/')) {
          newUrl = window.SPARK_API_BASE + url;
          console.log('[Spark] Rewriting XHR URL:', url, '->', newUrl);
          args[1] = newUrl;
          isApi = true;
        }
        
        var result = originalOpen.apply(this, args);
        
        if (isApi && window.SPARK_APP_ID) {
            try {
                this.setRequestHeader('X-Spark-App-Id', window.SPARK_APP_ID);
            } catch(e) {
                console.warn('[Spark] Failed to set header on XHR:', e);
            }
        }
        return result;
      };

      // Helper for handling form submissions
      async function handleSparkFormSubmit(form, fullUrl) {
          console.log('[Spark] Processing form submission to:', fullUrl);
          
          var formData = new FormData(form);
          
          // Convert FormData to plain object
          var dataObj = {};
          formData.forEach(function(value, key) {
            // Handle file uploads separately (don't encrypt files)
            if (value instanceof File) {
              dataObj[key] = { _file: true, name: value.name, type: value.type, size: value.size };
            } else {
              dataObj[key] = value;
            }
          });
          
          // Try to encrypt if public key is available
          var payload = JSON.stringify(dataObj);
          var isEncrypted = false;
          
          if (window.SPARK_PUBLIC_KEY) {
            try {
              console.log('[Spark] Encrypting form data with E2E encryption...');
              payload = await window.SparkCrypto.encryptData(dataObj, window.SPARK_PUBLIC_KEY);
              isEncrypted = true;
              console.log('[Spark] Data encrypted successfully');
            } catch(err) {
              console.warn('[Spark] Encryption failed, sending unencrypted:', err);
            }
          } else {
            console.log('[Spark] No public key available, sending unencrypted');
          }
          
          // Send with JSON body
          var requestBody = payload;
          
          // Special handling for Spark Mailbox API
          // The mailbox API expects a wrapped envelope: { app_id, payload, metadata }
          if (fullUrl.includes('/api/mailbox/submit')) {
            requestBody = JSON.stringify({
              app_id: window.SPARK_APP_ID,
              payload: isEncrypted ? payload : dataObj,
              metadata: {
                title: document.title,
                url: window.location.href,
                timestamp: Date.now()
              }
            });
          }

          fetch(fullUrl, {
            method: form.getAttribute('method') || 'POST',
            body: requestBody,
            headers: {
              'Content-Type': 'application/json',
              'X-Spark-App-Id': window.SPARK_APP_ID,
              'X-Spark-Encrypted': isEncrypted ? 'true' : 'false'
            }
          })
          .then(function(response) {
            if (!response.ok) {
              return response.text().then(function(text) {
                try {
                  var data = JSON.parse(text);
                  throw new Error(data.error || '提交失败 (' + response.status + ')');
                } catch(e) {
                  throw new Error('服务器错误 (' + response.status + ')');
                }
              });
            }
            return response.json();
          })
          .then(function(data) {
            alert('提交成功！');
            form.reset();
          })
          .catch(function(err) {
            console.error('Form submission error:', err);
            alert('提交出错: ' + err.message);
          });
      }

      // Intercept Form Submission with E2E Encryption
      document.addEventListener('submit', async function(e) {
        var form = e.target;
        var action = form.getAttribute('action');
        
        // Case 1: Explicit API Action (e.g. action="/api/...")
        if (action && action.startsWith('/api/')) {
          e.preventDefault();
          await handleSparkFormSubmit(form, window.SPARK_API_BASE + action);
        }
        // Case 2: Native Submission (No JS handler prevented it)
        // This catches forms where the AI forgot to write an onSubmit handler
        // We only intercept if the form has inputs to avoid false positives
        else if (!e.defaultPrevented && form.querySelectorAll('input, textarea, select').length > 0) {
           // Check if action is explicitly external (http/https) or empty/local
           if (!action || action.startsWith('/') || action.startsWith('#')) {
               e.preventDefault();
               console.log('[Spark] Auto-intercepting native form submission');
               // Use the universal mailbox endpoint
               await handleSparkFormSubmit(form, window.SPARK_API_BASE + '/api/mailbox/submit');
           }
        }
      }, true);
      
      // Only request from parent if BOTH appId and userId are not provided
      // This prevents overwriting appId when it's already set (e.g., for published apps)
      var originalAppId = window.SPARK_APP_ID;
      
      // Always request public key from parent for E2E encryption
      window.parent.postMessage({ type: 'spark-request-public-key' }, '*');
      
      // Listen for responses from parent
      window.addEventListener('message', function(event) {
        // Handle user ID response
        if (event.data && event.data.type === 'spark-user-id-response') {
          window.SPARK_USER_ID = event.data.userId;
          // Always update appId from parent to ensure we have the latest (with correct userId)
          // Only exception: published apps with numeric IDs should not be overwritten
          var newAppId = event.data.appId;
          if (newAppId) {
            // Check if current appId is a published numeric ID - don't overwrite those
            if (originalAppId && /^\\d+$/.test(originalAppId)) {
              console.log('[Spark] Keeping published appId:', originalAppId);
            } else {
              window.SPARK_APP_ID = newAppId;
              console.log('[Spark] Updated SPARK_APP_ID from parent:', newAppId);
            }
          }
          // Also update API base if provided
          if (event.data.apiBase) {
            window.SPARK_API_BASE = event.data.apiBase;
          }
        }
        
        // Handle public key response for E2E encryption
        if (event.data && event.data.type === 'spark-public-key-response') {
          if (event.data.publicKey) {
            window.SPARK_PUBLIC_KEY = event.data.publicKey;
            console.log('[Spark] Received public key for E2E encryption');
          }
        }
      });

      // Intercept Link Clicks to prevent navigation to homepage
      document.addEventListener('click', function(e) {
        var target = e.target;
        while (target && target.tagName !== 'A') {
          target = target.parentElement;
        }
        
        if (target && target.tagName === 'A') {
          var href = target.getAttribute('href');
          
          // Prevent navigation for empty links, # links, or root links
          if (!href || href === '#' || href === '/' || href === '') {
            e.preventDefault();
            console.log('[Spark] Prevented navigation to:', href);
            
            // Optional: If it's a hash link, we might want to scroll (if it's not just #)
            if (href && href.startsWith('#') && href.length > 1) {
                var id = href.substring(1);
                var el = document.getElementById(id);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
            }
            return;
          }
        }
      }, true);
      
      console.log('[Spark] Initialized with APP_ID:', window.SPARK_APP_ID, 'USER_ID:', window.SPARK_USER_ID);
    })();
  </script>`;

  // Minimal error handler to catch and display errors
  // IMPORTANT: Must include postMessage to parent for AI Fix feature to work
  // NEW: Also detect blank screen (render failure) and trigger auto-fix
  // ENHANCED: Also capture console.error to detect React errors
  const minimalErrorHandler = `<script>
    (function() {
      // Mock localStorage and sessionStorage to prevent SecurityError in sandboxed iframes
      try {
        var storage = {};
        var mockStorage = {
          getItem: function(key) { return storage[key] || null; },
          setItem: function(key, value) { storage[key] = String(value); },
          removeItem: function(key) { delete storage[key]; },
          clear: function() { storage = {}; },
          key: function(i) { return Object.keys(storage)[i] || null; },
          get length() { return Object.keys(storage).length; }
        };
        
        try {
          // Try to access to see if it throws
          var test = window.localStorage;
        } catch (e) {
          // If it throws (SecurityError), define mock
          Object.defineProperty(window, 'localStorage', { value: mockStorage });
        }
        
        try {
          var test = window.sessionStorage;
        } catch (e) {
          Object.defineProperty(window, 'sessionStorage', { value: mockStorage });
        }
      } catch (e) {
        // Ignore if we can't mock
      }

      var errorList = [];
      var hasRendered = false;
      var renderCheckTimeout = null;
      
      // 🆕 暴露错误列表给父窗口检测
      window.__sparkErrors = errorList;
      
      // Override console.error to capture React and other framework errors
      var originalConsoleError = console.error;
      console.error = function() {
        // Convert arguments to string first for filtering
        var msg = Array.prototype.slice.call(arguments).map(function(arg) {
          if (arg instanceof Error) {
            return arg.message + (arg.stack ? '\\n' + arg.stack : '');
          }
          return String(arg);
        }).join(' ');
        
        // Skip known non-critical messages (suppress in console too)
        if (msg.includes('Download the React DevTools') || 
            msg.includes('Consider adding an error boundary') ||
            msg.includes('Warning:') ||
            msg.includes('validateDOMNesting') ||
            msg.includes('SecurityError') ||
            msg.includes('The operation is insecure') ||
            msg.includes('cross-origin') ||
            msg.includes('Cross-Origin') ||
            msg.includes('CORS') ||
            msg.includes('Blocked a frame') ||
            msg.includes('sandbox') ||
            msg.includes('Source map') ||
            msg.includes('源码映射')) {
          return; // Don't even log these
        }
        
        // Call original for other errors
        originalConsoleError.apply(console, arguments);
        
        // Check if it looks like a real error
        var isError = msg.includes('Error') || 
                      msg.includes('error') || 
                      msg.includes('Uncaught') ||
                      msg.includes('undefined') ||
                      msg.includes('null') ||
                      msg.includes('is not defined') ||
                      msg.includes('is not a function') ||
                      msg.includes('Cannot read') ||
                      msg.includes('Failed to');
        
        if (isError) {
          var errorDetails = {
            message: msg.substring(0, 500),
            line: null,
            column: null,
            stack: null,
            source: 'console.error'
          };
          
          errorList.push(errorDetails);
          
          // Only notify parent window - error display is handled by parent UI
          try {
            window.parent.postMessage({ type: 'spark-app-error', error: errorDetails }, '*');
          } catch(e) {}
        }
      };
      
      // Global error handler - notify parent for AI Fix
      window.onerror = function(msg, url, line, col, error) {
        var msgStr = String(msg);
        // Filter out non-critical errors
        if (msg === 'Script error.' || msg === 'Script error') return true;
        if (msgStr.includes('SecurityError') || 
            msgStr.includes('The operation is insecure') ||
            msgStr.includes('cross-origin') ||
            msgStr.includes('Cross-Origin') ||
            msgStr.includes('CORS') ||
            msgStr.includes('Blocked a frame') ||
            msgStr.includes('sandbox')) {
          return true; // Suppress these errors
        }
        console.log('App Error captured:', msg, 'at line', line);
        
        var errorDetails = {
          message: msgStr,
          line: line,
          column: col,
          stack: error ? error.stack : null
        };
        
        errorList.push(errorDetails);
        
        // Only notify parent window - error display is handled by parent UI
        try {
          window.parent.postMessage({ type: 'spark-app-error', error: errorDetails }, '*');
        } catch(e) {}
        
        return false;
      };
      
      // Handle unhandled promise rejections
      window.onunhandledrejection = function(event) {
        var reason = String(event.reason);
        // Suppress known non-critical errors
        if (reason.includes('SecurityError') || reason.includes('NotAllowedError')) {
          event.preventDefault();
          return;
        }
        
        var errorDetails = {
          message: 'Unhandled Promise Rejection: ' + reason,
          line: null,
          column: null,
          stack: event.reason && event.reason.stack ? event.reason.stack : null
        };
        
        errorList.push(errorDetails);
        
        // Only notify parent window - error display is handled by parent UI
        try {
          window.parent.postMessage({ type: 'spark-app-error', error: errorDetails }, '*');
        } catch(e) {}
      };
      
      // Blank screen detection - check if React rendered anything
      function checkForBlankScreen() {
        if (hasRendered) return;
        
        // Check if there's meaningful content in root or body
        var root = document.getElementById('root');
        var hasContent = false;
        
        // 🆕 更严格的内容检测
        if (root && root.children.length > 0 && root.innerHTML.trim() !== '') {
          // 检查是否有可见的文本内容
          var textContent = root.innerText || '';
          if (textContent.trim().length > 5) {
            hasContent = true;
          }
        }
        
        // 检查 body 中是否有除了脚本以外的内容
        if (!hasContent && document.body) {
          var bodyChildren = document.body.children;
          for (var i = 0; i < bodyChildren.length; i++) {
            var child = bodyChildren[i];
            if (child.tagName !== 'SCRIPT' && child.id !== 'root') {
              // 有其他非脚本元素
              var childText = child.innerText || '';
              if (childText.trim().length > 5) {
                hasContent = true;
                break;
              }
            }
          }
        }
        
        if (!hasContent) {
          console.warn('Blank screen detected - app may have failed to render');
          
          // 🆕 收集所有已捕获的错误信息
          var errorMessages = errorList.map(function(e) { return e.message; }).join('\\n');
          var detailedMessage = errorMessages 
            ? 'App failed to render. Errors:\\n' + errorMessages.substring(0, 500)
            : 'App failed to render - blank screen detected (no console errors captured, may be a syntax error).';
          
          var blankError = {
            message: detailedMessage,
            type: 'blank-screen',
            line: null,
            column: null,
            stack: null,
            collectedErrors: errorList.slice(0, 5) // 🆕 包含收集到的错误
          };
          try {
            window.parent.postMessage({ type: 'spark-app-error', error: blankError, autoFix: true }, '*');
          } catch(e) {}
        } else {
          hasRendered = true;
        }
      }
      
      // Check for blank screen after a delay (give React time to render)
      // 🆕 增加延迟时间到 3 秒
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          renderCheckTimeout = setTimeout(checkForBlankScreen, 3000);
        });
      } else {
        renderCheckTimeout = setTimeout(checkForBlankScreen, 3000);
      }
      
      // 🆕 不再因为 createElement 就取消白屏检测
      // 因为即使创建了元素，最终也可能渲染失败
      // 只有在确实有可见内容时才标记为已渲染
    })();
  </script>`;

  // Highlight style for point-and-click editing (inject in head to survive body replacement)
  const highlightStyle = `<style id="spark-highlight-style">
    .__spark_highlight__ {
      outline: 2px dashed #3b82f6 !important;
      background-color: rgba(59, 130, 246, 0.1) !important;
      cursor: crosshair !important;
      transition: all 0.1s ease;
      position: relative;
      z-index: 9999;
    }
  </style>`;

  // Probe script for point-and-click editing
  const probeScript = `
    <script data-spark-injected="true">
      (function() {
        var isEditMode = false;
        var hoveredElement = null;
        var originalRAF = window.requestAnimationFrame;
        var listenersAttached = false;

        function getElementPath(element) {
            var path = [];
            while (element && element.nodeType === Node.ELEMENT_NODE) {
                var selector = element.nodeName.toLowerCase();
                if (element.id) {
                    selector += '#' + element.id;
                    path.unshift(selector);
                    break;
                } else {
                    var sib = element, nth = 1;
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
          e.stopImmediatePropagation();
          
          var el = e.target;
          var parent = el.parentElement;
          var info = {
            tagName: el.tagName.toLowerCase(),
            className: el.className.replace ? el.className.replace('__spark_highlight__', '').trim() : '',
            innerText: el.innerText ? el.innerText.substring(0, 50) : '',
            path: getElementPath(el),
            parentTagName: parent ? parent.tagName.toLowerCase() : null,
            parentClassName: parent && parent.className && parent.className.replace ? parent.className.replace('__spark_highlight__', '').trim() : null
          };
          
          window.parent.postMessage({ type: 'spark-element-selected', payload: info }, '*');
          return false;
        }

        // Block all interactive events in edit mode
        function blockEvent(e) {
          if (!isEditMode) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }
        
        function attachListeners() {
          if (listenersAttached) return;
          document.addEventListener('mouseover', handleMouseOver, true);
          document.addEventListener('mouseout', handleMouseOut, true);
          document.addEventListener('click', handleClick, true);
          document.addEventListener('mousedown', blockEvent, true);
          document.addEventListener('mouseup', blockEvent, true);
          document.addEventListener('touchstart', blockEvent, true);
          document.addEventListener('touchend', blockEvent, true);
          document.addEventListener('keydown', blockEvent, true);
          document.addEventListener('keyup', blockEvent, true);
          document.addEventListener('submit', blockEvent, true);
          listenersAttached = true;
        }
        
        function detachListeners() {
          document.removeEventListener('mouseover', handleMouseOver, true);
          document.removeEventListener('mouseout', handleMouseOut, true);
          document.removeEventListener('click', handleClick, true);
          document.removeEventListener('mousedown', blockEvent, true);
          document.removeEventListener('mouseup', blockEvent, true);
          document.removeEventListener('touchstart', blockEvent, true);
          document.removeEventListener('touchend', blockEvent, true);
          document.removeEventListener('keydown', blockEvent, true);
          document.removeEventListener('keyup', blockEvent, true);
          document.removeEventListener('submit', blockEvent, true);
          listenersAttached = false;
        }

        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'toggle-edit-mode') {
            var shouldEnable = event.data.enabled;
            
            if (shouldEnable) {
              isEditMode = true;
              attachListeners();
              
              // Ensure highlight style exists (may have been lost during content update)
              if (!document.getElementById('spark-highlight-style')) {
                var highlightStyle = document.createElement('style');
                highlightStyle.id = 'spark-highlight-style';
                highlightStyle.innerHTML = '.__spark_highlight__ { outline: 2px dashed #3b82f6 !important; background-color: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; transition: all 0.1s ease; position: relative; z-index: 9999; }';
                document.head.appendChild(highlightStyle);
              }
              
              // Pause animations for easier selection
              if (!document.getElementById('spark-pause-animations')) {
                var style = document.createElement('style');
                style.id = 'spark-pause-animations';
                // Removed pointer-events: auto !important to prevent overlays from blocking clicks
                style.innerHTML = '* { animation-play-state: paused !important; transition: none !important; cursor: crosshair !important; }';
                document.head.appendChild(style);
              }

              // Freeze JS animations (RAF)
              window.requestAnimationFrame = function() { return -1; };
            } else {
              isEditMode = false;
              detachListeners();
              
              if (hoveredElement) {
                hoveredElement.classList.remove('__spark_highlight__');
                hoveredElement = null;
              }
              
              // Resume animations
              var style = document.getElementById('spark-pause-animations');
              if (style) style.remove();

              // Restore RAF
              window.requestAnimationFrame = originalRAF;
            }
          }
          
          // Handle live content updates (for quick edits)
          if (event.data && event.data.type === 'spark-update-content') {
            // For React apps, we need to re-render the entire app
            var parser = new DOMParser();
            var newDoc = parser.parseFromString(event.data.html, 'text/html');
            
            // Save edit mode state
            // If shouldRestoreEditMode is explicitly false, we don't restore
            var shouldRestore = event.data.shouldRestoreEditMode !== false;
            var wasEditMode = isEditMode && shouldRestore;
            
            // Clear any highlight
            if (hoveredElement) {
              hoveredElement.classList.remove('__spark_highlight__');
              hoveredElement = null;
            }
            
            // DO NOT detach listeners - keep them active on document
            // This ensures we don't lose event capture during DOM replacement
            // if (listenersAttached) {
            //   detachListeners();
            // }
            
            // Strategy: Replace document content and re-execute scripts
            var newBody = newDoc.body;
            
            if (newBody) {
              // Find and clear the React root
              var root = document.getElementById('root');
              if (root) {
                root.innerHTML = '';
              }
              
              // Remove old user scripts (type="text/babel")
              var oldScripts = document.querySelectorAll('script[type="text/babel"]');
              for (var i = 0; i < oldScripts.length; i++) {
                oldScripts[i].remove();
              }
              
              // Replace entire body innerHTML
              document.body.innerHTML = newBody.innerHTML;
              
              // Re-inject highlight style (it was removed with body innerHTML)
              if (!document.getElementById('spark-highlight-style')) {
                var highlightStyle = document.createElement('style');
                highlightStyle.id = 'spark-highlight-style';
                highlightStyle.innerHTML = '.__spark_highlight__ { outline: 2px dashed #3b82f6 !important; background-color: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; transition: all 0.1s ease; position: relative; z-index: 9999; }';
                document.head.appendChild(highlightStyle);
              }
              
              // Find and re-execute the main babel script
              var babelScripts = newDoc.querySelectorAll('script[type="text/babel"]');
              for (var j = 0; j < babelScripts.length; j++) {
                var script = babelScripts[j];
                var newScript = document.createElement('script');
                newScript.type = 'text/babel';
                newScript.textContent = script.textContent;
                document.body.appendChild(newScript);
              }
              
              // Re-trigger Babel transformation
              if (window.Babel && window.Babel.transformScriptTags) {
                try {
                  window.Babel.transformScriptTags();
                } catch (e) {
                  console.warn('Babel re-transform failed:', e);
                }
              }
              
              // Restore edit mode state after React re-renders
              // Use setTimeout to wait for React to finish rendering
              if (wasEditMode) {
                var restoreEditMode = function() {
                  isEditMode = true;
                  
                  // Ensure highlight style exists (in case it was lost)
                  if (!document.getElementById('spark-highlight-style')) {
                    var highlightStyle = document.createElement('style');
                    highlightStyle.id = 'spark-highlight-style';
                    highlightStyle.innerHTML = '.__spark_highlight__ { outline: 2px dashed #3b82f6 !important; background-color: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; transition: all 0.1s ease; position: relative; z-index: 9999; }';
                    document.head.appendChild(highlightStyle);
                  }
                  
                  // Re-inject animation pause style
                  if (!document.getElementById('spark-pause-animations')) {
                    var pauseStyle = document.createElement('style');
                    pauseStyle.id = 'spark-pause-animations';
                    // Removed pointer-events: auto !important to prevent overlays from blocking clicks
                    pauseStyle.innerHTML = '* { animation-play-state: paused !important; transition: none !important; cursor: crosshair !important; }';
                    document.head.appendChild(pauseStyle);
                  }
                  
                  // Freeze RAF again
                  window.requestAnimationFrame = function() { return -1; };
                  
                  // Force refresh listeners to ensure they bind to current document state
                  detachListeners();
                  attachListeners();
                };
                
                // Restore immediately and after delays to catch React re-renders
                restoreEditMode();
                setTimeout(restoreEditMode, 50);
                setTimeout(restoreEditMode, 150);
                setTimeout(restoreEditMode, 500);
              }
            }
            
            window.parent.postMessage({ type: 'spark-content-updated' }, '*');
          }
        });
      })();
    </script>
  `;

  // Inject error handler AND highlight style AND probe script AND SPARK_APP_ID into head
  // This ensures they persist even if body.innerHTML is replaced
  let result = content;
  const scriptsToInject = sparkAppIdScript + minimalErrorHandler + highlightStyle + probeScript;
  
  if (result.includes('</head>')) {
    result = result.replace('</head>', `${scriptsToInject}</head>`);
  } else if (result.includes('<body>')) {
    // Fallback if no head
    result = result.replace('<body>', `${scriptsToInject}<body>`);
  } else {
    result = scriptsToInject + result;
  }

  return result;
};
