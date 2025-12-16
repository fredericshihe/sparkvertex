'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { copyToClipboard } from '@/lib/utils';
import { getPreviewContent } from '@/lib/preview';
import { X, RefreshCw, MessageSquare, Eye, Wand2, Edit3, Play } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { type WorkflowStage, type StageDetails } from '@/components/AIWorkflowProgress';
import { GET_BACKEND_CONFIG_PROMPT } from '@/lib/prompts';
import dynamic from 'next/dynamic';

// Dynamic imports for heavy components
const Galaxy = dynamic(() => import('@/components/Galaxy'), { ssr: false });
const BackendConfigFlow = dynamic(() => import('@/components/BackendConfigFlow').then(mod => mod.BackendConfigFlow), { 
  loading: () => <div className="h-32 animate-pulse bg-slate-800/50 rounded-xl" />
});
const GenerationProgress = dynamic(() => import('@/components/GenerationProgress').then(mod => mod.GenerationProgress));
const AIWorkflowProgress = dynamic(() => import('@/components/AIWorkflowProgress').then(mod => mod.AIWorkflowProgress));
const CodeWaterfall = dynamic(() => import('@/components/CodeWaterfall').then(mod => mod.CodeWaterfall));
const CreationChat = dynamic(() => import('@/components/CreationChat').then(mod => mod.CreationChat), {
  loading: () => <div className="h-full w-full animate-pulse bg-slate-900/50" />
});
const CreationPreview = dynamic(() => import('@/components/CreationPreview').then(mod => mod.CreationPreview), {
  loading: () => <div className="h-full w-full animate-pulse bg-slate-900/50 flex items-center justify-center"><i className="fa-solid fa-circle-notch fa-spin text-2xl text-slate-600"></i></div>
});

// --- Constants ---
const CATEGORIES = [
  { id: 'game', icon: 'fa-gamepad' },
  { id: 'portfolio', icon: 'fa-id-card' }, // New
  { id: 'appointment', icon: 'fa-calendar-check' }, // New
  { id: 'productivity', icon: 'fa-list-check' },
  { id: 'tool', icon: 'fa-screwdriver-wrench' },
  { id: 'devtool', icon: 'fa-code' },
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
  { id: 'cyberpunk', color: 'from-pink-500 to-cyan-500', icon: 'fa-bolt' },
  { id: 'minimalist', color: 'from-slate-200 to-slate-400', icon: 'fa-minus' },
  { id: 'cute', color: 'from-pink-300 to-purple-300', icon: 'fa-face-smile' },
  { id: 'business', color: 'from-blue-600 to-indigo-700', icon: 'fa-briefcase' },
  { id: 'retro', color: 'from-yellow-400 to-orange-500', icon: 'fa-ghost' },
  { id: 'native', color: 'from-blue-500 to-blue-600', icon: 'fa-mobile-screen' },
  { id: 'glassmorphism', color: 'from-white/20 to-white/10', icon: 'fa-layer-group' },
  { id: 'neobrutalism', color: 'from-yellow-300 to-red-500', icon: 'fa-shapes' },
  { id: 'cartoon', color: 'from-orange-300 to-yellow-300', icon: 'fa-pen-nib' },
  { id: 'lowpoly', color: 'from-indigo-400 to-purple-500', icon: 'fa-cubes' },
  { id: 'dark_fantasy', color: 'from-slate-900 to-purple-900', icon: 'fa-dragon' },
  { id: 'neumorphism', color: 'from-gray-200 to-gray-300', icon: 'fa-circle' },
  { id: 'industrial', color: 'from-slate-700 to-slate-800', icon: 'fa-gears' },
  { id: 'swiss', color: 'from-red-500 to-white', icon: 'fa-font' },
  { id: 'editorial', color: 'from-stone-100 to-stone-200', icon: 'fa-heading' },
  { id: 'card', color: 'from-gray-100 to-gray-200', icon: 'fa-table-cells-large' },
  { id: 'bubble', color: 'from-blue-300 to-pink-300', icon: 'fa-comments' },
  { id: 'material', color: 'from-blue-500 to-indigo-500', icon: 'fa-layer-group' },
  { id: 'paper', color: 'from-yellow-50 to-orange-50', icon: 'fa-note-sticky' },
  { id: 'gamified', color: 'from-purple-400 to-pink-400', icon: 'fa-trophy' },
  { id: 'dark_mode', color: 'from-gray-900 to-black', icon: 'fa-moon' },
  { id: 'kanban', color: 'from-yellow-100 to-blue-100', icon: 'fa-table-columns' }
];

const CATEGORY_STYLES: Record<string, string[]> = {
  game: ['retro', 'cyberpunk', 'cartoon', 'lowpoly', 'dark_fantasy', 'neobrutalism'],
  tool: ['minimalist', 'neumorphism', 'native', 'industrial', 'swiss', 'dark_mode'],
  portfolio: ['minimalist', 'swiss', 'editorial', 'glassmorphism', 'neobrutalism', 'dark_mode'], // New
  appointment: ['business', 'minimalist', 'native', 'material', 'card', 'clean'], // New
  productivity: ['minimalist', 'dark_mode', 'kanban', 'business', 'swiss', 'neumorphism'],
  devtool: ['dark_mode', 'industrial', 'minimalist', 'swiss', 'neobrutalism', 'retro'],
  education: ['cute', 'business', 'paper', 'gamified', 'minimalist', 'card'],
  visualization: ['dark_mode', 'swiss', 'minimalist', 'industrial', 'glassmorphism', 'card'],
  lifestyle: ['cute', 'bubble', 'minimalist', 'native', 'paper', 'material']
};

const CATEGORY_PROMPTS: Record<string, string> = {
  game: "Category: Casual Game. Focus on engaging gameplay loops, clear win/loss conditions, and responsive controls. Use canvas or DOM-based rendering for performance. Include sound effects (optional) and score tracking.",
  portfolio: "Category: Personal Portfolio. Focus on visual impact, showcasing work, and personal branding. Use high-quality typography, smooth transitions, and a clear 'About Me' section. Include a contact form or links.",
  appointment: "Category: Service Appointment/Booking. Focus on trust, clarity, and ease of scheduling. Include a calendar view, time slot selection, and service details. Ensure the booking flow is intuitive.",
  productivity: "Category: Productivity Tool. Focus on efficiency, data organization, and quick interactions. Use clear lists, boards, or charts. Ensure local data persistence (localStorage) for user data.",
  tool: "Category: Utility Tool. Focus on single-purpose functionality, speed, and accuracy. Input should be easy, output should be clear. Minimize friction.",
  devtool: "Category: Developer Tool. Focus on technical accuracy, code formatting, and data visualization. Use monospace fonts for code. Support copy-paste and file inputs.",
  education: "Category: Educational App. Focus on learning retention, clear explanations, and interactive quizzes. Use progress tracking and encouraging feedback.",
  visualization: "Category: Data Visualization. Focus on clarity, data density, and interactivity. Use charts (SVG/Canvas) to represent data. Allow filtering and sorting.",
  lifestyle: "Category: Lifestyle App. Focus on daily habits, health, or finance. Use friendly UI, encouraging messages, and simple data entry."
};

