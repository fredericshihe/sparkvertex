export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try Modern API (navigator.clipboard)
  // This requires a secure context (HTTPS or localhost)
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, trying fallback', err);
    }
  }

  // 2. Fallback: document.execCommand('copy')
  // This works in non-secure contexts (like HTTP LAN)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure it's not visible but part of the DOM
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return successful;
  } catch (err) {
    console.error('Fallback copy failed', err);
    return false;
  }
}

export function getFingerprint(): string {
  if (typeof window === 'undefined') return 'server-side';
  
  const STORAGE_KEY = 'spark_client_fp';
  let fp = localStorage.getItem(STORAGE_KEY);
  
  if (!fp) {
    // Generate a simple UUID-like string
    fp = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem(STORAGE_KEY, fp);
  }
  
  return fp;
}

// Check if code contains Spark platform SPECIFIC backend integration (for Form Inbox)
export function detectSparkPlatformFeatures(htmlContent: string): boolean {
  if (!htmlContent) return false;
  
  const platformPatterns = [
    /\/api\/mailbox\/submit/i,
    /\/api\/mailbox\/upload/i,
    /window\.SPARK_APP_ID/i,
    /const\s+SPARK_APP_ID\s*=/i,
    /let\s+SPARK_APP_ID\s*=/i,
    /SparkCrypto/i,
    /window\.SparkCMS/i,
    /data-cms-editable/i,
    /data-cms-src/i,
    /sparkvertex\.vercel\.app\/api/i,
    /SparkBackend/i,
    /new\s+SparkBackend/i,
  ];
  
  return platformPatterns.some(pattern => pattern.test(htmlContent));
}

