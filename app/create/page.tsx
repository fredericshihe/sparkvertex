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
import { AIWorkflowProgress, type WorkflowStage, type StageDetails } from '@/components/AIWorkflowProgress';
import { CodeWaterfall } from '@/components/CodeWaterfall';

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

  // Model Configuration
  type ModelType = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3-pro-preview';
  const MODEL_CONFIG = {
    'gemini-2.5-flash': { 
      name: 'Gemini 2.5 Flash', 
      tokensPerCredit: 5000, 
      icon: '⚡', 
      description: language === 'zh' ? '日常修改' : 'Daily edits',
      subtitle: language === 'zh' ? '便宜快速，适合简单任务' : 'Fast & cheap for simple tasks'
    },
    'gemini-2.5-pro': { 
      name: 'Gemini 2.5 Pro', 
      tokensPerCredit: 4000, 
      icon: '🚀', 
      description: language === 'zh' ? '复杂任务' : 'Complex tasks',
      subtitle: language === 'zh' ? '均衡性能，适合较复杂需求' : 'Balanced for moderate complexity'
    },
    'gemini-3-pro-preview': { 
      name: 'Gemini 3 Pro', 
      tokensPerCredit: 3000, 
      icon: '🧠', 
      description: language === 'zh' ? '高质量' : 'High quality',
      subtitle: language === 'zh' ? '最强智能，复杂逻辑首选' : 'Most powerful for complex logic'
    }
  };

  // State: Generation
  const [selectedModel, setSelectedModel] = useState<ModelType>('gemini-2.5-pro');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modificationCount, setModificationCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string, type?: 'text' | 'error', errorDetails?: any, plan?: string, cost?: number, isBlankScreen?: boolean, canAutoFix?: boolean}[]>([]);
  const [loadingText, setLoadingText] = useState(t.create.analyzing);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('mobile');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamingCode, setStreamingCode] = useState('');
  const [currentGenerationPrompt, setCurrentGenerationPrompt] = useState('');
  
  // State: History
  const [codeHistory, setCodeHistory] = useState<{code: string, prompt: string, timestamp: number, type?: 'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback'}[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [lastOperationType, setLastOperationType] = useState<'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback'>('init');

  // State: Point-and-Click Edit
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{tagName: string, className: string, innerText: string, path: string, parentTagName?: string, parentClassName?: string} | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRequest, setEditRequest] = useState('');
  const [editIntent, setEditIntent] = useState<'auto' | 'style' | 'content' | 'logic'>('auto');
  const [hasSeenEditGuide, setHasSeenEditGuide] = useState(false);
  
  // State: Quick Edit (direct color/text modification without AI)
  const [quickEditMode, setQuickEditMode] = useState<'none' | 'color' | 'text'>('none');
  const [quickEditColor, setQuickEditColor] = useState('#3b82f6');
  const [quickEditText, setQuickEditText] = useState('');
  const [quickEditColorType, setQuickEditColorType] = useState<'bg' | 'text' | 'border' | 'all'>('all');
  const [availableColorTypes, setAvailableColorTypes] = useState<('bg' | 'text' | 'border')[]>([]);
  
  // State: Quick Edit History (for undo/redo within quick edit session)
  const [quickEditHistory, setQuickEditHistory] = useState<{ code: string; description: string }[]>([]);
  const [quickEditHistoryIndex, setQuickEditHistoryIndex] = useState(-1);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(true); // History panel expanded state
  
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
  
  // State: Draft
  const [draftId, setDraftId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null); // Add user state for saving draft
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveDraft = async () => {
    console.log('handleSaveDraft called');
    if (isSaving) return;
    
    if (!userId) {
      console.log('No userId, opening login modal');
      openLoginModal();
      return;
    }

    if (!generatedCode) {
      console.log('No generatedCode');
      toastError(language === 'zh' ? '没有可保存的内容' : 'Nothing to save');
      return;
    }

    setIsSaving(true);
    // Show loading toast
    // toastSuccess(language === 'zh' ? '正在保存草稿...' : 'Saving draft...');

    try {
      console.log('Preparing draft data...');
      const draftData = {
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
        quickEditHistory,
        quickEditHistoryIndex,
        timestamp: Date.now()
      };

      const itemData = {
        title: wizardData.description?.slice(0, 50) || 'Untitled Draft',
        description: wizardData.description || '',
        content: generatedCode,
        prompt: currentGenerationPrompt,
        // category: wizardData.category || 'tool', // Temporarily disabled due to schema cache error
        is_draft: true,
        draft_data: draftData,
        author_id: userId,
        // user_id: userId, // Temporarily disabled due to schema mismatch
        is_public: false,
        // updated_at: new Date().toISOString() // Temporarily disabled due to schema mismatch
      };
      
      console.log('Sending to Supabase:', itemData);

      let result;
      if (draftId) {
        console.log('Updating existing draft:', draftId);
        result = await supabase
          .from('items')
          .update(itemData)
          .eq('id', draftId)
          .select()
          .single();
      } else {
        console.log('Creating new draft');
        result = await supabase
          .from('items')
          .insert(itemData)
          .select()
          .single();
      }

      console.log('Supabase result:', result);

      if (result.error) throw result.error;

      if (result.data) {
        setDraftId(result.data.id);
        // Update URL without reload
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('draftId', result.data.id);
        window.history.replaceState({}, '', newUrl.toString());
        
        toastSuccess(language === 'zh' ? '草稿已保存' : 'Draft saved');
        
        // Redirect to profile page immediately
        setTimeout(() => {
          router.push('/profile');
        }, 500);
      } else {
        setIsSaving(false);
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toastError(language === 'zh' ? '保存失败' : 'Failed to save');
      setIsSaving(false);
    }
  };

  
  // State: Generation Phase for Animation
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'starting' | 'generating' | 'completing' | 'completed'>('idle');

  // 🆕 AI 工作流可视化状态
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idle');
  const [workflowDetails, setWorkflowDetails] = useState<StageDetails>({});
  
  // State: Credit Animation
  const [isCreditAnimating, setIsCreditAnimating] = useState(false);
  const prevCreditsRef = useRef(credits);
  const currentTaskCostRef = useRef<number | null>(null);
  const currentTaskReasoningRef = useRef<string | null>(null); // 🆕 存储 DeepSeek 思考过程

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
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Click outside to close history panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isHistoryPanelOpen && historyPanelRef.current && !historyPanelRef.current.contains(event.target as Node)) {
        setIsHistoryPanelOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isHistoryPanelOpen]);

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
        // Keep edit mode active - don't exit automatically
        // User can continue clicking other elements after closing modal
      }
      
      // Handle edit mode restore request after content update
      if (event.data && event.data.type === 'spark-request-edit-mode-restore') {
        // Re-send edit mode state to iframe immediately
        if (isEditMode && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
        }
      }
      
      // Handle content updated confirmation - re-enable edit mode aggressively
      if (event.data && event.data.type === 'spark-content-updated') {
        console.log('iframe content updated');
        // Re-send edit mode state multiple times to ensure it takes effect after React re-renders
        if (isEditMode && iframeRef.current?.contentWindow) {
          // Immediate
          iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
          // After React might have rendered
          setTimeout(() => {
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
            }
          }, 50);
          // Final check after animations
          setTimeout(() => {
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
            }
          }, 150);
        }
      }
      
      if (event.data && event.data.type === 'spark-app-error') {
        const errorData = event.data.error;
        const errorMessage = typeof errorData === 'string' ? errorData : errorData.message;
        const isBlankScreen = errorData?.type === 'blank-screen';
        const shouldAutoFix = event.data.autoFix === true;
        
        console.warn('Runtime Error Caught:', errorMessage, isBlankScreen ? '(blank screen)' : '');
        
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
                errorDetails: errorData,
                isBlankScreen,
                canAutoFix: shouldAutoFix || isBlankScreen  // Blank screen errors can be auto-fixed
            }];
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEditMode]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // Effect: Handle Generation Phase Transitions
  useEffect(() => {
    if (generationPhase === 'completing') {
      const timer = setTimeout(() => {
        setGenerationPhase('completed');
        setStep('preview');
      }, 2000); // 2 seconds for success animation
      return () => clearTimeout(timer);
    }
  }, [generationPhase]);

  // Effect: Handle Workflow Stage Reset (for smooth transition in chat)
  useEffect(() => {
    if (workflowStage === 'completed' && !isGenerating) {
      const timer = setTimeout(() => {
        setWorkflowStage('idle');
      }, 1000); // Keep visible for 1 second after completion
      return () => clearTimeout(timer);
    }
  }, [workflowStage, isGenerating]);

  useEffect(() => {
    const draftIdParam = searchParams.get('draftId');
    if (draftIdParam) {
      setDraftId(draftIdParam);
      // Fetch draft data
      const fetchDraft = async () => {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('id', draftIdParam)
          .single();
          
        if (data && data.draft_data) {
          const parsed = data.draft_data;
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
          if (parsed.quickEditHistory) setQuickEditHistory(parsed.quickEditHistory);
          if (typeof parsed.quickEditHistoryIndex === 'number') setQuickEditHistoryIndex(parsed.quickEditHistoryIndex);
          
          if ((parsed.step === 'preview' || parsed.step === 'generating') && parsed.generatedCode) {
             setStreamingCode(parsed.generatedCode);
             setStep('preview');
             setIsGenerating(false);
          }
          
          setTimeout(() => toastSuccess(language === 'zh' ? '已加载草稿' : 'Draft loaded'), 500);
        }
      };
      fetchDraft();
      return;
    }

    const fromUpload = searchParams.get('from') === 'upload';
    if (fromUpload) {
        const importedCode = localStorage.getItem('spark_upload_import');
        const isFreshUpload = localStorage.getItem('spark_upload_fresh') === 'true';
        if (importedCode) {
            setGeneratedCode(importedCode);
            setStreamingCode(importedCode);
            setStep('preview');
            setWizardData(prev => ({ ...prev, description: 'Imported from Upload' }));
            
            // Initialize history with the imported code
            // Mark as 'upload' type to enable first-edit optimizations
            setCodeHistory([{
                code: importedCode,
                prompt: 'Imported from Upload',
                timestamp: Date.now(),
                type: isFreshUpload ? 'upload' : 'init'
            }]);

            localStorage.removeItem('spark_upload_import');
            localStorage.removeItem('spark_upload_fresh');
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
            // Restore quick edit history
            if (parsed.quickEditHistory) setQuickEditHistory(parsed.quickEditHistory);
            if (typeof parsed.quickEditHistoryIndex === 'number') setQuickEditHistoryIndex(parsed.quickEditHistoryIndex);
            
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

  // Helper to detect if current session is first edit on uploaded code
  const isFirstEditOnUploadedCode = () => {
    return codeHistory.length === 1 && codeHistory[0]?.type === 'upload';
  };

  // Effect to resume monitoring if we have a task ID and are in generating state
  useEffect(() => {
    if (isGenerating && currentTaskId && !channelRef.current) {
        console.log('Resuming task monitoring for:', currentTaskId);
        const relaxedMode = isFirstEditOnUploadedCode();
        if (relaxedMode) {
            console.log('[Resume] Detected first edit on uploaded code - using relaxed mode');
        }
        monitorTask(currentTaskId, false, false, promptLengthForLog, '', relaxedMode);
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
      quickEditHistory,
      quickEditHistoryIndex,
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
                     chatHistory: chatHistory.slice(-20),
                     quickEditHistory: quickEditHistory.slice(-10) // Keep last 10 quick edit history items
                 };
                 localStorage.setItem(STORAGE_KEY, JSON.stringify(slimState));
             } catch (e2) {
                 console.warn('Slim save failed, attempting minimal save...');
                 try {
                     // Strategy 2: Keep only current code and wizard data (no history)
                     const minimalState = {
                         ...stateToSave,
                         codeHistory: [],
                         chatHistory: chatHistory.slice(-5),
                         quickEditHistory: [], // Clear quick edit history in minimal save
                         quickEditHistoryIndex: -1
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
  }, [step, wizardData, generatedCode, chatHistory, codeHistory, currentGenerationPrompt, previewMode, currentTaskId, promptLengthForLog, conversationSummary, quickEditHistory, quickEditHistoryIndex]);

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
            quickEditHistory,
            quickEditHistoryIndex,
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
                    quickEditHistory: quickEditHistory.slice(-10), // Keep last 10 history items
                    quickEditHistoryIndex,
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
                     const minimalState = {
                        step,
                        wizardData,
                        generatedCode,
                        chatHistory: chatHistory.slice(-5),
                        codeHistory: [],
                        currentGenerationPrompt,
                        previewMode,
                        currentTaskId,
                        promptLengthForLog,
                        conversationSummary,
                        quickEditHistory: [], // Clear in minimal save
                        quickEditHistoryIndex: -1,
                        timestamp: Date.now()
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
  }, [step, wizardData, generatedCode, chatHistory, codeHistory, currentGenerationPrompt, previewMode, currentTaskId, quickEditHistory, quickEditHistoryIndex]);

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

  // Full Screen Toggle
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      previewContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

    // 5. Refresh Credits (取消时还未扣费，无需退款)
    // 后端Edge Function会检测到客户端断开，任务标记为cancelled，不扣积分
    checkAuth(); // 刷新积分余额
    
    // 取消时还没扣费，所以不需要退款提示
    toastSuccess(language === 'zh' ? '已取消生成' : 'Generation cancelled');

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
      // Reset timeout timer for another 60 seconds (longer interval after user chose to wait)
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = setTimeout(() => {
          // Only show again if we are still generating and still haven't received code
          if (isGenerating && !streamingCode) {
              setShowTimeoutModal(true);
          }
      }, 60000);
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
  // 🔑 IMPLICIT CACHING OPTIMIZATION:
  // Gemini caches request prefixes. We structure prompts so stable content comes FIRST:
  // 1. EXISTING CODE (most stable - same across multiple edits)
  // 2. FIXED INSTRUCTIONS (same structure every time)
  // 3. CONVERSATION HISTORY (grows incrementally)
  // 4. USER REQUEST (changes every time - put LAST)
  
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

      // Format History (placed BEFORE user request for caching)
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
        // 🔑 CACHE-OPTIMIZED ORDER: Code → Fixed Instructions → History → User Request
        return `# EXISTING CODE (for context)
\`\`\`html
${safeCode}
\`\`\`

# TASK INSTRUCTIONS (Full Rewrite Mode)
Based on the EXISTING CODE provided above, apply the user's request and output the COMPLETE updated HTML file.
You MUST preserve all existing functionality and structure that is not related to the user's request.
DO NOT start from scratch.

## CONSTRAINTS
- Maintain single-file structure
- Use React 18 and Tailwind CSS
- Preserve all existing features unless explicitly asked to remove them
- Ensure the code is fully functional

## OUTPUT FORMAT
1. Start with: /// PLAN ///
[Analyze the request and list the steps to rewrite the app in ${language === 'zh' ? 'Chinese' : 'English'}]
///
2. Then output: /// STEP: ${language === 'zh' ? '重写应用' : 'Rewriting Application'} ///
3. Then output the complete updated HTML file (no code blocks, no markdown)
4. Finally: /// SUMMARY: [Brief summary in ${language === 'zh' ? 'Chinese' : 'English'}] ///

${historyContext ? `# CONVERSATION HISTORY\n${historyContext}\n` : ''}
# USER REQUEST
${modificationRequest}`;
      }

      // 🔑 CACHE-OPTIMIZED ORDER for Diff Mode: Code → Fixed Instructions → History → User Request
      return `# EXISTING CODE (for context)
\`\`\`html
${safeCode}
\`\`\`

# TASK INSTRUCTIONS (Diff Mode)
Modify the above code using the diff format specified in the system instructions.

## OUTPUT FORMAT
1. Start with: /// PLAN ///
[Analyze the request and list the modification steps in ${language === 'zh' ? 'Chinese' : 'English'}]
///
2. Then output: /// STEP: ${language === 'zh' ? '应用修改' : 'Applying Changes'} ///
3. Then output one or more <<<<SEARCH...====...>>>> blocks
4. Ensure SEARCH blocks match the original code EXACTLY (character-for-character, including all whitespace)
5. Finally: /// SUMMARY: [Brief summary in ${language === 'zh' ? 'Chinese' : 'English'}] ///

${historyContext ? `# CONVERSATION HISTORY\n${historyContext}\n` : ''}
# USER REQUEST
${modificationRequest}`;
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

  const monitorTask = async (taskId: string, isModification = false, useDiffMode = false, fullPromptLength = 0, fullPromptText = '', relaxedMode = false, targets: string[] = []) => {
      let isFinished = false;
      let lastUpdateTimestamp = Date.now();
      let hasStartedStreaming = false;
      
      if (relaxedMode) {
          console.log('[MonitorTask] Using relaxed patch matching mode');
      }
      
      if (targets && targets.length > 0) {
          console.log('[MonitorTask] Received explicit targets for patch safety:', targets);
      }

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
                
                // 🆕 更新工作流可视化 - Gemini 计划
                setWorkflowDetails(prev => ({
                    ...prev,
                    plan: planMatch[1].trim()
                }));
            }

            // Extract Steps
            const stepMatches = [...content.matchAll(/\/\/\/ STEP: (.*?) \/\/\//g)];
            if (stepMatches.length > 0) {
                const currentStepName = stepMatches[stepMatches.length - 1][1].trim();
                setCurrentStep(currentStepName);
                content = content.replace(/\/\/\/ STEP: .*? \/\/\//g, '');
                
                // 简化显示：如果步骤名太长，只显示前20个字符
                const displayStepName = currentStepName.length > 20 ? currentStepName.substring(0, 20) + '...' : currentStepName;
                setLoadingText(language === 'zh' ? `正在执行: ${displayStepName}` : `Executing: ${displayStepName}`);
                
                // 🆕 更新工作流可视化 - 当前步骤和已完成步骤瀑布流
                const allStepNames = stepMatches.map(m => m[1].trim());
                const completedSteps = allStepNames.slice(0, -1); // 除最后一个外都是已完成的
                
                setWorkflowDetails(prev => ({
                    ...prev,
                    currentStep: currentStepName,
                    completedSteps: completedSteps,
                    stepsCompleted: stepMatches.length,
                    totalSteps: Math.max(stepMatches.length + 1, prev.totalSteps || 0) // 估计总步骤
                }));
            }

            setStreamingCode(content);
            
            // 🆕 更新工作流可视化 - 流式代码
            setWorkflowDetails(prev => ({
                ...prev,
                streamingCode: content
            }));
            
            if (!hasStartedStreaming) {
                setGenerationPhase('generating');
            }
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
                
                // Safety Net 3: Protocol Violation Check
                // If AI returns a full file instead of patches, reject it to prevent truncation/corruption.
                if (rawCode.includes('<!DOCTYPE html>') || (rawCode.includes('<html') && rawCode.includes('</html>'))) {
                    console.error('Protocol Violation: AI returned full file in Diff Mode.');
                    // We cannot recover from this easily without a retry loop.
                    // For now, throw an error to stop processing and alert the user.
                    throw new Error(language === 'zh' 
                        ? 'AI 生成格式错误（返回了完整文件而非补丁），请重试。' 
                        : 'AI Protocol Violation: Returned full file instead of patches. Please try again.');
                }
                
                try {
                    console.log('Applying patches. Source length:', generatedCode.length, 'Patch length:', rawCode.length);
                    
                    // Extract Summary
                    // 优化正则：支持 /// SUMMARY: ... /// 和 /// SUMMARY: ... (到结尾) 两种格式
                    const summaryMatch = rawCode.match(/\/\/\/\s*SUMMARY:\s*([\s\S]*?)(?:\/\/\/|$)/);
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
                    // 优化正则：支持 /// ANALYSIS: ... /// 和 /// ANALYSIS: ... (到结尾) 两种格式
                    const analysisMatch = rawCode.match(/\/\/\/\s*ANALYSIS:\s*([\s\S]*?)(?:\/\/\/|$)/);
                    if (analysisMatch) {
                        console.log('AI Analysis:', analysisMatch[1].trim());
                    }

                    // 尝试应用补丁
                    // 如果第一次失败，尝试开启 relaxedMode（宽松匹配）
                    let patched;
                    try {
                        patched = applyPatches(generatedCode, rawCode, relaxedMode, targets);
                    } catch (patchError: any) {
                        console.warn('Standard patch failed, retrying with relaxed mode...', patchError.message);
                        // 如果第一次不是 relaxedMode，则尝试开启 relaxedMode
                        if (!relaxedMode) {
                            try {
                                patched = applyPatches(generatedCode, rawCode, true, targets);
                                console.log('Relaxed patch succeeded!');
                            } catch (retryError) {
                                throw patchError; // 如果重试也失败，抛出原始错误
                            }
                        } else {
                            throw patchError;
                        }
                    }
                    
                    if (patched === generatedCode) {
                        console.warn('Patch applied but code is unchanged.');
                        console.log('[Debug] rawCode length:', rawCode.length);
                        console.log('[Debug] rawCode preview (first 500 chars):', rawCode.substring(0, 500));
                        console.log('[Debug] Contains <<<<SEARCH:', rawCode.includes('<<<<SEARCH'));
                        console.log('[Debug] Contains <!DOCTYPE:', rawCode.includes('<!DOCTYPE html>'));
                        console.log('[Debug] Contains <html:', rawCode.includes('<html'));
                        
                        if (!rawCode.includes('<<<<SEARCH')) {
                             // Fallback: Check if AI returned a full file instead of patches
                             if (rawCode.includes('<!DOCTYPE html>') || rawCode.includes('<html')) {
                                 console.log('AI returned full file instead of patches. Switching to full replacement.');
                                 const finalCode = cleanTheCode(rawCode);
                                 setGeneratedCode(finalCode);
                                 toastSuccess(t.create.success_edit);
                                 
                                 // 最终结论消息不包含思考过程
                                 if (summary) {
                                     setChatHistory(prev => [...prev, { role: 'ai', content: summary, cost: currentTaskCostRef.current || undefined }]);
                                 } else {
                                     setChatHistory(prev => [...prev, { role: 'ai', content: language === 'zh' ? '已根据您的要求更新了代码。' : 'Updated the code based on your request.', cost: currentTaskCostRef.current || undefined }]);
                                 }
                                 
                                 setIsGenerating(false);
                                 setWorkflowStage('completed'); // 🆕 完成工作流
                                 setCurrentTaskId(null); // Clear task ID
                                 currentTaskReasoningRef.current = null; // 🆕 清理 reasoning
                                 return;
                             }

                             // Check if AI only returned PLAN without code (response truncated)
                             const hasOnlyPlan = rawCode.includes('/// PLAN') && rawCode.length < 1000;
                             
                             // Log what we actually received to help debug
                             console.error('[Debug] AI response does not contain valid format. Full rawCode:', rawCode);
                             
                             if (hasOnlyPlan) {
                                 throw new Error(language === 'zh' ? 'AI 响应不完整（只有计划没有代码），请重试' : 'AI response incomplete (only plan, no code), please retry');
                             }
                             
                             // 如果 rawCode 为空，说明流式传输可能失败了，或者 Edge Function 返回了空内容
                             if (!rawCode || rawCode.trim().length === 0) {
                                 throw new Error(language === 'zh' ? 'AI 返回了空内容，请检查网络或重试' : 'AI returned empty content, please check network or retry');
                             }

                             // 特殊情况：AI 认为不需要修改代码
                             // 如果 AI 返回了 ANALYSIS 和 SUMMARY，但没有代码块，且明确表示不需要修改
                             if (rawCode.includes('/// ANALYSIS') && rawCode.includes('/// SUMMARY') && !rawCode.includes('<<<<SEARCH')) {
                                 console.log('AI determined no changes are needed.');
                                 
                                 // 提取 Summary 作为回复
                                 const summaryMatch = rawCode.match(/\/\/\/\s*SUMMARY:\s*([\s\S]*?)(?:\/\/\/|$)/);
                                 const summaryContent = summaryMatch ? summaryMatch[1].trim() : (language === 'zh' ? 'AI 认为当前代码已满足要求，无需修改。' : 'AI determined no changes are needed.');
                                 
                                 // 最终结论消息不包含思考过程
                                 setChatHistory(prev => [...prev, { role: 'ai', content: summaryContent, cost: currentTaskCostRef.current || undefined }]);
                                 setIsGenerating(false);
                                 setWorkflowStage('completed'); // 🆕 完成工作流
                                 setCurrentTaskId(null);
                                 currentTaskReasoningRef.current = null; // 🆕 清理
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
                    // Clear quick edit history when AI generates new content
                    resetQuickEditHistory();
                    toastSuccess(t.create.success_edit);
                    
                    const finalContent = summary || (language === 'zh' ? '已根据您的要求更新了代码。' : 'Updated the code based on your request.');
                    // 最终结论消息不包含思考过程
                    setChatHistory(prev => [...prev, { role: 'ai', content: finalContent, cost: currentTaskCostRef.current || undefined }]);
                    currentTaskReasoningRef.current = null;
                } catch (e: any) {
                    console.error('Patch failed:', e);
                    
                    // Helper to get cost - try ref first, then fetch from DB with retry
                    const getCost = async (): Promise<number> => {
                        // First check ref
                        if (currentTaskCostRef.current && currentTaskCostRef.current > 0) {
                            return currentTaskCostRef.current;
                        }
                        
                        // Retry logic: wait for cost to be written to DB
                        // The Edge Function writes cost after completion, there might be a small delay
                        for (let attempt = 0; attempt < 5; attempt++) {
                            // Wait a bit for DB to be updated
                            if (attempt > 0) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                            
                            // Check ref again (might have been updated by broadcast)
                            if (currentTaskCostRef.current && currentTaskCostRef.current > 0) {
                                console.log(`[Refund] Got cost from ref on attempt ${attempt + 1}: ${currentTaskCostRef.current}`);
                                return currentTaskCostRef.current;
                            }
                            
                            // Fallback: fetch from DB
                            try {
                                const { data: taskData } = await supabase
                                    .from('generation_tasks')
                                    .select('cost')
                                    .eq('id', taskId)
                                    .single();
                                if (taskData?.cost && taskData.cost > 0) {
                                    console.log(`[Refund] Fetched cost from DB on attempt ${attempt + 1}: ${taskData.cost}`);
                                    return taskData.cost;
                                }
                            } catch (err) {
                                console.error(`[Refund] Failed to fetch cost from DB (attempt ${attempt + 1}):`, err);
                            }
                        }
                        
                        console.warn('[Refund] Could not get cost after 5 attempts');
                        return 0;
                    };
                    
                    const cost = await getCost();
                    console.log(`[Patch Failed] Cost to refund: ${cost}`);
                    
                    const confirmMessage = language === 'zh' 
                        ? `智能修改遇到困难。是否尝试全量修复？\n\n注意：全量修复将消耗更多积分。\n${cost > 0 ? `本次修改消耗的 ${cost} 积分将自动退回。` : ''}`
                        : `Smart edit encountered difficulties. Do you want to try a full repair?\n\nNote: Full repair will consume more credits.\n${cost > 0 ? `The ${cost} credits consumed for this edit will be automatically refunded.` : ''}`;
                    
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
                // Clear quick edit history when AI generates new content
                resetQuickEditHistory();
                
                if (isModification) {
                    toastSuccess(t.create.success_edit);
                    const finalContent = summary || (language === 'zh' ? '已重新生成完整代码。' : 'Regenerated full code.');
                    // 最终结论消息不包含思考过程
                    setChatHistory(prev => [...prev, { role: 'ai', content: finalContent, cost: currentTaskCostRef.current || undefined }]);
                    currentTaskReasoningRef.current = null;
                } else {
                    setGenerationPhase('completing');
                    // setStep('preview'); // Handled by generationPhase effect
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
            setWorkflowStage('completed'); // 🆕 完成工作流
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
            setWorkflowStage('error'); // 🆕 标记工作流错误
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
                     
                     // 🆕 更新工作流可视化 - 计划
                     setWorkflowDetails(prev => ({
                         ...prev,
                         plan: planMatch[1].trim()
                     }));
                 }

                 // Extract Steps
                 const stepMatches = [...content.matchAll(/\/\/\/ STEP: (.*?) \/\/\//g)];
                 if (stepMatches.length > 0) {
                     const currentStepName = stepMatches[stepMatches.length - 1][1].trim();
                     setCurrentStep(currentStepName);
                     content = content.replace(/\/\/\/ STEP: .*? \/\/\//g, '');
                     
                     // 简化显示：如果步骤名太长，只显示前20个字符
                     const displayStepName = currentStepName.length > 20 ? currentStepName.substring(0, 20) + '...' : currentStepName;
                     setLoadingText(language === 'zh' ? `正在执行: ${displayStepName}` : `Executing: ${displayStepName}`);
                     
                     // 🆕 更新工作流可视化 - 当前步骤和已完成步骤瀑布流
                     const allStepNames = stepMatches.map(m => m[1].trim());
                     const completedSteps = allStepNames.slice(0, -1); // 除最后一个外都是已完成的
                     
                     setWorkflowDetails(prev => ({
                         ...prev,
                         currentStep: currentStepName,
                         completedSteps: completedSteps,
                         stepsCompleted: stepMatches.length,
                         totalSteps: Math.max(stepMatches.length + 1, prev.totalSteps || 0)
                     }));
                 }

                 setStreamingCode(content);
                 
                 // 🆕 更新工作流可视化 - 流式代码
                 setWorkflowDetails(prev => ({
                     ...prev,
                     streamingCode: content
                 }));
                 
                 if (!hasStartedStreaming) {
                     setGenerationPhase('generating');
                 }
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

  const startGeneration = async (isModificationArg = false, overridePrompt = '', displayPrompt = '', forceFull = false, explicitType?: 'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback') => {
    // Reset cost ref for new task
    currentTaskCostRef.current = null;
    currentTaskReasoningRef.current = null; // 🆕 重置 reasoning

    // Explicitly rely on the argument to determine if it's a modification or a new generation (regenerate)
    const isModification = isModificationArg;
    const useDiffMode = isModification && !forceFull;
    
    // Determine operation type for the NEXT generation
    let nextOperationType: 'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback' = 'init';
    
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
      setGenerationPhase('starting');
    }
    setStreamingCode('');
    setAiPlan(''); // Reset plan for new generation
    setCurrentStep(''); // Reset step for new generation
    setRuntimeError(null); // Clear previous errors
    
    // 🆕 重置工作流可视化状态
    setWorkflowStage('analyzing');
    setWorkflowDetails({});
    
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

### Click-to-Edit Friendly Code
When adding/modifying elements, structure code for easy visual editing:
- **Text**: Use semantic tags (\`<h1>\`, \`<p>\`, \`<span>\`, \`<button>\`) with direct text content
- **Colors**: Use Tailwind classes (\`bg-blue-500\`, \`text-white\`) instead of inline styles
- **Keep it simple**: Avoid deeply nested text structures

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

### Example (Button Color Change)
\`\`\`
/// ANALYSIS: Targeting SubmitButton component
///
/// SUMMARY: Changed button from blue to green with hover
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

(More examples: adding state, modifying functions - follow same pattern)
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

### Click-to-Edit Friendly Code (IMPORTANT)
Our platform supports quick visual editing - users can click elements to change text/colors. Structure your code for easy editing:

**Text Elements**:
- Use semantic tags for editable text: \`<h1>\`, \`<h2>\`, \`<p>\`, \`<span>\`, \`<button>\`, \`<a>\`, \`<label>\`
- Keep text content SHORT and DIRECT inside elements (avoid long nested structures)
- ✅ GOOD: \`<h1 className="text-xl font-bold">Welcome</h1>\`
- ❌ BAD: \`<h1><span><span>Welcome</span></span></h1>\`

**Color Styling (Tailwind)**:
- Use standard Tailwind color classes for easy detection and modification:
  - Background: \`bg-{color}-{shade}\` (e.g., \`bg-blue-500\`, \`bg-red-600\`)
  - Text: \`text-{color}-{shade}\` (e.g., \`text-white\`, \`text-gray-800\`)
  - Border: \`border-{color}-{shade}\` (e.g., \`border-blue-400\`)
- Avoid inline styles for colors when Tailwind classes work
- ✅ GOOD: \`className="bg-blue-500 text-white"\`
- ❌ BAD: \`style={{ backgroundColor: '#3b82f6', color: 'white' }}\`

**Element Structure**:
- Each visual component should have a clear, single-purpose className
- Buttons, cards, headings should have identifiable structure
- Keep JSX hierarchy shallow where possible

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

      // TECHNICAL_CONSTRAINTS removed - already covered in SYSTEM_PROMPT
      const TECHNICAL_CONSTRAINTS = '';

      let finalUserPrompt = prompt;

      const dbPrompt = isModification ? prompt : finalUserPrompt;

      console.log('Calling /api/generate with prompt length:', dbPrompt.length);
      console.log('Selected model:', selectedModel);

      let response: Response;
      
      // Detect if this is the first edit on uploaded code (use helper)
      const isFirstEditOnUpload = isModification && isFirstEditOnUploadedCode();
      
      if (isFirstEditOnUpload) {
          console.log('[Create] First edit on uploaded code - will skip compression and use relaxed matching');
      }
      
      // 🆕 SSE 流式接收结果和思考过程
      let taskId = '';
      let ragContext = '';
      let codeContext = '';
      let compressedCode = '';
      let ragSummary = '';
      let targets: string[] = [];
      
      try {
        abortControllerRef.current = new AbortController();
        response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream' // 🆕 请求 SSE 流式响应
            },
            body: JSON.stringify({
                type: isModification ? 'modification' : 'generation',
                system_prompt: SYSTEM_PROMPT,
                user_prompt: dbPrompt,
                current_code: isModification ? generatedCode : undefined,
                is_first_edit: isFirstEditOnUpload,
                model: selectedModel,
                tokens_per_credit: MODEL_CONFIG[selectedModel].tokensPerCredit
            }),
            signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            console.error('API Error Details:', errorData);
            throw new Error(errorData.error || `Generation failed: ${response.status}`);
        }
        
        // 🆕 处理 SSE 流式响应
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('text/event-stream')) {
            console.log('[SSE] Receiving streaming response...');
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            
            if (reader) {
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            
                            try {
                                const event = JSON.parse(data);
                                console.log('[SSE Event]', event.type, event.data);
                                
                                switch (event.type) {
                                    case 'thinking':
                                        // 🎯 实时显示思考过程！
                                        if (event.data?.reasoning) {
                                            currentTaskReasoningRef.current = event.data.reasoning;
                                            // 🆕 直接更新 aiPlan 状态，让 GenerationProgress 组件实时显示
                                            setAiPlan(event.data.reasoning);
                                            
                                            // 🆕 更新工作流可视化状态
                                            setWorkflowStage('analyzing');
                                            setWorkflowDetails(prev => ({
                                                ...prev,
                                                reasoning: event.data.reasoning,
                                                intent: event.data.intent,
                                                targets: event.data.targets
                                            }));
                                        }
                                        break;
                                    case 'progress':
                                        // 更新进度
                                        if (event.data?.message) {
                                            setLoadingText(prev => {
                                                const lines = prev.split('\n');
                                                // 保留第一行，更新进度
                                                return `${lines[0]}\n${event.data.message}`;
                                            });
                                        }
                                        // 🆕 根据 stage 更新工作流可视化
                                        if (event.data?.stage === 'compression') {
                                            setWorkflowStage('compressing');
                                            if (event.data.compressionStats) {
                                                setWorkflowDetails(prev => ({
                                                    ...prev,
                                                    compressionStats: event.data.compressionStats
                                                }));
                                            }
                                        } else if (event.data?.stage === 'rag') {
                                            setWorkflowStage('compressing');
                                        } else if (event.data?.stage === 'intent') {
                                            setWorkflowStage('analyzing');
                                        }
                                        break;
                                    case 'result':
                                        // 最终结果
                                        taskId = event.data.taskId;
                                        ragContext = event.data.ragContext || '';
                                        codeContext = event.data.codeContext || '';
                                        compressedCode = event.data.compressedCode || '';
                                        ragSummary = event.data.ragSummary || '';
                                        targets = event.data.targets || [];
                                        // 🆕 进入生成阶段
                                        setWorkflowStage('generating');
                                        break;
                                    case 'error':
                                        setWorkflowStage('error');
                                        throw new Error(event.data?.error || 'Unknown SSE error');
                                }
                            } catch (parseErr) {
                                console.warn('[SSE] Parse error:', parseErr);
                            }
                        }
                    }
                }
            }
        } else {
            // 🔙 向后兼容：非 SSE 响应
            const jsonData = await response.json();
            taskId = jsonData.taskId;
            ragContext = jsonData.ragContext || '';
            codeContext = jsonData.codeContext || '';
            compressedCode = jsonData.compressedCode || '';
            ragSummary = jsonData.ragSummary || '';
            targets = jsonData.targets || [];
            currentTaskReasoningRef.current = jsonData.reasoning || null;
            // 非 SSE 直接进入生成阶段
            setWorkflowStage('generating');
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

      setCurrentTaskId(taskId);
      
      // Update loading text with RAG summary if available
      if (ragSummary) {
          setLoadingText(prev => `${prev}\n${ragSummary}`);
      }
      
      // Inject RAG Context if available
      let finalSystemPrompt = SYSTEM_PROMPT;
      
      // Apply Smart Context Compression
      if (compressedCode && isModification) {
          console.log('Applying Smart Context Compression to User Prompt');
          // Replace the full code in finalUserPrompt with compressed code
          
          const safeCompressedCode = compressedCode.replace(/\u0000/g, '');
          const safeOriginalCode = generatedCode ? generatedCode.replace(/\u0000/g, '') : '';
          
          if (safeOriginalCode && finalUserPrompt.includes(safeOriginalCode)) {
              finalUserPrompt = finalUserPrompt.replace(safeOriginalCode, safeCompressedCode);
              
              // Add explicit warning about semantic compression
              finalUserPrompt += `\n\n### ⚠️ SEMANTIC COMPRESSION NOTICE
Some components are shown as \`@semantic-compressed\` with a summary of their Props/State/Handlers.
These compressed components are NOT targets for modification - focus on the full components shown.
**NEVER** include \`/* compressed */\` or \`@semantic-compressed\` in your SEARCH blocks.`;

              console.log('User Prompt compressed successfully.');
          } else {
              console.warn('Could not find original code in User Prompt to replace. Using full code.');
          }
      }

      if (ragContext) {
          console.log('Injecting RAG Context into System Prompt');
          finalSystemPrompt += ragContext;
      }
      
      // Inject Code RAG Context (Relevant Chunks)
      if (codeContext) {
          console.log('Injecting Code RAG Context into System Prompt');
          finalSystemPrompt += codeContext;
      }

      // 注意：积分扣除在后端Edge Function中进行，避免双重扣费
      // 前端不再进行乐观更新，等待后端扣费后通过checkAuth刷新积分余额

      const { data: { session } } = await supabase.auth.getSession();
      
      // Calculate total prompt length for logging
      const totalPromptLength = SYSTEM_PROMPT.length + dbPrompt.length;
      const fullPromptText = SYSTEM_PROMPT + dbPrompt;
      setPromptLengthForLog(totalPromptLength);

      // Start monitoring immediately
      monitorTask(taskId, isModification, useDiffMode, totalPromptLength, fullPromptText, isFirstEditOnUpload, targets);

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
                        system_prompt: finalSystemPrompt, 
                        user_prompt: finalUserPrompt, 
                        type: isModification ? 'modification' : 'generation',
                        model: selectedModel,
                        tokens_per_credit: MODEL_CONFIG[selectedModel].tokensPerCredit
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
                // When user cancels, the abort signal will cause reader.read() to throw
                try {
                    const reader = res.body?.getReader();
                    if (reader) {
                        while (true) {
                            // Check abort signal before each read
                            if (abortControllerRef.current?.signal.aborted) {
                                console.log('Stream reading aborted by user');
                                await reader.cancel(); // Explicitly cancel the reader to close connection
                                break;
                            }
                            const { done } = await reader.read();
                            if (done) break;
                        }
                    }
                } catch (streamErr: any) {
                    if (streamErr.name === 'AbortError') {
                        console.log('Stream reading aborted (AbortError)');
                        // This is expected when user cancels - connection will close
                        return;
                    }
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
        // Don't reset history when entering edit mode - keep it persistent
    }
  };

  // Quick Edit: Detect if element can be quickly edited (color/text)
  // Now always allows color editing for any element
  const detectQuickEditType = (element: typeof selectedElement): 'color' | 'text' | 'both' | 'none' => {
    if (!element) return 'none';
    
    // Check if it's a simple text element (button, span, p, h1-h6, a, label)
    const textTags = ['BUTTON', 'SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'LABEL', 'LI', 'TD', 'TH', 'DIV'];
    const isTextElement = textTags.includes(element.tagName.toUpperCase());
    const hasSimpleText = element.innerText && element.innerText.length > 0 && element.innerText.length < 100 && !element.innerText.includes('\n');
    
    // Always allow color editing for any element
    if (isTextElement && hasSimpleText) {
      return 'both'; // Both text and color editing available
    }
    
    // Any element can have color edited
    return 'color';
  };

  // Quick Edit: Detect available color types in an element (including inline styles)
  const detectAvailableColorTypes = (className: string, element?: typeof selectedElement): ('bg' | 'text' | 'border')[] => {
    const types: ('bg' | 'text' | 'border')[] = [];
    // Match Tailwind color classes: bg-red-500, text-blue-100, border-slate-900, etc.
    // Also match simple colors: bg-white, text-black, border-transparent
    const colorNames = 'red|blue|green|yellow|purple|pink|indigo|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose|white|black|transparent';
    
    // Check for Tailwind bg-* colors
    if (new RegExp(`bg-(${colorNames})(?:-\\d{2,3})?(?:\\s|$|")`).test(className)) {
      types.push('bg');
    }
    // Check for Tailwind gradient colors (from-*, to-*, via-*)
    if (new RegExp(`(from|to|via)-(${colorNames})(?:-\\d{2,3})?(?:\\s|$|")`).test(className)) {
      if (!types.includes('bg')) types.push('bg');
    }
    // Check for Tailwind text-* colors  
    if (new RegExp(`text-(${colorNames})(?:-\\d{2,3})?(?:\\s|$|")`).test(className)) {
      types.push('text');
    }
    // Check for Tailwind border-* colors
    if (new RegExp(`border-(${colorNames})(?:-\\d{2,3})?(?:\\s|$|")`).test(className)) {
      types.push('border');
    }
    
    // Also check for inline styles in the code
    if (element && generatedCode) {
      const tagName = element.tagName.toLowerCase();
      const innerText = element.innerText?.substring(0, 20)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Color value patterns: hex, rgb, rgba, hsl, hsla, named colors, css variables
      const colorValuePattern = `(?:#[0-9a-fA-F]{3,8}|rgb\\([^)]+\\)|rgba\\([^)]+\\)|hsl\\([^)]+\\)|hsla\\([^)]+\\)|var\\(--[^)]+\\)|[a-zA-Z]+)`;
      
      // Try to find the element in code and check for inline styles
      const bgPatterns = [
        // backgroundColor: '#xxx' or 'rgb()' or 'var(--xxx)'
        `backgroundColor\\s*:\\s*['"\`]?${colorValuePattern}`,
        // background: '#xxx' (not background-image or background-size etc)
        `(?<!-)background\\s*:\\s*['"\`]?${colorValuePattern}`,
        // linear-gradient, radial-gradient
        `background\\s*:\\s*['"\`]?(?:linear|radial)-gradient`,
      ];
      
      for (const pattern of bgPatterns) {
        const regex = innerText 
          ? new RegExp(`<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*${pattern}[^}]*\\}\\}[^>]*>\\s*${innerText}`, 'i')
          : new RegExp(`<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*${pattern}`, 'i');
        if (regex.test(generatedCode) && !types.includes('bg')) {
          types.push('bg');
          break;
        }
      }
      
      // Check for inline text color (avoid matching backgroundColor)
      const textColorPattern = `(?<!background)color\\s*:\\s*['"\`]?${colorValuePattern}`;
      const textColorRegex = innerText
        ? new RegExp(`<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*${textColorPattern}[^}]*\\}\\}[^>]*>\\s*${innerText}`, 'i')
        : new RegExp(`<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*${textColorPattern}`, 'i');
      
      if (textColorRegex.test(generatedCode) && !types.includes('text')) {
        types.push('text');
      }
      
      // Check for inline border color
      const borderColorPattern = `borderColor\\s*:\\s*['"\`]?${colorValuePattern}`;
      const borderRegex = innerText
        ? new RegExp(`<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*${borderColorPattern}[^}]*\\}\\}[^>]*>\\s*${innerText}`, 'i')
        : new RegExp(`<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*${borderColorPattern}`, 'i');
      
      if (borderRegex.test(generatedCode) && !types.includes('border')) {
        types.push('border');
      }
      
      // Check for CSS variables used for colors (e.g., style={{ '--primary': '#xxx' }})
      const cssVarColorPattern = `--[a-zA-Z-]+\\s*:\\s*['"\`]?${colorValuePattern}`;
      const cssVarRegex = new RegExp(`<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*${cssVarColorPattern}`, 'i');
      if (cssVarRegex.test(generatedCode)) {
        // CSS variables could be any type, add all if none found
        if (types.length === 0) {
          types.push('bg', 'text', 'border');
        }
      }
    }
    
    // If no color types found, return all possible types so user can add new color
    if (types.length === 0) {
      return ['bg', 'text', 'border'];
    }
    return types;
  };

  // Quick Edit: Apply color change directly to code
  const applyQuickColorEdit = (newColor: string) => {
    if (!selectedElement || !generatedCode) return;
    
    // Convert hex to Tailwind color (approximate)
    const hexToTailwind = (hex: string): string => {
      const colors: Record<string, string> = {
        '#ef4444': 'red-500', '#f97316': 'orange-500', '#eab308': 'yellow-500',
        '#22c55e': 'green-500', '#14b8a6': 'teal-500', '#06b6d4': 'cyan-500',
        '#3b82f6': 'blue-500', '#8b5cf6': 'violet-500', '#ec4899': 'pink-500',
        '#64748b': 'slate-500', '#ffffff': 'white', '#000000': 'black',
        '#1e293b': 'slate-800', '#0f172a': 'slate-900', '#f8fafc': 'slate-50',
        '#6366f1': 'indigo-500', '#a855f7': 'purple-500', '#d946ef': 'fuchsia-500',
        '#f43f5e': 'rose-500', '#f1f5f9': 'slate-100', '#e2e8f0': 'slate-200',
        '#cbd5e1': 'slate-300', '#94a3b8': 'slate-400', '#475569': 'slate-600',
        '#334155': 'slate-700',
      };
      return colors[hex.toLowerCase()] || 'blue-500';
    };
    
    const tailwindColor = hexToTailwind(newColor);
    const oldClassName = selectedElement.className || '';
    
    // Build regex pattern based on selected color type
    const colorNames = 'red|blue|green|yellow|purple|pink|indigo|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose|white|black|transparent';
    const prefixPattern = quickEditColorType === 'all' 
      ? '(?:bg-|text-|border-)' 
      : `${quickEditColorType}-`;
    const colorRegex = new RegExp(
      `${prefixPattern}(${colorNames})(?:-\\d{2,3})?(?=\\s|$)`,
      'g'
    );
    
    // For gradient colors
    const gradientColorRegex = new RegExp(
      `(from|to|via)-(${colorNames})(?:-\\d{2,3})?(?=\\s|$)`,
      'g'
    );
    
    let newClassName = oldClassName;
    let hasReplacement = false;
    let updatedCode = generatedCode;
    
    // Strategy 1: Try to replace existing Tailwind color class
    const testMatch = oldClassName.match(colorRegex);
    if (testMatch && testMatch.length > 0) {
      newClassName = oldClassName.replace(
        colorRegex,
        (match) => {
          const prefix = match.match(/^(bg-|text-|border-)/)?.[0] || 'bg-';
          hasReplacement = true;
          return `${prefix}${tailwindColor}`;
        }
      );
      
      if (hasReplacement && oldClassName) {
        updatedCode = generatedCode.replace(
          new RegExp(`className="${oldClassName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
          `className="${newClassName}"`
        );
      }
    }
    
    // Strategy 1.5: Try to replace Tailwind gradient colors (from-*, to-*, via-*)
    if (updatedCode === generatedCode && quickEditColorType === 'bg') {
      const gradientMatch = oldClassName.match(gradientColorRegex);
      if (gradientMatch && gradientMatch.length > 0) {
        newClassName = oldClassName.replace(
          gradientColorRegex,
          (match) => {
            const prefix = match.match(/^(from-|to-|via-)/)?.[0] || 'from-';
            hasReplacement = true;
            return `${prefix}${tailwindColor}`;
          }
        );
        
        if (hasReplacement && oldClassName) {
          updatedCode = generatedCode.replace(
            new RegExp(`className="${oldClassName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
            `className="${newClassName}"`
          );
        }
      }
    }
    
    // Strategy 2: Try to modify inline styles (background-color, color, border-color)
    // Supports: hex, rgb, rgba, hsl, hsla, named colors, CSS variables
    if (updatedCode === generatedCode) {
      const tagName = selectedElement.tagName.toLowerCase();
      const innerText = selectedElement.innerText?.substring(0, 20)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Determine which CSS property to modify based on quickEditColorType
      const cssProperty = quickEditColorType === 'text' ? 'color' 
        : quickEditColorType === 'border' ? 'border-color|borderColor' 
        : 'background-color|backgroundColor|background';
      
      // Comprehensive color value pattern to match any color format
      const colorValuePattern = `(?:#[0-9a-fA-F]{3,8}|rgba?\\([^)]+\\)|hsla?\\([^)]+\\)|var\\(--[^)]+\\)|[a-zA-Z]+(?![a-zA-Z-]))`;
      
      // Pattern to find inline style with the target property
      // Match: style={{ backgroundColor: '...' }} or style={{ background: '...' }}
      const inlineStylePatterns = [
        // JSX style object: style={{ backgroundColor: '#xxx' }} or 'rgb(...)' or 'var(--xxx)'
        new RegExp(`(style\\s*=\\s*\\{\\{[^}]*)(${cssProperty})\\s*:\\s*['"\`]?${colorValuePattern}['"\`]?([^}]*\\}\\})`, 'gi'),
        // JSX style object with variable: style={{ backgroundColor: someVar }}
        new RegExp(`(style\\s*=\\s*\\{\\{[^}]*)(${cssProperty})\\s*:\\s*[\\w.]+([^}]*\\}\\})`, 'gi'),
      ];
      
      for (const pattern of inlineStylePatterns) {
        if (pattern.test(generatedCode)) {
          const propName = quickEditColorType === 'text' ? 'color' 
            : quickEditColorType === 'border' ? 'borderColor' 
            : 'backgroundColor';
          
          // Find elements that might match our target
          const elementPattern = innerText 
            ? new RegExp(`(<${tagName}[^>]*)(style\\s*=\\s*\\{\\{[^}]*)(?:${cssProperty})\\s*:\\s*['"\`]?${colorValuePattern}['"\`]?([^}]*\\}\\}[^>]*>\\s*${innerText})`, 'gi')
            : new RegExp(`(<${tagName}[^>]*)(style\\s*=\\s*\\{\\{[^}]*)(?:${cssProperty})\\s*:\\s*['"\`]?${colorValuePattern}['"\`]?([^}]*\\}\\})`, 'gi');
          
          if (elementPattern.test(generatedCode)) {
            updatedCode = generatedCode.replace(elementPattern, `$1$2${propName}: '${newColor}'$3`);
            hasReplacement = true;
            break;
          }
        }
      }
    }
    
    // Strategy 2.5: Try to modify CSS variable definitions
    if (updatedCode === generatedCode) {
      const tagName = selectedElement.tagName.toLowerCase();
      const innerText = selectedElement.innerText?.substring(0, 20)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Match CSS variable definitions: '--primary': '#xxx' or '--bg-color': 'rgb(...)'
      const cssVarPattern = /(style\s*=\s*\{\{[^}]*)(--[\w-]+)\s*:\s*['"`]?(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)['"`]?([^}]*\}\})/gi;
      
      if (cssVarPattern.test(generatedCode)) {
        // Find element and replace CSS variable value
        const searchPattern = innerText
          ? new RegExp(`(<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*)(--[\\w-]+)\\s*:\\s*['"\`]?(?:#[0-9a-fA-F]{3,8}|rgba?\\([^)]+\\)|hsla?\\([^)]+\\)|[a-zA-Z]+)['"\`]?([^}]*\\}\\}[^>]*>\\s*${innerText})`, 'gi')
          : cssVarPattern;
        
        if (searchPattern.test(generatedCode)) {
          updatedCode = generatedCode.replace(searchPattern, `$1$2: '${newColor}'$3`);
          hasReplacement = true;
        }
      }
    }
    
    // Strategy 2.6: Try to modify gradient colors in inline styles
    if (updatedCode === generatedCode && quickEditColorType === 'bg') {
      const tagName = selectedElement.tagName.toLowerCase();
      const innerText = selectedElement.innerText?.substring(0, 20)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Match linear-gradient or radial-gradient
      const gradientPattern = innerText
        ? new RegExp(`(<${tagName}[^>]*style\\s*=\\s*\\{\\{[^}]*background\\s*:\\s*['"\`]?)((?:linear|radial)-gradient\\([^)]*\\))(['"\`]?[^}]*\\}\\}[^>]*>\\s*${innerText})`, 'gi')
        : new RegExp(`(style\\s*=\\s*\\{\\{[^}]*background\\s*:\\s*['"\`]?)((?:linear|radial)-gradient\\([^)]*\\))(['"\`]?[^}]*\\}\\})`, 'gi');
      
      if (gradientPattern.test(generatedCode)) {
        // For gradients, replace with solid color
        updatedCode = generatedCode.replace(gradientPattern, `$1${newColor}$3`);
        hasReplacement = true;
      }
    }
    
    // Strategy 3: If no existing color, add new color class
    if (updatedCode === generatedCode && oldClassName) {
      const colorType = quickEditColorType === 'all' ? 'bg' : quickEditColorType;
      const newColorClass = `${colorType}-${tailwindColor}`;
      newClassName = `${oldClassName} ${newColorClass}`;
      
      updatedCode = generatedCode.replace(
        new RegExp(`className="${oldClassName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
        `className="${newClassName}"`
      );
    }
    
    // Strategy 4: Element has no className - try to add one
    if (updatedCode === generatedCode) {
      const tagName = selectedElement.tagName.toLowerCase();
      const innerText = selectedElement.innerText?.substring(0, 30);
      const colorType = quickEditColorType === 'all' ? 'bg' : quickEditColorType;
      const newColorClass = `${colorType}-${tailwindColor}`;
      
      if (innerText) {
        const escapedText = innerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Pattern: <tag ...>text  -> <tag className="..." ...>text
        const addClassPattern = new RegExp(`(<${tagName})(\\s*[^>]*>\\s*${escapedText})`, 'i');
        if (addClassPattern.test(generatedCode)) {
          updatedCode = generatedCode.replace(addClassPattern, `$1 className="${newColorClass}"$2`);
        }
      }
    }
    
    // Strategy 5: Try to add/modify inline style if className approach failed
    if (updatedCode === generatedCode) {
      const tagName = selectedElement.tagName.toLowerCase();
      const innerText = selectedElement.innerText?.substring(0, 20)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const propName = quickEditColorType === 'text' ? 'color' 
        : quickEditColorType === 'border' ? 'borderColor' 
        : 'backgroundColor';
      
      if (innerText) {
        // Try to find the element and add style
        const elementWithStylePattern = new RegExp(`(<${tagName}[^>]*)(style\\s*=\\s*\\{\\{)([^}]*)(\\}\\}[^>]*>\\s*${innerText})`, 'i');
        const elementNoStylePattern = new RegExp(`(<${tagName})([^>]*>\\s*${innerText})`, 'i');
        
        if (elementWithStylePattern.test(generatedCode)) {
          // Element has style, add our property
          updatedCode = generatedCode.replace(elementWithStylePattern, `$1$2${propName}: '${newColor}', $3$4`);
        } else if (elementNoStylePattern.test(generatedCode)) {
          // Element has no style, add style attribute
          updatedCode = generatedCode.replace(elementNoStylePattern, `$1 style={{ ${propName}: '${newColor}' }}$2`);
        }
      }
    }
    
    if (updatedCode === generatedCode) {
      // Show a more prominent alert dialog
      const errorMsg = language === 'zh' 
        ? `⚠️ 无法应用颜色修改\n\n可能的原因：\n• 代码中找不到该元素\n• 元素结构复杂，无法自动定位\n\n建议：\n• 尝试使用 AI 修改功能\n• 选择其他相似的元素`
        : `⚠️ Cannot apply color change\n\nPossible reasons:\n• Element not found in code\n• Element structure is complex\n\nSuggestion:\n• Try using AI modification\n• Select a similar element`;
      alert(errorMsg);
      return;
    }
    
    // Save to main code history
    setCodeHistory(prev => [...prev, { 
      code: generatedCode, 
      prompt: `Quick color change: ${tailwindColor}`, 
      timestamp: Date.now(),
      type: 'click'
    }]);
    
    // Save to quick edit history for undo/redo within session
    const description = language === 'zh' ? `颜色: ${tailwindColor}` : `Color: ${tailwindColor}`;
    const isFirstEdit = quickEditHistory.length === 0;
    const currentLength = quickEditHistory.length;
    const effectiveIndex = quickEditHistoryIndex;
    
    if (isFirstEdit) {
      // First edit: save initial + new state
      setQuickEditHistory([
        { code: generatedCode, description: language === 'zh' ? '初始状态' : 'Initial state' },
        { code: updatedCode, description }
      ]);
      setQuickEditHistoryIndex(1);
    } else {
      // Subsequent edits
      setQuickEditHistory(prev => {
        // If we're not at the end, truncate future history
        const newHistory = effectiveIndex >= 0 && effectiveIndex < prev.length - 1
          ? prev.slice(0, effectiveIndex + 1) 
          : prev;
        return [...newHistory, { code: updatedCode, description }];
      });
      // Calculate new index based on whether we truncated
      const willTruncate = effectiveIndex >= 0 && effectiveIndex < currentLength - 1;
      const newLength = willTruncate ? effectiveIndex + 2 : currentLength + 1;
      setQuickEditHistoryIndex(newLength - 1);
    }
    
    setGeneratedCode(updatedCode);
    setStreamingCode(updatedCode);
    // Close modal after applying, but keep edit mode active for next selection
    setShowEditModal(false);
    setQuickEditMode('none');
    setSelectedElement(null);
    
    // Update iframe content in-place without reload
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ 
        type: 'spark-update-content', 
        html: updatedCode,
        shouldRestoreEditMode: false
      }, '*');
      
      // Automatically exit edit mode after applying changes
      setIsEditMode(false);
      iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: false }, '*');
    }
    
    toastSuccess(language === 'zh' ? `颜色已改为 ${tailwindColor}` : `Color changed to ${tailwindColor}`);
  };

  // Quick Edit: Apply text change directly to code
  const applyQuickTextEdit = (newText: string) => {
    if (!selectedElement || !generatedCode || !newText.trim()) return;
    
    const oldText = selectedElement.innerText.trim();
    if (!oldText) {
      toastError(language === 'zh' ? '原文本为空' : 'Original text is empty');
      return;
    }
    
    // Find and replace the text in the code
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedOldText = escapeRegex(oldText);
    
    let updatedCode = generatedCode;
    let replaced = false;
    
    // Try multiple patterns to find and replace the text
    // Pattern 1: Direct text content between tags: >Old Text<
    const directPattern = new RegExp(`(>\\s*)${escapedOldText}(\\s*<)`, 'g');
    if (directPattern.test(updatedCode)) {
      updatedCode = generatedCode.replace(directPattern, `$1${newText}$2`);
      replaced = true;
    }
    
    // Pattern 2: Text in JSX expressions: {"Old Text"} or {'Old Text'} or {`Old Text`}
    if (!replaced) {
      const jsxPattern = new RegExp(`([{]["'\`])${escapedOldText}(["'\`]})`, 'g');
      if (jsxPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(jsxPattern, `$1${newText}$2`);
        replaced = true;
      }
    }
    
    // Pattern 2.5: Text in template literals: `${...}Old Text${...}` or just `Old Text`
    if (!replaced) {
      const templateLiteralPattern = new RegExp(`(\`)([^$]*?)${escapedOldText}([^$]*?)(\`)`, 'g');
      if (templateLiteralPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(templateLiteralPattern, `$1$2${newText}$3$4`);
        replaced = true;
      }
    }
    
    // Pattern 3: Text in variable assignments: const title = "Old Text" or let text = 'Old Text'
    if (!replaced) {
      const varAssignPattern = new RegExp(`((?:const|let|var)\\s+\\w+\\s*=\\s*["'\`])${escapedOldText}(["'\`])`, 'g');
      if (varAssignPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(varAssignPattern, `$1${newText}$2`);
        replaced = true;
      }
    }
    
    // Pattern 4: Text in object properties: { title: "Old Text" } or { text: 'Old Text' }
    if (!replaced) {
      const objectPropPattern = new RegExp(`(\\w+\\s*:\\s*["'\`])${escapedOldText}(["'\`])`, 'g');
      if (objectPropPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(objectPropPattern, `$1${newText}$2`);
        replaced = true;
      }
    }
    
    // Pattern 5: Text in array items: ["Old Text", "Other"] or items.map(...)
    if (!replaced) {
      const arrayItemPattern = new RegExp(`(\\[\\s*["'\`][^\\]]*["'\`]\\s*,\\s*)?["'\`]${escapedOldText}["'\`](\\s*,\\s*["'\`][^\\]]*["'\`]\\s*\\])?`, 'g');
      if (arrayItemPattern.test(generatedCode) && generatedCode.includes(oldText)) {
        // Direct replace in array context
        const simpleArrayPattern = new RegExp(`(["'\`])${escapedOldText}(["'\`])`, 'g');
        if (simpleArrayPattern.test(generatedCode)) {
          updatedCode = generatedCode.replace(simpleArrayPattern, `$1${newText}$2`);
          replaced = true;
        }
      }
    }
    
    // Pattern 6: Text in ternary expressions: condition ? "Old Text" : "Other"
    if (!replaced) {
      const ternaryPattern = new RegExp(`(\\?\\s*["'\`])${escapedOldText}(["'\`]\\s*:)`, 'g');
      const ternaryElsePattern = new RegExp(`(:\\s*["'\`])${escapedOldText}(["'\`])`, 'g');
      if (ternaryPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(ternaryPattern, `$1${newText}$2`);
        replaced = true;
      } else if (ternaryElsePattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(ternaryElsePattern, `$1${newText}$2`);
        replaced = true;
      }
    }
    
    // Pattern 7: Text in function arguments: someFunc("Old Text") or label="Old Text"
    if (!replaced) {
      const funcArgPattern = new RegExp(`(\\(["'\`])${escapedOldText}(["'\`]\\))`, 'g');
      const attrPattern = new RegExp(`(\\w+\\s*=\\s*["'\`])${escapedOldText}(["'\`])`, 'g');
      if (funcArgPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(funcArgPattern, `$1${newText}$2`);
        replaced = true;
      } else if (attrPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(attrPattern, `$1${newText}$2`);
        replaced = true;
      }
    }
    
    // Pattern 8: Simple string replacement in JSX context (more aggressive)
    if (!replaced) {
      // Only replace if it looks like it's in JSX context (near < or > or {)
      const contextPattern = new RegExp(`([>{"'\`])${escapedOldText}([<}"'\`])`, 'g');
      if (contextPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(contextPattern, `$1${newText}$2`);
        replaced = true;
      }
    }
    
    // Pattern 9: Direct string replacement (very last resort, be careful)
    if (!replaced && generatedCode.includes(oldText)) {
      // Count occurrences to be safe
      const count = (generatedCode.match(new RegExp(escapedOldText, 'g')) || []).length;
      if (count === 1) {
        // Only one occurrence, safe to replace
        updatedCode = generatedCode.replace(oldText, newText);
        replaced = true;
      } else if (count > 1) {
        // Multiple occurrences, try to find the one in JSX
        // Look for the pattern with className nearby (likely our target)
        const elementClass = selectedElement.className.split(' ')[0];
        if (elementClass) {
          const nearClassPattern = new RegExp(`(${escapeRegex(elementClass)}[^>]*>\\s*)${escapedOldText}`, 'g');
          if (nearClassPattern.test(generatedCode)) {
            updatedCode = generatedCode.replace(nearClassPattern, `$1${newText}`);
            replaced = true;
          }
        }
        
        // Pattern 9.5: Try to find by element tag and context
        if (!replaced) {
          const tagName = selectedElement.tagName.toLowerCase();
          const tagContextPattern = new RegExp(`(<${tagName}[^>]*>\\s*)${escapedOldText}(\\s*<\\/${tagName}>)`, 'gi');
          if (tagContextPattern.test(generatedCode)) {
            // Replace first match only to be safe
            updatedCode = generatedCode.replace(tagContextPattern, `$1${newText}$2`);
            replaced = true;
          }
        }
      }
    }
    
    if (!replaced) {
      const errorMsg = language === 'zh' 
        ? `⚠️ 无法应用文字修改\n\n可能的原因：\n• 代码中找不到该文本\n• 文本可能是动态生成的\n• 文本包含特殊字符\n\n建议：\n• 尝试使用 AI 修改功能`
        : `⚠️ Cannot apply text change\n\nPossible reasons:\n• Text not found in code\n• Text may be dynamically generated\n• Text contains special characters\n\nSuggestion:\n• Try using AI modification`;
      alert(errorMsg);
      return;
    }
    
    // Verify the code actually changed
    if (updatedCode === generatedCode) {
      const errorMsg = language === 'zh' 
        ? `⚠️ 替换失败\n\n新文本可能与原文本相同，或替换未生效。\n\n建议：\n• 尝试使用 AI 修改功能`
        : `⚠️ Replacement failed\n\nNew text may be same as old, or replacement did not take effect.\n\nSuggestion:\n• Try using AI modification`;
      alert(errorMsg);
      return;
    }
    
    // Save to main code history
    setCodeHistory(prev => [...prev, { 
      code: generatedCode, 
      prompt: `Quick text change: "${oldText}" → "${newText}"`, 
      timestamp: Date.now(),
      type: 'click'
    }]);
    
    // Save to quick edit history for undo/redo within session
    const shortOldText = oldText.length > 15 ? oldText.substring(0, 15) + '...' : oldText;
    const shortNewText = newText.length > 15 ? newText.substring(0, 15) + '...' : newText;
    const description = language === 'zh' ? `文字: "${shortOldText}" → "${shortNewText}"` : `Text: "${shortOldText}" → "${shortNewText}"`;
    const isFirstEdit = quickEditHistory.length === 0;
    const currentLength = quickEditHistory.length;
    const effectiveIndex = quickEditHistoryIndex;
    
    if (isFirstEdit) {
      // First edit: save initial + new state
      setQuickEditHistory([
        { code: generatedCode, description: language === 'zh' ? '初始状态' : 'Initial state' },
        { code: updatedCode, description }
      ]);
      setQuickEditHistoryIndex(1);
    } else {
      // Subsequent edits
      setQuickEditHistory(prev => {
        // If we're not at the end, truncate future history
        const newHistory = effectiveIndex >= 0 && effectiveIndex < prev.length - 1
          ? prev.slice(0, effectiveIndex + 1) 
          : prev;
        return [...newHistory, { code: updatedCode, description }];
      });
      // Calculate new index based on whether we truncated
      const willTruncate = effectiveIndex >= 0 && effectiveIndex < currentLength - 1;
      const newLength = willTruncate ? effectiveIndex + 2 : currentLength + 1;
      setQuickEditHistoryIndex(newLength - 1);
    }
    
    setGeneratedCode(updatedCode);
    setStreamingCode(updatedCode);
    // Close modal after applying, but keep edit mode active for next selection
    setShowEditModal(false);
    setQuickEditMode('none');
    setSelectedElement(null);
    setQuickEditText('');
    
    // Update iframe content in-place without reload
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ 
        type: 'spark-update-content', 
        html: updatedCode,
        shouldRestoreEditMode: false
      }, '*');
      
      // Automatically exit edit mode after applying changes
      setIsEditMode(false);
      iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: false }, '*');
    }
    
    toastSuccess(language === 'zh' ? '文本已更新' : 'Text updated');
  };

  // Quick Edit: Undo last change
  const quickEditUndo = () => {
    if (quickEditHistoryIndex <= 0 || quickEditHistory.length === 0) {
      toastError(language === 'zh' ? '没有可撤销的操作' : 'Nothing to undo');
      return;
    }
    
    // Get the previous state
    const prevIndex = quickEditHistoryIndex - 1;
    const prevState = quickEditHistory[prevIndex];
    if (prevState) {
      setGeneratedCode(prevState.code);
      setStreamingCode(prevState.code);
      setQuickEditHistoryIndex(prevIndex);
      
      // Update iframe
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ 
          type: 'spark-update-content', 
          html: prevState.code 
        }, '*');
        
        // Re-enable edit mode after content update
        setTimeout(() => {
          if (isEditMode && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
          }
        }, 100);
      }
      
      const undoDesc = quickEditHistory[quickEditHistoryIndex]?.description || '';
      toastSuccess(language === 'zh' ? `已撤销: ${undoDesc}` : `Undone: ${undoDesc}`);
    }
  };

  // Quick Edit: Redo last undone change
  const quickEditRedo = () => {
    if (quickEditHistoryIndex >= quickEditHistory.length - 1) {
      toastError(language === 'zh' ? '没有可重做的操作' : 'Nothing to redo');
      return;
    }
    
    const nextIndex = quickEditHistoryIndex + 1;
    const nextState = quickEditHistory[nextIndex];
    
    if (nextState) {
      setGeneratedCode(nextState.code);
      setStreamingCode(nextState.code);
      setQuickEditHistoryIndex(nextIndex);
      
      // Update iframe
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ 
          type: 'spark-update-content', 
          html: nextState.code 
        }, '*');
        
        // Re-enable edit mode after content update
        setTimeout(() => {
          if (isEditMode && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
          }
        }, 100);
      }
      
      toastSuccess(language === 'zh' ? `已重做: ${nextState.description}` : `Redone: ${nextState.description}`);
    }
  };

  // Check if undo/redo is available
  const canQuickEditUndo = quickEditHistoryIndex > 0 && quickEditHistory.length > 1;
  const canQuickEditRedo = quickEditHistoryIndex < quickEditHistory.length - 1;

  // Reset quick edit history when exiting edit mode
  const resetQuickEditHistory = () => {
    setQuickEditHistory([]);
    setQuickEditHistoryIndex(-1);
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

    // Create a display message that shows both the selected element and user's request
    const elementDescription = selectedElement.innerText 
      ? `<${selectedElement.tagName}> "${selectedElement.innerText.substring(0, 30)}${selectedElement.innerText.length > 30 ? '...' : ''}"`
      : `<${selectedElement.tagName} class="${selectedElement.className.substring(0, 30)}${selectedElement.className.length > 30 ? '...' : ''}">`;
    
    const displayMessage = language === 'zh'
      ? `🎯 点选元素: ${elementDescription}\n📝 修改要求: ${editRequest}`
      : `🎯 Selected: ${elementDescription}\n📝 Request: ${editRequest}`;

    setShowEditModal(false);
    setEditRequest('');
    setSelectedElement(null);
    setEditIntent('auto');
    // Keep edit mode active - user can continue clicking after AI finishes
    // setIsEditMode stays true so user can keep editing
    
    startGeneration(true, prompt, displayMessage, false, 'click');
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

  // Handle blank screen fix - called when user clicks fix button for blank screen
  const handleBlankScreenFix = () => {
    const blankScreenPrompt = language === 'zh'
      ? `应用出现白屏，无法渲染任何内容。请检查以下可能的问题并修复：
1. React 组件是否正确导出和渲染
2. ReactDOM.render/createRoot 是否正确调用
3. 是否有语法错误导致 JSX 解析失败
4. 是否有未定义的变量或组件

请修复代码使应用能够正常显示。`
      : `The app is showing a blank screen and not rendering any content. Please check and fix these potential issues:
1. Are React components properly exported and rendered?
2. Is ReactDOM.render/createRoot called correctly?
3. Are there syntax errors causing JSX parsing failure?
4. Are there undefined variables or components?

Please fix the code to make the app display properly.`;
    
    startGeneration(true, blankScreenPrompt, '', false, 'fix');
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto pt-2">
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

  const renderGenerating = () => {
    // Animation variants based on phase
    const isStarting = generationPhase === 'starting';
    const isCompleting = generationPhase === 'completing';
    
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black"></div>
        
        {/* Code Waterfall - Always visible during generation but faded in/out */}
        <div className={`absolute inset-0 transition-opacity duration-1000 ${generationPhase === 'generating' || generationPhase === 'completing' ? 'opacity-100' : 'opacity-0'}`}>
            <CodeWaterfall code={streamingCode} isGenerating={generationPhase === 'generating'} />
        </div>

        {/* Phase 1: Starting Animation */}
        {isStarting && (
            <div className="relative z-10 flex flex-col items-center animate-zoom-in">
                <div className="w-24 h-24 relative mb-8">
                    <div className="absolute inset-0 rounded-full border-4 border-brand-500/30 animate-ping"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-t-brand-500 border-r-transparent border-b-brand-500 border-l-transparent animate-spin"></div>
                    <div className="absolute inset-4 rounded-full bg-brand-500/20 backdrop-blur-sm flex items-center justify-center">
                        <i className="fa-solid fa-bolt text-3xl text-brand-400 animate-pulse"></i>
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                    {language === 'zh' ? '正在启动创造引擎...' : 'Igniting Creation Engine...'}
                </h2>
                <p className="text-slate-400 text-sm">
                    {language === 'zh' ? '分析需求 • 构建上下文 • 准备环境' : 'Analyzing Requirements • Building Context • Preparing Environment'}
                </p>
            </div>
        )}

        {/* Phase 2: Generating (Center Content) */}
        {(generationPhase === 'generating' || generationPhase === 'completing') && (
            <div className={`relative z-10 w-full max-w-4xl px-6 transition-all duration-500 ${isCompleting ? 'scale-110 opacity-0' : 'scale-100 opacity-100'}`}>
                
                {/* Central Status Display */}
                <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                    {/* Glowing Border Effect */}
                    <div className="absolute -inset-[1px] bg-gradient-to-r from-transparent via-brand-500/50 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-1000 animate-gradient-x"></div>
                    
                    <div className="relative flex flex-col md:flex-row gap-8 items-center md:items-start">
                        {/* Left: Visual Indicator */}
                        <div className="shrink-0 relative">
                            <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700 shadow-inner overflow-hidden">
                                <i className={`fa-solid ${wizardData.category ? (CATEGORIES.find(c => c.id === wizardData.category)?.icon || 'fa-cube') : 'fa-cube'} text-4xl text-brand-500/80`}></i>
                                <div className="absolute inset-0 bg-gradient-to-t from-brand-500/20 to-transparent animate-pulse"></div>
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-slate-900 rounded-full border border-slate-700 flex items-center justify-center">
                                <i className="fa-solid fa-robot text-brand-400 text-xs animate-bounce"></i>
                            </div>
                        </div>

                        {/* Right: Progress & Logs */}
                        <div className="flex-1 w-full">
                            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                                {language === 'zh' ? '正在构建您的应用' : 'Building Your Application'}
                                <span className="flex h-2 w-2 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                                </span>
                            </h3>
                            <p className="text-slate-400 text-sm mb-6 line-clamp-1">
                                {currentGenerationPrompt}
                            </p>

                            {/* Progress Component Integration */}
                            <div className="bg-black/30 rounded-xl border border-white/5 p-1">
                                <GenerationProgress 
                                    plan={aiPlan} 
                                    currentStep={currentStep} 
                                    isGenerating={isGenerating} 
                                    language={language} 
                                    variant="centered" // We might want to adjust this variant or create a new one for this layout
                                    loadingTip={loadingText}
                                    // We don't pass streamingCode here because we show it in the waterfall
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Phase 3: Completing / Success Flash */}
        {isCompleting && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fade-in">
                <div className="scale-150 transition-transform duration-500">
                    <div className="w-32 h-32 bg-brand-500 rounded-full flex items-center justify-center shadow-[0_0_100px_rgba(59,130,246,0.6)] animate-ping-slow">
                        <i className="fa-solid fa-check text-5xl text-white"></i>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  };

  const renderPreview = () => (
    <div className="flex flex-col lg:flex-row h-full pt-0 overflow-hidden relative animate-in fade-in duration-700">
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
          {chatHistory.map((msg, i) => {
            // Hide the last message if it's the summary and workflow is still transitioning
            const isLastMessage = i === chatHistory.length - 1;
            const isSummaryMessage = msg.role === 'ai' && workflowStage === 'completed' && !isGenerating;
            const shouldHide = isLastMessage && isSummaryMessage;

            return (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} transition-all duration-1000 ${shouldHide ? 'opacity-0 max-h-0 overflow-hidden' : 'animate-in slide-in-from-bottom-2 fade-in duration-500 opacity-100 max-h-[1000px]'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${
                  msg.role === 'user' 
                    ? 'bg-brand-500/20 backdrop-blur-md border border-brand-500/30 text-brand-400' 
                    : (msg.type === 'error' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-black/40 backdrop-blur-md border border-white/10 text-brand-400')
              }`}>
                <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : (msg.type === 'error' ? 'fa-triangle-exclamation' : 'fa-robot')}`}></i>
              </div>
              <div className={`p-4 rounded-2xl text-sm max-w-[85%] select-text shadow-lg backdrop-blur-md border ${
                  msg.role === 'user' 
                    ? 'bg-brand-500/10 text-slate-200 rounded-tr-none border-brand-500/20' 
                    : (msg.type === 'error' 
                        ? 'bg-red-950/40 border-red-500/30 text-red-200 rounded-tl-none' 
                        : 'bg-black/40 border-white/10 text-slate-200 rounded-tl-none')
              }`}>
                {msg.type === 'error' ? (
                    <div className="flex flex-col gap-2">
                        <div className="font-bold text-xs uppercase tracking-wider opacity-70 flex items-center gap-2">
                            {msg.isBlankScreen 
                                ? (language === 'zh' ? '白屏检测' : 'Blank Screen Detected')
                                : (language === 'zh' ? '运行时错误' : 'Runtime Error')
                            }
                            {msg.errorDetails?.line && <span className="bg-red-500/20 px-1.5 rounded text-[10px]">Line {msg.errorDetails.line}</span>}
                        </div>
                        <div className="font-mono text-xs break-words bg-black/20 p-2 rounded border border-red-500/20">
                            {msg.content}
                        </div>
                        {msg.isBlankScreen && msg.errorDetails?.hint && (
                            <div className="text-[10px] text-yellow-300/70 bg-yellow-500/10 px-2 py-1 rounded">
                                <i className="fa-solid fa-lightbulb mr-1"></i>
                                {msg.errorDetails.hint}
                            </div>
                        )}
                        <button 
                            onClick={() => msg.isBlankScreen ? handleBlankScreenFix() : handleFixError(msg.content, msg.errorDetails)}
                            className="mt-1 bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg"
                        >
                            <i className="fa-solid fa-wand-magic-sparkles"></i>
                            {language === 'zh' ? 'AI 自动修复' : 'Fix with AI'}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        {msg.cost && (
                            <div className="mt-2 pt-2 border-t border-white/5 flex justify-end">
                                <span className="text-[10px] font-medium text-amber-500/80 flex items-center gap-1">
                                    <i className="fa-solid fa-bolt text-amber-500 text-[9px]"></i>
                                    {language === 'zh' ? `消耗 ${msg.cost} 积分` : `Cost: ${msg.cost} credits`}
                                </span>
                            </div>
                        )}
                    </>
                )}
              </div>
            </div>
            );
          })}
          
          {(isGenerating || workflowStage === 'completed') && (
            <div className={`flex gap-3 transition-all duration-1000 ease-in-out ${workflowStage === 'completed' && !isGenerating ? 'opacity-0 max-h-0 overflow-hidden translate-y-4' : 'animate-fade-in max-h-[500px] opacity-100'}`}>
              <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
                <i className="fa-solid fa-robot fa-bounce"></i>
              </div>
              <div className="flex-1 min-w-0">
                  <AIWorkflowProgress 
                    stage={workflowStage}
                    details={workflowDetails}
                    isGenerating={isGenerating}
                    language={language}
                    variant="chat"
                  />
                  {/* Cancel Button */}
                  {isGenerating && (
                    <button
                        onClick={() => handleCancelGeneration(0)}
                        className="mt-3 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 rounded-lg text-sm text-slate-300 hover:text-white transition-colors flex items-center gap-2"
                    >
                        <i className="fa-solid fa-xmark"></i>
                        <span>{language === 'zh' ? '取消生成' : 'Cancel'}</span>
                    </button>
                  )}
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
          {/* Model Selector & Full Repair Button Row */}
          <div className="flex justify-between items-center mb-2 gap-2">
            {/* Model Selector */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 mr-1">{language === 'zh' ? '模型' : 'Model'}:</span>
              <div className="flex gap-1">
                {(Object.entries(MODEL_CONFIG) as [ModelType, typeof MODEL_CONFIG[ModelType]][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedModel(key)}
                    disabled={isGenerating}
                    className={`text-xs px-2 py-1 rounded transition flex items-center gap-1 ${
                      selectedModel === key
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                    } disabled:opacity-50`}
                    title={`${config.name}\n${config.subtitle}`}
                  >
                    <span>{config.icon}</span>
                    <span className="hidden sm:inline">{config.description}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Full Repair Button */}
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
            
            {/* Full Screen Button */}
            <button 
              onClick={toggleFullScreen}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title={language === 'zh' ? (isFullscreen ? '退出全屏' : '全屏预览') : (isFullscreen ? 'Exit Full Screen' : 'Full Screen')}
            >
              <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSaveDraft}
              disabled={isSaving}
              className={`px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isSaving ? (
                <i className="fa-solid fa-circle-notch fa-spin"></i>
              ) : (
                <i className="fa-solid fa-floppy-disk"></i>
              )}
              <span>{isSaving ? (language === 'zh' ? '保存中...' : 'Saving...') : (language === 'zh' ? '存草稿' : 'Save Draft')}</span>
            </button>
            
            <button 
              onClick={handleUpload}
              className="px-3 py-1.5 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold transition shadow-lg flex items-center gap-1.5"
            >
              <i className="fa-solid fa-rocket"></i> 
              <span>{t.create.publish}</span>
            </button>
          </div>
        </div>
        
        {/* Preview Container */}
        <div 
          ref={previewContainerRef}
          className="flex-1 relative overflow-hidden flex items-center justify-center bg-[url('/grid.svg')] bg-center pb-16 lg:pb-0"
        >
          {/* Quick Edit History Panel - Right side of preview (persistent, collapsible) */}
          {quickEditHistory.length > 0 && (
            <div 
              ref={historyPanelRef}
              className={`absolute right-2 top-2 z-20 transition-all duration-300 ${isHistoryPanelOpen ? 'bottom-20 lg:bottom-2' : ''}`}
            >
              {isHistoryPanelOpen ? (
                <div className="w-44 h-full bg-slate-900/95 backdrop-blur-md border border-slate-700/70 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="px-2 py-2 border-b border-slate-700/50 flex items-center justify-between shrink-0">
                    <div className="text-[10px] text-slate-300 font-bold flex items-center gap-1.5">
                      <i className="fa-solid fa-clock-rotate-left text-brand-400"></i>
                      {language === 'zh' ? `历史` : `History`}
                      <span className="text-slate-500">({quickEditHistory.length})</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={quickEditUndo}
                        disabled={!canQuickEditUndo}
                        className={`w-5 h-5 rounded flex items-center justify-center transition text-[10px] ${
                          canQuickEditUndo 
                            ? 'text-slate-300 hover:bg-slate-700 hover:text-white' 
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                        title={language === 'zh' ? '撤销' : 'Undo'}
                      >
                        <i className="fa-solid fa-rotate-left"></i>
                      </button>
                      <button
                        onClick={quickEditRedo}
                        disabled={!canQuickEditRedo}
                        className={`w-5 h-5 rounded flex items-center justify-center transition text-[10px] ${
                          canQuickEditRedo 
                            ? 'text-slate-300 hover:bg-slate-700 hover:text-white' 
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                        title={language === 'zh' ? '重做' : 'Redo'}
                      >
                        <i className="fa-solid fa-rotate-right"></i>
                      </button>
                      <button
                        onClick={() => setIsHistoryPanelOpen(false)}
                        className="w-5 h-5 rounded flex items-center justify-center transition text-[10px] text-slate-400 hover:bg-slate-700 hover:text-white ml-1"
                        title={language === 'zh' ? '收起' : 'Collapse'}
                      >
                        <i className="fa-solid fa-chevron-right"></i>
                      </button>
                    </div>
                  </div>
                  {/* History List - Vertical */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                    {quickEditHistory.map((item, idx) => {
                      const isCurrent = idx === quickEditHistoryIndex;
                      const isPast = idx < quickEditHistoryIndex;
                      return (
                        <div 
                          key={idx}
                          className={`text-[10px] px-2 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all ${
                            isCurrent 
                              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm' 
                              : isPast 
                                ? 'text-slate-400 bg-slate-800/60 hover:bg-slate-800' 
                                : 'text-slate-500 hover:bg-slate-800/40'
                          }`}
                          onClick={() => {
                            // Jump to this history state
                            if (idx !== quickEditHistoryIndex) {
                              setGeneratedCode(item.code);
                              setStreamingCode(item.code);
                              setQuickEditHistoryIndex(idx);
                              
                              // Update iframe
                              if (iframeRef.current?.contentWindow) {
                                iframeRef.current.contentWindow.postMessage({ 
                                  type: 'spark-update-content', 
                                  html: item.code 
                                }, '*');
                                
                                // Re-enable edit mode after content update
                                setTimeout(() => {
                                  if (isEditMode && iframeRef.current?.contentWindow) {
                                    iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
                                  }
                                }, 100);
                              }
                            }
                          }}
                          title={item.description}
                        >
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0 ${
                            isCurrent ? 'bg-brand-500 text-white' : 'bg-slate-700'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="truncate flex-1">{item.description}</span>
                          {isCurrent && (
                            <i className="fa-solid fa-circle text-[4px] text-brand-400 animate-pulse"></i>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Collapsed state - small button to expand */
                <button
                  onClick={() => setIsHistoryPanelOpen(true)}
                  className="w-10 h-10 bg-slate-900/95 backdrop-blur-md border border-slate-700/70 rounded-xl shadow-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title={language === 'zh' ? `展开历史 (${quickEditHistory.length})` : `Expand History (${quickEditHistory.length})`}
                >
                  <div className="relative">
                    <i className="fa-solid fa-clock-rotate-left text-sm"></i>
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                      {quickEditHistory.length}
                    </span>
                  </div>
                </button>
              )}
            </div>
          )}
          <div 
            className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-slate-900 flex-shrink-0 origin-center
              ${(previewMode === 'mobile' && !isFullscreen)
                ? 'w-[375px] h-[812px] rounded-[3rem] border-[8px] border-slate-800 ring-1 ring-slate-700/50' 
                : ''}
              ${(previewMode === 'tablet' && !isFullscreen)
                ? 'w-[768px] h-[1024px] rounded-[2rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50' 
                : ''}
              ${(previewMode === 'desktop' || isFullscreen)
                ? 'w-full h-full rounded-none border-0' 
                : ''}
            `}
            style={{
              transform: (previewMode !== 'desktop' && !isFullscreen) ? `scale(${previewScale})` : 'none'
            }}
          >
             {(previewMode === 'mobile' && !isFullscreen) && (
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-slate-800 rounded-b-2xl z-20 pointer-events-none"></div>
             )}
             
             <iframe
               ref={iframeRef}
               srcDoc={getPreviewContent(generatedCode, { raw: true })}
               className="w-full h-full bg-slate-900"
               sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
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

            {/* Quick Edit Undo/Redo Buttons - Only show when in edit mode and has history */}
            {isEditMode && quickEditHistory.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-full px-2 py-1 shadow-xl">
                <button
                  onClick={quickEditUndo}
                  disabled={!canQuickEditUndo}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                    canQuickEditUndo 
                      ? 'text-slate-300 hover:text-white hover:bg-slate-700' 
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                  title={language === 'zh' ? `撤销 (${quickEditHistoryIndex + 1})` : `Undo (${quickEditHistoryIndex + 1})`}
                >
                  <i className="fa-solid fa-rotate-left text-sm"></i>
                </button>
                <span className="text-xs text-slate-500 px-1">{quickEditHistoryIndex + 1}/{quickEditHistory.length}</span>
                <button
                  onClick={quickEditRedo}
                  disabled={!canQuickEditRedo}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                    canQuickEditRedo 
                      ? 'text-slate-300 hover:text-white hover:bg-slate-700' 
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                  title={language === 'zh' ? '重做' : 'Redo'}
                >
                  <i className="fa-solid fa-rotate-right text-sm"></i>
                </button>
              </div>
            )}
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
                ? 'AI 生成响应时间超过预期。这可能是由于服务器繁忙或任务较复杂。您可以选择继续等待，或者取消任务（取消不会扣除积分）。' 
                : 'AI generation is taking longer than expected. This might be due to server load or task complexity. You can keep waiting or cancel (no credits will be charged).'}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => handleCancelGeneration(timeoutCost)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition border border-slate-700 flex flex-col items-center justify-center gap-0.5"
              >
                <span className="font-bold text-sm">{language === 'zh' ? '取消任务' : 'Cancel Task'}</span>
                <span className="text-[10px] text-slate-400 font-normal">{language === 'zh' ? '不扣除积分' : 'No credits charged'}</span>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-2 pt-8 overflow-y-auto animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden my-auto">
            {/* Header - More compact */}
            <div className="px-3 py-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400">
                    <i className="fa-solid fa-pen-to-square text-xs"></i>
                </div>
                {t.create.edit_element_title}
              </h3>
              <button onClick={() => { setShowEditModal(false); setQuickEditMode('none'); }} className="text-slate-400 hover:text-white transition w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-800">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
                {/* Context Card - More compact */}
                <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-1.5 opacity-50 group-hover:opacity-100 transition">
                     <span className="text-[9px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {selectedElement.tagName.toLowerCase()}
                     </span>
                  </div>
                  
                  <div className="space-y-2">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
                            <i className="fa-solid fa-crosshairs text-[8px]"></i> {t.create.edit_element_selected}
                        </div>
                        <div className="font-mono text-xs text-brand-300 break-all">
                            &lt;{selectedElement.tagName.toLowerCase()} className="..."&gt;
                        </div>
                      </div>
                      
                      {selectedElement.innerText && (
                          <div className="pl-2 border-l-2 border-slate-800">
                            <div className="text-[10px] text-slate-500 mb-0.5">Content</div>
                            <div className="text-xs text-slate-300 italic line-clamp-1">
                                "{selectedElement.innerText.substring(0, 60)}{selectedElement.innerText.length > 60 ? '...' : ''}"
                            </div>
                          </div>
                      )}

                      {selectedElement.parentTagName && (
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1.5 border-t border-slate-800/50">
                             <i className="fa-solid fa-level-up-alt fa-rotate-90 text-[8px]"></i>
                             <span>Inside &lt;{selectedElement.parentTagName}&gt;</span>
                          </div>
                      )}
                  </div>
                </div>

                {/* Quick Edit Buttons - Show when applicable */}
                {(detectQuickEditType(selectedElement) !== 'none') && quickEditMode === 'none' && (
                  <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2.5">
                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <i className="fa-solid fa-bolt text-[8px]"></i>
                      {language === 'zh' ? '快速编辑' : 'Quick Edit'}
                    </div>
                    <div className="flex gap-2">
                      {(detectQuickEditType(selectedElement) === 'text' || detectQuickEditType(selectedElement) === 'both') && (
                        <button
                          onClick={() => {
                            setQuickEditMode('text');
                            setQuickEditText(selectedElement.innerText || '');
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                        >
                          <i className="fa-solid fa-font text-[10px]"></i>
                          {language === 'zh' ? '改文字' : 'Text'}
                        </button>
                      )}
                      {(detectQuickEditType(selectedElement) === 'color' || detectQuickEditType(selectedElement) === 'both') && (
                        <button
                          onClick={() => {
                            const types = detectAvailableColorTypes(selectedElement.className, selectedElement);
                            setAvailableColorTypes(types);
                            setQuickEditColorType(types.length === 1 ? types[0] : 'all');
                            setQuickEditMode('color');
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                        >
                          <i className="fa-solid fa-palette text-[10px]"></i>
                          {language === 'zh' ? '改颜色' : 'Color'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Edit: Color Picker */}
                {quickEditMode === 'color' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {language === 'zh' ? '选择颜色' : 'Select Color'}
                      </label>
                      <button 
                        onClick={() => setQuickEditMode('none')}
                        className="text-[10px] text-slate-500 hover:text-slate-300"
                      >
                        {language === 'zh' ? '用AI改' : 'Use AI'}
                      </button>
                    </div>
                    
                    {/* Color Type Selector - More compact */}
                    {availableColorTypes.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-slate-500">{language === 'zh' ? '颜色类型：' : 'Type:'}</div>
                        <div className="flex gap-1 p-0.5 bg-slate-950 rounded-lg">
                          {availableColorTypes.length > 1 && (
                            <button
                              onClick={() => setQuickEditColorType('all')}
                              className={`flex-1 py-1 px-1.5 rounded text-[10px] font-medium transition ${quickEditColorType === 'all' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                              {language === 'zh' ? '全部' : 'All'}
                            </button>
                          )}
                          {availableColorTypes.includes('bg') && (
                            <button
                              onClick={() => setQuickEditColorType('bg')}
                              className={`flex-1 py-1 px-1.5 rounded text-[10px] font-medium transition flex items-center justify-center gap-0.5 ${quickEditColorType === 'bg' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                              <i className="fa-solid fa-fill-drip text-[8px]"></i>
                              {language === 'zh' ? '背景' : 'BG'}
                            </button>
                          )}
                          {availableColorTypes.includes('text') && (
                            <button
                              onClick={() => setQuickEditColorType('text')}
                              className={`flex-1 py-1 px-1.5 rounded text-[10px] font-medium transition flex items-center justify-center gap-0.5 ${quickEditColorType === 'text' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                              <i className="fa-solid fa-font text-[8px]"></i>
                              {language === 'zh' ? '文字' : 'Text'}
                            </button>
                          )}
                          {availableColorTypes.includes('border') && (
                            <button
                              onClick={() => setQuickEditColorType('border')}
                              className={`flex-1 py-1 px-1.5 rounded text-[10px] font-medium transition flex items-center justify-center gap-0.5 ${quickEditColorType === 'border' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            >
                              <i className="fa-solid fa-border-all text-[8px]"></i>
                              {language === 'zh' ? '边框' : 'Border'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      {/* Color picker - More compact */}
                      <div className="flex gap-2 items-start">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="color"
                            value={quickEditColor}
                            onChange={(e) => setQuickEditColor(e.target.value)}
                            className="w-10 h-10 rounded-lg border-2 border-slate-700 cursor-pointer bg-transparent"
                          />
                          <span className="text-[8px] text-slate-500 font-mono">{quickEditColor}</span>
                        </div>
                        <div className="flex-1">
                          {/* Quick presets - Common colors */}
                          <div className="text-[9px] text-slate-500 mb-1">{language === 'zh' ? '常用' : 'Common'}</div>
                          <div className="grid grid-cols-8 gap-1 mb-1.5">
                            {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
                              '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#ffffff', '#000000'].map(color => (
                              <button
                                key={color}
                                onClick={() => setQuickEditColor(color)}
                                className={`w-5 h-5 rounded border transition ${quickEditColor === color ? 'border-white ring-1 ring-brand-500 scale-110' : 'border-slate-600 hover:border-slate-400'}`}
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                          {/* Grayscale */}
                          <div className="text-[9px] text-slate-500 mb-1">{language === 'zh' ? '灰度' : 'Gray'}</div>
                          <div className="grid grid-cols-10 gap-1">
                            {['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155',
                              '#1e293b', '#0f172a'].map(color => (
                              <button
                                key={color}
                                onClick={() => setQuickEditColor(color)}
                                className={`w-5 h-5 rounded border transition ${quickEditColor === color ? 'border-white ring-1 ring-brand-500 scale-110' : 'border-slate-600 hover:border-slate-400'}`}
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      {/* Custom hex input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={quickEditColor}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                              setQuickEditColor(val);
                            }
                          }}
                          placeholder="#3b82f6"
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => applyQuickColorEdit(quickEditColor)}
                      disabled={!quickEditColor.match(/^#[0-9A-Fa-f]{6}$/)}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-1"
                    >
                      <i className="fa-solid fa-check text-[10px]"></i>
                      {language === 'zh' ? '应用' : 'Apply'}
                    </button>
                  </div>
                )}

                {/* Quick Edit: Text Input */}
                {quickEditMode === 'text' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {language === 'zh' ? '编辑文字' : 'Edit Text'}
                      </label>
                      <button 
                        onClick={() => setQuickEditMode('none')}
                        className="text-[10px] text-slate-500 hover:text-slate-300"
                      >
                        {language === 'zh' ? 'AI修改' : 'Use AI'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={quickEditText}
                      onChange={(e) => setQuickEditText(e.target.value)}
                      placeholder={language === 'zh' ? '输入新文字...' : 'Enter new text...'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs"
                      autoFocus
                    />
                    <button
                      onClick={() => applyQuickTextEdit(quickEditText)}
                      disabled={!quickEditText.trim()}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-1"
                    >
                      <i className="fa-solid fa-check text-[10px]"></i>
                      {language === 'zh' ? '应用' : 'Apply'}
                    </button>
                  </div>
                )}

                {/* AI Edit Section - Only show when not in quick edit mode */}
                {quickEditMode === 'none' && (
                  <>
                    {/* Divider if quick edit was available */}
                    {detectQuickEditType(selectedElement) !== 'none' && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-slate-800"></div>
                        <span className="text-[10px] text-slate-600 font-medium">
                          {language === 'zh' ? '或用AI' : 'Or AI'}
                        </span>
                        <div className="flex-1 h-px bg-slate-800"></div>
                      </div>
                    )}

                {/* Intent Selector */}
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        {language === 'zh' ? '修改类型' : 'Type'}
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                        {[
                            { id: 'auto', icon: 'fa-wand-magic-sparkles', label: language === 'zh' ? '自动' : 'Auto' },
                            { id: 'style', icon: 'fa-palette', label: language === 'zh' ? '样式' : 'Style' },
                            { id: 'content', icon: 'fa-font', label: language === 'zh' ? '内容' : 'Content' },
                            { id: 'logic', icon: 'fa-code', label: language === 'zh' ? '逻辑' : 'Logic' }
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setEditIntent(type.id as any)}
                                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded border transition-all ${
                                    editIntent === type.id 
                                    ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-900/20' 
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                }`}
                            >
                                <i className={`fa-solid ${type.icon} text-[10px]`}></i>
                                <span className="text-[8px] font-bold">{type.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                
                {/* Input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
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
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-h-[60px] resize-none text-xs leading-relaxed"
                      />
                      <div className="absolute bottom-1.5 right-2 text-[8px] text-slate-600">
                        {editRequest.length}
                      </div>
                  </div>
                </div>
                  </>
                )}
            </div>
            
            {/* Footer - Only show for AI edit */}
            {quickEditMode === 'none' && (
              <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/50 flex gap-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors border border-slate-700"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleElementEditSubmit}
                disabled={!editRequest.trim()}
                className="flex-[2] px-2 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-all shadow-lg shadow-brand-900/20 flex items-center justify-center gap-1"
              >
                <i className="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                {t.create.btn_generate_edit}
              </button>
              </div>
            )}
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
