'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';
import { getPreviewContent } from '@/lib/preview';
import { copyToClipboard } from '@/lib/utils';
import { sha256 } from '@/lib/sha256';

// --- Helper Functions (Ported from SparkWorkbench.html) ---

async function calculateContentHash(content: string) {
  // Normalize: remove all whitespace, newlines, and convert to lowercase
  const normalized = content.replace(/\s+/g, '').toLowerCase();
  return await sha256(normalized);
}

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

async function analyzeCategory(htmlContent: string, language: string = 'en') {
  const isZh = language === 'zh';

  if (isZh) {
    const categories = ['游戏', '工具', '效率', '教育', '生活', '设计', '可视化', '娱乐', '开发者工具'];
    const systemPrompt = '你是一个应用商店分类专家。分析 HTML 代码并将其归类到最合适的类别中。';
    const userPrompt = `分析以下 HTML 代码的核心功能，并将其归类为以下类别之一：\n${categories.join(', ')}\n\n只返回类别名称，不要解释。代码：\n\n${htmlContent.substring(0, 20000)}`;
    
    const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
    if (!result) return '工具';
    
    let categoryText = typeof result === 'string' ? result : String(result);
    return categoryText.trim().replace(/["'《》]/g, '');
  }

  const categories = ['Game', 'Utility', 'Productivity', 'Education', 'Lifestyle', 'Design', 'Visualization', 'Entertainment', 'DevTool', 'AI'];
  const systemPrompt = 'You are an App Store category expert. Analyze the HTML code and categorize it into the most suitable category.';
  const userPrompt = `Analyze the core function of the following HTML code and categorize it into one of these categories:\n${categories.join(', ')}\n\nReturn only the category name. No explanation. Code:\n\n${htmlContent.substring(0, 20000)}`;
  
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
    'Design': 'design',
    'Visualization': 'visualization',
    'Entertainment': 'entertainment',
    'DevTool': 'devtool',
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

只返回标题文本，不要引号，不要解释。代码:\n\n${htmlContent.substring(0, 20000)}`
    : `Analyze the following HTML code, extract or create a title (10-60 characters).
Requirements:
1. Include core keywords.
2. Attractive and click-worthy.
3. If <title> exists, optimize it.
4. **No visual style adjectives** (e.g., Cute, Cyberpunk, Minimalist), focus on function.

Return only the title text. No quotes. No explanation. Code:\n\n${htmlContent.substring(0, 20000)}`;
  
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

只返回描述文本。代码:\n\n${htmlContent.substring(0, 20000)}`
    : `Analyze the features of the following HTML code, generate a product description (40-80 words).
Requirements:
1. Highlight core value and tech features.
2. Modern, professional, concise style.
3. Avoid empty adjectives.

Return only the description text. Code:\n\n${htmlContent.substring(0, 20000)}`;
  
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

Return only comma-separated tag names. No other text. Code:\n\n${htmlContent.substring(0, 20000)}`;
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, 0.3);
  if (!result) return ['HTML5', 'JavaScript', 'CSS3'];
  
  let tagsText = typeof result === 'string' ? result : String(result);
  const tags = tagsText.split(',').map(t => t.trim()).filter(t => t.length > 0);
  return tags.slice(0, 6);
}

async function analyzePrompt(htmlContent: string, language: string = 'en', temperature: number = 0.5) {
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
  
  const result = await callDeepSeekAPI(systemPrompt, userPrompt, temperature);
  if (!result) return isZh ? '创建一个具有现代 UI 的 Web 应用。' : 'Create a web application with modern UI.';
  
  return typeof result === 'string' ? result : String(result);
}

async function analyzeAppType(htmlContent: string) {
  const systemPrompt = 'You are an App Category Expert.';
  const userPrompt = `Analyze the following HTML code, determine if it belongs to one or more of these specific categories:
1. "Eye Candy": Visually stunning, creative demos.
2. "Micro-Interactions": Focus on UI components, buttons, animations.
3. "Tiny Tools": Small single-function tools (e.g., calculator, converter).

Return a JSON string array containing matching category names. If none match, return empty array [].
Return only JSON array. No other text.

Code snippet:
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
      { pattern: /navigator\.sendBeacon/gi, name: 'Background Data Sending' }
  ];
  
  const foundRisks: string[] = [];
  dangerousPatterns.forEach(({ pattern, name }) => {
      const matches = htmlContent.match(pattern);
      if (matches && matches.length > 0) {
          foundRisks.push(`${name} (Detected ${matches.length})`);
      }
  });
  
  // Only block for high severity findings
  if (foundRisks.length > 0) {
      return { isSafe: false, risks: foundRisks, severity: 'high' };
  }
  
  return { isSafe: true, risks: [], severity: 'low' };
}

async function checkMaliciousCode(htmlContent: string) {
  const systemPrompt = 'You are a lenient Code Auditor. This is a code sharing platform for single-file apps.';
  const userPrompt = `Perform security check on the following code.
  
**Allowed behaviors (Do not report):**
1. CDN resources (React, Vue, Tailwind, Audio/Video, Images).
2. eval() or new Function() for math (e.g., calculator).
3. localStorage/sessionStorage.
4. innerHTML for UI updates.

**Risks (Report these):**
1. **Malicious Mining**: CPU intensive loops or mining pool connections.
2. **Data Theft**: Sending sensitive data to unknown 3rd party servers (navigator.sendBeacon, fetch to unknown domains).
3. **Malicious Destruction**: Deleting page content or infinite alerts.

Return JSON format:
{
  "isSafe": boolean,
  "risks": string[], 
  "severity": "low" | "medium" | "high"
}

Code:\n\n${htmlContent.substring(0, 50000)}`;
  
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

function UploadContent() {
  const { t, language } = useLanguage();
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
  const [user, setUser] = useState<any>(null);

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

  useEffect(() => {
    const init = async () => {
      const fromCreate = searchParams.get('from') === 'create';

      if (editId) {
        setIsEditing(true);
        await loadItemData(editId);
      } 
      
      // Check for generated content from Create Wizard (overrides DB content if present)
      if (fromCreate) {
        const generatedCode = localStorage.getItem('spark_generated_code');
        
        if (generatedCode) {
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
  }, [editId]);

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
      // Inject validation script
      const validationScript = `
        <script>
          var capturedErrors = [];
          window.onerror = function(msg, url, line, col, error) {
            capturedErrors.push({ message: msg, line: line, column: col });
          };
          
          window.addEventListener('unhandledrejection', function(event) {
             capturedErrors.push({ message: 'Unhandled Promise Rejection: ' + event.reason });
          });

          window.addEventListener('load', function() {
            setTimeout(function() {
              try {
                  var hasContent = document.body.innerText.trim().length > 0 || document.body.children.length > 0;
                  // Check for common "empty" react roots
                  var root = document.getElementById('root');
                  if (root && root.innerHTML.trim().length === 0) hasContent = false;

                  if (hasContent) {
                    window.parent.postMessage({ type: 'spark-validation-success' }, '*');
                  } else {
                    if (capturedErrors.length > 0) {
                        // Report the first error that likely caused the blank screen
                        window.parent.postMessage({ type: 'spark-app-error', error: capturedErrors[0] }, '*');
                    } else {
                        window.parent.postMessage({ type: 'spark-validation-empty' }, '*');
                    }
                  }
              } catch(e) {
                  window.parent.postMessage({ type: 'spark-app-error', error: { message: e.toString() } }, '*');
              }
            }, 2000); // Wait 2 seconds for render
          });
        </script>
      `;
      
      // Use existing preview logic but append validation script
      let previewHtml = getPreviewContent(content);
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
        setIsPublic(data.is_public !== false); // Default to true if null
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

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
    // Only force login if editing an existing item, otherwise let them browse/upload (upload click will trigger login)
    if (!session && editId) {
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
        setFile(selectedFile);
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
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
  const [prompt, setPrompt] = useState('');


  
  // Icon State
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>('');
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  const [generationCount, setGenerationCount] = useState(0);

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
    setAnalysisState({ status: 'idle', progress: 0, tasks: [], message: '', data: undefined });
    setIsAnalyzing(false);
    setIsSecuritySafe(false);
    setPrompt('');
    setIconFile(null);
    setIconPreview('');
    setIsGeneratingIcon(false);
    setGenerationCount(0);
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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('🔍 [Duplicate Check] Skipped: No session');
        setIsCheckingDuplicate(false);
        return { passed: true }; // Allow to proceed if not logged in yet
      }

      // 1. Hash Check (Fast)
      const contentHash = await calculateContentHash(content);
      console.log('🔍 [Duplicate Check] Content Hash:', contentHash);

      // Build query to check for hash duplicates
      let hashQuery = supabase
        .from('items')
        .select('id, author_id')
        .eq('content_hash', contentHash);
      
      // If editing, exclude the current item being edited
      if (isEditing && editId) {
        console.log('🔍 [Duplicate Check] Editing mode - excluding ID:', editId);
        hashQuery = hashQuery.neq('id', editId);
      }
      
      const { data: existing } = await hashQuery.maybeSingle();

      console.log('🔍 [Duplicate Check] Hash Match Found:', existing ? 'YES' : 'NO', existing?.id, '(isEditing:', isEditing, 'editId:', editId, ')');

      if (existing) {
        // Get the matched item's title
        const { data: matchedItem } = await supabase
          .from('items')
          .select('title')
          .eq('id', existing.id)
          .single();
        
        setDuplicateModal({
          show: true,
          type: 'hash',
          isSelf: existing.author_id === session.user.id,
          matchedItemId: existing.id,
          matchedTitle: matchedItem?.title
        });
        setIsCheckingDuplicate(false);
        return { passed: false }; // Block
      }

      // 2. Vector Check (Slower, but required early)
      // We need to extract title and description first to generate embedding
      let titleRes = '';
      let descRes = '';
      let embedding = null;

      try {
        // Run analysis in parallel
        [titleRes, descRes] = await Promise.all([
          analyzeTitle(content, language),
          analyzeDescription(content, language)
        ]);
        
        console.log('🔍 [Duplicate Check] Generated Title:', titleRes);

        // Use the code content directly for embedding to detect slight modifications (e.g. color changes)
        // Truncate to 20000 chars to fit within token limits (approx 5k tokens)
        const textToEmbed = content.substring(0, 20000);
        
        const embedRes = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToEmbed })
        });

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
              // Filter out the current item being edited
              console.log('🔍 [Duplicate Check] Vector results before filter:', similarItems.map((i: any) => ({ id: i.id, similarity: i.similarity })));
              const filteredItems = isEditing && editId 
                ? similarItems.filter((item: any) => {
                    const isMatch = String(item.id) !== String(editId);
                    console.log('🔍 [Duplicate Check] Comparing:', item.id, '!==', editId, '=', isMatch);
                    return isMatch;
                  })
                : similarItems;
              
              console.log('🔍 [Duplicate Check] Filtered items count:', filteredItems.length, '(original:', similarItems.length, ')');
              
              if (filteredItems.length > 0) {
                const bestMatch = filteredItems[0];
                console.log('🔍 [Duplicate Check] Vector Similarity:', bestMatch.similarity, 'ID:', bestMatch.id);
                
                const { data: matchOwner } = await supabase
                  .from('items')
                  .select('author_id, title')
                  .eq('id', bestMatch.id)
                  .single();
                  
                const isSelf = matchOwner && matchOwner.author_id === session.user.id;

                // 0.98 Threshold: Block
                if (bestMatch.similarity > 0.98) {
                   console.log('🔍 [Duplicate Check] BLOCKED by Vector (Similarity > 0.98)');
                   setDuplicateModal({
                     show: true,
                     type: 'vector',
                     isSelf: isSelf || false,
                     similarity: bestMatch.similarity,
                     matchedItemId: bestMatch.id,
                     matchedTitle: matchOwner?.title
                   });
                   setIsCheckingDuplicate(false);
                   return { passed: false };
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
      
      // Return pre-computed data to avoid re-analysis
      return { 
        passed: true, 
        data: { 
          title: titleRes, 
          description: descRes,
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

    // Rate limit check: Max 10 analysis per hour per user
    const rateLimitKey = `ai_analysis_${session.user.id}`;
    const rateLimitData = localStorage.getItem(rateLimitKey);
    
    if (rateLimitData) {
      try {
        const { count, timestamp } = JSON.parse(rateLimitData);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        
        if (timestamp > oneHourAgo) {
          if (count >= 10) {
            toastError(language === 'zh' 
              ? '操作过于频繁，请稍后再试（每小时最多 10 次分析）' 
              : 'Too many requests. Please try again later (10 analyses per hour).');
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
    
    const tasks: { id: string; label: string; status: 'pending' | 'done' }[] = [
      { id: 'security', label: t.upload.task_security, status: 'pending' },
      { id: 'category', label: t.upload.task_category, status: 'pending' },
      { id: 'title', label: t.upload.task_title, status: preComputedData?.title ? 'done' : 'pending' },
      { id: 'desc', label: t.upload.task_desc, status: preComputedData?.description ? 'done' : 'pending' },
      { id: 'tech', label: t.upload.task_tech, status: 'pending' },
      { id: 'prompt', label: t.upload.task_prompt, status: 'pending' },
      { id: 'mobile', label: t.upload.task_mobile, status: 'pending' },
      { id: 'icon', label: t.upload.task_icon, status: 'pending' },
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
          
          if (data.debug && data.debug.trace) {
            console.log('🎨 [Auto] Icon Generation Trace:', data.debug.trace);
          }

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

      // Create promises with side effects to update UI immediately
      // If preComputedData exists, use it directly
      const titlePromise = preComputedData?.title 
        ? Promise.resolve(preComputedData.title).then(res => {
            if (analysisSessionIdRef.current === currentSessionId) setTitle(res);
            return res;
          })
        : analyzeTitle(html, language).then(res => {
            if (analysisSessionIdRef.current === currentSessionId) setTitle(res);
            return res;
          });
      
      const descPromise = preComputedData?.description
        ? Promise.resolve(preComputedData.description).then(res => {
            if (analysisSessionIdRef.current === currentSessionId) setDescription(res);
            return res;
          })
        : analyzeDescription(html, language).then(res => {
            if (analysisSessionIdRef.current === currentSessionId) setDescription(res);
            return res;
          });

      const promptPromise = analyzePrompt(html, language).then(res => {
        if (analysisSessionIdRef.current === currentSessionId) setPrompt(res);
        return res;
      });
      
      const [securityResult, category, titleRes, descRes, techTags, promptRes, appTypes, mobileResult, iconRes] = await Promise.all([
        runTask(0, checkMaliciousCode(html)),
        runTask(1, analyzeCategory(html, language)),
        runTask(2, titlePromise),
        runTask(3, descPromise),
        runTask(4, analyzeTechStack(html)),
        runTask(5, promptPromise),
        analyzeAppType(html),
        runTask(6, optimizeMobileCode(html)),
        runTask(7, generateIconTask(titlePromise, descPromise))
      ]);

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

  const handleEditInCreator = () => {
    if (!fileContent) return;
    localStorage.setItem('spark_upload_import', fileContent);
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

      // Check daily limit (5 posts per day)
      if (!isEditing) {
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
        } else if (count !== null && count >= 5) {
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
      const watermarkedContent = injectWatermark(fileContent);

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
        const fileExt = fileToUpload.name.split('.').pop() || 'png';
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
        if (finalEmbedding) updateData.embedding = finalEmbedding;
        
        // Update hash as well
        updateData.content_hash = contentHash;

        let result = await supabase.from('items').update(updateData).eq('id', editId).select().single();
        
        // Fallback: If any error occurs (likely missing columns), try without new schema fields
        if (result.error) {
          console.warn('Update failed, retrying with safe payload...', result.error);
          
          // Create a minimal safe payload without potentially missing columns
          const { embedding, is_public, ...safeData } = updateData;
          
          // Try updating without embedding and is_public
          result = await supabase.from('items').update(safeData).eq('id', editId).select().single();
          
          if (!result.error) {
            toastError(t.upload.db_warning || 'Database schema update required for full features');
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
          page_views: 0,
          downloads: 0,
          icon_url: iconUrl,
          content_hash: contentHash,
          embedding: finalEmbedding
        };

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

      // 触发 AI 评分（后台异步，不阻塞用户）
      if (itemId) {
        fetch('/api/score-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId })
        }).catch(err => console.warn('评分触发失败:', err));
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
    const url = `${window.location.origin}/explore?work=${publishedId}`;
    const success = await copyToClipboard(url);
    if (success) {
      toastSuccess(t.upload.copy_link);
    } else {
      toastError(t.upload.copy_fail);
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
        {isEditing ? t.upload.edit_title : t.upload.title}
      </h1>

      {/* How to Create Guide Banner */}
      <div className="mb-8 glass-panel rounded-xl p-5 border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-graduation-cap text-2xl text-blue-400"></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">{t.upload.guide_title}</h3>
              <p className="text-xs text-slate-300">{t.upload.guide_desc}</p>
            </div>
          </div>
          <Link href="/guide" className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg font-medium hover:scale-105 transition whitespace-nowrap text-sm flex items-center">
            <i className="fa-solid fa-book-open mr-2"></i>{t.upload.guide_btn}
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
            <h3 className="text-xl font-bold text-white mb-2">{t.upload.drag_drop_title}</h3>
            <p className="text-slate-400">{t.upload.drag_drop_desc}</p>
          </div>
          {isEditing && fileContent && (
            <div className="text-center mt-4">
              <button 
                onClick={(e) => { e.stopPropagation(); setStep(2); }}
                className="text-slate-400 hover:text-white text-sm underline"
              >
                {t.upload.cancel_reupload}
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 2: Preview */}
      {step === 2 && (
        <div className="space-y-6">
          
          {/* Validation Overlay */}
          {validationState.status === 'validating' && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm">
                <div className="text-center space-y-4 animate-pulse">
                    <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <h3 className="text-xl font-bold text-white">{t.upload.validating_code || 'Verifying Application...'}</h3>
                    <p className="text-slate-400">{t.upload.validating_desc || 'Checking for runtime errors and rendering issues.'}</p>
                </div>
                {/* Hidden Validation Iframe (Must be rendered for innerText to work, so use opacity-0 instead of hidden) */}
                <iframe 
                    srcDoc={getValidationContent(fileContent)}
                    className="fixed top-0 left-0 w-[100px] h-[100px] opacity-0 pointer-events-none -z-50"
                    sandbox="allow-scripts allow-forms allow-modals"
                />
             </div>
          )}

          {/* Validation Error Modal */}
          {validationState.status === 'error' && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-4">
                <div className="bg-slate-800 border border-red-500/50 rounded-2xl p-8 max-w-lg w-full shadow-2xl text-center">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i className="fa-solid fa-bug text-4xl text-red-500"></i>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">{t.upload.validation_failed || 'Validation Failed'}</h3>
                    <p className="text-slate-400 mb-6">
                        {t.upload.validation_failed_desc || 'The application cannot be uploaded because it has serious errors or renders a blank screen.'}
                    </p>
                    
                    <div className="bg-black/30 rounded-lg p-4 text-left mb-8 border border-red-500/20 overflow-auto max-h-40">
                        <div className="text-xs text-red-400 font-bold uppercase mb-1">Error Details</div>
                        <code className="text-sm text-red-200 font-mono break-words">
                            {validationState.error}
                        </code>
                        {validationState.details && validationState.details.stack && (
                            <pre className="text-xs text-slate-500 mt-2 whitespace-pre-wrap break-all">
                                {validationState.details.stack}
                            </pre>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button 
                            onClick={handleEditInCreator}
                            className="flex-1 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
                        >
                            <i className="fa-solid fa-pen-to-square"></i>
                            {t.upload.back_to_edit || 'Back to Editor'}
                        </button>
                        <button 
                            onClick={handleReset}
                            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition"
                        >
                            {t.upload.cancel_upload || 'Cancel'}
                        </button>
                    </div>
                </div>
             </div>
          )}

          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">{t.upload.preview_effect}</h2>
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
                  sandbox="allow-scripts allow-pointer-lock allow-modals allow-forms allow-popups allow-downloads"
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

          {/* Duplicate Check Status */}
          {isCheckingDuplicate && (
            <div className="glass-panel rounded-2xl p-6 mb-6 border-2 border-orange-500/30">
              <div className="flex items-center gap-3 text-orange-400">
                <i className="fa-solid fa-shield-halved fa-pulse text-2xl"></i>
                <div className="flex-grow">
                  <div className="font-bold">{language === 'zh' ? '🔍 正在检测重复内容...' : '🔍 Checking for duplicates...'}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {language === 'zh' ? '正在进行全网原创性比对，请稍候...' : 'Checking for originality across the platform...'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis Status */}
          <div className="glass-panel rounded-2xl p-6 mb-6">
            <div id="ai-analysis-status" className="text-sm">
              {analysisState.status === 'analyzing' && (
                <>
                  <div className="flex items-center gap-3 text-purple-400 mb-4">
                    <i className="fa-solid fa-brain fa-pulse text-xl"></i>
                    <div className="flex-grow">
                      <div className="font-bold">{t.upload.ai_analyzing} {analysisState.progress}%</div>
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
                      <div className="font-bold">{analysisState.message || t.upload.ai_complete}</div>
                      <div className="text-xs text-slate-400 mt-1">{t.upload.security_pass}</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                      <div className="text-xs text-green-400 mb-1"><i className="fa-solid fa-check mr-1"></i> {t.upload.result_category}</div>
                      <div className="font-bold text-white">{analysisState.data.category ? ((t.categories as any)[analysisState.data.category] || analysisState.data.category) : ''}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                      <div className="text-xs text-green-400 mb-1"><i className="fa-solid fa-check mr-1"></i> {t.upload.result_title}</div>
                      <div className="font-bold text-white truncate">{analysisState.data.title}</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2">
                      <div className="text-xs text-blue-400 mb-1"><i className="fa-solid fa-check mr-1"></i> {t.upload.result_tags}</div>
                      <div className="font-bold text-white flex flex-wrap gap-2">
                        {analysisState.data.tags?.map((t, i) => (
                          <span key={i} className="text-purple-400 border border-purple-500/30 bg-purple-500/10 px-1 rounded">{t}</span>
                        ))}
                        <span className="text-slate-400 text-xs self-center">+ {analysisState.data.techTagsCount} {t.upload.result_tech}</span>
                      </div>
                    </div>
                    {analysisState.data.mobileOptimized && (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2">
                        <div className="text-xs text-purple-400 mb-1"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> {t.upload.result_mobile}</div>
                        <div className="font-bold text-white text-sm">{t.upload.result_mobile_desc}</div>
                      </div>
                    )}
                    {analysisState.data.iconUrl && (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2 flex items-center gap-4">
                        <img src={analysisState.data.iconUrl} className="w-12 h-12 rounded-xl border border-slate-600" alt="Generated Icon" />
                        <div>
                          <div className="text-xs text-purple-400 mb-1"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> {t.upload.result_icon}</div>
                          <div className="font-bold text-white text-sm">{t.upload.result_icon_desc}</div>
                        </div>
                      </div>
                    )}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2">
                      <div className="text-xs text-green-400 mb-1"><i className="fa-solid fa-check mr-1"></i> {t.upload.result_security}</div>
                      <div className="font-bold text-white">{t.upload.result_safe}</div>
                    </div>
                  </div>
                </>
              )}

              {analysisState.status === 'risk' && analysisState.data && (
                <>
                  <div className="flex items-center gap-3 text-red-400">
                    <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
                    <div className="flex-grow">
                      <div className="font-bold">{t.upload.security_risk}</div>
                      <div className="text-xs text-slate-400 mt-1">{t.upload.risk_severity} {(analysisState.data.severity || 'UNKNOWN').toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="mt-4 bg-red-900/20 border border-red-700/50 rounded-lg p-4">
                    <div className="text-sm font-bold text-red-400 mb-2">{t.upload.risk_list}</div>
                    <ul className="space-y-1">
                      {analysisState.data.risks?.map((risk, i) => (
                        <li key={i} className="text-sm text-slate-300">• {risk}</li>
                      ))}
                    </ul>
                    <div className="mt-3 text-xs text-slate-400">{t.upload.risk_block}</div>
                  </div>
                </>
              )}

              {analysisState.status === 'error' && (
                <div className="flex items-center gap-3 text-red-400">
                  <i className="fa-solid fa-ban text-xl"></i>
                  <div>
                    <div className="font-bold">{t.upload.analysis_error}</div>
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
                <h3 className="font-bold text-white">{t.upload.app_info}</h3>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.upload.app_title} <span className="text-purple-400 text-xs">({t.upload.ai_auto_extract})</span></label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none"
                placeholder={t.upload.ai_analyzing_short}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.upload.app_desc} <span className="text-purple-400 text-xs">({t.upload.ai_auto_gen})</span></label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none resize-none"
                placeholder={t.upload.ai_analyzing_short}
              />
            </div>

            {/* App Icon Section */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">{t.upload.app_icon} <span className="text-slate-500 text-xs">({t.upload.icon_hint})</span></label>
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
                  <div className="text-center mt-2 text-[10px] text-slate-500">{t.upload.icon_preview}</div>
                </div>

                {/* Controls */}
                <div className="flex-grow space-y-3">
                  {/* AI Generate */}
                  <button 
                    onClick={async () => {
                      if (!description) {
                        toastError(t.upload.fill_desc_first);
                        return;
                      }
                      if (generationCount >= 3) {
                        toastError(t.upload.icon_gen_limit);
                        return;
                      }
                      
                      setIsGeneratingIcon(true);
                      setGenerationCount(prev => prev + 1);
                      
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
                        toastError(error.message || t.upload.icon_gen_fail);
                        // Revert count on failure if you want, but usually attempts are counted regardless
                        // setGenerationCount(prev => prev - 1); 
                      } finally {
                        setIsGeneratingIcon(false);
                      }
                    }}
                    disabled={isGeneratingIcon || !description || generationCount >= 3}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white py-2 rounded-lg font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingIcon ? (
                      <><i className="fa-solid fa-circle-notch fa-spin"></i> {t.upload.ai_generating}</>
                    ) : generationCount >= 3 ? (
                      <><i className="fa-solid fa-ban"></i> {t.upload.limit_reached}</>
                    ) : (
                      <><i className="fa-solid fa-wand-magic-sparkles"></i> {t.upload.ai_generate_icon} ({3 - generationCount}/3)</>
                    )}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-slate-900 text-slate-500">{t.upload.or}</span>
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
                      <i className="fa-solid fa-upload"></i> {t.upload.upload_local}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">{t.upload.icon_size_hint}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.upload.prompt_label} <span className="text-purple-400 text-xs">{t.upload.prompt_hint}</span></label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={12}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none resize-none"
                placeholder={t.upload.ai_analyzing_short}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.upload.tags_label} <span className="text-purple-400 text-xs">{t.upload.tags_hint}</span></label>
              <div className="flex flex-wrap gap-2 mb-2 min-h-[2rem]">
                {tags.length === 0 && isAnalyzing && <span className="text-xs text-slate-500">{t.upload.waiting_analysis}</span>}
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
                  placeholder={t.upload.add_tag_placeholder}
                />
                <button onClick={addTag} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">{t.upload.add}</button>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center gap-4">
            <button onClick={handleReset} className="px-6 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition">{t.upload.reupload}</button>
            
            <div className="flex gap-4">
                <button 
                    onClick={handleEditInCreator}
                    className="px-6 py-2 rounded-lg border border-brand-500/50 text-brand-400 hover:text-white hover:bg-brand-600/20 transition flex items-center gap-2"
                >
                    <i className="fa-solid fa-pen-to-square"></i>
                    {t.upload.edit_code || (language === 'zh' ? '编辑代码' : 'Edit Code')}
                </button>

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

      {/* Step 3: Pricing & Publish */}
      {step === 3 && (
        <div className="glass-panel rounded-2xl p-8 space-y-6">
          {/* Visibility Settings */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-white mb-4">{t.upload.publish_settings}</h3>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium mb-1">
                    {isPublic ? t.upload.public_work : t.upload.private_work}
                  </h4>
                  <p className="text-sm text-slate-400">
                    {isPublic 
                      ? t.upload.public_hint 
                      : t.upload.private_hint}
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

          <h3 className="text-xl font-bold text-white mb-6">{t.upload.set_price}</h3>

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
                <h4 className="text-lg font-bold text-white">{t.upload.free_share}</h4>
                <p className="text-sm text-slate-400 mt-2">{t.upload.free_desc}</p>
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
                <h4 className="text-lg font-bold text-white">{t.upload.paid_download}</h4>
                <p className="text-sm text-slate-400 mt-2">{t.upload.paid_desc}</p>
                
                {priceType === 'paid' && (
                  <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                    <label className="text-xs text-slate-400">{t.upload.price_cny}</label>
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
            <button onClick={() => setStep(2)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">{t.upload.prev_step}</button>
            <button 
              onClick={handlePublish} 
              disabled={loading}
              className="flex-[2] py-3 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-lg font-bold transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  {isEditing ? t.upload.saving : t.upload.publishing} {Math.round(uploadProgress)}%
                </>
              ) : (
                isEditing ? t.upload.save_changes : t.upload.confirm_publish
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
          <h2 className="text-3xl font-bold text-white mb-4">{isEditing ? t.upload.modify_success : t.upload.publish_success}</h2>
          <p className="text-slate-400 mb-8">{isEditing ? t.upload.modify_success_desc : t.upload.publish_success_desc}</p>
          
          <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 flex flex-col items-center justify-center gap-4 mb-8">
            <div className="text-slate-500 text-sm">{t.upload.work_link}</div>
            <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 w-full max-w-md">
              <span className="text-brand-400 truncate flex-1 text-left">{`${typeof window !== 'undefined' ? window.location.origin : ''}/explore?work=${publishedId}`}</span>
              <button onClick={copyShareLink} className="text-slate-400 hover:text-white"><i className="fa-regular fa-copy"></i></button>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button onClick={() => router.push('/explore')} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">
              {t.upload.return_explore}
            </button>
            <button onClick={goToDetail} className="px-8 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-bold transition shadow-lg shadow-brand-500/30">
              {t.upload.view_work}
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Detection Modal */}
      {duplicateModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-slate-800 border border-orange-500/50 rounded-2xl p-8 max-w-lg w-full shadow-2xl relative">
            {/* Header Icon */}
            <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-shield-halved text-4xl text-orange-500"></i>
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-white mb-3 text-center">
              {language === 'zh' ? '🔍 重复内容检测' : '🔍 Duplicate Content Detected'}
            </h3>

            {/* Detection Type Badge */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/30 rounded-full">
                <i className={`fa-solid ${duplicateModal.type === 'hash' ? 'fa-fingerprint' : 'fa-brain'}`}></i>
                <span className="text-sm font-medium text-orange-300">
                  {language === 'zh' 
                    ? (duplicateModal.type === 'hash' ? '哈希指纹匹配' : 'AI 语义识别') 
                    : (duplicateModal.type === 'hash' ? 'Hash Fingerprint Match' : 'AI Semantic Match')}
                </span>
                {duplicateModal.similarity && (
                  <span className="text-xs text-orange-400">
                    {Math.round(duplicateModal.similarity * 100)}%
                  </span>
                )}
              </div>
            </div>

            {/* Message */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 mb-6">
              {duplicateModal.isSelf ? (
                <>
                  <div className="flex items-start gap-3 mb-4">
                    <i className="fa-solid fa-user-check text-2xl text-blue-400 flex-shrink-0 mt-1"></i>
                    <div>
                      <h4 className="text-white font-bold mb-2">
                        {language === 'zh' ? '检测到您自己的作品' : 'Your Own Work Detected'}
                      </h4>
                      {duplicateModal.matchedTitle && (
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 mb-3">
                          <p className="text-sm text-blue-200">
                            <i className="fa-solid fa-file-code mr-2"></i>
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
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-start gap-2">
                    <i className="fa-solid fa-lightbulb text-blue-400 flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-blue-200">
                      {language === 'zh' 
                        ? '提示：在个人中心找到原作品，点击"编辑"即可更新内容，保留点赞和浏览数据。' 
                        : 'Tip: Find your original work in Profile, click "Edit" to update it while keeping likes and views.'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 mb-4">
                    <i className="fa-solid fa-triangle-exclamation text-2xl text-red-400 flex-shrink-0 mt-1"></i>
                    <div>
                      <h4 className="text-white font-bold mb-2">
                        {language === 'zh' ? '检测到重复内容' : 'Duplicate Content Found'}
                      </h4>
                      {duplicateModal.matchedTitle && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                          <p className="text-sm text-red-200">
                            <i className="fa-solid fa-file-code mr-2"></i>
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
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
                    <i className="fa-solid fa-shield-halved text-red-400 flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-red-200">
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
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
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
                className={`${duplicateModal.isSelf ? 'flex-1' : 'w-full'} py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition`}
              >
                {language === 'zh' ? '知道了' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center relative">
            <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-hand text-4xl text-yellow-500"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              {language === 'zh' ? '今日发布已达上限' : 'Daily Limit Reached'}
            </h3>
            <p className="text-slate-400 mb-8">
              {language === 'zh' 
                ? '为了保证社区质量，每位创作者每天最多发布 5 个作品。请明天再来分享您的创意！' 
                : 'To ensure community quality, each creator can publish up to 5 works per day. Please come back tomorrow!'}
            </p>
            <button 
              onClick={() => setShowLimitModal(false)}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition"
            >
              {language === 'zh' ? '知道了' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 px-4 flex justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i></div>}>
      <UploadContent />
    </Suspense>
  );
}