// Check if code contains ANY backend integration (Platform OR General)
export function detectSparkBackendCode(htmlContent: string): boolean {
  if (!htmlContent) return false;
  
  // 🚫 If the code is explicitly mocked (Public Version), treat it as NO backend
  // This ensures the "Inbox" button is hidden in CreationPreview
  if (htmlContent.includes('<!-- PUBLIC VERSION: Backend requests are mocked') || 
      htmlContent.includes('[Public Version] Backend request mocked') ||
      htmlContent.includes("window.SPARK_APP_ID = 'public_demo'") ||
      htmlContent.includes('window.SPARK_APP_ID = "public_demo"')) {
    return false;
  }

  // Check platform features first
  if (detectSparkPlatformFeatures(htmlContent)) return true;
  
  const generalBackendPatterns = [
    // ========== 通用后端检测（更精确的模式） ==========
    
    // 数据提交类 API 调用 (POST/PUT/DELETE)
    /fetch\s*\([^)]*,\s*\{[^}]*method\s*:\s*['"`](POST|PUT|DELETE|PATCH)['"`]/i,
    /axios\s*\.\s*(post|put|delete|patch)\s*\(/i,
    
    // WebSocket 连接
    /new\s+WebSocket\s*\(/i,
    /socket\.io/i,
    /io\s*\(\s*['"`]/i,
    
    // 数据库相关
    /firebase\.initializeApp/i,
    /initializeApp\s*\(\s*\{[^}]*apiKey/i,
    /createClient\s*\([^)]*supabase/i,
    /MongoClient/i,
    /mongoose\.connect/i,
    
    // 认证/密钥相关
    /['"`]Authorization['"`]\s*:\s*['"`]Bearer/i,
    /['"`]x-api-key['"`]\s*:/i,
    /API_KEY\s*[:=]\s*['"`][^'"`]{10,}/i,
    /SECRET_KEY\s*[:=]\s*['"`][^'"`]{10,}/i,
    
    // 服务端环境变量
    /process\.env\.\w+/i,
    
    // 后端框架特征
    /require\s*\(\s*['"`](express|koa|fastify|hapi)['"`]\s*\)/i,
  ];
  
  return generalBackendPatterns.some(pattern => pattern.test(htmlContent));
}

// Remove Spark backend code from HTML content for public sharing
// 🔧 v2.0 - 完全重写，采用"禁用"策略而非"删除"策略，避免破坏代码结构
export function removeSparkBackendCode(htmlContent: string): string {
  if (!htmlContent) return htmlContent;
  
  let result = htmlContent;
  
  // ========== 策略说明 ==========
  // 旧版本尝试用正则删除整个函数/类，这会导致嵌套大括号匹配错误，破坏代码结构
  // 新版本采用"禁用"策略：
  // 1. 将 API URL 替换为 mock URL，让 fetch 调用仍然语法正确但返回空数据
  // 2. 将敏感变量值替换为占位符，保持声明语法完整
  // 3. 注入一个全局拦截器来 mock 所有后端请求
  
  // ========== 1. 注入全局后端 Mock 拦截器 ==========
  // 这是最安全的方法：不修改原始代码结构，只是拦截运行时的网络请求
  const mockInterceptorScript = `<script>
(function() {
  // 🔒 Public Version: Backend requests are mocked for security
  var originalFetch = window.fetch;
  window.fetch = function(url, options) {
    var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    // Mock all API/backend requests
    if (urlStr.includes('/api/') || 
        urlStr.includes('supabase') || 
        urlStr.includes('firebase') ||
        (options && options.method && options.method !== 'GET')) {
      console.log('[Public Version] Backend request mocked:', urlStr);
      
      // 🚀 Notify parent window about the mocked action
      if (window.parent) {
        window.parent.postMessage({ type: 'SPARK_BACKEND_MOCKED_ACTION' }, '*');
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: function() { return Promise.resolve({ success: true, data: [], message: 'Public version - backend disabled' }); },
        text: function() { return Promise.resolve(''); },
        blob: function() { return Promise.resolve(new Blob()); }
      });
    }
    return originalFetch.apply(this, arguments);
  };
  
  // Mock XMLHttpRequest for legacy code
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._sparkUrl = url;
    this._sparkMethod = method;
    return originalXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var urlStr = this._sparkUrl || '';
    if (urlStr.includes('/api/') || this._sparkMethod !== 'GET') {
      console.log('[Public Version] XHR request mocked:', urlStr);
      var self = this;
      setTimeout(function() {
        Object.defineProperty(self, 'readyState', { value: 4, writable: false });
        Object.defineProperty(self, 'status', { value: 200, writable: false });
        Object.defineProperty(self, 'responseText', { value: '{"success":true,"data":[]}', writable: false });
        Object.defineProperty(self, 'response', { value: '{"success":true,"data":[]}', writable: false });
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
      }, 10);
      return;
    }
    return originalXHRSend.apply(this, arguments);
  };
  
  // Set SPARK variables to safe mock values (preserves code that references them)
  window.SPARK_APP_ID = 'public_demo';
  window.SPARK_USER_ID = 'public_user';
  window.SPARK_API_BASE = '';
  
  // Mock SparkCMS if it exists
  window.SparkCMS = {
    _cache: {},
    init: function() { return Promise.resolve(); },
    getContent: function(slug, defaultValue) { return defaultValue || ''; },
    fetchContent: function(slug, defaultValue) { return Promise.resolve(defaultValue || ''); },
    getHtml: function(slug, defaultValue) { return Promise.resolve(defaultValue || ''); },
    refreshAll: function() {},
    updateContent: function() {}
  };
})();
</script>`;

  // 在 <head> 标签后或 <body> 标签前注入拦截器（确保在其他脚本之前运行）
  if (result.includes('<head>')) {
    result = result.replace('<head>', '<head>\n' + mockInterceptorScript);
  } else if (result.includes('<body>')) {
    result = result.replace('<body>', mockInterceptorScript + '\n<body>');
  } else if (result.includes('<html>') || result.includes('<html ')) {
    // 如果没有 head 或 body，在 html 标签后注入
    result = result.replace(/<html(\s[^>]*)?>/, '<html$1>\n' + mockInterceptorScript);
  } else {
    // 最后的 fallback：在文件开头注入
    result = mockInterceptorScript + '\n' + result;
  }
  
  // ========== 2. 安全的字符串替换（只替换简单模式，不破坏代码结构） ==========
  
  // 替换 API endpoint URLs 为空字符串（保持 fetch 调用语法正确）
  // 注意：这些替换不会破坏代码结构，因为只是替换字符串值
  result = result.replace(/(['"`])\/api\/mailbox\/submit\1/g, '$1$1'); // '' 空字符串
  result = result.replace(/(['"`])\/api\/mailbox\/upload\1/g, '$1$1');
  result = result.replace(/(['"`])\/api\/cms\/[^'"`]*\1/g, '$1$1');
  
  // 替换敏感的 SPARK 变量声明值（保持声明语法完整）
  // 不删除整行，只替换值
  result = result.replace(
    /(window\.SPARK_APP_ID\s*=\s*)(['"`])[^'"`]*\2/g, 
    '$1$2public_demo$2'
  );
  result = result.replace(
    /(window\.SPARK_USER_ID\s*=\s*)(['"`])[^'"`]*\2/g, 
    '$1$2public_user$2'
  );
  result = result.replace(
    /(window\.SPARK_API_BASE\s*=\s*)(['"`])[^'"`]*\2/g, 
    '$1$2$2'
  );
  
  // ========== 3. 移除 CMS data 属性（安全操作，不影响代码逻辑） ==========
  result = result.replace(/\s+data-cms=['"][^'"]*['"]/g, '');
  result = result.replace(/\s+data-cms-src=['"][^'"]*['"]/g, '');
  result = result.replace(/\s+data-cms-href=['"][^'"]*['"]/g, '');
  
  // ========== 4. 替换敏感密钥值（只替换值，不删除声明） ==========
  result = result.replace(
    /((?:const|let|var)\s+(?:API_KEY|API_SECRET|SECRET_KEY|AUTH_TOKEN|ACCESS_TOKEN|PRIVATE_KEY)\s*=\s*)(['"`])[^'"`]+\2/gi,
    '$1$2REMOVED_FOR_PUBLIC$2'
  );
  
  // 替换 Authorization header 的值
  result = result.replace(
    /(['"`]Authorization['"`]\s*:\s*)(['"`])Bearer\s+[^'"`]+\2/gi,
    '$1$2Bearer REMOVED$2'
  );
  
  // 替换 x-api-key header 的值
  result = result.replace(
    /(['"`]x-api-key['"`]\s*:\s*)(['"`])[^'"`]+\2/gi,
    '$1$2REMOVED$2'
  );
  
  // ========== 5. 添加公开版本标记 ==========
  if (!result.includes('<!-- PUBLIC VERSION -->')) {
    result = result.replace(
      /<html/i,
      '<!-- PUBLIC VERSION: Backend requests are mocked for public sharing -->\n<html'
    );
  }
  
  return result;
}

// Remove the mock interceptor script and other public artifacts
// Used when loading a public work for editing (to restore backend functionality)
export function removeMockCode(htmlContent: string): string {
  if (!htmlContent) return htmlContent;
  
  let result = htmlContent;
  
  // Remove the mock interceptor script
  // Matches the script block injected by removeSparkBackendCode
  result = result.replace(/<script>\s*\(function\(\)\s*\{\s*\/\/ 🔒 Public Version: Backend requests are mocked for security[\s\S]*?\}\)\(\);\s*<\/script>/g, '');
  
  // Remove the public version comment
  result = result.replace(/<!-- PUBLIC VERSION: Backend requests are mocked for public sharing -->\n?/g, '');
  
  return result;
}

