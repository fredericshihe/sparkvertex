'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { copyToClipboard } from '@/lib/utils';
import { getPreviewContent } from '@/lib/preview';
import { X, RefreshCw, MessageSquare, Eye, Wand2, Edit3, Play } from 'lucide-react';
import { applyPatches } from '@/lib/patch';
import { useLanguage } from '@/context/LanguageContext';
import { QRCodeSVG } from 'qrcode.react';
import { GenerationProgress } from '@/components/GenerationProgress';

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

const DEVICE_PROMPTS: Record<string, string> = {
  mobile: "Target Device: Mobile (Phone). Layout: Single column, vertical scrolling. Navigation: Bottom Tab Bar (fixed) or Hamburger Menu. UI Density: Comfortable, touch-friendly (min 44px tap targets). Typography: Base 16px, readable. Avoid complex multi-column layouts. Use 'pb-safe' for bottom spacing on iPhone.",
  tablet: "Target Device: Tablet. Layout: Adaptive, 2-column split view (Sidebar + Content) or Grid. Navigation: Sidebar or Top Bar. UI Density: Balanced between mobile and desktop. Typography: Scaled for reading comfort. Use available screen width effectively.",
  desktop: "Target Device: Desktop. Layout: Wide, multi-column, dashboard-style. Navigation: Top Horizontal Bar or Fixed Left Sidebar. UI Density: High information density. Interactions: Hover effects, tooltips, smaller buttons allowed. Typography: Clean, professional."
};

// Removed fake loading messages and tips to ensure real status feedback
// const LOADING_TIPS_DATA = ...
// const LOADING_MESSAGES_DATA = ...

function CreateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language } = useLanguage();
  const { openLoginModal, openCreditPurchaseModal } = useModal();
  const { success: toastSuccess, error: toastError } = useToast();
  
  const isFromUpload = searchParams.get('from') === 'upload';
  
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
  const [modificationCount, setModificationCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string, type?: 'text' | 'error', errorDetails?: any, plan?: string, cost?: number}[]>([]);
  const [loadingText, setLoadingText] = useState(t.create.analyzing);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('mobile');
  const [streamingCode, setStreamingCode] = useState('');
  const [currentGenerationPrompt, setCurrentGenerationPrompt] = useState('');
  
  // State: History
  const [codeHistory, setCodeHistory] = useState<{code: string, prompt: string, timestamp: number, type?: 'init' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback'}[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [lastOperationType, setLastOperationType] = useState<'init' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback'>('init');

  // State: Point-and-Click Edit
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{tagName: string, className: string, innerText: string, path: string, parentTagName?: string, parentClassName?: string} | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRequest, setEditRequest] = useState('');
  const [editIntent, setEditIntent] = useState<'auto' | 'style' | 'content' | 'logic'>('auto');
  const [hasSeenEditGuide, setHasSeenEditGuide] = useState(false);
  
  // State: Mobile Preview
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [mobilePreviewUrl, setMobilePreviewUrl] = useState('');
  const [activeMobileTab, setActiveMobileTab] = useState<'preview' | 'chat'>('preview');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // State: User Credits
  const [credits, setCredits] = useState(30);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Spark Creator');
  
  // State: Preview Scaling
  const [previewScale, setPreviewScale] = useState(1);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [promptLengthForLog, setPromptLengthForLog] = useState(0);
  const [conversationSummary, setConversationSummary] = useState<string>('');
  
  const STORAGE_KEY = 'spark_create_session_v1';

  // State: Timeout Modal
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [timeoutCost, setTimeoutCost] = useState(0);
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  
  // State: Credit Animation
  const [isCreditAnimating, setIsCreditAnimating] = useState(false);
  const prevCreditsRef = useRef(credits);
  const currentTaskCostRef = useRef<number | null>(null);

  useEffect(() => {
      if (credits < prevCreditsRef.current) {
          setIsCreditAnimating(true);
          setTimeout(() => setIsCreditAnimating(false), 1000);
      }
      prevCreditsRef.current = credits;
  }, [credits]);

  // Refs
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update loading text when language changes
  useEffect(() => {
    if (isGenerating && !aiPlan && !currentStep) {
      setLoadingText(language === 'zh' ? '正在连接 AI 模型...' : 'Connecting to AI model...');
    }
  }, [language]);

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
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'spark-element-selected') {
        setSelectedElement(event.data.payload);
        setShowEditModal(true);
        setIsEditMode(false);
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: false }, '*');
        }
      }
      if (event.data && event.data.type === 'spark-app-error') {
        const errorData = event.data.error;
        const errorMessage = typeof errorData === 'string' ? errorData : errorData.message;
        console.warn('Runtime Error Caught:', errorMessage);
        
        setRuntimeError(errorMessage);

        // Add to chat history if it's a new error (debounce)
        setChatHistory(prev => {
            const lastMsg = prev[prev.length - 1];
            // Avoid duplicate error messages in a row
            if (lastMsg && lastMsg.type === 'error' && lastMsg.content === errorMessage) {
                return prev;
            }
            return [...prev, { 
                role: 'ai', 
                content: errorMessage, 
                type: 'error',
                errorDetails: errorData
            }];
        });
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
    const fromUpload = searchParams.get('from') === 'upload';
    if (fromUpload) {
        const importedCode = localStorage.getItem('spark_upload_import');
        if (importedCode) {
            setGeneratedCode(importedCode);
            setStreamingCode(importedCode);
            setStep('preview');
            setWizardData(prev => ({ ...prev, description: 'Imported from Upload' }));
            
            // Initialize history with the imported code
            setCodeHistory([{
                code: importedCode,
                prompt: 'Imported from Upload',
                timestamp: Date.now(),
                type: 'init'
            }]);

            localStorage.removeItem('spark_upload_import');
            // Explicitly clear the old session key to prevent any mix-up
            localStorage.removeItem(STORAGE_KEY);
            setTimeout(() => toastSuccess(language === 'zh' ? '已加载上传的代码' : 'Loaded uploaded code'), 500);
            return;
        }
    }

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
            if (parsed.currentTaskId) setCurrentTaskId(parsed.currentTaskId);
            if (parsed.promptLengthForLog) setPromptLengthForLog(parsed.promptLengthForLog);
            if (parsed.conversationSummary) setConversationSummary(parsed.conversationSummary);
            
            if ((parsed.step === 'preview' || parsed.step === 'generating') && parsed.generatedCode) {
               setStreamingCode(parsed.generatedCode);
               if (parsed.step === 'generating') {
                   // If we have a task ID and it was generating, we should resume monitoring instead of just finishing
                   if (parsed.currentTaskId) {
                       setIsGenerating(true);
                       // monitorTask will be called by the effect below
                   } else {
                       setStep('preview');
                       setIsGenerating(false);
                   }
               }
            } else if (parsed.step === 'generating' && parsed.currentTaskId) {
                // Resume generation state if no code but task exists
                setIsGenerating(true);
            }
            
            setTimeout(() => toastSuccess(language === 'zh' ? '已恢复上次的创作进度' : 'Restored previous session'), 500);
          }
        }
      } catch (e) {
        console.error('Failed to restore session', e);
      }
    }
  }, []);

  // Effect to resume monitoring if we have a task ID and are in generating state
  useEffect(() => {
    if (isGenerating && currentTaskId && !channelRef.current) {
        console.log('Resuming task monitoring for:', currentTaskId);
        monitorTask(currentTaskId, false, false, promptLengthForLog);
    }
  }, [isGenerating, currentTaskId, promptLengthForLog]);

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
      currentTaskId,
      promptLengthForLog,
      conversationSummary,
      timestamp: Date.now()
    };
    
    const timeoutId = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e: any) {
          // Handle QuotaExceededError by trimming history
          if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
             console.warn('LocalStorage quota exceeded, attempting to save slim session...');
             try {
                 // Strategy 1: Keep only last 3 code history items and last 20 chat messages
                 const slimState = {
                     ...stateToSave,
                     codeHistory: codeHistory.slice(-3),
                     chatHistory: chatHistory.slice(-20)
                 };
                 localStorage.setItem(STORAGE_KEY, JSON.stringify(slimState));
             } catch (e2) {
                 console.warn('Slim save failed, attempting minimal save...');
                 try {
                     // Strategy 2: Keep only current code and wizard data (no history)
                     const minimalState = {
                         ...stateToSave,
                         codeHistory: [],
                         chatHistory: chatHistory.slice(-5)
                     };
                     localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalState));
                 } catch (e3) {
                     console.error('Failed to save session even with minimal data:', e3);
                 }
             }
          } else {
              console.error('Failed to save session:', e);
          }
        }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [step, wizardData, generatedCode, chatHistory, codeHistory, currentGenerationPrompt, previewMode, currentTaskId, promptLengthForLog, conversationSummary]);

  // Save immediately when page visibility changes (user switches tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && (wizardData.description || generatedCode)) {
        try {
          const stateToSave = {
            step,
            wizardData,
            generatedCode,
            chatHistory,
            codeHistory,
            currentGenerationPrompt,
            previewMode,
            currentTaskId,
            promptLengthForLog,
            conversationSummary,
            timestamp: Date.now()
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
          console.log('Session saved on tab hide');
        } catch (e: any) {
          if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
             console.warn('LocalStorage quota exceeded on tab hide, attempting slim save...');
             try {
                 const stateToSave = {
                    step,
                    wizardData,
                    generatedCode,
                    chatHistory,
                    codeHistory,
                    currentGenerationPrompt,
                    previewMode,
                    currentTaskId,
                    promptLengthForLog,
                    conversationSummary,
                    timestamp: Date.now()
                 };
                 const slimState = {
                     ...stateToSave,
                     codeHistory: codeHistory.slice(-3),
                     chatHistory: chatHistory.slice(-20)
                 };
                 localStorage.setItem(STORAGE_KEY, JSON.stringify(slimState));
             } catch (e2) {
                 // If slim save fails, try minimal
                 try {
                     const stateToSave = {
                        step,
                        wizardData,
                        generatedCode,
                        chatHistory,
                        codeHistory,
                        currentGenerationPrompt,
                        previewMode,
                        currentTaskId,
                        promptLengthForLog,
                        conversationSummary,
                        timestamp: Date.now()
                     };
                     const minimalState = {
                         ...stateToSave,
                         codeHistory: [],
                         chatHistory: chatHistory.slice(-5)
                     };
                     localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalState));
                 } catch (e3) {
                     console.error('Failed to save session on visibility change (minimal):', e3);
                 }
             }
          } else {
              console.error('Failed to save session on visibility change:', e);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [step, wizardData, generatedCode, chatHistory, codeHistory, currentGenerationPrompt, previewMode, currentTaskId]);

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

  // Auth and session management effect
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

    // Function to check and refresh session if needed
    const checkAndRefreshSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.expires_at) {
          const expiresAt = session.expires_at * 1000;
          const now = Date.now();
          const timeUntilExpiry = expiresAt - now;
          const fifteenMinutes = 15 * 60 * 1000;

          // If token expires in less than 15 minutes or already expired, refresh it
          if (timeUntilExpiry < fifteenMinutes) {
            console.log('Token expiring soon or expired, refreshing session...');
            const { error } = await supabase.auth.refreshSession();
            if (error) {
              console.error('Failed to refresh session:', error);
            } else {
              console.log('Session refreshed successfully');
            }
          }
        }
      } catch (e) {
        console.error('Session refresh check failed', e);
      }
    };

    // Enhanced session refresh - check every 45 minutes
    const sessionRefreshInterval = setInterval(checkAndRefreshSession, 1000 * 60 * 45);

    // Handle visibility change - refresh session when user returns to tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Tab became visible, checking session...');
        checkAndRefreshSession();
        checkAuth(); // Also re-check credits and profile
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also handle page focus as backup
    const handleFocus = () => {
      console.log('Window focused, checking session...');
      checkAndRefreshSession();
    };

    window.addEventListener('focus', handleFocus);

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
      clearInterval(sessionRefreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (profileSubscription) supabase.removeChannel(profileSubscription);
    };
  }, []);

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

  const handleCancelGeneration = async (refundCost = 0) => {
    // 1. Clear Intervals
    if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
    }
    if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
    }
    if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
    }

    // 2. Unsubscribe Channel
    if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
    }
    
    // 3. Abort Fetch if pending
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }

    // 4. Notify Backend to Cancel (Update DB)
    if (currentTaskId) {
        try {
            console.log('Cancelling task on server:', currentTaskId);
            await supabase
                .from('generation_tasks')
                .update({ status: 'cancelled', error_message: 'Cancelled by user' })
                .eq('id', currentTaskId);
        } catch (e) {
            console.error('Failed to cancel task on server:', e);
        }
    }

    // 5. Refresh Credits (Backend will handle refund automatically)
    // 注意：后端Edge Function会检测到客户端断开并自动退款
    // 这里只需刷新积分余额即可
    checkAuth(); // 刷新积分余额
    
    if (refundCost > 0) {
        toastSuccess(language === 'zh' ? `已取消生成，积分将自动退还` : `Generation cancelled, credits will be refunded`);
    } else {
        toastSuccess(language === 'zh' ? '已取消生成' : 'Generation cancelled');
    }

    // 6. Reset State
    setIsGenerating(false);
    setLoadingText('');
    setCurrentTaskId(null);
    setShowTimeoutModal(false);
    
    // 7. UI Navigation
    if (step === 'generating') {
        setStep('concept');
    }
  };

  const handleTimeoutWait = () => {
      setShowTimeoutModal(false);
      // Reset timeout timer for another 30 seconds
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = setTimeout(() => {
          // Only show again if we are still generating and still haven't received code
          if (isGenerating && !streamingCode) {
              setShowTimeoutModal(true);
          }
      }, 30000);
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

  const optimizePrompt = async () => {
    if (!wizardData.description.trim()) {
      toastError(language === 'zh' ? '请先输入描述' : 'Please enter a description first');
      return;
    }

    const OPTIMIZE_COST = 2;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        openLoginModal();
        return;
      }

      if (credits < OPTIMIZE_COST) {
        openCreditPurchaseModal();
        return;
      }

      const confirmMsg = language === 'zh'
        ? `AI 将优化您的提示词，使其更加详细和专业。此操作将消耗 ${OPTIMIZE_COST} 积分，是否继续？`
        : `AI will optimize your prompt to make it more detailed and professional. This will cost ${OPTIMIZE_COST} credits. Continue?`;

      if (!confirm(confirmMsg)) return;

      setIsOptimizingPrompt(true);

      // Deduct credits first
      const { error: deductError } = await supabase.rpc('deduct_credits', { amount: OPTIMIZE_COST });
      if (deductError) {
        console.error('Failed to deduct credits:', deductError);
        toastError(language === 'zh' ? '积分扣除失败' : 'Failed to deduct credits');
        setIsOptimizingPrompt(false);
        return;
      }

      // Update local credits optimistically
      setCredits(prev => Math.max(0, prev - OPTIMIZE_COST));

      const systemPrompt = language === 'zh'
        ? '你是一个专业的需求分析师和产品经理。你的任务是优化用户提供的应用描述，使其更加详细、具体、可执行，同时保持用户的原意。'
        : 'You are a professional requirements analyst and product manager. Your task is to optimize the user-provided app description to make it more detailed, specific, and actionable while preserving the original intent.';

      const userPrompt = language === 'zh'
        ? `请优化以下应用描述，使其更加详细和专业。要求：
1. 保持原有意图不变
2. 添加具体的功能细节和用户场景
3. 使用清晰、专业的语言
4. 长度控制在 200-400 字
5. 直接输出优化后的描述，不要加任何前缀或说明

原始描述：
${wizardData.description}`
        : `Please optimize the following app description to make it more detailed and professional. Requirements:
1. Keep the original intent unchanged
2. Add specific feature details and user scenarios
3. Use clear, professional language
4. Keep length between 100-200 words
5. Output the optimized description directly without any prefix or explanation

Original description:
${wizardData.description}`;

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Optimization failed');
      }

      const data = await response.json();
      const optimizedText = data.content?.trim();

      if (optimizedText) {
        setWizardData(prev => ({ ...prev, description: optimizedText }));
        toastSuccess(language === 'zh' ? 'AI 优化完成' : 'AI optimization completed');
      } else {
        throw new Error('Empty response');
      }

    } catch (error: any) {
      console.error('Prompt optimization failed:', error);
      toastError(error.message || (language === 'zh' ? '优化失败，请重试' : 'Optimization failed, please try again'));
      // Refund credits on failure
      try {
        await supabase.rpc('add_credits', { user_id: userId, amount: OPTIMIZE_COST });
        setCredits(prev => prev + OPTIMIZE_COST);
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }
    } finally {
      setIsOptimizingPrompt(false);
    }
  };

  // --- Generation Logic ---
    const constructPrompt = (isModification = false, modificationRequest = '', forceFull = false, history: any[] = [], summary = '') => {
    const categoryLabel = t.categories[wizardData.category as keyof typeof t.categories] || 'App';
    const styleLabel = t.styles[wizardData.style as keyof typeof t.styles] || 'Modern';
    const deviceLabel = t.devices[wizardData.device as keyof typeof t.devices] || 'Mobile';
    const stylePrompt = STYLE_PROMPTS[wizardData.style] || '';
    const devicePrompt = DEVICE_PROMPTS[wizardData.device] || DEVICE_PROMPTS['mobile'];
    
    // Compact description
    let description = `Type:${categoryLabel}, Device:${deviceLabel}, Style:${styleLabel}. 
    
    ${stylePrompt}
    ${devicePrompt}
    
    Requirements:${wizardData.description}`;

    if (isModification) {
      // Sanitize generatedCode to remove null bytes which Postgres hates
      const safeCode = generatedCode ? generatedCode.replace(/\u0000/g, '') : '';

      // Format History
      let historyContext = '';
      
      // Add Summary if exists
      if (summary) {
          historyContext += `### PREVIOUS ACTIONS SUMMARY\n${summary}\n\n`;
      }

      if (history && history.length > 0) {
          // Sliding Window: Take last 6 messages (3 turns) to avoid token limits
          const recentHistory = history.slice(-6);
          historyContext += `### RECENT CONVERSATION\n` + recentHistory.map(msg => {
              const role = msg.role === 'user' ? 'User' : 'AI';
              // Skip error messages or system messages in context if needed, but usually good to keep
              return `${role}: ${msg.content}`;
          }).join('\n');
      }

      if (forceFull) {
        return `# EXISTING CODE (for context)
\`\`\`html
${safeCode}
\`\`\`

${historyContext ? `# CONVERSATION HISTORY\n${historyContext}\n` : ''}

# USER REQUEST
${modificationRequest}

# TASK
Based on the EXISTING CODE provided above, apply the user's request and output the COMPLETE updated HTML file.
You MUST preserve all existing functionality and structure that is not related to the user's request.
DO NOT start from scratch.

# CONSTRAINTS
- Maintain single-file structure
- Use React 18 and Tailwind CSS
- Preserve all existing features unless explicitly asked to remove them
- Ensure the code is fully functional

# OUTPUT FORMAT
1. Start with: /// PLAN ///
[Analyze the request and list the steps to rewrite the app in ${language === 'zh' ? 'Chinese' : 'English'}]
///
2. Then output: /// STEP: ${language === 'zh' ? '重写应用' : 'Rewriting Application'} ///
3. Then output the complete updated HTML file (no code blocks, no markdown)
4. Finally: /// SUMMARY: [Brief summary in ${language === 'zh' ? 'Chinese' : 'English'}] ///
`;
      }

      // Diff模式：也将现有代码放在前面以利用缓存
      return `# EXISTING CODE (for context)
\`\`\`html
${safeCode}
\`\`\`

${historyContext ? `# CONVERSATION HISTORY\n${historyContext}\n` : ''}

# USER REQUEST
${modificationRequest}

# TASK
Modify the above code using the diff format specified in the system instructions.

# OUTPUT REQUIREMENTS
1. Start with: /// PLAN ///
[Analyze the request and list the modification steps in ${language === 'zh' ? 'Chinese' : 'English'}]
///
2. Then output: /// STEP: ${language === 'zh' ? '应用修改' : 'Applying Changes'} ///
3. Then output one or more <<<<SEARCH...====...>>>> blocks
4. Ensure SEARCH blocks match the original code EXACTLY (character-for-character, including all whitespace)
5. Finally: /// SUMMARY: [Brief summary in ${language === 'zh' ? 'Chinese' : 'English'}] ///
`;
    }

    const targetLang = language === 'zh' ? 'Chinese' : 'English';

    return `
# Task
Create a single-file React 18 app (HTML).
${description}

# Specs
- Lang: ${targetLang}
- Stack: React 18 (UMD), Tailwind CSS (CDN), FontAwesome 6 (CDN).
- Target: ${deviceLabel} (${wizardData.device === 'mobile' ? 'Mobile-first' : 'Desktop'}).
- Style: ${styleLabel}.
- Output: Single HTML file. No Markdown.
    `;
  };

  const monitorTask = async (taskId: string, isModification = false, useDiffMode = false, fullPromptLength = 0, fullPromptText = '') => {
      let isFinished = false;
      let lastUpdateTimestamp = Date.now();
      let hasStartedStreaming = false;

      // Clear any existing intervals first
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);

      // Set Timeout Timer (90 seconds)
      timeoutTimerRef.current = setTimeout(() => {
          // Only show timeout if we haven't received ANY code yet
          if (!hasStartedStreaming) {
              setShowTimeoutModal(true);
          }
      }, 90000);

      // Add a "slow connection" hint after 8 seconds
      const slowConnectionTimer = setTimeout(() => {
          if (!hasStartedStreaming) {
               setLoadingText(language === 'zh' ? '正在唤醒 AI 引擎 (冷启动可能需要 10-20 秒)...' : 'Waking up AI engine (Cold start may take 10-20s)...');
          }
      }, 8000);

      const handleTaskUpdate = async (newTask: any) => {
        if (isFinished) return;
        
        // Clear slow connection timer if we get any update
        clearTimeout(slowConnectionTimer);

        lastUpdateTimestamp = Date.now();

        console.log('Task Update:', newTask.status, newTask.result_code?.length || 0, newTask.error_message);

        if (newTask.result_code && newTask.status === 'processing') {
            let content = newTask.result_code;
            
            // Extract Plan
            const planMatch = content.match(/\/\/\/ PLAN \/\/\/([\s\S]*?)\/\/\//);
            if (planMatch) {
                setAiPlan(planMatch[1].trim());
                content = content.replace(planMatch[0], '');
                setLoadingText(language === 'zh' ? '正在分析需求并制定计划...' : 'Analyzing requirements and planning...');
            }

            // Extract Steps
            const stepMatches = [...content.matchAll(/\/\/\/ STEP: (.*?) \/\/\//g)];
            if (stepMatches.length > 0) {
                const currentStepName = stepMatches[stepMatches.length - 1][1].trim();
                setCurrentStep(currentStepName);
                content = content.replace(/\/\/\/ STEP: .*? \/\/\//g, '');
                setLoadingText(language === 'zh' ? `正在执行: ${currentStepName}...` : `Executing: ${currentStepName}...`);
            }

            setStreamingCode(content);
            hasStartedStreaming = true;
        }
        
        if (newTask.status === 'completed') {
            isFinished = true;
            
            // Capture cost from DB update if available (in case broadcast was missed)
            if (newTask.cost !== undefined && newTask.cost !== null) {
                console.log(`Task completed (via DB). Cost: ${newTask.cost} credits`);
                currentTaskCostRef.current = newTask.cost;
            } else {
                // If cost is missing in the payload, fetch it explicitly
                console.log('Cost missing in completion payload, fetching from DB...');
                const { data: taskData } = await supabase
                    .from('generation_tasks')
                    .select('cost')
                    .eq('id', taskId)
                    .single();
                
                if (taskData?.cost) {
                    console.log(`Fetched cost from DB: ${taskData.cost}`);
                    currentTaskCostRef.current = taskData.cost;
                }
            }

            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
            // Do NOT remove channel immediately, wait for broadcast to arrive with cost
            // if (channelRef.current) supabase.removeChannel(channelRef.current);

            checkAuth();
            let rawCode = newTask.result_code || '';

            // --- Token Usage Logging ---
            const promptLength = fullPromptLength > 0 ? fullPromptLength : (currentGenerationPrompt ? currentGenerationPrompt.length : 0);
            const responseLength = rawCode.length;
            // Rough estimation: 1 token ≈ 4 chars for English, 1 char for Chinese. 
            // Mixing them is complex, but let's use a simple heuristic: length / 3
            const estimatedPromptTokens = Math.ceil(promptLength / 3);
            const estimatedResponseTokens = Math.ceil(responseLength / 3);
            
            console.log(`[Token Usage] Prompt: ${promptLength} chars (~${estimatedPromptTokens} tokens) | Response: ${responseLength} chars (~${estimatedResponseTokens} tokens)`);
            
            // Fallback Cost Calculation (if Realtime broadcast missed)
            // User requested to ONLY show backend returned cost, so we skip local calculation.
            if (currentTaskCostRef.current === null) {
                console.log('Cost not received from backend yet. Waiting for broadcast or checkAuth.');
            }
            // ---------------------------
            
            // Clean markers for final code
            let extractedPlan = null;
            const planMatch = rawCode.match(/\/\/\/ PLAN \/\/\/([\s\S]*?)\/\/\//);
            if (planMatch) {
                extractedPlan = planMatch[1].trim();
                setAiPlan(extractedPlan);
                rawCode = rawCode.replace(planMatch[0], '');
            } else {
                // Fallback: If regex failed but text starts with /// PLAN ///, try to strip it manually
                // This handles cases where the closing /// is missing or malformed
                if (rawCode.trim().startsWith('/// PLAN ///')) {
                    const htmlStart = rawCode.indexOf('<!DOCTYPE html>');
                    if (htmlStart !== -1) {
                        const planText = rawCode.substring(0, htmlStart);
                        // Try to extract plan text for display
                        const planContent = planText.replace('/// PLAN ///', '').trim();
                        extractedPlan = planContent;
                        setAiPlan(planContent);
                        rawCode = rawCode.substring(htmlStart);
                    } else {
                        const htmlTagStart = rawCode.indexOf('<html');
                        if (htmlTagStart !== -1) {
                             const planText = rawCode.substring(0, htmlTagStart);
                             const planContent = planText.replace('/// PLAN ///', '').trim();
                             extractedPlan = planContent;
                             setAiPlan(planContent);
                             rawCode = rawCode.substring(htmlTagStart);
                        }
                    }
                }
            }
            rawCode = rawCode.replace(/\/\/\/ STEP: .*? \/\/\//g, '');
            
            // Helper function to clean code (remove unsafe/broken elements)
            const cleanTheCode = (code: string) => {
                let c = code;
                // SAFETY FIX: Remove Python-style Unicode escapes that crash JS
                c = c.replace(/\\U([0-9a-fA-F]{8})/g, (match: string, p1: string) => {
                    return '\\u{' + p1.replace(/^0+/, '') + '}';
                });

                // SAFETY FIX: Remove Google Fonts & Preconnects (China Blocking Issue)
                c = c.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
                
                // OPTIMIZATION: Replace cdnjs with cdn.staticfile.org for FontAwesome
                c = c.replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/g, 'https://cdn.staticfile.org/font-awesome');

                // SAFETY FIX: Remove Framer Motion (Broken CDN / 404)
                c = c.replace(/<script.*src=".*framer-motion.*\.js".*><\/script>/g, '');

                // SAFETY FIX: Replace broken QRCode CDN with staticfile
                c = c.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/qrcode@[\d\.]+\/build\/qrcode\.min\.js/g, 'https://cdn.staticfile.org/qrcodejs/1.0.0/qrcode.min.js');
                
                // SAFETY FIX: Remove Mixkit MP3s (403 Forbidden)
                c = c.replace(/src="[^"]*mixkit[^"]*\.mp3"/g, 'src=""');
                c = c.replace(/new Audio\("[^"]*mixkit[^"]*\.mp3"\)/g, 'null');
                
                return c;
            };

            if (useDiffMode) {
                // In Diff Mode, we must NOT clean the raw patch before applying it,
                // because the SEARCH blocks must match the original code exactly.
                // If we clean the patch, we might remove lines from SEARCH blocks that exist in the original code.
                setStreamingCode(rawCode);
                
                try {
                    console.log('Applying patches. Source length:', generatedCode.length, 'Patch length:', rawCode.length);
                    
                    // Extract Summary
                    const summaryMatch = rawCode.match(/\/\/\/\s*SUMMARY:\s*([\s\S]*?)\s*\/\/\//);
                    const summary = summaryMatch ? summaryMatch[1].trim() : null;

                    if (summary) {
                        // Append to conversation summary
                        setConversationSummary(prev => {
                            // Limit summary length to avoid infinite growth (keep last 10 actions)
                            const prevLines = prev ? prev.split('\n') : [];
                            const newEntry = `- ${summary}`;
                            const allLines = [...prevLines, newEntry];
                            const keptLines = allLines.slice(-10);
                            return keptLines.join('\n');
                        });
                    }

                    // Extract Analysis
                    const analysisMatch = rawCode.match(/\/\/\/\s*ANALYSIS:\s*([\s\S]*?)\s*\/\/\//);
                    if (analysisMatch) {
                        console.log('AI Analysis:', analysisMatch[1].trim());
                    }

                    const patched = applyPatches(generatedCode, rawCode);
                    
                    if (patched === generatedCode) {
                        console.warn('Patch applied but code is unchanged.');
                        if (!rawCode.includes('<<<<SEARCH')) {
                             // Fallback: Check if AI returned a full file instead of patches
                             if (rawCode.includes('<!DOCTYPE html>') || rawCode.includes('<html')) {
                                 console.log('AI returned full file instead of patches. Switching to full replacement.');
                                 const finalCode = cleanTheCode(rawCode);
                                 setGeneratedCode(finalCode);
                                 toastSuccess(t.create.success_edit);
                                 
                                 if (summary) {
                                     setChatHistory(prev => [...prev, { role: 'ai', content: summary, cost: currentTaskCostRef.current || undefined }]);
                                 } else {
                                     setChatHistory(prev => [...prev, { role: 'ai', content: language === 'zh' ? '已根据您的要求更新了代码。' : 'Updated the code based on your request.', cost: currentTaskCostRef.current || undefined }]);
                                 }
                                 
                                 setIsGenerating(false);
                                 setCurrentTaskId(null); // Clear task ID
                                 return;
                             }

                             throw new Error(language === 'zh' ? 'AI 未返回有效的修改代码块' : 'AI did not return valid modification blocks');
                        } else {
                             throw new Error(language === 'zh' ? '找到修改块但无法应用（上下文不匹配）' : 'Found modification blocks but could not apply them (context mismatch)');
                        }
                    }

                    // Clean the RESULT of the patch
                    const finalCode = cleanTheCode(patched);
                    setGeneratedCode(finalCode);
                    toastSuccess(t.create.success_edit);
                    
                    const finalContent = summary || (language === 'zh' ? '已根据您的要求更新了代码。' : 'Updated the code based on your request.');
                    setChatHistory(prev => [...prev, { role: 'ai', content: finalContent, cost: currentTaskCostRef.current || undefined }]);
                } catch (e: any) {
                    console.error('Patch failed:', e);
                    
                    // Ask user for confirmation before full rewrite
                    const cost = currentTaskCostRef.current || 0;
                    const confirmMessage = language === 'zh' 
                        ? `智能修改遇到困难。是否尝试全量修复？\n\n注意：全量修复将消耗更多积分。\n无论您选择继续还是取消，本次修改消耗的 ${cost} 积分都将自动退回。`
                        : `Smart edit encountered difficulties. Do you want to try a full repair?\n\nNote: Full repair will consume more credits.\nRegardless of your choice, the ${cost} credits consumed for this edit will be automatically refunded.`;
                    
                    // Helper to process refund
                    const processRefund = async () => {
                        console.log('Processing refund. Cost:', cost);
                        if (cost > 0) {
                            try {
                                toastSuccess(language === 'zh' ? '正在退回本次失败消耗的积分...' : 'Refunding credits for failed attempt...');
                                const res = await fetch('/api/refund', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ taskId: taskId, amount: cost })
                                });

                                if (!res.ok) {
                                    throw new Error(`Refund API failed: ${res.status}`);
                                }

                                // Update local credits immediately for UI feedback
                                setCredits(prev => prev + cost);
                                toastSuccess(language === 'zh' ? '积分已退回' : 'Credits refunded');
                                
                                // Sync with DB to ensure consistency (and fix potential race conditions)
                                setTimeout(() => {
                                    checkAuth();
                                }, 1000);
                            } catch (err) {
                                console.error('Refund failed', err);
                                toastError(language === 'zh' ? '积分退回失败，请联系客服' : 'Refund failed, please contact support');
                            }
                        } else {
                            console.warn('Cost is 0 or null, skipping refund.');
                        }
                    };

                    if (confirm(confirmMessage)) {
                        // Refund first
                        await processRefund();

                        toastSuccess(language === 'zh' ? '正在尝试全量修复...' : 'Attempting full repair...');
                        // Retry with forceFull=true after a short delay to allow current task cleanup
                        setTimeout(() => {
                            startGeneration(true, currentGenerationPrompt, '', true, lastOperationType === 'init' ? 'regenerate' : lastOperationType);
                        }, 100);
                    } else {
                        // User cancelled - Refund logic
                        await processRefund();

                        toastError(language === 'zh' ? '修改失败，请重试或尝试手动修改。' : 'Edit failed, please retry or try manual edit.');
                        setIsGenerating(false);
                    }
                }
            } else {
                // Full Generation Mode
                let cleanCode = cleanTheCode(rawCode);
                
                // Extract Summary if present (for full rewrite modification)
                const summaryMatch = cleanCode.match(/\/\/\/\s*SUMMARY:\s*([\s\S]*?)\s*\/\/\//);
                let summary = summaryMatch ? summaryMatch[1].trim() : null;
                
                // Remove summary from code
                if (summaryMatch) {
                    cleanCode = cleanCode.replace(summaryMatch[0], '').trim();
                }

                cleanCode = cleanCode.replace(/```html/g, '').replace(/```/g, '');

                if (!cleanCode.includes('<meta name="viewport"')) {
                    cleanCode = cleanCode.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />');
                }

                setStreamingCode(cleanCode);
                setGeneratedCode(cleanCode);
                
                if (isModification) {
                    toastSuccess(t.create.success_edit);
                    const finalContent = summary || (language === 'zh' ? '已重新生成完整代码。' : 'Regenerated full code.');
                    setChatHistory(prev => [...prev, { role: 'ai', content: finalContent, cost: currentTaskCostRef.current || undefined }]);
                } else {
                    setStep('preview');
                    setPreviewMode(wizardData.device as any);

                    // Add initial conversation to history
                    const userDesc = wizardData.description || (language === 'zh' ? '创建应用' : 'Create App');
                    const aiSummary = extractedPlan || (language === 'zh' ? '应用已生成完毕！' : 'App generation complete!');
                    
                    setChatHistory(prev => {
                        if (prev.length === 0) {
                             return [
                                { role: 'user', content: userDesc },
                                { role: 'ai', content: aiSummary, cost: currentTaskCostRef.current || undefined }
                            ];
                        }
                        return prev;
                    });
                }
            }
            
            setIsGenerating(false);
            setCurrentTaskId(null); // Clear task ID
        } else if (newTask.status === 'failed') {
            isFinished = true;
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
            if (channelRef.current) supabase.removeChannel(channelRef.current);
            
            // Refund credits on failure
            // Note: Edge Function might have already refunded, but we do optimistic update here just in case
            // Actually, if Edge Function refunded, checkAuth() will pick it up.
            // But checkAuth() is async.
            // Let's just rely on checkAuth() or do optimistic refund if we are sure.
            // Since we deducted optimistically, we should refund optimistically if we see 'failed'.
            // But wait, if Edge Function refunded, and we refund, we might double refund in UI (not DB).
            // Let's trigger checkAuth() and show error.
            checkAuth();
            
            let friendlyError = newTask.error_message || t.common.error;
            if (friendlyError.includes('503')) {
                friendlyError = language === 'zh' ? '服务暂时繁忙 (503)，请稍后重试。' : 'Service Unavailable (503), please try again later.';
            } else if (friendlyError.includes('504')) {
                friendlyError = language === 'zh' ? '生成超时 (504)，请尝试简化描述或稍后重试。' : 'Gateway Timeout (504), please simplify your request or try again later.';
            } else if (friendlyError.includes('429')) {
                friendlyError = language === 'zh' ? '请求过于频繁 (429)，请稍作休息。' : 'Too Many Requests (429), please take a break.';
            }

            toastError(friendlyError);
            setLoadingText(`${t.common.error}: ${friendlyError}`);
            setIsGenerating(false);
            setCurrentTaskId(null); // Clear task ID
        }
      };

      channelRef.current = supabase
        .channel(`task-${taskId}`)
        .on(
          'broadcast',
          { event: 'chunk' },
          (payload) => {
             const { fullContent } = payload.payload;
             if (fullContent) {
                 let content = fullContent;
                 
                 // Extract Plan
                 const planMatch = content.match(/\/\/\/ PLAN \/\/\/([\s\S]*?)\/\/\//);
                 if (planMatch) {
                     setAiPlan(planMatch[1].trim());
                     content = content.replace(planMatch[0], '');
                     setLoadingText(language === 'zh' ? '正在分析需求并制定计划...' : 'Analyzing requirements and planning...');
                 }

                 // Extract Steps
                 const stepMatches = [...content.matchAll(/\/\/\/ STEP: (.*?) \/\/\//g)];
                 if (stepMatches.length > 0) {
                     const currentStepName = stepMatches[stepMatches.length - 1][1].trim();
                     setCurrentStep(currentStepName);
                     content = content.replace(/\/\/\/ STEP: .*? \/\/\//g, '');
                     setLoadingText(language === 'zh' ? `正在执行: ${currentStepName}...` : `Executing: ${currentStepName}...`);
                 }

                 setStreamingCode(content);
                 hasStartedStreaming = true;
                 lastUpdateTimestamp = Date.now();
             }
          }
        )
        .on(
          'broadcast',
          { event: 'completed' },
          (payload) => {
             const { cost } = payload.payload;
             if (cost !== undefined) {
                 console.log(`Task completed. Cost: ${cost} credits`);
                 currentTaskCostRef.current = cost;

                 // Update local credits immediately
                 setCredits(prev => Math.max(0, prev - cost));
                 
                 // Update chat history with cost
                 setChatHistory(prev => {
                     const newHistory = [...prev];
                     if (newHistory.length > 0) {
                         const lastMsg = newHistory[newHistory.length - 1];
                         if (lastMsg.role === 'ai') {
                             // Create a new object to ensure re-render
                             newHistory[newHistory.length - 1] = { ...lastMsg, cost };
                         }
                     }
                     return newHistory;
                 });

                 toastSuccess(language === 'zh' ? `生成完成，消耗 ${cost} 积分` : `Generation complete. Cost: ${cost} credits`);
                 // Refresh profile to sync with server
                 checkAuth();
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
      pollIntervalRef.current = setInterval(async () => {
        if (isFinished || isPolling) return;
        
        if (Date.now() - lastUpdateTimestamp < 3000) return; // Poll faster if no updates

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
  };

  const startGeneration = async (isModificationArg = false, overridePrompt = '', displayPrompt = '', forceFull = false, explicitType?: 'init' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback') => {
    // Reset cost ref for new task
    currentTaskCostRef.current = null;

    // Explicitly rely on the argument to determine if it's a modification or a new generation (regenerate)
    const isModification = isModificationArg;
    const useDiffMode = isModification && !forceFull;
    
    // Determine operation type for the NEXT generation
    let nextOperationType: 'init' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback' = 'init';
    
    if (explicitType) {
        nextOperationType = explicitType;
    } else if (!isModification) {
        nextOperationType = generatedCode ? 'regenerate' : 'init';
    } else {
        if (displayPrompt && overridePrompt) {
            nextOperationType = 'click';
        } else if (overridePrompt && !displayPrompt) {
            nextOperationType = 'fix';
        } else {
            nextOperationType = 'chat';
        }
    }

    console.log('startGeneration called:', { 
        isModificationArg, 
        isModification, 
        forceFull,
        step, 
        overridePrompt,
        nextOperationType,
        stack: new Error().stack 
    });

    // Cost: Based on Token usage (1 Credit = 3000 Tokens)
    // Minimum required to start is 1 credit
    const MIN_REQUIRED = 1;
    setTimeoutCost(MIN_REQUIRED);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        openLoginModal();
        return;
      }

      // Fetch latest credits to ensure accuracy (especially after refund)
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', session.user.id)
        .single();
      
      const currentCredits = profile?.credits !== undefined ? Number(profile.credits) : credits;
      
      // Update local state if different
      if (currentCredits !== credits) {
          setCredits(currentCredits);
      }

      if (currentCredits < MIN_REQUIRED) {
        openCreditPurchaseModal();
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
    setStreamingCode('');
    setAiPlan(''); // Reset plan for new generation
    setCurrentStep(''); // Reset step for new generation
    setRuntimeError(null); // Clear previous errors
    
    let hasStartedStreaming = false;

    // Clear any existing intervals
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    // Initial loading text
    if (isModification) {
        setLoadingText(language === 'zh' ? '正在分析修改需求...' : 'Analyzing modification request...');
    } else {
        setLoadingText(language === 'zh' ? '正在连接 AI 模型...' : 'Connecting to AI model...');
    }


    try {
      // Pass chatHistory to provide context for the AI
      const prompt = constructPrompt(isModification, overridePrompt || chatInput, forceFull, chatHistory, conversationSummary);
      
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
      
      if (generatedCode) {
        setCodeHistory(prev => [...prev, {
            code: generatedCode,
            prompt: currentGenerationPrompt || 'Initial Version',
            timestamp: Date.now(),
            type: lastOperationType
        }]);
      }

      setLastOperationType(nextOperationType);

      setCurrentGenerationPrompt(promptContent);

      if (isModification) {
        setChatHistory(prev => [...prev, { role: 'user', content: displayPrompt || overridePrompt || chatInput }]);
        setChatInput('');
        setModificationCount(prev => prev + 1);
      }

      const deviceConstraint = wizardData.device === 'desktop' 
        ? '6. Optimize for Desktop: Use full width, multi-column layouts, and hover effects. Ensure content fills the screen appropriately.'
        : wizardData.device === 'tablet'
        ? '6. Optimize for Tablet: Use responsive grid layouts and touch-friendly sizing. Adapt to both portrait and landscape.'
        : '6. Optimize for Mobile: Use single-column layout, large touch targets (min 44px), and bottom navigation. Ensure "pb-safe" is used for bottom spacing.';

      const summaryLang = language === 'zh' ? 'Chinese' : 'English';
      
      const processVizInstructions = language === 'zh' ? `
### Process Visualization (CRITICAL)
To improve user experience, you MUST output your thinking process and progress steps using specific markers.

1. **Analysis Phase**: Before writing any code, output your analysis and plan in CHINESE (Simplified).
   Format:
   \`\`\`
   /// PLAN ///
   1. **核心概念**: [简要描述]
   2. **关键功能**:
      - [功能 1]
      - [功能 2]
   3. **技术方案**: [简要技术栈/逻辑]
   4. **用户体验**: [UX 目标]
   ///
   \`\`\`

2. **Progress Steps**: During code generation, output step markers before major sections in CHINESE.
   Format: \`/// STEP: [Step Name] ///\`
   
   Required Steps:
   - \`/// STEP: 环境搭建 ///\` (Before HTML structure)
   - \`/// STEP: 布局设计 ///\` (Before CSS/Tailwind setup)
   - \`/// STEP: 逻辑实现 ///\` (Before React components)
   - \`/// STEP: 交互添加 ///\` (Before Event handlers/Effects)
   - \`/// STEP: 收尾工作 ///\` (Before closing tags)
` : `
### Process Visualization (CRITICAL)
To improve user experience, you MUST output your thinking process and progress steps using specific markers.

1. **Analysis Phase**: Before writing any code, output your analysis and plan.
   Format:
   \`\`\`
   /// PLAN ///
   1. **Core Concept**: [Brief description]
   2. **Key Features**:
      - [Feature 1]
      - [Feature 2]
   3. **Technical Approach**: [Brief tech stack/logic]
   4. **User Experience**: [UX goals]
   ///
   \`\`\`

2. **Progress Steps**: During code generation, output step markers before major sections.
   Format: \`/// STEP: [Step Name] ///\`
   
   Required Steps:
   - \`/// STEP: Setting up Environment ///\` (Before HTML structure)
   - \`/// STEP: Designing Layout ///\` (Before CSS/Tailwind setup)
   - \`/// STEP: Implementing Logic ///\` (Before React components)
   - \`/// STEP: Adding Interactivity ///\` (Before Event handlers/Effects)
   - \`/// STEP: Finalizing ///\` (Before closing tags)
`;

      // 系统提示词设计为足够长且稳定，以便Gemini自动缓存（隐式缓存要求>1024 tokens）
      const SYSTEM_PROMPT = useDiffMode ? `You are an expert Senior Software Engineer specializing in React code refactoring and incremental updates.
Your mission is to modify existing React code based on user requests with surgical precision.

### Core Strategy: "Cursor-Style" Smart Replacement
1. **Locate**: Identify the exact code block requiring changes
2. **Context**: Include sufficient unique identifiers (function names, variable names, unique strings) to ensure unambiguous matching
3. **Replace**: Output the complete new block with all modifications

### Output Format (Strictly Enforced)
Your response MUST follow this exact structure:

1. **Analysis Block**: 
\`\`\`
/// ANALYSIS: [Describe the unique signature of the code you're targeting, e.g., "Targeting function 'handleSubmit' in App component lines 50-80"]
///
\`\`\`

2. **Summary Block**:
\`\`\`
/// SUMMARY: [Brief summary of changes in ${summaryLang}]
///
\`\`\`

3. **Patch Blocks**: One or more code change blocks using this format:
\`\`\`
<<<<SEARCH
[Exact original code with 5-10 lines of context before and after]
====
[Complete replacement code including all context]
>>>>
\`\`\`

### Critical Rules for SEARCH Block:
1. **Uniqueness is King**: The SEARCH content must match EXACTLY ONE location in the source code
   - ❌ BAD: Matching generic code like \`</div>\`, \`}\`, \`return true;\`
   - ✅ GOOD: Matching function signature + body + unique variable names + closing brace
   
2. **Exact Match Required**: Character-for-character match (whitespace matters!)
   - ❌ BAD: Using comments like \`// ... existing code ...\` or \`/* ... */\` inside SEARCH
   - ✅ GOOD: Including FULL actual code content
   
3. **Sufficient Context**: Include 5-10 lines of unchanged code around the target
   - Ensures the patcher finds the correct location even if the file is large
   - Include unique identifiers: function names, class names, unique strings
   
4. **No Shortcuts**: Output every single line between start and end markers
   - Do NOT skip lines or use ellipsis (\`...\`)
   - Do NOT use placeholders

### Critical Rules for REPLACE Block:
1. **Completeness**: Output the FULL replacement including all context lines from SEARCH
   - If SEARCH has 20 lines, REPLACE must have approximately the same (adjusted for your changes)
   - Include all unchanged context lines that were in SEARCH
   
2. **Valid React Code**: Ensure the replacement is syntactically correct
   - Check for balanced braces \`{}\`, brackets \`[]\`, parentheses \`()\`
   - Check for balanced JSX tags \`<Component></Component>\`
   - Ensure proper React Hooks usage
   
3. **No Imports**: Use global variables (\`React\`, \`ReactDOM\`) - no \`import\` statements
   
4. **No Placeholders**: Never use \`// ... existing code ...\` or similar
   - Output actual complete code

### Style Consistency (CRITICAL - Prevents Visual Regressions)
- **Maintain Design Language**: Do not change colors, fonts, spacing unless explicitly requested
- **Respect Theme**: If the app is "Cyberpunk", don't accidentally make it "Minimalist"
- **Keep Tailwind Classes**: When adding elements, use the same Tailwind utility patterns
- **Preserve Layout**: Don't break existing responsive design or grid systems

### Pre-Flight Checklist (Run Mentally Before Generating)
Before outputting patches, verify:
1. ✓ "Is my SEARCH block unique in the file?"
   - If not → add more context lines or include unique identifiers
2. ✓ "Does my SEARCH block contain code I'm NOT replacing?"
   - If yes → I must include it in REPLACE too, or it will be deleted
3. ✓ "Does my REPLACE block contain all necessary code?"
   - Check for completeness, no ellipsis
4. ✓ "Am I preserving the existing visual style?"
   - Check colors, fonts, spacing

### Example 1: Button Color Change
\`\`\`
/// ANALYSIS: Targeting the SubmitButton component's return statement
///

/// SUMMARY: Changed button color from blue to green and added hover effect
///

<<<<SEARCH
const SubmitButton = ({ onClick, children }) => {
  return (
    <button 
      onClick={onClick}
      className="bg-blue-500 text-white px-4 py-2 rounded"
    >
      {children}
    </button>
  );
};
====
const SubmitButton = ({ onClick, children }) => {
  return (
    <button 
      onClick={onClick}
      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded transition-colors"
    >
      {children}
    </button>
  );
};
>>>>
\`\`\`

### Example 2: Adding State Variable
\`\`\`
/// ANALYSIS: Targeting App component start to add new state hook
///

/// SUMMARY: Added 'count' state variable for tracking clicks
///

<<<<SEARCH
const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);
====
const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);
>>>>
\`\`\`

### Example 3: Modifying Function Logic
\`\`\`
/// ANALYSIS: Targeting calculateTotal function to add tax calculation
///

/// SUMMARY: Updated calculateTotal to include 10% tax
///

<<<<SEARCH
  const calculateTotal = (items) => {
    const subtotal = items.reduce((acc, item) => acc + item.price, 0);
    return subtotal;
  };

  const handleCheckout = () => {
====
  const calculateTotal = (items) => {
    const subtotal = items.reduce((acc, item) => acc + item.price, 0);
    const tax = subtotal * 0.1;
    return subtotal + tax;
  };

  const handleCheckout = () => {
>>>>
\`\`\`

### Technical Constraints
- **Single HTML File**: All code in one file
- **No Imports**: Use \`const { useState, useEffect } = React;\`
- **CDN Libraries**: React, Tailwind CSS, FontAwesome (via CDN)
- **Icons**: FontAwesome classes: \`<i className="fa-solid fa-home"></i>\`
- **Images**: Use absolute HTTPS URLs only
- **Fonts**: System fonts only (font-sans, font-mono) - NO Google Fonts
- **Emoji**: Use direct emoji or \\u{XXXX} format, NOT Python \\UXXXXXXXX format
- **React Hooks**: Ensure correct dependencies to avoid infinite loops

### Error Prevention
- Validate brace balance: \`{}\`, \`[]\`, \`()\`
- Check JSX tag closure: every \`<Tag>\` has \`</Tag>\`
- Verify string escaping: backticks, quotes properly escaped
- Test regex patterns: no unescaped special characters

Remember: Your output will be automatically parsed and applied. Precision is critical.` : `You are an expert React Developer specializing in creating production-grade single-file HTML applications.

Your mission: Build interactive web applications using React 18, Tailwind CSS, and modern JavaScript - all in a single HTML file.

${processVizInstructions}

### Tech Stack (All via CDN)
- **React 18 (UMD)**: Global \`React\`, \`ReactDOM\`
- **Babel Standalone**: For JSX transformation
- **Tailwind CSS**: Utility-first styling
- **FontAwesome 6**: Icon library

### Approved CDN Libraries (China-Accessible)
Use these stable CDNs when features are needed:
- **React**: \`https://cdn.staticfile.org/react/18.2.0/umd/react.production.min.js\`
- **ReactDOM**: \`https://cdn.staticfile.org/react-dom/18.2.0/umd/react-dom.production.min.js\`
- **Babel**: \`https://cdn.staticfile.org/babel-standalone/7.23.5/babel.min.js\`
- **Tailwind**: \`https://cdn.tailwindcss.com\`
- **FontAwesome**: \`https://cdn.staticfile.org/font-awesome/6.4.0/css/all.min.css\`
- **Lucide Icons**: \`https://unpkg.com/lucide@latest/dist/umd/lucide.js\` (Global: \`lucide\`)
- **Charts (ECharts)**: \`https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js\` (Global: \`echarts\`)
- **Markdown**: \`https://cdn.jsdelivr.net/npm/marked/marked.min.js\` (Global: \`marked\`)
- **Confetti**: \`https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js\` (Global: \`confetti\`)
- **Physics (Matter.js)**: \`https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js\` (Global: \`Matter\`)
- **Excel (XLSX)**: \`https://cdn.staticfile.org/xlsx/0.18.5/xlsx.full.min.js\` (Global: \`XLSX\`)
- **PDF Generation**: \`https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js\` (Global: \`jspdf\`)
- **QRCode**: \`https://cdn.staticfile.org/qrcodejs/1.0.0/qrcode.min.js\` (Global: \`QRCode\`. Usage: \`new QRCode(el, "text")\`)

### Strict Constraints
1. **Output Format**: Raw HTML only. NO Markdown code blocks, NO explanations outside the HTML
2. **No Imports**: NO \`import\` or \`require\`. Destructure from globals: \`const { useState, useEffect } = React;\`
3. **Fonts**: NO Google Fonts (\`fonts.googleapis.com\`). Use system fonts only
4. **Images**: Absolute HTTPS URLs only (no relative paths, no data URIs unless essential)
5. **Responsive**: Use \`window.innerWidth\` for breakpoint logic if needed, prefer Tailwind responsive classes
6. **Audio**: NO external MP3 links (e.g., mixkit) - they return 403. Use Base64 data URIs or avoid audio

${deviceConstraint}

### Base Template Structure
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>App Title</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdn.staticfile.org/font-awesome/6.4.0/css/all.min.css">
<script src="https://cdn.staticfile.org/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdn.staticfile.org/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdn.staticfile.org/babel-standalone/7.23.5/babel.min.js"></script>
<style>body{margin:0;overflow:hidden}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef, Component } = React;

// Error Boundary (REQUIRED - catches runtime errors)
class ErrorBoundary extends Component {
  constructor(props) { 
    super(props); 
    this.state = { hasError: false, error: null, errorInfo: null }; 
  }
  static getDerivedStateFromError(error) { 
    return { hasError: true, error }; 
  }
  componentDidCatch(error, errorInfo) { 
    console.error("ErrorBoundary caught:", error, errorInfo); 
    this.setState({ errorInfo });
    // Send error to parent frame for debugging
    window.parent.postMessage({ 
      type: 'spark-app-error', 
      error: {
        message: error.toString(),
        stack: error.stack,
        componentStack: errorInfo.componentStack
      }
    }, '*');
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center p-4 bg-red-900/90 text-white font-mono">
          <div className="max-w-2xl bg-black/50 p-6 rounded-xl border border-red-500/30">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
              <h2 className="text-xl font-bold">Runtime Error</h2>
            </div>
            <div className="text-sm space-y-2">
              <p className="text-red-300 font-bold">{this.state.error?.toString()}</p>
              {this.state.error?.stack && (
                <pre className="text-xs text-slate-300 overflow-auto max-h-64 bg-black/30 p-3 rounded">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Main App Component
const App = () => {
  // Your application code here
  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
      <h1 className="text-4xl font-bold text-white">Hello World</h1>
    </div>
  );
};

// Render with Error Boundary
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
</script>
</body>
</html>
\`\`\`

### Technical Requirements (MUST FOLLOW)
1. **Single File**: Complete, self-contained HTML - no external dependencies beyond approved CDNs
2. **No Imports**: Use \`const { useState } = React;\` - never \`import React from 'react'\`
3. **Icons**: FontAwesome only - \`<i className="fa-solid fa-icon-name"></i>\`
4. **Images**: Absolute URLs starting with \`https://\`
5. **Styling**: Tailwind CSS utility classes
6. **Fonts**: System fonts (\`font-sans\`, \`font-mono\`, \`font-serif\`) - NEVER \`fonts.googleapis.com\`
7. **Emoji**: Direct emoji characters (😀) or ES6 format (\`\\u{1F600}\`) - NOT Python format (\`\\U0001F600\`)
8. **String Escaping**: Properly escape backticks (\\\`) and quotes inside template literals
9. **React Hooks**: Correct dependency arrays - avoid infinite loops
10. **Error Boundary**: ALWAYS wrap App in ErrorBoundary component (see template)

### Best Practices
- **Mobile-First**: Start with mobile layout, scale up with Tailwind responsive classes
- **Touch-Friendly**: Minimum 44px touch targets for buttons/interactive elements
- **Performance**: Memoize expensive calculations with \`useMemo\`, prevent re-renders with \`useCallback\`
- **Accessibility**: Semantic HTML, ARIA labels, keyboard navigation support
- **State Management**: Keep state close to where it's used, lift up when shared
- **Side Effects**: All API calls, timers, subscriptions in \`useEffect\` with proper cleanup

### Common Pitfalls to Avoid
- ❌ Using \`import\` statements (breaks single-file constraint)
- ❌ Google Fonts links (blocked in China)
- ❌ Relative image paths (won't resolve in iframe)
- ❌ External audio/video links (often return 403/404)
- ❌ Missing ErrorBoundary (unhandled errors crash the app)
- ❌ Incorrect \`useEffect\` dependencies (causes infinite loops)
- ❌ Python-style unicode escapes (\`\\UXXXXXXXX\`)

### Quality Checklist
Before finalizing, verify:
- [ ] All code in single HTML file
- [ ] No \`import\` statements
- [ ] ErrorBoundary wraps App component
- [ ] All images use \`https://\` URLs
- [ ] No Google Fonts
- [ ] Tailwind classes for all styling
- [ ] React Hooks have correct dependencies
- [ ] Touch targets ≥ 44px for mobile
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] No console errors or warnings

Remember: You're building for production. Code must be clean, performant, and error-free.`;

      const TECHNICAL_CONSTRAINTS = `
### Final Constraints Summary
1. **Single File**: One complete HTML file only
2. **No Imports**: Use global React, ReactDOM variables
3. **Icons**: FontAwesome classes only
4. **Images**: Absolute HTTPS URLs
5. **Styling**: Tailwind CSS utilities
6. **Fonts**: System fonts only (no Google Fonts)
7. **Emoji**: Direct characters or ES6 format (\\u{XXXX})
8. **String Escaping**: Escape backticks and quotes properly
9. **React Hooks**: Correct dependency arrays
10. **Error Boundary**: Always include for production safety
`;

      const finalUserPrompt = prompt;

      const dbPrompt = isModification ? prompt : finalUserPrompt;

      console.log('Calling /api/generate with prompt length:', dbPrompt.length);

      let response: Response;
      try {
        abortControllerRef.current = new AbortController();
        response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({
            type: isModification ? 'modification' : 'generation',
            system_prompt: SYSTEM_PROMPT,
            user_prompt: dbPrompt
            }),
            signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            console.error('API Error Details:', errorData);
            throw new Error(errorData.error || `Generation failed: ${response.status}`);
        }
      } catch (e: any) {
          if (e.name === 'AbortError') {
              console.log('Fetch aborted');
              return;
          }
          console.error('Failed to call /api/generate:', e);
          if (e.message === 'Load failed' || e.message === 'Failed to fetch') {
              throw new Error(t.common.unknown_error);
          }
          throw e;
      }

      const { taskId } = await response.json();
      setCurrentTaskId(taskId);
      
      // 注意：积分扣除在后端Edge Function中进行，避免双重扣费
      // 前端不再进行乐观更新，等待后端扣费后通过checkAuth刷新积分余额

      const { data: { session } } = await supabase.auth.getSession();
      
      // Calculate total prompt length for logging
      const totalPromptLength = SYSTEM_PROMPT.length + dbPrompt.length;
      const fullPromptText = SYSTEM_PROMPT + dbPrompt;
      setPromptLengthForLog(totalPromptLength);

      // Start monitoring immediately
      monitorTask(taskId, isModification, useDiffMode, totalPromptLength, fullPromptText);

      // Trigger Edge Function with Retry Logic
      const triggerGeneration = async () => {
        let triggerRetry = 0;
        const maxTriggerRetries = 3;

        while (triggerRetry <= maxTriggerRetries) {
            try {
                // Check if aborted before starting request
                if (abortControllerRef.current?.signal.aborted) {
                    console.log('Generation trigger aborted by user');
                    return;
                }

                const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-app-async`, {
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
                    }),
                    signal: abortControllerRef.current?.signal
                });

                if (res.status === 503 || res.status === 504 || res.status === 429) {
                    if (triggerRetry === maxTriggerRetries) {
                        const statusText = res.status === 503 ? '服务暂时不可用 (Service Unavailable)' : 
                                         res.status === 504 ? '网关超时 (Gateway Timeout)' : 
                                         '请求过多 (Too Many Requests)';
                        throw new Error(`服务器繁忙，请稍后重试。原因: ${statusText}`);
                    }
                    const waitTime = Math.pow(2, triggerRetry) * 1000 + Math.random() * 1000;
                    console.warn(`Generation Trigger ${res.status}. Retrying in ${Math.round(waitTime)}ms...`);
                    
                    setLoadingText(language === 'zh' 
                        ? `服务器繁忙 (${res.status})，正在重试 (${triggerRetry + 1}/${maxTriggerRetries})...` 
                        : `Server busy (${res.status}), retrying (${triggerRetry + 1}/${maxTriggerRetries})...`);

                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    triggerRetry++;
                    continue;
                }

                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`服务调用失败 (Service Error: ${res.status})`);
                }
                
                // Success - consume stream to keep connection alive
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
                return; // Success

            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.log('Generation trigger aborted');
                    return;
                }
                console.error('Trigger attempt failed:', err);
                if (triggerRetry === maxTriggerRetries) {
                    toastError(err.message || t.common.unknown_error);
                    setIsGenerating(false);
                    setCurrentTaskId(null);
                    return;
                }
                const waitTime = Math.pow(2, triggerRetry) * 1000;
                
                setLoadingText(language === 'zh' 
                    ? `连接不稳定，正在重试 (${triggerRetry + 1}/${maxTriggerRetries})...` 
                    : `Connection unstable, retrying (${triggerRetry + 1}/${maxTriggerRetries})...`);

                await new Promise(resolve => setTimeout(resolve, waitTime));
                triggerRetry++;
            }
        }
      };

      triggerGeneration();
      
      // The monitoring logic is now handled by monitorTask, so we don't need the duplicate code here.
      // We can remove the rest of the function that was handling polling/realtime.
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
          console.log('Generation aborted by user');
          return;
      }
      console.error('Generation error:', error);
      toastError(error.message || t.create.generation_failed);
      
      if (!isModification) {
        setStep('concept');
      }
      setIsGenerating(false);
      setCurrentTaskId(null);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  };

  const handleUpload = () => {
    if (!generatedCode || !generatedCode.trim()) {
        toastError(language === 'zh' ? '代码为空，无法发布' : 'Code is empty, cannot publish');
        return;
    }

    try {
      try {
          localStorage.setItem('spark_generated_code', generatedCode);
      } catch (e: any) {
          // Handle QuotaExceededError
          if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
              console.warn('Storage full, attempting to clear old session data...');
              // Try to remove the session backup to make space for the publish action
              localStorage.removeItem(STORAGE_KEY);
              localStorage.setItem('spark_generated_code', generatedCode);
          } else {
              throw e;
          }
      }

      localStorage.setItem('spark_generated_meta', JSON.stringify({
        title: `${t.categories[wizardData.category as keyof typeof t.categories] || 'App'}`,
        description: wizardData.description,
        tags: [wizardData.category, wizardData.style]
      }));
      
      const editId = searchParams.get('edit');
      if (editId) {
        router.push(`/upload?from=create&edit=${editId}`);
      } else {
        router.push('/upload?from=create');
      }
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      toastError(language === 'zh' ? '存储空间不足，无法发布。请尝试下载代码。' : 'Storage full, cannot publish. Please try downloading.');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedCode], { type: 'text/html;charset=utf-8' });
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
          timestamp: Date.now(),
          type: lastOperationType
      }]);
    }
    
    setGeneratedCode(item.code);
    setStreamingCode(item.code);
    setCurrentGenerationPrompt(item.prompt);
    setLastOperationType('rollback');
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
    
    // Removed confirmation dialog
    // const confirmMsg = ...
    // if (!confirm(confirmMsg)) return;
    
    const intentLabel = 
        editIntent === 'style' ? 'Visual/Style Update' :
        editIntent === 'content' ? 'Text/Content Update' :
        editIntent === 'logic' ? 'Logic/Behavior Update' : 'General Update';

    const prompt = `
### Point-and-Click Edit Request
**Intent:** ${intentLabel}

**Target Element Signature**
- **Tag:** \`<${selectedElement.tagName}>\`
- **Content:** "${selectedElement.innerText}"
- **Classes:** \`${selectedElement.className}\`
- **Parent Context:** Inside \`<${selectedElement.parentTagName || 'unknown'} class="${selectedElement.parentClassName || ''}">\`
- **CSS Path:** \`${selectedElement.path}\`

**User Instruction**
"${editRequest}"

**Execution Strategy**
1. **Locate**: Find the JSX element that matches the *Target Element Signature*. Use the 'Content' and 'Classes' as strong anchors.
2. **Scope**: Apply changes *strictly* to this element or its immediate wrapper.
3. **Preserve**: Do not modify unrelated siblings or parent containers unless necessary for the layout.
${editIntent === 'style' ? '4. **Style**: Use Tailwind CSS classes. Do not add custom CSS.' : ''}
${editIntent === 'content' ? '4. **Content**: Update the text or child components. Keep existing styles.' : ''}
${editIntent === 'logic' ? '4. **Logic**: Update the onClick handler or state logic associated with this element.' : ''}
    `.trim();

    setShowEditModal(false);
    setEditRequest('');
    setSelectedElement(null);
    setEditIntent('auto');
    
    startGeneration(true, prompt, editRequest, false, 'click');
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

  const handleFixError = (specificError?: string, details?: any) => {
    const errorToFix = specificError || runtimeError;
    if (!errorToFix) return;
    
    let prompt = language === 'zh' 
      ? `我遇到了一个运行时错误：${errorToFix}。请分析代码并修复它。`
      : `I encountered a runtime error: ${errorToFix}. Please analyze the code and fix it.`;

    if (details) {
        const stack = details.stack || details.componentStack || '';
        if (stack) {
            prompt += `\n\nStack Trace:\n${stack}`;
        }
        if (details.line) {
            prompt += `\n\nError Location: Line ${details.line}, Column ${details.col}`;
        }
    }
      
    startGeneration(true, prompt, '', false, 'fix');
    setRuntimeError(null);
  };

  const handleFullRepair = () => {
    if (isGenerating) return;
    
    const prompt = currentGenerationPrompt || wizardData.description || (language === 'zh' ? '修复应用' : 'Fix App');
    
    const confirmMsg = language === 'zh' 
        ? '全量修复将基于您最后一次的描述重新生成整个应用代码。这将消耗更多积分，但能解决大部分代码结构问题。是否继续？'
        : 'Full Repair will regenerate the entire app code based on your last description. This costs more credits but fixes most structural issues. Continue?';
        
    if (confirm(confirmMsg)) {
        startGeneration(true, prompt, '', true, 'fix');
    }
  };

  const renderHistoryModal = () => {
    if (!showHistoryModal) return null;
    
    const getTypeLabel = (type?: string) => {
        switch(type) {
            case 'init': return language === 'zh' ? '初始生成' : 'Initial';
            case 'chat': return language === 'zh' ? '对话修改' : 'Chat Edit';
            case 'click': return language === 'zh' ? '点选修改' : 'Visual Edit';
            case 'regenerate': return language === 'zh' ? '重新生成' : 'Regenerate';
            case 'fix': return language === 'zh' ? '自动修复' : 'Auto Fix';
            case 'rollback': return language === 'zh' ? '回滚恢复' : 'Rollback';
            default: return language === 'zh' ? '未知' : 'Unknown';
        }
    };

    const getTypeIcon = (type?: string) => {
        switch(type) {
            case 'init': return 'fa-wand-magic-sparkles';
            case 'chat': return 'fa-message';
            case 'click': return 'fa-arrow-pointer';
            case 'regenerate': return 'fa-rotate';
            case 'fix': return 'fa-screwdriver-wrench';
            case 'rollback': return 'fa-clock-rotate-left';
            default: return 'fa-code-branch';
        }
    };

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
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                            item.type === 'click' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                            item.type === 'chat' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                            item.type === 'regenerate' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                            item.type === 'fix' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                            'bg-slate-700 text-slate-300 border-slate-600'
                        }`}>
                            <i className={`fa-solid ${getTypeIcon(item.type)}`}></i>
                            {getTypeLabel(item.type)}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                        {new Date(item.timestamp).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')} 
                        </span>
                    </div>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="relative p-4 bg-slate-800/50 hover:bg-slate-700/80 border border-slate-700 hover:border-brand-500 rounded-xl transition-all group text-left hover:shadow-lg hover:-translate-y-1 hover:z-10"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-3 group-hover:scale-110 transition shadow-inner">
                      <i className={`fa-solid ${cat.icon} text-xl text-brand-400`}></i>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1.5">{t.categories[cat.id as keyof typeof t.categories]}</h3>
                    <p className="text-xs text-slate-400 leading-snug">{t.categories[`${cat.id}_desc` as keyof typeof t.categories]}</p>
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
              <div className="bg-slate-900/50 rounded-2xl border border-slate-700 focus-within:border-brand-500 transition-colors relative">
                <textarea
                  value={wizardData.description}
                  onChange={(e) => setWizardData(prev => ({ ...prev, description: e.target.value }))}
                  maxLength={5000}
                  // @ts-ignore
                  placeholder={t.placeholders?.[currentCategory] || (language === 'zh' ? '例如：我想做一个待办事项应用，风格要极简，支持暗黑模式...' : 'E.g. I want to build a Todo app, minimalist style, dark mode support...')}
                  className="w-full h-48 bg-transparent border-none outline-none appearance-none p-4 pb-4 text-white placeholder-slate-500 focus:ring-0 resize-none text-base leading-relaxed"
                ></textarea>
                
                <div className="absolute bottom-4 right-4 text-xs text-slate-500">
                  {wizardData.description.length}/5000
                </div>
              </div>
              
              {/* Action Buttons - Moved outside textarea */}
              <div className="flex items-center gap-2">
                 <button 
                   onClick={useMadLibsTemplate}
                   className="text-xs bg-slate-800 hover:bg-slate-700 text-brand-400 px-3 py-1.5 rounded-lg transition flex items-center gap-1 border border-slate-700"
                 >
                   <Edit3 size={12} />
                   {language === 'zh' ? '使用填空模板' : 'Use Template'}
                 </button>
                 <button 
                   onClick={optimizePrompt}
                   disabled={isOptimizingPrompt || !wizardData.description.trim()}
                   className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1 border border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed relative group"
                 >
                   {isOptimizingPrompt ? (
                     <>
                       <i className="fa-solid fa-spinner fa-spin"></i>
                       {language === 'zh' ? '优化中...' : 'Optimizing...'}
                     </>
                   ) : (
                     <>
                       <Wand2 size={12} />
                       {language === 'zh' ? 'AI 优化 (2积分)' : 'AI Optimize (2 credits)'}
                     </>
                   )}
                   <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-800 text-xs text-slate-300 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 border border-slate-700">
                     {language === 'zh' 
                       ? 'AI 将优化您的描述，使其更详细、专业。消耗 2 积分。' 
                       : 'AI will optimize your description to make it more detailed and professional. Costs 2 credits.'}
                   </div>
                 </button>
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
                  onClick={() => {
                    // Removed confirmation dialog
                    startGeneration(false, '', '', false, 'init');
                  }}
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
            <div className="w-full">
                <GenerationProgress 
                    plan={aiPlan} 
                    currentStep={currentStep} 
                    isGenerating={isGenerating} 
                    language={language} 
                    variant="centered"
                    loadingTip={loadingText}
                    streamingCode={streamingCode}
                />
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
          ${activeMobileTab === 'chat' ? 'flex pb-[80px] lg:pb-0' : 'hidden lg:flex'}
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
                  onClick={() => {
                    if (isFromUpload) {
                      toastError(language === 'zh' ? '上传的作品不支持重新生成，仅支持修改' : 'Uploaded works cannot be regenerated, only modified');
                      return;
                    }
                    // Removed confirmation dialog
                    startGeneration(false, currentGenerationPrompt, '', false, 'regenerate');
                  }}
                  className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition border ${
                    isFromUpload 
                      ? 'bg-slate-800/50 text-slate-500 border-slate-800 cursor-not-allowed' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
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
                    {isFromUpload 
                      ? (language === 'zh' ? '上传的作品不支持重新生成，请使用对话框进行修改。' : 'Uploaded works cannot be regenerated. Please use the chat to make modifications.')
                      : (language === 'zh' 
                        ? '使用当前的提示词和设置重新生成应用。如果对当前结果不满意（如布局错乱、功能缺失），可以尝试此操作。这将消耗积分。' 
                        : 'Regenerate the app using the current prompt and settings. Use this if the current result is not ideal (e.g., layout issues, missing features). This will consume credits.')
                    }
                  </p>
               </div>
             </div>
             <div className="relative group cursor-help">
               <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 transition-all duration-300 ${isCreditAnimating ? 'scale-125 border-red-500 bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.6)]' : ''}`}>
                 <i className={`fa-solid fa-coins text-xs transition-colors duration-300 ${isCreditAnimating ? 'text-red-500' : 'text-yellow-500'}`}></i>
                 <span className={`text-xs font-bold tabular-nums transition-colors duration-300 ${isCreditAnimating ? 'text-red-500' : 'text-slate-200'}`}>
                   {Number.isInteger(credits) ? credits : credits.toFixed(2)}
                 </span>
                 <span className="text-[10px] text-slate-500">{language === 'zh' ? '积分' : 'Credits'}</span>
               </div>
               <div className="absolute top-full right-0 mt-2 w-48 p-2 bg-slate-800 text-[10px] text-slate-300 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 border border-slate-700 text-center">
                  {language === 'zh' ? '积分根据实际输入输出代码字符数量动态计算' : 'Credits are calculated dynamically based on input and output code characters.'}
               </div>
             </div>
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
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-slate-700 text-white' : (msg.type === 'error' ? 'bg-red-500/20 text-red-500' : 'bg-brand-500/20 text-brand-400')}`}>
                <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : (msg.type === 'error' ? 'fa-triangle-exclamation' : 'fa-robot')}`}></i>
              </div>
              <div className={`p-3 rounded-2xl text-sm max-w-[80%] select-text ${
                  msg.role === 'user' 
                    ? 'bg-brand-600 text-white rounded-tr-none' 
                    : (msg.type === 'error' 
                        ? 'bg-red-900/30 border border-red-500/50 text-red-200 rounded-tl-none' 
                        : 'bg-slate-800 text-slate-300 rounded-tl-none')
              }`}>
                {msg.type === 'error' ? (
                    <div className="flex flex-col gap-2">
                        <div className="font-bold text-xs uppercase tracking-wider opacity-70 flex items-center gap-2">
                            {language === 'zh' ? '运行时错误' : 'Runtime Error'}
                            {msg.errorDetails?.line && <span className="bg-red-500/20 px-1.5 rounded text-[10px]">Line {msg.errorDetails.line}</span>}
                        </div>
                        <div className="font-mono text-xs break-words bg-black/20 p-2 rounded border border-red-500/20">
                            {msg.content}
                        </div>
                        <button 
                            onClick={() => handleFixError(msg.content, msg.errorDetails)}
                            className="mt-1 bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg"
                        >
                            <i className="fa-solid fa-wand-magic-sparkles"></i>
                            {language === 'zh' ? 'AI 自动修复' : 'Fix with AI'}
                        </button>
                    </div>
                ) : (
                    <>
                        {msg.plan && (
                            <div className="mb-3 pb-3 border-b border-white/10">
                                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1 uppercase tracking-wider font-semibold">
                                    <i className="fa-solid fa-brain text-purple-400"></i>
                                    {language === 'zh' ? '思考过程' : 'Thinking Process'}
                                </div>
                                <div className="text-xs text-slate-300 whitespace-pre-wrap bg-black/20 p-2 rounded font-mono max-h-32 overflow-y-auto custom-scrollbar">
                                    {msg.plan}
                                </div>
                            </div>
                        )}
                        {msg.content}
                        {msg.cost && (
                            <div className="mt-2 pt-2 border-t border-white/5 flex justify-end">
                                <span className="text-[10px] text-slate-500 flex items-center gap-1 opacity-70">
                                    <i className="fa-solid fa-bolt text-yellow-500/50 text-[9px]"></i>
                                    {language === 'zh' ? `消耗 ${msg.cost} 积分` : `Cost: ${msg.cost} credits`}
                                </span>
                            </div>
                        )}
                    </>
                )}
              </div>
            </div>
          ))}
          
          {isGenerating && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
                <i className="fa-solid fa-robot fa-bounce"></i>
              </div>
              <div className="flex-1 min-w-0">
                  <GenerationProgress 
                    plan={aiPlan}
                    currentStep={currentStep}
                    isGenerating={isGenerating}
                    language={language}
                    variant="chat"
                    loadingTip={loadingText}
                    streamingCode={streamingCode}
                  />
              </div>
            </div>
          )}
          
          <div ref={chatEndRef}></div>
        </div>

        {/* Mobile Actions Bar */}
        <div className="lg:hidden p-2 bg-slate-900 border-t border-slate-800 flex gap-2 shrink-0">
           <button 
             onClick={() => setShowHistoryModal(true)}
             className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs whitespace-nowrap flex items-center justify-center gap-1"
           >
             <i className="fa-solid fa-clock-rotate-left"></i> {t.create.history}
           </button>
           <button 
             onClick={handleDownload}
             className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs whitespace-nowrap flex items-center justify-center gap-1"
           >
             <i className="fa-solid fa-download"></i> {t.create.download}
           </button>
           <button 
             onClick={() => {
                const blob = new Blob([generatedCode], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
             className="flex-1 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs whitespace-nowrap flex items-center justify-center gap-1"
           >
             <i className="fa-solid fa-code"></i> {t.create.view_code}
           </button>
        </div>

        {/* Input Area */}
        <div className="p-3 lg:p-4 border-t border-slate-800 bg-slate-900 shrink-0 lg:mb-0">
          <div className="flex justify-end mb-2">
            <button
                onClick={handleFullRepair}
                disabled={isGenerating}
                className="text-xs flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition border border-slate-700"
                title={language === 'zh' ? '基于当前描述重新生成完整代码' : 'Regenerate full code based on current description'}
            >
                <i className="fa-solid fa-screwdriver-wrench"></i>
                {language === 'zh' ? '全量修复' : 'Full Repair'}
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGenerating && chatInput.trim()) {
                  // Removed confirmation dialog
                  startGeneration(true, '', '', false, 'chat');
                }
              }}
              placeholder={t.create.chat_placeholder}
              disabled={isGenerating}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-4 pr-12 py-2 lg:py-3 text-sm lg:text-base text-white focus:border-brand-500 outline-none disabled:opacity-50"
            />
            <button 
              onClick={() => {
                if (!chatInput.trim() || isGenerating) return;
                // Removed confirmation dialog
                startGeneration(true, '', '', false, 'chat');
              }}
              disabled={isGenerating || !chatInput.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-brand-600 hover:bg-brand-500 text-white rounded-lg flex items-center justify-center transition disabled:opacity-50 disabled:bg-slate-700"
            >
              {isGenerating ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>}
            </button>
          </div>
        </div>

        {/* Actions - Hidden on mobile to save space, or simplified */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 space-y-3 hidden lg:block shrink-0">
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
          
          <button 
            onClick={handleUpload}
            className="px-3 py-1.5 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold transition shadow-lg flex items-center gap-1.5"
          >
            <i className="fa-solid fa-rocket"></i> 
            <span>{t.create.publish}</span>
          </button>
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
               sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-same-origin"
             />
          </div>
          
          {/* Floating Preview Controls */}
          <div className="absolute bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10 w-max max-w-full px-4">
            {runtimeError && (
               <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-max max-w-[90vw] animate-bounce-in">
                 <div className="bg-red-500/90 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-2xl border border-red-400 flex items-center gap-3">
                   <i className="fa-solid fa-triangle-exclamation text-xl animate-pulse"></i>
                   <div className="flex flex-col">
                     <span className="text-xs font-bold uppercase opacity-80">{language === 'zh' ? '检测到错误' : 'Error Detected'}</span>
                     <span className="text-sm font-mono max-w-[200px] truncate" title={runtimeError}>{runtimeError}</span>
                   </div>
                   <div className="h-8 w-px bg-white/20 mx-1"></div>
                   <button 
                     onClick={() => handleFixError()}
                     className="bg-white text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 transition flex items-center gap-1 whitespace-nowrap shadow-sm"
                   >
                     <i className="fa-solid fa-wand-magic-sparkles"></i>
                     {language === 'zh' ? 'AI 修复' : 'Fix with AI'}
                   </button>
                   <button 
                     onClick={() => setRuntimeError(null)}
                     className="text-white/70 hover:text-white transition"
                   >
                     <X size={16} />
                   </button>
                 </div>
               </div>
            )}

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
    <div className={`min-h-screen text-white relative ${step === 'preview' ? 'h-[100dvh] overflow-hidden' : ''}`}>
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

      {/* Timeout Modal */}
      {showTimeoutModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-amber-400">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
              <h3 className="text-xl font-bold">{language === 'zh' ? '生成时间较长' : 'Generation Taking Long'}</h3>
            </div>
            <p className="text-slate-300 mb-6 leading-relaxed">
              {language === 'zh' 
                ? 'AI 生成响应时间超过预期。这可能是由于服务器繁忙或任务较复杂。您可以选择继续等待，或者取消任务（积分将全额退还）。' 
                : 'AI generation is taking longer than expected. This might be due to server load or task complexity. You can keep waiting or cancel (credits will be fully refunded).'}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => handleCancelGeneration(timeoutCost)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition border border-slate-700 flex flex-col items-center justify-center gap-0.5"
              >
                <span className="font-bold text-sm">{language === 'zh' ? '取消任务' : 'Cancel Task'}</span>
                <span className="text-[10px] text-slate-400 font-normal">{language === 'zh' ? '积分将全额退还' : 'Credits fully refunded'}</span>
              </button>
              <button 
                onClick={handleTimeoutWait}
                className="flex-1 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition shadow-lg shadow-brand-500/20"
              >
                {language === 'zh' ? '继续等待' : 'Keep Waiting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedElement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400">
                    <i className="fa-solid fa-pen-to-square"></i>
                </div>
                {t.create.edit_element_title}
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
                {/* Context Card */}
                <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition">
                     <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        {selectedElement.tagName.toLowerCase()}
                     </span>
                  </div>
                  
                  <div className="space-y-3">
                      <div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1.5 flex items-center gap-2">
                            <i className="fa-solid fa-crosshairs"></i> {t.create.edit_element_selected}
                        </div>
                        <div className="font-mono text-sm text-brand-300 break-all">
                            &lt;{selectedElement.tagName.toLowerCase()} className="..."&gt;
                        </div>
                      </div>
                      
                      {selectedElement.innerText && (
                          <div className="pl-3 border-l-2 border-slate-800">
                            <div className="text-xs text-slate-500 mb-1">Content Preview</div>
                            <div className="text-sm text-slate-300 italic line-clamp-2">
                                "{selectedElement.innerText.substring(0, 100)}"
                            </div>
                          </div>
                      )}

                      {selectedElement.parentTagName && (
                          <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-800/50">
                             <i className="fa-solid fa-level-up-alt fa-rotate-90"></i>
                             <span>Inside &lt;{selectedElement.parentTagName}&gt;</span>
                          </div>
                      )}
                  </div>
                </div>

                {/* Intent Selector */}
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        {language === 'zh' ? '修改类型' : 'Modification Type'}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'auto', icon: 'fa-wand-magic-sparkles', label: language === 'zh' ? '自动' : 'Auto' },
                            { id: 'style', icon: 'fa-palette', label: language === 'zh' ? '样式' : 'Style' },
                            { id: 'content', icon: 'fa-font', label: language === 'zh' ? '内容' : 'Content' },
                            { id: 'logic', icon: 'fa-code', label: language === 'zh' ? '逻辑' : 'Logic' }
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setEditIntent(type.id as any)}
                                className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg border transition-all ${
                                    editIntent === type.id 
                                    ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-900/20' 
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                }`}
                            >
                                <i className={`fa-solid ${type.icon} text-sm`}></i>
                                <span className="text-[10px] font-bold">{type.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                
                {/* Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    {t.create.edit_element_label}
                  </label>
                  <div className="relative">
                      <textarea
                        value={editRequest}
                        onChange={(e) => setEditRequest(e.target.value)}
                        placeholder={
                            editIntent === 'style' ? (language === 'zh' ? '例如：改为圆角按钮，背景色用蓝色...' : 'E.g. Make it rounded with blue background...') :
                            editIntent === 'content' ? (language === 'zh' ? '例如：把文字改为“提交订单”...' : 'E.g. Change text to "Submit Order"...') :
                            editIntent === 'logic' ? (language === 'zh' ? '例如：点击后弹出一个提示框...' : 'E.g. Show an alert on click...') :
                            t.create.edit_element_placeholder
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-h-[120px] resize-none text-sm leading-relaxed"
                        autoFocus
                      />
                      <div className="absolute bottom-3 right-3 text-[10px] text-slate-600">
                        {editRequest.length} chars
                      </div>
                  </div>
                </div>
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-colors border border-slate-700"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleElementEditSubmit}
                disabled={!editRequest.trim()}
                className="flex-[2] px-4 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all shadow-lg shadow-brand-900/20 flex items-center justify-center gap-2"
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

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 px-4 flex justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i></div>}>
      <CreateContent />
    </Suspense>
  );
}
