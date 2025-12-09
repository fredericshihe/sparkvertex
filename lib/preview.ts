/**
 * Centralized logic for injecting iframe safety scripts and point-and-click edit support.
 * Minimal modifications for maximum fidelity to double-click open behavior.
 * 
 * @param content - The HTML content to process
 * @param options - Configuration options (kept for backward compatibility, currently ignored)
 */
export const getPreviewContent = (content: string | null, options?: { raw?: boolean }): string => {
  if (!content) return '';

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
        // Call original
        originalConsoleError.apply(console, arguments);
        
        // Convert arguments to string
        var msg = Array.prototype.slice.call(arguments).map(function(arg) {
          if (arg instanceof Error) {
            return arg.message + (arg.stack ? '\\n' + arg.stack : '');
          }
          return String(arg);
        }).join(' ');
        
        // Skip known non-critical messages
        if (msg.includes('Download the React DevTools') || 
            msg.includes('Consider adding an error boundary') ||
            msg.includes('Warning:') ||
            msg.includes('validateDOMNesting')) {
          return;
        }
        
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
        if (msg === 'Script error.' || msg === 'Script error') return true;
        console.log('App Error captured:', msg, 'at line', line);
        
        var errorDetails = {
          message: String(msg),
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
          var errorMessages = errorList.map(function(e) { return e.message; }).join('\n');
          var detailedMessage = errorMessages 
            ? 'App failed to render. Errors:\n' + errorMessages.substring(0, 500)
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

  // Inject error handler AND highlight style AND probe script into head
  // This ensures they persist even if body.innerHTML is replaced
  let result = content;
  const scriptsToInject = minimalErrorHandler + highlightStyle + probeScript;
  
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
