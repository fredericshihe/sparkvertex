'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { copyToClipboard } from '@/lib/utils';
import { getPreviewContent } from '@/lib/preview';
import { X, RefreshCw, MessageSquare, Eye, Wand2, Edit3, Play } from 'lucide-react';
import { applyPatches } from '@/lib/patch';
import { useLanguage } from '@/context/LanguageContext';
import { QRCodeSVG } from 'qrcode.react';

// --- Constants ---
const CATEGORIES = [
  { id: 'game', icon: 'fa-gamepad' },
  { id: 'design', icon: 'fa-palette' },
  { id: 'productivity', icon: 'fa-list-check' },
  { id: 'tool', icon: 'fa-screwdriver-wrench' },
  { id: 'devtool', icon: 'fa-code' },
  { id: 'entertainment', icon: 'fa-film' },
  { id: 'education', icon: 'fa-graduation-cap' },
  { id: 'visualization', icon: 'fa-chart-pie' },
  { id: 'lifestyle', icon: 'fa-mug-hot' }
];

const DEVICES = [
  { id: 'mobile', icon: 'fa-mobile-screen' },
  { id: 'tablet', icon: 'fa-tablet-screen-button' },
  { id: 'desktop', icon: 'fa-desktop' }
];

const STYLES = [
  { id: 'cyberpunk', color: 'from-pink-500 to-cyan-500' },
  { id: 'minimalist', color: 'from-slate-200 to-slate-400' },
  { id: 'cute', color: 'from-pink-300 to-purple-300' },
  { id: 'business', color: 'from-blue-600 to-indigo-700' },
  { id: 'retro', color: 'from-yellow-400 to-orange-500' },
  { id: 'native', color: 'from-blue-500 to-blue-600' },
  { id: 'glassmorphism', color: 'from-white/20 to-white/10' },
  { id: 'neobrutalism', color: 'from-yellow-300 to-red-500' },
  { id: 'cartoon', color: 'from-orange-300 to-yellow-300' },
  { id: 'lowpoly', color: 'from-indigo-400 to-purple-500' },
  { id: 'dark_fantasy', color: 'from-slate-900 to-purple-900' },
  { id: 'neumorphism', color: 'from-gray-200 to-gray-300' },
  { id: 'industrial', color: 'from-slate-700 to-slate-800' },
  { id: 'swiss', color: 'from-red-500 to-white' },
  { id: 'editorial', color: 'from-stone-100 to-stone-200' },
  { id: 'card', color: 'from-gray-100 to-gray-200' },
  { id: 'bubble', color: 'from-blue-300 to-pink-300' },
  { id: 'material', color: 'from-blue-500 to-indigo-500' },
  { id: 'paper', color: 'from-yellow-50 to-orange-50' },
  { id: 'gamified', color: 'from-purple-400 to-pink-400' },
  { id: 'dark_mode', color: 'from-gray-900 to-black' },
  { id: 'kanban', color: 'from-yellow-100 to-blue-100' }
];

const CATEGORY_STYLES: Record<string, string[]> = {
  game: ['retro', 'cyberpunk', 'cartoon', 'lowpoly', 'dark_fantasy', 'neobrutalism'],
  tool: ['minimalist', 'neumorphism', 'native', 'industrial', 'swiss', 'dark_mode'],
  design: ['minimalist', 'swiss', 'editorial', 'glassmorphism', 'neobrutalism', 'dark_mode'],
  productivity: ['minimalist', 'dark_mode', 'kanban', 'business', 'swiss', 'neumorphism'],
  devtool: ['dark_mode', 'industrial', 'minimalist', 'swiss', 'neobrutalism', 'retro'],
  entertainment: ['glassmorphism', 'dark_fantasy', 'cyberpunk', 'material', 'neumorphism', 'card'],
  education: ['cute', 'business', 'paper', 'gamified', 'minimalist', 'card'],
  visualization: ['dark_mode', 'swiss', 'minimalist', 'industrial', 'glassmorphism', 'card'],
  lifestyle: ['cute', 'bubble', 'minimalist', 'native', 'paper', 'material']
};

const STYLE_PROMPTS: Record<string, string> = {
  cyberpunk: "Design Style: Cyberpunk. Use a dark background (black or very dark blue). Use neon colors like hot pink (#ff00ff), cyan (#00ffff), and bright yellow. Use glitch effects, high contrast, and angular shapes. Font should be futuristic or monospace. Add glowing effects (box-shadow).",
  minimalist: "Design Style: Minimalist. Use plenty of whitespace. Colors should be strictly black, white, and shades of gray. Typography should be clean and sans-serif. No heavy shadows or gradients. Focus on content and layout.",
  cute: "Design Style: Cute/Kawaii. Use pastel colors (soft pink, baby blue, mint green). Use large rounded corners (rounded-3xl). Buttons should be pill-shaped. Add soft, fluffy shadows. Font should be rounded if possible. Use playful icons.",
  business: "Design Style: Business/Corporate. Use a professional color palette (navy blue, dark gray, white). Design should be clean, structured, and trustworthy. Use standard border radii (rounded-md or rounded-lg). Typography should be standard sans-serif (Inter/Roboto).",
  retro: "Design Style: Retro/Pixel Art. Use a limited color palette (CGA/EGA colors). Use a pixelated font (Press Start 2P or similar if available via Google Fonts, otherwise monospace). UI elements should look like 8-bit or 16-bit game interfaces. sharp corners, thick borders.",
  native: "Design Style: Native iOS/Android Replica. Mimic the look and feel of a native mobile app. Use standard system colors (systemBlue, systemGray). Use standard navigation bars, tab bars, and list views. Animations should be smooth (60fps). Use 'San Francisco' style typography.",
  glassmorphism: "Design Style: Glassmorphism. Use semi-transparent backgrounds with backdrop-blur (backdrop-blur-md or backdrop-blur-lg). Use white with low opacity (bg-white/10 or bg-white/20) for cards. Add subtle white borders (border-white/20). Background should be colorful or gradient to show through the glass.",
  neobrutalism: "Design Style: Neo-Brutalism. Use high saturation colors (bright yellow, red, blue). Use thick black borders (border-2 border-black). Use hard shadows (shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]). No border radius or very slight. Typography should be bold and quirky.",
  cartoon: "Design Style: Cartoon/Hand-drawn. Use vibrant, cheerful colors. Use thick, slightly irregular outlines to mimic hand-drawing. Fonts should be playful (like Comic Sans or similar rounded fonts). Buttons should look 'squishy' with bounce animations.",
  lowpoly: "Design Style: Low Poly/Geometric. Use a palette of flat, faceted colors (like a diamond). Backgrounds should use geometric patterns or triangles. Use sharp angles and gradients. Typography should be modern and geometric.",
  dark_fantasy: "Design Style: Dark Fantasy. Use deep purples, crimsons, and blacks. Use serif fonts with a magical feel. Add subtle particle effects or fog animations. UI elements should look like ancient runes or magical artifacts. Borders should be ornate.",
  neumorphism: "Design Style: Neumorphism (Soft UI). Use a light gray or off-white background (#e0e5ec). Buttons and cards should have two shadows: a light one on the top-left and a dark one on the bottom-right, creating a soft, extruded plastic look. No hard borders. Rounded corners are essential.",
  industrial: "Design Style: Industrial/Technical. Use a palette of slate, charcoal, and safety orange/yellow. Use monospaced fonts. UI elements should look like machine controls or blueprints. Use grid lines and technical markings. High contrast.",
  swiss: "Design Style: Swiss Style (International Typographic Style). Use a strict grid system. Use large, bold, sans-serif typography (Helvetica-style). High contrast colors (often red, black, white). Asymmetric layouts. Focus on readability and objectivity.",
  editorial: "Design Style: Editorial/Magazine. Use a sophisticated serif font for headings and a clean sans-serif for body text. Use plenty of whitespace and large margins. Images should be high quality. Layout should feel like a printed fashion or lifestyle magazine. Elegant lines and dividers.",
  card: "Design Style: Card UI/Pinterest-style. Use a masonry or grid layout of cards. Each card should have a subtle shadow and rounded corners. Background should be neutral to let the content shine. Focus on images and visual hierarchy.",
  bubble: "Design Style: Bubble/Chat. Use circular or highly rounded shapes for everything. Use gradients that look like bubbles (blue/pink/purple). Animations should be floaty and smooth. Very friendly and approachable interface.",
  material: "Design Style: Material Design 3. Use the latest Google Material Design guidelines. Use dynamic color extraction (pastel tones). Use the 'surface' system for elevation. Ripple effects on click. FAB (Floating Action Button) is a must.",
  paper: "Design Style: Paper/Sketchbook. Background should look like paper (texture). UI elements should look like sticky notes or sketches. Use a handwriting-style font if possible. Shadows should look like paper lifting off the desk.",
  gamified: "Design Style: Gamified. Use progress bars, badges, and confetti everywhere. Colors should be bright and rewarding (gold, green, purple). Use bouncy animations for feedback. UI should feel like a game HUD.",
  dark_mode: "Design Style: Developer/Dark Mode. Use a pure black or very dark gray background. Syntax highlighting colors for accents. Monospace fonts. Minimalist icons. Focus on data density and clarity. No eye strain.",
  kanban: "Design Style: Kanban/Productivity. Use a board layout with columns. Cards should look like physical sticky notes (yellow, blue, pink). Drag-and-drop affordances (dots). Clean, functional typography."
};

