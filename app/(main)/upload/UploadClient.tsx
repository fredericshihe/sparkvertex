'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';
import { getPreviewContent } from '@/lib/preview';
import { copyToClipboard, detectSparkBackendCode, removeSparkBackendCode } from '@/lib/utils';
import { sha256 } from '@/lib/sha256';
import BackendDataPanel from '@/components/BackendDataPanel';
import { smartCompressImage } from '@/lib/image-compress';

// --- 封面截图生成函数 ---
async function generateCoverScreenshot(itemId: string | number, htmlContent: string): Promise<void> {
  try {
    // 创建隐藏的 iframe 用于渲染
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:none;background:#fff;';
    document.body.appendChild(iframe);
    
    // 写入内容
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      return;
    }
    
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();
    
    // 等待内容加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 使用 html2canvas 截图
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(iframeDoc.body, {
      width: 800,
      height: 600,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#0f172a',
      logging: false,
    });
    
    // 转换为 data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    
    // 清理 iframe
    document.body.removeChild(iframe);
    
    // 上传到服务器
    await fetch('/api/generate-cover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, coverDataUrl: dataUrl })
    });
    
    console.log('[Cover] 封面截图生成成功:', itemId);
  } catch (err) {
    console.warn('[Cover] 封面截图生成失败:', err);
    // 失败不影响发布流程
  }
}

// --- Helper Functions (Ported from SparkWorkbench.html) ---

async function calculateContentHash(content: string) {
  // First, strip out SparkVertex watermark content that contains random IDs
  // This ensures the same source content always produces the same hash
  let stripped = content;
  
  // Remove SparkVertex header comment block (contains random ID and date)
  stripped = stripped.replace(/<!--\s*={50,}[\s\S]*?SparkVertex[\s\S]*?={50,}\s*-->/gi, '');
  
  // Remove spark-vertex-id meta tag
  stripped = stripped.replace(/<meta\s+name=["']spark-vertex-id["'][^>]*>/gi, '');
  stripped = stripped.replace(/<meta\s+name=["']generator["']\s+content=["']SparkVertex["'][^>]*>/gi, '');
  
  // Remove SPARK_VERTEX_ID protection script
  stripped = stripped.replace(/<script>\s*\(function\(\)\{[\s\S]*?SPARK_VERTEX_ID[\s\S]*?\}\)\(\);\s*<\/script>/gi, '');
  
  // Remove PUBLIC VERSION comment
  stripped = stripped.replace(/<!--\s*PUBLIC VERSION[\s\S]*?-->/gi, '');

  // Remove charset meta tag (injectWatermark enforces UTF-8, causing mismatch with original)
  stripped = stripped.replace(/<meta[^>]*charset=[^>]*>/gi, '');
  
  // ========== 配置表单注入内容剥离 ==========
  // Remove the entire backend config script injected by preview.ts (contains SparkCMS, fetch interceptor, etc.)
  // This script block starts with CMS 内容管理工具 and contains SPARK_APP_ID, SPARK_API_BASE, etc.
  stripped = stripped.replace(/<script>\s*\(function\(\)\s*\{[\s\S]*?window\.SparkCMS\s*=[\s\S]*?\}\)\(\);\s*<\/script>/gi, '');
  
  // Remove SPARK_APP_ID and related variable declarations
  stripped = stripped.replace(/window\.SPARK_APP_ID\s*=\s*['"][^'"]*['"];?\s*/g, '');
  stripped = stripped.replace(/window\.SPARK_USER_ID\s*=\s*['"][^'"]*['"];?\s*/g, '');
  stripped = stripped.replace(/window\.SPARK_API_BASE\s*=\s*['"][^'"]*['"];?\s*/g, '');
  
  // Remove fetch/XHR interceptor script blocks (used for backend API routing)
  // These are injected by preview.ts for iframe communication
  stripped = stripped.replace(/<script>\s*\(function\(\)\s*\{[\s\S]*?originalFetch\s*=\s*window\.fetch[\s\S]*?\}\)\(\);\s*<\/script>/gi, '');
  
  // Remove SparkCMS related scripts
  stripped = stripped.replace(/<script>\s*\(function\(\)\s*\{[\s\S]*?SparkCMS[\s\S]*?\}\)\(\);\s*<\/script>/gi, '');
  
  // Remove any script containing SPARK_ variable declarations or fetch interceptors
  // This catches variations in the injected script format
  stripped = stripped.replace(/<script>[\s\S]*?SPARK_APP_ID[\s\S]*?<\/script>/gi, '');
  stripped = stripped.replace(/<script>[\s\S]*?SPARK_API_BASE[\s\S]*?<\/script>/gi, '');
  
  // Normalize: remove all whitespace, newlines, and convert to lowercase
  const normalized = stripped.replace(/\s+/g, '').toLowerCase();
  return await sha256(normalized);
}

/**
 * 从 HTML 代码中提取关键信息骨架，大幅减少发送给 AI 的数据量
 * 参考 intent-classifier.ts 的 generateFileSummary 方法
 */
function extractCodeSkeleton(htmlContent: string): string {
  const skeleton: string[] = [];
  
  // 1. 提取 <title> 标签
  const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    skeleton.push(`[Title] ${titleMatch[1].trim()}`);
  }
  
  // 2. 提取 meta 描述
  const metaDescMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (metaDescMatch) {
    skeleton.push(`[Meta] ${metaDescMatch[1].substring(0, 100)}`);
  }
  
  // 3. 检测使用的框架/库
  const frameworks: string[] = [];
  if (htmlContent.includes('react') || htmlContent.includes('React')) frameworks.push('React');
  if (htmlContent.includes('vue') || htmlContent.includes('Vue')) frameworks.push('Vue');
  if (htmlContent.includes('tailwind') || htmlContent.includes('Tailwind')) frameworks.push('Tailwind');
  if (htmlContent.includes('three') || htmlContent.includes('THREE')) frameworks.push('Three.js');
  if (htmlContent.includes('canvas') || htmlContent.includes('Canvas')) frameworks.push('Canvas');
  if (htmlContent.includes('webgl') || htmlContent.includes('WebGL')) frameworks.push('WebGL');
  if (htmlContent.includes('d3') || htmlContent.includes('D3')) frameworks.push('D3.js');
  if (htmlContent.includes('gsap') || htmlContent.includes('GSAP')) frameworks.push('GSAP');
  if (htmlContent.includes('pixi') || htmlContent.includes('PIXI')) frameworks.push('PixiJS');
  if (htmlContent.includes('phaser') || htmlContent.includes('Phaser')) frameworks.push('Phaser');
  if (htmlContent.includes('babylonjs') || htmlContent.includes('BABYLON')) frameworks.push('Babylon.js');
  if (htmlContent.includes('anime.js') || htmlContent.includes('anime(')) frameworks.push('Anime.js');
  if (htmlContent.includes('chart') || htmlContent.includes('Chart')) frameworks.push('Chart.js');
  if (htmlContent.includes('echarts') || htmlContent.includes('ECharts')) frameworks.push('ECharts');
  if (htmlContent.includes('socket') || htmlContent.includes('WebSocket')) frameworks.push('WebSocket');
  if (htmlContent.includes('indexedDB') || htmlContent.includes('IndexedDB')) frameworks.push('IndexedDB');
  if (htmlContent.includes('localStorage')) frameworks.push('LocalStorage');
  
  if (frameworks.length > 0) {
    skeleton.push(`[Tech] ${frameworks.join(', ')}`);
  }
  
  // 4. 提取主要的 CSS 类名（前 20 个独特类名）
  const classMatches = htmlContent.match(/class=["']([^"']+)["']/gi);
  if (classMatches) {
    const classes = new Set<string>();
    classMatches.forEach(m => {
      const classStr = m.replace(/class=["']/i, '').replace(/["']$/, '');
      classStr.split(/\s+/).forEach(c => {
        if (c && c.length > 2 && c.length < 30 && !c.startsWith('_')) {
          classes.add(c);
        }
      });
    });
    const topClasses = Array.from(classes).slice(0, 20);
    if (topClasses.length > 0) {
      skeleton.push(`[Classes] ${topClasses.join(', ')}`);
    }
  }
  
  // 5. 提取主要函数名
  const funcMatches = htmlContent.match(/function\s+(\w+)\s*\(/g);
  const arrowFuncMatches = htmlContent.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/g);
  const funcNames = new Set<string>();
  
  if (funcMatches) {
    funcMatches.forEach(m => {
      const name = m.replace(/function\s+/, '').replace(/\s*\($/, '');
      if (name && name.length > 2 && name.length < 30) {
        funcNames.add(name);
      }
    });
  }
  if (arrowFuncMatches) {
    arrowFuncMatches.forEach(m => {
      const name = m.match(/(?:const|let|var)\s+(\w+)/)?.[1];
      if (name && name.length > 2 && name.length < 30) {
        funcNames.add(name);
      }
    });
  }
  
  const topFuncs = Array.from(funcNames).slice(0, 15);
  if (topFuncs.length > 0) {
    skeleton.push(`[Functions] ${topFuncs.join(', ')}`);
  }
  
  // 6. 提取主要 HTML 结构标签
  const structureTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'form', 'table', 'ul', 'ol'];
  const foundTags: string[] = [];
  structureTags.forEach(tag => {
    if (htmlContent.includes(`<${tag}`)) {
      foundTags.push(tag);
    }
  });
  if (foundTags.length > 0) {
    skeleton.push(`[Structure] ${foundTags.join(', ')}`);
  }
  
  // 7. 检测交互元素
  const interactions: string[] = [];
  if (htmlContent.includes('onclick') || htmlContent.includes('onClick')) interactions.push('Click');
  if (htmlContent.includes('onsubmit') || htmlContent.includes('onSubmit')) interactions.push('Submit');
  if (htmlContent.includes('oninput') || htmlContent.includes('onInput') || htmlContent.includes('onChange')) interactions.push('Input');
  if (htmlContent.includes('ondrag') || htmlContent.includes('onDrag')) interactions.push('Drag');
  if (htmlContent.includes('onkeydown') || htmlContent.includes('onKeyDown')) interactions.push('Keyboard');
  if (htmlContent.includes('ontouchstart') || htmlContent.includes('onTouchStart')) interactions.push('Touch');
  if (htmlContent.includes('requestAnimationFrame')) interactions.push('Animation');
  if (htmlContent.includes('setInterval') || htmlContent.includes('setTimeout')) interactions.push('Timer');
  
  if (interactions.length > 0) {
    skeleton.push(`[Interactions] ${interactions.join(', ')}`);
  }
  
  // 8. 提取可见文本内容（前 500 字符）
  const textContent = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
  
  if (textContent.length > 20) {
    skeleton.push(`[Content] ${textContent}...`);
  }
  
  // 9. 代码统计
  const stats = {
    lines: htmlContent.split('\n').length,
    chars: htmlContent.length,
    hasCSS: htmlContent.includes('<style') || htmlContent.includes('style='),
    hasJS: htmlContent.includes('<script')
  };
  skeleton.push(`[Stats] ${stats.lines} lines, ${Math.round(stats.chars/1024)}KB, CSS:${stats.hasCSS}, JS:${stats.hasJS}`);
  
  return skeleton.join('\n');
}

/**
 * 带自动重试的 DeepSeek API 调用
 * - 504/503/502 错误时最多重试 2 次
 * - 使用指数退避（1s, 2s, 4s）
 * - 客户端 120 秒超时保护
 */
async function callDeepSeekAPI(systemPrompt: string, userPrompt: string, temperature = 0.7) {
  console.log('[DeepSeek API] Calling with system prompt:', systemPrompt.substring(0, 50) + '...');
  
  const maxRetries = 2;
  const clientTimeout = 120000; // 120 秒客户端超时
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 创建 AbortController 用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), clientTimeout);
      
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          temperature: temperature
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      // 检查是否需要重试的错误
      if (response.status === 504 || response.status === 503 || response.status === 502) {
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.warn(`[DeepSeek API] ${response.status} error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        console.error(`[DeepSeek API] Failed after ${maxRetries} retries with status ${response.status}`);
        return null;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorMessage = data.error || `API Error: ${response.status}`;
        console.error('[DeepSeek API] Error response:', response.status, errorMessage);
        
        if (response.status === 429) throw new Error(errorMessage);
        if (response.status === 401) throw new Error(errorMessage);
        if (response.status === 400) throw new Error(errorMessage);
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('[DeepSeek API] Success, content length:', data.content?.length || 0);
      return data.content;
      
    } catch (err: any) {
      // 处理超时错误
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.warn(`[DeepSeek API] Timeout, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        console.error('[DeepSeek API] Timeout after all retries');
        return null;
      }
      
      console.error('[DeepSeek API] Error:', err);
      if (err.message && (
        err.message.includes('Rate limit') || 
        err.message.includes('Unauthorized') || 
        err.message.includes('too long') ||
        err.message.includes('429') ||
        err.message.includes('401') ||
        err.message.includes('400')
      )) {
        throw err;
      }
      return null;
    }
  }
  
  return null;
}

async function analyzeMetadata(htmlContent: string, language: string = 'zh') {
  const isZh = language === 'zh';
  const systemPrompt = isZh
    ? '你是一个资深的产品经理和技术专家。你需要分析 HTML 代码并提取关键元数据：标题、描述、分类和技术标签。'
    : 'You are a Senior Product Manager and Tech Expert. Analyze the HTML code and extract key metadata: Title, Description, Category, and Tech Tags.';

  const userPrompt = isZh
    ? `请分析以下 HTML 代码，返回一个 JSON 对象，包含以下字段：
1. title: 10-30字的吸引人标题。
2. description: 50-100字的产品描述，突出核心功能。
3. category: 从以下列表中选择最匹配的一个分类：'Games', 'Tools', 'Social', 'Entertainment', 'Productivity', 'Education', 'Finance', 'Utilities', 'Lifestyle', 'Health', 'News', 'Shopping', 'Travel', 'Business', 'Sports', 'Weather', 'Reference', 'Graphics', 'Photo', 'Video', 'Music', 'Medical', 'Food', 'Navigation', 'Books', 'Magazines', 'Catalogs', 'Stickers'。
4. tags: 3-6个技术栈标签（如 HTML5, React, Tailwind, Three.js 等）。

只返回 JSON 字符串，不要包含 Markdown 格式或其他文本。

代码骨架（已压缩提取核心信息）:\n\n${extractCodeSkeleton(htmlContent)}`
    : `Analyze the following HTML code and return a JSON object with the following fields:
1. title: 10-30 characters attractive title.
2. description: 50-100 words product description, highlighting core features.
3. category: Choose the best matching category from: 'Games', 'Tools', 'Social', 'Entertainment', 'Productivity', 'Education', 'Finance', 'Utilities', 'Lifestyle', 'Health', 'News', 'Shopping', 'Travel', 'Business', 'Sports', 'Weather', 'Reference', 'Graphics', 'Photo', 'Video', 'Music', 'Medical', 'Food', 'Navigation', 'Books', 'Magazines', 'Catalogs', 'Stickers'.
4. tags: 3-6 tech stack tags (e.g., HTML5, React, Tailwind, Three.js, etc.).

Return only the JSON string, no Markdown formatting or other text.

Code Skeleton (compressed core info):\n\n${extractCodeSkeleton(htmlContent)}`;

  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.5);
  
  try {
    let jsonStr = typeof result === 'string' ? result : String(result);
    // Clean up potential markdown code blocks
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonStr);
    
    return {
      title: data.title || (isZh ? '未命名作品' : 'Untitled App'),
      description: data.description || (isZh ? '这是一个创意 Web 应用。' : 'This is a creative Web App.'),
      category: data.category || 'Tools',
      tags: Array.isArray(data.tags) ? data.tags : ['HTML5']
    };
  } catch (e) {
    console.error('Failed to parse AI metadata response:', e);
    // Fallback
    return {
      title: isZh ? '未命名作品' : 'Untitled App',
      description: isZh ? '这是一个创意 Web 应用。' : 'This is a creative Web App.',
      category: 'Tools',
      tags: ['HTML5']
    };
  }
}

