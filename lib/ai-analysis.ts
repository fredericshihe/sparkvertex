
import { supabase } from '@/lib/supabase';

export async function callDeepSeekAPI(systemPrompt: string, userPrompt: string, temperature = 0.7) {
  try {
    // 1. Submit Job to Queue
    const enqueueRes = await fetch('/api/ai-jobs/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        temperature: temperature
      })
    });

    if (!enqueueRes.ok) {
      const errorData = await enqueueRes.json().catch(() => ({}));
      // Handle 429 specifically if needed, or just throw
      throw new Error(errorData.error || `Failed to enqueue job: ${enqueueRes.status}`);
    }

    const { taskId } = await enqueueRes.json();
    if (!taskId) throw new Error('No taskId returned from enqueue API');

    // Trigger Worker (Fire and Forget)
    fetch('/api/ai-jobs/process', { method: 'POST' }).catch(e => console.error('Worker trigger failed:', e));

    // 2. Poll for Status
    // Poll every 2 seconds, timeout after 90 seconds (give it plenty of time for queue + processing)
    const startTime = Date.now();
    const timeoutMs = 90000; 
    
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusRes = await fetch(`/api/ai-jobs/status?taskId=${taskId}`);
      if (!statusRes.ok) {
        // If status check fails (e.g. network), just log and retry
        console.warn(`Status check failed: ${statusRes.status}`);
        continue;
      }

      const statusData = await statusRes.json();
      
      if (statusData.status === 'succeeded' || statusData.status === 'completed') {
        return statusData.result;
      }
      
      if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'AI processing failed');
      }
      
      // If 'queued' or 'running', continue polling
    }

    throw new Error('AI processing timed out (90s)');
    
  } catch (err: any) {
    console.error('AI Async API Error:', err);
    // Re-throw to let caller handle or fail
    throw err;
  }
}