const STYLE_PROMPTS: Record<string, string> = {
  cyberpunk: "Design Style: Cyberpunk. Aesthetic: High-tech low-life. Colors: Neon pink (#ff00ff), cyan (#00ffff), bright yellow on deep black/navy backgrounds. Typography: Futuristic, glitch effects, monospace. UI Elements: Angular shapes, glowing borders, HUD-like overlays.",
  minimalist: "Design Style: Minimalist. Aesthetic: Less is more. Colors: Monochromatic (black, white, grays) with one accent color. Typography: Clean sans-serif (Inter/Helvetica), large headings. UI Elements: Generous whitespace, no shadows, flat design.",
  cute: "Design Style: Soft/Playful. Aesthetic: Friendly and approachable. Colors: Pastels (soft pink, mint, baby blue). Typography: Rounded sans-serif (Quicksand/Varela Round). UI Elements: Large border-radius (pill shapes), soft drop shadows, bouncy animations.",
  business: "Design Style: Professional/Corporate. Aesthetic: Trustworthy and established. Colors: Navy blue, slate gray, white. Typography: Standard sans-serif (Roboto/System). UI Elements: Subtle shadows, standard border-radius (4-8px), structured grid layout.",
  retro: "Design Style: Retro Pixel. Aesthetic: 8-bit/16-bit nostalgia. Colors: Limited palette (CGA/EGA). Typography: Pixel fonts (Press Start 2P). UI Elements: Blocky borders, no anti-aliasing, scanline effects.",
  native: "Design Style: Native Mobile. Aesthetic: System-native look (iOS/Android). Colors: System colors (blue, gray, white). Typography: System fonts (San Francisco/Roboto). UI Elements: Standard navigation bars, tab bars, and list views, smooth transitions.",
  glassmorphism: "Design Style: Glassmorphism. Aesthetic: Frosted glass realism. Colors: Vivid gradients behind semi-transparent white layers. Typography: Modern sans-serif. UI Elements: Backdrop-blur, white borders with low opacity, floating cards.",
  neobrutalism: "Design Style: Neo-Brutalism. Aesthetic: Raw, bold, and quirky. Colors: High saturation (yellow, red, blue) with black. Typography: Bold, large, sometimes clashing. UI Elements: Thick black borders, hard shadows (no blur), geometric shapes.",
  cartoon: "Design Style: Hand-drawn/Cartoon. Aesthetic: Organic and sketchy. Colors: Vibrant and warm. Typography: Handwritten style (Comic Neue/Patrick Hand). UI Elements: Wobbly borders, sketch-like icons, paper textures.",
  lowpoly: "Design Style: Geometric/Low Poly. Aesthetic: Faceted and sharp. Colors: Gradients, polygon patterns. Typography: Modern geometric. UI Elements: Triangular shapes, sharp angles, crystal-like backgrounds.",
  dark_fantasy: "Design Style: Dark Theme/Fantasy. Aesthetic: Mysterious and immersive. Colors: Deep purple, crimson, charcoal. Typography: Serif or decorative. UI Elements: Glow effects, particle animations, ornate borders.",
  neumorphism: "Design Style: Neumorphism (Soft UI). Aesthetic: Extruded plastic realism. Colors: Light gray/off-white (#e0e5ec). Typography: Clean sans-serif. UI Elements: Double shadows (light top-left, dark bottom-right) creating depth, rounded corners.",
  industrial: "Design Style: Technical/Industrial. Aesthetic: Functional and rugged. Colors: Safety orange, yellow, slate, charcoal. Typography: Monospace/Technical. UI Elements: Grid lines, warning stripes, blueprint aesthetics.",
  swiss: "Design Style: International/Swiss. Aesthetic: Objective and grid-based. Colors: Red, black, white, high contrast. Typography: Large, bold sans-serif (Helvetica style). UI Elements: Asymmetric layouts, strong alignment, negative space.",
  editorial: "Design Style: Elegant/Editorial. Aesthetic: Print magazine feel. Colors: Cream, beige, black, serif fonts. Typography: High-contrast serif headings, clean body text. UI Elements: Fine lines, large images, sophisticated layout.",
  card: "Design Style: Card UI. Aesthetic: Organized and modular. Colors: Light gray backgrounds, white cards. Typography: Standard. UI Elements: Masonry or grid layout, distinct cards with shadows, content-focused.",
  bubble: "Design Style: Rounded/Bubble. Aesthetic: Soft and fluid. Colors: Gradients, bright colors. Typography: Rounded. UI Elements: Circles, extreme border-radius, floating elements.",
  material: "Design Style: Material Design. Aesthetic: Paper and ink. Colors: Dynamic color extraction, pastel tones. Typography: Roboto. UI Elements: Elevation (shadows), ripple effects, FAB (Floating Action Button).",
  paper: "Design Style: Sketch/Paper. Aesthetic: Physical notebook. Colors: Paper texture, ink blue/black. Typography: Handwriting. UI Elements: Sticky notes, tape effects, doodle-like borders.",
  gamified: "Design Style: Interactive/Gamified. Aesthetic: Rewarding and fun. Colors: Gold, bright green, purple. Typography: Bold. UI Elements: Progress bars, badges, confetti, bouncy feedback.",
  dark_mode: "Design Style: Dark Mode. Aesthetic: Eye comfort and focus. Colors: Pure black (#000000) or dark gray (#121212). Typography: High contrast text. UI Elements: Subtle borders, dark surfaces.",
  kanban: "Design Style: Board/Kanban. Aesthetic: Organized workflow. Colors: Post-it note colors. Typography: Clean. UI Elements: Columns, draggable cards, visual status indicators."
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
  const { openLoginModal, openCreditPurchaseModal, openConfirmModal } = useModal();
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

  // Generate a unique session ID for this creation session
  // This ensures that data submitted in this session is isolated from other drafts
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  


  const currentCategory = wizardData.category || 'tool';
  // @ts-ignore
  const QUICK_TAGS = (t.templates?.[currentCategory] || []).map((item: any) => ({
    label: item.label,
    text: item.desc
  }));

  // Model Configuration
  // Token汇率说明：
  // - DeepSeek V3: 免费模型，不消耗积分
  // - Gemini 2.5 Flash: 1积分 = 15000 tokens（便宜）
  // - Gemini 2.5 Pro: 1积分 = 4000 tokens（均衡）
  // - Gemini 3 Pro: 1积分 = 3000 tokens（强大）
  // 注意：上下文 > 200k tokens 时，价格自动翻倍
  type ModelType = 'deepseek-v3' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3-pro-preview';
  const MODEL_CONFIG: Record<ModelType, { name: string; tokensPerCredit: number; icon: string; description: string; subtitle: string; isFree?: boolean }> = {
    'deepseek-v3': {
      name: 'DeepSeek V3.2',
      tokensPerCredit: 0, // 免费模型
      icon: '🆓',
      description: language === 'zh' ? '免费' : 'Free',
      subtitle: language === 'zh' ? '免费使用，不消耗积分' : 'Free to use, no credits needed',
      isFree: true
    },
    'gemini-2.5-flash': { 
      name: 'Gemini 2.5 Flash', 
      tokensPerCredit: 15000, 
      icon: '⚡', 
      description: language === 'zh' ? '日常' : 'Daily',
      subtitle: language === 'zh' ? '便宜快速，适合简单任务' : 'Fast & cheap for simple tasks'
    },
    'gemini-2.5-pro': { 
      name: 'Gemini 2.5 Pro', 
      tokensPerCredit: 4000, 
      icon: '🚀', 
      description: language === 'zh' ? '复杂' : 'Complex',
      subtitle: language === 'zh' ? '均衡性能，适合较复杂需求' : 'Balanced for moderate complexity'
    },
    'gemini-3-pro-preview': { 
      name: 'Gemini 3 Pro Preview', 
      tokensPerCredit: 3000, 
      icon: '🧠', 
      description: language === 'zh' ? '高级' : 'Advanced',
      subtitle: language === 'zh' ? '最强智能，复杂逻辑首选' : 'Most powerful for complex logic'
    }
  };

  // State: Generation
  const [selectedModel, setSelectedModel] = useState<ModelType>('gemini-3-pro-preview');
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
  const [codeHistory, setCodeHistory] = useState<{code: string, prompt: string, timestamp: number, type?: 'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback' | 'backend_config'}[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [lastOperationType, setLastOperationType] = useState<'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback' | 'backend_config'>('init');

  // State: Point-and-Click Edit
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{tagName: string, className: string, innerText: string, path: string, parentTagName?: string, parentClassName?: string, imageSrc?: string, backgroundImage?: string} | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRequest, setEditRequest] = useState('');
  const [editIntent, setEditIntent] = useState<'auto' | 'style' | 'content' | 'logic'>('auto');
  const [hasSeenEditGuide, setHasSeenEditGuide] = useState(false);
  
  // State: Quick Edit (direct color/text/image modification without AI)
  const [quickEditMode, setQuickEditMode] = useState<'none' | 'color' | 'text' | 'image'>('none');
  const [quickEditColor, setQuickEditColor] = useState('#3b82f6');
  const [quickEditText, setQuickEditText] = useState('');
  const [quickEditColorType, setQuickEditColorType] = useState<'bg' | 'text' | 'border' | 'all'>('all');
  const [availableColorTypes, setAvailableColorTypes] = useState<('bg' | 'text' | 'border')[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [quickEditImageUrl, setQuickEditImageUrl] = useState('');
  const [imageQuota, setImageQuota] = useState<{ quotaBytes: number; usedBytes: number; remainingBytes: number } | null>(null);
  const [userUploadedImages, setUserUploadedImages] = useState<Array<{ path: string; publicUrl: string; bytes: number; createdAt: string | null }> | null>(null);
  const [isLoadingUserUploadedImages, setIsLoadingUserUploadedImages] = useState(false);
  
  // State: AI Image Generation
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [generatedAiImage, setGeneratedAiImage] = useState<string | null>(null); // base64 data URL
  
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

  // Construct a unique draft ID
  // Format: draft_{userId}_{sessionId} or draft_guest_{sessionId}
  // We use underscore separator to align with the backend parsing logic
  const sessionDraftId = userId 
    ? `draft_${userId}_${sessionId}` 
    : `draft_guest_${sessionId}`;
  
  // State: Preview Scaling
  const [previewScale, setPreviewScale] = useState(0.65); // 🔧 Default to a reasonable mobile scale
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
  
  // State: Prototype Image (两阶段生成)
  const [isGeneratingPrototype, setIsGeneratingPrototype] = useState(false);
  const [prototypeImageUrl, setPrototypeImageUrl] = useState<string | null>(null);
  
  // State: Draft
  const [draftId, setDraftId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null); // Add user state for saving draft
  const [isSaving, setIsSaving] = useState(false);
  const [isConfiguringBackend, setIsConfiguringBackend] = useState(false); // New state for backend config flow

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
  const [fullCodeMode, setFullCodeMode] = useState(false); // 🆕 全量修改模式开关
  
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
  const taskVisibilityHandlerRef = useRef<(() => void) | null>(null); // 🚀 任务可见性监听器
  
  // 🚀 Refs for visibility change handler (to avoid stale closure)
  const currentTaskIdRef = useRef<string | null>(null);
  const isGeneratingRef = useRef(false);
  
  // Keep refs in sync with state
  useEffect(() => {
    currentTaskIdRef.current = currentTaskId;
  }, [currentTaskId]);
  
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

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

  // Effect: Calculate Preview Scale - using ResizeObserver for immediate response
  useEffect(() => {
    if (step !== 'preview') return;

    const updateScale = () => {
      if (!previewContainerRef.current || previewMode === 'desktop') {
        setPreviewScale(1);
        return;
      }

      const container = previewContainerRef.current;
      const { width: containerW, height: containerH } = container.getBoundingClientRect();
      
      // 🔧 Safety check: Skip calculation if container dimensions are invalid
      if (containerW < 100 || containerH < 100) {
        return; // Keep previous scale value
      }
      
      // Target dimensions based on mode
      const targetW = previewMode === 'mobile' ? 375 : 768;
      const targetH = previewMode === 'mobile' ? 812 : 1024;
      
      // Available space (subtract padding and toolbar space)
      const availableW = containerW - 40;
      const availableH = containerH - 180; // Increased for bottom toolbar 

      const scaleW = availableW / targetW;
      const scaleH = availableH / targetH;
      
      // 🔧 Ensure scale is positive and within reasonable bounds (0.3 to 1)
      const rawScale = Math.min(scaleW, scaleH, 1);
      const newScale = Math.max(0.3, Math.min(rawScale, 1));
      
      // 🔧 Only update if the new scale is valid
      if (isFinite(newScale) && newScale > 0) {
        setPreviewScale(newScale);
      }
    };

    // 🔧 Use ResizeObserver for immediate response to container size changes
    let resizeObserver: ResizeObserver | null = null;
    if (previewContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateScale();
      });
      resizeObserver.observe(previewContainerRef.current);
    }

    window.addEventListener('resize', updateScale);
    updateScale();

    return () => {
      window.removeEventListener('resize', updateScale);
      resizeObserver?.disconnect();
    };
  }, [step, previewMode, isFullscreen]);

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
      
      // Handle request for user ID from iframe (for backend API calls)
      if (event.data && event.data.type === 'spark-request-user-id') {
        if (iframeRef.current?.contentWindow && userId) {
          iframeRef.current.contentWindow.postMessage({
            type: 'spark-user-id-response',
            userId: userId,
            appId: sessionDraftId, // 使用完整的 sessionDraftId（包含 session 后缀）
            apiBase: window.location.origin // 传递正确的 API 基地址
          }, '*');
        }
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
        const isBlankScreen = errorData?.type === 'blank-screen';
        const shouldAutoFix = event.data.autoFix === true;
        
        // 🆕 提取详细错误信息
        let errorMessage = typeof errorData === 'string' ? errorData : errorData.message;
        let detailedErrors: string[] = [];
        
        // 如果有收集到的错误列表，提取详细信息
        if (errorData?.collectedErrors && Array.isArray(errorData.collectedErrors)) {
          detailedErrors = errorData.collectedErrors.map((e: any) => {
            let msg = e.message || '';
            if (e.line) msg += ` (Line ${e.line})`;
            if (e.source) msg += ` [${e.source}]`;
            return msg;
          }).filter(Boolean);
          
          // 如果有详细错误，构建更好的错误消息
          if (detailedErrors.length > 0) {
            errorMessage = language === 'zh' 
              ? `应用渲染失败。控制台错误:\n${detailedErrors.slice(0, 3).join('\n')}`
              : `App failed to render. Console errors:\n${detailedErrors.slice(0, 3).join('\n')}`;
          } else if (isBlankScreen) {
            // 没有捕获到错误但检测到白屏，提示用户这可能是语法错误
            errorMessage = language === 'zh'
              ? '应用渲染失败 - 检测到白屏（未捕获到运行时错误，可能是语法错误）。点击下方按钮让 AI 分析代码。'
              : 'App failed to render - blank screen detected (no runtime errors captured, possibly a syntax error). Click button below to let AI analyze.';
          }
        } else if (isBlankScreen && !errorMessage.includes('Errors:')) {
          // 空白屏幕但没有 collectedErrors 数组
          errorMessage = language === 'zh'
            ? '应用渲染失败 - 检测到白屏（未捕获到运行时错误，可能是语法错误）。点击下方按钮让 AI 分析代码。'
            : 'App failed to render - blank screen detected (no runtime errors captured, possibly a syntax error). Click button below to let AI analyze.';
        }
        
        console.warn('Runtime Error Caught:', errorMessage, isBlankScreen ? '(blank screen)' : '', detailedErrors);
        
        setRuntimeError(errorMessage);

        // Add to chat history if it's a new error (debounce)
        setChatHistory(prev => {
            const lastMsg = prev[prev.length - 1];
            // Avoid duplicate error messages in a row
            // Check both exact match and if it's already a blank screen error
            if (lastMsg && lastMsg.type === 'error') {
                if (lastMsg.content === errorMessage || (lastMsg.isBlankScreen && isBlankScreen)) {
                    return prev;
                }
            }
            return [...prev, { 
                role: 'ai', 
                content: errorMessage, 
                type: 'error',
                errorDetails: { ...errorData, detailedErrors },
                isBlankScreen,
                canAutoFix: shouldAutoFix || isBlankScreen  // Blank screen errors can be auto-fixed
            }];
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEditMode, userId, sessionDraftId]);

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

  // 🆕 Effect: 父窗口级别白屏检测 (当代码更新后主动检测 iframe 内容)
  useEffect(() => {
    if (!generatedCode || !iframeRef.current || isGenerating) return;
    
    // 延迟检测，给 iframe 足够的渲染时间
    const checkTimer = setTimeout(() => {
      try {
        const iframe = iframeRef.current;
        if (!iframe) return;
        
        // 尝试访问 iframe 内容
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          console.warn('[BlankScreen] Cannot access iframe document');
          return;
        }
        
        // 检查是否有可见内容
        const body = iframeDoc.body;
        const root = iframeDoc.getElementById('root');
        
        // 计算实际可见内容
        const hasVisibleContent = (() => {
          // 检查 body 是否有子元素
          if (!body || body.children.length === 0) return false;
          
          // 检查 root 元素
          if (root) {
            // 如果 root 存在但为空
            if (root.innerHTML.trim() === '' || root.children.length === 0) {
              return false;
            }
          }
          
          // 检查 body 的实际文本内容长度
          const textContent = body.innerText?.trim() || '';
          if (textContent.length < 10) {
            // 内容太少，可能是白屏
            return false;
          }
          
          return true;
        })();
        
        // 检查是否有 console 错误
        const consoleErrors: any[] = [];
        
        // 如果检测到白屏且没有收到 postMessage 错误
        if (!hasVisibleContent && !runtimeError) {
          console.warn('[BlankScreen] Parent-level blank screen detection triggered');
          
          // 尝试获取 iframe 的控制台错误
          try {
            // 检查是否有全局错误变量
            const iframeWindow = iframe.contentWindow as any;
            if (iframeWindow && iframeWindow.__sparkErrors) {
              consoleErrors.push(...iframeWindow.__sparkErrors);
            }
          } catch (e) {
            // 跨域限制，忽略
          }
          
          const errorMessage = consoleErrors.length > 0 
            ? (typeof consoleErrors[0] === 'object' ? consoleErrors[0].message : String(consoleErrors[0]))
            : (language === 'zh' ? '应用渲染失败 - 检测到白屏，可能存在语法错误。点击下方按钮让 AI 分析代码。' : 'App failed to render - blank screen detected, possibly a syntax error. Click the button below to let AI analyze the code.');
          
          // 添加到聊天历史
          setChatHistory(prev => {
            // 检查最近的消息是否已经是错误消息（避免重复）
            // 检查所有最近的错误消息，不仅仅是最后一条
            const recentErrors = prev.slice(-3).filter(msg => msg.type === 'error');
            if (recentErrors.some(msg => msg.isBlankScreen || msg.content.includes('白屏') || msg.content.includes('blank screen'))) {
              return prev;
            }
            return [...prev, {
              role: 'ai',
              content: errorMessage,
              type: 'error',
              isBlankScreen: true,
              canAutoFix: true
            }];
          });
          
          setRuntimeError(errorMessage);
        }
      } catch (e) {
        // 跨域错误或其他问题，静默处理
        console.warn('[BlankScreen] Detection error:', e);
      }
    }, 3000); // 3秒延迟，给 React 足够的渲染时间
    
    return () => clearTimeout(checkTimer);
  }, [generatedCode, isGenerating, language, runtimeError]);

  useEffect(() => {
    const draftIdParam = searchParams.get('draftId');
    const editIdParam = searchParams.get('editId'); // 编辑已发布作品
    
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
    
    // 编辑已发布作品
    if (editIdParam) {
      const fetchPublishedItem = async () => {
        const { data, error } = await supabase
          .from('items')
          .select('id, title, description, content, prompt')
          .eq('id', editIdParam)
          .single();
          
        if (data && data.content) {
          setGeneratedCode(data.content);
          setStreamingCode(data.content);
          setStep('preview');
          setWizardData(prev => ({ 
            ...prev, 
            description: data.description || data.title || '' 
          }));
          if (data.prompt) {
            setCurrentGenerationPrompt(data.prompt);
          }
          
          // 初始化代码历史
          setCodeHistory([{
            code: data.content,
            prompt: data.prompt || '',
            timestamp: Date.now(),
            type: 'upload'
          }]);
          
          setTimeout(() => toastSuccess(language === 'zh' ? '已加载作品，可以继续编辑' : 'Work loaded, you can continue editing'), 500);
        }
      };
      fetchPublishedItem();
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
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('Tab became visible, checking session...');
        checkAndRefreshSession();
        checkAuth(); // Also re-check credits and profile
        // 🚀 任务状态检查已移至 subscribeToTask 内部的专用监听器
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
    openConfirmModal({
      title: language === 'zh' ? '确认退出' : 'Confirm Exit',
      message: t.create.confirm_exit,
      confirmText: language === 'zh' ? '退出' : 'Exit',
      onConfirm: () => {
        localStorage.removeItem(STORAGE_KEY);
        router.push('/');
      }
    });
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
    
    // 🚀 移除任务可见性监听器
    if (taskVisibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', taskVisibilityHandlerRef.current);
        taskVisibilityHandlerRef.current = null;
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
      // Reset timeout timer for another 45 seconds (shorter interval after user chose to wait)
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = setTimeout(() => {
          // Only show again if we are still generating and still haven't received code
          if (isGenerating && !streamingCode) {
              setShowTimeoutModal(true);
          }
      }, 45000);
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

      const executeOptimization = async () => {
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

        try {
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

      openConfirmModal({
        title: language === 'zh' ? '优化提示词' : 'Optimize Prompt',
        message: confirmMsg,
        confirmText: language === 'zh' ? '继续' : 'Continue',
        onConfirm: executeOptimization
      });

    } catch (error: any) {
      console.error('Prompt optimization setup failed:', error);
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
    const categoryPrompt = CATEGORY_PROMPTS[wizardData.category] || '';
    
    // Compact description
    let description = `Type:${categoryLabel}, Device:${deviceLabel}, Style:${styleLabel}. 
    
    ${categoryPrompt}
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

  // 🆕 清除应用缓存（保留系统关键 Key）
  const clearAppCache = () => {
    if (iframeRef.current?.contentWindow) {
      try {
        const win = iframeRef.current.contentWindow;
        // 1. 清除 LocalStorage (保留系统关键 Key)
        const keysToRemove: string[] = [];
        for (let i = 0; i < win.localStorage.length; i++) {
          const key = win.localStorage.key(i);
          // 保护 Supabase Auth 和 i18n
          if (key && !key.startsWith('sb-') && key !== 'i18nextLng') {
             keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => win.localStorage.removeItem(k));
        
        // 2. 清除 SessionStorage
        win.sessionStorage.clear();
        console.log('[App] Cache cleared successfully');
      } catch (e) {
        console.error('Cache clear failed:', e);
      }
    }
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

      // Set Timeout Timer (60 seconds) - 配合后端 DeepSeek 45s + Gemini Fallback 15s
      timeoutTimerRef.current = setTimeout(() => {
          // Only show timeout if we haven't received ANY code yet
          if (!hasStartedStreaming) {
              setShowTimeoutModal(true);
          }
      }, 60000);

      // Add a "slow connection" hint after 8 seconds
      const slowConnectionTimer = setTimeout(() => {
          if (!hasStartedStreaming) {
               setLoadingText(language === 'zh' ? '正在唤醒 AI 引擎 (冷启动可能需要 10-20 秒)...' : 'Waking up AI engine (Cold start may take 10-20s)...');
          }
      }, 8000);

      const handleTaskUpdate = async (newTask: any) => {
        if (isFinished) return;
        
        // 🔧 FIX: Set isFinished immediately for 'completed' status to prevent race conditions
        // This prevents duplicate processing when both broadcast and postgres_changes fire
        if (newTask.status === 'completed' || newTask.status === 'failed') {
            if (isFinished) return; // Double check after potential async gap
            isFinished = true;
            console.log('[handleTaskUpdate] 🎯 Task status:', newTask.status, '- marked as finished');
        }
        
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
            
            // 🆕 Extract Analysis - 显示为需求分析步骤 (支持多种格式，包括中英文冒号)
            const analysisMatch = content.match(/(?:\/\/\/\s*)?ANALYSIS[:：\s]+([\s\S]*?)(?=(?:\/\/\/\s*)?SUMMARY|$)/i);
            if (analysisMatch) {
                const analysisText = analysisMatch[1].trim();
                content = content.replace(analysisMatch[0], '');
                setLoadingText(language === 'zh' ? '需求分析中...' : 'Analyzing requirements...');
                
                // 更新工作流可视化 - 需求分析作为第一步
                setWorkflowDetails(prev => ({
                    ...prev,
                    currentStep: language === 'zh' ? '需求分析' : 'Requirement Analysis',
                    plan: analysisText // 将 ANALYSIS 内容作为计划显示
                }));
            }
            
            // 🆕 Extract Summary - 仅从内容中移除，不显示为步骤
            const summaryMatch = content.match(/(?:\/\/\/\s*)?SUMMARY[:：\s]+([\s\S]*?)(?:\/\/\/|$)/i);
            if (summaryMatch) {
                content = content.replace(summaryMatch[0], '');
                
                // 仅更新当前步骤状态，不添加 summary 到 completedSteps
                setWorkflowDetails(prev => ({
                    ...prev,
                    currentStep: language === 'zh' ? '正在编写代码' : 'Writing code'
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
                    completedSteps: [...(prev.completedSteps || []), ...completedSteps.filter(s => !(prev.completedSteps || []).includes(s))],
                    stepsCompleted: stepMatches.length,
                    totalSteps: Math.max(stepMatches.length + 1, prev.totalSteps || 0) // 估计总步骤
                }));
            }

            // 🆕 过滤掉 AST_REPLACE 标记，避免在 UI 中显示
            content = content.replace(/<<<<?(?:AST_REPLACE|SEARCH|REPLACE)[^>]*>>>?>?/g, '');
            content = content.replace(/>>>?>?\s*$/g, ''); // 清理末尾的 >>> 或 >>>>

            setStreamingCode(content);
            
            // 🆕 更新工作流可视化 - 流式代码（过滤后的）
            setWorkflowDetails(prev => ({
                ...prev,
                streamingCode: content
            }));
            
            if (!hasStartedStreaming) {
                setGenerationPhase('generating');
                setWorkflowStage('generating'); // 🆕 强制进入生成阶段，防止状态不同步
            }
            hasStartedStreaming = true;
        }
        
        if (newTask.status === 'completed') {
            // isFinished already set at the beginning of handleTaskUpdate for race condition prevention
            
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
            // 🚀 移除任务可见性监听器
            if (taskVisibilityHandlerRef.current) {
                document.removeEventListener('visibilitychange', taskVisibilityHandlerRef.current);
                taskVisibilityHandlerRef.current = null;
            }
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

                // SAFETY FIX: Use CORS proxy for CoinGecko API
                c = c.replace(/https:\/\/api\.coingecko\.com\/api\/v3/g, 'https://corsproxy.io/?https://api.coingecko.com/api/v3');
                
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
                    let summary = summaryMatch ? summaryMatch[1].trim() : null;
                    
                    // 🆕 Clean summary: remove any code blocks, SEARCH/REPLACE markers, etc.
                    if (summary) {
                        // Remove SEARCH/REPLACE blocks
                        summary = summary.replace(/<<<<\s*(?:SEARCH|AST_REPLACE)[^>]*>?[\s\S]*?(?:>>>>|$)/g, '');
                        // Remove code block markers
                        summary = summary.replace(/```[\s\S]*?```/g, '');
                        // Remove any remaining technical markers
                        summary = summary.replace(/====+/g, '');
                        summary = summary.replace(/>>>>+/g, '');
                        summary = summary.replace(/<<<<+/g, '');
                        // Clean up excessive whitespace
                        summary = summary.replace(/\n{3,}/g, '\n\n').trim();
                        // If summary is now empty or too short, set to null
                        if (summary.length < 5) {
                            summary = null;
                        }
                    }

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
                    // 现在使用 Self-Repair 系统：失败时自动分析并尝试快速修复
                    let patched = '';
                    let patchStats = null;

                    // Dynamic import for heavy patch library and self-repair
                    const { applyPatchesWithDetails } = await import('@/lib/patch');
                    const { tryQuickFix, analyzePatchFailure } = await import('@/lib/self-repair');

                    try {
                        const result = applyPatchesWithDetails(generatedCode, rawCode, relaxedMode, targets);
                        patched = result.code;
                        patchStats = result.stats;

                        // Check if ALL patches failed (Total Failure)
                        if (patchStats.total > 0 && patchStats.success === 0) {
                            // 🔄 Self-Repair Step 1: 尝试快速修复（不调用 LLM）
                            console.log('[SelfRepair] Attempting quick fix...');
                            const quickFixResult = tryQuickFix(generatedCode, rawCode);
                            
                            if (quickFixResult && quickFixResult.stats.success > 0) {
                                console.log('[SelfRepair] ✅ Quick fix succeeded!');
                                patched = quickFixResult.code;
                                patchStats = quickFixResult.stats;
                            } else {
                                // 分析失败原因用于日志
                                const analysis = analyzePatchFailure(generatedCode, rawCode, patchStats);
                                console.warn('[SelfRepair] Quick fix failed. Failure analysis:', analysis);
                                throw new Error(patchStats.failures[0] || 'All patches failed');
                            }
                        }
                    } catch (patchError: any) {
                        console.warn('Standard patch failed, retrying with relaxed mode...', patchError.message);
                        // 如果第一次不是 relaxedMode，则尝试开启 relaxedMode
                        if (!relaxedMode) {
                            try {
                                const result = applyPatchesWithDetails(generatedCode, rawCode, true, targets);
                                patched = result.code;
                                patchStats = result.stats;
                                
                                if (patchStats.total > 0 && patchStats.success === 0) {
                                     throw new Error(patchStats.failures[0] || 'All patches failed');
                                }
                                console.log('Relaxed patch succeeded!');
                            } catch (retryError) {
                                throw patchError; // 如果重试也失败，抛出原始错误
                            }
                        } else {
                            throw patchError;
                        }
                    }
                    
                    // 🆕 Handle Partial Success Warning
                    if (patchStats && patchStats.failed > 0 && patchStats.success > 0) {
                        const msg = language === 'zh' 
                            ? `⚠️ 部分应用：${patchStats.success} 处成功，${patchStats.failed} 处失败。`
                            : `⚠️ Partial Success: ${patchStats.success} applied, ${patchStats.failed} failed.`;
                        
                        // Use a delayed toast to ensure it's visible after success toast
                        setTimeout(() => {
                            // Using standard toast but with warning prefix
                            toastSuccess(msg); 
                        }, 500);
                        
                        console.warn('[Patch Warning]', msg, patchStats.failures);
                    }
                    
                    // Safety check: Ensure patched code is not empty
                    if (!patched || patched.trim().length === 0) {
                        console.error('Patched code is empty! Reverting to original.');
                        throw new Error(language === 'zh' ? '生成的代码为空，已取消修改' : 'Generated code is empty, modification cancelled');
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
                                 let finalContent = summary || (language === 'zh' ? '已根据您的要求更新了代码。' : 'Updated the code based on your request.');
                                 
                                 if (lastOperationType === 'backend_config') {
                                     finalContent = language === 'zh' ? '表单收集配置已完成。' : 'Form collection configuration complete.';
                                 }

                                 setChatHistory(prev => [...prev, { role: 'ai', content: finalContent, cost: currentTaskCostRef.current || undefined }]);
                                 
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
                             // 补丁格式存在但无法应用
                             // 尝试提取 REPLACE 块作为完整代码回退
                             console.log('[Debug] Attempting to extract REPLACE blocks as fallback...');
                             
                             // 提取所有 REPLACE 块
                             const replaceMatches = rawCode.match(/>>>>REPLACE([\s\S]*?)(?=<<<<SEARCH|$)/g);
                             if (replaceMatches && replaceMatches.length > 0) {
                                 // 找最大的 REPLACE 块（可能是完整代码）
                                 let largestReplace = '';
                                 for (const rm of replaceMatches) {
                                     const content = rm.replace(/>>>>REPLACE\s*/, '').trim();
                                     if (content.length > largestReplace.length) {
                                         largestReplace = content;
                                     }
                                 }
                                 
                                 // 如果最大的 REPLACE 块看起来像是完整的 HTML 代码
                                 if (largestReplace.length > 500 && 
                                     (largestReplace.includes('<!DOCTYPE') || largestReplace.includes('<html') || largestReplace.includes('<head'))) {
                                     console.log('[Debug] Using largest REPLACE block as full replacement:', largestReplace.length, 'chars');
                                     const finalCode = cleanTheCode(largestReplace);

                                     // 🆕 Safety Check
                                     if (!finalCode || finalCode.trim().length === 0) {
                                         throw new Error(language === 'zh' ? '修改后的代码为空' : 'Patched code is empty');
                                     }

                                     setGeneratedCode(finalCode);
                                     resetQuickEditHistory();
                                     // 🆕 Clear app cache to ensure clean state
                                     clearAppCache();
                                     // 🆕 Reset runtime error state to prevent false positives
                                     setRuntimeError(null);
                                     toastSuccess(t.create.success_edit);
                                     
                                     let finalContent = summary || (language === 'zh' ? '已根据您的要求更新了代码。' : 'Updated the code based on your request.');
                                     if (lastOperationType === 'backend_config') {
                                         finalContent = language === 'zh' ? '表单收集配置已完成。' : 'Form collection configuration complete.';
                                     }
                                     setChatHistory(prev => [...prev, { role: 'ai', content: finalContent, cost: currentTaskCostRef.current || undefined }]);
                                     setIsGenerating(false);
                                     setWorkflowStage('completed');
                                     setCurrentTaskId(null);
                                     currentTaskReasoningRef.current = null;
                                     return;
                                 }
                             }
                             
                             throw new Error(language === 'zh' ? '找到修改块但无法应用（上下文不匹配），请重试或尝试简化修改请求' : 'Found modification blocks but could not apply them (context mismatch), please retry or simplify your request');
                        }
                    }

                    // Clean the RESULT of the patch
                    const finalCode = cleanTheCode(patched);

                    // 🆕 Safety Check
                    if (!finalCode || finalCode.trim().length === 0) {
                        throw new Error(language === 'zh' ? '修改后的代码为空' : 'Patched code is empty');
                    }

                    // 🆕 Critical Bug Fix: Prevent truncation to garbage strings
                    if (finalCode.length < 100 && generatedCode.length > 500) {
                         console.error('[Critical] Patched code is suspiciously short:', finalCode);
                         throw new Error(language === 'zh' ? '修改后的代码异常短，已自动拦截错误' : 'Patched code is suspiciously short, modification cancelled');
                    }

                    setGeneratedCode(finalCode);
                    // Clear quick edit history when AI generates new content
                    resetQuickEditHistory();
                    // 🆕 Clear app cache to ensure clean state
                    clearAppCache();
                    // 🆕 Reset runtime error state to prevent false positives
                    setRuntimeError(null);
                    toastSuccess(t.create.success_edit);
                    
                    let finalContent = summary || (language === 'zh' ? '已根据您的要求更新了代码。' : 'Updated the code based on your request.');
                    
                    // Special handling for backend config to keep it simple
                    if (lastOperationType === 'backend_config') {
                        finalContent = language === 'zh' ? '表单收集配置已完成。' : 'Form collection configuration complete.';
                    }

                    // 最终结论消息不包含思考过程
                    setChatHistory(prev => [...prev, { role: 'ai', content: finalContent, cost: currentTaskCostRef.current || undefined }]);
                    currentTaskReasoningRef.current = null;
                    
                    // 🆕 FIX: 确保在 Diff Mode 成功后重置状态
                    console.log('[DiffMode] ✅ Patch successful, resetting states...');
                    setIsGenerating(false);
                    setWorkflowStage('completed');
                    setCurrentTaskId(null);
                    console.log('[DiffMode] ✅ States reset complete');
                    return; // 🔧 Critical: Exit early to prevent duplicate state updates
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
                            console.log('Free model used, no refund needed.');
                        }
                    };

                    // 🆕 Special handling for backend config failure
                    if (lastOperationType === 'backend_config') {
                        const errorMsg = language === 'zh'
                            ? '未找到可配置的表单入口。请确保您的应用中包含标准的 提交表单按钮，然后重试。'
                            : 'No configurable form entry found. Please ensure your app contains a standard HTML form structure (<form>) and try again.';
                        
                        // Refund automatically
                        await processRefund();
                        
                        openConfirmModal({
                            title: language === 'zh' ? '配置失败' : 'Configuration Failed',
                            message: errorMsg,
                            confirmText: language === 'zh' ? '知道了' : 'Got it',
                            cancelText: null, // Hide cancel button
                            onConfirm: () => {}
                        });
                        
                        setIsGenerating(false);
                        setWorkflowStage('error');
                        setCurrentTaskId(null);
                        currentTaskReasoningRef.current = null;
                        return;
                    }

                    const confirmMessage = language === 'zh' 
                        ? `智能修改遇到困难。是否尝试全量修复？\n\n注意：全量修复将消耗更多积分。\n${cost > 0 ? `本次修改消耗的 ${cost} 积分将自动退回。` : ''}`
                        : `Smart edit encountered difficulties. Do you want to try a full repair?\n\nNote: Full repair will consume more credits.\n${cost > 0 ? `The ${cost} credits consumed for this edit will be automatically refunded.` : ''}`;
                    
                    openConfirmModal({
                      title: language === 'zh' ? '尝试全量修复' : 'Try Full Repair',
                      message: confirmMessage,
                      confirmText: language === 'zh' ? '修复' : 'Repair',
                      onConfirm: async () => {
                        // Refund first
                        await processRefund();

                        toastSuccess(language === 'zh' ? '正在尝试全量修复...' : 'Attempting full repair...');
                        // Retry with forceFull=true after a short delay to allow current task cleanup
                        setTimeout(() => {
                            startGeneration(true, currentGenerationPrompt, '', true, lastOperationType === 'init' ? 'regenerate' : lastOperationType);
                        }, 100);
                      },
                      onCancel: async () => {
                        // User cancelled - Refund logic
                        await processRefund();

                        toastError(language === 'zh' ? '修改失败，请重试或尝试手动修改。' : 'Edit failed, please retry or try manual edit.');
                        setIsGenerating(false);
                      }
                    });
                }
            } else {
                // Full Generation Mode
                try {
                // 🆕 Safety Check: Ensure rawCode is not empty
                if (!rawCode || rawCode.trim().length === 0) {
                     throw new Error(language === 'zh' ? 'AI 返回了空内容，请检查网络或重试' : 'AI returned empty content, please check network or retry');
                }

                let cleanCode = cleanTheCode(rawCode);
                
                // 🆕 Extract and remove PLAN if present
                const planMatch = cleanCode.match(/\/\/\/\s*PLAN\s*\/\/\/([\s\S]*?)\/\/\//);
                if (planMatch) {
                    const planContent = planMatch[1].trim();
                    if (planContent && !extractedPlan) {
                        setAiPlan(planContent);
                    }
                    cleanCode = cleanCode.replace(planMatch[0], '').trim();
                }
                
                // 🆕 Extract and remove ANALYSIS if present
                const analysisMatch = cleanCode.match(/\/\/\/\s*ANALYSIS:\s*([\s\S]*?)(?:\/\/\/|$)/);
                if (analysisMatch) {
                    console.log('[Full Mode] AI Analysis:', analysisMatch[1].trim());
                    cleanCode = cleanCode.replace(analysisMatch[0], '').trim();
                }
                
                // Extract Summary if present (for full rewrite modification)
                const summaryMatch = cleanCode.match(/\/\/\/\s*SUMMARY:\s*([\s\S]*?)(?:\s*\/\/\/|$)/);
                let summary = summaryMatch ? summaryMatch[1].trim() : null;
                
                // 🆕 Clean summary: remove any code blocks, SEARCH/REPLACE markers, etc.
                if (summary) {
                    // Remove SEARCH/REPLACE blocks
                    summary = summary.replace(/<<<<\s*(?:SEARCH|AST_REPLACE)[^>]*>?[\s\S]*?(?:>>>>|$)/g, '');
                    // Remove code block markers
                    summary = summary.replace(/```[\s\S]*?```/g, '');
                    // Remove any remaining technical markers
                    summary = summary.replace(/====+/g, '');
                    summary = summary.replace(/>>>>+/g, '');
                    summary = summary.replace(/<<<<+/g, '');
                    // Clean up excessive whitespace
                    summary = summary.replace(/\n{3,}/g, '\n\n').trim();
                    // If summary is now empty or too short, set to null
                    if (summary.length < 5) {
                        summary = null;
                    }
                }
                
                // Remove summary from code
                if (summaryMatch) {
                    cleanCode = cleanCode.replace(summaryMatch[0], '').trim();
                }
                
                // 🆕 Remove any remaining /// markers (STEP, etc.)
                cleanCode = cleanCode.replace(/\/\/\/\s*STEP:\s*.*?\s*\/\/\//g, '');
                cleanCode = cleanCode.replace(/\/\/\/[^/]*\/\/\//g, ''); // Generic /// ... /// patterns
                
                // 🆕 Remove any SEARCH/REPLACE blocks that AI might have incorrectly included
                cleanCode = cleanCode.replace(/<<<<\s*SEARCH[\s\S]*?>>>>/g, '');

                cleanCode = cleanCode.replace(/```html/g, '').replace(/```tsx?/g, '').replace(/```jsx?/g, '').replace(/```javascript/g, '').replace(/```/g, '');

                // 🆕 Safety Check: Ensure code is not empty after cleaning
                if (cleanCode.trim().length === 0) {
                     if (summary) {
                         console.log('AI returned summary but no code. Treating as message.');
                         setChatHistory(prev => [...prev, { role: 'ai', content: summary!, cost: currentTaskCostRef.current || undefined }]);
                         setIsGenerating(false);
                         setWorkflowStage('completed');
                         setCurrentTaskId(null);
                         return;
                     }
                     throw new Error(language === 'zh' ? 'AI 生成的代码为空' : 'AI generated empty code');
                }

                if (!cleanCode.includes('<meta name="viewport"')) {
                    cleanCode = cleanCode.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />');
                }

                setStreamingCode(cleanCode);
                setGeneratedCode(cleanCode);
                // Clear quick edit history when AI generates new content
                resetQuickEditHistory();
                
                if (isModification) {
                    toastSuccess(t.create.success_edit);
                    let finalContent = summary || (language === 'zh' ? '已重新生成完整代码。' : 'Regenerated full code.');
                    
                    if (lastOperationType === 'backend_config') {
                        finalContent = language === 'zh' ? '后端配置已完成。' : 'Backend configuration complete.';
                    }

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
                } catch (e: any) {
                    console.error('Full generation failed:', e);
                    toastError(e.message || (language === 'zh' ? '生成失败' : 'Generation failed'));
                }
            }
            
            setIsGenerating(false);
            setWorkflowStage('completed'); // 🆕 完成工作流
            setCurrentTaskId(null); // Clear task ID
        } else if (newTask.status === 'failed') {
            // isFinished already set at the beginning of handleTaskUpdate for race condition prevention
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
                 
                 // Extract Plan (Support Streaming)
                 // 1. Try to match complete plan block first
                 const planMatch = content.match(/\/\/\/ PLAN \/\/\/([\s\S]*?)\/\/\//);
                 if (planMatch) {
                     const fullPlan = planMatch[1].trim();
                     setAiPlan(fullPlan);
                     content = content.replace(planMatch[0], '');
                     setLoadingText(language === 'zh' ? '正在分析需求并制定计划...' : 'Analyzing requirements and planning...');
                     
                     // 🆕 更新工作流可视化 - 计划
                     setWorkflowDetails(prev => ({
                         ...prev,
                         plan: fullPlan
                     }));
                 } else {
                     // 2. If no complete block, check for partial/streaming plan
                     const planStartMarker = '/// PLAN ///';
                     const planStartIndex = content.indexOf(planStartMarker);
                     if (planStartIndex !== -1) {
                         // We have the start, but not the end (strict regex failed)
                         const partialPlan = content.substring(planStartIndex + planStartMarker.length).trim();
                         if (partialPlan) {
                             setAiPlan(partialPlan);
                             setWorkflowDetails(prev => ({
                                 ...prev,
                                 plan: partialPlan
                             }));
                             setLoadingText(language === 'zh' ? '正在思考构建方案...' : 'Thinking about the plan...');
                         }
                         // Remove the partial plan from streaming code to avoid showing raw tags
                         content = content.substring(0, planStartIndex);
                     }
                 }
                 
                 // 🆕 Extract Analysis - 显示为需求分析步骤 (支持多种格式，包括中英文冒号)
                 const analysisMatch = content.match(/(?:\/\/\/\s*)?ANALYSIS[:：\s]+([\s\S]*?)(?=(?:\/\/\/\s*)?SUMMARY|$)/i);
                 if (analysisMatch) {
                     const analysisText = analysisMatch[1].trim();
                     content = content.replace(analysisMatch[0], '');
                     setLoadingText(language === 'zh' ? '需求分析中...' : 'Analyzing requirements...');
                     
                     // 更新工作流可视化 - 需求分析作为第一步
                     setWorkflowDetails(prev => ({
                         ...prev,
                         currentStep: language === 'zh' ? '需求分析' : 'Requirement Analysis',
                         plan: analysisText
                     }));
                 }
                 
                 // 🆕 Extract Summary - 仅从内容中移除，不显示为步骤
                 const summaryMatch = content.match(/(?:\/\/\/\s*)?SUMMARY[:：\s]+([\s\S]*?)(?:\/\/\/|$)/i);
                 if (summaryMatch) {
                     content = content.replace(summaryMatch[0], '');
                     
                     // 仅更新当前步骤状态，不添加 summary 到 completedSteps
                     setWorkflowDetails(prev => ({
                         ...prev,
                         currentStep: language === 'zh' ? '正在编写代码' : 'Writing code'
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
                         completedSteps: [...(prev.completedSteps || []), ...completedSteps.filter(s => !(prev.completedSteps || []).includes(s))],
                         stepsCompleted: stepMatches.length,
                         totalSteps: Math.max(stepMatches.length + 1, prev.totalSteps || 0)
                     }));
                 }

                 // 🆕 过滤掉 AST_REPLACE 标记，避免在 UI 中显示
                 content = content.replace(/<<<<?(?:AST_REPLACE|SEARCH|REPLACE)[^>]*>>>?>?/g, '');
                 content = content.replace(/>>>?>?\s*$/g, ''); // 清理末尾的 >>> 或 >>>>

                 setStreamingCode(content);
                 
                 // 🆕 更新工作流可视化 - 流式代码（过滤后的）
                 setWorkflowDetails(prev => ({
                     ...prev,
                     streamingCode: content
                 }));
                 
                 if (!hasStartedStreaming) {
                     setGenerationPhase('generating');
                     setWorkflowStage('generating'); // 🆕 强制进入生成阶段，防止状态不同步
                 }
                 hasStartedStreaming = true;
                 lastUpdateTimestamp = Date.now();
             }
          }
        )
        .on(
          'broadcast',
          { event: 'completed' },
          async (payload) => {
             const { cost, taskId: completedTaskId, fullContent } = payload.payload;
             if (cost !== undefined) {
                 console.log(`Task completed (broadcast). Cost: ${cost} credits`);
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
             
             // 🔧 FIX: Actively trigger handleTaskUpdate when completed broadcast is received
             // This ensures we don't rely solely on postgres_changes which can be delayed
             if (!isFinished) {
                 console.log('[Broadcast] Received completed event, fetching task data to trigger handleTaskUpdate...');
                 try {
                     const { data, error } = await supabase.from('generation_tasks').select('*').eq('id', taskId).single();
                     if (data && !error && data.status === 'completed') {
                         console.log('[Broadcast] Triggering handleTaskUpdate with completed task data');
                         handleTaskUpdate(data);
                     }
                 } catch (e) {
                     console.warn('[Broadcast] Failed to fetch task data:', e);
                 }
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
      
      // 🚀 立即轮询函数（页面可见时调用）
      const triggerImmediatePoll = async () => {
        if (isFinished || isPolling) return;
        isPolling = true;
        console.log('[ImmediatePoll] Tab became visible, checking task status...');
        try {
          const { data, error } = await supabase.from('generation_tasks').select('*').eq('id', taskId).single();
          if (data && !error) {
            console.log('[ImmediatePoll] Task status:', data.status);
            handleTaskUpdate(data);
          }
        } catch (e) {
          console.warn('[ImmediatePoll] Failed:', e);
        } finally {
          isPolling = false;
        }
      };
      
      // 🚀 监听页面可见性变化，立即触发轮询
      const visibilityHandler = () => {
        if (!document.hidden) {
          triggerImmediatePoll();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
      taskVisibilityHandlerRef.current = visibilityHandler; // 保存引用以便清理
      
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

  const startGeneration = async (isModificationArg = false, overridePrompt = '', displayPrompt = '', forceFull = false, explicitType?: 'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback' | 'backend_config') => {
    // Reset cost ref for new task
    currentTaskCostRef.current = null;
    currentTaskReasoningRef.current = null; // 🆕 重置 reasoning

    // Explicitly rely on the argument to determine if it's a modification or a new generation (regenerate)
    const isModification = isModificationArg;
    
    // 🆕 backend_config 强制使用 Diff 模式（全量模式会导致大文件 AI 崩溃）
    const isBackendConfig = explicitType === 'backend_config';
    const useDiffMode = isModification && !forceFull && (!fullCodeMode || isBackendConfig);
    
    if (isBackendConfig && fullCodeMode) {
        console.log('[BackendConfig] Force using Diff mode (ignoring fullCodeMode setting)');
    }
    
    // Determine operation type for the NEXT generation
    let nextOperationType: 'init' | 'upload' | 'chat' | 'click' | 'regenerate' | 'fix' | 'rollback' | 'backend_config' = 'init';
    
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

    // 1. 立即更新 UI：显示用户消息气泡 (Immediate UI Update)
    if (isModification) {
        setChatHistory(prev => [...prev, { role: 'user', content: displayPrompt || overridePrompt || chatInput }]);
        setChatInput('');
        setModificationCount(prev => prev + 1);
        
        // 2. 动画延迟：让用户气泡先"飞"一会儿 (Animation Delay)
        // 确保用户气泡弹出动画完成后，再显示 AI 思考气泡
        await new Promise(resolve => setTimeout(resolve, 600));
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
    // 全量修改模式由开关控制，不再由forceFull参数控制
    
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

      // Note: Chat history already updated above for modification


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

5. **🚨 NEVER Use Compressed Code as Anchors**:
   - ❌ FORBIDDEN: Using any line containing \`@semantic-compressed\`, \`/* compressed */\`, \`IRRELEVANT\`, or \`/* ... statements hidden */\`
   - ❌ FORBIDDEN: Referencing or modifying components marked as \`[IRRELEVANT - DO NOT USE AS ANCHOR]\`
   - ✅ REQUIRED: Only use lines from VISIBLE, UNCOMPRESSED code in your SEARCH blocks
   - If you need to modify a compressed component, STOP and ask the user to explicitly request it

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

      let response: Response;
      
      // Detect if this is the first edit on uploaded code (use helper)
      const isFirstEditOnUpload = isModification && isFirstEditOnUploadedCode();
      
      if (isFirstEditOnUpload) {
          console.log('[Create] First edit on uploaded code - will skip compression and use relaxed matching');
      }
      
      // 🆕 两阶段生成：已禁用原型图生成，直接使用代码生成
      // 原型图生成条件：1. 非修改模式 2. 非重新生成 3. 有描述文本
      let prototypeImage: string | null = null;
      const shouldGeneratePrototype = false && !isModification && 
                                       nextOperationType === 'init' && 
                                       wizardData.description && 
                                       wizardData.description.length > 10;
      
      console.log('[Prototype] Check conditions:', {
          isModification,
          nextOperationType,
          descriptionLength: wizardData.description?.length || 0,
          shouldGeneratePrototype
      });
      
      if (shouldGeneratePrototype) {
          try {
              setIsGeneratingPrototype(true);
              setLoadingText(language === 'zh' ? '正在生成原型设计图...' : 'Generating prototype design...');
              setWorkflowStage('analyzing');
              setWorkflowDetails({ reasoning: language === 'zh' ? '根据您的描述生成 UI 原型设计图...' : 'Generating UI prototype from your description...' });
              
              console.log('[Prototype] Generating prototype image via Edge Function...');
              
              // 获取用户 session 用于调用 Edge Function
              const { data: { session: protoSession } } = await supabase.auth.getSession();
              if (!protoSession) {
                  console.warn('[Prototype] No session, skipping prototype generation');
              } else {
                  // 通过 Edge Function 调用 Google API（Edge Function 有 GOOGLE_API_KEY）
                  const prototypeResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-prototype`, {
                      method: 'POST',
                      headers: { 
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${protoSession.access_token}`
                      },
                      body: JSON.stringify({
                          description: wizardData.description,
                          category: wizardData.category || 'tool',
                          device: wizardData.device || 'mobile',
                          style: wizardData.style,
                          language
                      }),
                      signal: abortControllerRef.current?.signal
                  });
                  
                  if (prototypeResponse.ok) {
                      const prototypeData = await prototypeResponse.json();
                      if (prototypeData.success && prototypeData.imageBase64) {
                          prototypeImage = prototypeData.imageBase64;
                          setPrototypeImageUrl(prototypeImage);
                          console.log('[Prototype] Successfully generated prototype image');
                      }
                  } else {
                      const errorText = await prototypeResponse.text();
                      console.warn('[Prototype] Failed to generate prototype:', errorText);
                  }
              }
          } catch (protoErr: any) {
              // 原型图生成失败不应阻断主流程
              console.warn('[Prototype] Error generating prototype:', protoErr.message);
          } finally {
              setIsGeneratingPrototype(false);
              setLoadingText(language === 'zh' ? '正在生成应用代码...' : 'Generating application code...');
          }
      }
      
      // 🆕 SSE 流式接收结果和思考过程
      let taskId = '';
      let ragContext = '';
      let codeContext = '';
      let compressedCode = '';
      let ragSummary = '';
      let targets: string[] = [];
      
      // 🆕 两阶段生成：有原型图时使用 Gemini 3 Pro 进行代码生成
      const effectiveModel = prototypeImage ? 'gemini-3-pro-preview' : selectedModel;
      const effectiveTokensPerCredit = MODEL_CONFIG[effectiveModel as ModelType]?.tokensPerCredit || MODEL_CONFIG[selectedModel].tokensPerCredit;
      
      console.log('Selected model:', selectedModel, prototypeImage ? `→ upgraded to ${effectiveModel}` : '');
      
      if (prototypeImage && effectiveModel !== selectedModel) {
          console.log(`[Prototype] Upgrading model from ${selectedModel} to ${effectiveModel} for image-guided generation`);
      }
      
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
                model: effectiveModel,
                tokens_per_credit: effectiveTokensPerCredit,
                skip_compression: fullCodeMode || forceFull || isBackendConfig, // 🆕 backend_config 也跳过压缩，确保 AI 看到完整表单代码
                operation_type: nextOperationType // 🆕 传递操作类型，用于后端特殊处理
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
                                            // 🆕 全量修改模式跳过压缩阶段，保持analyzing
                                            if (!fullCodeMode && !forceFull) {
                                                setWorkflowStage('compressing');
                                                if (event.data.compressionStats) {
                                                    setWorkflowDetails(prev => ({
                                                        ...prev,
                                                        compressionStats: event.data.compressionStats
                                                    }));
                                                }
                                            }
                                        } else if (event.data?.stage === 'rag') {
                                            // 🆕 全量修改模式跳过RAG阶段
                                            if (!fullCodeMode && !forceFull) {
                                                setWorkflowStage('compressing');
                                            }
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
      
      // 🆕 两阶段生成：如果有原型图，添加视觉参考指令
      if (prototypeImage && !isModification) {
          console.log('[Prototype] Adding visual reference instructions to System Prompt');
          const prototypeInstructions = language === 'zh' ? `

### 🎨 原型设计参考 (CRITICAL)
我已经提供了一张 UI 原型设计图。你必须:
1. **严格遵循**原型图中的布局结构、间距和组件排列
2. **匹配颜色**：使用图中相同或相近的颜色方案
3. **复制元素**：图中显示的所有 UI 元素（按钮、卡片、导航等）都必须在代码中实现
4. **保持比例**：组件大小和间距应该与原型图保持一致
5. **文字内容**：使用图中显示的文字，如果看不清可以用相似的占位符

⚠️ **关键约束 - 单文件架构**：
- **所有组件必须在同一个文件中定义**，不能引用外部组件
- 如果你需要 HeroSection、CardSection 等，必须在 App 组件上方直接定义它们
- 不允许使用 import 语句引入自定义组件
- 正确示例：const HeroSection = () => <div>...</div>; 然后在 App 中使用 <HeroSection />

图片是你的视觉蓝图，代码应该尽可能精确地还原它。` : `

### 🎨 Prototype Design Reference (CRITICAL)
I have provided a UI prototype design image. You MUST:
1. **Strictly follow** the layout structure, spacing, and component arrangement in the prototype
2. **Match colors**: Use the same or similar color scheme shown in the image
3. **Replicate elements**: All UI elements (buttons, cards, navigation, etc.) shown in the image must be implemented
4. **Maintain proportions**: Component sizes and spacing should match the prototype
5. **Text content**: Use the text shown in the image, or similar placeholders if unclear

⚠️ **CRITICAL CONSTRAINT - Single File Architecture**:
- **ALL components must be defined in the same file** - no external component references
- If you need HeroSection, CardSection, etc., define them directly above the App component
- Do NOT use import statements for custom components
- Correct: const HeroSection = () => <div>...</div>; then use <HeroSection /> in App

The image is your visual blueprint - the code should replicate it as precisely as possible.`;
          
          finalSystemPrompt += prototypeInstructions;
      }
      
      // 🆕 P0 Fix: 后端配置模式使用专用 System Prompt
      if (nextOperationType === 'backend_config') {
          console.log('[BackendConfig] Using dedicated backend configuration prompt');
          finalSystemPrompt = GET_BACKEND_CONFIG_PROMPT(language);
      }
      
      // Apply Smart Context Compression (跳过全量修复模式)
      // 全量修改模式下，不进行任何压缩
      const skipCompressionForThisRequest = fullCodeMode || forceFull;
      if (compressedCode && isModification && !skipCompressionForThisRequest) {
          console.log('Applying Smart Context Compression to User Prompt');
          // Replace the full code in finalUserPrompt with compressed code
          
          const safeCompressedCode = compressedCode.replace(/\u0000/g, '');
          const safeOriginalCode = generatedCode ? generatedCode.replace(/\u0000/g, '') : '';
          
          if (safeOriginalCode && finalUserPrompt.includes(safeOriginalCode)) {
              finalUserPrompt = finalUserPrompt.replace(safeOriginalCode, safeCompressedCode);
              
              // Add explicit warning about semantic compression with STRONGER constraints
              finalUserPrompt += `\n\n### ⚠️ CRITICAL: SEMANTIC COMPRESSION RULES
Some components are marked with \`@semantic-compressed\` and \`[IRRELEVANT - DO NOT USE AS ANCHOR]\`.

**🚨 ABSOLUTE RULES:**
1. **NEVER** use ANY line from compressed components in your \`<<<<SEARCH\` blocks
2. **NEVER** reference \`/* ... statements hidden */\` or \`@semantic-compressed\` markers
3. **NEVER** attempt to modify components marked as \`[IRRELEVANT]\`
4. **ONLY** modify the FULL, UNCOMPRESSED components shown in the code
5. If you MUST modify a compressed component, **STOP** and tell the user to explicitly request it

**WHY**: Compressed components exist ONLY for context. Their code signatures may differ from the actual source file, causing patch failures.

**FOCUS ON**: The fully-visible components that match the user's request.`;

              console.log('User Prompt compressed successfully.');
          } else {
              console.warn('Could not find original code in User Prompt to replace. Using full code.');
          }
      } else if (skipCompressionForThisRequest && isModification) {
          console.log('[Full Code Mode] Sending complete uncompressed code to AI');
      }

      // 🔧 隐式缓存优化：将 RAG/Code Context 移到 User Prompt 开头
      // 原因：System Prompt 必须保持完全稳定才能触发 Gemini 隐式缓存
      // Gemini 缓存基于"最长公共前缀"，如果 System Prompt 每次变化，缓存永远不会命中
      // 
      // 新结构：
      // - System Prompt: 固定不变 (~3000 tokens)
      // - User Prompt: [RAG Context] + [Code Context] + [现有代码] + [用户请求]
      
      let contextPrefix = '';
      
      if (ragContext) {
          console.log('[CacheOptimization] Moving RAG Context to User Prompt prefix');
          contextPrefix += `\n### Reference Documentation\n${ragContext}\n`;
      }
      
      // Inject Code RAG Context (Relevant Chunks)
      if (codeContext) {
          console.log('[CacheOptimization] Moving Code RAG Context to User Prompt prefix');
          contextPrefix += `\n### Relevant Code Snippets\n${codeContext}\n`;
      }
      
      // 将上下文前缀添加到 User Prompt 开头
      if (contextPrefix) {
          finalUserPrompt = contextPrefix + '\n---\n\n' + finalUserPrompt;
          console.log(`[CacheOptimization] Context prefix added (${contextPrefix.length} chars)`);
      }
      
      // 简单的字符串哈希函数，用于检测 System Prompt 变化
      const hashString = (str: string): string => {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
              const char = str.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
          }
          return Math.abs(hash).toString(16);
      };
      
      // 确保 System Prompt 保持不变（除了后端配置模式）
      console.log(`[CacheOptimization] System Prompt length: ${finalSystemPrompt.length} chars (should be stable across requests)`);
      console.log(`[CacheOptimization] System Prompt hash: ${hashString(finalSystemPrompt).slice(0, 8)}`);

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
                        tokens_per_credit: MODEL_CONFIG[selectedModel].tokensPerCredit,
                        // 🆕 传递原型图给 AI 作为视觉参考
                        image_url: prototypeImage || undefined
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
      
      // 获取编辑 ID - 可能是 edit 或 editId 参数
      const editId = searchParams.get('edit') || searchParams.get('editId');
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
    openConfirmModal({
      title: language === 'zh' ? '确认回滚' : 'Confirm Rollback',
      message: t.create.confirm_rollback,
      confirmText: language === 'zh' ? '回滚' : 'Rollback',
      onConfirm: () => {
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
      }
    });
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

  // Quick Edit: Detect if element can be quickly edited (color/text/image)
  // Now always allows color editing for any element
  const detectQuickEditType = (element: typeof selectedElement): 'color' | 'text' | 'both' | 'image' | 'none' => {
    if (!element) return 'none';
    
    // 🆕 Check if it's an image element
    if (element.tagName.toUpperCase() === 'IMG' && element.imageSrc) {
      return 'image';
    }
    
    // 🆕 Check if element has background image
    if (element.backgroundImage) {
      return 'image';
    }
    
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
      
      openConfirmModal({
        title: language === 'zh' ? '无法应用修改' : 'Cannot Apply Change',
        message: errorMsg,
        confirmText: language === 'zh' ? '知道了' : 'OK',
        cancelText: null,
        onConfirm: () => {}
      });
      return;
    }

    // 🆕 Safety Check: Ensure code is not empty
    if (!updatedCode || updatedCode.trim().length === 0) {
        console.error('Quick Edit resulted in empty code');
        toastError(language === 'zh' ? '修改导致代码为空，已取消' : 'Edit resulted in empty code, cancelled');
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
    setRuntimeError(null);
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
      
      openConfirmModal({
        title: language === 'zh' ? '无法应用修改' : 'Cannot Apply Change',
        message: errorMsg,
        confirmText: language === 'zh' ? '知道了' : 'OK',
        cancelText: null,
        onConfirm: () => {}
      });
      return;
    }
    
    // Verify the code actually changed
    if (updatedCode === generatedCode) {
      const errorMsg = language === 'zh' 
        ? `⚠️ 替换失败\n\n新文本可能与原文本相同，或替换未生效。\n\n建议：\n• 尝试使用 AI 修改功能`
        : `⚠️ Replacement failed\n\nNew text may be same as old, or replacement did not take effect.\n\nSuggestion:\n• Try using AI modification`;
      
      openConfirmModal({
        title: language === 'zh' ? '替换失败' : 'Replacement Failed',
        message: errorMsg,
        confirmText: language === 'zh' ? '知道了' : 'OK',
        cancelText: null,
        onConfirm: () => {}
      });
      return;
    }

    // 🆕 Safety Check: Ensure code is not empty
    if (!updatedCode || updatedCode.trim().length === 0) {
        console.error('Quick Edit resulted in empty code');
        toastError(language === 'zh' ? '修改导致代码为空，已取消' : 'Edit resulted in empty code, cancelled');
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
    setRuntimeError(null);
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

  // 🆕 Quick Edit: Apply image change directly to code
  const applyQuickImageEdit = async (newImageUrl: string) => {
    console.log('[applyQuickImageEdit] called with:', { 
      newImageUrl: newImageUrl?.slice(0, 50),
      hasSelectedElement: !!selectedElement,
      hasGeneratedCode: !!generatedCode,
      selectedElementImageSrc: selectedElement?.imageSrc?.slice(0, 50),
      selectedElementBgImage: selectedElement?.backgroundImage?.slice(0, 50),
    });
    
    if (!selectedElement || !generatedCode || !newImageUrl.trim()) {
      const reason = !selectedElement ? '未选中元素' : !generatedCode ? '无生成代码' : '无新URL';
      toastError(language === 'zh' ? `无法应用图片：${reason}` : `Cannot apply image: ${reason}`);
      console.error('[applyQuickImageEdit] Early return:', { selectedElement, hasCode: !!generatedCode, newImageUrl });
      return;
    }
    
    const oldImageUrl = selectedElement.imageSrc || selectedElement.backgroundImage;
    if (!oldImageUrl) {
      toastError(language === 'zh' ? '未找到原图片URL' : 'Original image URL not found');
      return;
    }
    
    let updatedCode = generatedCode;
    let replaced = false;
    
    // Escape special regex characters in URL
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedOldUrl = escapeRegex(oldImageUrl);
    
    // Pattern 1: <img src="...">
    if (selectedElement.tagName.toLowerCase() === 'img') {
      const imgSrcPattern = new RegExp(`(src\\s*=\\s*["'])${escapedOldUrl}(["'])`, 'g');
      if (imgSrcPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(imgSrcPattern, `$1${newImageUrl}$2`);
        replaced = true;
      }
      
      // Pattern 1b: src={...} JSX format
      if (!replaced) {
        const jsxSrcPattern = new RegExp(`(src\\s*=\\s*\\{\\s*["'\`])${escapedOldUrl}(["'\`]\\s*\\})`, 'g');
        if (jsxSrcPattern.test(generatedCode)) {
          updatedCode = generatedCode.replace(jsxSrcPattern, `$1${newImageUrl}$2`);
          replaced = true;
        }
      }
    }
    
    // Pattern 2: background-image: url(...)
    if (!replaced && selectedElement.backgroundImage) {
      const bgUrlPattern = new RegExp(`(background(?:-image)?\\s*:\\s*url\\s*\\(\\s*["']?)${escapedOldUrl}(["']?\\s*\\))`, 'gi');
      if (bgUrlPattern.test(generatedCode)) {
        updatedCode = generatedCode.replace(bgUrlPattern, `$1${newImageUrl}$2`);
        replaced = true;
      }
      
      // Pattern 2b: Tailwind arbitrary background-image url class
      if (!replaced) {
        const tailwindBgPattern = new RegExp(`(bg-\\[url\\(["']?)${escapedOldUrl}(["']?\\)\\])`, 'g');
        if (tailwindBgPattern.test(generatedCode)) {
          updatedCode = generatedCode.replace(tailwindBgPattern, `$1${newImageUrl}$2`);
          replaced = true;
        }
      }
      
      // Pattern 2c: backgroundImage in style object: backgroundImage: "url(...)" or `url(...)`
      if (!replaced) {
        const styleObjPattern = new RegExp(`(backgroundImage\\s*:\\s*["'\`]url\\(["']?)${escapedOldUrl}(["']?\\)["'\`])`, 'g');
        if (styleObjPattern.test(generatedCode)) {
          updatedCode = generatedCode.replace(styleObjPattern, `$1${newImageUrl}$2`);
          replaced = true;
        }
      }
    }
    
    if (!replaced) {
      toastError(
        language === 'zh' 
          ? `⚠️ 无法替换图片\n\n可能的原因：\n• 图片URL格式不支持\n• 代码结构复杂\n\n建议使用 AI 修改功能`
          : `⚠️ Could not replace image\n\nPossible reasons:\n• Image URL format not supported\n• Complex code structure\n\nTry using AI edit instead`
      );
      return;
    }
    
    // Validate result
    if (!updatedCode || updatedCode.length < 100) {
      console.error('Quick Image Edit resulted in empty or invalid code');
      return;
    }
    
    // Save to code history for global rollback
    setCodeHistory(prev => [...prev, {
      code: generatedCode,
      prompt: language === 'zh' ? '更换图片前' : 'Before image change',
      timestamp: Date.now(),
      type: 'click'
    }]);
    
    // Save to quick edit history
    setRuntimeError(null);
    const shortUrl = newImageUrl.length > 30 ? '...' + newImageUrl.slice(-30) : newImageUrl;
    const description = language === 'zh' ? `图片: ${shortUrl}` : `Image: ${shortUrl}`;
    const isFirstEdit = quickEditHistory.length === 0;
    const currentLength = quickEditHistory.length;
    const effectiveIndex = quickEditHistoryIndex;
    
    if (isFirstEdit) {
      setQuickEditHistory([
        { code: generatedCode, description: language === 'zh' ? '初始状态' : 'Initial state' },
        { code: updatedCode, description }
      ]);
      setQuickEditHistoryIndex(1);
    } else {
      setQuickEditHistory(prev => {
        const newHistory = effectiveIndex >= 0 && effectiveIndex < prev.length - 1
          ? prev.slice(0, effectiveIndex + 1) 
          : prev;
        return [...newHistory, { code: updatedCode, description }];
      });
      const willTruncate = effectiveIndex >= 0 && effectiveIndex < currentLength - 1;
      const newLength = willTruncate ? effectiveIndex + 2 : currentLength + 1;
      setQuickEditHistoryIndex(newLength - 1);
    }
    
    setGeneratedCode(updatedCode);
    setStreamingCode(updatedCode);
    setShowEditModal(false);
    setQuickEditMode('none');
    setSelectedElement(null);
    setQuickEditImageUrl('');
    
    // Update iframe
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ 
        type: 'spark-update-content', 
        html: updatedCode,
        shouldRestoreEditMode: false
      }, '*');
      
      setIsEditMode(false);
      iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: false }, '*');
    }
    
    toastSuccess(language === 'zh' ? '图片已更换' : 'Image replaced');
  };

  const refreshImageQuota = async () => {
    try {
      const res = await fetch('/api/storage/app-images/quota', { method: 'GET' });
      const json = await res.json();
      if (!res.ok || !json?.success) return;
      setImageQuota(json.data || null);
    } catch {
      // ignore
    }
  };

  const loadUserUploadedImages = async () => {
    setIsLoadingUserUploadedImages(true);
    try {
      const res = await fetch('/api/storage/app-images/list?limit=200&offset=0', { method: 'GET' });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to load images');
      }
      setUserUploadedImages(json?.data?.images || []);
    } catch (error: any) {
      toastError(language === 'zh' ? `加载图片列表失败: ${error.message}` : `Failed to load images: ${error.message}`);
    } finally {
      setIsLoadingUserUploadedImages(false);
    }
  };

  const deleteUserUploadedImage = async (path: string) => {
    try {
      const res = await fetch('/api/storage/app-images/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Delete failed');
      }

      const deletedBytes = userUploadedImages?.find((img) => img.path === path)?.bytes || 0;
      if (imageQuota && deletedBytes > 0) {
        setImageQuota({
          ...imageQuota,
          usedBytes: Math.max(0, imageQuota.usedBytes - deletedBytes),
          remainingBytes: Math.min(imageQuota.quotaBytes, imageQuota.remainingBytes + deletedBytes),
        });
      }

      setUserUploadedImages((prev) => (prev ? prev.filter((img) => img.path !== path) : prev));

      // Refresh in background to ensure accuracy.
      refreshImageQuota();
      toastSuccess(language === 'zh' ? '已删除图片' : 'Image deleted');
    } catch (error: any) {
      toastError(language === 'zh' ? `删除失败: ${error.message}` : `Delete failed: ${error.message}`);
    }
  };

  // 🆕 Quick Edit: Upload image to Supabase and apply
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    
    // 🔑 Capture current selection before async operations
    const capturedElement = selectedElement;
    const capturedCode = generatedCode;
    
    console.log('[handleImageUpload] Start, capturedElement:', {
      hasElement: !!capturedElement,
      imageSrc: capturedElement?.imageSrc?.slice(0, 50),
      bgImage: capturedElement?.backgroundImage?.slice(0, 50),
    });
    
    if (!capturedElement || (!capturedElement.imageSrc && !capturedElement.backgroundImage)) {
      toastError(language === 'zh' ? '请先选择要替换的图片元素' : 'Please select an image element first');
      return;
    }
    
    setIsUploadingImage(true);
    
    try {
      // 1. Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toastError(language === 'zh' ? '图片不能超过 5MB' : 'Image must be under 5MB');
        return;
      }
      
      // 2. Compress image
      const { smartCompressImage } = await import('@/lib/image-compress');
      const compressedFile = await smartCompressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85,
        format: 'webp',
        maxSizeKB: 500
      });
      
      // 3. Upload via server API (enforces per-user quota)
      const formData = new FormData();
      formData.append('file', compressedFile, compressedFile.name || 'image.webp');

      const res = await fetch('/api/storage/app-images/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include', // ensure cookies are sent
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch (parseError) {
        console.error('[ImageUpload] JSON parse error:', parseError, 'Status:', res.status);
        throw new Error(`Server returned non-JSON response (status ${res.status})`);
      }

      console.log('[ImageUpload] Response:', res.status, json);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Upload failed (status ${res.status})`);
      }

      const publicUrl = json?.data?.publicUrl;
      if (typeof publicUrl !== 'string' || !publicUrl) {
        throw new Error('Missing publicUrl');
      }

      if (json?.data?.quotaBytes && json?.data?.usedBytes !== undefined && json?.data?.remainingBytes !== undefined) {
        setImageQuota({
          quotaBytes: json.data.quotaBytes,
          usedBytes: json.data.usedBytes,
          remainingBytes: json.data.remainingBytes,
        });
      } else {
        await refreshImageQuota();
      }

      // Refresh list if already loaded
      setUserUploadedImages((prev) =>
        prev
          ? [{ path: json.data.path, publicUrl, bytes: compressedFile.size, createdAt: null }, ...prev]
          : prev
      );

      // 4. Apply to code using captured element (not current state)
      const newImageUrl = `${publicUrl}?t=${Date.now()}`;
      const oldImageUrl = capturedElement.imageSrc || capturedElement.backgroundImage;
      
      console.log('[handleImageUpload] Replacing image:', { oldImageUrl: oldImageUrl?.slice(0, 50), newImageUrl: newImageUrl?.slice(0, 50) });
      
      if (!oldImageUrl || !capturedCode) {
        toastError(language === 'zh' ? '无法找到原图片URL' : 'Could not find original image URL');
        return;
      }
      
      // Escape special regex characters in URL
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedOldUrl = escapeRegex(oldImageUrl);
      
      let updatedCode = capturedCode;
      let replaced = false;
      
      // Pattern 1: <img src="...">
      if (capturedElement.tagName?.toLowerCase() === 'img') {
        const imgSrcPattern = new RegExp(`(src\\s*=\\s*["'])${escapedOldUrl}(["'])`, 'g');
        if (imgSrcPattern.test(capturedCode)) {
          updatedCode = capturedCode.replace(imgSrcPattern, `$1${newImageUrl}$2`);
          replaced = true;
        }
        // Pattern 1b: src={...} JSX format
        if (!replaced) {
          const jsxSrcPattern = new RegExp(`(src\\s*=\\s*\\{\\s*["'\`])${escapedOldUrl}(["'\`]\\s*\\})`, 'g');
          if (jsxSrcPattern.test(capturedCode)) {
            updatedCode = capturedCode.replace(jsxSrcPattern, `$1${newImageUrl}$2`);
            replaced = true;
          }
        }
      }
      
      // Pattern 2: background-image: url(...)
      if (!replaced && capturedElement.backgroundImage) {
        const bgUrlPattern = new RegExp(`(background(?:-image)?\\s*:\\s*url\\s*\\(\\s*["']?)${escapedOldUrl}(["']?\\s*\\))`, 'gi');
        if (bgUrlPattern.test(capturedCode)) {
          updatedCode = capturedCode.replace(bgUrlPattern, `$1${newImageUrl}$2`);
          replaced = true;
        }
        // Pattern 2b: Tailwind arbitrary bg class
        if (!replaced) {
          const tailwindBgPattern = new RegExp(`(bg-\\[url\\(["']?)${escapedOldUrl}(["']?\\)\\])`, 'g');
          if (tailwindBgPattern.test(capturedCode)) {
            updatedCode = capturedCode.replace(tailwindBgPattern, `$1${newImageUrl}$2`);
            replaced = true;
          }
        }
        // Pattern 2c: backgroundImage in style object
        if (!replaced) {
          const styleObjPattern = new RegExp(`(backgroundImage\\s*:\\s*["'\`]url\\(["']?)${escapedOldUrl}(["']?\\)["'\`])`, 'g');
          if (styleObjPattern.test(capturedCode)) {
            updatedCode = capturedCode.replace(styleObjPattern, `$1${newImageUrl}$2`);
            replaced = true;
          }
        }
      }
      
      if (!replaced) {
        // Fallback: try generic string replacement
        if (capturedCode.includes(oldImageUrl)) {
          updatedCode = capturedCode.replace(new RegExp(escapedOldUrl, 'g'), newImageUrl);
          replaced = true;
          console.log('[handleImageUpload] Used fallback string replacement');
        }
      }
      
      if (!replaced) {
        toastError(language === 'zh' ? '⚠️ 无法在代码中找到该图片URL，请尝试使用 AI 修改' : '⚠️ Could not find image URL in code, try AI edit instead');
        return;
      }
      
      // Validate result
      if (!updatedCode || updatedCode.length < 100) {
        console.error('Image replacement resulted in empty or invalid code');
        return;
      }
      
      // Save to code history
      setCodeHistory(prev => [...prev, {
        code: capturedCode,
        prompt: language === 'zh' ? '更换图片前' : 'Before image change',
        timestamp: Date.now(),
        type: 'click'
      }]);
      
      // Save to quick edit history
      setRuntimeError(null);
      const shortUrl = newImageUrl.length > 30 ? '...' + newImageUrl.slice(-30) : newImageUrl;
      const description = language === 'zh' ? `图片: ${shortUrl}` : `Image: ${shortUrl}`;
      const isFirstEdit = quickEditHistory.length === 0;
      const currentLength = quickEditHistory.length;
      const effectiveIndex = quickEditHistoryIndex;
      
      if (isFirstEdit) {
        setQuickEditHistory([
          { code: capturedCode, description: language === 'zh' ? '初始状态' : 'Initial state' },
          { code: updatedCode, description }
        ]);
        setQuickEditHistoryIndex(1);
      } else {
        setQuickEditHistory(prev => {
          const newHistory = effectiveIndex >= 0 && effectiveIndex < prev.length - 1
            ? prev.slice(0, effectiveIndex + 1) 
            : prev;
          return [...newHistory, { code: updatedCode, description }];
        });
        const willTruncate = effectiveIndex >= 0 && effectiveIndex < currentLength - 1;
        const newLength = willTruncate ? effectiveIndex + 2 : currentLength + 1;
        setQuickEditHistoryIndex(newLength - 1);
      }
      
      // Apply changes
      setGeneratedCode(updatedCode);
      setStreamingCode(updatedCode);
      setShowEditModal(false);
      setQuickEditMode('none');
      setSelectedElement(null);
      setQuickEditImageUrl('');
      
      // Update iframe
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ 
          type: 'spark-update-content', 
          html: updatedCode,
          shouldRestoreEditMode: false
        }, '*');
        
        setIsEditMode(false);
        iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: false }, '*');
      }
      
      toastSuccess(language === 'zh' ? '图片已上传并替换成功！' : 'Image uploaded and replaced!');
      
    } catch (error: any) {
      console.error('Image upload failed:', error);
      toastError(language === 'zh' ? `图片上传失败: ${error.message}` : `Upload failed: ${error.message}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // 🆕 AI Image Generation: Generate image from prompt using Supabase Edge Function
  const handleGenerateAiImage = async () => {
    if (!aiImagePrompt.trim()) {
      toastError(language === 'zh' ? '请输入图片描述' : 'Please enter image description');
      return;
    }

    if (credits < 10) {
      toastError(language === 'zh' ? '积分不足，需要 10 积分' : 'Insufficient credits, need 10 credits');
      return;
    }

    setIsGeneratingAiImage(true);
    setGeneratedAiImage(null);

    try {
      // 获取用户 session 用于调用 Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toastError(language === 'zh' ? '请先登录' : 'Please login first');
        return;
      }

      // 调用 Supabase Edge Function: generate-prototype (mode: 'image')
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-prototype`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          description: aiImagePrompt.trim(),
          mode: 'image', // 使用图片生成模式（非原型图模式）
          language
        })
      });

      const json = await res.json();
      
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Generation failed');
      }

      setGeneratedAiImage(json.imageBase64);
      
      // 扣除积分（手动更新本地状态，Edge Function 不处理积分）
      const newCredits = credits - 10;
      setCredits(newCredits);
      
      // 调用 API 扣除积分
      try {
        await supabase
          .from('profiles')
          .update({ credits: newCredits })
          .eq('id', session.user.id);
      } catch (creditError) {
        console.warn('[AI Image] Credit deduction failed:', creditError);
      }

      toastSuccess(
        language === 'zh' 
          ? `图片生成成功！已扣除 10 积分，剩余 ${newCredits} 积分` 
          : `Image generated! Used 10 credits, ${newCredits} remaining`
      );

    } catch (error: any) {
      console.error('[AI Image] Generation failed:', error);
      toastError(language === 'zh' ? `生成失败: ${error.message}` : `Generation failed: ${error.message}`);
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  // 🆕 AI Image: Apply generated image (upload to storage and replace)
  const handleApplyAiImage = async () => {
    if (!generatedAiImage || !selectedElement) {
      toastError(language === 'zh' ? '请先生成图片' : 'Please generate an image first');
      return;
    }

    // Convert base64 to File
    try {
      const base64Data = generatedAiImage.split(',')[1];
      const binaryData = atob(base64Data);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
      }
      const blob = new Blob([uint8Array], { type: 'image/png' });
      const file = new File([blob], `ai-generated-${Date.now()}.png`, { type: 'image/png' });

      // Use existing handleImageUpload flow
      await handleImageUpload(file);

      // Clear AI image state
      setGeneratedAiImage(null);
      setAiImagePrompt('');
    } catch (error: any) {
      console.error('[AI Image] Apply failed:', error);
      toastError(language === 'zh' ? '应用图片失败' : 'Failed to apply image');
    }
  };

  useEffect(() => {
    if (quickEditMode === 'image') {
      refreshImageQuota();
    }
  }, [quickEditMode]);

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
      
      // 🆕 Clear cache before restoring state
      clearAppCache();
      
      // 🆕 Reset runtime error state to prevent false positives
      setRuntimeError(null);
      
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
      
      // 🆕 Clear cache before restoring state
      clearAppCache();
      
      // 🆕 Reset runtime error state to prevent false positives
      setRuntimeError(null);
      
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
  const handleBlankScreenFix = (errorDetails?: any) => {
    // 🆕 提取详细错误信息
    let consoleErrors = '';
    if (errorDetails?.detailedErrors && errorDetails.detailedErrors.length > 0) {
      consoleErrors = errorDetails.detailedErrors.join('\n');
    } else if (errorDetails?.collectedErrors && errorDetails.collectedErrors.length > 0) {
      consoleErrors = errorDetails.collectedErrors.map((e: any) => e.message).join('\n');
    }
    
    const blankScreenPrompt = language === 'zh'
      ? `应用出现白屏，无法渲染任何内容。${consoleErrors ? `\n\n浏览器控制台报错：\n${consoleErrors}` : ''}

请检查以下可能的问题并修复：
1. React 组件是否正确导出和渲染
2. ReactDOM.render/createRoot 是否正确调用
3. 是否有语法错误导致 JSX 解析失败
4. 是否有未定义的变量或组件

请修复代码使应用能够正常显示。`
      : `The app is showing a blank screen and not rendering any content.${consoleErrors ? `\n\nBrowser console errors:\n${consoleErrors}` : ''}

Please check and fix these potential issues:
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
        
    openConfirmModal({
      title: language === 'zh' ? '全量修复' : 'Full Repair',
      message: confirmMsg,
      confirmText: language === 'zh' ? '继续' : 'Continue',
      onConfirm: () => {
        startGeneration(true, prompt, '', true, 'fix');
      }
    });
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="bg-black/90 border border-white/10 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/50 backdrop-blur-md">
            <h3 className="font-bold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                    <i className="fa-solid fa-clock-rotate-left text-sm"></i>
                </div>
                {t.create.history}
            </h3>
            <button onClick={() => setShowHistoryModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {codeHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                      <i className="fa-solid fa-clock-rotate-left text-2xl opacity-50"></i>
                  </div>
                  <p className="text-sm">{t.create.no_history}</p>
              </div>
            ) : (
              [...codeHistory].reverse().map((item, index) => (
                <div key={item.timestamp} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 hover:bg-white/10 transition group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-1 rounded-md border font-bold flex items-center gap-1.5 shadow-sm ${
                            item.type === 'click' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' :
                            item.type === 'chat' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                            item.type === 'regenerate' ? 'bg-orange-500/10 text-orange-300 border-orange-500/20' :
                            item.type === 'fix' ? 'bg-red-500/10 text-red-300 border-red-500/20' :
                            'bg-white/5 text-slate-300 border-white/10'
                        }`}>
                            <i className={`fa-solid ${getTypeIcon(item.type)}`}></i>
                            {getTypeLabel(item.type)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            <i className="fa-regular fa-clock"></i>
                            {new Date(item.timestamp).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')} 
                        </span>
                    </div>
                    <span className="text-[10px] font-mono bg-black/50 text-slate-400 px-2 py-1 rounded-lg border border-white/10">
                      v{codeHistory.length - index}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 line-clamp-2 mb-4 pl-1 border-l-2 border-white/10 group-hover:border-white/30 transition-colors">{item.prompt}</p>
                  <button 
                    onClick={() => handleRollback(item)}
                    className="w-full py-2.5 bg-black/50 hover:bg-white text-slate-300 hover:text-black rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/10 hover:border-white hover:shadow-lg"
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
    <div className="max-w-4xl mx-auto pt-14 md:pt-12 pb-6 md:pb-12 px-4 md:px-4 h-[100dvh] md:min-h-screen md:h-auto flex flex-col items-center justify-center overflow-hidden">
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-2xl animate-fade-in relative overflow-hidden w-full max-h-[calc(100dvh-80px)] md:max-h-none flex flex-col">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Progress Steps */}
        <div className="flex justify-between mb-6 md:mb-12 relative max-w-lg mx-auto w-full z-10 flex-shrink-0">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-white/5 -z-10 rounded-full"></div>
          {['category', 'device', 'style', 'concept'].map((s, i) => {
            const steps = ['category', 'device', 'style', 'concept'];
            const currentIndex = steps.indexOf(step);
            const stepIndex = steps.indexOf(s);
            const isActive = stepIndex <= currentIndex;
            
            return (
              <div key={s} className="relative">
                <div className={`w-10 h-10 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm md:text-sm font-bold transition-all duration-300 border-2 md:border-4 ${isActive ? 'bg-white text-black border-black/50 shadow-[0_0_15px_rgba(255,255,255,0.3)] scale-110' : 'bg-black border-white/10 text-slate-500'}`}>
                  {i + 1}
                </div>
                <div className={`absolute -bottom-5 md:-bottom-6 left-1/2 -translate-x-1/2 text-[10px] md:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${isActive ? 'text-white' : 'text-slate-600'}`}>
                  {stepNames[s as keyof typeof stepNames]}
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center overflow-y-auto min-h-0">
          {step === 'category' && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              <div className="text-center space-y-1 md:space-y-1">
                <h2 className="text-xl md:text-3xl font-bold text-white">{t.create.category_title}</h2>
                <p className="text-slate-400 text-sm md:text-base">{t.create.category_subtitle}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 px-1 md:px-1">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="relative p-3 md:p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl md:rounded-xl transition-all group text-left hover:shadow-lg hover:-translate-y-0.5 hover:z-10"
                  >
                    <div className="w-12 h-12 md:w-12 md:h-12 rounded-xl md:rounded-xl bg-black/40 flex items-center justify-center mb-3 md:mb-3 group-hover:scale-105 transition shadow-inner border border-white/5">
                      <i className={`fa-solid ${cat.icon} text-xl md:text-xl text-white`}></i>
                    </div>
                    <h3 className="text-sm md:text-lg font-bold text-white mb-1 md:mb-1.5 truncate leading-tight">{t.categories[cat.id as keyof typeof t.categories]}</h3>
                    <p className="hidden md:block text-xs text-slate-400 leading-snug">{t.categories[`${cat.id}_desc` as keyof typeof t.categories]}</p>
                  </button>
                ))}
              </div>
              {/* Skip Button */}
              <div className="flex justify-center pt-2 md:pt-2 flex-shrink-0">
                <button 
                  onClick={() => {
                    setWizardData(prev => ({ ...prev, category: 'tool' }));
                    setStep('device');
                  }}
                  className="text-slate-400 hover:text-white text-xs md:text-sm flex items-center gap-1.5 md:gap-1.5 px-3 md:px-3 py-1.5 md:py-1.5 rounded-lg hover:bg-white/5 transition"
                >
                  {language === 'zh' ? '跳过' : 'Skip'} <i className="fa-solid fa-arrow-right text-[10px] md:text-[10px]"></i>
                </button>
              </div>
            </div>
          )}

          {step === 'device' && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              <div className="text-center space-y-1 md:space-y-1">
                <h2 className="text-xl md:text-3xl font-bold text-white">{t.create.device_title}</h2>
                <p className="text-slate-400 text-sm md:text-base">{t.create.device_subtitle}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {DEVICES.map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => handleDeviceSelect(dev.id)}
                    className="p-4 md:p-6 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl md:rounded-2xl transition-all group text-center hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-black/40 flex items-center justify-center mb-3 md:mb-4 group-hover:scale-105 transition shadow-inner border border-white/5 mx-auto">
                      <i className={`fa-solid ${dev.icon} text-xl md:text-2xl text-white`}></i>
                    </div>
                    <h3 className="text-sm md:text-xl font-bold text-white mb-1 md:mb-2">{t.devices[dev.id as keyof typeof t.devices]}</h3>
                    <p className="hidden md:block text-sm text-slate-400 leading-relaxed">{t.devices[`${dev.id}_desc` as keyof typeof t.devices]}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-center pt-2 md:pt-2 flex-shrink-0">
                <button onClick={() => setStep('category')} className="text-slate-400 hover:text-white text-xs md:text-sm flex items-center gap-1.5 md:gap-1.5 px-3 md:px-3 py-1.5 md:py-1.5 rounded-lg hover:bg-white/5 transition">
                  <i className="fa-solid fa-arrow-left text-[10px] md:text-[10px]"></i> {t.create.btn_back}
                </button>
              </div>
            </div>
          )}

          {step === 'style' && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              <div className="text-center space-y-1 md:space-y-1">
                <h2 className="text-xl md:text-3xl font-bold text-white">{t.create.style_title}</h2>
                <p className="text-slate-400 text-sm md:text-base">{t.create.style_subtitle}</p>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-3 max-h-[45vh] md:max-h-[50vh] overflow-y-auto px-1 md:px-1">
                {STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style.id)}
                    className="p-3 md:p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl md:rounded-xl transition-all group relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br ${style.color} transition duration-500`}></div>
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div className={`w-10 h-10 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-br ${style.color} shadow-lg mb-2 md:mb-2 group-hover:scale-110 transition flex items-center justify-center`}>
                        <i className={`fa-solid ${style.icon} text-white/90 text-base md:text-base drop-shadow-md`}></i>
                      </div>
                      <h3 className="text-xs md:text-sm font-bold text-white leading-tight">{t.styles[style.id as keyof typeof t.styles]}</h3>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-4 md:gap-4 pt-2 md:pt-2 flex-shrink-0">
                <button onClick={() => setStep('device')} className="text-slate-400 hover:text-white text-xs md:text-sm flex items-center gap-1.5 md:gap-1.5 px-3 md:px-3 py-1.5 md:py-1.5 rounded-lg hover:bg-white/5 transition">
                  <i className="fa-solid fa-arrow-left text-[10px] md:text-[10px]"></i> {t.create.btn_back}
                </button>
                <button 
                  onClick={() => {
                    setWizardData(prev => ({ ...prev, style: 'minimalist' }));
                    setStep('concept');
                  }}
                  className="text-slate-400 hover:text-white text-xs md:text-sm flex items-center gap-1.5 md:gap-1.5 px-3 md:px-3 py-1.5 md:py-1.5 rounded-lg hover:bg-white/5 transition"
                >
                  {language === 'zh' ? '跳过' : 'Skip'} <i className="fa-solid fa-arrow-right text-[10px] md:text-[10px]"></i>
                </button>
              </div>
            </div>
          )}

          {step === 'concept' && (
            <div className="space-y-4 md:space-y-6 animate-fade-in">
              <div className="text-center space-y-1 md:space-y-1">
                <h2 className="text-xl md:text-3xl font-bold text-white">{language === 'zh' ? '描述您的应用构思' : 'Describe your App Concept'}</h2>
                <p className="text-slate-400 text-xs md:text-base leading-tight">{language === 'zh' ? '越详细的描述，生成的应用越精准' : 'The more detailed, the better'}</p>
              </div>
              
              {/* Main Input */}
              <div className="bg-white/5 rounded-xl md:rounded-2xl border border-white/10 focus-within:border-white/20 transition-colors relative">
                <textarea
                  value={wizardData.description}
                  onChange={(e) => setWizardData(prev => ({ ...prev, description: e.target.value }))}
                  maxLength={5000}
                  // @ts-ignore
                  placeholder={t.placeholders?.[currentCategory] || (language === 'zh' ? '例如：我想做一个待办事项应用，风格要极简，支持暗黑模式...' : 'E.g. I want to build a Todo app, minimalist style, dark mode support...')}
                  className="w-full h-40 md:h-48 bg-transparent border-none outline-none appearance-none p-4 md:p-4 pb-8 text-white placeholder-slate-500 focus:ring-0 resize-none text-base md:text-base leading-relaxed"
                ></textarea>
                
                <div className="absolute bottom-3 md:bottom-4 right-3 md:right-4 text-xs md:text-xs text-slate-500">
                  {wizardData.description.length}/5000
                </div>
              </div>
              
              {/* Action Buttons - Moved outside textarea */}
              <div className="flex items-center gap-2 md:gap-2 flex-shrink-0">
                 <button 
                   onClick={useMadLibsTemplate}
                   className="text-xs md:text-xs bg-white/5 hover:bg-white/10 text-white px-3 md:px-3 py-2 md:py-1.5 rounded-lg transition flex items-center gap-1.5 md:gap-1.5 border border-white/10"
                 >
                   <Edit3 size={12} className="md:w-3 md:h-3" />
                   {language === 'zh' ? '模板' : 'Template'}
                 </button>
                 <button 
                   onClick={optimizePrompt}
                   disabled={isOptimizingPrompt || !wizardData.description.trim()}
                   className="text-xs md:text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 md:px-3 py-2 md:py-1.5 rounded-lg transition flex items-center gap-1.5 md:gap-1.5 border border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {isOptimizingPrompt ? (
                     <>
                       <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                       {language === 'zh' ? '优化中' : 'Opt...'}
                     </>
                   ) : (
                     <>
                       <Wand2 size={12} className="md:w-3 md:h-3" />
                       {language === 'zh' ? 'AI优化' : 'AI Opt'}
                     </>
                   )}
                 </button>
              </div>

              <div className="flex gap-3 md:gap-4 pt-2 md:pt-4 flex-shrink-0">
                <button
                  onClick={() => setStep('style')}
                  className="flex-1 py-3 md:py-3 rounded-xl md:rounded-xl font-bold text-sm md:text-base text-slate-400 hover:text-white hover:bg-white/5 transition"
                >
                  {t.create.btn_back}
                </button>
                <button
                  onClick={() => {
                    startGeneration(false, '', '', false, 'init');
                  }}
                  disabled={!wizardData.description}
                  className="flex-1 bg-white text-black hover:bg-slate-200 py-3 md:py-4 rounded-xl md:rounded-xl font-bold text-sm md:text-base shadow-lg shadow-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 md:gap-2"
                >
                  <span>{t.create.btn_generate}</span>
                  <Wand2 size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const handleConfigureBackend = async () => {
    if (isGenerating) return;
    setIsConfiguringBackend(true);
  };

  const startBackendConfiguration = async () => {
    setGenerationPhase('starting');
    setStep('preview'); // Ensure we are in preview mode
    
    // 🆕 P3 简化: User Prompt 只需一句话触发，所有规则都在 System Prompt 中
    // 这样避免了两个 Prompt 的重复/冲突，AI 只需遵循 System Prompt 即可
    const userPrompt = language === 'zh' 
      ? '请为此应用配置表单收集后端（按照 System Prompt 中的规则执行）'
      : 'Configure form collection backend for this app (follow System Prompt rules)';
    
    const displayPrompt = language === 'zh' ? '配置表单收集后端' : 'Configure form collection backend';
    
    await startGeneration(true, userPrompt, displayPrompt, false, 'backend_config');
  };

  const renderGenerating = () => {
    // If configuring backend, do not show the default waterfall UI
    if (isConfiguringBackend) return null;

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
                <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative group">
                    {/* Glowing Border Effect */}
                    <div className="absolute -inset-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-1000 animate-gradient-x rounded-3xl"></div>
                    
                    <div className="relative flex flex-col md:flex-row gap-8 items-center md:items-start">
                        {/* Left: Visual Indicator */}
                        <div className="shrink-0 relative z-10">
                            <div className="w-20 h-20 rounded-2xl shadow-lg relative">
                                <div className="absolute inset-0 rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
                                    <i className={`fa-solid ${wizardData.category ? (CATEGORIES.find(c => c.id === wizardData.category)?.icon || 'fa-cube') : 'fa-cube'} text-4xl text-white`}></i>
                                </div>
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-2 border-black bg-white flex items-center justify-center shadow-lg">
                                <i className="fa-solid fa-robot text-black text-xs animate-bounce"></i>
                            </div>
                        </div>

                        {/* Right: Progress & Logs */}
                        <div className="flex-1 w-full">
                            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                                {language === 'zh' ? '正在构建您的应用' : 'Building Your Application'}
                                <span className="flex h-2 w-2 relative">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                </span>
                            </h3>
                            <p className="text-slate-400 text-sm mb-6 line-clamp-1">
                                {currentGenerationPrompt}
                            </p>

                            {/* Progress Component Integration */}
                            <div className="bg-black/20 rounded-xl border border-white/10 p-1">
                                <GenerationProgress 
                                    plan={aiPlan} 
                                    currentStep={currentStep} 
                                    isGenerating={isGenerating} 
                                    language={language} 
                                    variant="embedded" 
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
        <CreationChat
          activeMobileTab={activeMobileTab}
          handleExit={handleExit}
          t={t}
          isFromUpload={isFromUpload}
          language={language}
          startGeneration={startGeneration}
          currentGenerationPrompt={currentGenerationPrompt}
          credits={credits}
          isCreditAnimating={isCreditAnimating}
          chatHistory={chatHistory}
          workflowStage={workflowStage}
          isGenerating={isGenerating}
          workflowDetails={workflowDetails}
          handleCancelGeneration={handleCancelGeneration}
          chatEndRef={chatEndRef}
          setShowHistoryModal={setShowHistoryModal}
          handleDownload={handleDownload}
          generatedCode={generatedCode}
          chatInput={chatInput}
          setChatInput={setChatInput}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          MODEL_CONFIG={MODEL_CONFIG}
          handleFullRepair={handleFullRepair}
          fullCodeMode={fullCodeMode}
          setFullCodeMode={setFullCodeMode}
          handleBlankScreenFix={handleBlankScreenFix}
          handleFixError={handleFixError}
        />

        <CreationPreview
          activeMobileTab={activeMobileTab}
          handleExit={handleExit}
          t={t}
          isFullscreen={isFullscreen}
          toggleFullScreen={toggleFullScreen}
          language={language}
          isSaving={isSaving}
          handleSaveDraft={handleSaveDraft}
          handleUpload={handleUpload}
          previewContainerRef={previewContainerRef}
          quickEditHistory={quickEditHistory}
          isHistoryPanelOpen={isHistoryPanelOpen}
          setIsHistoryPanelOpen={setIsHistoryPanelOpen}
          quickEditUndo={quickEditUndo}
          canQuickEditUndo={canQuickEditUndo}
          quickEditRedo={quickEditRedo}
          canQuickEditRedo={canQuickEditRedo}
          quickEditHistoryIndex={quickEditHistoryIndex}
          setGeneratedCode={setGeneratedCode}
          setStreamingCode={setStreamingCode}
          setQuickEditHistoryIndex={setQuickEditHistoryIndex}
          iframeRef={iframeRef}
          isEditMode={isEditMode}
          previewMode={previewMode}
          previewScale={previewScale}
          getPreviewContent={getPreviewContent}
          runtimeError={runtimeError}
          handleFixError={handleFixError}
          setRuntimeError={setRuntimeError}
          setPreviewMode={setPreviewMode}
          handleMobilePreview={handleMobilePreview}
          toggleEditMode={toggleEditMode}
          step={step}
          isGenerating={isGenerating}
          showEditModal={showEditModal}
          selectedElement={selectedElement}
          setShowEditModal={setShowEditModal}
          setQuickEditMode={setQuickEditMode}
          detectQuickEditType={detectQuickEditType}
          userId={userId}
          appId={sessionDraftId}
          quickEditMode={quickEditMode}
          setQuickEditText={setQuickEditText}
          detectAvailableColorTypes={detectAvailableColorTypes}
          setAvailableColorTypes={setAvailableColorTypes}
          setQuickEditColorType={setQuickEditColorType}
          availableColorTypes={availableColorTypes}
          quickEditColorType={quickEditColorType}
          quickEditColor={quickEditColor}
          setQuickEditColor={setQuickEditColor}
          applyQuickColorEdit={applyQuickColorEdit}
          quickEditText={quickEditText}
          applyQuickTextEdit={applyQuickTextEdit}
          quickEditImageUrl={quickEditImageUrl}
          setQuickEditImageUrl={setQuickEditImageUrl}
          applyQuickImageEdit={applyQuickImageEdit}
          handleImageUpload={handleImageUpload}
          isUploadingImage={isUploadingImage}
          imageQuota={imageQuota}
          userUploadedImages={userUploadedImages}
          isLoadingUserUploadedImages={isLoadingUserUploadedImages}
          loadUserUploadedImages={loadUserUploadedImages}
          deleteUserUploadedImage={deleteUserUploadedImage}
          editIntent={editIntent}
          setEditIntent={setEditIntent}
          editRequest={editRequest}
          setEditRequest={setEditRequest}
          handleElementEditSubmit={handleElementEditSubmit}
          showMobilePreview={showMobilePreview}
          setShowMobilePreview={setShowMobilePreview}
          generatedCode={generatedCode}
          mobilePreviewUrl={mobilePreviewUrl}
          handleConfigureBackend={handleConfigureBackend}
          aiImagePrompt={aiImagePrompt}
          setAiImagePrompt={setAiImagePrompt}
          isGeneratingAiImage={isGeneratingAiImage}
          generatedAiImage={generatedAiImage}
          handleGenerateAiImage={handleGenerateAiImage}
          handleApplyAiImage={handleApplyAiImage}
          credits={credits}
        />
      
      {renderHistoryModal()}

      {/* Mobile Bottom Tab Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full bg-black border-t border-white/10 flex z-50 pb-safe">
        <button 
          onClick={() => setActiveMobileTab('preview')}
          className={`flex-1 py-3 flex flex-col items-center gap-1 ${activeMobileTab === 'preview' ? 'text-brand-400' : 'text-slate-500'}`}
        >
          <Eye size={20} />
          <span className="text-xs font-bold">{t.create.preview_mode}</span>
        </button>
        <button 
          onClick={() => setActiveMobileTab('chat')}
          className={`flex-1 py-3 flex flex-col items-center gap-1 ${activeMobileTab === 'chat' ? 'text-brand-400' : 'text-slate-500'}`}
        >
          <MessageSquare size={20} />
          <span className="text-xs font-bold">{t.create.chat_mode}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen text-white relative ${step === 'preview' ? 'h-[100dvh] overflow-hidden' : ''}`}>
      {/* Fixed background - ensures full coverage on all devices */}
      <div className="fixed inset-0 bg-black -z-20" />
      
      {/* Global Fixed Background - only show during initial flow (category/device/style/concept) */}
      {step !== 'generating' && step !== 'preview' && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <Galaxy 
              mouseRepulsion={false}
              mouseInteraction={false}
              density={1.5}
              glowIntensity={0.5}
              saturation={0.8}
              hueShift={240}
          />
        </div>
      )}

      {step !== 'preview' && (
        <button 
          onClick={handleExit}
          className="fixed top-6 left-6 z-50 w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-full flex items-center justify-center transition backdrop-blur-md border border-white/10"
          title={t.create.exit_creation}
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
      )}

      {step === 'generating' ? renderGenerating() : 
       step === 'preview' ? renderPreview() : 
       renderWizard()}

      {/* Backend Configuration Flow Overlay */}
      {isConfiguringBackend && (
        <BackendConfigFlow 
          language={language}
          onComplete={() => {
            setIsConfiguringBackend(false);
            // The green button will appear automatically because generatedCode now has backend logic
          }}
          startGeneration={startBackendConfiguration}
          isGenerating={isGenerating}
          generatedCode={generatedCode}
          streamingCode={streamingCode}
        />
      )}

      {/* Timeout Modal */}
      {showTimeoutModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-black border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
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
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition border border-white/10 flex flex-col items-center justify-center gap-0.5"
              >
                <span className="font-bold text-sm">{language === 'zh' ? '取消任务' : 'Cancel Task'}</span>
                <span className="text-[10px] text-slate-400 font-normal">{language === 'zh' ? '不扣除积分' : 'No credits charged'}</span>
              </button>
              <button 
                onClick={handleTimeoutWait}
                className="flex-1 py-3 bg-white text-black hover:bg-slate-200 rounded-xl font-bold transition shadow-lg shadow-white/10"
              >
                {language === 'zh' ? '继续等待' : 'Keep Waiting'}
              </button>
            </div>
          </div>
        </div>
      )}






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