async function analyzeCategory(htmlContent: string, language: string = 'en') {
  const isZh = language === 'zh';

  if (isZh) {
    const categories = ['游戏', '工具', '效率', '教育', '生活', '可视化', '开发者工具', '个人主页', '服务预约'];
    const systemPrompt = '你是一个应用商店分类专家。分析 HTML 代码并将其归类到最合适的类别中。';
    const userPrompt = `分析以下 HTML 代码的核心功能，并将其归类为以下类别之一：\n${categories.join(', ')}\n\n只返回类别名称，不要解释。代码骨架：\n\n${extractCodeSkeleton(htmlContent)}`;
    
    const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
    if (!result) return '工具';
    
    let categoryText = typeof result === 'string' ? result : String(result);
    return categoryText.trim().replace(/["'《》]/g, '');
  }

  const categories = ['Game', 'Utility', 'Productivity', 'Education', 'Lifestyle', 'Visualization', 'DevTool', 'Portfolio', 'Appointment', 'AI'];
  const systemPrompt = 'You are an App Store category expert. Analyze the HTML code and categorize it into the most suitable category.';
  const userPrompt = `Analyze the core function of the following HTML code and categorize it into one of these categories:\n${categories.join(', ')}\n\nReturn only the category name. No explanation. Code Skeleton:\n\n${extractCodeSkeleton(htmlContent)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return 'tool'; // Default to tool (utility)
  
  let categoryText = typeof result === 'string' ? result : String(result);
  const category = categoryText.trim().replace(/["'《》]/g, '');
  
  // Map to lowercase keys
  const map: Record<string, string> = {
    'Game': 'game',
    'Utility': 'tool',
    'Productivity': 'productivity',
    'Education': 'education',
    'Lifestyle': 'lifestyle',
    'Visualization': 'visualization',
    'DevTool': 'devtool',
    'Portfolio': 'portfolio',
    'Appointment': 'appointment',
    'AI': 'ai'
  };
  
  return map[category] || 'tool';
}

async function analyzeTitle(htmlContent: string, language: string = 'en', temperature: number = 0.5) {
  const isZh = language === 'zh';
  const systemPrompt = isZh
    ? '你是一个专业的 SEO 专家和产品经理。你需要分析 HTML 代码并提取或创作一个简洁、吸引人且符合 SEO 规范的标题。'
    : 'You are an SEO expert and Product Manager. Analyze the HTML code and extract or create a concise, attractive title.';
    
  const userPrompt = isZh
    ? `请分析以下 HTML 代码，提取或创作一个标题 (10-30字)。
要求：
1. 包含核心关键词。
2. 具有吸引力，能提高点击率。
3. 如果代码中有 <title>，请优化它。
4. **不要使用视觉风格形容词** (如可爱、赛博朋克)，关注功能。

只返回标题文本，不要引号，不要解释。代码骨架:\n\n${extractCodeSkeleton(htmlContent)}`
    : `Analyze the following HTML code, extract or create a title (10-60 characters).
Requirements:
1. Include core keywords.
2. Attractive and click-worthy.
3. If <title> exists, optimize it.
4. **No visual style adjectives** (e.g., Cute, Cyberpunk, Minimalist), focus on function.

Return only the title text. No quotes. No explanation. Code Skeleton:\n\n${extractCodeSkeleton(htmlContent)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, temperature);
  if (!result) return isZh ? '未命名应用' : 'Untitled App';
  
  let titleText = typeof result === 'string' ? result : String(result);
  return titleText.trim().replace(/["'《》]/g, '');
}

async function analyzeDescription(htmlContent: string, language: string = 'en', temperature: number = 0.7) {
  const isZh = language === 'zh';
  const systemPrompt = isZh
    ? '你是一个科技编辑。你需要分析 HTML 代码并生成一段简洁、专业、极具吸引力的产品介绍。'
    : 'You are a Tech Editor. Analyze the HTML code and generate a concise, professional, attractive product description.';
    
  const userPrompt = isZh
    ? `请分析以下 HTML 代码的功能特性，生成一段 40-80 字的产品描述。
要求：
1. 突出核心价值和技术亮点。
2. 语言风格现代、专业、简洁。
3. 避免空洞的形容词。

只返回描述文本。代码骨架:\n\n${extractCodeSkeleton(htmlContent)}`
    : `Analyze the features of the following HTML code, generate a product description (40-80 words).
Requirements:
1. Highlight core value and tech features.
2. Modern, professional, concise style.
3. Avoid empty adjectives.

Return only the description text. Code Skeleton:\n\n${extractCodeSkeleton(htmlContent)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, temperature);
  if (!result) return isZh ? '这是一个创意 Web 应用。' : 'This is a creative Web App.';
  
  let descText = typeof result === 'string' ? result : String(result);
  return descText.trim();
}

async function analyzeTechStack(htmlContent: string) {
  const systemPrompt = 'You are a Full Stack Expert. Identify key technologies, frameworks, libraries, and APIs used in the HTML code.';
  const userPrompt = `Analyze the tech stack of the following code, select 3-6 most relevant tags from the list:
Options: 
- Core: HTML5, CSS3, JavaScript, TypeScript, React, Vue
- Style: Tailwind, Bootstrap, SCSS
- Graphics: Canvas, WebGL, Three.js, D3.js, SVG
- Data: LocalStorage, IndexedDB, JSON
- Network: WebSocket, WebRTC, API Integration
- Advanced: PWA, Service Worker, WebAssembly, AI/ML, Web Audio

Return only comma-separated tag names. No other text. Code Skeleton:\n\n${extractCodeSkeleton(htmlContent)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return ['HTML5', 'JavaScript', 'CSS3'];
  
  let tagsText = typeof result === 'string' ? result : String(result);
  const tags = tagsText.split(',').map(t => t.trim()).filter(t => t.length > 0);
  return tags.slice(0, 6);
}

async function analyzePrompt(htmlContent: string, language: string = 'en', temperature: number = 0.5) {
  console.log('[analyzePrompt] Starting prompt analysis, language:', language);
  const isZh = language === 'zh';
  const systemPrompt = isZh
    ? '你是一个资深的 Prompt 工程师。你需要分析 HTML 代码并生成一个简洁、核心的 Prompt，用于指导 AI 重新生成类似应用。'
    : 'You are a Senior Prompt Engineer. Analyze the HTML code and generate a concise, core Prompt for AI to regenerate a similar app.';
    
  const userPrompt = isZh
    ? `请分析以下代码，生成一个**核心功能 Prompt** (100-200字)。
重点描述：
1. 核心功能与目标。
2. 关键交互逻辑。
3. 视觉风格关键词。

不要包含冗长的技术细节或边缘情况，只保留最核心的生成指令。

代码骨架:\n\n${extractCodeSkeleton(htmlContent)}`
    : `Analyze the following code, generate a **Core Function Prompt** (100-200 words).
Focus on:
1. Core function and goal.
2. Key interaction logic.
3. Visual style keywords.

No verbose technical details or edge cases, only the core generation instructions.

Code Skeleton:\n\n${extractCodeSkeleton(htmlContent)}`;
  
  try {
    const result = await callDeepSeekAPI(systemPrompt, userPrompt, temperature);
    console.log('[analyzePrompt] API result:', result ? 'success' : 'null', result?.substring(0, 50));
    if (!result) {
      console.warn('[analyzePrompt] No result, using fallback');
      return isZh ? '创建一个具有现代 UI 的 Web 应用。' : 'Create a web application with modern UI.';
    }
    return typeof result === 'string' ? result : String(result);
  } catch (err) {
    console.error('[analyzePrompt] Error:', err);
    return isZh ? '创建一个具有现代 UI 的 Web 应用。' : 'Create a web application with modern UI.';
  }
}

async function analyzeAppType(htmlContent: string) {
  const systemPrompt = 'You are an App Category Expert.';
  const userPrompt = `Analyze the following HTML code, determine if it belongs to one or more of these specific categories:
1. "Eye Candy": Visually stunning, creative demos.
2. "Micro-Interactions": Focus on UI components, buttons, animations.
3. "Tiny Tools": Small single-function tools (e.g., calculator, converter).

Return a JSON string array containing matching category names. If none match, return empty array [].
Return only JSON array. No other text.

Code Skeleton:
${extractCodeSkeleton(htmlContent)}`;

  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return [];
  
  let resultText = typeof result === 'string' ? result : String(result);
  const jsonMatch = resultText.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) { return []; }
  }
  return [];
}

function performBasicSecurityCheck(htmlContent: string) {
  // Relaxed checks for creative coding context
  const dangerousPatterns = [
      // { pattern: /eval\s*\(/gi, name: 'eval call' }, // Common in calculators
      // { pattern: /new\s+Function\s*\(/gi, name: 'Function constructor' }, // Common in compilers
      // { pattern: /document\.write\s*\(/gi, name: 'document.write' }, // Deprecated but not strictly malicious
      // { pattern: /\.innerHTML\s*=/g, name: 'innerHTML assignment' }, // Common in vanilla JS apps
      { pattern: /<script[^>]*src\s*=\s*["'][^"']*(?:bitcoin|crypto|miner|coinminer)[^"']*["']/gi, name: 'Suspicious Mining Script' },
      { pattern: /keylogger|keystroke|keypress.*password/gi, name: 'Suspicious Keylogging' },
      // { pattern: /document\.cookie/gi, name: 'Cookie Access' }, // Common for auth
      // { pattern: /localStorage|sessionStorage/gi, name: 'Local Storage' }, // Common for state persistence
      { pattern: /navigator\.sendBeacon/gi, name: 'Background Data Sending' },
      
      // Content Moderation (Basic Keyword Check)
      { pattern: /(porn|xxx|hentai|sex|nude|色情|成人|裸聊)/gi, name: 'Pornographic Content Keyword' },
      { pattern: /(casino|betting|gambling|slot machine|赌博|彩票|六合彩|网赌)/gi, name: 'Gambling Content Keyword' },
      { pattern: /(cocaine|heroin|meth|drug sale|毒品|冰毒|海洛因)/gi, name: 'Illegal Drug Content Keyword' }
  ];
  
  const foundRisks: string[] = [];
  dangerousPatterns.forEach(({ pattern, name }) => {
      const matches = htmlContent.match(pattern);
      if (matches && matches.length > 0) {
          foundRisks.push(`${name} (Detected ${matches.length})`);
      }
  });
  
  // Check for Spark backend integration
  const hasSparkBackend = detectSparkBackendCode(htmlContent);
  
  // Only block for high severity findings
  if (foundRisks.length > 0) {
      return { isSafe: false, risks: foundRisks, severity: 'high', hasBackendCode: hasSparkBackend };
  }
  
  return { isSafe: true, risks: [], severity: 'low', hasBackendCode: hasSparkBackend };
}

async function checkMaliciousCode(htmlContent: string) {
  const systemPrompt = 'You are a strict Code Auditor and Content Moderator. This is a code sharing platform for single-file apps.';
  const userPrompt = `Perform security and content moderation check on the following code.
  
**Allowed behaviors (Do not report):**
1. CDN resources (React, Vue, Tailwind, Audio/Video, Images).
2. eval() or new Function() for math (e.g., calculator).
3. localStorage/sessionStorage.
4. innerHTML for UI updates.
5. **Spark Platform Backend API** - This is our official backend integration:
   - /api/mailbox/submit - Official form submission endpoint
   - window.SPARK_APP_ID or SPARK_APP_ID - Platform app identifier
   - SparkCrypto - Platform encryption module
   - sparkvertex.vercel.app/api/* - Platform API endpoints
   - These are SAFE and should NOT be reported as Data Theft!

**Risks (Report these immediately):**
1. **Malicious Mining**: CPU intensive loops or mining pool connections.
2. **Data Theft**: Sending sensitive data to UNKNOWN 3rd party servers (not Spark platform APIs).
3. **Malicious Destruction**: Deleting page content or infinite alerts.
4. **Illegal Content (STRICT)**:
   - **Pornography**: Explicit sexual content, nudity, or links to adult sites.
   - **Gambling**: Online casinos, betting, or gambling promotion (excluding simple card games without real money).
   - **Drugs**: Promotion or sale of illegal drugs or controlled substances.

Return JSON format:
{
  "isSafe": boolean,
  "risks": string[], 
  "severity": "low" | "medium" | "high"
}

Code Skeleton + Script Analysis:\n\n${extractCodeSkeleton(htmlContent)}

Raw Script Tags (for security check):\n\n${(htmlContent.match(/<script[\s\S]*?<\/script>/gi) || []).slice(0, 5).join('\n\n').substring(0, 8000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.2);
  if (!result) return performBasicSecurityCheck(htmlContent);
  
  let resultText = typeof result === 'string' ? result : String(result);
  
  // Check for Spark backend integration
  const hasSparkBackend = detectSparkBackendCode(htmlContent);
  
  const jsonMatch = resultText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
      try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) return performBasicSecurityCheck(htmlContent);
          return { ...parsed, hasBackendCode: hasSparkBackend };
      } catch (e) {
          return performBasicSecurityCheck(htmlContent);
      }
  }
  return performBasicSecurityCheck(htmlContent);
}

function injectWatermark(content: string) {
  if (content.includes('name="spark-vertex-id"')) return content;

  const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const date = new Date().toISOString().split('T')[0];
  
  const headerComment = `<!--
================================================================
  🛡️ SparkVertex Certified
  
  This content was generated/verified on SparkVertex.
  Platform: SparkVertex (Local-First Geek Tools)
  Date: ${date}
  ID: ${id}
  
  Philosophy: Single File, Local First, No Cloud.
================================================================
-->`;

  const metaTag = `\n    <meta name="spark-vertex-id" content="${id}">\n    <meta name="generator" content="SparkVertex">`;
  
  const protectionScript = `
  <script>
      (function(){
          if(window.SPARK_VERTEX_ID) return;
          window.SPARK_VERTEX_ID = "${id}";
      })();
  <\/script>`;

  let newContent = content;

  const charsetRegex = /<meta[^>]*charset=[^>]*>/i;
  if (charsetRegex.test(newContent)) {
      newContent = newContent.replace(charsetRegex, '<meta charset="UTF-8">');
  } else {
      newContent = newContent.replace('<head>', '<head>\n    <meta charset="UTF-8">');
  }

  if (newContent.match(/<!DOCTYPE html>/i)) {
      newContent = newContent.replace(/<!DOCTYPE html>/i, '<!DOCTYPE html>\n' + headerComment);
  } else {
      newContent = headerComment + '\n' + newContent;
  }
  
  if (newContent.includes('<head>')) {
      newContent = newContent.replace('<head>', '<head>' + metaTag);
  }
  
  if (newContent.includes('</body>')) {
      newContent = newContent.replace('</body>', protectionScript + '\n</body>');
  } else {
      newContent += protectionScript;
  }
  
  return newContent;
}

function UploadContent() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const updateId = searchParams.get('update'); // 更新模式：重新上传替换作品
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false); // 更新模式标志
  const { openLoginModal, openCreditPurchaseModal } = useModal();
  const { error: toastError, success: toastSuccess } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [isDuplicateRestricted, setIsDuplicateRestricted] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    show: boolean;
    type: 'hash' | 'vector';
    isSelf: boolean;
    similarity?: number;
    matchedItemId?: string;
    matchedTitle?: string;
  }>({ show: false, type: 'hash', isSelf: false });
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [duplicateCheckPassed, setDuplicateCheckPassed] = useState(false);
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  
  // Validation State
  const [validationState, setValidationState] = useState<{
    status: 'idle' | 'validating' | 'success' | 'error';
    error?: string;
    details?: any;
  }>({ status: 'idle' });
  
  // Metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceType, setPriceType] = useState<'free' | 'paid'>('free');
  const [price, setPrice] = useState(5.0);
  const [tags, setTags] = useState<string[]>(['HTML5', 'Tool']);
  const [tagInput, setTagInput] = useState('');
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedShareToken, setPublishedShareToken] = useState<string | null>(null); // 私密分享 token
  const [user, setUser] = useState<any>(null);
  const [showBackendPanel, setShowBackendPanel] = useState(false);
  
  // Share card states
  const shareRef = useRef<HTMLDivElement>(null);
  const [shareImageUrl, setShareImageUrl] = useState<string>('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisSessionIdRef = useRef(0);

  useEffect(() => {
    checkAuth();
    
    // Subscribe to auth changes and automatically refresh session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      
      // 当 token 刷新时，更新用户信息
      if (event === 'TOKEN_REFRESHED') {
        console.log('[Auth] Token refreshed successfully');
      }
      
      // 当会话过期时，提示用户重新登录
      if (event === 'SIGNED_OUT') {
        console.warn('[Auth] Session expired, user signed out');
      }
    });

    // 定期检查并刷新会话（每45分钟检查一次）
    // 因为 access token 默认有效期是 1 小时
    const refreshInterval = setInterval(async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session && !error) {
        // 检查 token 是否即将过期（还剩 15 分钟）
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;
        const fifteenMinutes = 15 * 60 * 1000;
        
        if (timeUntilExpiry < fifteenMinutes) {
          console.log('[Auth] Token expiring soon, refreshing...');
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.error('[Auth] Failed to refresh session:', refreshError);
          } else {
            console.log('[Auth] Session refreshed proactively');
          }
        }
      }
    }, 45 * 60 * 1000); // 每45分钟检查一次

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  // Load logo for share card
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const logoResponse = await fetch('/logo.png');
        const logoBlob = await logoResponse.blob();
        const logoReader = new FileReader();
        logoReader.onloadend = () => setLogoDataUrl(logoReader.result as string);
        logoReader.readAsDataURL(logoBlob);
      } catch (e) {
        console.warn('Failed to load logo:', e);
        setLogoDataUrl('/logo.png');
      }
    };
    loadLogo();
  }, []);

  // Generate share image when step 4 is reached
  useEffect(() => {
    if (step === 4 && shareRef.current && !shareImageUrl) {
      setGeneratingImage(true);
      
      setTimeout(async () => {
        if (shareRef.current) {
          try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(shareRef.current, {
              useCORS: true,
              allowTaint: true,
              backgroundColor: null,
              scale: 2,
              logging: false,
            });
            setShareImageUrl(canvas.toDataURL('image/png'));
          } catch (err) {
            console.error('Error generating share image:', err);
          } finally {
            setGeneratingImage(false);
          }
        }
      }, 500);
    }
  }, [step, shareImageUrl]);

  // Cover screenshot generation removed - now using live iframe preview on cards

  useEffect(() => {
    const init = async () => {
      const fromCreate = searchParams.get('from') === 'create';

      if (editId) {
        setIsEditing(true);
        await loadItemData(editId);
      } else if (updateId) {
        // 更新模式：加载元数据但不加载内容，让用户重新上传
        setIsUpdating(true);
        await loadItemDataForUpdate(updateId);
      }
      
      // Check for generated content from Create Wizard (overrides DB content if present)
      if (fromCreate) {
        const generatedCode = localStorage.getItem('spark_generated_code');
        
        if (generatedCode) {
          // Validate content structure
          if (generatedCode.includes('<<<<AST_REPLACE:') || generatedCode.trim().startsWith('STEP:')) {
             console.error('Invalid generated code detected');
             // Don't load invalid code
             localStorage.removeItem('spark_generated_code');
             return;
          }

          setFileContent(generatedCode);
          setStep(2); // Skip upload step
          
          // Trigger Validation first, then Analysis
          validateCode(generatedCode);
          
          // Clear storage to prevent reuse
          localStorage.removeItem('spark_generated_code');
          localStorage.removeItem('spark_generated_meta');
        }
      }
    };

    init();
  }, [editId, updateId]);

  const validateCode = (code: string) => {
    setValidationState({ status: 'validating' });
    
    // We use a hidden iframe to validate the code
    // The validation logic is handled by the 'message' event listener below
    // We inject a script to check for content
    
    // Set a timeout for validation failure (e.g. infinite loop or crash)
    const timeoutId = setTimeout(() => {
        setValidationState(prev => {
            if (prev.status === 'validating') {
                return { 
                    status: 'error', 
                    error: t.upload.validation_timeout || 'Validation timed out. The app might be crashing or too slow.' 
                };
            }
            return prev;
        });
    }, 60000); // 60 seconds timeout

    // Store timeout ID to clear it if validation succeeds
    (window as any).__validationTimeout = timeoutId;
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
        if (validationState.status !== 'validating') return;

        if (event.data && event.data.type === 'spark-app-error') {
            clearTimeout((window as any).__validationTimeout);
            setValidationState({ 
                status: 'error', 
                error: event.data.error.message || 'Runtime Error',
                details: event.data.error
            });
        }
        
        if (event.data && event.data.type === 'spark-validation-success') {
            clearTimeout((window as any).__validationTimeout);
            setValidationState({ status: 'success' });
            // Check for duplicates immediately after validation
            checkDuplicateEarly(fileContent).then(result => {
              if (result.passed) {
                if (result.isDuplicate) {
                    setIsPublic(false);
                    setIsDuplicateRestricted(true);
                    toastError(language === 'zh' 
                        ? '检测到重复内容，已自动设置为私密分享' 
                        : 'Duplicate content detected. Visibility set to Private.');
                } else {
                    setIsDuplicateRestricted(false);
                }
                // Pass the pre-computed data (title, desc, etc.) to avoid re-analysis
                performAIAnalysis(fileContent, result.data);
              }
            });
        }

        if (event.data && event.data.type === 'spark-validation-empty') {
            clearTimeout((window as any).__validationTimeout);
            setValidationState({ 
                status: 'error', 
                error: t.upload.validation_empty || 'The application rendered a blank screen.' 
            });
        }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [validationState.status, fileContent]);

  const getValidationContent = (content: string) => {
      // Use preview.ts's error handling (which sends spark-app-error via postMessage)
      // We only need to add the success/empty detection script
      const validationScript = `
        <script>
          // Listen for successful render - preview.ts already handles error detection
          window.addEventListener('load', function() {
            setTimeout(function() {
              try {
                  var bodyText = document.body.innerText;
                  var hasContent = bodyText.trim().length > 0 || document.body.children.length > 0;
                  
                  // Check for leaked code patterns in visible text (indicates broken HTML/Script)
                  var codePatterns = [
                    '<<<<AST_REPLACE', 
                    '<<<<<<< HEAD',
                    'import React',
                    'export default function',
                    'const [',
                    'useEffect(()',
                    'console.log(',
                    'STEP: '
                  ];
                  
                  var leakedCode = codePatterns.find(function(p) { return bodyText.includes(p); });
                  
                  if (leakedCode) {
                     window.parent.postMessage({ 
                        type: 'spark-app-error', 
                        error: { message: 'Detected leaked source code in UI: ' + leakedCode } 
                     }, '*');
                     return;
                  }

                  // Check for common "empty" react roots
                  var root = document.getElementById('root');
                  if (root && root.innerHTML.trim().length === 0) hasContent = false;

                  if (hasContent) {
                    window.parent.postMessage({ type: 'spark-validation-success' }, '*');
                  } else {
                    // Check if errorList has errors (from preview.ts)
                    if (typeof errorList !== 'undefined' && errorList.length > 0) {
                        // Error already reported by preview.ts, do nothing
                    } else {
                        window.parent.postMessage({ type: 'spark-validation-empty' }, '*');
                    }
                  }
              } catch(e) {
                  window.parent.postMessage({ type: 'spark-app-error', error: { message: e.toString() } }, '*');
              }
            }, 5000); // Wait 5 seconds for render
          });
        </script>
      `;
      
      // Use existing preview logic (which includes error handling) and append validation script
      let previewHtml = getPreviewContent(content, { raw: true });
      if (previewHtml.includes('</body>')) {
          previewHtml = previewHtml.replace('</body>', validationScript + '</body>');
      } else {
          previewHtml += validationScript;
      }
      return previewHtml;
  };

  const loadItemData = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, created_at, title, description, content, price, author_id, tags, likes, color, page_views, file_url, downloads, prompt, icon_url, is_public, quality_score, richness_score, utility_score, total_score, last_analyzed_at, daily_rank, analysis_reason, analysis_reason_en, content_hash')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        // Verify ownership
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.id !== data.author_id) {
          toastError(t.upload.no_permission);
          router.push('/profile');
          return;
        }

        setTitle(data.title);
        setDescription(data.description);
        setPrice(data.price);
        setPriceType(data.price > 0 ? 'paid' : 'free');
        setTags(data.tags || []);
        setPrompt(data.prompt || '');
        setFileContent(data.content);
        
        // Check for backend code in existing content
        const hasBackend = detectSparkBackendCode(data.content);
        setHasBackendCode(hasBackend);
        
        // If has backend code, force private; otherwise use saved value
        if (hasBackend) {
          setIsPublic(false);
        } else {
          setIsPublic(data.is_public !== false); // Default to true if null
        }
        
        setStep(2); // Skip upload step
        
        // Mark as safe to allow proceeding without re-analysis unless file changes
        setIsSecuritySafe(true); 
        setAnalysisState({
          status: 'success',
          message: t.upload.security_pass,
          data: {
            category: t.common.loaded,
            title: data.title,
            tags: data.tags,
            techTagsCount: 0,
            mobileOptimized: false,
            iconUrl: data.icon_url
          }
        });
      }
    } catch (error) {
      console.error('Error loading item:', error);
      toastError(t.upload.load_fail);
      router.push('/profile');
    } finally {
      setLoading(false);
    }
  };

  // 更新模式：加载元数据但保持在上传步骤，让用户重新上传文件
  const loadItemDataForUpdate = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, title, description, price, author_id, tags, prompt, is_public, icon_url')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        // Verify ownership
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.id !== data.author_id) {
          toastError(t.upload.no_permission);
          router.push('/profile');
          return;
        }

        // 只加载元数据，不加载内容
        setTitle(data.title);
        setDescription(data.description);
        setPrice(data.price);
        setPriceType(data.price > 0 ? 'paid' : 'free');
        setTags(data.tags || []);
        setPrompt(data.prompt || '');
        setIsPublic(data.is_public !== false);
        
        // 保持在步骤1，让用户上传新文件
        setStep(1);
      }
    } catch (error) {
      console.error('Error loading item for update:', error);
      toastError(t.upload.load_fail);
      router.push('/profile');
    } finally {
      setLoading(false);
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
    // Only force login if editing an existing item, otherwise let them browse/upload (upload click will trigger login)
    if (!session && editId) {
      openLoginModal();
    }
  };

  const isValidHtmlContent = (content: string) => {
    // Check for SparkVertex internal patch markers
    if (content.includes('<<<<AST_REPLACE:') || content.includes('<<<<AST_REPLACE_END>>>>')) {
      return false;
    }
    // Check for Step markers
    if (content.trim().startsWith('STEP:')) {
      return false;
    }
    // Check for Git conflict markers
    if (content.includes('<<<<<<< HEAD') || content.includes('>>>>>>>')) {
      return false;
    }
    // Check for common AI placeholders indicating incomplete code
    if (content.includes('// ... existing code') || content.includes('/* ... existing code') || content.includes('// ... rest of code')) {
      return false;
    }
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.html') || selectedFile.type === 'text/html') {
        const reader = new FileReader();
        reader.onload = (progressEvent) => {
          const content = progressEvent.target?.result as string;
          
          if (!isValidHtmlContent(content)) {
            console.error('Invalid HTML content detected in handleFileSelect');
            toastError(language === 'zh' ? '上传的文件似乎是代码片段而非完整的 HTML 应用' : 'Uploaded file appears to be a code snippet, not a full HTML app');
            // Reset file input
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            return;
          }

          setFile(selectedFile);
          setFileContent(content);
          setStep(2);
          // Trigger Validation first, then Analysis
          validateCode(content);
        };
        reader.readAsText(selectedFile);
      } else {
        toastError(t.upload.upload_html_error);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();

    // Auth Check
    if (!user) {
      openLoginModal();
      return;
    }

    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.html') || selectedFile.type === 'text/html') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;

          if (!isValidHtmlContent(content)) {
            console.error('Invalid HTML content detected in handleDrop');
            toastError(language === 'zh' ? '上传的文件似乎是代码片段而非完整的 HTML 应用' : 'Uploaded file appears to be a code snippet, not a full HTML app');
            return;
          }

          setFile(selectedFile);
          setFileContent(content);
          setStep(2);
          // Trigger Validation first, then Analysis
          validateCode(content);
        };
        reader.readAsText(selectedFile);
      } else {
        toastError(t.upload.upload_html_error);
      }
    }
  };

  const [analysisState, setAnalysisState] = useState<{
    status: 'idle' | 'analyzing' | 'success' | 'risk' | 'error';
    progress?: number;
    tasks?: { id: string; label: string; status: 'pending' | 'done' }[];
    message?: string;
    data?: {
      category?: string;
      title?: string;
      tags?: string[];
      techTagsCount?: number;
      risks?: string[];
      severity?: string;
      mobileOptimized?: boolean;
      iconUrl?: string;
    };
  }>({ status: 'idle' });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSecuritySafe, setIsSecuritySafe] = useState(false);
  const [hasBackendCode, setHasBackendCode] = useState(false);
  const [prompt, setPrompt] = useState('');


  
  // Icon State
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>('');
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  const [generationCount, setGenerationCount] = useState(0);
  const [firstIconGenerationComplete, setFirstIconGenerationComplete] = useState(false);

  // Add a ref to track the current analysis session ID
  // const analysisSessionIdRef = useRef(0); // Already declared above

  const handleReset = () => {
    // Increment session ID to invalidate any running analysis
    analysisSessionIdRef.current += 1;
    
    // Reset File Input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setFile(null);
    setFileContent('');
    setTitle('');
    setDescription('');
    setPriceType('free');
    setPrice(5.0);
    setTags(['HTML5', 'Tool']);
    setTagInput('');
    setPublishedId(null);
    setPublishedShareToken(null); // 重置私密分享 token
    setShareImageUrl(''); // Reset share image
    setAnalysisState({ status: 'idle', progress: 0, tasks: [], message: '', data: undefined });
    setIsAnalyzing(false);
    setIsSecuritySafe(false);
    setHasBackendCode(false);
    setPrompt('');
    setIconFile(null);
    setIconPreview('');
    setIsGeneratingIcon(false);
    setGenerationCount(0);
    setFirstIconGenerationComplete(false); // 重置首次图标生成状态
    setStep(1);
  };

  // --- Mobile Optimization Logic ---
  const optimizeMobileCode = async (html: string) => {
    // Simulate AI processing time for better UX
    await new Promise(resolve => setTimeout(resolve, 1500));

    let newHtml = html;
    let optimized = false;

    // 1. Inject Viewport Meta if missing or incomplete
    if (!newHtml.includes('viewport-fit=cover') || !newHtml.includes('user-scalable=no')) {
      const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">';
      if (newHtml.includes('<meta name="viewport"')) {
        newHtml = newHtml.replace(/<meta name="viewport"[^>]*>/i, viewportMeta);
      } else {
        newHtml = newHtml.replace('<head>', `<head>\n    ${viewportMeta}`);
      }
      optimized = true;
    }

    // 2. Inject Mobile CSS (No Select, No Scrollbar, Touch Callout)
    const mobileCss = `
    <style>
      body { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    </style>`;

    if (!newHtml.includes('-webkit-touch-callout: none')) {
      if (newHtml.includes('</head>')) {
        newHtml = newHtml.replace('</head>', `${mobileCss}\n</head>`);
      } else {
        newHtml = `<html><head>${mobileCss}</head>${newHtml.replace('<html>', '')}`;
      }
      optimized = true;
    }

    return { optimizedHtml: newHtml, wasOptimized: optimized };
  };

  const checkDuplicateEarly = async (content: string) => {
    console.log('🔍 [Duplicate Check] Starting early detection...');
    setIsCheckingDuplicate(true);
    
    // Reduced delay for faster UX (was 1500ms)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('🔍 [Duplicate Check] Skipped: No session');
        setIsCheckingDuplicate(false);
        return { passed: true }; // Allow to proceed if not logged in yet
      }

      // 1. Hash Check (Fast)
      const contentHash = await calculateContentHash(content);
      
      // Also calculate hash for "cleaned" version (in case the original was published as public/cleaned)
      const cleanedContent = removeSparkBackendCode(content);
      const cleanedHash = await calculateContentHash(cleanedContent);
      
      console.log('🔍 [Duplicate Check] Content Hash:', contentHash);
      console.log('🔍 [Duplicate Check] Cleaned Hash:', cleanedHash);

      // Build query to check for hash duplicates (check both original and cleaned hashes)
      let hashQuery = supabase
        .from('items')
        .select('id, author_id, content_hash, is_public')
        .in('content_hash', [contentHash, cleanedHash])
        .eq('is_public', true) // Only check against public items
        .limit(10);  // Get multiple results to handle edge cases
      
      // If editing or updating, exclude the current item
      const currentItemId = editId || updateId;
      if ((isEditing && editId) || (isUpdating && updateId)) {
        console.log('🔍 [Duplicate Check] Edit/Update mode - excluding ID:', currentItemId);
        hashQuery = hashQuery.neq('id', currentItemId);
      }
      
      const { data: existingItems, error: hashError } = await hashQuery;
      
      if (hashError) {
        console.error('🔍 [Duplicate Check] Hash Query Error:', hashError);
      }
      
      const existing = existingItems && existingItems.length > 0 ? existingItems[0] : null;

      console.log('🔍 [Duplicate Check] Hash Match Found:', existing ? 'YES' : 'NO', existing?.id, '(matches:', existingItems?.length || 0, ', isEditing:', isEditing, 'editId:', editId, 'isUpdating:', isUpdating, 'updateId:', updateId, ')');

      if (existing) {
        // Get the matched item's title
        const { data: matchedItem } = await supabase
          .from('items')
          .select('title')
          .eq('id', existing.id)
          .single();
        
        console.log('🔍 [Duplicate Check] Hash Match Found - Restricting to Private');
        setIsCheckingDuplicate(false);
        
        return { 
          passed: true, 
          isDuplicate: true,
          duplicateType: 'hash',
          isSelf: existing.author_id === session.user.id,
          matchedItemId: existing.id,
          matchedTitle: matchedItem?.title
        }; 
      }

      // 2. Vector Check (Slower, but required early)
      let embedding = null;

      try {
        // Use the code content directly for embedding to detect slight modifications (e.g. color changes)
        // Truncate to 20000 chars to fit within token limits (approx 5k tokens)
        const textToEmbed = content.substring(0, 20000);
        
        // Add timeout to prevent long waits on slow networks
        const embedController = new AbortController();
        const embedTimeout = setTimeout(() => embedController.abort(), 15000); // 15s timeout
        
        const embedRes = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToEmbed }),
          signal: embedController.signal
        });
        
        clearTimeout(embedTimeout);

        if (embedRes.ok) {
          const embedData = await embedRes.json();
          embedding = embedData.embedding;
          if (embedding) setEmbedding(embedding);

          if (embedding) {
            const { data: similarItems, error: matchError } = await supabase.rpc('match_items', {
              query_embedding: embedding,
              match_threshold: 0.90,
              match_count: 5  // Get more results to filter out current item if editing
            });
            
            if (matchError) console.error('🔍 [Duplicate Check] Vector Match Error:', matchError);
            
            if (!matchError && similarItems && similarItems.length > 0) {
              // Filter out the current item being edited or updated
              const excludeId = editId || updateId;
              console.log('🔍 [Duplicate Check] Vector results before filter:', similarItems.map((i: any) => ({ id: i.id, similarity: i.similarity })));
              
              // Fetch details for all candidates to check is_public status
              const candidateIds = similarItems.map((i: any) => i.id);
              const { data: candidates } = await supabase
                .from('items')
                .select('id, is_public, author_id, title')
                .in('id', candidateIds);
                
              const publicCandidatesMap = new Map();
              if (candidates) {
                candidates.forEach((c: any) => {
                  if (c.is_public) {
                    publicCandidatesMap.set(c.id, c);
                  }
                });
              }

              const filteredItems = similarItems.filter((item: any) => {
                // 1. Exclude current item
                if ((isEditing && editId) || (isUpdating && updateId)) {
                   if (String(item.id) === String(excludeId)) return false;
                }
                // 2. Only include public items
                return publicCandidatesMap.has(item.id);
              });
              
              console.log('🔍 [Duplicate Check] Filtered items count:', filteredItems.length, '(original:', similarItems.length, ')');
              
              if (filteredItems.length > 0) {
                const bestMatch = filteredItems[0];
                console.log('🔍 [Duplicate Check] Vector Similarity:', bestMatch.similarity, 'ID:', bestMatch.id);
                
                const matchOwner = publicCandidatesMap.get(bestMatch.id);
                  
                const isSelf = matchOwner && matchOwner.author_id === session.user.id;

                // 0.98 Threshold: Restrict to Private
                if (bestMatch.similarity > 0.98) {
                   console.log('🔍 [Duplicate Check] Vector Match > 0.98 - Restricting to Private');
                   setIsCheckingDuplicate(false);
                   return { 
                     passed: true,
                     isDuplicate: true,
                     duplicateType: 'vector',
                     isSelf: isSelf || false,
                     similarity: bestMatch.similarity,
                     matchedItemId: bestMatch.id,
                     matchedTitle: matchOwner?.title
                   };
                }
                // 0.90 Threshold: Warn (but allow pass)
                if (bestMatch.similarity > 0.90) {
                   console.log('🔍 [Duplicate Check] WARN by Vector (Similarity > 0.90)');
                   toastError(language === 'zh' 
                     ? '提示：您的作品与现有作品相似度较高。' 
                     : 'Note: Your work is quite similar to an existing one.');
                }
              } else {
                  console.log('🔍 [Duplicate Check] No similar vectors found > 0.90');
              }
            } else {
                console.log('🔍 [Duplicate Check] No similar vectors found > 0.90');
            }
          }
        }
      } catch (e) {
        console.warn('Early vector check failed:', e);
      }

      setIsCheckingDuplicate(false);
      setDuplicateCheckPassed(true);
      console.log('🔍 [Duplicate Check] Passed');
      
      // Return embedding for later use if needed
      return { 
        passed: true, 
        data: { 
          embedding: embedding 
        } 
      }; 

    } catch (error) {
      console.error('Early duplicate check failed:', error);
      setIsCheckingDuplicate(false);
      return { passed: true }; // Allow to proceed on error
    }
  };

  const performAIAnalysis = async (html: string, preComputedData?: any) => {
    // Check login first
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }

    // Rate limit check: Max 30 analysis per hour per user
    const rateLimitKey = `ai_analysis_${session.user.id}`;
    const rateLimitData = localStorage.getItem(rateLimitKey);
    
    if (rateLimitData) {
      try {
        const { count, timestamp } = JSON.parse(rateLimitData);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        
        if (timestamp > oneHourAgo) {
          if (count >= 30) {
            toastError(language === 'zh' 
              ? '操作过于频繁，请稍后再试（每小时最多 30 次分析）' 
              : 'Too many requests. Please try again later (30 analyses per hour).');
            setAnalysisState({
              status: 'error',
              message: language === 'zh' ? '频率限制' : 'Rate limit exceeded'
            });
            return;
          }
          // Increment count
          localStorage.setItem(rateLimitKey, JSON.stringify({
            count: count + 1,
            timestamp: timestamp
          }));
        } else {
          // Reset if expired
          localStorage.setItem(rateLimitKey, JSON.stringify({
            count: 1,
            timestamp: Date.now()
          }));
        }
      } catch (e) {
        // Reset on error
        localStorage.setItem(rateLimitKey, JSON.stringify({
          count: 1,
          timestamp: Date.now()
        }));
      }
    } else {
      // First time
      localStorage.setItem(rateLimitKey, JSON.stringify({
        count: 1,
        timestamp: Date.now()
      }));
    }

    // Start a new analysis session
    const currentSessionId = analysisSessionIdRef.current + 1;
    analysisSessionIdRef.current = currentSessionId;

    setIsAnalyzing(true);
    setIsSecuritySafe(false);
    
    // 任务列表：6 个步骤
    // 0: security, 1: title+desc, 2: category+tags, 3: prompt, 4: mobile, 5: icon
    const tasks: { id: string; label: string; status: 'pending' | 'done' }[] = [
      { id: 'security', label: t.upload.task_security, status: 'pending' },       // 0 安全检测
      { id: 'title', label: t.upload.task_title, status: 'pending' },             // 1 标题描述
      { id: 'category', label: t.upload.task_category, status: 'pending' },       // 2 分类标签
      { id: 'prompt', label: t.upload.task_prompt, status: 'pending' },           // 3 Prompt逆向
      { id: 'mobile', label: t.upload.task_mobile, status: 'pending' },           // 4 移动端适配
      { id: 'icon', label: t.upload.task_icon, status: 'pending' },               // 5 图标生成
    ];

    const updateProgressUI = () => {
      // Check if this session is still valid
      if (analysisSessionIdRef.current !== currentSessionId) return;

      const pendingCount = tasks.filter(t => t.status === 'pending').length;
      const totalCount = tasks.length;
      const progress = Math.round(((totalCount - pendingCount) / totalCount) * 100);

      setAnalysisState({
        status: 'analyzing',
        progress,
        tasks: [...tasks]
      });
    };

    // Initial UI
    updateProgressUI();

    try {
      const runTask = async <T,>(index: number, promise: Promise<T>): Promise<T> => {
        try {
          const result = await promise;
          // Check validity before updating UI
          if (analysisSessionIdRef.current === currentSessionId) {
            tasks[index].status = 'done';
            updateProgressUI();
          }
          return result;
        } catch (e) {
          console.error(`Task ${tasks[index].label} failed`, e);
          if (analysisSessionIdRef.current === currentSessionId) {
            tasks[index].status = 'done';
            updateProgressUI();
          }
          throw e;
        }
      };

      // Helper to generate icon using the description result
      const generateIconTask = async (titlePromise: Promise<string>, descPromise: Promise<string>) => {
        try {
          const [title, desc] = await Promise.all([titlePromise, descPromise]);
          if (!title || !desc) return null;
          
          const response = await fetch('/api/generate-icon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description: desc, firstCall: true })
          });
          
          if (!response.ok) {
             const data = await response.json().catch(() => ({}));
             const msg = data.error || `API Error: ${response.status}`;
             if (response.status === 429) throw new Error(msg);
             if (response.status === 401) throw new Error(msg);
             if (response.status === 400) throw new Error(msg);
             console.error('Icon generation failed:', msg);
             return null;
          }

          const data = await response.json();
          
          if (data.debug && data.debug.trace) {
            console.log('🎨 [Auto] Icon Generation Trace:', data.debug.trace);
          }

          if (data.url) {
            setIconPreview(data.url);
            const res = await fetch(data.url);
            const blob = await res.blob();
            const file = new File([blob], 'icon.png', { type: 'image/png' });
            setIconFile(file);
            setFirstIconGenerationComplete(true); // 标记首次图标生成完成
            return data.url;
          }
          return null;
        } catch (err: any) {
          console.error('Auto icon generation failed', err);
          if (err.message && (err.message.includes('Rate limit') || err.message.includes('too long'))) {
             toastError(err.message);
          }
          return null;
        }
      };

      // Create promises with side effects to update UI immediately
      // If preComputedData exists, use it directly
      // [Refactored] Merged into analyzeMetadata to reduce API calls
      /*
      const titlePromise = ...
      const descPromise = ...
      const promptPromise = ...
      */

      
      // 分批执行分析任务，避免同时发送过多请求导致 504 超时
      
      // 0. 安全检查 (独立运行)
      const securityPromise = runTask(0, checkMaliciousCode(html));
      
      // 1. 元数据分析 (标题+描述+分类+标签)
      // 始终重新分析，确保每次上传都获取最新结果
      const metadataPromise = analyzeMetadata(html, language).then(result => {
        // 完成后同时标记 task 1 (标题描述) 和 task 2 (分类标签) 为完成
        if (analysisSessionIdRef.current === currentSessionId) {
          tasks[1].status = 'done'; // 标题描述
          tasks[2].status = 'done'; // 分类标签
          updateProgressUI();
        }
        return result;
      });

      // 第一批：安全检查 + 元数据 (2个并发)
      const [securityResult, metadata] = await Promise.all([
        securityPromise,
        metadataPromise
      ]);
      
      // 检查是否被中断
      if (analysisSessionIdRef.current !== currentSessionId) {
        console.log('Analysis result ignored due to reset/re-upload (batch 1)');
        return;
      }

      // 处理 Metadata 结果
      let titleRes = language === 'zh' ? '未命名作品' : 'Untitled';
      let descRes = '';
      let category = '工具';
      let techTags: string[] = [];

      if (metadata) {
          console.log('[AI Analysis] Metadata received:', { 
            title: metadata.title?.substring(0, 30), 
            desc: metadata.description?.substring(0, 30),
            category: metadata.category,
            tags: metadata.tags 
          });
          titleRes = metadata.title || titleRes;
          descRes = metadata.description || '';
          // 分类 key 映射（用于内部存储）
          const catMap: Record<string, string> = {
            'Game': 'game', '游戏': 'game', 'Games': 'game',
            'Utility': 'tool', '工具': 'tool', 'Tools': 'tool', 'Utilities': 'tool',
            'Productivity': 'productivity', '效率': 'productivity',
            'Education': 'education', '教育': 'education',
            'Lifestyle': 'lifestyle', '生活': 'lifestyle',
            'Visualization': 'visualization', '可视化': 'visualization',
            'DevTool': 'devtool', '开发者工具': 'devtool',
            'Portfolio': 'portfolio', '个人主页': 'portfolio',
            'Appointment': 'appointment', '服务预约': 'appointment',
            'AI': 'tool', 'AI应用': 'tool',
            'Entertainment': 'entertainment', '娱乐': 'entertainment'
          };
          // 分类显示名称映射（用于 UI 显示）
          const catDisplayMap: Record<string, string> = {
            'game': language === 'zh' ? '游戏' : 'Game',
            'tool': language === 'zh' ? '工具' : 'Tool',
            'productivity': language === 'zh' ? '效率' : 'Productivity',
            'education': language === 'zh' ? '教育' : 'Education',
            'lifestyle': language === 'zh' ? '生活' : 'Lifestyle',
            'visualization': language === 'zh' ? '可视化' : 'Visualization',
            'devtool': language === 'zh' ? '开发者工具' : 'DevTool',
            'portfolio': language === 'zh' ? '个人主页' : 'Portfolio',
            'appointment': language === 'zh' ? '服务预约' : 'Appointment',
            'entertainment': language === 'zh' ? '娱乐' : 'Entertainment'
          };
          const rawCat = metadata.category || '工具';
          const categoryKey = catMap[rawCat] || 'tool';
          category = catDisplayMap[categoryKey] || (language === 'zh' ? '工具' : 'Tool');
          techTags = metadata.tags || [];

          // 始终设置标题和描述（不再检查 preComputedData）
          if (analysisSessionIdRef.current === currentSessionId) {
              setTitle(titleRes);
              setDescription(descRes);
              console.log('[AI Analysis] Title and Description set:', titleRes, descRes.substring(0, 30));
          }
      } else {
          console.warn('[AI Analysis] No metadata received!');
      }

      // 第二批：Prompt + 移动端优化 (2个并发)
      console.log('[AI Analysis] Starting Prompt analysis...');
      const promptPromise = analyzePrompt(html, language).then(res => {
        console.log('[AI Analysis] Prompt result:', res?.substring(0, 100));
        if (analysisSessionIdRef.current === currentSessionId) {
          setPrompt(res || (language === 'zh' ? '创建一个具有现代 UI 的 Web 应用。' : 'Create a web application with modern UI.'));
        }
        return res;
      }).catch(err => {
        console.error('[AI Analysis] Prompt analysis failed:', err);
        return language === 'zh' ? '创建一个具有现代 UI 的 Web 应用。' : 'Create a web application with modern UI.';
      });
      
      const [promptRes, mobileResult] = await Promise.all([
        runTask(3, promptPromise),  // index 3 = prompt
        runTask(4, optimizeMobileCode(html)),  // index 4 = mobile
      ]);
      
      // 检查是否被中断
      if (analysisSessionIdRef.current !== currentSessionId) {
        console.log('Analysis result ignored due to reset/re-upload (batch 2)');
        return;
      }
      
      // 第三批：App类型分析、图标生成（2个并发）
      const [appTypes, iconRes] = await Promise.all([
        analyzeAppType(html),
        runTask(5, generateIconTask(Promise.resolve(titleRes), Promise.resolve(descRes)))  // index 5 = icon
      ]);
      
      console.log('[AI Analysis] Final Prompt value:', promptRes?.substring(0, 100));

      // Final check before updating state
      if (analysisSessionIdRef.current !== currentSessionId) {
        console.log('Analysis result ignored due to reset/re-upload');
        return;
      }

      const combinedTags = Array.from(new Set([category, ...appTypes, ...techTags, 'AI Verified'])).filter(t => t);

      // Update Form Data
      // Title, Description, and Prompt are already updated via individual promise callbacks
      setTags(combinedTags);

      // Apply Mobile Optimization if needed
      if (mobileResult.wasOptimized) {
        setFileContent(mobileResult.optimizedHtml);
      }

      // Track if code has backend integration
      const hasBackend = securityResult.hasBackendCode || false;
      setHasBackendCode(hasBackend);
      
      // If has backend code, force private sharing
      if (hasBackend) {
        setIsPublic(false);
      }

      // Update UI based on Security Result
      if (securityResult.isSafe) {
        setIsSecuritySafe(true);
        setAnalysisState({
          status: 'success',
          data: {
            category,
            title: titleRes,
            tags: appTypes,
            techTagsCount: techTags.length,
            mobileOptimized: mobileResult.wasOptimized,
            iconUrl: iconRes
          }
        });
      } else {
        setIsSecuritySafe(false);
        setAnalysisState({
          status: 'risk',
          data: {
            risks: securityResult.risks,
            severity: securityResult.severity
          }
        });
      }

    } catch (error: any) {
      console.error(error);
      
      // Handle specific errors
      if (error.message && (
        error.message.includes('Rate limit') || 
        error.message.includes('Unauthorized') || 
        error.message.includes('too long')
      )) {
        toastError(error.message);

        if (error.message.includes('Unauthorized')) {
          openLoginModal();
        }

        setAnalysisState({
          status: 'error',
          message: `Request denied: ${error.message}`
        });
      } else {
        setAnalysisState({
          status: 'error',
          message: t.upload.analysis_error
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Normalize uploaded code for better patch compatibility
  const normalizeCode = (code: string): string => {
    let normalized = code;
    
    // 1. Normalize line endings (CRLF -> LF)
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 2. Trim trailing whitespace on each line (but preserve indentation)
    normalized = normalized.split('\n').map(line => line.trimEnd()).join('\n');
    
    // 3. Ensure consistent indentation (convert tabs to 2 spaces)
    normalized = normalized.replace(/\t/g, '  ');
    
    // 4. Remove excessive blank lines (max 2 consecutive)
    normalized = normalized.replace(/\n{4,}/g, '\n\n\n');
    
    // 5. Ensure file ends with single newline
    normalized = normalized.trimEnd() + '\n';
    
    console.log('[Upload] Code normalized for better patch compatibility');
    return normalized;
  };

  const handleEditInCreator = () => {
    if (!fileContent) return;
    
    // Stop any ongoing analysis immediately
    if (isAnalyzing) {
      console.log('[Upload] User clicked Edit Code, stopping analysis...');
      analysisSessionIdRef.current += 1; // Invalidate current session
      setIsAnalyzing(false);
      setAnalysisState({ status: 'idle' });
    }
    
    // Normalize the code before passing to creator
    const normalizedCode = normalizeCode(fileContent);
    localStorage.setItem('spark_upload_import', normalizedCode);
    // Mark this as a fresh upload (for first-edit optimization)
    localStorage.setItem('spark_upload_fresh', 'true');
    // Clear any existing creation session to ensure we start fresh with the uploaded code
    localStorage.removeItem('spark_create_session_v1');
    
    if (editId) {
      router.push(`/create?from=upload&edit=${editId}`);
    } else {
      router.push('/create?from=upload');
    }
  };

  const handlePublish = async () => {
    if (!title || !description) {
      toastError(t.upload.fill_title_desc);
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    let interval: NodeJS.Timeout | undefined;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t.upload.login_required);

      // Calculate Hash (needed for storage)
      const contentHash = await calculateContentHash(fileContent);

      // Use cached embedding from early detection if available
      const finalEmbedding = embedding;

      // Check daily limit (10 posts per day) - 只对新发布检查，编辑和更新不算
      if (!isEditing && !isUpdating) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        const { count, error: countError } = await supabase
          .from('items')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', session.user.id)
          .gte('created_at', todayStr);

        if (countError) {
          console.error('Error checking daily limit:', countError);
        } else if (count !== null && count >= 1000) { // 临时解除限制：从 10 改为 1000
          setShowLimitModal(true);
          setLoading(false);
          return;
        }
      }

      // Simulate progress
      interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return 90;
          return prev + Math.random() * 10;
        });
      }, 500);

      // Inject Watermark
      let watermarkedContent = injectWatermark(fileContent);

      // If public publish with backend code, strip the backend code for safety
      if (isPublic && hasBackendCode) {
        watermarkedContent = removeSparkBackendCode(watermarkedContent);
      }
      
      // 🚀 性能优化: 服务端预编译 JSX
      // 将 <script type="text/babel"> 编译为普通 JS，移除 1.4MB 的 Babel standalone
      let compiledContent: string | null = null;
      try {
        const compileRes = await fetch('/api/compile-jsx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: watermarkedContent })
        });
        
        if (compileRes.ok) {
          const compileData = await compileRes.json();
          if (compileData.success && compileData.wasCompiled) {
            compiledContent = compileData.compiled;
            console.log('[JSX Pre-compile] Success, saved', compileData.stats?.savedBytes, 'bytes');
          }
        }
      } catch (e) {
        console.warn('[JSX Pre-compile] Failed, will use original content:', e);
      }
      
      // Recalculate hash based on the final content to be stored
      // This ensures the hash in DB matches the content in DB (important for duplicate detection)
      const finalContentHash = await calculateContentHash(watermarkedContent);

      // Upload Icon if exists
      let iconUrl = null;

      // Ensure iconFile is set if we have a preview but no file (e.g. user clicked publish too fast after auto-generation)
      let fileToUpload = iconFile;
      if (!fileToUpload && iconPreview && iconPreview.startsWith('http')) {
          try {
              const res = await fetch(iconPreview);
              const blob = await res.blob();
              fileToUpload = new File([blob], 'icon.png', { type: 'image/png' });
          } catch (e) {
              console.warn('Failed to convert icon preview to file on publish', e);
          }
      }

      if (fileToUpload) {
        // 🚀 图片压缩优化：将大 PNG 转为 WebP（724KB → ~50KB）
        try {
          fileToUpload = await smartCompressImage(fileToUpload, {
            maxWidth: 512,
            maxHeight: 512,
            quality: 0.85,
            format: 'webp',
            maxSizeKB: 100  // 超过 100KB 才压缩
          });
        } catch (e) {
          console.warn('Failed to compress icon, using original:', e);
        }
        
        const fileExt = fileToUpload.name.split('.').pop() || 'webp';
        const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('icons')
          .upload(fileName, fileToUpload);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('icons')
          .getPublicUrl(fileName);
          
        iconUrl = publicUrl;
      }

      let data, error;

      if ((isEditing && editId) || (isUpdating && updateId)) {
        // Update existing item (编辑模式或更新模式)
        const itemIdToUpdate = editId || updateId;
        const updateData: any = {
          title,
          description,
          content: watermarkedContent,
          price: priceType === 'free' ? 0 : price,
          tags,
          prompt,
          is_public: isPublic
        };
        if (iconUrl) updateData.icon_url = iconUrl;
        if (finalEmbedding) updateData.embedding = finalEmbedding;
        
        // 🚀 添加预编译内容（如果编译成功）
        // if (compiledContent) {
        //   updateData.compiled_content = compiledContent;
        // }
        
        // Update hash as well
        updateData.content_hash = finalContentHash;

        let result = await supabase.from('items').update(updateData).eq('id', itemIdToUpdate).select().single();
        
        // Fallback: If any error occurs (likely missing columns), try without new schema fields
        if (result.error) {
          console.warn('Update failed, retrying with safe payload...', result.error);
          
          // Create a minimal safe payload without potentially missing columns
          const { embedding, is_public, ...safeData } = updateData;
          
          // Try updating without embedding and is_public
          result = await supabase.from('items').update(safeData).eq('id', itemIdToUpdate).select().single();
          
          if (!result.error) {
            toastError(t.upload.db_warning || 'Database schema update required for full features');
          }
        }

        data = result.data;
        error = result.error;
      } else {
        // Create new item
        const insertPayload: Record<string, any> = {
          title,
          description,
          content: watermarkedContent,
          price: priceType === 'free' ? 0 : price,
          author_id: session.user.id,
          tags,
          prompt,
          is_public: isPublic,
          color: 'from-blue-500 to-cyan-500',
          likes: 0,
          page_views: 0,
          downloads: 0,
          icon_url: iconUrl,
          content_hash: finalContentHash,
          embedding: finalEmbedding
        };
        
        // 🚀 添加预编译内容（如果编译成功）
        // if (compiledContent) {
        //   insertPayload.compiled_content = compiledContent;
        // }

        let result = await supabase.from('items').insert(insertPayload).select().single();

        // Fallback: If embedding column is missing, try inserting without it
        if (result.error) {
          console.warn('Insert failed, retrying without embedding/is_public...', result.error);
          
          // Create a clean payload without potentially missing columns
          const { embedding, is_public, ...fallbackPayload } = insertPayload;
          
          // Try inserting without embedding and is_public first (safest)
          result = await supabase.from('items').insert(fallbackPayload).select().single();
          
          if (!result.error) {
             toastError(t.upload.db_warning || 'Database schema update required for full features');
          } else {
             // If it still fails, try with is_public but without embedding
             const { embedding, ...fallbackPayloadWithPublic } = insertPayload;
             result = await supabase.from('items').insert(fallbackPayloadWithPublic).select().single();
          }
        }

        data = result.data;
        error = result.error;
      }

      if (error) {
        // Handle 409 Conflict specifically
        if (error.code === '23505' || error.message.includes('409')) {
           throw new Error(t.upload.title_exists);
        }
        throw error;
      }

      clearInterval(interval);
      setUploadProgress(100);
      const itemId = isEditing && editId ? editId : data.id;
      setPublishedId(itemId);
      // 设置私密分享 token（新作品由数据库触发器自动生成）
      if (data.share_token) {
        setPublishedShareToken(data.share_token);
      }

      // 触发 AI 评分（后台异步，不阻塞用户）
      if (itemId) {
        fetch('/api/score-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId })
        }).catch(err => console.warn('评分触发失败:', err));
        
        // 自动生成封面截图（后台异步，不阻塞用户）
        generateCoverScreenshot(itemId, watermarkedContent).catch(err => 
          console.warn('封面截图生成失败:', err)
        );
      }

      // Clear creation session cache on successful publish
      localStorage.removeItem('spark_create_session_v1');
      localStorage.removeItem('spark_generated_code');
      localStorage.removeItem('spark_generated_meta');
      localStorage.removeItem('spark_upload_import');

      setTimeout(() => {
        setLoading(false);
        setStep(4);
      }, 500);

    } catch (error: any) {
      clearInterval(interval);
      toastError(t.upload.publish_fail + error.message);
      setLoading(false);
    }
  };

  const addTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const copyShareLink = async () => {
    if (!publishedId) return;
    // 优先使用 share_token（更安全），否则使用 ID
    const shareId = publishedShareToken || publishedId;
    const url = `${window.location.origin}/p/${shareId}?mode=app`;
    const success = await copyToClipboard(url);
    if (success) {
      toastSuccess(t.upload.copy_link);
    } else {
      toastError(t.upload.copy_fail);
    }
  };

  const goToDetail = () => {
    if (publishedId) {
      // 详情页跳转仍用 ID（方便作者管理）
      router.push(`/p/${publishedId}`);
    }
  };

  return (
    <div className="min-h-screen pt-24 px-4 pb-32 md:pb-20 relative">
      {/* Fixed background - ensures full coverage on all devices */}
      <div className="fixed inset-0 bg-black -z-10" />
      
      <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <i className={`fa-solid ${isUpdating ? 'fa-arrow-up-from-bracket' : isEditing ? 'fa-pen-to-square' : 'fa-cloud-arrow-up'} text-white text-lg`}></i>
        </div>
        {isUpdating 
          ? (t.upload?.update_title || '更新作品') 
          : isEditing 
            ? t.upload.edit_title 
            : t.upload.title}
      </h1>

      {/* 更新模式提示 */}
      {isUpdating && (
        <div className="mb-6 rounded-2xl p-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
          <div className="bg-zinc-900/50 backdrop-blur-md rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-sync text-xl text-emerald-400"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white mb-0.5">{t.upload?.update_mode || '更新模式'}</h3>
              <p className="text-xs text-slate-300">{t.upload?.update_desc || '上传新文件将替换当前作品内容，标题和描述等信息会保留'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-12 relative px-4">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-white/10 -z-10"></div>
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`relative flex flex-col items-center gap-2 bg-black px-2`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 border-2 ${
              step >= s 
                ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                : 'bg-zinc-900 text-slate-600 border-white/10'
            }`}>
              {step > s ? <i className="fa-solid fa-check"></i> : s}
            </div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <>
          <div 
            className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-12 text-center transition-all duration-300 hover:border-indigo-500/50 hover:bg-white/10 cursor-pointer group"
            onClick={() => {
              if (!user) {
                openLoginModal();
                return;
              }
              fileInputRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".html,text/html" 
              onChange={handleFileSelect} 
            />
            <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-8 group-hover:scale-110 transition duration-300 border border-white/10 shadow-xl">
              <i className="fa-solid fa-cloud-arrow-up text-4xl text-indigo-500 group-hover:text-indigo-400 transition-colors"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">{t.upload.drag_drop_title}</h3>
            <p className="text-slate-400 max-w-md mx-auto leading-relaxed">{t.upload.drag_drop_desc}</p>
          </div>
          {isEditing && fileContent && (
            <div className="text-center mt-6">
              <button 
                onClick={(e) => { e.stopPropagation(); setStep(2); }}
                className="text-slate-500 hover:text-white text-sm transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                <i className="fa-solid fa-arrow-left"></i> {t.upload.cancel_reupload}
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 2: Preview */}
      {step === 2 && (
        <div className="space-y-8">
          
          {/* Validation Overlay */}
          {validationState.status === 'validating' && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
                <div className="text-center space-y-6 animate-pulse">
                    <div className="w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_20px_rgba(99,102,241,0.3)]"></div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">{t.upload.validating_code || 'Verifying Application...'}</h3>
                      <p className="text-slate-400">{t.upload.validating_desc || 'Checking for runtime errors and rendering issues.'}</p>
                    </div>
                </div>
                {/* Hidden Validation Iframe */}
                <iframe 
                    srcDoc={getValidationContent(fileContent)}
                    className="fixed top-0 left-0 w-[100px] h-[100px] opacity-0 pointer-events-none -z-50"
                    sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
                />
             </div>
          )}

          {/* Validation Error Modal */}
          {validationState.status === 'error' && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
                <div className="bg-zinc-900 border border-red-500/30 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-red-500/5 pointer-events-none"></div>
                    <div className="relative z-10">
                      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                          <i className="fa-solid fa-bug text-4xl text-red-500"></i>
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">{t.upload.validation_failed || 'Validation Failed'}</h3>
                      <p className="text-slate-400 mb-6">
                          {t.upload.validation_failed_desc || 'The application cannot be uploaded because it has serious errors or renders a blank screen.'}
                      </p>
                      
                      <div className="bg-black/50 rounded-xl p-4 text-left mb-6 border border-red-500/20 overflow-auto max-h-40 custom-scrollbar">
                          <div className="text-xs text-red-400 font-bold uppercase mb-2 flex items-center gap-2">
                            <i className="fa-solid fa-terminal"></i> {language === 'zh' ? '错误详情' : 'Error Details'}
                          </div>
                          <code className="text-sm text-red-200 font-mono break-words block">
                              {validationState.error}
                          </code>
                          {validationState.details && validationState.details.stack && (
                              <pre className="text-xs text-slate-500 mt-2 whitespace-pre-wrap break-all font-mono">
                                  {validationState.details.stack}
                              </pre>
                          )}
                      </div>

                      {/* AI Fix Hint */}
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mb-8 text-left flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <i className="fa-solid fa-wand-magic-sparkles"></i>
                          </div>
                          <div>
                            <div className="font-bold text-indigo-300 text-sm mb-0.5">{language === 'zh' ? 'AI 智能修复' : 'AI Smart Fix'}</div>
                            <p className="text-slate-400 text-xs">
                                {language === 'zh' 
                                    ? '前往创作页面，使用 AI 修复功能可以自动修复代码错误' 
                                    : 'Go to the creator page and use AI Fix to automatically repair code errors'}
                            </p>
                          </div>
                      </div>

                      <div className="flex gap-3">
                          {hasBackendCode && (
                            <button 
                                onClick={() => setShowBackendPanel(true)}
                                className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition border border-white/10 flex items-center gap-2"
                            >
                                <i className="fa-solid fa-database"></i>
                            </button>
                          )}
                          <button 
                              onClick={handleEditInCreator}
                              className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold transition shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                          >
                              <i className="fa-solid fa-wand-magic-sparkles"></i>
                              {language === 'zh' ? '前往修复' : 'Go to Fix'}
                          </button>
                          <button 
                              onClick={handleReset}
                              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition border border-white/5"
                          >
                              {t.upload.cancel_upload || 'Cancel'}
                          </button>
                      </div>
                    </div>
                </div>
             </div>
          )}

          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <i className="fa-solid fa-mobile-screen-button text-indigo-500"></i> {t.upload.preview_effect}
            </h2>
          </div>

          <div className="w-full h-[850px] bg-zinc-900/50 rounded-3xl overflow-hidden border border-white/5 relative flex justify-center items-center group p-8 backdrop-blur-sm">
             <div 
                className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-black flex-shrink-0 ${
                  previewMode === 'desktop' 
                    ? 'w-full h-full rounded-2xl border border-white/10' 
                    : previewMode === 'tablet'
                      ? 'w-[768px] h-[95%] rounded-[1.5rem] border-[12px] border-zinc-800 ring-1 ring-white/10 shadow-2xl'
                      : 'w-[375px] h-[812px] rounded-[2.5rem] border-[10px] border-zinc-800 ring-1 ring-white/10 shadow-2xl'
                }`}
              >
                {/* Mobile Notch */}
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 bg-zinc-800 z-20 transition-all duration-300 ${
                    previewMode === 'mobile' ? 'w-24 h-6 rounded-b-xl opacity-100' : 'w-0 h-0 opacity-0'
                }`}></div>

                <iframe 
                  srcDoc={getPreviewContent(fileContent, { raw: true })} 
                  className="w-full h-full border-0 bg-white" 
                  sandbox="allow-scripts allow-pointer-lock allow-modals allow-forms allow-popups allow-downloads allow-same-origin"
                  allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay; payment; fullscreen; picture-in-picture"
                />
              </div>

              {/* Preview Controls */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition duration-300 z-10 translate-y-2 group-hover:translate-y-0">
                <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-full p-1.5 flex shadow-xl">
                  <button onClick={() => setPreviewMode('desktop')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-desktop"></i></button>
                  <button onClick={() => setPreviewMode('tablet')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-tablet-screen-button"></i></button>
                  <button onClick={() => setPreviewMode('mobile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-mobile-screen"></i></button>
                </div>
              </div>
          </div>

          {/* Duplicate Check Status */}
          {isCheckingDuplicate && (
            <div className="rounded-2xl p-6 mb-6 border border-orange-500/20 bg-orange-500/5 backdrop-blur-sm">
              <div className="flex items-center gap-4 text-orange-400">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <i className="fa-solid fa-shield-halved fa-pulse"></i>
                </div>
                <div className="flex-grow">
                  <div className="font-bold">{t.upload.checking_duplicates}</div>
                  <div className="text-xs text-orange-400/60 mt-1">
                    {t.upload.checking_originality}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Detected Warning */}
          {!isCheckingDuplicate && isDuplicateRestricted && (
            <div className="rounded-2xl p-6 mb-6 border border-red-500/20 bg-red-500/5 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="flex items-center gap-4 text-red-400">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 border border-red-500/20">
                  <i className="fa-solid fa-triangle-exclamation text-xl"></i>
                </div>
                <div className="flex-grow">
                  <div className="font-bold text-lg">{t.upload.duplicate_detected}</div>
                  <div className="text-sm text-red-400/80 mt-1">
                    {t.upload.duplicate_desc}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis Status */}
          <div className="rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 mb-8">
            <div id="ai-analysis-status" className="text-sm">
              {analysisState.status === 'analyzing' && (
                <div className="relative overflow-hidden">
                  {/* Background Grid Animation */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none"></div>
                  
                  <div className="relative z-10 pt-2">
                    {/* Header with Pulse */}
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                            <i className="fa-solid fa-microchip text-2xl text-indigo-400 animate-pulse"></i>
                          </div>
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black animate-ping"></div>
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black"></div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                            {t.upload.ai_analyzing}
                            <span className="text-indigo-400 font-mono">{analysisState.progress}%</span>
                          </div>
                          <div className="text-xs text-indigo-300/60 font-mono uppercase tracking-wider">
                            {t.upload.neural_engine_active}
                          </div>
                        </div>
                      </div>
                      
                      {/* Tech Decoration */}
                      <div className="hidden md:flex gap-1">
                        {[1,2,3].map(i => (
                          <div key={i} className={`w-1 h-6 rounded-full ${i === 1 ? 'bg-indigo-500' : 'bg-indigo-500/20'} animate-pulse`} style={{animationDelay: `${i * 0.2}s`}}></div>
                        ))}
                      </div>
                    </div>

                    {/* Main Progress Bar */}
                    <div className="mb-8 relative">
                      <div className="flex justify-between text-xs text-slate-400 mb-2 font-mono">
                        <span>{t.upload.initializing}</span>
                        <span>{t.upload.processing}</span>
                        <span>{t.upload.completing}</span>
                      </div>
                      <div className="w-full bg-zinc-900/80 h-3 rounded-full overflow-hidden border border-white/5 relative">
                        {/* Moving Gradient Bar */}
                        <div 
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-400 transition-all duration-500 ease-out shadow-[0_0_20px_rgba(99,102,241,0.5)]" 
                          style={{ width: `${analysisState.progress}%` }}
                        >
                          {/* Shimmer Effect */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -translate-x-full animate-shimmer"></div>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Task Grid */}
                    <div className="grid grid-cols-2 gap-3 md:gap-4 mb-8">
                      {analysisState.tasks?.map((task, index) => {
                        const isCompleted = task.status !== 'pending';
                        const firstPendingIndex = analysisState.tasks?.findIndex(t => t.status === 'pending');
                        const isProcessing = index === firstPendingIndex;
                        
                        return (
                        <div 
                          key={task.id} 
                          className={`relative overflow-hidden rounded-xl border transition-all duration-500 ${
                            isCompleted 
                              ? 'bg-emerald-500/5 border-emerald-500/20' 
                              : isProcessing
                                ? 'bg-indigo-500/5 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                                : 'bg-zinc-900/30 border-white/5 opacity-50'
                          }`}
                        >
                          <div className="p-3 md:p-4 flex items-center gap-2 md:gap-4">
                            <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-xs md:text-sm transition-colors flex-shrink-0 ${
                              isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 
                              isProcessing ? 'bg-indigo-500/20 text-indigo-400' : 
                              'bg-white/5 text-slate-500'
                            }`}>
                              {isCompleted ? <i className="fa-solid fa-check"></i> :
                               isProcessing ? <i className="fa-solid fa-circle-notch fa-spin"></i> :
                               <span className="font-mono text-[10px] md:text-xs">{index + 1}</span>}
                            </div>
                            <div className="flex-grow min-w-0">
                              <div className={`font-medium text-xs md:text-sm truncate ${
                                isCompleted ? 'text-emerald-200' :
                                isProcessing ? 'text-indigo-200' :
                                'text-slate-500'
                              }`}>
                                {t.upload[`task_${task.id}` as keyof typeof t.upload] || task.label}
                              </div>
                              {isProcessing && (
                                <div className="text-[10px] text-indigo-400/60 font-mono mt-0.5 md:mt-1 animate-pulse truncate">
                                  &gt; {t.upload.executing_module}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Progress Line for active task */}
                          {isProcessing && (
                            <div className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 animate-pulse w-full"></div>
                          )}
                        </div>
                        );
                      })}
                    </div>

                    {/* Terminal / Log Section */}
                    <div className="bg-black/40 rounded-xl border border-white/10 p-4 font-mono text-xs h-32 overflow-hidden relative">
                      <div className="absolute top-2 right-2 flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                        <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                        <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
                      </div>
                      <div className="space-y-1.5 text-slate-400">
                        <div className="text-emerald-500/80">
                          <span className="mr-2">[{new Date().toLocaleTimeString()}]</span>
                          <span>{t.upload.system_initialized}</span>
                        </div>
                        <div className="text-indigo-400/80">
                          <span className="mr-2">[{new Date().toLocaleTimeString()}]</span>
                          <span>{t.upload.loading_modules}</span>
                        </div>
                        {analysisState.tasks?.filter(t => t.status !== 'pending').map(task => (
                           <div key={task.id} className="text-slate-300">
                             <span className="mr-2 text-slate-600">[{new Date().toLocaleTimeString()}]</span>
                             <span>{t.upload.completed_task}{t.upload[`task_${task.id}` as keyof typeof t.upload] || task.label}</span>
                           </div>
                        ))}
                        {(() => {
                           const processingTask = analysisState.tasks?.find(t => t.status === 'pending');
                           if (processingTask) {
                             return (
                               <div className="text-indigo-300 animate-pulse">
                                 <span className="mr-2 text-indigo-500/50">[{new Date().toLocaleTimeString()}]</span>
                                 <span>&gt; {t.upload[`task_${processingTask.id}` as keyof typeof t.upload] || processingTask.label}...</span>
                                 <span className="inline-block w-1.5 h-3 bg-indigo-500 ml-1 animate-blink"></span>
                               </div>
                             );
                           }
                           return null;
                        })()}
                      </div>
                      {/* Scanline effect */}
                      <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[size:100%_4px] pointer-events-none opacity-20"></div>
                    </div>

                    {/* Fun Fact / Tip */}
                    <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 bg-white/5 py-2 rounded-full border border-white/5">
                      <i className="fa-solid fa-lightbulb text-yellow-500/50"></i>
                      <span>{t.upload.ai_deep_analysis_tip}</span>
                    </div>
                  </div>
                </div>
              )}

              {analysisState.status === 'success' && analysisState.data && (
                <>
                  <div className="flex items-center gap-4 text-emerald-400 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
                      <i className="fa-solid fa-circle-check text-2xl"></i>
                    </div>
                    <div className="flex-grow">
                      <div className="font-bold text-lg text-white">{analysisState.message || t.upload.ai_complete}</div>
                      <div className="text-sm text-slate-400 mt-1">{t.upload.security_pass}</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
                      <div className="text-xs text-emerald-400 mb-2 font-bold uppercase tracking-wider"><i className="fa-solid fa-tag mr-1"></i> {t.upload.result_category}</div>
                      <div className="font-bold text-white text-lg">{analysisState.data.category ? ((t.categories as any)[analysisState.data.category] || analysisState.data.category) : ''}</div>
                    </div>
                    <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
                      <div className="text-xs text-emerald-400 mb-2 font-bold uppercase tracking-wider"><i className="fa-solid fa-heading mr-1"></i> {t.upload.result_title}</div>
                      <div className="font-bold text-white text-lg truncate">{analysisState.data.title}</div>
                    </div>
                    <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 col-span-2">
                      <div className="text-xs text-indigo-400 mb-2 font-bold uppercase tracking-wider"><i className="fa-solid fa-hashtag mr-1"></i> {t.upload.result_tags}</div>
                      <div className="font-bold text-white flex flex-wrap gap-2">
                        {analysisState.data.tags?.map((t, i) => (
                          <span key={i} className="text-indigo-300 border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 rounded-lg text-sm">{t}</span>
                        ))}
                        <span className="text-slate-500 text-xs self-center bg-white/5 px-2 py-1 rounded-lg">+ {analysisState.data.techTagsCount} {t.upload.result_tech}</span>
                      </div>
                    </div>
                    {analysisState.data.mobileOptimized && (
                      <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 col-span-2">
                        <div className="text-xs text-purple-400 mb-2 font-bold uppercase tracking-wider"><i className="fa-solid fa-mobile-screen mr-1"></i> {t.upload.result_mobile}</div>
                        <div className="font-bold text-white text-sm">{t.upload.result_mobile_desc}</div>
                      </div>
                    )}
                    {analysisState.data.iconUrl && (
                      <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 col-span-2 flex items-center gap-4">
                        <img src={analysisState.data.iconUrl} className="w-14 h-14 rounded-xl border border-white/10 shadow-lg" alt="Generated Icon" />
                        <div>
                          <div className="text-xs text-purple-400 mb-1 font-bold uppercase tracking-wider"><i className="fa-solid fa-icons mr-1"></i> {t.upload.result_icon}</div>
                          <div className="font-bold text-white text-sm">{t.upload.result_icon_desc}</div>
                        </div>
                      </div>
                    )}
                    <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 col-span-2">
                      <div className="text-xs text-emerald-400 mb-2 font-bold uppercase tracking-wider"><i className="fa-solid fa-shield-halved mr-1"></i> {t.upload.result_security}</div>
                      <div className="font-bold text-white">{t.upload.result_safe}</div>
                    </div>
                    {hasBackendCode && (
                      <div className="bg-amber-900/10 border border-amber-500/20 rounded-xl p-4 col-span-2">
                        <div className="text-xs text-amber-400 mb-2 font-bold uppercase tracking-wider"><i className="fa-solid fa-server mr-1"></i> {language === 'zh' ? '检测到后端集成' : 'Backend Integration Detected'}</div>
                        <div className="text-sm text-amber-200/80">{language === 'zh' ? '作品包含 Spark 平台后端代码，发布后仅支持私有分享以保护数据安全' : 'This work contains Spark platform backend code. It will be published as private-only to protect data security.'}</div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {analysisState.status === 'risk' && analysisState.data && (
                <>
                  <div className="flex items-center gap-4 text-red-400 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 border border-red-500/20">
                      <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
                    </div>
                    <div className="flex-grow">
                      <div className="font-bold text-lg text-white">{t.upload.security_risk}</div>
                      <div className="text-sm text-red-400 mt-1">{t.upload.risk_severity} {(analysisState.data.severity || 'UNKNOWN').toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="mt-4 bg-red-950/30 border border-red-500/20 rounded-xl p-6">
                    <div className="text-sm font-bold text-red-400 mb-3 uppercase tracking-wider">{t.upload.risk_list}</div>
                    <ul className="space-y-2">
                      {analysisState.data.risks?.map((risk, i) => (
                        <li key={i} className="text-sm text-red-200 flex items-start gap-2">
                          <i className="fa-solid fa-circle-exclamation mt-1 text-xs opacity-70"></i>
                          {risk}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 pt-4 border-t border-red-500/20 text-xs text-red-400/60">{t.upload.risk_block}</div>
                  </div>
                </>
              )}

              {analysisState.status === 'error' && (
                <div className="flex items-center gap-4 text-red-400">
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 border border-red-500/20">
                    <i className="fa-solid fa-ban text-2xl"></i>
                  </div>
                  <div>
                    <div className="font-bold text-lg text-white">{t.upload.analysis_error}</div>
                    <div className="text-sm text-red-400/80 mt-1">{analysisState.message}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Metadata Form (Moved to Step 2) */}
          <div className="rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 space-y-6">
            <div className="flex items-center mb-2">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 mr-3">
                  <i className="fa-solid fa-pen-to-square text-xl"></i>
                </div>
                <h3 className="font-bold text-xl text-white">{t.upload.app_info}</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">{t.upload.app_title} <span className="text-indigo-400 text-xs ml-1">({t.upload.ai_auto_extract})</span></label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                    placeholder={t.upload.ai_analyzing_short}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">{t.upload.app_desc} <span className="text-indigo-400 text-xs ml-1">({t.upload.ai_auto_gen})</span></label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none transition-all"
                    placeholder={t.upload.ai_analyzing_short}
                  />
                </div>
              </div>

              {/* Icon Selection */}
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-400">{t.upload.app_icon}</label>
                <div className="flex gap-6 items-start">
                  <div className="flex-shrink-0">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden border border-white/10 shadow-lg relative group bg-zinc-900">
                      {iconPreview ? (
                        <img src={iconPreview} alt="Icon" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <i className="fa-solid fa-image text-2xl"></i>
                        </div>
                      )}
                      {/* Glossy Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
                    </div>
                    <div className="text-center mt-2 text-[10px] text-slate-500 font-medium uppercase tracking-wider">{t.upload.icon_preview}</div>
                  </div>

                  {/* Controls */}
                  <div className="flex-grow space-y-3">
                    {/* AI Generate */}
                    <button 
                      onClick={async () => {
                        if (!firstIconGenerationComplete) {
                          toastError(language === 'zh' ? '请等待首次自动图标生成完成' : 'Please wait for the first icon generation to complete');
                          return;
                        }
                        if (!description) {
                          toastError(t.upload.fill_desc_first);
                          return;
                        }
                        if (generationCount >= 3) {
                          toastError(t.upload.icon_gen_limit);
                          return;
                        }
                        
                        // Show confirmation dialog for manual generation (costs 2 credits)
                        const confirmMsg = language === 'zh' 
                          ? 'AI 将生成高清应用图标，此操作将消耗 2 积分，是否继续？' 
                          : 'AI will generate a high-quality app icon. This will cost 2 credits. Continue?';
                        
                        if (!confirm(confirmMsg)) return;
                        
                        setIsGeneratingIcon(true);
                        setGenerationCount(prev => prev + 1);
                        
                        try {
                          const response = await fetch('/api/generate-icon', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title, description, firstCall: false })
                          });
                          
                          if (!response.ok) {
                            const data = await response.json().catch(() => ({}));
                            const msg = data.error || `API Error: ${response.status}`;
                            const err: any = new Error(msg);
                            err.status = response.status;
                            throw err;
                          }

                          const data = await response.json();

                          if (data.debug && data.debug.trace) {
                            console.log('🎨 [Manual] Icon Generation Trace:', data.debug.trace);
                          }

                          if (data.url) {
                            setIconPreview(data.url);
                            // Convert data URL to File object for upload
                            const res = await fetch(data.url);
                            const blob = await res.blob();
                            const file = new File([blob], 'icon.png', { type: 'image/png' });
                            setIconFile(file);

                            // Update analysis state to reflect the new icon in the status panel
                            setAnalysisState(prev => ({
                              ...prev,
                              data: {
                                ...(prev.data || {}),
                                iconUrl: data.url
                              }
                            }));

                            toastSuccess(t.upload.icon_gen_success.replace('{n}', String(3 - (generationCount + 1))));
                          }
                        } catch (error: any) {
                          console.error('Icon generation failed', error);
                          if (error.status === 403 || error.message.includes('Insufficient credits')) {
                              openCreditPurchaseModal();
                          } else {
                              toastError(error.message || t.upload.icon_gen_fail);
                          }
                          // Revert count on failure if you want, but usually attempts are counted regardless
                          // setGenerationCount(prev => prev - 1); 
                        } finally {
                          setIsGeneratingIcon(false);
                        }
                      }}
                      disabled={!firstIconGenerationComplete || isGeneratingIcon || !description || generationCount >= 3}
                      className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                    >
                      {!firstIconGenerationComplete ? (
                        <><i className="fa-solid fa-hourglass-half"></i> {language === 'zh' ? '等待首次分析完成...' : 'Waiting for initial analysis...'}</>
                      ) : isGeneratingIcon ? (
                        <><i className="fa-solid fa-circle-notch fa-spin"></i> {t.upload.ai_generating}</>
                      ) : generationCount >= 3 ? (
                        <><i className="fa-solid fa-ban"></i> {t.upload.limit_reached}</>
                      ) : (
                        <><i className="fa-solid fa-wand-magic-sparkles"></i> {t.upload.ai_generate_icon} ({3 - generationCount}/3)</>
                      )}
                    </button>

                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="px-2 bg-zinc-900 text-slate-500">{t.upload.or}</span>
                      </div>
                    </div>

                    {/* Manual Upload */}
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setIconFile(file);
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setIconPreview(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <button className="w-full bg-zinc-800 hover:bg-zinc-700 text-slate-300 py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 border border-white/10">
                        <i className="fa-solid fa-upload"></i> {t.upload.upload_local}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 text-center">{t.upload.icon_size_hint}</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">{t.upload.prompt_label} <span className="text-indigo-400 text-xs ml-1">{t.upload.prompt_hint}</span></label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none transition-all font-mono text-sm"
                placeholder={t.upload.ai_analyzing_short}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">{t.upload.tags_label} <span className="text-indigo-400 text-xs ml-1">{t.upload.tags_hint}</span></label>
              <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
                {tags.length === 0 && isAnalyzing && <span className="text-xs text-slate-500 flex items-center gap-2"><i className="fa-solid fa-circle-notch fa-spin"></i> {t.upload.waiting_analysis}</span>}
                {tags.map(tag => (
                  <span key={tag} className="bg-zinc-800 border border-white/10 text-slate-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 group">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-slate-500 hover:text-white transition-colors"><i className="fa-solid fa-times"></i></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                  placeholder={t.upload.add_tag_placeholder}
                />
                <button onClick={addTag} className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold border border-white/10 transition-colors">{t.upload.add}</button>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4">
            <button onClick={handleReset} className="w-full md:w-auto px-6 py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors whitespace-nowrap">{t.upload.reupload}</button>
            
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full md:w-auto">
                <button 
                    onClick={handleEditInCreator}
                    className="flex-1 md:flex-none justify-center px-6 py-3 rounded-xl border border-indigo-500/30 text-indigo-400 hover:text-white hover:bg-indigo-500/10 transition flex items-center gap-2 font-medium whitespace-nowrap"
                >
                    <i className="fa-solid fa-pen-to-square"></i>
                    {t.upload.edit_code || (language === 'zh' ? '编辑代码' : 'Edit Code')}
                </button>

                <button 
                onClick={() => setStep(3)} 
                disabled={isAnalyzing || !isSecuritySafe}
                className={`flex-1 md:flex-none justify-center px-8 py-3 rounded-xl font-bold transition flex items-center gap-2 shadow-lg whitespace-nowrap ${
                    isAnalyzing || !isSecuritySafe 
                    ? 'bg-zinc-800 text-slate-500 cursor-not-allowed border border-white/5' 
                    : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/20'
                }`}
                >
                {isAnalyzing ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> {t.upload.analyzing_btn}</>
                ) : !isSecuritySafe ? (
                    <><i className="fa-solid fa-ban"></i> {t.upload.risk_btn}</>
                ) : (
                    <>{t.upload.next_step} <i className="fa-solid fa-arrow-right"></i></>
                )}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Publish Confirmation */}
      {step === 3 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8 md:mb-12">
             <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)] mb-4 md:mb-6 relative group">
                <div className="absolute inset-0 bg-white/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <i className="fa-solid fa-rocket text-3xl md:text-4xl text-white relative z-10"></i>
             </div>
             <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 tracking-tight">{language === 'zh' ? '准备发布' : 'Ready to Launch'}</h2>
             <p className="text-sm md:text-base text-slate-400">{language === 'zh' ? '最后确认您的作品信息与设置' : 'Final confirmation of your work settings'}</p>
          </div>

          {/* App Card */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-4 md:p-6 mb-8 flex flex-col md:flex-row gap-4 md:gap-6 items-center md:items-start backdrop-blur-sm">
             <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border border-white/10 shadow-lg flex-shrink-0 bg-zinc-800">
                {iconPreview ? (
                  <img src={iconPreview} alt="App Icon" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <i className="fa-solid fa-cube text-3xl text-slate-600"></i>
                  </div>
                )}
             </div>
             <div className="flex-1 text-center md:text-left min-w-0 w-full">
                <h3 className="text-xl font-bold text-white mb-2 truncate">{title || 'Untitled App'}</h3>
                <p className="text-slate-400 text-sm line-clamp-2 mb-3">{description || 'No description'}</p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                   {tags.map(tag => (
                      <span key={tag} className="px-2.5 py-1 bg-white/5 rounded-lg text-xs text-slate-300 border border-white/5">{tag}</span>
                   ))}
                </div>
             </div>
          </div>

          {/* Settings Panel */}
          <div className="bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden mb-8 shadow-2xl">
             {/* Visibility Setting */}
             <div className="p-4 md:p-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-4 gap-4">
                   <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-colors flex-shrink-0 ${isPublic ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'}`}>
                         <i className={`fa-solid ${isPublic ? 'fa-globe' : 'fa-lock'} text-lg md:text-xl`}></i>
                      </div>
                      <div className="min-w-0 flex-1">
                         <h4 className="text-white font-bold text-base md:text-lg truncate">{language === 'zh' ? '发布范围' : 'Visibility'}</h4>
                         <p className="text-xs md:text-sm text-slate-400 truncate">{isPublic ? (language === 'zh' ? '公开在 Spark 商店' : 'Public on Spark Store') : (language === 'zh' ? '仅通过链接访问' : 'Private Link Only')}</p>
                      </div>
                   </div>
                   
                   {/* Toggle Switch */}
                   <button 
                      onClick={() => !isDuplicateRestricted && setIsPublic(!isPublic)}
                      disabled={isDuplicateRestricted}
                      className={`relative w-14 h-8 md:w-16 md:h-9 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 focus:ring-indigo-500 flex-shrink-0 ${isPublic ? 'bg-indigo-600' : 'bg-zinc-700'} ${isDuplicateRestricted ? 'opacity-50 cursor-not-allowed' : ''}`}
                   >
                      <div className={`absolute top-1 left-1 w-6 h-6 md:w-7 md:h-7 bg-white rounded-full shadow-sm transition-transform duration-300 ${isPublic ? 'translate-x-6 md:translate-x-7' : 'translate-x-0'}`}></div>
                   </button>
                </div>

                {/* Backend Warning (if applicable) */}
                <AnimatePresence>
                  {hasBackendCode && isPublic && (
                     <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                     >
                       <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex gap-3">
                          <i className="fa-solid fa-info-circle text-indigo-400 mt-0.5 flex-shrink-0"></i>
                          <div className="text-sm text-indigo-200">
                             {language === 'zh' ? '公开版本将自动移除后端代码以保护安全。如需测试后端功能，请选择私密发布。' : 'Backend code will be removed in public version for security. Choose Private to test backend features.'}
                          </div>
                       </div>
                     </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Duplicate Warning */}
                {isDuplicateRestricted && (
                   <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 mt-3">
                      <i className="fa-solid fa-triangle-exclamation text-amber-400 mt-0.5 flex-shrink-0"></i>
                      <div className="text-sm text-amber-200">
                         {language === 'zh' ? '检测到重复内容，为保护原创，仅支持私有分享' : 'Duplicate content detected. Private sharing only.'}
                      </div>
                   </div>
                )}
             </div>


          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button 
               onClick={() => setStep(2)} 
               className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl font-bold transition border border-white/5"
            >
               {t.upload.prev_step}
            </button>
            <button 
              onClick={handlePublish} 
              disabled={loading}
              className="flex-1 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl font-bold transition shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:shadow-[0_0_50px_rgba(99,102,241,0.5)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              {loading ? (
                <><i className="fa-solid fa-circle-notch fa-spin"></i> {t.upload.publishing}</>
              ) : (
                <>
                   <span className="relative">{(isEditing || isUpdating) ? t.upload.confirm_modify : t.upload.confirm_publish}</span>
                   <i className="fa-solid fa-rocket group-hover:translate-x-1 transition-transform relative"></i>
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 4: Success - Share Card */}
      {step === 4 && (
        <div className="animate-float-up">
          {/* Hidden Capture Area - Same as ProductDetailClient */}
          <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
            <div 
              ref={shareRef} 
              className="flex w-[375px] flex-col relative overflow-hidden bg-slate-950 text-white"
              style={{ minHeight: '667px', fontFamily: 'sans-serif' }}
            >
              {/* Elegant Background */}
              <div className="absolute inset-0 bg-slate-950"></div>
              <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-black/50 to-transparent"></div>

              {/* Main Content */}
              <div className="relative z-10 flex flex-col h-full p-8">
                
                {/* Header: Brand */}
                <div className="flex items-center mb-6">
                  <img 
                    src={logoDataUrl || "/logo.png"} 
                    className="w-8 h-8 object-contain mix-blend-screen mt-5" 
                    alt="Logo" 
                    crossOrigin="anonymous"
                  />
                  <span className="font-bold text-xl tracking-tight text-white ml-3">Spark<span className="text-brand-500">Vertex</span> {language === 'zh' && '灵枢'}</span>
                </div>

                {/* App Icon - Centered & Elegant */}
                <div className="flex justify-center mb-6 mt-4">
                  <div className="w-40 h-40 rounded-[2.5rem] bg-gradient-to-br from-brand-500 to-blue-600 shadow-2xl shadow-brand-500/30 flex items-center justify-center relative overflow-hidden border border-white/10">
                    {iconPreview ? (
                      <img 
                        src={iconPreview} 
                        className="w-full h-full object-cover" 
                        alt="App Icon" 
                      />
                    ) : (
                      <i className="fa-solid fa-cube text-5xl text-white/80"></i>
                    )}
                  </div>
                </div>

                {/* Info Section */}
                <div className="mb-8">
                  <div className="flex items-center justify-center w-full px-2 mb-3">
                    <h1 className="text-2xl font-bold text-white tracking-tight whitespace-nowrap overflow-hidden text-ellipsis pb-2 leading-relaxed">
                      {title ? title.split(/[-|:：]/)[0].replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim() : 'My App'}
                    </h1>
                  </div>
                  <div className="flex items-center justify-center w-full">
                    <span className="text-xs font-medium text-slate-400">{language === 'zh' ? '开发者：' : 'Developer: '}{user?.user_metadata?.nickname || user?.email?.split('@')[0] || 'Anonymous'}</span>
                  </div>
                </div>

                {/* QR Section - Centered Single QR */}
                <div className="mt-auto flex flex-col items-center">
                  <div className="bg-white p-3 rounded-2xl shadow-xl mb-4">
                    <QRCodeCanvas 
                      value={`${typeof window !== 'undefined' ? window.location.origin : 'https://sparkvertex.com'}/p/${publishedShareToken || publishedId}?mode=app`}
                      size={140}
                      level={"H"}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      imageSettings={iconPreview ? {
                        src: iconPreview,
                        height: 28,
                        width: 28,
                        excavate: true,
                      } : undefined}
                    />
                  </div>
                  <span className="text-sm text-slate-400">{language === 'zh' ? '扫码体验作品' : 'Scan to experience'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Share Card Container */}
          <div className="max-w-md mx-auto">
            {/* Success Badge */}
            <div className="flex items-center justify-center gap-2 mb-6 h-12 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <i className="fa-solid fa-circle-check text-emerald-400 text-lg"></i>
              <span className="text-emerald-400 font-medium leading-none">
                {(isEditing || isUpdating) ? t.upload.modify_success : t.upload.publish_success}
              </span>
            </div>

            {/* Display Area */}
            <div className="relative w-full mb-6 flex justify-center min-h-[400px]">
              {generatingImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50">
                  <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500 mb-3"></i>
                  <span className="text-slate-300 text-sm font-medium animate-pulse">{language === 'zh' ? '生成分享卡片...' : 'Generating share card...'}</span>
                </div>
              )}
              
              {shareImageUrl ? (
                <img src={shareImageUrl} className="w-full rounded-xl shadow-2xl animate-fade-in" alt="Share Card" />
              ) : (
                <div className="w-full aspect-[375/667] bg-slate-800/50 rounded-xl"></div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Save to Album */}
              <button 
                onClick={() => {
                  if (!shareImageUrl) return;
                  const link = document.createElement('a');
                  link.download = `${title || 'sparkvertex'}-share.png`;
                  link.href = shareImageUrl;
                  link.click();
                  toastSuccess(language === 'zh' ? '图片已保存' : 'Image saved');
                }}
                disabled={!shareImageUrl}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold transition shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-solid fa-download"></i>
                {language === 'zh' ? '保存分享图片' : 'Save Share Image'}
              </button>

              {/* Copy Link */}
              <button 
                onClick={copyShareLink}
                className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition border border-white/10 flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-link"></i>
                {language === 'zh' ? '复制链接' : 'Copy Link'}
              </button>

              {/* Secondary Actions */}
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => router.push('/explore')} 
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-medium transition text-sm"
                >
                  {t.upload.return_explore}
                </button>
                <button 
                  onClick={goToDetail} 
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-medium transition text-sm"
                >
                  {t.upload.view_work}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Modal */}
      {duplicateModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-orange-500/30 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-orange-500/5 pointer-events-none"></div>
            
            <div className="relative z-10">
              {/* Header Icon */}
              <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-500/20">
                <i className="fa-solid fa-shield-halved text-4xl text-orange-500"></i>
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-white mb-3 text-center">
                {language === 'zh' ? '🔍 重复内容检测' : '🔍 Duplicate Content Detected'}
              </h3>

              {/* Detection Type Badge */}
              <div className="flex justify-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
                  <i className={`fa-solid ${duplicateModal.type === 'hash' ? 'fa-fingerprint' : 'fa-brain'} text-orange-400`}></i>
                  <span className="text-sm font-medium text-orange-300">
                    {language === 'zh' 
                      ? (duplicateModal.type === 'hash' ? '哈希指纹匹配' : 'AI 语义识别') 
                      : (duplicateModal.type === 'hash' ? 'Hash Fingerprint Match' : 'AI Semantic Match')}
                  </span>
                  {duplicateModal.similarity && (
                    <span className="text-xs text-orange-400 font-bold bg-orange-500/10 px-1.5 py-0.5 rounded">
                      {Math.round(duplicateModal.similarity * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Message */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-6 mb-8">
                {duplicateModal.isSelf ? (
                  <>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 text-blue-400">
                        <i className="fa-solid fa-user-check text-xl"></i>
                      </div>
                      <div>
                        <h4 className="text-white font-bold mb-2 text-lg">
                          {language === 'zh' ? '检测到您自己的作品' : 'Your Own Work Detected'}
                        </h4>
                        {duplicateModal.matchedTitle && (
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-3 inline-block">
                            <p className="text-sm text-blue-200">
                              <i className="fa-solid fa-file-code mr-2 opacity-70"></i>
                              <span className="font-medium">{duplicateModal.matchedTitle}</span>
                            </p>
                          </div>
                        )}
                        <p className="text-slate-300 text-sm leading-relaxed">
                          {language === 'zh' 
                            ? duplicateModal.type === 'hash'
                              ? '系统检测到该代码与您之前发布的作品完全一致。为避免重复，请编辑原作品而非重新发布。'
                              : `系统通过 AI 分析发现，该作品与您之前发布的作品高度相似（相似度 ${Math.round((duplicateModal.similarity || 0) * 100)}%）。建议编辑原作品。`
                            : duplicateModal.type === 'hash'
                              ? 'This code is identical to your previously published work. Please edit the original instead of republishing.'
                              : `AI analysis shows this work is highly similar (${Math.round((duplicateModal.similarity || 0) * 100)}%) to your previous work. Please edit the original.`}
                        </p>
                      </div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
                      <i className="fa-solid fa-lightbulb text-blue-400 flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-blue-200 leading-relaxed">
                        {language === 'zh' 
                          ? '提示：在个人中心找到原作品，点击"编辑"即可更新内容，保留点赞和浏览数据。' 
                          : 'Tip: Find your original work in Profile, click "Edit" to update it while keeping likes and views.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 text-red-400">
                        <i className="fa-solid fa-triangle-exclamation text-xl"></i>
                      </div>
                      <div>
                        <h4 className="text-white font-bold mb-2 text-lg">
                          {language === 'zh' ? '检测到重复内容' : 'Duplicate Content Found'}
                        </h4>
                        {duplicateModal.matchedTitle && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3 inline-block">
                            <p className="text-sm text-red-200">
                              <i className="fa-solid fa-file-code mr-2 opacity-70"></i>
                              <span className="font-medium">{duplicateModal.matchedTitle}</span>
                            </p>
                          </div>
                        )}
                        <p className="text-slate-300 text-sm leading-relaxed">
                          {language === 'zh' 
                            ? duplicateModal.type === 'hash'
                              ? '系统检测到该代码与平台已有作品完全一致，涉嫌抄袭或重复搬运。'
                              : `系统通过 AI 语义分析发现，该作品与平台已有作品高度相似（相似度 ${Math.round((duplicateModal.similarity || 0) * 100)}%），可能是"换皮"或"洗稿"。`
                            : duplicateModal.type === 'hash'
                              ? 'This code is identical to existing work on the platform, suspected plagiarism.'
                              : `AI semantic analysis shows high similarity (${Math.round((duplicateModal.similarity || 0) * 100)}%) to existing work, possible "reskin" or derivative.`}
                        </p>
                      </div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                      <i className="fa-solid fa-shield-halved text-red-400 flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-red-200 leading-relaxed">
                        {language === 'zh' 
                          ? '为保护原创，该作品无法发布。建议创作全新内容或显著改进原作。' 
                          : 'To protect originality, this work cannot be published. Please create original content.'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {duplicateModal.isSelf && (
                  <button 
                    onClick={() => {
                      setDuplicateModal({ show: false, type: 'hash', isSelf: false });
                      router.push('/profile');
                    }}
                    className="flex-1 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold transition shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-pen-to-square"></i>
                    {language === 'zh' ? '前往编辑' : 'Edit Original'}
                  </button>
                )}
                <button 
                  onClick={() => {
                    setDuplicateModal({ show: false, type: 'hash', isSelf: false });
                    setLoading(false);
                  }}
                  className={`${duplicateModal.isSelf ? 'flex-1' : 'w-full'} py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition border border-white/5`}
                >
                  {language === 'zh' ? '知道了' : 'Got it'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-yellow-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-yellow-500/5 pointer-events-none"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20">
                <i className="fa-solid fa-hand text-4xl text-yellow-500"></i>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {language === 'zh' ? '今日发布已达上限' : 'Daily Limit Reached'}
              </h3>
              <p className="text-slate-400 mb-8 leading-relaxed">
                {language === 'zh' 
                  ? '为了保证社区质量，每位创作者每天最多发布 10 个作品。请明天再来分享您的创意！' 
                  : 'To ensure community quality, each creator can publish up to 5 works per day. Please come back tomorrow!'}
              </p>
              <button 
                onClick={() => setShowLimitModal(false)}
                className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition border border-white/5"
              >
                {language === 'zh' ? '知道了' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backend Data Panel */}
      <BackendDataPanel
        isOpen={showBackendPanel}
        onClose={() => setShowBackendPanel(false)}
        userId={user?.id || null}
        language={language}
      />
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black pt-24 px-4 flex justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-500"></i></div>}>
      <UploadContent />
    </Suspense>
  );
}
