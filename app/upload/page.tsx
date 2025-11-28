'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { getPreviewContent } from '@/lib/preview';
import { copyToClipboard } from '@/lib/utils';

// --- Helper Functions (Ported from SparkWorkbench.html) ---

async function callDeepSeekAPI(systemPrompt: string, userPrompt: string, temperature = 0.7) {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        temperature: temperature
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMessage = data.error || `API Error: ${response.status}`;
      
      // Throw specific errors for Rate Limit, Auth, and Validation
      if (response.status === 429) throw new Error(errorMessage); // Rate Limit
      if (response.status === 401) throw new Error(errorMessage); // Auth
      if (response.status === 400) throw new Error(errorMessage); // Validation
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.content;
  } catch (err: any) {
    console.error('AI API Error:', err);
    // Re-throw if it's one of our specific errors
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

async function analyzeCategory(htmlContent: string) {
  const categories = ['休闲游戏', '实用工具', '办公效率', '教育学习', '生活便利', '创意设计', '数据可视化', '影音娱乐', '开发者工具', 'AI应用'];
  const systemPrompt = '你是一个应用分类专家。你需要分析 HTML 代码并将其归类到一个最合适的类别中。';
  const userPrompt = `请分析以下 HTML 代码的功能,将其归类为以下类别之一:\n${categories.join(', ')}\n\n只返回类别名称,不要其他内容。代码:\n\n${htmlContent.substring(0, 3000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return '实用工具';
  
  let categoryText = typeof result === 'string' ? result : String(result);
  const category = categoryText.trim().replace(/["'《》]/g, '');
  return categories.includes(category) ? category : '实用工具';
}

async function analyzeTitle(htmlContent: string) {
  const systemPrompt = '你是一个专业的前端代码分析专家。你需要分析 HTML 代码并提取或推荐一个简洁、吸引人的标题。';
  const userPrompt = `请分析以下 HTML 代码,提取或推荐一个标题(10-30字)。如果代码中有 <title> 标签,优化它;如果没有,根据代码功能创建一个。只返回标题文本,不要其他内容:\n\n${htmlContent.substring(0, 3000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.5);
  if (!result) return '未命名作品';
  
  let titleText = typeof result === 'string' ? result : String(result);
  return titleText.trim().replace(/["'《》]/g, '');
}

async function analyzeDescription(htmlContent: string) {
  const systemPrompt = '你是一个专业的产品描述撰写专家。你需要分析 HTML 代码并生成一段简洁、专业、吸引人的功能描述。';
  const userPrompt = `请分析以下 HTML 代码的功能特性,生成一段 40-80 字的产品描述。描述应该突出核心功能和技术亮点,语言简洁专业。只返回描述文本:\n\n${htmlContent.substring(0, 4000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.7);
  if (!result) return '这是一个创意 Web 应用。';
  
  let descText = typeof result === 'string' ? result : String(result);
  return descText.trim();
}

async function analyzeTechStack(htmlContent: string) {
  const systemPrompt = '你是一个技术栈识别专家。你需要分析 HTML 代码并识别使用的技术、框架、库和API。';
  const userPrompt = `分析以下代码使用的技术栈,从以下列表中选择 3-6 个最相关的标签:\n可选标签: HTML5, CSS3, JavaScript, TypeScript, React, Vue, Angular, Tailwind, Bootstrap, Canvas, WebGL, Three.js, D3.js, Chart.js, WebRTC, WebSocket, Service Worker, PWA, LocalStorage, IndexedDB, Web Audio, WebAssembly, Node.js, Express, Python, AI/ML, API Integration\n\n只返回逗号分隔的标签名称,不要其他内容。代码:\n\n${htmlContent.substring(0, 5000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return ['HTML5', 'JavaScript', 'CSS3'];
  
  let tagsText = typeof result === 'string' ? result : String(result);
  const tags = tagsText.split(',').map(t => t.trim()).filter(t => t.length > 0);
  return tags.slice(0, 6);
}

async function analyzePrompt(htmlContent: string) {
  const systemPrompt = '你是一个高级逆向工程专家和产品经理。你需要深入分析 HTML/JS 代码，并还原出一个极其详细、能够完美复刻该产品的 Prompt (提示词)。';
  const userPrompt = `请深入分析以下代码，并撰写一个能够生成此代码的**极其详细**的 Prompt。
Prompt 必须包含以下所有部分，并且描述要尽可能具体、详尽，覆盖所有功能细节和逻辑：

# Role (角色设定)
定义 AI 的角色，例如：资深全栈工程师、UI/UX 设计大师。

# Project Overview (项目概述)
一句话描述这是什么产品。

# Core Features (核心功能 - 非常重要)
列出所有功能点，包括：
- 用户交互逻辑（点击、悬停、拖拽等）
- 数据处理逻辑（计算、存储、转换等）
- 状态管理（加载中、错误、成功等）
- 具体的算法或业务规则
- 所有的输入输出细节

# UI/UX Design (界面与体验)
- 布局结构
- 配色方案（具体的颜色或风格）
- 动画效果
- 响应式设计要求
- 组件细节

# Mobile Adaptation (移动端适配 - 必须完美支持)
- 必须在 <head> 中包含: <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
- 必须添加 CSS: body { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; } 以防止长按弹出菜单
- 隐藏滚动条但允许滚动: .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
- 确保所有交互元素（按钮、输入框）在移动端有足够的大小和间距
- 使用 Flexbox 或 Grid 布局确保内容在不同屏幕尺寸下自适应
- 避免使用固定像素宽度，使用百分比或 rem/vw

# Technical Requirements (技术要求)
- 使用的库和框架 (React, Tailwind, Three.js 等)
- 代码结构要求
- 性能优化要求

# Constraints (约束条件)
- 任何特定的限制或要求

请确保生成的 Prompt 足够详细，使得另一个 AI 能够根据它完美复刻出这段代码的功能和外观。不要省略任何细节。

代码:\n\n${htmlContent.substring(0, 6000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.5);
  if (!result) return '# Role\nCreative Developer\n\n# Task\nCreate a web application.\n\n# Style\nModern, Clean.';
  
  return typeof result === 'string' ? result : String(result);
}

async function analyzeAppType(htmlContent: string) {
  const systemPrompt = '你是一个应用分类专家。';
  const userPrompt = `请分析以下 HTML 代码，判断它是否属于以下特定类别之一或多个：
1. "Eye Candy": 视觉效果惊艳、创意展示、艺术性强的 Demo。
2. "Micro-Interactions": 专注于微交互、按钮动画、开关、加载动画等 UI 组件。
3. "Tiny Tools": 小型的单功能实用工具（如计算器、转换器、生成器）。

请返回一个 JSON 字符串数组，包含匹配的类别名称。如果没有匹配，返回空数组 []。
只返回 JSON 数组，不要包含其他文本。

代码片段:
${htmlContent.substring(0, 2000)}`;

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
  const dangerousPatterns = [
      { pattern: /eval\s*\(/gi, name: 'eval函数调用' },
      { pattern: /new\s+Function\s*\(/gi, name: 'Function构造器' },
      { pattern: /document\.write\s*\(/gi, name: 'document.write' },
      { pattern: /\.innerHTML\s*=/g, name: 'innerHTML直接赋值' },
      { pattern: /<script[^>]*src\s*=\s*["'][^"']*(?:bitcoin|crypto|miner|coinminer)[^"']*["']/gi, name: '可疑挖矿脚本' },
      { pattern: /keylogger|keystroke|keypress.*password/gi, name: '键盘监听可疑行为' },
      { pattern: /document\.cookie/gi, name: 'Cookie访问' }
  ];
  
  const foundRisks: string[] = [];
  dangerousPatterns.forEach(({ pattern, name }) => {
      const matches = htmlContent.match(pattern);
      if (matches && matches.length > 0) {
          foundRisks.push(`${name} (检测到${matches.length}处)`);
      }
  });
  
  if (foundRisks.length > 2) {
      return { isSafe: false, risks: foundRisks, severity: 'high' };
  } else if (foundRisks.length > 0) {
      return { isSafe: false, risks: foundRisks, severity: 'medium' };
  }
  
  return { isSafe: true, risks: [], severity: 'low' };
}

async function checkMaliciousCode(htmlContent: string) {
  const systemPrompt = '你是一个网络安全专家。你需要检测 HTML/JavaScript 代码中的潜在恶意行为,包括但不限于:恶意外链、数据窃取、XSS攻击、挖矿代码、恶意重定向、Cookie 窃取、键盘记录等。';
  const userPrompt = `请检测以下代码是否包含恶意行为。返回JSON格式:\n{"isSafe": true/false, "risks": ["风险描述1", "风险描述2"], "severity": "low/medium/high"}\n\n代码:\n\n${htmlContent.substring(0, 8000)}`;
  
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

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const [isEditing, setIsEditing] = useState(false);
  const { openLoginModal } = useModal();
  const { error: toastError, success: toastSuccess } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  
  // Metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceType, setPriceType] = useState<'free' | 'paid'>('free');
  const [price, setPrice] = useState(5.0);
  const [tags, setTags] = useState<string[]>(['HTML5', 'Tool']);
  const [tagInput, setTagInput] = useState('');
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
    if (editId) {
      setIsEditing(true);
      loadItemData(editId);
    } else {
      // Check for generated content from Create Wizard
      const fromCreate = searchParams.get('from') === 'create';
      if (fromCreate) {
        const generatedCode = localStorage.getItem('spark_generated_code');
        // const generatedMeta = localStorage.getItem('spark_generated_meta'); // No longer needed as we re-analyze
        
        if (generatedCode) {
          setFileContent(generatedCode);
          setStep(2); // Skip upload step
          
          // Trigger AI Analysis immediately to match "upload" behavior
          // This ensures the generated code goes through the full analysis flow (Security, Title, Tags, Icon, etc.)
          performAIAnalysis(generatedCode);
          
          // Clear storage to prevent reuse
          localStorage.removeItem('spark_generated_code');
          localStorage.removeItem('spark_generated_meta');
        }
      }
    }
  }, [editId]);

  const loadItemData = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        // Verify ownership
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.id !== data.author_id) {
          toastError('你没有权限编辑此作品');
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
        setStep(2); // Skip upload step
        
        // Mark as safe to allow proceeding without re-analysis unless file changes
        setIsSecuritySafe(true); 
        setAnalysisState({
          status: 'success',
          message: '已加载现有作品',
          data: {
            category: '已加载',
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
      toastError('无法加载作品信息');
      router.push('/profile');
    } finally {
      setLoading(false);
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.html') || selectedFile.type === 'text/html') {
        setFile(selectedFile);
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setFileContent(content);
          setStep(2);
          // Trigger AI Analysis
          performAIAnalysis(content);
        };
        reader.readAsText(selectedFile);
      } else {
        toastError('请上传 HTML 文件');
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.html') || selectedFile.type === 'text/html') {
        setFile(selectedFile);
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setFileContent(content);
          setStep(2);
          // Trigger AI Analysis
          performAIAnalysis(content);
        };
        reader.readAsText(selectedFile);
      } else {
        toastError('请上传 HTML 文件');
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
  const [prompt, setPrompt] = useState('');


  
  // Icon State
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>('');
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);

  const handleReset = () => {
    setFile(null);
    setFileContent('');
    setTitle('');
    setDescription('');
    setPriceType('free');
    setPrice(5.0);
    setTags(['HTML5', 'Tool']);
    setTagInput('');
    setPublishedId(null);
    setAnalysisState({ status: 'idle' });
    setIsAnalyzing(false);
    setIsSecuritySafe(false);
    setPrompt('');
    setIconFile(null);
    setIconPreview('');
    setIsGeneratingIcon(false);
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

  const performAIAnalysis = async (html: string) => {
    // Check login first
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }

    setIsAnalyzing(true);
    setIsSecuritySafe(false);
    
    const tasks: { id: string; label: string; status: 'pending' | 'done' }[] = [
      { id: 'security', label: '安全检测', status: 'pending' },
      { id: 'category', label: '智能分类', status: 'pending' },
      { id: 'title', label: '标题提取', status: 'pending' },
      { id: 'desc', label: '描述生成', status: 'pending' },
      { id: 'tech', label: '技术栈分析', status: 'pending' },
      { id: 'prompt', label: 'Prompt逆向', status: 'pending' },
      { id: 'mobile', label: '移动端适配优化', status: 'pending' },
      { id: 'icon', label: '图标自动生成', status: 'pending' },
    ];

    const updateProgressUI = () => {
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
          tasks[index].status = 'done';
          updateProgressUI();
          return result;
        } catch (e) {
          console.error(`Task ${tasks[index].label} failed`, e);
          tasks[index].status = 'done';
          updateProgressUI();
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
            body: JSON.stringify({ title, description: desc })
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
          if (data.url) {
            setIconPreview(data.url);
            const res = await fetch(data.url);
            const blob = await res.blob();
            const file = new File([blob], 'icon.png', { type: 'image/png' });
            setIconFile(file);
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

      const titlePromise = analyzeTitle(html);
      const descPromise = analyzeDescription(html);
      
      const [securityResult, category, titleRes, descRes, techTags, promptRes, appTypes, mobileResult, iconRes] = await Promise.all([
        runTask(0, checkMaliciousCode(html)),
        runTask(1, analyzeCategory(html)),
        runTask(2, titlePromise),
        runTask(3, descPromise),
        runTask(4, analyzeTechStack(html)),
        runTask(5, analyzePrompt(html)),
        analyzeAppType(html),
        runTask(6, optimizeMobileCode(html)),
        runTask(7, generateIconTask(titlePromise, descPromise))
      ]);

      const combinedTags = Array.from(new Set([category, ...appTypes, ...techTags, 'AI Verified'])).filter(t => t);

      // Update Form Data
      setTitle(titleRes);
      setDescription(descRes);
      setTags(combinedTags);
      setPrompt(promptRes);

      // Apply Mobile Optimization if needed
      if (mobileResult.wasOptimized) {
        setFileContent(mobileResult.optimizedHtml);
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
          message: `请求被拒绝: ${error.message}`
        });
      } else {
        setAnalysisState({
          status: 'error',
          message: 'AI 分析失败: 请检查网络连接或稍后重试'
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePublish = async () => {
    if (!title || !description) {
      toastError('请填写标题和描述');
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return 90;
        return prev + Math.random() * 10;
      });
    }, 500);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('未登录');

      // Inject Watermark
      const watermarkedContent = injectWatermark(fileContent);

      // Upload Icon if exists
      let iconUrl = null;
      if (iconFile) {
        const fileExt = iconFile.name.split('.').pop();
        const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('icons')
          .upload(fileName, iconFile);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('icons')
          .getPublicUrl(fileName);
          
        iconUrl = publicUrl;
      }

      let data, error;

      if (isEditing && editId) {
        // Update existing item
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

        let result = await supabase.from('items').update(updateData).eq('id', editId).select().single();
        
        // Fallback: If is_public column is missing (Error 42703), try updating without it
        if (result.error && (result.error.code === '42703' || result.error.message?.includes('is_public'))) {
          console.warn('Database schema outdated: is_public column missing. Falling back.');
          const { is_public, ...fallbackData } = updateData;
          result = await supabase.from('items').update(fallbackData).eq('id', editId).select().single();
          if (!result.error) {
            toastError('警告：数据库缺少 is_public 字段，隐私设置未保存');
          }
        }

        data = result.data;
        error = result.error;
      } else {
        // Create new item
        // 1. Check if item with same title already exists for this user to prevent 409
        // Note: Ideally this should be handled by catching the 409 error, but Supabase JS client sometimes wraps it obscurely.
        // Let's try to catch the specific error code below.
        
        const insertPayload = {
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
          views: 0,
          icon_url: iconUrl
        };

        let result = await supabase.from('items').insert(insertPayload).select().single();

        // Fallback: If is_public column is missing (Error 42703), try inserting without it
        if (result.error && (result.error.code === '42703' || result.error.message?.includes('is_public'))) {
          console.warn('Database schema outdated: is_public column missing. Falling back.');
          const { is_public, ...fallbackPayload } = insertPayload;
          result = await supabase.from('items').insert(fallbackPayload).select().single();
          if (!result.error) {
            toastError('警告：数据库缺少 is_public 字段，隐私设置未保存');
          }
        }

        data = result.data;
        error = result.error;
      }

      if (error) {
        // Handle 409 Conflict specifically
        if (error.code === '23505' || error.message.includes('409')) {
           throw new Error('发布失败：该作品标题已存在，请修改标题后重试。');
        }
        throw error;
      }

      clearInterval(interval);
      setUploadProgress(100);
      setPublishedId(isEditing && editId ? editId : data.id);
      setTimeout(() => {
        setLoading(false);
        setStep(4);
      }, 500);

    } catch (error: any) {
      clearInterval(interval);
      toastError('发布失败: ' + error.message);
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
    const url = `${window.location.origin}/explore?work=${publishedId}`;
    const success = await copyToClipboard(url);
    if (success) {
      toastSuccess('链接已复制！');
    } else {
      toastError('复制失败');
    }
  };

  const goToDetail = () => {
    if (publishedId) {
      router.push(`/p/${publishedId}`);
    }
  };

  return (
    <div className="min-h-screen pt-24 px-4 max-w-4xl mx-auto pb-20">
      <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
        <i className={`fa-solid ${isEditing ? 'fa-pen-to-square' : 'fa-cloud-arrow-up'} text-brand-500`}></i>
        {isEditing ? '编辑作品' : '上传作品'}
      </h1>

      {/* How to Create Guide Banner */}
      <div className="mb-8 glass-panel rounded-xl p-5 border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-graduation-cap text-2xl text-blue-400"></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">还不会用 AI 创作应用？</h3>
              <p className="text-xs text-slate-300">查看详细教程，3分钟学会用 AI 生成创意作品</p>
            </div>
          </div>
          <Link href="/guide" className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg font-medium hover:scale-105 transition whitespace-nowrap text-sm flex items-center">
            <i className="fa-solid fa-book-open mr-2"></i>查看教程
          </Link>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-12 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-800 -z-10"></div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 1 ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500'}`}>1</div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 2 ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500'}`}>2</div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 3 ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500'}`}>3</div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${step >= 4 ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500'}`}>4</div>
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <>
          <div 
            className="glass-panel rounded-2xl p-10 text-center border-2 border-dashed border-slate-600 hover:border-brand-500 transition cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".html,text/html" 
              onChange={handleFileSelect} 
            />
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition">
              <i className="fa-solid fa-file-code text-4xl text-brand-500"></i>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">点击或拖拽上传 HTML 文件</h3>
            <p className="text-slate-400">支持 .html 格式，最大 5MB</p>
          </div>
          {isEditing && fileContent && (
            <div className="text-center mt-4">
              <button 
                onClick={(e) => { e.stopPropagation(); setStep(2); }}
                className="text-slate-400 hover:text-white text-sm underline"
              >
                取消重新上传，使用现有代码
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 2: Preview */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">预览效果</h2>
          </div>

          <div className="w-full h-[850px] bg-slate-900 rounded-lg overflow-hidden border border-slate-600 relative flex justify-center items-center group p-8">
             <div 
                className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-slate-900 flex-shrink-0 ${
                  previewMode === 'desktop' 
                    ? 'w-full h-full rounded-none border-0' 
                    : previewMode === 'tablet'
                      ? 'w-[768px] h-[95%] rounded-[1.5rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50'
                      : 'w-[375px] h-[812px] rounded-[2.5rem] border-[10px] border-slate-800 ring-1 ring-slate-700/50'
                }`}
              >
                {/* Mobile Notch */}
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 bg-slate-800 z-20 transition-all duration-300 ${
                    previewMode === 'mobile' ? 'w-24 h-6 rounded-b-xl opacity-100' : 'w-0 h-0 opacity-0'
                }`}></div>

                <iframe 
                  srcDoc={getPreviewContent(fileContent)} 
                  className="w-full h-full border-0 bg-slate-900" 
                  sandbox="allow-scripts allow-pointer-lock allow-modals allow-same-origin allow-forms allow-popups allow-downloads"
                  allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay; payment; fullscreen; picture-in-picture"
                />
              </div>

              {/* Preview Controls */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition duration-300 z-10">
                <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full p-1 flex">
                  <button onClick={() => setPreviewMode('desktop')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-desktop"></i></button>
                  <button onClick={() => setPreviewMode('tablet')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-tablet-screen-button"></i></button>
                  <button onClick={() => setPreviewMode('mobile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-mobile-screen"></i></button>
                </div>
              </div>
          </div>

          {/* AI Analysis Status */}
          <div className="glass-panel rounded-2xl p-6 mb-6">
            <div id="ai-analysis-status" className="text-sm">
              {analysisState.status === 'analyzing' && (
                <>
                  <div className="flex items-center gap-3 text-purple-400 mb-4">
                    <i className="fa-solid fa-brain fa-pulse text-xl"></i>
                    <div className="flex-grow">
                      <div className="font-bold">AI 深度分析中... {analysisState.progress}%</div>
                      <div className="w-full bg-slate-700 h-1.5 mt-2 rounded-full overflow-hidden">
                        <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${analysisState.progress}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {analysisState.tasks?.map(task => (
                      <div key={task.id} className="flex items-center gap-2 text-sm p-2 rounded bg-slate-800/50 border border-slate-700/50">
                        <div className="w-5 h-5 flex items-center justify-center">
                          {task.status === 'pending' 
                            ? <i className="fa-solid fa-circle-notch fa-spin text-slate-500 text-xs"></i> 
                            : <i className="fa-solid fa-check text-green-400 text-xs"></i>}
                        </div>
                        <span className={task.status === 'pending' ? 'text-slate-400' : 'text-slate-200'}>{task.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {analysisState.status === 'success' && analysisState.data && (
                <>
                  <div className="flex items-center gap-3 text-green-400">
                    <i className="fa-solid fa-circle-check text-2xl"></i>
                    <div className="flex-grow">
                      <div className="font-bold">{analysisState.message || 'AI 分析完成'}</div>
                      <div className="text-xs text-slate-400 mt-1">代码已通过安全检测，可以继续下一步</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                      <div className="text-xs text-green-400 mb-1"><i className="fa-solid fa-check mr-1"></i> 智能分类</div>
                      <div className="font-bold text-white">{analysisState.data.category}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                      <div className="text-xs text-green-400 mb-1"><i className="fa-solid fa-check mr-1"></i> 标题提取</div>
                      <div className="font-bold text-white truncate">{analysisState.data.title}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2">
                      <div className="text-xs text-blue-400 mb-1"><i className="fa-solid fa-check mr-1"></i> 标签识别</div>
                      <div className="font-bold text-white flex flex-wrap gap-2">
                        {analysisState.data.tags?.map((t, i) => (
                          <span key={i} className="text-purple-400 border border-purple-500/30 bg-purple-500/10 px-1 rounded">{t}</span>
                        ))}
                        <span className="text-slate-400 text-xs self-center">+ {analysisState.data.techTagsCount} 技术栈</span>
                      </div>
                    </div>
                    {analysisState.data.mobileOptimized && (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2">
                        <div className="text-xs text-purple-400 mb-1"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> 移动端适配优化</div>
                        <div className="font-bold text-white text-sm">已自动注入 Viewport 和触摸优化代码</div>
                      </div>
                    )}
                    {analysisState.data.iconUrl && (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2 flex items-center gap-4">
                        <img src={analysisState.data.iconUrl} className="w-12 h-12 rounded-xl border border-slate-600" alt="Generated Icon" />
                        <div>
                          <div className="text-xs text-purple-400 mb-1"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> 图标自动生成</div>
                          <div className="font-bold text-white text-sm">已生成高清应用图标</div>
                        </div>
                      </div>
                    )}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2">
                      <div className="text-xs text-green-400 mb-1"><i className="fa-solid fa-check mr-1"></i> 安全检测</div>
                      <div className="font-bold text-white">无风险</div>
                    </div>
                  </div>
                </>
              )}

              {analysisState.status === 'risk' && analysisState.data && (
                <>
                  <div className="flex items-center gap-3 text-red-400">
                    <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
                    <div className="flex-grow">
                      <div className="font-bold">检测到安全风险</div>
                      <div className="text-xs text-slate-400 mt-1">严重程度: {(analysisState.data.severity || 'UNKNOWN').toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="mt-4 bg-red-900/20 border border-red-700/50 rounded-lg p-4">
                    <div className="text-sm font-bold text-red-400 mb-2">检测到以下风险:</div>
                    <ul className="space-y-1">
                      {analysisState.data.risks?.map((risk, i) => (
                        <li key={i} className="text-sm text-slate-300">• {risk}</li>
                      ))}
                    </ul>
                    <div className="mt-3 text-xs text-slate-400">* 包含风险代码的作品将无法发布</div>
                  </div>
                </>
              )}

              {analysisState.status === 'error' && (
                <div className="flex items-center gap-3 text-red-400">
                  <i className="fa-solid fa-ban text-xl"></i>
                  <div>
                    <div className="font-bold">分析出错</div>
                    <div className="text-xs text-slate-400 mt-1">{analysisState.message}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Metadata Form (Moved to Step 2) */}
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <div className="flex items-center mb-4">
                <i className="fa-solid fa-pen-to-square text-brand-500 mr-2 text-xl"></i>
                <h3 className="font-bold text-white">作品信息</h3>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">作品标题 <span className="text-purple-400 text-xs">(AI 自动提取)</span></label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none"
                placeholder="AI 分析中..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">作品描述 <span className="text-purple-400 text-xs">(AI 自动生成)</span></label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none resize-none"
                placeholder="AI 分析中..."
              />
            </div>

            {/* App Icon Section */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">应用图标 <span className="text-slate-500 text-xs">(用于分享卡片和主屏幕图标)</span></label>
              <div className="flex items-start gap-6">
                {/* Preview */}
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 rounded-[1.5rem] bg-slate-800 border border-slate-700 overflow-hidden relative group shadow-lg">
                    {iconPreview ? (
                      <img src={iconPreview} alt="App Icon" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <i className="fa-solid fa-image text-2xl"></i>
                      </div>
                    )}
                    {/* Glossy Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
                  </div>
                  <div className="text-center mt-2 text-[10px] text-slate-500">预览效果</div>
                </div>

                {/* Controls */}
                <div className="flex-grow space-y-3">
                  {/* AI Generate */}
                  <button 
                    onClick={async () => {
                      if (!description) {
                        toastError('请先填写描述或等待AI分析完成');
                        return;
                      }
                      setIsGeneratingIcon(true);
                      try {
                        const response = await fetch('/api/generate-icon', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ title, description })
                        });
                        
                        if (!response.ok) {
                          const data = await response.json().catch(() => ({}));
                          const msg = data.error || `API Error: ${response.status}`;
                          throw new Error(msg);
                        }

                        const data = await response.json();
                        if (data.url) {
                          setIconPreview(data.url);
                          // Convert data URL to File object for upload
                          const res = await fetch(data.url);
                          const blob = await res.blob();
                          const file = new File([blob], 'icon.png', { type: 'image/png' });
                          setIconFile(file);
                          toastSuccess('图标生成成功');
                        }
                      } catch (error: any) {
                        console.error('Icon generation failed', error);
                        toastError(error.message || '图标生成失败，请重试');
                      } finally {
                        setIsGeneratingIcon(false);
                      }
                    }}
                    disabled={isGeneratingIcon || !description}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white py-2 rounded-lg font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingIcon ? (
                      <><i className="fa-solid fa-circle-notch fa-spin"></i> AI 生成中...</>
                    ) : (
                      <><i className="fa-solid fa-wand-magic-sparkles"></i> AI 自动生成图标</>
                    )}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-slate-900 text-slate-500">或</span>
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
                    <button className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg font-bold transition flex items-center justify-center gap-2 border border-slate-700">
                      <i className="fa-solid fa-upload"></i> 上传本地图片
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">* 建议尺寸 1024x1024，系统将自动裁剪为圆角</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Prompt (提示词) <span className="text-purple-400 text-xs">(AI 逆向生成)</span></label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={12}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none resize-none"
                placeholder="AI 分析中..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">分类标签与技术栈 <span className="text-purple-400 text-xs">(AI 自动识别)</span></label>
              <div className="flex flex-wrap gap-2 mb-2 min-h-[2rem]">
                {tags.length === 0 && isAnalyzing && <span className="text-xs text-slate-500">等待 AI 分析...</span>}
                {tags.map(tag => (
                  <span key={tag} className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-sm flex items-center gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-white"><i className="fa-solid fa-times"></i></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none"
                  placeholder="添加标签 (回车确认)"
                />
                <button onClick={addTag} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">添加</button>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={handleReset} className="px-6 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition">重新上传</button>
            <button 
              onClick={() => setStep(3)} 
              disabled={isAnalyzing || !isSecuritySafe}
              className={`px-6 py-2 rounded-lg font-bold transition flex items-center gap-2 ${
                isAnalyzing || !isSecuritySafe 
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                  : 'bg-brand-600 hover:bg-brand-500 text-white'
              }`}
            >
              {isAnalyzing ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> 分析中...</>
              ) : !isSecuritySafe ? (
                <><i className="fa-solid fa-ban"></i> 存在风险</>
              ) : (
                <>下一步 <i className="fa-solid fa-arrow-right"></i></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Pricing & Publish */}
      {step === 3 && (
        <div className="glass-panel rounded-2xl p-8 space-y-6">
          {/* Visibility Settings */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-white mb-4">发布设置</h3>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium mb-1">
                    {isPublic ? '公开作品' : '私有作品'}
                  </h4>
                  <p className="text-sm text-slate-400">
                    {isPublic 
                      ? '作品将显示在探索页面，所有人可见' 
                      : '作品仅在个人中心可见，其他人无法查看'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isPublic ? 'bg-brand-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-bold text-white mb-6">设置你的作品价格</h3>

          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Free Option */}
              <div 
                className={`border rounded-xl p-6 cursor-pointer transition relative ${priceType === 'free' ? 'border-brand-500 bg-brand-900/20' : 'border-slate-600 hover:border-brand-500'}`}
                onClick={() => setPriceType('free')}
              >
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full border-2 border-slate-500 flex items-center justify-center">
                  {priceType === 'free' && <div className="w-3 h-3 bg-brand-500 rounded-full"></div>}
                </div>
                <i className="fa-solid fa-gift text-3xl text-green-400 mb-4"></i>
                <h4 className="text-lg font-bold text-white">免费分享</h4>
                <p className="text-sm text-slate-400 mt-2">适合展示作品、获取关注和反馈。用户可以免费下载源码。</p>
              </div>

              {/* Paid Option */}
              <div 
                className={`border rounded-xl p-6 cursor-pointer transition relative ${priceType === 'paid' ? 'border-brand-500 bg-brand-900/20' : 'border-slate-600 hover:border-brand-500'}`}
                onClick={() => setPriceType('paid')}
              >
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full border-2 border-slate-500 flex items-center justify-center">
                  {priceType === 'paid' && <div className="w-3 h-3 bg-brand-500 rounded-full"></div>}
                </div>
                <i className="fa-solid fa-sack-dollar text-3xl text-yellow-400 mb-4"></i>
                <h4 className="text-lg font-bold text-white">付费下载</h4>
                <p className="text-sm text-slate-400 mt-2">设定一个价格，用户支付后才能获取源码。</p>
                
                {priceType === 'paid' && (
                  <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                    <label className="text-xs text-slate-400">价格 (CNY)</label>
                    <input 
                      type="number" 
                      value={price}
                      onChange={(e) => setPrice(parseFloat(e.target.value))}
                      step="0.5"
                      min="1"
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 mt-1 text-white focus:border-brand-500 outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-6 flex gap-4">
            <button onClick={() => setStep(2)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">上一步</button>
            <button 
              onClick={handlePublish} 
              disabled={loading}
              className="flex-[2] py-3 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-lg font-bold transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  {isEditing ? '保存中' : '发布中'} {Math.round(uploadProgress)}%
                </>
              ) : (
                isEditing ? '保存修改' : '确认发布'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Launch (Success) */}
      {step === 4 && (
        <div className="glass-panel rounded-2xl p-12 text-center animate-float-up">
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fa-solid fa-check text-5xl text-green-500"></i>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">{isEditing ? '修改成功！' : '发布成功！'}</h2>
          <p className="text-slate-400 mb-8">{isEditing ? '你的作品信息已更新。' : '你的作品已经上线，快去分享给朋友吧！'}</p>
          
          <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 flex flex-col items-center justify-center gap-4 mb-8">
            <div className="text-slate-500 text-sm">作品链接</div>
            <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 w-full max-w-md">
              <span className="text-brand-400 truncate flex-1 text-left">{`${typeof window !== 'undefined' ? window.location.origin : ''}/explore?work=${publishedId}`}</span>
              <button onClick={copyShareLink} className="text-slate-400 hover:text-white"><i className="fa-regular fa-copy"></i></button>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button onClick={() => router.push('/explore')} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">
              返回探索
            </button>
            <button onClick={goToDetail} className="px-8 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-bold transition shadow-lg shadow-brand-500/30">
              查看作品
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
