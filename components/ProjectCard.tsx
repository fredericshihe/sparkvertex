'use client';

import { useState, useEffect, useRef } from 'react';
import { Item } from '@/types/supabase';
import { getPreviewContent } from '@/lib/preview';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useLanguage } from '@/context/LanguageContext';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(mod => mod.QRCodeSVG), { ssr: false });

interface ProjectCardProps {
  item: Item;
  isLiked: boolean;
  onLike: (id: string) => void;
  onClick: (id: string) => void;
  isOwner?: boolean;
  onEdit?: (item: Item) => void;
  onUpdate?: (item: Item) => void; // 重新上传替换作品
  onDelete?: (id: string) => void;
  onHover?: (item: Item) => void;
  className?: string;
}

export default function ProjectCard({ item, isLiked, onLike, onClick, isOwner, onEdit, onUpdate, onDelete, onHover, className = '' }: ProjectCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  // Helper function to validate URL
  const isValidUrl = (url: string | undefined | null): boolean => {
    if (!url || typeof url !== 'string' || url.trim() === '') return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/');
  };

  // Prioritize cover_url over icon_url for card preview
  const coverImage = isValidUrl(item.cover_url) ? item.cover_url : 
                     isValidUrl(item.icon_url) ? item.icon_url : null;
  const hasValidCover = coverImage && !coverError;

  useEffect(() => {
    setIsClient(true);
    
    // 只有在可视区域内且没有封面图时才自动加载 iframe
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // 如果没有封面图，才自动加载 iframe 预览
          if (!hasValidCover) {
            setShowPreview(true);
          }
          observer.disconnect();
        }
      },
      { 
        rootMargin: '200px', 
        threshold: 0.01 
      }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasValidCover]);

  const handleMouseEnter = () => {
    if (onHover) onHover(item);
    setIsHovering(true);
    // 鼠标悬停时开始加载 iframe（延迟 200ms 避免快速划过时加载）
    if (hasValidCover && !showPreview) {
      hoverTimeoutRef.current = setTimeout(() => {
        setShowPreview(true);
      }, 200);
    }
  };

  const handleMouseLeave = () => {
    setIsFlipped(false);
    setIsHovering(false);
    // 取消悬停加载
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const generatePreviewHtml = (item: Item) => {
    if (!item.content) {
      return (
        <div className={`absolute inset-0 bg-gradient-to-br ${item.color || 'from-slate-700 to-slate-800'} opacity-20 flex items-center justify-center`}>
          <i className="fa-solid fa-code text-4xl text-white/50"></i>
        </div>
      );
    }

    // Show loading spinner if preview is requested but not loaded
    if (showPreview && !iframeLoaded) {
      return (
        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center z-10">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-brand-500 rounded-full animate-spin"></div>
        </div>
      );
    }

    return null;
  };

  // Memoize preview content
  const previewContent = showPreview && item.content ? getPreviewContent(item.content, { raw: true, appId: item.id ? String(item.id) : undefined }) : '';

  return (
    <div 
      ref={cardRef}
      className={`flip-card group cursor-pointer transition-transform duration-200 active:scale-95 touch-manipulation ${isFlipped ? 'flipped' : ''} ${className || 'h-72 md:h-80'}`} 
      onClick={() => !isFlipped && onClick(item.id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >

      {/* Mobile Flip Toggle - Top Center */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 z-40 md:hidden flex items-center justify-center cursor-pointer bg-slate-900/90 backdrop-blur-md border border-white/10 border-t-0 rounded-b-xl px-4 py-2 text-xs text-white shadow-lg transition-colors active:bg-slate-800"
        onClick={(e) => {
          e.stopPropagation();
          setIsFlipped(!isFlipped);
        }}
      >
        <i className={`fa-solid ${isFlipped ? 'fa-rotate-left' : 'fa-qrcode'} mr-1.5`}></i> 
        {isFlipped ? t.project_card.flip_back : t.project_card.scan}
      </div>

      <div className="flip-card-inner relative w-full h-full transition-all duration-500" style={{ transformStyle: 'preserve-3d' }}>
        {/* Front */}
        <div className="flip-card-front absolute inset-0 w-full h-full rounded-2xl overflow-hidden border border-white/10 bg-slate-900/40 backdrop-blur-md shadow-lg flex flex-col" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)' }}>
          
          {/* Trigger Zone - Desktop Only */}
          <div 
            className="flip-trigger-zone hidden md:flex" 
            onMouseEnter={() => setIsFlipped(true)}
          >
            <i className="fa-solid fa-qrcode mr-1"></i> {t.project_card.scan_experience}
          </div>

          <div className="h-40 md:h-44 relative bg-black/20 overflow-hidden flex-shrink-0" style={{ transform: 'translateZ(0)' }}>
            {/* Iframe Preview - 只在悬停且加载完成时显示 */}
            {showPreview && item.content && (
               <iframe
                 srcDoc={previewContent}
                 className={`w-[200%] h-[200%] border-0 origin-top-left scale-50 pointer-events-none select-none transition-opacity duration-300 ${
                   iframeLoaded && isHovering ? 'opacity-100' : 'opacity-0'
                 }`}
                 onLoad={() => setIframeLoaded(true)}
                 sandbox="allow-scripts allow-same-origin"
                 allow="autoplay 'none'; camera 'none'; microphone 'none'"
                 scrolling="no"
                 title={`Preview of ${item.title}`}
               />
            )}

            {/* Cover Image - 默认显示，悬停加载完成后淡出 */}
            {hasValidCover && (
              <div className={`absolute inset-0 z-20 bg-slate-900 transition-opacity duration-300 ${
                iframeLoaded && isHovering ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}>
                <Image 
                  src={coverImage!} 
                  alt={item.title} 
                  fill 
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onError={() => setCoverError(true)}
                />
              </div>
            )}

            {/* Overlay to prevent interaction with iframe on mobile causing about:srcdoc */}
            <div className="absolute inset-0 z-10 w-full h-full bg-transparent" />

            {generatePreviewHtml(item)}
            
            {/* Owner Actions */}
            {isOwner && (
              <div className="absolute top-2 left-2 z-20 flex gap-1.5" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'translateZ(0)' }}>
                {/* 编辑按钮 - 进入创作页面 */}
                <button 
                  onClick={(e) => { e.stopPropagation(); onEdit && onEdit(item); }}
                  className="w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white hover:bg-white hover:text-black transition flex items-center justify-center border border-white/10 shadow-lg"
                  title={t.project_card.edit}
                >
                  <i className="fa-solid fa-pen text-xs"></i>
                </button>
                {/* 更新按钮 - 重新上传替换 */}
                {!item.is_draft && onUpdate && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onUpdate(item); }}
                    className="w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white hover:bg-emerald-500 hover:text-white transition flex items-center justify-center border border-white/10 shadow-lg"
                    title={t.project_card?.update || '更新作品'}
                  >
                    <i className="fa-solid fa-arrow-up-from-bracket text-xs"></i>
                  </button>
                )}
                {/* 删除按钮 */}
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete && onDelete(item.id); }}
                  className="w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white hover:bg-rose-500 hover:text-white transition flex items-center justify-center border border-white/10 shadow-lg"
                  title={t.project_card.delete}
                >
                  <i className="fa-solid fa-trash text-xs"></i>
                </button>
              </div>
            )}

            {/* Badges */}
            <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'translateZ(0)' }}>
              {item.is_draft && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 shadow-lg">
                  <i className="fa-solid fa-pencil text-[10px]"></i> {t.project_card?.draft || 'Draft'}
                </span>
              )}
              {!item.is_draft && item.is_public === false && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md bg-black/60 text-slate-400 border border-white/10 flex items-center gap-1 shadow-lg">
                  <i className="fa-solid fa-lock text-[10px]"></i> {t.project_card.private}
                </span>
              )}
              {(item.total_score !== undefined && item.total_score > 0) && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                  <i className="fa-solid fa-shield-halved text-[10px]"></i> {item.total_score}
                </span>
              )}
            </div>
          </div>
          <div className="p-2 md:p-3 text-left flex flex-col flex-grow min-h-0">
            <h3 className="font-bold text-white text-xs md:text-sm mb-1 truncate w-full">{item.title}</h3>
            <p className="text-slate-400 text-[10px] md:text-xs line-clamp-2 mb-2 w-full break-words">{item.description || 'No description'}</p>
            
            <div className="flex-grow"></div>
            
            <div className="flex items-center justify-between pt-2 border-t border-white/10 gap-2 w-full">
              <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0 flex-1 overflow-hidden">
                <img 
                  src={item.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author}`} 
                  className="w-4 h-4 rounded-full flex-shrink-0 border border-white/10" 
                  alt="author" 
                  onError={(e) => {
                    e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author}`;
                  }}
                />
                <span className="truncate block max-w-full">{item.author}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex gap-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1" title={t.project_card.view}><i className="fa-solid fa-eye"></i> {item.page_views || 0}</span>
                  <span className="hidden sm:flex items-center gap-1" title={t.project_card.download}><i className="fa-solid fa-download"></i> {item.views || 0}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onLike(item.id); }} 
                    className="flex items-center gap-1 hover:scale-110 transition" 
                    title={t.project_card.like}
                  >
                    <i className={`fa-solid fa-heart ${isLiked ? 'text-rose-500' : ''}`}></i> {item.likes || 0}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Back (QR Code & Glass Effect) */}
        <div className="flip-card-back absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-zinc-900/40 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-col items-center justify-center relative" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
          
          {/* QR Code Content */}
          <div className="relative z-10 flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300">
            <div className="bg-white p-2 rounded-xl shadow-2xl">
              {isClient && (
                <QRCodeSVG 
                  value={`${window.location.origin}/p/${item.id}?mode=app`}
                  size={100}
                  level="M"
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              )}
            </div>
            <div className="text-center mt-4">
              <div className="text-white font-bold text-sm mb-1 drop-shadow-md flex items-center justify-center gap-2">
                <i className="fa-solid fa-qrcode"></i> {t.project_card.scan_now}
              </div>
              <div className="text-white/60 text-[10px] font-medium tracking-wide">{t.project_card.mobile_fullscreen}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
