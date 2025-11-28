'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { copyToClipboard } from '@/lib/utils';

// --- Constants ---
const CATEGORIES = [
  { id: 'game', label: '游戏', icon: 'fa-gamepad', desc: '休闲、益智、动作' },
  { id: 'tool', label: '工具', icon: 'fa-screwdriver-wrench', desc: '计算、记录、转换' },
  { id: 'info', label: '资讯', icon: 'fa-newspaper', desc: '展示、列表、博客' }
];

const STYLES = [
  { id: 'cyberpunk', label: '赛博朋克', color: 'from-pink-500 to-cyan-500', desc: '霓虹、故障风、高对比度' },
  { id: 'minimalist', label: '极简主义', color: 'from-slate-200 to-slate-400', desc: '干净、留白、黑白灰' },
  { id: 'cute', label: '可爱风格', color: 'from-pink-300 to-purple-300', desc: '圆角、柔和、卡通' },
  { id: 'business', label: '商务科技', color: 'from-blue-600 to-indigo-700', desc: '专业、稳重、深色调' }
];

const FEATURE_TEMPLATES: Record<string, { label: string, desc: string }[]> = {
  game: [
    { label: '计分板系统', desc: '包含红蓝双方计分，支持加减分动画，比赛时间倒计时，以及犯规次数统计。' },
    { label: '排行榜功能', desc: '游戏结束后显示前10名高分玩家，支持本地存储记录，并有简单的颁奖动画。' },
    { label: '音效与设置', desc: '背景音乐开关，点击音效，震动反馈开关，以及游戏难度选择（简单/普通/困难）。' }
  ],
  tool: [
    { label: '番茄专注钟', desc: '25分钟专注+5分钟休息循环，带有圆形进度条动画，白噪音播放（雨声/森林），以及每日专注时长统计。' },
    { label: '多功能计算器', desc: '支持基础运算和科学计算，带有历史记录侧边栏，支持键盘输入，界面仿iOS风格。' },
    { label: '智能待办清单', desc: '支持任务分组（工作/生活），拖拽排序，设置截止日期提醒，完成任务时有烟花特效。' }
  ],
  info: [
    { label: '数字名片', desc: '玻璃拟态风格，展示头像、职位、技能标签，点击社交图标有悬浮动效，支持生成二维码分享。' },
    { label: '产品落地页', desc: '首屏大图Hero区域，功能特性网格展示，客户评价轮播，底部带有显眼的"立即购买"悬浮按钮。' },
    { label: '每日心情卡片', desc: '选择今日心情（开心/难过等），自动匹配背景色和励志语录，支持一键生成精美图片保存到相册。' }
  ]
};

const MAX_MODIFICATIONS = 5;

