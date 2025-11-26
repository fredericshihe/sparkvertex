'use client';

import { useState, useEffect, useRef } from 'react';
import { Item } from '@/types/supabase';
import { getPreviewContent } from '@/lib/preview';
import { QRCodeSVG } from 'qrcode.react';

interface ProjectCardProps {
  item: Item;
  isLiked: boolean;
  onLike: (id: string) => void;
  onClick: (id: string) => void;
  isOwner?: boolean;
  onEdit?: (item: Item) => void;
  onDelete?: (id: string) => void;
}

export default function ProjectCard({ item, isLiked, onLike, onClick, isOwner, onEdit, onDelete }: ProjectCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
    
    // Check if desktop (md breakpoint)
    const isDesktop = window.innerWidth >= 768;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (isDesktop) {
          // Desktop: Load once and keep loaded for smoother scrolling
          if (entry.isIntersecting) {
            setIsVisible(true);
            // Optional: Stop observing once loaded to save resources
            if (cardRef.current) observer.unobserve(cardRef.current);
          }
        } else {
          // Mobile: Toggle visibility to save memory (aggressive virtualization)
          setIsVisible(entry.isIntersecting);
        }
      },
      { 
        rootMargin: isDesktop ? '400px' : '100px', // Larger preload area on desktop
        threshold: 0.01
      }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
      observer.disconnect();
    };
  }, []);

  const generatePreviewHtml = (item: Item) => {
    if (!item.content) {
      return (
        <div className={`absolute inset-0 bg-gradient-to-br ${item.color || 'from-slate-700 to-slate-800'} opacity-20 flex items-center justify-center`}>
          <i className="fa-solid fa-code text-4xl text-white/50"></i>
        </div>
      );
    }

    if (!isVisible) {
      return (
        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-brand-500 rounded-full animate-spin"></div>
        </div>
      );
    }

    // Use srcDoc for better compatibility and performance
    const previewContent = getPreviewContent(item.content);
    
    return (
      <iframe 
        srcDoc={previewContent}
        className="absolute inset-0 w-full h-full border-0 pointer-events-none bg-white" 
        loading="lazy" 
        sandbox="allow-scripts allow-forms allow-modals"
        allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; autoplay"
      />
    );
  };

  return (
    <div 
      ref={cardRef}
      className={`h-80 flip-card group cursor-pointer transition-transform duration-200 active:scale-95 touch-manipulation ${isFlipped ? 'flipped' : ''}`} 
      onClick={() => onClick(item.id)}
      onMouseLeave={() => setIsFlipped(false)}
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
        {isFlipped ? '返回' : '扫码'}
      </div>

      <div className="flip-card-inner relative w-full h-full transition-all duration-500" style={{ transformStyle: 'preserve-3d' }}>
        {/* Front */}
        <div className="flip-card-front absolute inset-0 w-full h-full rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800 shadow-lg flex flex-col" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)' }}>
          
          {/* Trigger Zone - Desktop Only */}
          <div 
            className="flip-trigger-zone hidden md:flex" 
            onMouseEnter={() => setIsFlipped(true)}
          >
            <i className="fa-solid fa-qrcode mr-1"></i> 扫码体验
          </div>

          <div className="h-44 relative bg-white overflow-hidden flex-shrink-0" style={{ transform: 'translateZ(0)' }}>
            {generatePreviewHtml(item)}
            
            {/* Owner Actions */}
            {isOwner && (
              <div className="absolute top-2 left-2 z-20 flex gap-2" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'translateZ(0)' }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); onEdit && onEdit(item); }}
                  className="w-7 h-7 rounded-full bg-slate-900/80 backdrop-blur text-white hover:bg-brand-600 transition flex items-center justify-center border border-slate-700 shadow-lg"
                  title="编辑作品"
                >
                  <i className="fa-solid fa-pen text-xs"></i>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete && onDelete(item.id); }}
                  className="w-7 h-7 rounded-full bg-slate-900/80 backdrop-blur text-white hover:bg-rose-600 transition flex items-center justify-center border border-slate-700 shadow-lg"
                  title="删除作品"
                >
                  <i className="fa-solid fa-trash text-xs"></i>
                </button>
              </div>
            )}

            {/* AI Verified Badge */}
            {(item.tags || []).includes('AI Verified') && (
              <div className="absolute top-2 right-2" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'translateZ(0)' }}>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                  <i className="fa-solid fa-certificate"></i> AI 认证
                </span>
              </div>
            )}
          </div>
          <div className="p-3 text-left flex flex-col flex-grow">
            <h3 className="font-bold text-white text-sm mb-1 truncate">{item.title}</h3>
            <p className="text-slate-400 text-xs line-clamp-2 mb-2">{item.description || 'No description'}</p>
            
            <div className="flex-grow"></div>
            
            <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <img src={item.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author}`} className="w-4 h-4 rounded-full" alt="author" />
                <span className="truncate">{item.author}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1" title="查看"><i className="fa-solid fa-eye"></i> {item.page_views || 0}</span>
                  <span className="flex items-center gap-1" title="下载"><i className="fa-solid fa-download"></i> {item.views || 0}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onLike(item.id); }} 
                    className="flex items-center gap-1 hover:scale-110 transition" 
                    title="点赞"
                  >
                    <i className={`fa-solid fa-heart ${isLiked ? 'text-rose-500' : ''}`}></i> {item.likes || 0}
                  </button>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.price > 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                  {item.price > 0 ? '¥' + item.price : '免费'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Back (QR Code & Prompt Background) */}
        <div className="flip-card-back absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/50 shadow-xl flex flex-col items-center justify-center relative" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
          
          {/* Prompt Background with Radial Mask */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex items-center justify-center">
             <div className="absolute inset-0 opacity-40" style={{ maskImage: 'radial-gradient(circle at center, black 30%, transparent 100%)' }}>
               <code className="text-[10px] text-slate-500/30 font-mono leading-3 break-all whitespace-pre-wrap block w-full h-full p-4">
                {item.prompt || (
                  <>
                    # Task {item.title} # Keywords {(item.tags || []).join(', ')}
                    {/* Repeat content to fill background */}
                    {(item.description || '').repeat(10)}
                  </>
                )}
              </code>
             </div>
             {/* Center Glow - Dynamic Color */}
             <div className={`absolute w-40 h-40 bg-gradient-to-r ${item.color || 'from-purple-500 to-pink-500'} opacity-20 blur-3xl rounded-full`}></div>
          </div>

          {/* QR Code Content */}
          <div className="relative z-10 flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300">
            <div className="bg-white p-1.5 rounded-lg shadow-2xl">
              {isClient && (
                <QRCodeSVG 
                  value={`${window.location.origin}/p/${item.id}?mode=app`}
                  size={130}
                  level="M"
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              )}
            </div>
            <div className="text-center mt-3">
              <div className="text-white font-bold text-sm mb-1 drop-shadow-md"><i className="fa-solid fa-mobile-screen-button mr-1"></i> 扫码即刻体验</div>
              <div className="text-slate-400 text-[10px] drop-shadow-md">手机全屏模式运行</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
