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
export function removeSparkBackendCode(htmlContent: string): string {
  if (!htmlContent) return htmlContent;
  
  let result = htmlContent;
  
  // ========== 1. SPARK 平台后端代码移除 ==========
  
  // Remove SPARK_APP_ID declaration and related code
  result = result.replace(/window\.SPARK_APP_ID\s*=\s*['"][^'"]*['"];?\s*/g, '');
  result = result.replace(/const\s+SPARK_APP_ID\s*=\s*['"][^'"]*['"];?\s*/g, '');
  result = result.replace(/let\s+SPARK_APP_ID\s*=\s*['"][^'"]*['"];?\s*/g, '');
  
  // Remove fetch calls to /api/mailbox endpoints
  result = result.replace(
    /fetch\s*\(\s*['"`][^'"`]*\/api\/mailbox\/[^'"`]*['"`][^)]*\)[^;]*\.then[^;]*\.catch[^;]*;?/g,
    '/* Backend removed for public sharing */ Promise.resolve({ success: true })'
  );
  result = result.replace(
    /await\s+fetch\s*\(\s*['"`][^'"`]*\/api\/mailbox\/[^'"`]*['"`][^)]*\)/g,
    '/* Backend removed */ { ok: true, json: () => Promise.resolve({ success: true }) }'
  );
  
  // Remove SparkCrypto related code
  result = result.replace(/class\s+SparkCrypto\s*\{[\s\S]*?\n\s*\}/g, '/* SparkCrypto removed for public sharing */');
  result = result.replace(/const\s+SparkCrypto\s*=[\s\S]*?;/g, '');
  result = result.replace(/new\s+SparkCrypto\s*\([^)]*\)/g, 'null');
  
  // Remove SparkBackend related code
  result = result.replace(/class\s+SparkBackend\s*\{[\s\S]*?\n\s*\}/g, '/* SparkBackend removed for public sharing */');
  result = result.replace(/const\s+SparkBackend\s*=[\s\S]*?;/g, '');
  
  // Remove CMS data attributes but keep the element
  result = result.replace(/\s+data-cms=['"][^'"]*['"]/g, '');
  result = result.replace(/\s+data-cms-src=['"][^'"]*['"]/g, '');
  
  // ========== 2. 通用 API 请求移除 ==========
  
  // Remove fetch calls to external APIs (non-CDN, non-asset URLs)
  // Keep: CDN resources, images, fonts, stylesheets, scripts from known safe domains
  const safeDomainsPattern = /(cdn\.|unpkg\.com|cdnjs\.cloudflare\.com|jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|\.css|\.js|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.woff|\.woff2|\.ttf|\.ico)/i;
  
  // Remove POST/PUT/DELETE fetch requests (data submission)
  result = result.replace(
    /fetch\s*\([^)]+\s*,\s*\{[^}]*method\s*:\s*['"`](POST|PUT|DELETE|PATCH)['"`][^}]*\}[^)]*\)/gi,
    '/* API call removed for public sharing */ Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })'
  );
  
  // Remove axios POST/PUT/DELETE calls
  result = result.replace(
    /axios\s*\.\s*(post|put|delete|patch)\s*\([^)]+\)/gi,
    '/* API call removed */ Promise.resolve({ data: { success: true } })'
  );
  
  // ========== 3. WebSocket 和实时连接移除 ==========
  
  // Remove WebSocket connections
  result = result.replace(
    /new\s+WebSocket\s*\(\s*['"`][^'"`]+['"`]\s*\)/g,
    '/* WebSocket removed */ { send: () => {}, close: () => {}, onmessage: null, onopen: null, onclose: null, onerror: null }'
  );
  
  // Remove Socket.io connections
  result = result.replace(
    /io\s*\(\s*['"`][^'"`]*['"`][^)]*\)/g,
    '/* Socket.io removed */ { on: () => {}, emit: () => {}, connect: () => {}, disconnect: () => {} }'
  );
  
  // ========== 4. 数据库连接移除 ==========
  
  // Remove Firebase initialization
  result = result.replace(
    /firebase\.initializeApp\s*\([^)]*\)/g,
    '/* Firebase removed for public sharing */'
  );
  result = result.replace(
    /initializeApp\s*\(\s*\{[^}]*apiKey[^}]*\}\s*\)/g,
    '/* Firebase removed */'
  );
  
  // Remove Supabase client creation (external, not our platform)
  result = result.replace(
    /createClient\s*\(\s*['"`][^'"`]+['"`]\s*,\s*['"`][^'"`]+['"`]\s*\)/g,
    '/* Supabase client removed */ { from: () => ({ select: () => Promise.resolve({ data: [] }) }) }'
  );
  
  // Remove MongoDB connections
  result = result.replace(
    /MongoClient\s*\.\s*connect\s*\([^)]+\)/g,
    '/* MongoDB removed */ Promise.resolve({ db: () => ({ collection: () => ({ find: () => ({ toArray: () => Promise.resolve([]) }) }) }) })'
  );
  
  // ========== 5. 认证和密钥移除 ==========
  
  // Remove API keys and secrets (common patterns)
  result = result.replace(
    /(const|let|var)\s+(API_KEY|API_SECRET|SECRET_KEY|AUTH_TOKEN|ACCESS_TOKEN|PRIVATE_KEY)\s*=\s*['"`][^'"`]+['"`]/gi,
    '$1 $2 = "REMOVED_FOR_PUBLIC"'
  );
  
  // Remove Bearer token headers
  result = result.replace(
    /['"`]Authorization['"`]\s*:\s*['"`]Bearer\s+[^'"`]+['"`]/gi,
    '"Authorization": "Bearer REMOVED"'
  );
  
  // Remove x-api-key headers
  result = result.replace(
    /['"`]x-api-key['"`]\s*:\s*['"`][^'"`]+['"`]/gi,
    '"x-api-key": "REMOVED"'
  );
  
  // ========== 6. 服务端代码模式移除 ==========
  
  // Remove server-side indicators
  result = result.replace(
    /process\.env\.\w+/g,
    '"REMOVED"'
  );
  
  // Remove Node.js require for backend modules
  result = result.replace(
    /require\s*\(\s*['"`](express|koa|fastify|hapi|http|https|net|fs|path|crypto|child_process)['"`]\s*\)/g,
    '/* Server module removed */ {}'
  );
  
  // ========== 7. 表单提交函数替换 ==========
  
  // Replace backend submit functions with local-only version
  result = result.replace(
    /const\s+submitToBackend\s*=\s*async[^}]*\}\s*;/g,
    'const submitToBackend = async () => { console.log("Public version - data saved locally only"); return { success: true }; };'
  );
  
  // Replace generic submit/save to API functions
  result = result.replace(
    /(const|let|var)\s+(submitToAPI|saveToServer|sendToBackend|postData|uploadData)\s*=\s*async\s*\([^)]*\)\s*=>\s*\{[^}]*fetch[^}]*\}/gi,
    '$1 $2 = async (data) => { console.log("Public version - backend disabled", data); return { success: true }; }'
  );
  
  // ========== 8. 添加公开版本标记 ==========
  
  if (!result.includes('<!-- PUBLIC VERSION -->')) {
    result = result.replace(
      /<html/i,
      '<!-- PUBLIC VERSION: Backend integration removed for public sharing -->\n<html'
    );
  }
  
  return result;
}

