/**
 * JSX Pre-compiler for Spark Vertex
 * 
 * 在发布时将 JSX 代码预编译为普通 JavaScript，
 * 从而消除浏览器端加载 Babel standalone (1.4MB) 的需要。
 * 
 * 使用 Sucrase 代替 Babel（更轻量、更快、Webpack 兼容性更好）
 * 
 * 性能提升预估：
 * - 移除 ~1.4MB 的 Babel 下载
 * - 移除 2-3秒 的 JSX 解析时间
 * - TTI 改善 ~20-30秒
 */

import { transform } from 'sucrase';

/**
 * 编译结果
 */
export interface CompileResult {
  success: boolean;
  compiledContent?: string;
  error?: string;
  stats?: {
    originalSize: number;
    compiledSize: number;
    compressionRatio: number;
    jsxScriptsFound: number;
    jsxScriptsCompiled: number;
  };
}

/**
 * 检测 HTML 内容是否包含需要编译的 JSX
 */
export function hasJSX(htmlContent: string): boolean {
  return /<script[^>]*type\s*=\s*["']text\/babel["'][^>]*>/i.test(htmlContent);
}

/**
 * 使用 Sucrase 编译单个 JSX 代码块
 */
function compileJSXBlock(jsxCode: string): { code: string; error?: string } {
  try {
    const result = transform(jsxCode, {
      transforms: ['jsx'],
      jsxRuntime: 'classic',
      jsxPragma: 'React.createElement',
      jsxFragmentPragma: 'React.Fragment',
      production: true,
    });
    
    return { code: result.code };
  } catch (err: any) {
    console.error('[JSX Compile Error]', err.message);
    return { 
      code: jsxCode, 
      error: err.message 
    };
  }
}

/**
 * 预编译 HTML 内容中的所有 JSX 脚本
 * 
 * 将 <script type="text/babel">...</script> 
 * 转换为 <script>...</script>（普通 JS）
 * 
 * 同时移除 Babel standalone 的引用
 */
export function compileHTMLContent(htmlContent: string): CompileResult {
  const originalSize = htmlContent.length;
  let compiledContent = htmlContent;
  let jsxScriptsFound = 0;
  let jsxScriptsCompiled = 0;
  const errors: string[] = [];

  // 匹配 <script type="text/babel">...</script> 块
  const jsxScriptRegex = /<script([^>]*type\s*=\s*["']text\/babel["'][^>]*)>([\s\S]*?)<\/script>/gi;
  
  compiledContent = compiledContent.replace(jsxScriptRegex, (match, attrs, code) => {
    jsxScriptsFound++;
    
    // 移除 type="text/babel" 属性
    const newAttrs = attrs.replace(/type\s*=\s*["']text\/babel["']/gi, '').trim();
    
    // 编译 JSX
    const { code: compiledCode, error } = compileJSXBlock(code);
    
    if (error) {
      errors.push(`Script ${jsxScriptsFound}: ${error}`);
      // 编译失败时保留原始代码，让浏览器端 Babel 处理
      return match;
    }
    
    jsxScriptsCompiled++;
    
    // 返回普通 script 标签
    const scriptAttrs = newAttrs ? ` ${newAttrs}` : '';
    return `<script${scriptAttrs}>${compiledCode}</script>`;
  });

  // 如果所有 JSX 都编译成功，移除 Babel standalone 引用
  if (jsxScriptsCompiled === jsxScriptsFound && jsxScriptsFound > 0) {
    // 移除 Babel standalone CDN 引用
    compiledContent = compiledContent.replace(
      /<script[^>]*src\s*=\s*["'][^"']*babel[^"']*\.min\.js["'][^>]*>\s*<\/script>/gi,
      '<!-- Babel removed: JSX pre-compiled -->'
    );
    compiledContent = compiledContent.replace(
      /<script[^>]*src\s*=\s*["'][^"']*babel-standalone[^"']*["'][^>]*>\s*<\/script>/gi,
      '<!-- Babel removed: JSX pre-compiled -->'
    );
  }

  const compiledSize = compiledContent.length;

  return {
    success: errors.length === 0,
    compiledContent,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    stats: {
      originalSize,
      compiledSize,
      compressionRatio: originalSize > 0 ? (1 - compiledSize / originalSize) * 100 : 0,
      jsxScriptsFound,
      jsxScriptsCompiled
    }
  };
}

/**
 * 安全编译：如果编译失败，返回原始内容
 */
export function safeCompileHTMLContent(htmlContent: string): string {
  // 如果没有 JSX，直接返回
  if (!hasJSX(htmlContent)) {
    return htmlContent;
  }

  const result = compileHTMLContent(htmlContent);
  
  if (result.success && result.compiledContent) {
    console.log('[JSX Compiler] Success:', {
      scriptsCompiled: result.stats?.jsxScriptsCompiled,
      savedBytes: result.stats?.originalSize! - result.stats?.compiledSize!
    });
    return result.compiledContent;
  }

  // 编译失败，返回原始内容（浏览器会用 Babel 处理）
  console.warn('[JSX Compiler] Failed, falling back to original:', result.error);
  return htmlContent;
}

/**
 * 轻量级 JSX 检测 + 编译（用于 API 路由）
 */
export async function compileForPublish(content: string): Promise<{
  compiled: string;
  wasCompiled: boolean;
  error?: string;
}> {
  if (!hasJSX(content)) {
    return { compiled: content, wasCompiled: false };
  }

  const result = compileHTMLContent(content);
  
  return {
    compiled: result.compiledContent || content,
    wasCompiled: result.success && (result.stats?.jsxScriptsCompiled || 0) > 0,
    error: result.error
  };
}
