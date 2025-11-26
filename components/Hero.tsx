'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { getPreviewContent } from '@/lib/preview';
import { QRCodeSVG } from 'qrcode.react';

// Fallback data in case database is empty
const DEMO_CARDS = [
  {
    id: 'demo-1',
    title: "AI 智能助手",
    description: "基于 GPT-4 的个人效率工具，支持语音对话和多模态输入。",
    tags: ["OpenAI", "Next.js", "Tailwind"],
    color: "from-purple-500 to-pink-500",
    icon: "fa-robot",
    code: `const ai = new AI.Agent({
  model: 'gpt-4',
  tools: ['web-search', 'code-interpreter'],
  temperature: 0.7
});

await ai.chat("Help me build a website");`
  },
  // ... other demo cards can remain as fallback
];

export default function Hero() {
  const { openDetailModal } = useModal();
  const [typingText, setTypingText] = useState('人人都是开发者的时代');
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [cards, setCards] = useState<any[]>(DEMO_CARDS);
  
  useEffect(() => {
    fetchRealItems();
  }, []);

  const fetchRealItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select(`
          id, title, description, tags, category, prompt, content, views, page_views, likes, price,
          profiles:author_id (
            username,
            avatar_url
          )
        `)
        .limit(5)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const mappedCards = data.map((item, index) => {
          const colors = [
            "from-purple-500 to-pink-500",
            "from-blue-500 to-cyan-500",
            "from-orange-500 to-red-500",
            "from-green-500 to-emerald-500",
            "from-indigo-500 to-violet-500"
          ];
          
          return {
            id: item.id,
            title: item.title,
            description: item.description,
            tags: item.tags || [],
            color: colors[index % colors.length],
            icon: 'fa-cube', // Default icon, not really used if we have preview
            code: item.prompt || item.content || `// No code preview available\n// ${item.title}`,
            content: item.content,
            author: Array.isArray(item.profiles) ? item.profiles[0]?.username : item.profiles?.username || 'Unknown',
            authorAvatar: Array.isArray(item.profiles) ? item.profiles[0]?.avatar_url : item.profiles?.avatar_url,
            likes: item.likes || 0,
            views: item.views || 0, // Downloads
            page_views: item.page_views || 0,
            price: item.price || 0
          };
        });
        setCards(mappedCards);
      }
    } catch (error) {
      console.error('Error fetching hero items:', error);
    }
  };

  useEffect(() => {
    const texts = ['人人都是开发者的时代', '本周热门工具', '开发者推荐', '极客精选'];
    let count = 0;
    let index = 0;
    let currentText = '';
    let letter = '';

    const type = () => {
      if (count === texts.length) {
        count = 0;
      }
      currentText = texts[count];
      letter = currentText.slice(0, ++index);

      setTypingText(letter);

      if (letter.length === currentText.length) {
        count++;
        index = 0;
        setTimeout(type, 2000);
      } else {
        setTimeout(type, 150);
      }
    };

    const timer = setTimeout(type, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Random card rotation
  useEffect(() => {
    if (isHovering) return;

    const interval = setInterval(() => {
      setIsFlipped(prev => !prev);
      setTimeout(() => {
        if (!isFlipped) { // Only change content when flipped to back (or about to flip back)
             setActiveCardIndex(prev => (prev + 1) % cards.length);
        }
      }, 350); // Change content halfway through flip
    }, 5000);

    return () => clearInterval(interval);
  }, [isFlipped, cards, isHovering]);

  const activeCard = cards[activeCardIndex];

  const generatePreviewHtml = (content: string, color: string) => {
    if (!content) {
      return (
        <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-20 flex items-center justify-center`}>
          <i className="fa-solid fa-code text-4xl text-white/50"></i>
        </div>
      );
    }

    return (
      <iframe 
        srcDoc={getPreviewContent(content)} 
        className="absolute inset-0 w-full h-full border-0 pointer-events-none bg-slate-900" 
        loading="lazy" 
        sandbox="allow-scripts"
      />
    );
  };

  return (
    <div className="relative overflow-hidden min-h-[85vh] flex flex-col items-center justify-center perspective-1000">
      {/* Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow pointer-events-none mix-blend-screen"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse-slow pointer-events-none mix-blend-screen" style={{ animationDelay: '2s' }}></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)] pointer-events-none"></div>

      {/* Floating Code Symbols */}
      <div className="absolute top-20 left-[10%] text-6xl font-mono font-bold text-slate-800/30 rotate-12 blur-[2px] animate-float pointer-events-none select-none">&lt;/&gt;</div>
      <div className="absolute bottom-40 right-[15%] text-8xl font-mono font-bold text-slate-800/30 -rotate-12 blur-[4px] animate-float-delayed pointer-events-none select-none">{`{}`}</div>

      {/* Main Hero Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 mt-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left: Text Content */}
          <div className="text-center lg:text-left">
            {/* Smart Developer Badge */}
            <div className="inline-flex relative group cursor-default mb-10 select-none z-20">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 via-brand-500 to-purple-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200 animate-gradient-xy"></div>
              <div className="relative px-6 py-2 bg-slate-900 ring-1 ring-white/10 rounded-full leading-none flex items-center gap-3 shadow-2xl">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-500/20 text-brand-400">
                  <i className="fa-solid fa-star text-xs"></i>
                </div>
                <div className="flex items-center">
                  <span className="font-mono text-slate-200 font-bold tracking-wide text-sm md:text-base">{typingText}</span>
                  <span className="w-2 h-4 bg-brand-500 ml-1 animate-pulse"></span>
                </div>
              </div>
            </div>

            {/* Headline */}
            <h1 className="stagger-item text-5xl md:text-7xl font-bold tracking-tighter leading-tight mb-8 text-white" style={{ animationDelay: '0.1s' }}>
              从灵感到现实<br />
              <span className="gradient-text">只需 5 分钟</span>
            </h1>

            {/* Subheadline */}
            <div className="stagger-item mt-4 mb-12" style={{ animationDelay: '0.2s' }}>
              <p className="text-lg md:text-xl text-slate-400 leading-relaxed mb-8">
                无需懂开发，无需懂编程。在这里，纯小白也能立刻将点子变为现实，并与大家分享这份喜悦。
              </p>
              
              <div 
                className="relative group cursor-pointer inline-block"
                onMouseEnter={() => { setIsHovering(true); setIsFlipped(true); }}
                onMouseLeave={() => { setIsHovering(false); setIsFlipped(false); }}
              >
                 {/* Glow Effect */}
                 <div className={`absolute -inset-4 bg-brand-500/20 rounded-xl blur-xl transition-all duration-500 ${isFlipped ? 'opacity-100 scale-110' : 'opacity-0 scale-90'}`}></div>
                 
                 <div className="relative flex items-center gap-4 p-2 rounded-xl transition-colors duration-300 hover:bg-white/5">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-500 ${isFlipped ? 'bg-brand-500 border-brand-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.5)] rotate-12' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                      <i className={`fa-solid fa-mobile-screen-button text-xl transition-transform duration-500 ${isFlipped ? 'scale-110' : ''}`}></i>
                    </div>

                    <div className="flex flex-col justify-center h-12">
                      <span className={`text-2xl font-bold transition-all duration-500 leading-none mb-1 ${isFlipped ? 'text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-purple-400 translate-x-1' : 'text-slate-300'}`}>
                        扫码即用，原生体验
                      </span>
                      <div className="h-5 overflow-hidden relative">
                        <span className={`absolute left-0 text-sm flex items-center gap-2 transition-all duration-500 ${isFlipped ? 'top-1/2 -translate-y-1/2 opacity-100' : 'top-full opacity-0'}`}>
                          <i className="fa-solid fa-arrow-right animate-bounce-x"></i> <span className="hidden lg:inline">立即查看右侧演示</span><span className="lg:hidden">立即查看下方演示</span>
                        </span>
                        <span className={`absolute left-0 text-sm flex items-center gap-2 transition-all duration-500 ${isFlipped ? '-top-full opacity-0' : 'top-1/2 -translate-y-1/2 opacity-100'}`}>
                          <i className="fa-solid fa-hand-pointer animate-pulse"></i> <span className="hidden lg:inline">悬停查看二维码</span><span className="lg:hidden">点击查看二维码</span>
                        </span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="stagger-item flex flex-col sm:flex-row lg:justify-start justify-center gap-6 mb-20" style={{ animationDelay: '0.3s' }}>
              <Link href="/guide" className="group relative px-8 py-4 rounded-full bg-white text-slate-900 font-bold text-lg hover:bg-slate-100 transition duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_40px_rgba(255,255,255,0.6)] overflow-hidden">
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-wand-magic-sparkles"></i> 开始创造
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition duration-700"></div>
              </Link>
              <Link href="/explore" className="px-8 py-4 rounded-full bg-slate-800/50 text-white font-bold text-lg border border-slate-700 hover:bg-slate-800 hover:border-brand-500 transition duration-300 backdrop-blur-sm flex items-center justify-center gap-2">
                <i className="fa-solid fa-lightbulb"></i> 探索灵感
              </Link>
            </div>
          </div>

          {/* Right: Prompt Display */}
          <div className="stagger-item mt-8 lg:mt-0" style={{ animationDelay: '0.4s' }}>
            <div className="relative group w-full max-w-md mx-auto" style={{ perspective: '1200px' }}>
              {/* Glow Effect */}
              <div className={`absolute -inset-4 bg-gradient-to-r ${activeCard.color} rounded-3xl blur-2xl opacity-30 group-hover:opacity-60 transition duration-500`}></div>
              
              {/* Flip Card Container */}
              <div 
                className={`h-80 flip-card group cursor-pointer transition-transform duration-200 active:scale-95 ${isFlipped ? 'flipped' : ''}`} 
                onClick={() => openDetailModal(activeCard.id, activeCard)}
                onMouseEnter={() => { setIsHovering(true); setIsFlipped(true); }}
                onMouseLeave={() => { setIsHovering(false); setIsFlipped(false); }}
              >
                <div className="flip-card-inner relative w-full h-full transition-all duration-700" style={{ transformStyle: 'preserve-3d' }}>
                  
                  {/* Front: Preview (Like ProjectCard) */}
                  <div className="flip-card-front absolute inset-0 w-full h-full rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800 shadow-2xl flex flex-col" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                    
                    {/* Trigger Zone for Flip */}
                    <div 
                      className={`absolute top-0 left-1/2 -translate-x-1/2 z-20 px-4 py-1 bg-black/50 backdrop-blur text-[10px] text-slate-300 rounded-b-lg cursor-help hover:bg-brand-600 hover:text-white transition-all duration-300 flex items-center gap-1 ${!isFlipped ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        setIsFlipped(true);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <i className="fa-solid fa-qrcode"></i> 扫码体验
                    </div>

                    <div className="h-44 relative bg-slate-900 overflow-hidden flex-shrink-0">
                      {generatePreviewHtml(activeCard?.content, activeCard?.color)}
                    </div>

                    <div className="p-4 text-left flex flex-col flex-grow">
                      <h3 className="font-bold text-white text-lg mb-1 truncate">{activeCard?.title || 'Loading...'}</h3>
                      <p className="text-slate-400 text-sm line-clamp-2 mb-3">{activeCard?.description || '...'}</p>
                      
                      <div className="flex-grow"></div>
                      
                      <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <img src={activeCard?.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activeCard?.author || 'default'}`} className="w-5 h-5 rounded-full" alt="author" />
                          <span className="truncate max-w-[80px]">{activeCard?.author || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><i className="fa-solid fa-eye"></i> {activeCard?.page_views || 0}</span>
                            <span className="flex items-center gap-1"><i className="fa-solid fa-heart"></i> {activeCard?.likes || 0}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${activeCard?.price > 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                            {activeCard?.price > 0 ? '¥' + activeCard?.price : '免费'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Back: QR Code */}
                  <div className="flip-card-back absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-slate-950 border border-brand-500/50 shadow-xl shadow-brand-500/10 flex flex-col items-center justify-center relative" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                    
                    {/* Prompt Background with Radial Mask */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex items-center justify-center">
                       <div className="absolute inset-0 opacity-40" style={{ maskImage: 'radial-gradient(circle at center, black 30%, transparent 100%)' }}>
                         <code className="text-[10px] text-brand-200/50 font-mono leading-3 break-all whitespace-pre-wrap block w-full h-full p-4">
                          {activeCard?.code || (
                            <>
                              # Task {activeCard?.title} # Keywords {(activeCard?.tags || []).join(', ')}
                              {/* Repeat content to fill background */}
                              {(activeCard?.description || '').repeat(10)}
                            </>
                          )}
                        </code>
                       </div>
                       {/* Center Glow */}
                       <div className="absolute w-40 h-40 bg-brand-500/20 blur-3xl rounded-full"></div>
                    </div>

                    {/* QR Code Content */}
                    <div className="relative z-10 flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300">
                      <div className="bg-white p-1.5 rounded-lg shadow-2xl">
                        <QRCodeSVG 
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/p/${activeCard?.id}?mode=app`}
                          size={130}
                          level="M"
                          fgColor="#000000"
                          bgColor="#ffffff"
                        />
                      </div>
                      <div className="text-center mt-3">
                        <div className="text-brand-400 font-bold text-sm mb-1 drop-shadow-md"><i className="fa-solid fa-mobile-screen-button mr-1"></i> 扫码即刻体验</div>
                        <div className="text-slate-400 text-[10px] drop-shadow-md">手机全屏模式运行</div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
