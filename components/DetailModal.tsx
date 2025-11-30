'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { Item } from '@/types/supabase';
import html2canvas from 'html2canvas';
import dynamic from 'next/dynamic';
import { getPreviewContent } from '@/lib/preview';
import AddToHomeScreenGuide from '@/components/AddToHomeScreenGuide';
import { copyToClipboard } from '@/lib/utils';

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(mod => mod.QRCodeCanvas), { ssr: false });

export default function DetailModal() {
  const { isDetailModalOpen, closeDetailModal, detailItemId, detailItemData, openLoginModal, openPaymentModal, openRewardModal } = useModal();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showCopiedTip, setShowCopiedTip] = useState(false);
  
  // View Mode: 'detail' (default) or 'app' (immersive)
  const [viewMode, setViewMode] = useState<'detail' | 'app'>('detail');

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const [shareImageUrl, setShareImageUrl] = useState<string>('');

  // QR Code Icon Data URL
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
    if (isDetailModalOpen && detailItemId) {
      if (detailItemData) {
        setItem(detailItemData);
        setLikesCount(detailItemData.likes || 0);
        setLoading(false);
        checkIfLiked(detailItemId);
        incrementViews(detailItemId);
        // Background refresh
        fetchItemDetails(detailItemId, false);
      } else {
        fetchItemDetails(detailItemId, true);
      }
    } else {
      setItem(null);
      setViewMode('detail');
    }
  }, [isDetailModalOpen, detailItemId, detailItemData]);

  useEffect(() => {
    if (item?.icon_url) {
        // Convert external URL to Data URL to prevent canvas tainting
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

  const fetchItemDetails = async (id: string, showLoading = true) => {
    if (showLoading) setLoading(true);
    const { data, error } = await supabase
      .from('items')
      .select(`
        *,
        profiles:author_id (
          username,
          avatar_url
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching item details:', error);
      if (showLoading) closeDetailModal();
    } else {
      const formattedItem = {
        ...data,
        author: data.profiles?.username || 'Unknown',
        authorAvatar: data.profiles?.avatar_url
      };
      setItem(formattedItem);
      setLikesCount(formattedItem.likes || 0);
      if (showLoading) {
        checkIfLiked(id);
        incrementViews(id);
      }
    }
    if (showLoading) setLoading(false);
  };

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
    setItem(prev => prev ? ({ ...prev, page_views: (prev.page_views || 0) + 1 }) : null);

    // Validate UUID to prevent DB errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(itemId)) {
        return;
    }

    // Use RPC for secure increment
    const { error } = await supabase.rpc('increment_views', { item_id: itemId });
    
    if (error) {
      console.error('Failed to increment views:', error);
    }
  };

  const incrementDownloads = async (itemId: string) => {
    // Optimistic update
    setItem(prev => prev ? ({ ...prev, views: (prev.views || 0) + 1 }) : null);

    // Use RPC for secure increment
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
      await supabase.from('likes').delete().match({ user_id: session.user.id, item_id: detailItemId });
      setLikesCount(prev => prev - 1);
      setIsLiked(false);
    } else {
      await supabase.from('likes').insert({ user_id: session.user.id, item_id: detailItemId });
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
    if (!item) return;
    setShowShareModal(true);
    setGeneratingImage(true);
    setShareImageUrl(''); // Reset previous image
    
    // Wait for modal to render
    setTimeout(async () => {
        if (shareRef.current) {
            try {
                // Wait for all images to load explicitly
                const images = Array.from(shareRef.current.getElementsByTagName('img'));
                await Promise.all(images.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                }));

                const canvas = await html2canvas(shareRef.current, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null,
                    scale: 2, // High resolution
                    logging: false,
                    onclone: (clonedDoc) => {
                        // Ensure images in cloned document have crossOrigin set
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

  const enterAppMode = () => {
    if (item) {
      // Force hard navigation to ensure browser picks up the correct manifest for PWA installation
      window.location.href = `/p/${item.id}?mode=app`;
    }
  };

  const exitAppMode = () => {
    setViewMode('detail');
  };

  const handleDownload = async () => {
    if (!item) return;
    
    // Check Login
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }

    // Check Price & Purchase Status
    if (item.price && item.price > 0) {
      // Allow author to download their own item
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
    
    // Increment download count
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

  const getShareUrl = () => {
    if (typeof window !== 'undefined' && item) {
      return `${window.location.origin}/p/${item.id}`;
    }
    return '';
  };

  const getAppUrl = () => {
    if (typeof window !== 'undefined' && item) {
      return `${window.location.origin}/p/${item.id}?mode=app`;
    }
    return '';
  };

  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

  if (!isDetailModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md touch-none" onClick={closeDetailModal}></div>
      <div className="absolute inset-0 md:inset-10 bg-slate-900 md:rounded-2xl border-0 md:border border-slate-700 flex flex-col overflow-hidden shadow-2xl animate-float-up max-w-7xl mx-auto overscroll-contain">
        
        {/* Header */}
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-4 md:px-6 bg-slate-900/50 backdrop-blur-md z-30 relative flex-shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-2 h-6 bg-brand-500 rounded-full flex-shrink-0"></div>
            <h2 className="text-lg font-bold text-white truncate">{loading ? 'Loading...' : item?.title}</h2>
          </div>
          <button onClick={viewMode === 'app' ? exitAppMode : closeDetailModal} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition text-slate-400 hover:text-white flex-shrink-0">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden relative">
          {/* Preview Area */}
          <div className={`
            bg-slate-900 relative group flex flex-col transition-all duration-300
            ${viewMode === 'app' ? 'absolute inset-0 z-50 w-full h-full' : 'h-[40vh] md:h-auto md:flex-grow'}
          `}>
            
            <div className={`flex-grow relative bg-slate-900 overflow-hidden ${viewMode === 'app' ? 'w-full h-full' : 'flex justify-center items-center p-4 md:p-8'}`}>
              {loading ? (
                <i className="fa-solid fa-circle-notch fa-spin text-4xl text-brand-500"></i>
              ) : (
                <>
                  <div 
                    style={{ 
                      aspectRatio: viewMode === 'app' || previewMode === 'desktop' ? 'auto' : previewMode === 'tablet' ? '3/4' : '9/19.5' 
                    }}
                    className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-slate-900 flex-shrink-0 max-w-full ${
                      viewMode === 'app' || previewMode === 'desktop' 
                        ? 'w-full h-full rounded-none border-0' 
                        : previewMode === 'tablet'
                          ? 'h-[85%] md:h-[90%] w-auto rounded-[1.5rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50'
                          : 'h-[85%] md:h-[90%] w-auto rounded-[2.5rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50'
                    }`}
                  >
                    {/* Mobile Notch */}
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 bg-slate-800 z-20 transition-all duration-300 ${
                        previewMode === 'mobile' && viewMode !== 'app' ? 'w-24 h-6 rounded-b-xl opacity-100' : 'w-0 h-0 opacity-0'
                    }`}></div>

                    <iframe 
                      srcDoc={getPreviewContent(item?.content || '')} 
                      className="w-full h-full border-0 bg-white" 
                      sandbox="allow-scripts allow-pointer-lock allow-modals allow-forms allow-popups"
                      allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay"
                    />
                  </div>
                  
                  {/* Preview Watermark */}
                  {viewMode !== 'app' && (
                    <div className="absolute top-6 right-6 bg-black/60 backdrop-blur-sm border border-white/10 px-4 py-2 rounded-full text-white text-xs font-bold flex items-center gap-2 pointer-events-none z-20">
                      <i className="fa-solid fa-eye"></i>
                      <span>仅预览模式</span>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Preview Controls */}
            {viewMode !== 'app' && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition duration-300 z-10 hidden md:flex">
                <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full p-1 flex">
                  <button onClick={() => setPreviewMode('desktop')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-desktop"></i></button>
                  <button onClick={() => setPreviewMode('tablet')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-tablet-screen-button"></i></button>
                  <button onClick={() => setPreviewMode('mobile')} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}><i className="fa-solid fa-mobile-screen"></i></button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Info */}
          <div className={`
            flex-1 md:w-96 md:flex-none bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col z-20 shadow-2xl overflow-hidden
            ${viewMode === 'app' ? 'hidden' : 'flex'}
          `}>
            {loading ? (
              <div className="p-6 flex justify-center"><i className="fa-solid fa-circle-notch fa-spin text-brand-500"></i></div>
            ) : (
              <>
                <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
                  {/* Author Info */}
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <img src={item?.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item?.author}`} className="w-12 h-12 rounded-full border-2 border-slate-700 object-cover" alt="Author" />
                      <div>
                        <div className="font-bold text-white text-base">{item?.author}</div>
                        <div className="text-xs text-slate-500">{new Date(item?.created_at || '').toLocaleDateString()}</div>
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
                      <span className="font-bold text-white text-sm">{item?.page_views || 0}</span>
                    </div>
                    <div className="flex flex-col items-center text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <i className="fa-solid fa-download text-slate-500 mb-1 text-xs"></i>
                      <span className="font-bold text-white text-sm">{item?.views || 0}</span>
                    </div>
                    <div className="flex flex-col items-center text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <i className={`fa-solid fa-heart mb-1 text-xs ${isLiked ? 'text-rose-500' : 'text-slate-500'}`}></i>
                      <span className="font-bold text-white text-sm">{likesCount}</span>
                    </div>
                    <div className="flex flex-col items-center text-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <i className="fa-solid fa-file-code text-blue-400 mb-1 text-xs"></i>
                      <span className="font-bold text-white text-sm">{Math.round((item?.content?.length || 0) / 1024)}KB</span>
                    </div>
                  </div>
                  
                  {/* Description */}
                  <div className="mb-8">
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">关于作品</h3>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {item?.description}
                    </p>
                  </div>

                  {/* Prompt */}
                  <div className="mb-8">
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider flex items-center justify-between">
                      <span>Prompt (提示词)</span>
                      <button onClick={() => {copyToClipboard(item?.prompt || '').then(() => alert('已复制'));}} className="text-brand-400 hover:text-brand-300 text-[10px] flex items-center gap-1 transition">
                        <i className="fa-regular fa-copy"></i> 复制
                      </button>
                    </h3>
                    <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 relative group max-h-60 overflow-y-auto custom-scrollbar">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">{item?.prompt || '暂无 Prompt'}</pre>
                    </div>
                  </div>

                  {/* 分类标签与技术栈标签分组显示 */}
                  <div className="mb-8">
                    {/* 类型标签（中文） */}
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">类型</h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {item?.tags?.filter(tag => /[\u4e00-\u9fa5]/.test(tag)).map(tag => (
                        <span key={tag} className="bg-slate-800 text-blue-300 px-2 py-1 rounded text-xs border border-blue-700">{tag}</span>
                      ))}
                    </div>
                    {/* 技术栈标签（英文/数字/特殊） */}
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">技术栈</h3>
                    <div className="flex flex-wrap gap-2">
                      {item?.tags?.filter(tag => !(/[\u4e00-\u9fa5]/.test(tag))).map(tag => (
                        <span key={tag} className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs border border-slate-700">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="p-6 border-t border-slate-800 bg-slate-900/95 backdrop-blur relative">
                  {/* Price Tag */}
                  <div className="absolute -top-5 right-6 bg-slate-900 border border-slate-700 px-4 py-1 rounded-full shadow-lg flex items-center gap-2">
                    <span className="text-xs text-slate-400">价格</span>
                    <span className="font-bold text-lg text-white">{item?.price && item.price > 0 ? `¥${item.price}` : '免费'}</span>
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
              </>
            )}
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
                                        src={qrIconDataUrl || item?.icon_url || defaultIconDataUrl || "/icons/icon-512x512.png"} 
                                        className="w-full h-full object-cover" 
                                        alt="App Icon" 
                                        crossOrigin={!qrIconDataUrl && item?.icon_url && !item.icon_url.startsWith('data:') ? "anonymous" : undefined}
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            const fallback = defaultIconDataUrl || "/icons/icon-512x512.png";
                                            // Avoid infinite loop if fallback also fails
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
                                            value={getShareUrl()} 
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
                            link.download = `share-${item?.title || 'spark-vertex'}.png`;
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
                            if (item) {
                                const url = `${window.location.origin}/p/${item.id}`;
                                copyToClipboard(url).then(() => alert('链接已复制'));
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
    </div>
  );
}
