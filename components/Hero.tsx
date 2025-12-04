'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { getPreviewContent } from '@/lib/preview';
import { useLanguage } from '@/context/LanguageContext';

const QRCodeSVG = dynamic(() => import('qrcode.react').then(mod => mod.QRCodeSVG), { ssr: false });

const CARD_COLORS = [
  "from-purple-500 to-pink-500",
  "from-blue-500 to-cyan-500",
  "from-orange-500 to-red-500",
  "from-green-500 to-emerald-500",
  "from-indigo-500 to-violet-500"
];

export default function Hero() {
  const { openDetailModal, openFeedbackModal } = useModal();
  const { t, language } = useLanguage();

  const demoCards = [
    {
      id: 'demo-1',
      title: t.home.demo_card_title,
      description: t.home.demo_card_desc,
      tags: ["AI", "Next.js", "Tailwind"],
      color: CARD_COLORS[0],
      icon: "fa-robot",
      code: `const ai = new AI.Agent({
  model: 'advanced-llm-v3',
  tools: ['web-search', 'code-interpreter'],
  temperature: 0.7
});

await ai.chat("Help me build a website");`
    }
  ];

  const [typingText, setTypingText] = useState(t.home.typing_texts[0]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [cards, setCards] = useState<any[]>(demoCards);
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
    fetchRealItems();
  }, []);

  const fetchRealItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select(`
          id, title, description, tags, prompt, content, downloads, page_views, likes, price, icon_url, daily_rank,
          total_score, quality_score, richness_score, utility_score, analysis_reason, analysis_reason_en,
          profiles:author_id (
            username,
            avatar_url
          )
        `)
        .eq('is_public', true)
        .order('daily_rank', { ascending: true })
        .limit(5);

      if (error) {
        console.error('Error fetching hero items:', error);
        return;
      }

      if (data && data.length > 0) {
        const mappedCards = data.map((item: any, index) => {
          return {
            id: item.id,
            title: item.title,
            description: item.description,
            tags: item.tags || [],
            color: CARD_COLORS[index % CARD_COLORS.length],
            icon: 'fa-cube', // Default icon, not really used if we have preview
            code: item.prompt || item.content || `// No code preview available\n// ${item.title}`,
            content: item.content,
            author: Array.isArray(item.profiles) ? item.profiles[0]?.username : item.profiles?.username || 'Unknown',
            authorAvatar: Array.isArray(item.profiles) ? item.profiles[0]?.avatar_url : item.profiles?.avatar_url,
            likes: item.likes || 0,
            downloads: item.downloads || 0,
            page_views: item.page_views || 0,
            price: item.price || 0,
            total_score: item.total_score,
            quality_score: item.quality_score,
            richness_score: item.richness_score,
            utility_score: item.utility_score,
            analysis_reason: item.analysis_reason,
            analysis_reason_en: item.analysis_reason_en
          };
        });
        setCards(mappedCards);
      }
    } catch (error) {
      console.error('Error fetching hero items:', error);
    }
  };

  useEffect(() => {
    const texts = t.home.typing_texts;
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
  }, [language]); // Re-run when language changes

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

  const cardContent = (
    <div className="relative group w-full max-w-md mx-auto" style={{ perspective: '1200px' }}>
      {/* Glow Effect - Stacked for smooth transition */}
      {CARD_COLORS.map((color) => (
        <div 
          key={color}
          className={`absolute -inset-4 bg-gradient-to-r ${color} rounded-3xl blur-2xl transition-opacity duration-1000 will-change-[opacity] ${activeCard.color === color ? 'opacity-30 group-hover:opacity-60' : 'opacity-0'}`}
        ></div>
      ))}
      
      {/* Flip Card Container */}
      <div 
        className={`h-[360px] md:h-80 flip-card group cursor-pointer transition-transform duration-200 active:scale-95 ${isFlipped ? 'flipped' : ''}`} 
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
              <i className="fa-solid fa-qrcode"></i> {t.home.scan_experience}
            </div>

            <div className="h-[220px] md:h-44 relative bg-slate-900 overflow-hidden flex-shrink-0">
              {generatePreviewHtml(activeCard?.content, activeCard?.color)}
              
              {/* Badges */}
              <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end">
                {(activeCard?.total_score !== undefined && activeCard?.total_score > 0) && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                    <i className="fa-solid fa-shield-halved text-[10px]"></i> {activeCard.total_score}
                  </span>
                )}
              </div>
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
                    {activeCard?.price > 0 ? '¥' + activeCard?.price : t.home.free}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Back: QR Code */}
          <div className="flip-card-back absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-700/50 shadow-xl flex flex-col items-center justify-center relative" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            
            {/* Prompt Background with Radial Mask */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex items-center justify-center">
               <div className="absolute inset-0 opacity-40" style={{ maskImage: 'radial-gradient(circle at center, black 30%, transparent 100%)' }}>
                 <code className="text-[10px] text-slate-500/30 font-mono leading-3 break-all whitespace-pre-wrap block w-full h-full p-4">
                  {activeCard?.code || (
                    <>
                      # Task {activeCard?.title} # Keywords {(activeCard?.tags || []).join(', ')}
                      {/* Repeat content to fill background */}
                      {(activeCard?.description || '').repeat(10)}
                    </>
                  )}
                </code>
               </div>
               {/* Center Glow - Dynamic Color */}
               <div className={`absolute w-40 h-40 bg-gradient-to-r ${activeCard.color} opacity-20 blur-3xl rounded-full`}></div>
            </div>

            {/* QR Code Content */}
            <div className="relative z-10 flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300">
              <div className="bg-white p-1.5 rounded-lg shadow-2xl">
                {isClient && (
                  <QRCodeSVG 
                    value={`${window.location.origin}/p/${activeCard?.id}?mode=app`}
                    size={130}
                    level="M"
                    fgColor="#000000"
                    bgColor="#ffffff"
                  />
                )}
              </div>
              <div className="text-center mt-3">
                <div className="text-white font-bold text-sm mb-1 drop-shadow-md"><i className="fa-solid fa-mobile-screen-button mr-1"></i> {t.home.scan_hint}</div>
                <div className="text-slate-400 text-[10px] drop-shadow-md">{t.home.mobile_fullscreen}</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative overflow-hidden min-h-screen flex flex-col items-center justify-center perspective-1000">
      {/* Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse-slow pointer-events-none mix-blend-screen"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse-slow pointer-events-none mix-blend-screen" style={{ animationDelay: '2s' }}></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)] pointer-events-none"></div>

      {/* Floating Code Symbols */}
      <div className="absolute top-20 left-[10%] text-6xl font-mono font-bold text-slate-800/30 rotate-12 blur-[2px] animate-float pointer-events-none select-none">&lt;/&gt;</div>
      <div className="absolute bottom-40 right-[15%] text-8xl font-mono font-bold text-slate-800/30 -rotate-12 blur-[4px] animate-float-delayed pointer-events-none select-none">{`{}`}</div>

      {/* Main Hero Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-center">
          
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
              {t.home.hero_title_1}<br />
              <span className="gradient-text">{t.home.hero_title_2}</span>
            </h1>

            {/* Subheadline */}
            <div className="stagger-item mt-4 mb-12" style={{ animationDelay: '0.2s' }}>
              <p className="text-lg md:text-xl text-slate-400 leading-relaxed mb-8">
                {t.home.hero_desc}
              </p>
              
              <div 
                className="relative group cursor-pointer hidden lg:inline-block"
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
                        {t.home.scan_native}
                      </span>
                      <div className="h-5 overflow-hidden relative">
                        <span className={`absolute left-0 text-sm flex items-center gap-2 transition-all duration-500 ${isFlipped ? 'top-1/2 -translate-y-1/2 opacity-100' : 'top-full opacity-0'}`}>
                          <i className="fa-solid fa-arrow-right animate-bounce-x"></i> <span className="hidden lg:inline">{t.home.check_demo_right}</span><span className="lg:hidden">{t.home.check_demo_below}</span>
                        </span>
                        <span className={`absolute left-0 text-sm flex items-center gap-2 transition-all duration-500 ${isFlipped ? '-top-full opacity-0' : 'top-1/2 -translate-y-1/2 opacity-100'}`}>
                          <i className="fa-solid fa-hand-pointer animate-pulse"></i> <span className="hidden lg:inline">{t.home.hover_qr}</span><span className="lg:hidden">{t.home.click_qr}</span>
                        </span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="stagger-item flex flex-col sm:flex-row lg:justify-start justify-center gap-6 mb-8 lg:mb-20 relative" style={{ animationDelay: '0.3s' }}>
              
              {/* Primary CTA with Smart Guidance */}
              <div className="relative group">
                {/* Floating Badge */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-500 to-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-bounce opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap pointer-events-none z-20">
                  ✨ {t.home.free_trial}
                  <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-purple-600 rotate-45"></div>
                </div>

                <Link href="/create" className="relative px-10 py-5 rounded-full bg-white text-slate-900 font-bold text-xl hover:bg-slate-50 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(255,255,255,0.6)] hover:scale-105 active:scale-95 overflow-hidden flex items-center justify-center gap-3">
                  {/* Pulse Ring */}
                  <span className="absolute inset-0 rounded-full border-2 border-white/50 animate-ping opacity-20"></span>
                  
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <i className="fa-solid fa-wand-magic-sparkles text-brand-600 animate-pulse"></i> 
                    <span>{t.nav.create}</span>
                  </span>
                  
                  {/* Shine Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent -translate-x-full group-hover:translate-x-full transition duration-1000 ease-in-out"></div>
                </Link>
              </div>

              <Link href="/explore" className="px-8 py-4 rounded-full bg-slate-800/40 text-white font-bold text-lg border border-slate-700/50 hover:bg-slate-800 hover:border-brand-500/50 transition duration-300 backdrop-blur-sm flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                <i className="fa-solid fa-lightbulb text-yellow-400"></i> {t.home.explore_ideas}
              </Link>
            </div>
          </div>

          {/* Right: Prompt Display */}
          <div className="block stagger-item mt-2 lg:mt-0" style={{ animationDelay: '0.4s' }}>
            {/* Mobile Scan Code Hint */}
            <div className="lg:hidden mb-4 flex justify-center">
              <div 
                className="relative group cursor-pointer inline-block"
                onClick={() => setIsFlipped(!isFlipped)}
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
                        {t.home.scan_native}
                      </span>
                      <div className="h-5 overflow-hidden relative">
                        <span className={`absolute left-0 text-sm flex items-center gap-2 transition-all duration-500 ${isFlipped ? 'top-1/2 -translate-y-1/2 opacity-100' : 'top-full opacity-0'}`}>
                          <i className="fa-solid fa-arrow-down animate-bounce"></i> <span>{t.home.check_demo_below}</span>
                        </span>
                        <span className={`absolute left-0 text-sm flex items-center gap-2 transition-all duration-500 ${isFlipped ? '-top-full opacity-0' : 'top-1/2 -translate-y-1/2 opacity-100'}`}>
                          <i className="fa-solid fa-hand-pointer animate-pulse"></i> <span>{t.home.click_qr}</span>
                        </span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>

            {cardContent}
          </div>

        </div>
      </div>

      {/* Footer integrated into Hero */}
      <footer className="relative lg:absolute bottom-0 w-full py-6 text-center z-20 mt-12 lg:mt-0">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center">
          


          <div className="flex justify-center items-center mb-2 opacity-50 hover:opacity-100 transition duration-300">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-5 h-5 mr-2 object-contain mix-blend-screen transition" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="font-bold text-sm text-slate-500 hover:text-slate-300 transition">SparkVertex</span>
          </div>
          <div className="text-slate-700 text-[10px]">
            &copy; 2025 SparkVertex. <button onClick={openFeedbackModal} className="hover:text-brand-400 transition ml-2">{t.nav.feedback}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