const LOADING_TIPS_DATA = {
  zh: [
    "你知道吗？赛博朋克风格通常使用高对比度的霓虹色。",
    "正在为移动用户优化触摸目标...",
    "正在生成适应不同屏幕尺寸的响应式布局...",
    "正在为卡片应用玻璃拟态效果...",
    "正在确保无障碍对比度...",
    "正在构建组件层级结构...",
    "正在添加交互式悬停状态...",
    "正在打磨动画和过渡效果...",
    "正在检查暗黑模式兼容性...",
    "正在注入 React Hooks 进行状态管理..."
  ],
  en: [
    "Did you know? Cyberpunk style often uses high-contrast neon colors.",
    "Optimizing touch targets for mobile users...",
    "Generating responsive layout for different screen sizes...",
    "Applying glassmorphism effects to cards...",
    "Ensuring accessibility contrast ratios...",
    "Structuring component hierarchy...",
    "Adding interactive hover states...",
    "Polishing animations and transitions...",
    "Checking for dark mode compatibility...",
    "Injecting React hooks for state management..."
  ]
};



const LOADING_MESSAGES_DATA = {
  zh: [
      '正在深度分析您的需求...',
      'AI 正在构思最佳 UI 布局...',
      '正在编写 React 组件逻辑...',
      '正在优化移动端触控响应...',
      '正在配置 Tailwind 美学样式...',
      '正在进行代码安全性检查...',
      '正在做最后的性能优化...',
      '即将完成，准备预览...'
  ],
  en: [
      'Deeply analyzing your requirements...',
      'AI is conceptualizing the best UI layout...',
      'Writing React component logic...',
      'Optimizing touch response for mobile...',
      'Configuring Tailwind aesthetic styles...',
      'Performing code security checks...',
      'Doing final performance optimizations...',
      'Almost done, preparing preview...'
  ]
};

