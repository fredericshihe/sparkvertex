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

// Check if code contains Spark platform backend integration
export function detectSparkBackendCode(htmlContent: string): boolean {
  if (!htmlContent) return false;
  
  const sparkBackendPatterns = [
    // 表单提交 API
    /\/api\/mailbox\/submit/i,
    /\/api\/mailbox\/upload/i,
    // Spark App ID
    /window\.SPARK_APP_ID/i,
    /SPARK_APP_ID/i,
    // 加密相关
    /SparkCrypto/i,
    // CMS 相关
    /window\.SparkCMS/i,
    /data-cms=/i,
    /data-cms-src=/i,
    // 外部 API 调用
    /sparkvertex\.vercel\.app\/api/i,
    // 表单提交处理（更宽泛的检测）
    /handleSubmit[\s\S]*fetch\s*\(/i,
    /isSubmitting/i,
    // SparkBackend 或表单收集相关
    /SparkBackend/i,
    /formData[\s\S]*submit/i,
  ];
  return sparkBackendPatterns.some(pattern => pattern.test(htmlContent));
}
