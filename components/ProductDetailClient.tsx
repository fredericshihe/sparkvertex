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
  const { openLoginModal, openPaymentModal, openRewardModal } = useModal();
  const { success } = useToast();
  
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

  useEffect(() => {
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
  }, []);

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
        .single();
      setIsLiked(!!data);
    }
  };

  const incrementViews = async (itemId: string) => {
    // Optimistic update
    setItem(prev => ({ ...prev, page_views: (prev.page_views || 0) + 1 }));

    // Validate UUID to prevent DB errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(itemId)) {
        return;
    }

    // Use RPC for secure increment
    // RLS policies prevent direct updates from non-authors, so we must use a Postgres Function
    const { error } = await supabase.rpc('increment_views', { item_id: itemId });
    
    if (error) {
      console.error('Failed to increment views:', error);
    }
  };

  const incrementDownloads = async (itemId: string) => {
    // Optimistic update
    setItem(prev => ({ ...prev, views: (prev.views || 0) + 1 }));
    
    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(itemId)) {
        return;
    }

    // Use RPC for secure increment (assuming you have a similar function for downloads)
    // If not, you should create one: create function increment_downloads(item_id uuid) ...
    const { error } = await supabase.rpc('increment_downloads', { item_id: itemId });
    
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
    <div className={`min-h-screen bg-slate-900 flex flex-col ${viewMode === 'app' ? 'pt-0' : 'pt-16'}`}>
      {/* Add to Home Screen Hint - Only show on mobile browser (not standalone) */}
      {showInstallHint && viewMode === 'app' && !isWeChat && (
        <div 
            className="md:hidden fixed bottom-8 left-4 right-4 z-[10000] animate-slide-up"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="bg-slate-900/90 backdrop-blur-md border border-brand-500/30 rounded-2xl p-4 shadow-2xl flex items-center gap-4 relative overflow-hidden">
                {/* Glow effect */}
                <div className="absolute top-0 left-0 w-1 h-full bg-brand-500"></div>
                
                <div className="w-12 h-12 bg-brand-500/20 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner">
                    <i className="fa-solid fa-mobile-screen-button text-brand-400 text-xl"></i>
                </div>
                
                <div className="flex-grow min-w-0 flex flex-col">
                    <div className="font-bold text-white text-base">添加到主屏幕</div>
                    <div className="text-xs text-slate-400 flex items-center flex-wrap gap-1 mt-1">
                        <span>点击底部</span>
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700"><i className="fa-solid fa-arrow-up-from-bracket text-[10px]"></i></span>
                        <span>选择"添加到主屏幕"</span>
                    </div>
                </div>

                <button 
                    onClick={dismissHint} 
                    className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-white transition bg-slate-800/50 rounded-full flex-shrink-0 touch-manipulation active:scale-90"
                >
                    <i className="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden relative h-[100dvh]">
        {/* Preview Area / App Mode Container */}
        <div className={`
            transition-all duration-300 bg-slate-900 relative group flex flex-col
            ${viewMode === 'app' ? 'fixed inset-0 z-[9999] w-screen h-[100dvh] overscroll-none touch-none bg-black' : 'h-[50vh] md:h-auto md:flex-grow'}
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

              <iframe 
                srcDoc={getPreviewContent(item.content || '')}
                className="w-full h-full border-0 bg-white" 
                sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-modals allow-forms allow-popups allow-downloads"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay; payment; fullscreen; picture-in-picture; display-capture; execution-while-not-rendered; execution-while-out-of-viewport"
                style={{ touchAction: 'manipulation' }}
              />
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
            flex-1 md:w-96 md:flex-none bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex-col z-20 shadow-2xl overflow-hidden
            ${viewMode === 'app' ? 'hidden' : 'flex'}
        `}>
          <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
            {/* Author Info */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <img src={item.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author}`} className="w-12 h-12 rounded-full border-2 border-slate-700 object-cover" alt="Author" />
                <div>
                  <div className="font-bold text-white text-base">{item.author}</div>
                  <div className="text-xs text-slate-500">{new Date(item.created_at || '').toLocaleDateString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleReward}
                  className="text-xs bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-3 py-1.5 rounded-full font-bold transition shadow-lg shadow-orange-500/20 flex items-center gap-1 hover:from-yellow-600 hover:to-orange-600"
                >
                  <i className="fa-solid fa-gift"></i> 赏
                </button>
                <button 
                  onClick={handleShare}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-brand-400 px-3 py-1.5 rounded-full font-bold transition border border-slate-700 flex items-center gap-1"
                >
                  {showCopiedTip ? (
                    <>
                      <i className="fa-solid fa-check"></i> 已复制
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-share-nodes"></i> 分享
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
            
            {/* Description */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">关于作品</h3>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {item.description}
              </p>
            </div>

            {/* Prompt */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider flex items-center justify-between">
                <span>Prompt (提示词)</span>
                <button onClick={() => {navigator.clipboard.writeText(item.prompt || ''); alert('已复制');}} className="text-brand-400 hover:text-brand-300 text-[10px] flex items-center gap-1 transition">
                  <i className="fa-regular fa-copy"></i> 复制
                </button>
              </h3>
              <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 relative group max-h-60 overflow-y-auto custom-scrollbar">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">{item.prompt || '暂无 Prompt'}</pre>
              </div>
            </div>

            {/* Tags */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">类型</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {item.tags?.filter(tag => /[\u4e00-\u9fa5]/.test(tag)).map(tag => (
                  <span key={tag} className="bg-slate-800 text-blue-300 px-2 py-1 rounded text-xs border border-blue-700">{tag}</span>
                ))}
              </div>
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">技术栈</h3>
              <div className="flex flex-wrap gap-2">
                {item.tags?.filter(tag => !(/[\u4e00-\u9fa5]/.test(tag))).map(tag => (
                  <span key={tag} className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs border border-slate-700">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="p-6 border-t border-slate-800 bg-slate-900/95 backdrop-blur relative">
            <div className="absolute -top-5 right-6 bg-slate-900 border border-slate-700 px-4 py-1 rounded-full shadow-lg flex items-center gap-2">
              <span className="text-xs text-slate-400">价格</span>
              <span className="font-bold text-lg text-white">{item.price && item.price > 0 ? `¥${item.price}` : '免费'}</span>
            </div>

            <div className="flex gap-3 mt-2">
              <button 
                onClick={handleLike}
                className={`w-12 h-12 rounded-xl border flex items-center justify-center transition group ${isLiked ? 'bg-rose-500/10 text-rose-500 border-rose-500/50' : 'bg-slate-800 text-slate-400 hover:text-rose-500 border-slate-700 hover:bg-slate-700'}`}
              >
                <i className={`fa-solid fa-heart text-lg group-hover:scale-110 transition-transform`}></i>
              </button>
              <button 
                onClick={enterAppMode}
                className="flex-grow bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white h-12 rounded-xl font-bold shadow-lg shadow-brand-500/20 transition flex items-center justify-center gap-2 group"
              >
                <i className="fa-solid fa-play group-hover:scale-110 transition-transform"></i>
                <span>体验 APP</span>
              </button>
              <button 
                onClick={handleDownload}
                className="flex-grow bg-slate-800 hover:bg-slate-700 text-white h-12 rounded-xl font-bold transition flex items-center justify-center gap-2 group border border-slate-700"
              >
                <span>下载源码</span>
                <i className="fa-solid fa-download group-hover:translate-y-1 transition-transform text-slate-400 group-hover:text-white"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Share Modal Overlay */}
      {showShareModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeShareModal}></div>
            
            <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full flex flex-col items-center animate-float-up shadow-2xl">
                <div className="flex justify-between items-center w-full mb-4">
                    <h3 className="text-lg font-bold text-white">分享</h3>
                    <button onClick={closeShareModal} className="text-slate-400 hover:text-white transition">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>

                {isLocalhost && (
                    <div className="w-full mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-200 text-xs flex items-start gap-2">
                        <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                        <span>
                            检测到 localhost 环境。手机扫码可能无法访问。
                            <br/>
                            请使用本机局域网 IP (如 192.168.x.x:3000) 访问网页后再点击分享。
                        </span>
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
                                <span className="font-bold text-xl tracking-tight text-white ml-3">Spark<span className="text-brand-500">Vertex</span> 灵枢</span>
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
                                    <span className="text-xs font-medium text-slate-400">开发者：{item?.author}</span>
                                </div>
                            </div>

                            {/* QR Section - Split Layout */}
                            <div className="mt-auto grid grid-cols-2 gap-4">
                                {/* Detail QR */}
                                <div className="flex flex-col items-center text-center p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="bg-white p-1.5 rounded-lg mb-3 shadow-lg">
                                        <QRCodeCanvas 
                                            value={getDetailUrl()} 
                                            size={80}
                                            level={"M"}
                                            bgColor="#ffffff"
                                            fgColor="#000000"
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-white mb-0.5">产品详情</span>
                                    <span className="text-[10px] text-slate-500 scale-90">查看介绍与评价</span>
                                </div>

                                {/* App QR */}
                                <div className="flex flex-col items-center text-center p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 relative overflow-hidden">
                                    <div className="bg-white p-1.5 rounded-lg mb-3 shadow-lg relative">
                                        <QRCodeCanvas 
                                            value={getAppUrl()} 
                                            size={80}
                                            level={"M"}
                                            bgColor="#ffffff"
                                            fgColor="#000000"
                                            imageSettings={{
                                                src: qrIconDataUrl || "/logo.png",
                                                x: undefined,
                                                y: undefined,
                                                height: 20,
                                                width: 20,
                                                excavate: true,
                                            }}
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-brand-300 mb-0.5">全屏体验</span>
                                    <span className="text-[10px] text-brand-500/60 scale-90">添加到主屏幕</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Display Area */}
                <div className="relative w-full mb-6 flex justify-center min-h-[200px]">
                    {generatingImage && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50">
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500 mb-3"></i>
                            <span className="text-slate-300 text-sm font-medium animate-pulse">正在生成分享卡片...</span>
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
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                    >
                        <i className="fa-solid fa-download"></i> 保存图片
                    </button>
                    <button 
                        onClick={() => {
                            const url = `${window.location.origin}/p/${item.id}`;
                            try {
                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                    navigator.clipboard.writeText(url).then(() => alert('链接已复制'));
                                } else {
                                    // Fallback for non-secure contexts
                                    const textArea = document.createElement("textarea");
                                    textArea.value = url;
                                    document.body.appendChild(textArea);
                                    textArea.select();
                                    document.execCommand("copy");
                                    document.body.removeChild(textArea);
                                    alert('链接已复制');
                                }
                            } catch (err) {
                                console.error('Failed to copy:', err);
                                alert('复制失败，请手动复制');
                            }
                        }}
                        className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 text-sm"
                    >
                        <i className="fa-regular fa-copy"></i> 复制链接
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
          title="返回详情"
        >
          <i className="fa-solid fa-chevron-left group-hover:-translate-x-0.5 transition-transform"></i>
        </button>
      )}
    </div>
  );
}