export default function CreatePage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { openLoginModal } = useModal();
  const { success: toastSuccess, error: toastError } = useToast();
  
  const LOADING_TIPS = LOADING_TIPS_DATA[language === 'zh' ? 'zh' : 'en'];
  
  const stepNames = {
    category: language === 'zh' ? '分类' : 'Category',
    device: language === 'zh' ? '设备' : 'Device',
    style: language === 'zh' ? '风格' : 'Style',
    concept: language === 'zh' ? '构思' : 'Concept'
  };
  
  // State: Wizard
  // Merged 'features' and 'desc' into 'concept'
  const [step, setStep] = useState<'category' | 'device' | 'style' | 'concept' | 'generating' | 'preview'>('category');
  const [wizardData, setWizardData] = useState({
    category: '',
    device: 'mobile',
    style: '',
    description: ''
  });

  const currentCategory = wizardData.category || 'tool';
  // @ts-ignore
  const QUICK_TAGS = (t.templates?.[currentCategory] || []).map((item: any) => ({
    label: item.label,
    text: item.desc
  }));

  // State: Generation
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modificationCount, setModificationCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [loadingText, setLoadingText] = useState(t.create.analyzing);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('mobile');
  const [streamingCode, setStreamingCode] = useState('');
  const [currentGenerationPrompt, setCurrentGenerationPrompt] = useState('');
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);
  
  // State: History
  const [codeHistory, setCodeHistory] = useState<{code: string, prompt: string, timestamp: number}[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // State: Point-and-Click Edit
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{tagName: string, className: string, innerText: string, path: string} | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRequest, setEditRequest] = useState('');
  const [hasSeenEditGuide, setHasSeenEditGuide] = useState(false);
  
  // State: Mobile Preview
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [mobilePreviewUrl, setMobilePreviewUrl] = useState('');
  const [activeMobileTab, setActiveMobileTab] = useState<'preview' | 'chat'>('preview');

  // State: User Credits
  const [credits, setCredits] = useState(30);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Spark Creator');

  // State: Credit Modal
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  
  // State: Preview Scaling
  const [previewScale, setPreviewScale] = useState(1);
  
  const STORAGE_KEY = 'spark_create_session_v1';

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  // Update loading text when language changes
  useEffect(() => {
    if (isGenerating) {
      setLoadingText(t.create.analyzing);
    }
  }, [language, t]);

  // Rotating Tips Effect
  useEffect(() => {
    if (step === 'generating') {
      const interval = setInterval(() => {
        setLoadingTipIndex(prev => (prev + 1) % LOADING_TIPS.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [step]);

  // Edit Guide Effect
  useEffect(() => {
    if (step === 'preview' && !hasSeenEditGuide) {
      // Small delay to let UI settle
      const timer = setTimeout(() => {
        // We can show a toast or just rely on the pulse animation
        // toastSuccess(t.create.edit_hint); // Optional: Show toast
        setHasSeenEditGuide(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [step, hasSeenEditGuide]);

  // Effect: Calculate Preview Scale
  useEffect(() => {
    if (step !== 'preview') return;

    const updateScale = () => {
      if (!previewContainerRef.current || previewMode === 'desktop') {
        setPreviewScale(1);
        return;
      }

      const container = previewContainerRef.current;
      const { width: containerW, height: containerH } = container.getBoundingClientRect();
      
      // Target dimensions based on mode
      const targetW = previewMode === 'mobile' ? 375 : 768;
      const targetH = previewMode === 'mobile' ? 812 : 1024;
      
      // Available space (subtract padding)
      const availableW = containerW - 40;
      const availableH = containerH - 120; 

      const scaleW = availableW / targetW;
      const scaleH = availableH / targetH;
      
      const newScale = Math.min(scaleW, scaleH, 1);
      setPreviewScale(newScale);
    };

    window.addEventListener('resize', updateScale);
    updateScale();
    setTimeout(updateScale, 100);

    return () => window.removeEventListener('resize', updateScale);
  }, [step, previewMode]);

  useEffect(() => {
    if (codeScrollRef.current) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [streamingCode]);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        checkAuth();
      }
      if (event === 'SIGNED_OUT') {
        setUserId(null);
      }
    });

    const keepAliveInterval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.debug('Session keep-alive check passed');
        }
      } catch (e) {
        console.error('Keep-alive check failed', e);
      }
    }, 1000 * 60 * 4);

    let profileSubscription: any;

    const setupSubscription = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        if (profileSubscription) supabase.removeChannel(profileSubscription);

        profileSubscription = supabase
          .channel('profile-credits')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
              filter: `id=eq.${session.user.id}`
            },
            (payload) => {
              const newProfile = payload.new as any;
              if (newProfile.credits !== undefined) {
                setCredits(newProfile.credits);
              }
            }
          )
          .subscribe();
      } catch (error) {
        console.error('Failed to setup subscription:', error);
      }
    };

    setupSubscription();

    const authListener = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setupSubscription();
      }
    });

    return () => {
      subscription.unsubscribe();
      authListener.data.subscription.unsubscribe();
      clearInterval(keepAliveInterval);
      if (profileSubscription) supabase.removeChannel(profileSubscription);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'spark-element-selected') {
        setSelectedElement(event.data.payload);
        setShowEditModal(true);
        setIsEditMode(false);
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: false }, '*');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  useEffect(() => {
    const remixData = localStorage.getItem('remix_template');
    if (remixData) {
      try {
        const template = JSON.parse(remixData);
        setWizardData(prev => ({
          ...prev,
          category: template.category || 'tool',
          style: template.style || 'minimalist',
          description: template.prompt || template.description || '',
        }));
        
        if (template.prompt) {
            setStep('concept');
            setTimeout(() => toastSuccess(t.create.template_loaded), 500);
        }
        
        localStorage.removeItem('remix_template');
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.error('Failed to parse remix template', e);
      }
    } else {
      try {
        const savedSession = localStorage.getItem(STORAGE_KEY);
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
            if (parsed.step) setStep(parsed.step);
            if (parsed.wizardData) setWizardData(parsed.wizardData);
            if (parsed.generatedCode) setGeneratedCode(parsed.generatedCode);
            if (parsed.chatHistory) setChatHistory(parsed.chatHistory);
            if (parsed.codeHistory) setCodeHistory(parsed.codeHistory);
            if (parsed.currentGenerationPrompt) setCurrentGenerationPrompt(parsed.currentGenerationPrompt);
            if (parsed.previewMode) setPreviewMode(parsed.previewMode);
            
            if ((parsed.step === 'preview' || parsed.step === 'generating') && parsed.generatedCode) {
               setStreamingCode(parsed.generatedCode);
               if (parsed.step === 'generating') {
                   setStep('preview');
                   setIsGenerating(false);
                   setProgress(100);
               }
            }
            
            setTimeout(() => toastSuccess(language === 'zh' ? '已恢复上次的创作进度' : 'Restored previous session'), 500);
          }
        }
      } catch (e) {
        console.error('Failed to restore session', e);
      }
    }
  }, []);

  useEffect(() => {
    if (step === 'category' && !wizardData.description && !generatedCode) return;

    const stateToSave = {
      step,
      wizardData,
      generatedCode,
      chatHistory,
      codeHistory,
      currentGenerationPrompt,
      previewMode,
      timestamp: Date.now()
    };
    
    const timeoutId = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [step, wizardData, generatedCode, chatHistory, codeHistory, currentGenerationPrompt, previewMode]);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserId(session.user.id);
        
        try {
          const { data: bonusData, error: bonusError } = await supabase.rpc('check_daily_bonus');
          if (bonusData && bonusData.awarded) {
            toastSuccess(`${t.profile.daily_bonus} ${bonusData.credits}`);
          }
        } catch (error) {
          console.error('Failed to check daily rewards:', error);
        }

        const { data } = await supabase
          .from('profiles')
          .select('credits, full_name, username')
          .eq('id', session.user.id)
          .maybeSingle();
          
        if (data) {
          setCredits(Number(data.credits ?? 30));
          setUserName(data.full_name || data.username || 'Spark Creator');
        } else {
          setCredits(30);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const handleExit = () => {
    if (step === 'category' && !wizardData.description) {
      localStorage.removeItem(STORAGE_KEY);
      router.push('/');
      return;
    }
    if (confirm(t.create.confirm_exit)) {
      localStorage.removeItem(STORAGE_KEY);
      router.push('/');
    }
  };

  // --- Wizard Handlers ---
  const handleCategorySelect = (id: string) => {
    setWizardData(prev => ({ ...prev, category: id }));
    setStep('device');
  };

  const handleDeviceSelect = (id: string) => {
    setWizardData(prev => ({ ...prev, device: id }));
    setStep('style');
  };

  const handleStyleSelect = (id: string) => {
    setWizardData(prev => ({ ...prev, style: id }));
    setStep('concept');
  };

  const appendToDescription = (text: string) => {
    setWizardData(prev => {
      const newDesc = prev.description ? `${prev.description}\n${text}` : text;
      return { ...prev, description: newDesc };
    });
  };

  const useMadLibsTemplate = () => {
    // @ts-ignore
    const template = t.madlibs?.[currentCategory] || (language === 'zh' 
      ? "我想做一个 [分类] 应用，主要给 [目标用户] 使用，核心功能是 [功能1] 和 [功能2]。"
      : "I want to build a [Category] app for [Target User]. Core features include [Feature 1] and [Feature 2].");
    appendToDescription(template);
  };

  // --- Generation Logic ---
    const constructPrompt = (isModification = false, modificationRequest = '') => {
    const categoryLabel = t.categories[wizardData.category as keyof typeof t.categories] || 'App';
    const styleLabel = t.styles[wizardData.style as keyof typeof t.styles] || 'Modern';
    const deviceLabel = t.devices[wizardData.device as keyof typeof t.devices] || 'Mobile';
    const stylePrompt = STYLE_PROMPTS[wizardData.style] || '';
    
    // Compact description
    let description = `Type:${categoryLabel}, Device:${deviceLabel}, Style:${styleLabel}. 
    
    ${stylePrompt}
    
    Requirements:${wizardData.description}`;

    if (isModification) {
      return `
# Task
Modify the following React app based on the user's request.

# Request
${modificationRequest}

# Code
${generatedCode}

# Constraints
- Maintain single-file structure.
- Use React 18 and Tailwind CSS.
- Output ONLY the diffs using the <<<<SEARCH ... ==== ... >>>> format.
`;
    }

    const targetLang = language === 'zh' ? 'Chinese' : 'English';

    return `
# Task
Create a "Production-Grade" single-file React app: ${categoryLabel} Generator for ${deviceLabel}.
${description}

# Specs
- Lang: ${targetLang}
- Stack: React 18, Tailwind CSS (CDN).
- Icons: FontAwesome 6 (CDN).
- Device Target: ${deviceLabel} (${wizardData.device === 'mobile' ? 'Mobile-first, touch-friendly' : wizardData.device === 'desktop' ? 'Desktop-optimized, mouse-friendly' : 'Responsive, tablet-friendly'})
- Dark mode (#0f172a)
- Single HTML file, NO markdown.

# Template
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${categoryLabel} App</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdn.staticfile.org/font-awesome/6.4.0/css/all.min.css">
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          border: "hsl(var(--border))",
          input: "hsl(var(--input))",
          ring: "hsl(var(--ring))",
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          primary: {
            DEFAULT: "hsl(var(--primary))",
            foreground: "hsl(var(--primary-foreground))",
          },
          secondary: {
            DEFAULT: "hsl(var(--secondary))",
            foreground: "hsl(var(--secondary-foreground))",
          },
          destructive: {
            DEFAULT: "hsl(var(--destructive))",
            foreground: "hsl(var(--destructive-foreground))",
          },
          muted: {
            DEFAULT: "hsl(var(--muted))",
            foreground: "hsl(var(--muted-foreground))",
          },
          accent: {
            DEFAULT: "hsl(var(--accent))",
            foreground: "hsl(var(--accent-foreground))",
          },
          popover: {
            DEFAULT: "hsl(var(--popover))",
            foreground: "hsl(var(--popover-foreground))",
          },
          card: {
            DEFAULT: "hsl(var(--card))",
            foreground: "hsl(var(--card-foreground))",
          },
        },
        borderRadius: {
          lg: "var(--radius)",
          md: "calc(var(--radius) - 2px)",
          sm: "calc(var(--radius) - 4px)",
        },
      }
    }
  }
</script>
<style>
  :root {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    --radius: 0.5rem;
  }
  body {
    -webkit-user-select: none;
    user-select: none;
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    overflow: hidden;
  }
  ::-webkit-scrollbar { display: none; }
  #root { height: 100vh; width: 100vw; overflow: hidden; }
</style>
<script src="https://cdn.staticfile.org/react/18.2.0/umd/react.production.min.js" crossorigin></script>
<script src="https://cdn.staticfile.org/react-dom/18.2.0/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.zhimg.com/framer-motion@10.16.4/dist/framer-motion.js"></script>
<script src="https://cdn.staticfile.org/babel-standalone/7.23.5/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef, useMemo, useCallback } = React;

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("ErrorBoundary caught an error", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-red-900/20 text-red-200 p-4 text-center">
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <pre className="text-xs bg-black/50 p-4 rounded text-left overflow-auto max-w-full">{this.state.error?.toString()}</pre>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 rounded hover:bg-red-500">Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// YOUR CODE STARTS HERE
const App = () => {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold text-primary animate-bounce">
        Hello World
      </h1>
      <i className="fa-solid fa-star text-yellow-400 text-2xl mt-4"></i>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
</script></body></html>
    `;
  };

  const startGeneration = async (isModificationArg = false, overridePrompt = '', displayPrompt = '') => {
    // Explicitly rely on the argument to determine if it's a modification or a new generation (regenerate)
    const isModification = isModificationArg;
    
    console.log('startGeneration called:', { 
        isModificationArg, 
        isModification, 
        step, 
        overridePrompt,
        stack: new Error().stack 
    });

    // Cost: Modification = 0.5, New Generation / Regenerate = 3.0
    const COST = isModification ? 0.5 : 3.0;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        openLoginModal();
        return;
      }

      if (credits < COST) {
        setIsCreditModalOpen(true);
        return;
      }
    } catch (e) {
      console.error("Pre-flight check failed", e);
      toastError(t.common.error);
      return;
    }

    setIsGenerating(true);
    if (!isModification) {
      setStep('generating');
    }
    setProgress(0);
    setStreamingCode('');
    
    const loadingMessages = t.create.loading_steps || LOADING_MESSAGES_DATA[language === 'zh' ? 'zh' : 'en'];
    
    let messageIndex = 0;
    setLoadingText(loadingMessages[0]);
    
    let hasStartedStreaming = false;

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        let increment = 0;
        
        if (hasStartedStreaming) {
           if (prev < 95) increment = Math.random() * 2 + 1;
           else increment = 0.1;
        } else {
           if (prev < 20) increment = Math.random() * 2 + 1;
           else if (prev < 50) increment = Math.random() * 0.5 + 0.2;
           else if (prev < 75) increment = 0.1;
           else if (prev < 85) increment = 0.05;
           else increment = 0;
        }

        const nextProgress = Math.min(prev + increment, 99);
        
        const totalMessages = loadingMessages.length;
        const messageStage = Math.floor((nextProgress / 100) * totalMessages);
        
        if (messageStage > messageIndex && messageStage < totalMessages) {
            messageIndex = messageStage;
            setLoadingText(loadingMessages[messageIndex]);
        }

        return nextProgress;
      });
    }, 200);


    try {
      const prompt = constructPrompt(isModification, overridePrompt || chatInput);
      
      let promptContent = '';
      if (isModification) {
        promptContent = displayPrompt || overridePrompt || chatInput;
      } else {
        const displayParts = [];
        if (wizardData.description) displayParts.push(wizardData.description);
        
        if (displayParts.length > 0) {
            promptContent = displayParts.join('\n\n');
        } else {
            const catLabel = t.categories[wizardData.category as keyof typeof t.categories] || 'App';
            promptContent = language === 'zh' 
                ? `创建一个${catLabel}应用...` 
                : `Create a ${catLabel} app...`;
        }
      }
      
      if (isModification && generatedCode) {
        setCodeHistory(prev => [...prev, {
            code: generatedCode,
            prompt: currentGenerationPrompt || 'Initial Version',
            timestamp: Date.now()
        }]);
      }

      setCurrentGenerationPrompt(promptContent);

      if (isModification) {
        setChatHistory(prev => [...prev, { role: 'user', content: displayPrompt || overridePrompt || chatInput }]);
        setChatInput('');
        setModificationCount(prev => prev + 1);
      }

      const SYSTEM_PROMPT = isModification ? `You are an expert Senior Software Engineer specializing in refactoring.
Your task is to modify the provided React code based on the user's request.

### Output Format (Strictly Enforced)
Return ONLY the code changes using the custom diff format below. Do not output the full file.

<<<<SEARCH
[Exact code chunk to be replaced]
====
[New code chunk]
>>>>

### Critical Instructions for SEARCH Block:
1. **Exact Match Required**: The content inside <<<<SEARCH ... ==== must match the original code *character-for-character*, including spaces, indentation, and newlines.
2. **Sufficient Context**: Include at least 5-10 lines of unchanged code around the target area to ensure the match is unique.
3. **No Hallucinations**: Do not invent code in the SEARCH block. Copy it exactly from the source.

### Critical Instructions for REPLACE Block:
1. **Valid React Code**: Ensure the new code is valid React/JSX and matches the surrounding indentation.
2. **NO Imports**: Do NOT use \`import\` statements. Use global variables (React, ReactDOM).
3. **Icons**: Use FontAwesome classes (e.g., \`<i className="fa-solid fa-home"></i>\`).
4. **Emoji**: Use direct emojis (🚀) or \\u{...} syntax. NO \\U000... syntax.

### Example:
<<<<SEARCH
  return (
    <div className="p-4">
      <h1>Hello</h1>
    </div>
  );
====
  return (
    <div className="p-4 bg-red-500">
      <h1>Hello World</h1>
      <i className="fa-solid fa-star"></i>
    </div>
  );
>>>>
` : `You are a World-Class Senior Frontend Architect and UI/UX Designer.
Your goal is to create a "Production-Grade", visually stunning, and highly interactive single-file web application.

Target Device: ${wizardData.device === 'desktop' ? 'Desktop (High Density, Mouse Interaction)' : 'Mobile (Touch First, Responsive)'}

### Core Requirements:
1. **Language**: STRICTLY ${language === 'zh' ? 'Simplified Chinese (简体中文)' : 'English'} for all UI text.
2. **Single File Architecture**: Output a single valid HTML file containing CSS, JS (React), and Logic.
3. **No Markdown**: Output ONLY the raw HTML code. Start immediately with <!DOCTYPE html>.
4. **Emoji Usage**: 
   - ❌ STRICTLY FORBIDDEN: Python-style unicode escapes (e.g., \\U0001F440). This causes SyntaxError in JS.
   - ✅ ALLOWED: Direct Emoji characters (e.g., 👀) or ES6 unicode escapes (e.g., \\u{1F440}).
5. **No Unescaped Characters**: Ensure all strings in JavaScript/React are properly escaped. Avoid unescaped backticks (\`) inside template literals.
6. **No Infinite Loops**: Ensure all \`useEffect\` hooks have proper dependency arrays.
7. **Valid HTML Structure**: Ensure all tags are properly closed. Do not nest \`<a>\` inside \`<a>\` or \`<button>\` inside \`<button>\`.
8. **Perfect Rendering**: Ensure the app takes up the full height of the viewport (h-screen, w-full) and handles overflow correctly. Prevent white screens by using Error Boundaries.

### Tech Stack & Imports:
- **React 18**: Use Functional Components, Hooks (useState, useEffect, useMemo, useCallback).
- **Tailwind CSS**: Use for ALL styling. Use arbitrary values (e.g., \`bg-[#1a1a1a]\`) if specific colors are needed.
- **Icons**: Use FontAwesome 6 (CDN). Example: \`<i className="fa-solid fa-home"></i>\`.
- **Images**: MUST use FULL URLs starting with \`https://\`. For placeholders, use \`https://images.unsplash.com/photo-...\` or \`https://placehold.co/600x400\`. NEVER use relative paths.
- **Animations**: Use **Framer Motion** (available via \`window.Motion\`) for complex animations, or Tailwind classes for simple ones.
  - Usage: \`const { motion, AnimatePresence } = window.Motion;\`
- **NO External Libraries**: Do not use libraries not listed above.
- ❌ NO \`import\` or \`require()\`. Use global variables (React, ReactDOM, Motion).

### Design System & UX (The "Wow" Factor):
- **Visual Style**: Modern, Clean, and Consistent. Use subtle shadows, rounded corners, and plenty of whitespace.
- **Color Palette**: Use a professional, harmonious color palette. Avoid default HTML colors.
- **Interactions**: Add hover effects and transitions to interactive elements.
- **Mobile Specifics** (if mobile):
  - Bottom Navigation Bar for main tabs.
  - Large touch targets (min-h-[44px]).
  - \`pb-safe\` for iPhone Home Indicator area.

### Code Quality Standards:
- **Error Handling**: Wrap main logic in try-catch blocks. UI should not crash on error.
- **State Management**: Use simple but effective state. Avoid prop drilling where possible.
- **Performance**: Cleanup event listeners in \`useEffect\`.

### Execution Steps:
1. **Analyze**: Understand the user's request deeply. What is the core value?
2. **Design**: Plan the component structure (Header, Main, Sidebar/Nav, Modals).
3. **Implement**: Write the code with the constraints above.`;

      const TECHNICAL_CONSTRAINTS = `
### Technical Constraints (MUST FOLLOW):
1. **Single File**: Output ONLY a single valid HTML file. No Markdown.
2. **Imports**: NO \`import\` statements. Use global variables (React, ReactDOM, Motion).
3. **Icons**: Use FontAwesome classes (e.g., \`<i className="fa-solid fa-home"></i>\`).
4. **Images**: Use ABSOLUTE URLs (https://...).
5. **Styling**: Use Tailwind CSS classes.
5. **Fonts**: ❌ STRICTLY FORBIDDEN: \`fonts.googleapis.com\` or any external font services. USE SYSTEM FONTS ONLY (e.g., font-sans, font-mono).
6. **Emoji**: DO NOT use Python-style unicode escapes (e.g., \\U0001F440). Use direct Emoji characters or ES6 unicode escapes (e.g., \\u{1F440}).
7. **String Escaping**: Properly escape backticks and quotes in JavaScript strings.
8. **React Hooks**: Ensure \`useEffect\` dependencies are correct to prevent infinite loops.
`;

      const finalUserPrompt = isModification 
        ? `Here is the current code:\n\n${generatedCode}\n\nUser Modification Request:\n${prompt}\n\nPlease modify the code according to the request. Output ONLY the diffs using the <<<<SEARCH ... ==== ... >>>> format.`
        : prompt;

      const dbPrompt = isModification ? prompt : finalUserPrompt;

      console.log('Calling /api/generate with prompt length:', dbPrompt.length);

      let response: Response;
      try {
        response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({
            type: isModification ? 'modification' : 'generation',
            system_prompt: SYSTEM_PROMPT,
            user_prompt: dbPrompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(errorData.error || `Generation failed: ${response.status}`);
        }
      } catch (e: any) {
          console.error('Failed to call /api/generate:', e);
          if (e.message === 'Load failed' || e.message === 'Failed to fetch') {
              throw new Error(t.common.unknown_error);
          }
          throw e;
      }

      const { taskId } = await response.json();
      
      setCredits(prev => Math.max(0, prev - COST));
      // checkAuth(); // Removed to prevent overwriting optimistic update with stale DB data

      const { data: { session } } = await supabase.auth.getSession();
      
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-app-async`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
            taskId, 
            system_prompt: SYSTEM_PROMPT, 
            user_prompt: finalUserPrompt, 
            type: isModification ? 'modification' : 'generation'
        })
      }).then(async (res) => {
          if (!res.ok) {
              const errText = await res.text();
              console.error('Edge Function Error:', res.status, errText);
              toastError(`${t.common.error}: ${res.status}`);
              setIsGenerating(false);
              return;
          }
          
          try {
              const reader = res.body?.getReader();
              if (reader) {
                  while (true) {
                      const { done } = await reader.read();
                      if (done) break;
                  }
              }
          } catch (streamErr) {
              console.log('Stream reading ended:', streamErr);
          }
      }).catch(err => {
          console.error('Trigger error:', err);
          toastError(t.common.unknown_error);
          setIsGenerating(false);
      });

      let isFinished = false;
      let pollInterval: NodeJS.Timeout;
      let lastUpdateTimestamp = Date.now();

      const handleTaskUpdate = (newTask: any) => {
        if (isFinished) return;
        lastUpdateTimestamp = Date.now();

        console.log('Task Update:', newTask.status, newTask.result_code?.length || 0, newTask.error_message);

        if (newTask.result_code && newTask.status === 'processing') {
            setStreamingCode(newTask.result_code);
            hasStartedStreaming = true;
        }
        
        if (newTask.status === 'completed') {
            isFinished = true;
            clearInterval(progressInterval);
            if (pollInterval) clearInterval(pollInterval);
            supabase.removeChannel(channel);

            checkAuth();
            let cleanCode = newTask.result_code || '';
            
            // SAFETY FIX: Remove Python-style Unicode escapes that crash JS
            // Replaces \U0001F600 with \u{1F600}
            cleanCode = cleanCode.replace(/\\U([0-9a-fA-F]{8})/g, (match: string, p1: string) => {
                return '\\u{' + p1.replace(/^0+/, '') + '}';
            });

            // SAFETY FIX: Remove Google Fonts & Preconnects (China Blocking Issue)
            cleanCode = cleanCode.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
            
            // OPTIMIZATION: Replace cdnjs with cdn.staticfile.org for FontAwesome
            cleanCode = cleanCode.replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/g, 'https://cdn.staticfile.org/font-awesome');

            setStreamingCode(cleanCode);
            
            if (isModification) {
                try {
                    console.log('Applying patches. Source length:', generatedCode.length, 'Patch length:', cleanCode.length);
                    const patched = applyPatches(generatedCode, cleanCode);
                    
                    if (patched === generatedCode) {
                        console.warn('Patch applied but code is unchanged.');
                        if (!cleanCode.includes('<<<<SEARCH')) {
                             throw new Error(language === 'zh' ? 'AI 未返回有效的修改代码块' : 'AI did not return valid modification blocks');
                        } else {
                             throw new Error(language === 'zh' ? '找到修改块但无法应用（上下文不匹配）' : 'Found modification blocks but could not apply them (context mismatch)');
                        }
                    }

                    setGeneratedCode(patched);
                    toastSuccess(t.create.success_edit);
                } catch (e: any) {
                    console.error('Patch failed:', e);
                    toastError(e.message || t.common.error);
                }
            } else {
                cleanCode = cleanCode.replace(/```html/g, '').replace(/```/g, '');
                
                // SAFETY FIX: Remove Python-style Unicode escapes that crash JS
                cleanCode = cleanCode.replace(/\\U([0-9a-fA-F]{8})/g, (match: string, p1: string) => {
                    return '\\u{' + p1.replace(/^0+/, '') + '}';
                });

                // SAFETY FIX: Remove Google Fonts & Preconnects (China Blocking Issue)
                cleanCode = cleanCode.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');

                // OPTIMIZATION: Replace cdnjs with cdn.staticfile.org for FontAwesome
                cleanCode = cleanCode.replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/g, 'https://cdn.staticfile.org/font-awesome');

                if (!cleanCode.includes('<meta name="viewport"')) {
                    cleanCode = cleanCode.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />');
                }

                setGeneratedCode(cleanCode);
                setStep('preview');
                setPreviewMode(wizardData.device as any);
            }
            
            setIsGenerating(false);
            setProgress(100);
        } else if (newTask.status === 'failed') {
            isFinished = true;
            clearInterval(progressInterval);
            if (pollInterval) clearInterval(pollInterval);
            supabase.removeChannel(channel);
            
            toastError(newTask.error_message || t.common.error);
            setLoadingText(`${t.common.error}: ${newTask.error_message || t.common.unknown_error}`);
            setIsGenerating(false);
            setProgress(100);
        }
      };

      const channel = supabase
        .channel(`task-${taskId}`)
        .on(
          'broadcast',
          { event: 'chunk' },
          (payload) => {
             const { fullContent } = payload.payload;
             if (fullContent) {
                 setStreamingCode(fullContent);
                 hasStartedStreaming = true;
                 lastUpdateTimestamp = Date.now();
             }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'generation_tasks',
            filter: `id=eq.${taskId}`
          },
          (payload) => {
            handleTaskUpdate(payload.new);
          }
        )
        .subscribe();

      let isPolling = false;
      pollInterval = setInterval(async () => {
        if (isFinished || isPolling) return;
        
        if (Date.now() - lastUpdateTimestamp < 5000) return;

        isPolling = true;
        try {
            const { data, error } = await supabase.from('generation_tasks').select('*').eq('id', taskId).single();
            if (data && !error) {
                handleTaskUpdate(data);
            }
        } catch (e) {
            console.warn('Polling failed:', e);
        } finally {
            isPolling = false;
        }
      }, 3000);

    } catch (error: any) {
      console.error('Generation error:', error);
      toastError(error.message || t.create.generation_failed);
      
      if (!isModification) {
        setStep('concept');
      }
      setIsGenerating(false);
      clearInterval(progressInterval);
    }
  };

  const handleUpload = () => {
    if (!confirm(t.create.confirm_publish)) {
      return;
    }
    try {
      localStorage.setItem('spark_generated_code', generatedCode);
      localStorage.setItem('spark_generated_meta', JSON.stringify({
        title: `${t.categories[wizardData.category as keyof typeof t.categories] || 'App'}`,
        description: wizardData.description,
        tags: [wizardData.category, wizardData.style]
      }));
      router.push('/upload?from=create');
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      toastError(t.common.error);
    }
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
    toastSuccess(t.create.success_download);
  };

  const handleRollback = (item: typeof codeHistory[0]) => {
    if (!confirm(t.create.confirm_rollback)) return;

    const isAlreadyInHistory = codeHistory.some(h => h.code === generatedCode);
    
    if (!isAlreadyInHistory) {
      setCodeHistory(prev => [...prev, {
          code: generatedCode,
          prompt: currentGenerationPrompt || 'Before Rollback',
          timestamp: Date.now()
      }]);
    }
    
    setGeneratedCode(item.code);
    setStreamingCode(item.code);
    setCurrentGenerationPrompt(item.prompt);
    setShowHistoryModal(false);
    toastSuccess(t.create.success_rollback);
  };

  const toggleEditMode = () => {
    const newMode = !isEditMode;
    setIsEditMode(newMode);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: newMode }, '*');
    }
    if (newMode) {
        toastSuccess(t.create.edit_hint);
    }
  };

  const handleElementEditSubmit = () => {
    if (!selectedElement || !editRequest.trim()) return;
    
    const prompt = `
I want to modify a specific element in the UI.

Target Element Details:
- Tag: <${selectedElement.tagName}>
- Text Content: "${selectedElement.innerText}"
- Current Classes: "${selectedElement.className}"
- DOM Path: ${selectedElement.path}

Modification Request:
"${editRequest}"

Please apply this change to the code. Ensure the modification is precise and affects only the intended element or logic.
    `.trim();

    setShowEditModal(false);
    setEditRequest('');
    setSelectedElement(null);
    
    startGeneration(true, prompt, editRequest);
  };

  const handleMobilePreview = async () => {
    if (!generatedCode) return;
    
    try {
      const { data, error } = await supabase
        .from('temp_previews')
        .insert({ content: generatedCode })
        .select()
        .single();
        
      if (error) throw error;
      
      const url = `${window.location.origin}/preview/mobile/${data.id}`;
      setMobilePreviewUrl(url);
      setShowMobilePreview(true);
      
    } catch (error) {
      console.error('Failed to create mobile preview:', error);
      toastError(t.common.error);
    }
  };

  const renderHistoryModal = () => {
    if (!showHistoryModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-white">{t.create.history}</h3>
            <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {codeHistory.length === 0 ? (
              <div className="text-center text-slate-500 py-8">{t.create.no_history}</div>
            ) : (
              [...codeHistory].reverse().map((item, index) => (
                <div key={item.timestamp} className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-brand-500 transition group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(item.timestamp).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')} 
                      <span className="ml-2 opacity-50">{new Date(item.timestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    </span>
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                      v{codeHistory.length - index}
                    </span>
                  </div>
                  <p className="text-sm text-white line-clamp-2 mb-3">{item.prompt}</p>
                  <button 
                    onClick={() => handleRollback(item)}
                    className="w-full py-2 bg-slate-700 hover:bg-brand-600 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-clock-rotate-left"></i> {t.create.restore_version}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderWizard = () => (
    <div className="max-w-4xl mx-auto pt-12 pb-12 px-4 min-h-screen flex flex-col">
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 shadow-2xl animate-fade-in relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-500/50 to-transparent"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Progress Steps */}
        <div className="flex justify-between mb-12 relative max-w-lg mx-auto w-full z-10">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-800 -z-10 rounded-full"></div>
          {['category', 'device', 'style', 'concept'].map((s, i) => {
            const steps = ['category', 'device', 'style', 'concept'];
            const currentIndex = steps.indexOf(step);
            const stepIndex = steps.indexOf(s);
            const isActive = stepIndex <= currentIndex;
            
            return (
              <div key={s} className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-4 ${isActive ? 'bg-brand-500 border-slate-900 text-white shadow-[0_0_15px_rgba(14,165,233,0.5)] scale-110' : 'bg-slate-800 border-slate-900 text-slate-500'}`}>
                  {i + 1}
                </div>
                <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${isActive ? 'text-brand-400' : 'text-slate-600'}`}>
                  {stepNames[s as keyof typeof stepNames]}
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative z-10 min-h-[400px] flex flex-col justify-center">
          {step === 'category' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">{t.create.category_title}</h2>
                <p className="text-slate-400">{t.create.category_subtitle}</p>
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
                    <h3 className="text-xl font-bold text-white mb-2">{t.categories[cat.id as keyof typeof t.categories]}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{t.categories[`${cat.id}_desc` as keyof typeof t.categories]}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'device' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">{t.create.device_title}</h2>
                <p className="text-slate-400">{t.create.device_subtitle}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {DEVICES.map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => handleDeviceSelect(dev.id)}
                    className="p-6 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-brand-500 rounded-2xl transition-all group text-left hover:shadow-lg hover:-translate-y-1"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-4 group-hover:scale-110 transition shadow-inner">
                      <i className={`fa-solid ${dev.icon} text-2xl text-brand-400`}></i>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{t.devices[dev.id as keyof typeof t.devices]}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{t.devices[`${dev.id}_desc` as keyof typeof t.devices]}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-center pt-4">
                <button onClick={() => setStep('category')} className="text-slate-400 hover:text-white text-sm flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800 transition">
                  <i className="fa-solid fa-arrow-left"></i> {t.create.btn_back}
                </button>
              </div>
            </div>
          )}

          {step === 'style' && (
            <div className="space-y-8 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">{t.create.style_title}</h2>
                <p className="text-slate-400">{t.create.style_subtitle}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {STYLES.filter(s => {
                  const allowed = CATEGORY_STYLES[wizardData.category] || [];
                  if (allowed.length === 0) return STYLES.indexOf(s) < 8;
                  return allowed.includes(s.id);
                }).map(style => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style.id)}
                    className="p-6 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-brand-500 rounded-2xl transition-all group relative overflow-hidden hover:shadow-lg hover:-translate-y-1"
                  >
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br ${style.color} transition duration-500`}></div>
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <h3 className="text-xl font-bold text-white">{t.styles[style.id as keyof typeof t.styles]}</h3>
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${style.color} shadow-lg`}></div>
                    </div>
                    <p className="text-sm text-slate-400 relative z-10">{t.styles[`${style.id}_desc` as keyof typeof t.styles]}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-center pt-4">
                <button onClick={() => setStep('device')} className="text-slate-400 hover:text-white text-sm flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800 transition">
                  <i className="fa-solid fa-arrow-left"></i> {t.create.btn_back}
                </button>
              </div>
            </div>
          )}

          {step === 'concept' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-white">{language === 'zh' ? '描述您的应用构思' : 'Describe your App Concept'}</h2>
                <p className="text-slate-400">{language === 'zh' ? '越详细的描述，生成的应用越精准。您也可以使用下方的快捷标签。' : 'The more detailed the description, the better the result. You can also use the quick tags below.'}</p>
              </div>
              
              {/* Main Input */}
              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 focus-within:border-brand-500 transition-colors relative overflow-hidden">
                <textarea
                  value={wizardData.description}
                  onChange={(e) => setWizardData(prev => ({ ...prev, description: e.target.value }))}
                  maxLength={5000}
                  // @ts-ignore
                  placeholder={t.placeholders?.[currentCategory] || (language === 'zh' ? '例如：我想做一个待办事项应用，风格要极简，支持暗黑模式...' : 'E.g. I want to build a Todo app, minimalist style, dark mode support...')}
                  className="w-full h-48 bg-transparent border-none outline-none appearance-none p-4 text-white placeholder-slate-500 focus:ring-0 resize-none text-base leading-relaxed"
                ></textarea>
                
                {/* Mad Libs Button */}
                <div className="absolute bottom-4 left-4">
                   <button 
                     onClick={useMadLibsTemplate}
                     className="text-xs bg-slate-800 hover:bg-slate-700 text-brand-400 px-3 py-1.5 rounded-lg transition flex items-center gap-1 border border-slate-700"
                   >
                     <Edit3 size={12} />
                     {language === 'zh' ? '使用填空模板' : 'Use Template'}
                   </button>
                </div>

                <div className="absolute bottom-4 right-4 text-xs text-slate-500">
                  {wizardData.description.length}/5000
                </div>
              </div>

              {/* Quick Tags */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Wand2 size={12} /> {language === 'zh' ? '快捷标签' : 'Quick Tags'}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map((tag: any, index: number) => (
                    <button
                      key={index}
                      onClick={() => appendToDescription(tag.text)}
                      className="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 hover:border-brand-500 hover:bg-slate-700 transition text-xs text-slate-300 hover:text-white"
                    >
                      + {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setStep('style')}
                  className="flex-1 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  {t.create.btn_back}
                </button>
                <button
                  onClick={() => startGeneration()}
                  disabled={!wizardData.description}
                  className={`flex-1 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-brand-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                >
                  <span>{t.create.btn_generate}</span>
                  <Wand2 size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] pt-0 pb-8 px-4 w-full max-w-2xl mx-auto">
      <div className="w-full bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-brand-500 via-purple-500 to-brand-500 w-full animate-pulse"></div>
        
        <div className="space-y-8">
          {/* User Message Bubble */}
          <div className="flex gap-4 flex-row-reverse animate-slide-up">
            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 border-2 border-slate-600 shadow-lg">
              <i className="fa-solid fa-user text-white text-lg"></i>
            </div>
            <div className="bg-gradient-to-br from-brand-600 to-brand-700 text-white p-5 rounded-2xl rounded-tr-none shadow-lg max-w-[85%] relative group">
              <div className="absolute -right-2 top-0 w-4 h-4 bg-brand-700 transform rotate-45"></div>
              <p className="text-xs font-bold text-brand-200 mb-2 uppercase tracking-wider">{t.create.my_request}</p>
              <p className="text-sm leading-relaxed opacity-95 whitespace-pre-wrap">
                {currentGenerationPrompt}
              </p>
            </div>
          </div>

          {/* AI Thinking Bubble & Skeleton */}
          <div className="flex gap-4 animate-slide-up" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 border-2 border-brand-500/30 relative shadow-lg shadow-brand-500/20">
              <i className="fa-solid fa-robot text-brand-400 text-lg animate-bounce"></i>
              <div className="absolute inset-0 rounded-full border-2 border-brand-500/50 animate-ping opacity-20"></div>
            </div>
            <div className="bg-slate-800/80 border border-slate-700 text-slate-300 p-5 rounded-2xl rounded-tl-none shadow-lg max-w-[85%] relative w-full">
              <div className="absolute -left-2 top-0 w-4 h-4 bg-slate-800 transform rotate-45 border-l border-t border-slate-700"></div>
              
              {/* Rotating Tips */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">{t.create.ai_thinking}</span>
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"></div>
                </div>
              </div>
              
              <div className="min-h-[3em] mb-4">
                 <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-slate-400 transition-all duration-500 animate-fade-in">
                        {LOADING_TIPS[loadingTipIndex]}
                    </p>
                    <span className="text-xs font-bold font-mono transition-colors duration-300" style={{ color: `hsl(${progress * 1.2}, 85%, 60%)` }}>
                        {Math.round(progress)}%
                    </span>
                 </div>
                 <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div 
                        className="h-full transition-all duration-300 ease-out" 
                        style={{ 
                            width: `${progress}%`,
                            backgroundColor: `hsl(${progress * 1.2}, 85%, 60%)`,
                            boxShadow: `0 0 10px hsl(${progress * 1.2}, 85%, 50%)`
                        }}
                    ></div>
                 </div>
              </div>

              {/* Skeleton Preview */}
              {!streamingCode && (
                  <div className="border border-slate-700 rounded-lg p-4 bg-slate-900/50 space-y-3 animate-pulse opacity-50">
                      <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                      <div className="h-32 bg-slate-700 rounded w-full"></div>
                      <div className="flex gap-2">
                          <div className="h-8 bg-slate-700 rounded w-1/3"></div>
                          <div className="h-8 bg-slate-700 rounded w-1/3"></div>
                      </div>
                  </div>
              )}
              
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
    </div>
  );

  const renderPreview = () => (
    <div className="flex flex-col lg:flex-row h-full pt-0 overflow-hidden relative">
      {/* Left (Desktop) / Bottom (Mobile): Chat & Controls */}
      <div className={`w-full lg:w-1/3 border-r border-slate-800 bg-slate-900 flex flex-col 
          order-2 lg:order-1 
          h-full shrink-0 z-10 relative shadow-[0_-4px_20px_rgba(0,0,0,0.3)] lg:shadow-none
          ${activeMobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}
      `}>
        
        <div className="p-3 lg:p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={handleExit} className="hidden lg:flex w-8 h-8 items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition" title={t.common.back}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <h3 className="font-bold text-white text-sm lg:text-base">{t.create.preview_title}</h3>
          </div>
          <div className="flex items-center gap-2">
             {/* Regenerate Button */}
             <div className="relative group">
               <button 
                  onClick={() => startGeneration(false, currentGenerationPrompt)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded flex items-center gap-1 transition border border-slate-700"
               >
                  <RefreshCw size={12} />
                  <span className="hidden sm:inline">{t.create.regenerate}</span>
               </button>
               <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-slate-800 text-xs text-slate-300 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 border border-slate-700">
                  <div className="font-bold text-white mb-1 flex items-center gap-2">
                    <RefreshCw size={10} />
                    {language === 'zh' ? '重新生成' : 'Regenerate'}
                  </div>
                  <p className="leading-relaxed opacity-90">
                    {language === 'zh' 
                      ? '使用当前的提示词和设置重新生成应用。如果对当前结果不满意（如布局错乱、功能缺失），可以尝试此操作。这将消耗积分。' 
                      : 'Regenerate the app using the current prompt and settings. Use this if the current result is not ideal (e.g., layout issues, missing features). This will consume credits.'}
                  </p>
               </div>
             </div>
             <span className="text-[10px] lg:text-xs text-slate-500">{Number.isInteger(credits) ? credits : credits.toFixed(1)} {language === 'zh' ? '积分' : 'Credits'}</span>
          </div>
        </div>
        
        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4 bg-slate-900">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
              <i className="fa-solid fa-robot"></i>
            </div>
            <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none text-sm text-slate-300">
              {t.create.app_generated}
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
          
          {isGenerating && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
                <i className="fa-solid fa-robot fa-bounce"></i>
              </div>
              <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none text-sm text-slate-300 w-full border border-brand-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-brand-400">{t.create.ai_thinking}</span>
                  <span className="text-xs text-slate-500">{Math.floor(progress)}%</span>
                </div>
                <p className="text-xs text-slate-400 mb-2">{loadingText}</p>
                {streamingCode && (
                  <div className="bg-slate-950 rounded p-2 font-mono text-[10px] text-green-400 h-24 overflow-hidden relative opacity-80">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent pointer-events-none"></div>
                    <pre className="whitespace-pre-wrap break-all">
                      {streamingCode.slice(-300)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div ref={chatEndRef}></div>
        </div>

        {/* Input Area */}
        <div className="p-3 lg:p-4 border-t border-slate-800 bg-slate-900 pb-safe shrink-0 mb-16 lg:mb-0">
          <div className="relative">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isGenerating && chatInput.trim() && startGeneration(true)}
              placeholder={t.create.chat_placeholder}
              disabled={isGenerating}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-4 pr-12 py-2 lg:py-3 text-sm lg:text-base text-white focus:border-brand-500 outline-none disabled:opacity-50"
            />
            <button 
              onClick={() => startGeneration(true)}
              disabled={isGenerating || !chatInput.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-brand-600 hover:bg-brand-500 text-white rounded-lg flex items-center justify-center transition disabled:opacity-50 disabled:bg-slate-700"
            >
              {isGenerating ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>}
            </button>
          </div>
        </div>

        {/* Actions - Hidden on mobile to save space, or simplified */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-3 hidden lg:block shrink-0">
          <button 
            onClick={handleUpload}
            className="w-full py-3 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-rocket"></i> {t.create.publish}
          </button>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowHistoryModal(true)}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition border border-slate-700 flex items-center justify-center gap-2 text-sm"
            >
              <i className="fa-solid fa-clock-rotate-left"></i> {t.create.history}
            </button>
            <button 
              onClick={handleDownload}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition border border-slate-700 flex items-center justify-center gap-2 text-sm"
            >
              <i className="fa-solid fa-download"></i> {t.create.download}
            </button>
            <button 
              onClick={() => {
                const blob = new Blob([generatedCode], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition border border-slate-700 flex items-center justify-center gap-2 text-sm"
            >
              <i className="fa-solid fa-code"></i> {t.create.view_code}
            </button>
          </div>
        </div>
      </div>

      {/* Right (Desktop) / Top (Mobile): Preview */}
      <div className={`flex-1 bg-slate-950 relative flex flex-col group 
          order-1 lg:order-2 
          h-full shrink-0 overflow-hidden
          ${activeMobileTab === 'preview' ? 'flex' : 'hidden lg:flex'}
      `}>
        <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={handleExit} className="lg:hidden flex w-6 h-6 items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition" title={t.common.back}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span className="text-sm font-bold text-slate-400">{t.create.preview_mode}</span>
          </div>
          <div className="flex lg:hidden gap-2">
             <button onClick={handleUpload} className="text-xs px-3 py-1 rounded text-white flex items-center gap-1 bg-brand-600">
                {t.common.submit}
             </button>
          </div>
        </div>
        
        {/* Preview Container */}
        <div 
          ref={previewContainerRef}
          className="flex-1 relative overflow-hidden flex items-center justify-center bg-[url('/grid.svg')] bg-center pb-16 lg:pb-0"
        >
          <div 
            className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-slate-900 flex-shrink-0 origin-center
              ${previewMode === 'mobile' 
                ? 'w-[375px] h-[812px] rounded-[3rem] border-[8px] border-slate-800 ring-1 ring-slate-700/50' 
                : ''}
              ${previewMode === 'tablet' 
                ? 'w-[768px] h-[1024px] rounded-[2rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50' 
                : ''}
              ${previewMode === 'desktop' 
                ? 'w-full h-full rounded-none border-0' 
                : ''}
            `}
            style={{
              transform: previewMode !== 'desktop' ? `scale(${previewScale})` : 'none'
            }}
          >
             {previewMode === 'mobile' && (
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-slate-800 rounded-b-2xl z-20 pointer-events-none"></div>
             )}
             
             <iframe
               ref={iframeRef}
               srcDoc={getPreviewContent(generatedCode)}
               className="w-full h-full bg-slate-900"
               sandbox="allow-scripts allow-forms allow-modals allow-popups"
             />
          </div>
          
          {/* Floating Preview Controls */}
          <div className="absolute bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10 w-max max-w-full px-4">
            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-full p-1.5 flex shadow-2xl">
              <button onClick={() => setPreviewMode('desktop')} className={`w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title={t.devices.desktop}><i className="fa-solid fa-desktop text-xs lg:text-sm"></i></button>
              <button onClick={() => setPreviewMode('tablet')} className={`w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title={t.devices.tablet}><i className="fa-solid fa-tablet-screen-button text-xs lg:text-sm"></i></button>
              <button onClick={() => setPreviewMode('mobile')} className={`w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title={t.devices.mobile}><i className="fa-solid fa-mobile-screen text-xs lg:text-sm"></i></button>
            </div>

            <div className="w-px h-8 bg-slate-700/50 mx-1"></div>

            <button 
                onClick={handleMobilePreview}
                className="w-11 h-11 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition hover:bg-slate-800 shadow-xl group" 
                title={t.create.mobile_preview}
            >
                <i className="fa-solid fa-qrcode text-sm group-hover:scale-110 transition"></i>
            </button>

            <button 
                onClick={toggleEditMode}
                className={`h-11 px-5 rounded-full flex items-center gap-2.5 font-bold transition-all shadow-xl border ${
                    isEditMode 
                    ? 'bg-gradient-to-r from-brand-600 to-purple-600 border-transparent text-white ring-2 ring-brand-500/30 scale-105' 
                    : 'bg-slate-900/90 backdrop-blur-md border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-600 group'
                }`}
            >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isEditMode ? 'bg-white/20' : 'bg-brand-500/20 group-hover:bg-brand-500/30'}`}>
                    <i className={`fa-solid ${isEditMode ? 'fa-check text-white' : 'fa-arrow-pointer text-brand-400'} ${isEditMode ? '' : 'animate-pulse'}`}></i>
                </div>
                <span className="text-sm whitespace-nowrap">{isEditMode ? t.create.finish_edit : t.create.edit_mode}</span>
            </button>
          </div>

          {isGenerating && (
            <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-white animate-fade-in">
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center max-w-xs text-center">
                  {/* Dynamic Icon based on mode */}
                  <div className="relative mb-4">
                     <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                     <div className="absolute inset-0 flex items-center justify-center">
                        <i className={`fa-solid ${step === 'preview' ? 'fa-wand-magic-sparkles' : 'fa-robot'} text-brand-500 text-xs animate-pulse`}></i>
                     </div>
                  </div>
                  
                  <p className="font-bold text-lg text-white">
                    {step === 'preview' 
                        ? (language === 'zh' ? '正在优化应用...' : 'Refining App...') 
                        : t.create.generating_title}
                  </p>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                    {step === 'preview'
                        ? (language === 'zh' ? 'AI 正在根据您的反馈调整代码，请稍候...' : 'AI is adjusting the code based on your feedback, please wait...')
                        : t.create.generating_subtitle}
                  </p>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-800 flex z-50 pb-safe">
        <button 
          onClick={() => setActiveMobileTab('preview')}
          className={`flex-1 py-3 flex flex-col items-center gap-1 ${activeMobileTab === 'preview' ? 'text-brand-400' : 'text-slate-500'}`}
        >
          <Eye size={20} />
          <span className="text-[10px] font-bold">{t.create.preview_mode}</span>
        </button>
        <button 
          onClick={() => setActiveMobileTab('chat')}
          className={`flex-1 py-3 flex flex-col items-center gap-1 ${activeMobileTab === 'chat' ? 'text-brand-400' : 'text-slate-500'}`}
        >
          <MessageSquare size={20} />
          <span className="text-[10px] font-bold">{t.create.chat_mode}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen text-white relative ${step === 'preview' ? 'h-screen overflow-hidden' : ''}`}>
      {step !== 'preview' && (
        <button 
          onClick={handleExit}
          className="fixed top-6 left-6 z-50 w-10 h-10 bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full flex items-center justify-center transition backdrop-blur-md border border-slate-700/50"
          title={t.create.exit_creation}
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
      )}

      {step === 'generating' ? renderGenerating() : 
       step === 'preview' ? renderPreview() : 
       renderWizard()}

      {isCreditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1a1b26] border border-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl transform transition-all">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-triangle-exclamation text-2xl text-red-500"></i>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {t.create.error_credits}
              </h3>
              <p className="text-gray-400">
                {t.create.error_credits_desc}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setIsCreditModalOpen(false)}
                className="flex-1 px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors"
              >
                {t.common.later}
              </button>
              <button
                onClick={() => router.push('/profile')}
                className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all shadow-lg shadow-blue-900/20"
              >
                {t.create.get_credits}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedElement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-lg w-full shadow-2xl animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-pen-to-square text-brand-500"></i>
                {t.create.edit_element_title}
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white transition">
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-4 mb-4 border border-slate-700/50">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">{t.create.edit_element_selected}</div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded text-xs font-mono border border-brand-500/30">
                  &lt;{selectedElement.tagName.toLowerCase()}&gt;
                </span>
                {selectedElement.className && (
                  <span className="text-slate-400 text-xs truncate max-w-[200px]" title={selectedElement.className}>
                    .{selectedElement.className.split(' ')[0]}...
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-300 italic border-l-2 border-slate-600 pl-2 py-1 mt-2 line-clamp-2">
                "{selectedElement.innerText.substring(0, 100) || t.create.no_text_content}"
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t.create.edit_element_label}
              </label>
              <textarea
                value={editRequest}
                onChange={(e) => setEditRequest(e.target.value)}
                placeholder={t.create.edit_element_placeholder}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-h-[100px] resize-none"
                autoFocus
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleElementEditSubmit}
                disabled={!editRequest.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-all shadow-lg shadow-brand-900/20 flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
                {t.create.btn_generate_edit}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobilePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center relative">
            <button 
              onClick={() => setShowMobilePreview(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={24} />
            </button>
            
            <h3 className="text-xl font-bold text-slate-900 mb-2">{t.create.mobile_preview_title}</h3>
            <p className="text-sm text-slate-500 mb-6 text-center">
              {t.create.mobile_preview_desc}
            </p>
            
            <div className="bg-white p-2 rounded-xl border-2 border-slate-100 shadow-inner mb-6">
              <QRCodeSVG 
                value={mobilePreviewUrl} 
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full">
              <i className="fa-solid fa-clock"></i> {t.create.link_validity}
            </div>
          </div>
        </div>
      )}

      {renderHistoryModal()}
    </div>
  );
}