export default function CreatePage() {
  const router = useRouter();
  const { openLoginModal } = useModal();
  const { success: toastSuccess, error: toastError } = useToast();
  
  // State: Wizard
  const [step, setStep] = useState<'category' | 'style' | 'features' | 'desc' | 'generating' | 'preview'>('category');
  const [wizardData, setWizardData] = useState({
    category: '',
    style: '',
    features: '',
    description: ''
  });

  // State: Generation
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modificationCount, setModificationCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [loadingText, setLoadingText] = useState('正在分析需求...');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('mobile');
  const [streamingCode, setStreamingCode] = useState('');
  const [currentGenerationPrompt, setCurrentGenerationPrompt] = useState('');
  
  // State: User Credits
  const [generationCredits, setGenerationCredits] = useState(2);
  const [modificationCredits, setModificationCredits] = useState(6);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeScrollRef.current) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [streamingCode]);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        checkAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUserId(session.user.id);
      
      // Fetch user credits and reset logic
      const { data } = await supabase
        .from('profiles')
        .select('generation_credits, modification_credits, last_reset_date')
        .eq('id', session.user.id)
        .single();
        
      if (data) {
        // No daily reset logic anymore - fixed quota
        setGenerationCredits(data.generation_credits ?? 3);
        setModificationCredits(data.modification_credits ?? 10);
      } else {
        // New profile handling (if not created by trigger)
        setGenerationCredits(3);
        setModificationCredits(10);
      }
    }
  };

  // --- Wizard Handlers ---
  const handleCategorySelect = (id: string) => {
    setWizardData(prev => ({ ...prev, category: id, features: '' }));
    setStep('style');
  };

  const handleStyleSelect = (id: string) => {
    setWizardData(prev => ({ ...prev, style: id }));
    setStep('features');
  };

  const addTemplateFeature = (desc: string) => {
    setWizardData(prev => {
      const newFeatures = prev.features ? `${prev.features}\n${desc}` : desc;
      if (newFeatures.length > 500) {
        toastError('功能描述已达到字数上限');
        return prev;
      }
      return { ...prev, features: newFeatures };
    });
  };

  // --- Generation Logic ---
    const constructPrompt = (isModification = false, modificationRequest = '') => {
    const categoryLabel = CATEGORIES.find(c => c.id === wizardData.category)?.label || 'App';
    const styleLabel = STYLES.find(s => s.id === wizardData.style)?.label || 'Modern';
    
    // Compact description
    let description = `Type:${categoryLabel}, Style:${styleLabel}. Features:${wizardData.features}. Notes:${wizardData.description}`;

    if (isModification) {
      // User requested full HTML context to avoid issues
      description = `Modify this HTML:
      ${generatedCode}
      Request: ${modificationRequest}`;
    }

    return `
# Task
Create single-file React app: ${categoryLabel} Generator.
${description}

# Specs
- Lang: Chinese
- Stack: React 18, Tailwind CSS (CDN)
- Mobile-first, dark mode (#0f172a)
- Single HTML file, NO markdown.

# Template
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{-webkit-user-select:none;user-select:none;background:#0f172a;color:white}::-webkit-scrollbar{display:none}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const {useState,useEffect,useRef}=React;
// YOUR CODE
const App=()=>{return <div className="min-h-screen w-full">...</div>};
const root=ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
</script></body></html>
    `;
  };

  const startGeneration = async (isModification = false) => {
    // Check Auth first
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }

    // Check Credits
    if (isModification) {
      if (modificationCredits <= 0) {
        toastError('您的修改次数已用完');
        return;
      }
    } else {
      if (generationCredits <= 0) {
        toastError('您的创建次数已用完');
        return;
      }
    }

    setIsGenerating(true);
    setStep('generating');
    setProgress(0);
    setStreamingCode('');
    
    // Enhanced Progress Simulation - Friendly & Non-Stalling
    const loadingMessages = [
      '正在深度分析您的需求...',
      'AI 正在构思最佳 UI 布局...',
      '正在编写 React 组件逻辑...',
      '正在优化移动端触控响应...',
      '正在配置 Tailwind 美学样式...',
      '正在进行代码安全性检查...',
      '正在做最后的性能优化...',
      '即将完成，准备预览...'
    ];
    
    let messageIndex = 0;
    setLoadingText(loadingMessages[0]);
    
    // Flag to track if we started receiving data
    let hasStartedStreaming = false;

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        // Smart Progress Logic
        // We want to avoid the "stuck at 99%" feeling.
        // Instead of slowing down to a crawl, we keep a steady pace until ~85%, 
        // then we wait for the stream to actually finish.
        
        let increment = 0;
        
        if (hasStartedStreaming) {
           // If we are receiving data, move faster!
           if (prev < 95) increment = Math.random() * 2 + 1;
           else increment = 0.1; // Just a tiny bit to show life
        } else {
           // Still waiting for server response
           if (prev < 30) increment = Math.random() * 3 + 2; // Initial burst
           else if (prev < 60) increment = Math.random() * 1 + 0.5; // Steady thinking
           else if (prev < 85) increment = 0.2; // Waiting for stream start
           else increment = 0; // Hold at 85% until stream starts
        }

        const nextProgress = Math.min(prev + increment, 99);
        
        // Cycle messages based on progress milestones to keep user engaged
        const totalMessages = loadingMessages.length;
        const messageStage = Math.floor((nextProgress / 100) * totalMessages);
        
        if (messageStage > messageIndex && messageStage < totalMessages) {
            messageIndex = messageStage;
            setLoadingText(loadingMessages[messageIndex]);
        }

        return nextProgress;
      });
    }, 200); // Update every 200ms for smooth animation


    try {
      const prompt = constructPrompt(isModification, chatInput);
      
      // Set current prompt for display in generating screen
      const promptContent = isModification ? chatInput : (wizardData.description || wizardData.features || `创建一个${CATEGORIES.find(c => c.id === wizardData.category)?.label}应用...`);
      setCurrentGenerationPrompt(promptContent);

      if (isModification) {
        setChatHistory(prev => [...prev, { role: 'user', content: chatInput }]);
        setChatInput('');
        setModificationCount(prev => prev + 1);
      }

      // Use Next.js Proxy API to hide Supabase Edge Function URL
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          system_prompt: `You are an expert frontend developer specializing in mobile-first web applications. You will be given a description of a web application, and you must generate the full HTML code for it in a single file.

Requirements:
1. **Language**: All generated text and content MUST be in Simplified Chinese (简体中文).
2. **Mobile-First Design**: The UI/UX must be highly optimized for mobile devices. It should feel like a native app when opened in PWA mode.
   - Use large, touch-friendly tap targets (min 44px).
   - Use bottom navigation or accessible menus for mobile.
   - Ensure fonts and spacing are optimized for small screens.
   - Prevent horizontal scrolling on mobile.
3. **Tech Stack**:
   - Use Tailwind CSS for styling via CDN.
   - Use React and ReactDOM via CDN (UMD build).
   - Use Babel via CDN to compile JSX in the browser.
   - Use Lucide React icons via CDN (lucide.createIcons()).
4. **Functionality**: The app should be fully functional and interactive.
5. **Output Format**: The output must be ONLY valid HTML code, starting with <!DOCTYPE html>. Do not include markdown code blocks (like \`\`\`html).
6. **Visuals**: Include beautiful, modern, and polished UI components with smooth transitions.`,
          user_prompt: prompt
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('Generation failed details:', {
            status: response.status,
            statusText: response.statusText,
            body: errorData,
            url: '/api/generate'
        });
        
        let errorMessage = errorData.error || `Generation failed: ${response.status}`;
        
        // Clean up nested JSON error messages
        if (errorMessage.includes('{"error":')) {
            try {
                const match = errorMessage.match(/({.*})/);
                if (match) {
                    const innerError = JSON.parse(match[1]);
                    errorMessage = innerError.error || errorMessage;
                }
            } catch (e) {}
        }

        // User-friendly messages for common status codes
        if (response.status === 403) {
            errorMessage = `服务暂时不可用 (403): ${errorMessage}`;
        } else if (response.status === 429) {
            errorMessage = `请求过于频繁 (429): ${errorMessage}`;
        } else if (response.status === 500) {
            errorMessage = '服务器内部错误，请稍后重试。';
        }

        throw new Error(errorMessage);
      }
      if (!response.body) throw new Error('No response body');

      // Deduct credits on successful start
      if (userId) {
        const newCredits = isModification ? modificationCredits - 1 : generationCredits - 1;
        const updateField = isModification ? 'modification_credits' : 'generation_credits';
        
        // Optimistic update
        if (isModification) setModificationCredits(newCredits);
        else setGenerationCredits(newCredits);
        
        // Background update
        supabase.from('profiles').update({ [updateField]: newCredits }).eq('id', userId).then(({ error }) => {
            if (error) console.error('Failed to update credits', error);
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Mark streaming as started when we receive the first chunk
        hasStartedStreaming = true;
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        // Keep the last line in the buffer as it might be incomplete
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith('data: ')) {
            const dataStr = trimmedLine.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const content = data.choices?.[0]?.delta?.content || '';
              fullContent += content;
              setStreamingCode(fullContent);
            } catch (e) {
              console.error('Error parsing SSE chunk:', e);
            }
          }
        }
      }

      clearInterval(progressInterval);
      setProgress(100);
      
      // Improved cleaning logic
      let cleanCode = fullContent;
      // Remove markdown code blocks
      cleanCode = cleanCode.replace(/```html/g, '').replace(/```/g, '');
      
      // Find the start of HTML
      const htmlStart = cleanCode.indexOf('<!DOCTYPE html>');
      if (htmlStart !== -1) {
        cleanCode = cleanCode.substring(htmlStart);
      } else {
        const htmlTagStart = cleanCode.indexOf('<html');
        if (htmlTagStart !== -1) {
            cleanCode = '<!DOCTYPE html>\n' + cleanCode.substring(htmlTagStart);
        }
      }

      // Auto-repair: Fix truncated root.render
      // This handles the case where the AI stops at "root.render(<App />" without closing it
      if (cleanCode.includes('root.render(<App />') && !cleanCode.includes('root.render(<App />);')) {
        cleanCode = cleanCode.split('root.render(<App />')[0] + 'root.render(<App />);\n    </script>\n</body>\n</html>';
      }
      
      console.log('Generated Code:', cleanCode);
      setGeneratedCode(cleanCode);
      setStep('preview');
      
      if (isModification) {
        setChatHistory(prev => [...prev, { role: 'ai', content: '代码已更新，请查看预览效果。' }]);
      }

    } catch (error: any) {
      console.error('Generation error:', error);
      
      // Smart Error Handling
      if (error.message?.includes('Input too long') || error.message?.includes('2000')) {
        // Specific handling for length limit
        toastError('应用代码量已超出AI处理上限，无法继续修改');
        
        // Add a system message to chat to guide the user
        setChatHistory(prev => [...prev, { 
          role: 'ai', 
          content: `⚠️ **无法继续修改**\n\n当前应用代码量已超过系统限制（2000字符）。\n\n**建议方案：**\n1. 点击下方“下载源码”保存当前进度，在本地继续开发。\n2. 或者点击“发布作品”分享当前版本。` 
        }]);
      } else {
        toastError(error.message || '生成失败，请重试');
      }
      
      setStep(isModification ? 'preview' : 'desc'); // Go back
    } finally {
      setIsGenerating(false);
      clearInterval(progressInterval);
    }
  };

  const handleUpload = () => {
    // Save to localStorage to pass to upload page
    localStorage.setItem('spark_generated_code', generatedCode);
    localStorage.setItem('spark_generated_meta', JSON.stringify({
      title: `${wizardData.category} - ${wizardData.style}`,
      description: wizardData.description || wizardData.features,
      tags: [wizardData.category, wizardData.style]
    }));
    router.push('/upload?from=create');
  };

  const handleDownload = () => {
    const blob = new Blob([generatedCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spark-app-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toastSuccess('下载成功！请妥善保存源文件');
  };

  // --- Render Helpers ---
  const renderWizard = () => (
    <div className="max-w-4xl mx-auto pt-32 pb-12 px-4 min-h-screen flex flex-col">
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 shadow-2xl animate-fade-in relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-500/50 to-transparent"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Progress Steps */}
        <div className="flex justify-between mb-12 relative max-w-lg mx-auto w-full z-10">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-800 -z-10 rounded-full"></div>
          {['category', 'style', 'features', 'desc'].map((s, i) => {
            const steps = ['category', 'style', 'features', 'desc'];
            const currentIndex = steps.indexOf(step);
            const stepIndex = steps.indexOf(s);
            const isActive = stepIndex <= currentIndex;
            
            return (
              <div key={s} className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-4 ${isActive ? 'bg-brand-500 border-slate-900 text-white shadow-[0_0_15px_rgba(14,165,233,0.5)] scale-110' : 'bg-slate-800 border-slate-900 text-slate-500'}`}>
                  {i + 1}
                </div>
                <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${isActive ? 'text-brand-400' : 'text-slate-600'}`}>
                  {s === 'category' ? '类型' : s === 'style' ? '风格' : s === 'features' ? '功能' : '描述'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative z-10 min-h-[400px] flex flex-col justify-center">
          {step === 'category' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">想做什么应用？</h2>
                <p className="text-slate-400">选择一个基础类型，我们将为你构建框架</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="p-6 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-brand-500 rounded-2xl transition-all group text-left hover:shadow-lg hover:-translate-y-1"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-4 group-hover:scale-110 transition shadow-inner">
                      <i className={`fa-solid ${cat.icon} text-2xl text-brand-400`}></i>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{cat.label}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{cat.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'style' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">选择设计风格</h2>
                <p className="text-slate-400">为你的应用挑选一套独特的外观主题</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style.id)}
                    className="p-6 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-brand-500 rounded-2xl transition-all group relative overflow-hidden hover:shadow-lg hover:-translate-y-1"
                  >
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br ${style.color} transition duration-500`}></div>
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <h3 className="text-xl font-bold text-white">{style.label}</h3>
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${style.color} shadow-lg`}></div>
                    </div>
                    <p className="text-sm text-slate-400 relative z-10">{style.desc}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-center pt-4">
                <button onClick={() => setStep('category')} className="text-slate-400 hover:text-white text-sm flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800 transition">
                  <i className="fa-solid fa-arrow-left"></i> 返回上一步
                </button>
              </div>
            </div>
          )}

          {step === 'features' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">具体功能需求</h2>
                <p className="text-slate-400">描述你想要的功能，或使用下方模板快速组合</p>
              </div>
              
              {/* Custom Input */}
              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 focus-within:border-brand-500 transition-colors relative overflow-hidden">
                <textarea
                  value={wizardData.features}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) {
                      setWizardData(prev => ({ ...prev, features: e.target.value }));
                    }
                  }}
                  placeholder="例如：我需要一个计分板，左边是红队，右边是蓝队，点击加分..."
                  className="w-full h-32 bg-transparent border-none outline-none appearance-none p-4 text-white placeholder-slate-500 focus:ring-0 resize-none text-sm leading-relaxed"
                ></textarea>
                <div className="absolute bottom-2 right-4 text-xs text-slate-500">
                  {wizardData.features.length}/500
                </div>
              </div>

              {/* Templates */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <i className="fa-solid fa-wand-magic-sparkles"></i> 推荐模板 (点击添加)
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {/* @ts-ignore */}
                  {FEATURE_TEMPLATES[wizardData.category]?.map((tpl: any, index: number) => (
                    <button
                      key={index}
                      onClick={() => addTemplateFeature(tpl.desc)}
                      className="p-4 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-brand-500 rounded-xl transition text-left group flex items-start gap-3"
                    >
                      <div className="mt-1 w-5 h-5 rounded-full border border-slate-600 flex items-center justify-center group-hover:border-brand-500 group-hover:bg-brand-500/20 transition-colors">
                        <i className="fa-solid fa-plus text-[10px] text-slate-400 group-hover:text-brand-400"></i>
                      </div>
                      <div>
                        <span className="font-bold text-white text-sm group-hover:text-brand-400 transition block mb-1">{tpl.label}</span>
                        <p className="text-xs text-slate-400 leading-relaxed">{tpl.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4">
                <button onClick={() => setStep('style')} className="text-slate-400 hover:text-white text-sm flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800 transition">
                  <i className="fa-solid fa-arrow-left"></i> 返回上一步
                </button>
                <button 
                  onClick={() => setStep('desc')}
                  className="px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-bold transition shadow-lg shadow-brand-500/20 flex items-center gap-2"
                >
                  下一步 <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          )}

          {step === 'desc' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">最后补充</h2>
                <p className="text-slate-400">还有什么特别的要求吗？比如配色、音效等</p>
              </div>
              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 focus-within:border-brand-500 transition-colors relative overflow-hidden">
                <textarea
                  value={wizardData.description}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) {
                      setWizardData(prev => ({ ...prev, description: e.target.value }));
                    }
                  }}
                  placeholder="例如：我希望背景是深蓝色的，按钮要有点击音效，计分板在顶部..."
                  className="w-full h-40 bg-transparent border-none outline-none appearance-none p-4 text-white placeholder-slate-500 focus:ring-0 resize-none leading-relaxed"
                ></textarea>
                <div className="absolute bottom-2 right-4 text-xs text-slate-500">
                  {wizardData.description.length}/500
                </div>
              </div>
              <div className="flex justify-between items-center pt-4">
                <button onClick={() => setStep('features')} className="text-slate-400 hover:text-white text-sm flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800 transition">
                  <i className="fa-solid fa-arrow-left"></i> 返回上一步
                </button>
                <button 
                  onClick={() => startGeneration(false)}
                  className="px-8 py-3 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-xl font-bold transition shadow-lg shadow-brand-500/30 flex items-center gap-2 hover:scale-105 active:scale-95"
                >
                  <i className="fa-solid fa-wand-magic-sparkles"></i> 开始创作
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 w-full max-w-2xl mx-auto py-8 md:py-12">
      {/* Chat Simulation Container */}
      <div className="w-full bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl mb-8 relative overflow-hidden">
        {/* Progress Line at top */}
        <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-brand-500 via-purple-500 to-brand-500 w-full animate-pulse"></div>
        
        <div className="space-y-8">
          {/* User Message Bubble */}
          <div className="flex gap-4 flex-row-reverse animate-slide-up">
            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 border-2 border-slate-600 shadow-lg">
              <i className="fa-solid fa-user text-white text-lg"></i>
            </div>
            <div className="bg-gradient-to-br from-brand-600 to-brand-700 text-white p-5 rounded-2xl rounded-tr-none shadow-lg max-w-[85%] relative group">
              <div className="absolute -right-2 top-0 w-4 h-4 bg-brand-700 transform rotate-45"></div>
              <p className="text-xs font-bold text-brand-200 mb-2 uppercase tracking-wider">我的需求</p>
              <p className="text-sm leading-relaxed opacity-95">
                {currentGenerationPrompt}
              </p>
            </div>
          </div>

          {/* AI Thinking Bubble */}
          <div className="flex gap-4 animate-slide-up" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border-2 border-brand-500/30 relative shadow-lg shadow-brand-500/20">
              <i className="fa-solid fa-robot text-brand-400 text-lg animate-bounce"></i>
              <div className="absolute inset-0 rounded-full border-2 border-brand-500/50 animate-ping opacity-20"></div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700 text-slate-300 p-5 rounded-2xl rounded-tl-none shadow-lg max-w-[85%] relative w-full">
              <div className="absolute -left-2 top-0 w-4 h-4 bg-slate-800 transform rotate-45 border-l border-t border-slate-700"></div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">AI 思考中</span>
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"></div>
                </div>
              </div>
              <p className="text-sm text-slate-400 min-h-[1.5em] transition-all duration-300 mb-4">
                {loadingText} <span className="text-brand-400 font-mono ml-2">{Math.floor(progress)}%</span>
              </p>
              
              {/* Real-time Code Waterfall */}
              {streamingCode && (
                <div className="mt-4 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-inner animate-fade-in">
                  <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">generating.tsx</span>
                  </div>
                  <div 
                    ref={codeScrollRef}
                    className="p-3 h-48 overflow-y-auto font-mono text-[10px] leading-relaxed text-green-400/90 custom-scrollbar"
                  >
                    <pre className="whitespace-pre-wrap break-all">
                      {streamingCode}
                      <span className="animate-pulse inline-block w-1.5 h-3 bg-green-500 ml-0.5 align-middle"></span>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status */}
      <div className="text-center space-y-3 animate-fade-in" style={{ animationDelay: '1s', animationFillMode: 'both' }}>
        <h2 className="text-2xl font-bold text-white">正在施展魔法...</h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Spark Vertex 正在为你生成独一无二的应用，请稍候片刻，精彩即将呈现。
        </p>
      </div>
    </div>
  );

  const renderPreview = () => (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)]">
      {/* Left: Chat & Controls */}
      <div className="w-full lg:w-1/3 border-r border-slate-800 bg-slate-900 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-white">创作助手</h3>
          <span className="text-xs text-slate-500">剩余修改次数: {modificationCredits}</span>
        </div>
        
        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
              <i className="fa-solid fa-robot"></i>
            </div>
            <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none text-sm text-slate-300">
              应用已生成！你可以在右侧预览效果。如果需要调整，请直接告诉我。
            </div>
          </div>
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-slate-700 text-white' : 'bg-brand-500/20 text-brand-400'}`}>
                <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : 'fa-robot'}`}></i>
              </div>
              <div className={`p-3 rounded-2xl text-sm max-w-[80%] ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef}></div>
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <div className="relative">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isGenerating && chatInput.trim() && startGeneration(true)}
              placeholder={modificationCredits <= 0 ? "修改次数已用完" : "例如：把背景改成黑色，按钮变大一点..."}
              disabled={isGenerating || modificationCredits <= 0}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-4 pr-12 py-3 text-white focus:border-brand-500 outline-none disabled:opacity-50"
            />
            <button 
              onClick={() => startGeneration(true)}
              disabled={isGenerating || !chatInput.trim() || modificationCredits <= 0}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-brand-600 hover:bg-brand-500 text-white rounded-lg flex items-center justify-center transition disabled:opacity-50 disabled:bg-slate-700"
            >
              {isGenerating ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-3">
          <button 
            onClick={handleUpload}
            className="w-full py-3 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-cloud-upload"></i> 发布作品
          </button>
          <div className="flex gap-2">
            <button 
              onClick={handleDownload}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition border border-slate-700 flex items-center justify-center gap-2 text-sm"
            >
              <i className="fa-solid fa-download"></i> 下载源码
            </button>
            <button 
              onClick={() => {
                const blob = new Blob([generatedCode], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition border border-slate-700 flex items-center justify-center gap-2 text-sm"
            >
              <i className="fa-solid fa-code"></i> 查看代码
            </button>
          </div>
          <div className="flex items-center text-[10px] text-orange-400 bg-orange-900/20 px-2 rounded border border-orange-500/30 w-full justify-center">
            <i className="fa-solid fa-triangle-exclamation mr-1"></i> 建议下载备份防丢失
          </div>
        </div>
      </div>

      {/* Right: Preview */}
      <div className="flex-1 bg-slate-950 relative flex flex-col group">
        <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
          <span className="text-sm font-bold text-slate-400">预览模式</span>
        </div>
        <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 bg-[url('/grid.svg')]">
          <div 
            style={{ 
              aspectRatio: previewMode === 'desktop' ? 'auto' : previewMode === 'tablet' ? '3/4' : '9/19.5' 
            }}
            className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-slate-900 flex-shrink-0 max-w-full ${
              previewMode === 'desktop' 
                ? 'w-full h-full rounded-none border-0' 
                : previewMode === 'tablet'
                  ? 'h-[75%] md:h-[85%] w-auto rounded-[1.5rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50'
                  : 'h-[70%] md:h-[85%] w-auto rounded-[2.5rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50'
            }`}
          >
             {/* Notch */}
             <div className={`absolute top-0 left-1/2 -translate-x-1/2 bg-slate-800 z-20 transition-all duration-300 ${
                previewMode === 'mobile' ? 'w-24 h-6 rounded-b-xl opacity-100' : 'w-0 h-0 opacity-0'
             }`}></div>
             
             <iframe
               ref={iframeRef}
               srcDoc={generatedCode}
               className="w-full h-full"
               sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
             />
          </div>
          
          {/* Floating Preview Controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition duration-300 z-10">
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full p-1 flex shadow-xl">
              <button onClick={() => setPreviewMode('desktop')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="桌面端"><i className="fa-solid fa-desktop"></i></button>
              <button onClick={() => setPreviewMode('tablet')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="平板端"><i className="fa-solid fa-tablet-screen-button"></i></button>
              <button onClick={() => setPreviewMode('mobile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`} title="移动端"><i className="fa-solid fa-mobile-screen"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen text-white relative">
      {step === 'generating' ? renderGenerating() : 
       step === 'preview' ? renderPreview() : 
       renderWizard()}
    </div>
  );
}
