'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Item } from '@/types/supabase';
import html2canvas from 'html2canvas';
import { QRCodeCanvas } from 'qrcode.react';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { getPreviewContent } from '@/lib/preview';
import AddToHomeScreenGuide from '@/components/AddToHomeScreenGuide';
import { saveToHistory } from '@/lib/db';
import { copyToClipboard, getFingerprint } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';
import { translations } from '@/lib/i18n/translations';
import ProductScoreSection from '@/components/ProductScoreSection';
import ProductActionBar from '@/components/ProductActionBar';


interface ProductDetailClientProps {
  initialItem: Item;
  id: string;
  initialMode?: string;
}

export default function ProductDetailClient({ initialItem, id, initialMode }: ProductDetailClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [item, setItem] = useState<Item>(initialItem);
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(initialItem.likes || 0);
  const [showCopiedTip, setShowCopiedTip] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const { openLoginModal, openPaymentModal, openRewardModal } = useModal();
  const { success } = useToast();
  const { language } = useLanguage();
  const t = translations[language];
  
  // View Mode: 'detail' (default) or 'app' (immersive)
  const [viewMode, setViewMode] = useState<'detail' | 'app'>(initialMode === 'app' ? 'app' : 'detail');

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const [shareImageUrl, setShareImageUrl] = useState<string>('');

  const [qrIconDataUrl, setQrIconDataUrl] = useState<string>('');
  // Logo Data URL for Share Card
  const [logoDataUrl, setLogoDataUrl] = useState<string>('');
  const [defaultIconDataUrl, setDefaultIconDataUrl] = useState<string>('');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiBaseUrl(window.location.origin);
    }
    
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });

    const loadAssets = async () => {
        try {
            // Load Logo
            const logoResponse = await fetch('/logo.png');
            const logoBlob = await logoResponse.blob();
            const logoReader = new FileReader();
            logoReader.onloadend = () => setLogoDataUrl(logoReader.result as string);
            logoReader.readAsDataURL(logoBlob);

            // Load Default Icon
            const iconResponse = await fetch('/icons/icon-512x512.png');
            const iconBlob = await iconResponse.blob();
            const iconReader = new FileReader();
            iconReader.onloadend = () => setDefaultIconDataUrl(iconReader.result as string);
            iconReader.readAsDataURL(iconBlob);
        } catch (e) {
            console.warn('Failed to load assets:', e);
            setLogoDataUrl('/logo.png');
            setDefaultIconDataUrl('/icons/icon-512x512.png');
        }
    };
    loadAssets();
  }, [item?.public_key, id]);

  useEffect(() => {
    checkIfLiked(id);
    incrementViews(id);
    
    // Save to local history for offline access/PWA persistence
    if (item) {
        saveToHistory(item).then(() => {
            // Only show toast if in PWA mode to confirm storage
            if (window.matchMedia('(display-mode: standalone)').matches) {
                // success('已缓存到本地', 2000); // Optional: feedback
            }
        });
    }
  }, [id]);

  useEffect(() => {
    if (item?.icon_url) {
        const toDataURL = async () => {
            try {
                const response = await fetch(item.icon_url!);
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => setQrIconDataUrl(reader.result as string);
                reader.readAsDataURL(blob);
            } catch (e) {
                console.warn('Failed to load icon for QR:', e);
                setQrIconDataUrl('/logo.png');
            }
        };
        toDataURL();
    } else {
        setQrIconDataUrl('/logo.png');
    }
  }, [item?.icon_url]);

  const checkIfLiked = async (itemId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data } = await supabase
        .from('likes')
        .select('item_id')
        .eq('user_id', session.user.id)
        .eq('item_id', itemId)
        .maybeSingle();
      setIsLiked(!!data);
    }
  };

  const incrementViews = async (itemId: string) => {
    // Optimistic update
    setItem(prev => ({ ...prev, page_views: (prev.page_views || 0) + 1 }));

    // Use RPC for secure increment
    // RLS policies prevent direct updates from non-authors, so we must use a Postgres Function
    const { error } = await supabase.rpc('increment_views', { 
      p_item_id: itemId,
      fingerprint: getFingerprint()
    });
    
    if (error) {
      console.error('Failed to increment views:', error);
    }
  };

  const incrementDownloads = async (itemId: string) => {
    // Optimistic update
    setItem(prev => ({ ...prev, views: (prev.views || 0) + 1 }));
    
    // Use RPC for secure increment (assuming you have a similar function for downloads)
    // If not, you should create one: create function increment_downloads(item_id uuid) ...
    const { error } = await supabase.rpc('increment_downloads', { 
      p_item_id: itemId,
      fingerprint: getFingerprint()
    });
    
    if (error) {
       console.error('Failed to increment downloads:', error);
    }
  };

  const handleLike = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }

    if (isLiked) {
      await supabase.from('likes').delete().match({ user_id: session.user.id, item_id: id });
      setLikesCount(prev => prev - 1);
      setIsLiked(false);
    } else {
      await supabase.from('likes').insert({ user_id: session.user.id, item_id: id });
      setLikesCount(prev => prev + 1);
      setIsLiked(true);
    }
  };

  const handleReward = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }
    if (item?.author_id) {
        openRewardModal(item.author_id);
    }
  };

  const handleShare = async () => {
    setShowShareModal(true);
    setGeneratingImage(true);
    setShareImageUrl('');
    
    setTimeout(async () => {
        if (shareRef.current) {
            try {
                const canvas = await html2canvas(shareRef.current, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null,
                    scale: 2,
                    logging: false,
                    onclone: (clonedDoc) => {
                        const images = clonedDoc.getElementsByTagName('img');
                        for (let i = 0; i < images.length; i++) {
                            if (!images[i].src.startsWith('data:')) {
                                images[i].crossOrigin = "anonymous";
                            }
                        }
                    }
                });
                setShareImageUrl(canvas.toDataURL('image/png'));
            } catch (err) {
                console.error('Error generating share image:', err);
            } finally {
                setGeneratingImage(false);
            }
        }
    }, 500);
  };

  const closeShareModal = () => {
    setShowShareModal(false);
    setShareImageUrl('');
  };

  const handleDownload = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }

    if (item.price && item.price > 0) {
      if (item.author_id !== session.user.id) {
        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('buyer_id', session.user.id)
          .eq('item_id', item.id)
          .eq('status', 'completed')
          .single();
        
        if (!order) {
          openPaymentModal(item);
          return;
        }
      }
    }
    
    incrementDownloads(item.id);

    const blob = new Blob([item.content || ''], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getDetailUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/p/${id}`;
    }
    return '';
  };

  const getAppUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/p/${id}?mode=app`;
    }
    return '';
  };

  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

  // Detect if running in standalone mode (PWA)
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [isWeChat, setIsWeChat] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Detect WeChat
      const ua = navigator.userAgent.toLowerCase();
      setIsWeChat(ua.includes('micromessenger'));

      const checkStandalone = () => {
        const isStandaloneMode = 
          window.matchMedia('(display-mode: standalone)').matches || 
          window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches ||
          (window.navigator as any).standalone || 
          document.referrer.includes('android-app://');
        
        setIsStandalone(!!isStandaloneMode);
        
        // If standalone, force app mode
        if (isStandaloneMode) {
          setViewMode('app');
        }

        // Only show hint if NOT standalone and NOT dismissed previously
        // And if we are in app mode (e.g. scanned from QR code)
        const dismissed = localStorage.getItem('pwa_hint_dismissed');
        if (!isStandaloneMode && !dismissed && viewMode === 'app') {
            setShowInstallHint(true);
        }
      };

      // Initial check
      checkStandalone();
      
      // Re-check on resize/orientation change
      window.addEventListener('resize', checkStandalone);
      
      return () => window.removeEventListener('resize', checkStandalone);
    }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (viewMode === 'app') {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
      } else {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
      }
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
      };
    }
  }, [viewMode]);

  const dismissHint = () => {
    setShowInstallHint(false);
    localStorage.setItem('pwa_hint_dismissed', 'true');
  };

  const enterAppMode = () => {
    // On mobile, use the lightweight runner for better performance
    if (window.innerWidth < 768) {
       router.push(`/run/${id}`);
       return;
    }

    // Force hard navigation to ensure browser picks up the correct manifest for PWA installation
    window.location.href = `/p/${id}?mode=app`;
  };

  const exitAppMode = () => {
    setViewMode('detail');
    // Optional: Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    window.history.pushState({}, '', url);
  };

  return (
    <div className={`h-[100dvh] flex flex-col overflow-hidden relative ${viewMode === 'app' ? 'pt-0' : 'pt-16'}`}>
      {/* Fixed background - ensures full coverage on all devices */}
      <div className="fixed inset-0 bg-slate-900 -z-10" />
      
      {/* Content */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden relative w-full">
        {/* Preview Area / App Mode Container */}
        <div className={`
            transition-all duration-300 bg-slate-900 relative group flex flex-col min-w-0
            ${viewMode === 'app' ? 'fixed inset-0 z-[9999] w-screen h-[100dvh] overscroll-none touch-none bg-black' : 'h-[35vh] md:h-auto md:flex-1'}
        `}>
          {/* Back Button (Only in App Mode & Not Standalone & Not Initial App Mode) */}
          {viewMode === 'app' && !isStandalone && initialMode !== 'app' && (
            <button 
              onClick={exitAppMode}
              className="absolute top-4 left-4 z-[70] w-10 h-10 rounded-full bg-slate-900/50 backdrop-blur text-white border border-white/10 flex items-center justify-center hover:bg-slate-800 transition touch-manipulation active:scale-90"
            >
              <i className="fa-solid fa-arrow-left"></i>
            </button>
          )}

          <div className={`flex-grow relative bg-slate-900 overflow-hidden ${viewMode === 'app' ? 'w-full h-full' : 'flex justify-center items-center'}`}>
            <div 
              className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-slate-900 flex-shrink-0 ${
                viewMode === 'app'
                  ? 'absolute inset-0 w-full h-full rounded-none border-0'
                  : previewMode === 'desktop' 
                    ? 'w-full h-full rounded-none border-0' 
                    : previewMode === 'tablet'
                      ? 'w-[768px] h-[95%] rounded-[1.5rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50'
                      : 'w-[375px] h-[90%] rounded-[2.5rem] border-[10px] border-slate-800 ring-1 ring-slate-700/50'
              }`}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Mobile Notch - Only show in explicit mobile preview mode, not in actual mobile usage */}
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 bg-slate-800 z-20 transition-all duration-300 ${
                  previewMode === 'mobile' && viewMode !== 'app' ? 'w-24 h-6 rounded-b-xl opacity-100' : 'w-0 h-0 opacity-0'
              }`}></div>

              {iframeLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                  <div className="flex flex-col items-center gap-3">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i>
                    <span className="text-slate-400 text-sm animate-pulse">{t.common?.loading || 'Loading...'}</span>
                  </div>
                </div>
              )}

              <iframe 
                srcDoc={getPreviewContent(
                  // 🚀 优先使用预编译内容（无需浏览器端 Babel）
                  item.content || '', 
                  { raw: true, appId: String(item.id), apiBaseUrl, isPrecompiled: false }
                )}
                className={`w-full h-full border-0 bg-white transition-opacity duration-500 ${iframeLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => {
                  setIframeLoading(false);
                }}
                sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-modals allow-forms allow-popups allow-downloads"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay; fullscreen; picture-in-picture; display-capture; screen-wake-lock"
                style={{ touchAction: 'manipulation' }}
              />

              {/* Mobile Overlay to prevent about:srcdoc in preview mode - Only active when NOT in app mode */}
              {viewMode !== 'app' && (
                <div className="absolute inset-0 w-full h-full bg-transparent md:hidden pointer-events-none" style={{ zIndex: 5 }} />
              )}
            </div>
          </div>
          
          {/* Preview Controls - Hidden on mobile & App Mode */}
          <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition duration-300 z-10 hidden md:flex ${viewMode === 'app' ? '!hidden' : ''}`}>
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full p-1 flex">
              <button onClick={() => setPreviewMode('desktop')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-desktop"></i></button>
              <button onClick={() => setPreviewMode('tablet')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-tablet-screen-button"></i></button>
              <button onClick={() => setPreviewMode('mobile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-mobile-screen"></i></button>
            </div>
          </div>
        </div>

        {/* Sidebar Info - Hidden in App Mode */}
        <div className={`
            flex-1 md:w-96 md:flex-shrink-0 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex-col z-20 shadow-2xl overflow-hidden
            ${viewMode === 'app' ? 'hidden' : 'flex'}
        `}>
          <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
            {/* Author Info */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <img src={item.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author}`} className="w-12 h-12 rounded-full border-2 border-slate-700 object-cover" alt="Author" />
                <div>
                  <div className="font-bold text-white text-base">{item.author}</div>
                  <div className="text-xs text-slate-500" suppressHydrationWarning>{new Date(item.created_at || '').toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleShare}
                  className="hidden md:flex text-xs bg-slate-800 hover:bg-slate-700 text-brand-400 px-3 py-1.5 rounded-full font-bold transition border border-slate-700 items-center gap-1"
                >
                  {showCopiedTip ? (
                    <>
                      <i className="fa-solid fa-check"></i> {t.detail.copied}
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-share-nodes"></i> {t.detail.share}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-2 mb-8">
              <div className="flex flex-col items-center text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <i className="fa-solid fa-eye text-slate-500 mb-1 text-xs"></i>
                <span className="font-bold text-white text-sm">{item.page_views || 0}</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <i className="fa-solid fa-download text-slate-500 mb-1 text-xs"></i>
                <span className="font-bold text-white text-sm">{item.views || 0}</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <i className={`fa-solid fa-heart mb-1 text-xs ${isLiked ? 'text-rose-500' : 'text-slate-500'}`}></i>
                <span className="font-bold text-white text-sm">{likesCount}</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <i className="fa-solid fa-file-code text-blue-400 mb-1 text-xs"></i>
                <span className="font-bold text-white text-sm">{Math.round((item.content?.length || 0) / 1024)}KB</span>
              </div>
            </div>
            
            {/* AI Analysis Score */}
            <ProductScoreSection item={item} language={language} t={t} />
            
            {/* Description */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">{t.detail.about}</h3>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {item.description}
              </p>
            </div>

            {/* Prompt */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider flex items-center justify-between">
                <span>{t.detail.prompt}</span>
                <button onClick={() => {copyToClipboard(item.prompt || '').then(() => alert(t.detail.copied));}} className="text-brand-400 hover:text-brand-300 text-[10px] flex items-center gap-1 transition">
                  <i className="fa-regular fa-copy"></i> {t.detail.copy}
                </button>
              </h3>
              <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 relative group max-h-60 overflow-y-auto custom-scrollbar">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">{item.prompt || t.detail.no_prompt}</pre>
              </div>
            </div>

            {/* Tags */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">{t.detail.category}</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {item.tags?.filter(tag => {
                  const CATEGORY_TAGS = ['game', 'portfolio', 'appointment', 'productivity', 'tool', 'devtool', 'education', 'visualization', 'lifestyle'];
                  return /[\u4e00-\u9fa5]/.test(tag) || CATEGORY_TAGS.includes(tag.toLowerCase());
                }).map(tag => (
                  <span key={tag} className="bg-slate-800 text-blue-300 px-2 py-1 rounded text-xs border border-blue-700">{tag}</span>
                ))}
              </div>
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">{t.detail.tech_stack}</h3>
              <div className="flex flex-wrap gap-2">
                {item.tags?.filter(tag => {
                  const CATEGORY_TAGS = ['game', 'portfolio', 'appointment', 'productivity', 'tool', 'devtool', 'education', 'visualization', 'lifestyle'];
                  return !(/[\u4e00-\u9fa5]/.test(tag)) && !CATEGORY_TAGS.includes(tag.toLowerCase());
                }).map(tag => (
                  <span key={tag} className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs border border-slate-700">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="p-6 border-t border-slate-800 bg-slate-900/95 backdrop-blur relative">
            <ProductActionBar
              isLiked={isLiked}
              onLike={handleLike}
              onShare={handleShare}
              onLaunchApp={enterAppMode}
              onDownload={handleDownload}
              t={t}
            />
          </div>
        </div>
      </div>

      {/* Share Modal Overlay */}
      {showShareModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={closeShareModal}></div>
            
            <div className="relative z-10 bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full flex flex-col items-center animate-float-up shadow-2xl">
                <div className="flex justify-between items-center w-full mb-4">
                    <h3 className="text-base font-bold text-white">{t.detail.share_modal_title}</h3>
                    <button onClick={closeShareModal} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {isLocalhost && (
                    <div className="w-full mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs flex items-start gap-2">
                        <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                        <span dangerouslySetInnerHTML={{ __html: t.detail.localhost_warning }} />
                    </div>
                )}
                
                {/* Hidden Capture Area - Always rendered but off-screen */}
                <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                    <div 
                        ref={shareRef} 
                        className="flex w-[375px] flex-col relative overflow-hidden bg-slate-950 text-white"
                        style={{ minHeight: '667px', fontFamily: 'sans-serif' }}
                    >
                        {/* Elegant Background - Simplified */}
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
                                <div className="w-40 h-40 rounded-[2.5rem] bg-gradient-to-br from-brand-500 to-blue-600 shadow-2xl shadow-brand-500/30 flex items-center justify-center relative overflow-hidden border border-white/10 group">
                                    <img 
                                        src={item.icon_url || defaultIconDataUrl || "/icons/icon-512x512.png"} 
                                        className="w-full h-full object-cover" 
                                        alt="App Icon" 
                                        crossOrigin={item.icon_url && !item.icon_url.startsWith('data:') ? "anonymous" : undefined}
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            const fallback = defaultIconDataUrl || "/icons/icon-512x512.png";
                                            if (target.src !== fallback && !target.src.includes(fallback)) {
                                                target.src = fallback;
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Info Section */}
                            <div className="mb-8">
                                <div className="flex items-center justify-center w-full px-2 mb-3">
                                    <h1 className="text-2xl font-bold text-white tracking-tight whitespace-nowrap overflow-hidden text-ellipsis pb-2 leading-relaxed">
                                        {item?.title ? item.title.split(/[-|:：]/)[0].replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim() : ''}
                                    </h1>
                                </div>
                                <div className="flex items-center justify-center w-full">
                                    <span className="text-xs font-medium text-slate-400">{t.detail.developer}{item?.author}</span>
                                </div>
                            </div>

                            {/* QR Section - Centered Single QR */}
                            <div className="mt-auto flex flex-col items-center">
                                <div className="bg-white p-3 rounded-2xl shadow-xl mb-4">
                                    <QRCodeCanvas 
                                        value={getAppUrl()} 
                                        size={140}
                                        level={"H"}
                                        bgColor="#ffffff"
                                        fgColor="#000000"
                                        imageSettings={{
                                            src: qrIconDataUrl || "/logo.png",
                                            x: undefined,
                                            y: undefined,
                                            height: 28,
                                            width: 28,
                                            excavate: true,
                                        }}
                                    />
                                </div>
                                <span className="text-sm text-slate-400">{language === 'zh' ? '扫码体验作品' : 'Scan to experience'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Display Area */}
                <div className="relative w-full mb-6 flex justify-center min-h-[200px]">
                    {generatingImage && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50">
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500 mb-3"></i>
                            <span className="text-slate-300 text-sm font-medium animate-pulse">{t.detail.generating_card}</span>
                        </div>
                    )}
                    
                    {shareImageUrl ? (
                        <img src={shareImageUrl} className="w-full rounded-xl shadow-2xl animate-fade-in" alt="Share Card" />
                    ) : (
                        <div className="w-full aspect-[375/667] bg-slate-800/50 rounded-xl"></div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => {
                            const link = document.createElement('a');
                            link.download = `share-${item.title || 'spark-vertex'}.png`;
                            link.href = shareImageUrl;
                            link.click();
                        }}
                        disabled={!shareImageUrl}
                        className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3.5 rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm border border-white/5"
                    >
                        <i className="fa-solid fa-download"></i> {t.detail.save_image}
                    </button>
                    <button 
                        onClick={() => {
                            const url = `${window.location.origin}/p/${item.id}`;
                            copyToClipboard(url).then(() => alert(t.detail.link_copied));
                        }}
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white py-3.5 rounded-xl font-bold transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-500/20"
                    >
                        <i className="fa-regular fa-copy"></i> {t.detail.copy_link}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Add to Home Screen Guide */}
      <AddToHomeScreenGuide isActive={viewMode === 'app'} />

      {/* Exit App Mode Button - Floating (Only in App Mode) */}
      {viewMode === 'app' && (
        <button 
          onClick={exitAppMode}
          className="fixed top-4 left-4 z-[60] w-10 h-10 bg-black/50 backdrop-blur-md rounded-full text-white flex items-center justify-center hover:bg-black/70 transition border border-white/10 group"
          title={t.detail.back_to_detail}
        >
          <i className="fa-solid fa-chevron-left group-hover:-translate-x-0.5 transition-transform"></i>
        </button>
      )}
    </div>
  );
}
