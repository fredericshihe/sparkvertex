'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Item } from '@/types/supabase';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/context/LanguageContext';
import { KNOWN_CATEGORIES } from '@/lib/categories';
import { getLightPreviewContent } from '@/lib/preview';

import { supabase } from '@/lib/supabase';

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

function ProjectCard({ item, isLiked, onLike, onClick, isOwner, onEdit, onUpdate, onDelete, onHover, className = '' }: ProjectCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false); // 桌面端悬停状态
  const [iframeLoaded, setIframeLoaded] = useState(false); // iframe 加载状态
  const [itemContent, setItemContent] = useState<string | null>(item.content || null); // 按需加载的 content
  const [contentLoading, setContentLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { t } = useLanguage();

  // 使用 cover_url 静态图片，如果没有则使用占位符
  const coverUrl = item.cover_url || item.icon_url;
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 懒加载：只在卡片进入视口附近时才加载图片
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const rootMarginValue = isMobile ? '100px' : '200px';
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { 
        rootMargin: rootMarginValue, 
        threshold: 0 
      }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (onHover) onHover(item);
    // 延迟 300ms 后显示 iframe，避免快速划过时触发
    hoverTimeoutRef.current = setTimeout(async () => {
      setIsHovered(true);
      // 如果没有 content，按需加载
      if (!itemContent && !contentLoading) {
        setContentLoading(true);
        try {
          const { data } = await supabase
            .from('items')
            .select('content')
            .eq('id', item.id)
            .single();
          if (data?.content) {
            setItemContent(data.content);
          }
        } catch (e) {
          console.warn('Failed to load content for preview:', e);
        } finally {
          setContentLoading(false);
        }
      }
    }, 300);
  }, [onHover, item, itemContent, contentLoading]);

  const handleMouseLeave = useCallback(() => {
    setIsFlipped(false);
    // 清除延迟定时器
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
    setIframeLoaded(false);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Get category icon
  const categoryKey = item.category ? (KNOWN_CATEGORIES[item.category]?.key || 'tool') : 'tool';
  const categoryIcon = KNOWN_CATEGORIES[item.category]?.icon || 'fa-code';
  
  // 生成基于内容的渐变背景色（用于没有封面的情况）
  const idString = String(item.id || '000000');
  const gradientSeed = idString.slice(-6).padStart(6, '0');
  const hue1 = parseInt(gradientSeed.slice(0, 2), 16) % 360;
  const hue2 = (hue1 + 40) % 360;

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

          <div className="h-40 md:h-44 relative bg-slate-900 overflow-hidden flex-shrink-0" style={{ transform: 'translateZ(0)' }}>
            {/* 渐变背景占位符 - 秒开体验 */}
            <div 
              className={`absolute inset-0 transition-opacity duration-300 ${imageLoaded || iframeLoaded ? 'opacity-0' : 'opacity-100'}`}
              style={{
                background: coverUrl 
                  ? 'linear-gradient(135deg, rgb(30, 41, 59), rgb(15, 23, 42))'
                  : `linear-gradient(135deg, hsl(${hue1}, 40%, 25%), hsl(${hue2}, 50%, 15%))`
              }}
            >
              {/* 分类图标占位 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <i className={`fa-solid ${categoryIcon} text-3xl text-white/20`}></i>
              </div>
            </div>

            {/* 静态封面图片 - 极速加载 */}
            {isVisible && coverUrl && !isHovered && (
              <img
                src={coverUrl}
                alt={item.title}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={handleImageLoad}
                loading="lazy"
                decoding="async"
              />
            )}

            {/* 桌面端悬停时显示动态 iframe 预览 */}
            {isVisible && isHovered && itemContent && (
              <>
                {/* 封面图作为 iframe 加载时的占位 */}
                {!iframeLoaded && coverUrl && (
                  <img
                    src={coverUrl}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <iframe
                  srcDoc={getLightPreviewContent(itemContent)}
                  className={`absolute inset-0 w-full h-full border-0 pointer-events-none transition-opacity duration-300 ${
                    iframeLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  sandbox="allow-same-origin"
                  loading="lazy"
                  onLoad={() => setIframeLoaded(true)}
                />
              </>
            )}

            {/* 悬停时正在加载 content */}
            {isVisible && isHovered && !itemContent && contentLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                <i className="fa-solid fa-circle-notch fa-spin text-white/60 text-xl"></i>
              </div>
            )}
            
            {/* 无封面时显示渐变 + 图标 */}
            {isVisible && !coverUrl && !isHovered && (
              <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, hsl(${hue1}, 40%, 25%), hsl(${hue2}, 50%, 15%))`
                }}
              >
                <i className={`fa-solid ${categoryIcon} text-4xl text-white/30`}></i>
              </div>
            )}
            
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

// 使用 memo 防止不必要的重渲染
export default memo(ProjectCard, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.isLiked === nextProps.isLiked &&
    prevProps.item.likes === nextProps.item.likes &&
    prevProps.isOwner === nextProps.isOwner
  );
});