export async function analyzeCategory(htmlContent: string) {
  const categories = ['休闲游戏', '实用工具', '办公效率', '教育学习', '生活便利', '创意设计', '数据可视化', '影音娱乐', '开发者工具', 'AI应用'];
  const systemPrompt = '你是一个资深的应用市场分类专家。你需要精准分析 HTML 代码的核心功能，并将其归类到一个最合适的类别中。';
  const userPrompt = `请分析以下 HTML 代码的核心功能和用户场景，将其归类为以下类别之一:\n${categories.join(', ')}\n\n只返回类别名称，不要解释，不要标点符号。代码:\n\n${htmlContent.substring(0, 20000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return '实用工具';
  
  let categoryText = typeof result === 'string' ? result : String(result);
  const category = categoryText.trim().replace(/["'《》]/g, '');
  return categories.includes(category) ? category : '实用工具';
}

export async function analyzeTitle(htmlContent: string, language: string = 'zh') {
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

只返回标题文本，不要引号，不要解释。代码:\n\n${htmlContent.substring(0, 20000)}`
    : `Analyze the following HTML code, extract or create a title (10-60 characters).
Requirements:
1. Include core keywords.
2. Attractive and click-worthy.
3. If <title> exists, optimize it.

Return only the title text. No quotes. No explanation. Code:\n\n${htmlContent.substring(0, 20000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.5);
  if (!result) return isZh ? '未命名作品' : 'Untitled App';
  
  let titleText = typeof result === 'string' ? result : String(result);
  return titleText.trim().replace(/["'《》]/g, '');
}

export async function analyzeDescription(htmlContent: string, language: string = 'zh') {
  const isZh = language === 'zh';
  const systemPrompt = isZh
    ? '你是一个资深的科技媒体编辑。你需要分析 HTML 代码并生成一段简洁、专业、极具吸引力的产品介绍。'
    : 'You are a Tech Editor. Analyze the HTML code and generate a concise, professional, attractive product description.';
    
  const userPrompt = isZh
    ? `请分析以下 HTML 代码的功能特性，生成一段 40-80 字的产品描述。
要求：
1. 突出核心价值和技术亮点。
2. 语言风格现代、专业、简洁。
3. 避免空洞的形容词。

只返回描述文本。代码:\n\n${htmlContent.substring(0, 20000)}`
    : `Analyze the features of the following HTML code, generate a product description (40-80 words).
Requirements:
1. Highlight core value and tech features.
2. Modern, professional, concise style.
3. Avoid empty adjectives.

Return only the description text. Code:\n\n${htmlContent.substring(0, 20000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.7);
  if (!result) return isZh ? '这是一个创意 Web 应用。' : 'This is a creative Web App.';
  
  let descText = typeof result === 'string' ? result : String(result);
  return descText.trim();
}

export async function analyzeTechStack(htmlContent: string) {
  const systemPrompt = '你是一个全栈技术专家。你需要精准识别 HTML 代码中使用的关键技术、框架、库和 API。';
  const userPrompt = `分析以下代码使用的技术栈，从以下列表中选择 3-6 个最相关的标签：
可选标签: 
- 核心: HTML5, CSS3, JavaScript, TypeScript, React, Vue
- 样式: Tailwind, Bootstrap, SCSS
- 图形: Canvas, WebGL, Three.js, D3.js, SVG
- 数据: LocalStorage, IndexedDB, JSON
- 网络: WebSocket, WebRTC, API Integration
- 高级: PWA, Service Worker, WebAssembly, AI/ML, Web Audio

只返回逗号分隔的标签名称，不要其他内容。代码:\n\n${htmlContent.substring(0, 20000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return ['HTML5', 'JavaScript', 'CSS3'];
  
  let tagsText = typeof result === 'string' ? result : String(result);
  const tags = tagsText.split(',').map(t => t.trim()).filter(t => t.length > 0);
  return tags.slice(0, 6);
}

export async function analyzePrompt(htmlContent: string, language: string = 'zh') {
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

代码:\n\n${htmlContent.substring(0, 20000)}`
    : `Analyze the following code, generate a **Core Function Prompt** (100-200 words).
Focus on:
1. Core function and goal.
2. Key interaction logic.
3. Visual style keywords.

No verbose technical details or edge cases, only the core generation instructions.

Code:\n\n${htmlContent.substring(0, 20000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.5);
  if (!result) return isZh ? '创建一个具有现代 UI 的 Web 应用。' : 'Create a web application with modern UI.';
  
  return typeof result === 'string' ? result : String(result);
}

export async function analyzeAppType(htmlContent: string) {
  const systemPrompt = '你是一个应用分类专家。';
  const userPrompt = `请分析以下 HTML 代码，判断它是否属于以下特定类别之一或多个：
1. "Eye Candy": 视觉效果惊艳、创意展示、艺术性强的 Demo。
2. "Micro-Interactions": 专注于微交互、按钮动画、开关、加载动画等 UI 组件。
3. "Tiny Tools": 小型的单功能实用工具（如计算器、转换器、生成器）。

请返回一个 JSON 字符串数组，包含匹配的类别名称。如果没有匹配，返回空数组 []。
只返回 JSON 数组，不要包含其他文本。

代码片段:
${htmlContent.substring(0, 10000)}`;

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

export function performBasicSecurityCheck(htmlContent: string) {
  const dangerousPatterns = [
      { pattern: /<script[^>]*src\s*=\s*["'][^"']*(?:bitcoin|crypto|miner|coinminer)[^"']*["']/gi, name: '可疑挖矿脚本' },
      { pattern: /keylogger|keystroke|keypress.*password/gi, name: '键盘监听可疑行为' },
      { pattern: /navigator\.sendBeacon/gi, name: '后台数据发送' }
  ];
  
  const foundRisks: string[] = [];
  dangerousPatterns.forEach(({ pattern, name }) => {
      const matches = htmlContent.match(pattern);
      if (matches && matches.length > 0) {
          foundRisks.push(`${name} (检测到${matches.length}处)`);
      }
  });
  
  if (foundRisks.length > 0) {
      return { isSafe: false, risks: foundRisks, severity: 'high' };
  }
  
  return { isSafe: true, risks: [], severity: 'low' };
}

export async function checkMaliciousCode(htmlContent: string) {
  const systemPrompt = '你是一个宽容的代码审计师。这是一个代码分享平台，用户上传的通常是单文件应用（如计算器、小游戏）。';
  const userPrompt = `请对以下代码进行安全检测。
  
**请注意，以下行为在本项目中是【允许】的，不需要报错：**
1. 使用 CDN 加载资源 (React, Vue, Tailwind, Audio/Video, Images)。
2. 使用 eval() 或 new Function() 进行数学计算（如计算器应用）。
3. 使用 localStorage/sessionStorage 保存用户偏好。
4. 使用 innerHTML 更新 UI。

**只有以下情况才视为风险：**
1. **恶意挖矿**: 明显的 CPU 占用循环或连接矿池。
2. **恶意数据窃取**: 将用户敏感数据发送到第三方未知服务器 (navigator.sendBeacon, fetch 到未知域名)。
3. **恶意破坏**: 试图删除页面内容或无限弹窗。

返回 JSON 格式:
{
  "isSafe": boolean,
  "risks": string[], 
  "severity": "low" | "medium" | "high"
}

代码:\n\n${htmlContent.substring(0, 50000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.2);
  if (!result) return performBasicSecurityCheck(htmlContent);
  
  let resultText = typeof result === 'string' ? result : String(result);
  
  const jsonMatch = resultText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
      try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) return performBasicSecurityCheck(htmlContent);
          return parsed;
      } catch (e) {
          return performBasicSecurityCheck(htmlContent);
      }
  }
  return performBasicSecurityCheck(htmlContent);
}

export function injectWatermark(content: string) {
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

export async function optimizeMobileCode(html: string) {
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
}
