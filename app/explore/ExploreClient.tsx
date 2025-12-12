'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Item } from '@/types/supabase';
import ProjectCard from '@/components/ProjectCard';
import { useModal } from '@/context/ModalContext';
import { exploreCache, itemDetailsCache } from '@/lib/cache';
import { getPreviewContent } from '@/lib/preview';
import { useLanguage } from '@/context/LanguageContext';
import { translations } from '@/lib/i18n/translations';
import { KNOWN_CATEGORIES } from '@/lib/categories';

interface CategoryItem {
  id: string;
  label: string;
  translationKey: string;
  icon: string;
  count: number;
}

interface ExploreClientProps {
  initialItems: Item[];
  initialCategories: CategoryItem[];
  initialTopItem?: Item;
}

export default function ExploreClient({ initialItems, initialCategories, initialTopItem }: ExploreClientProps) {
  // Use cache if available, otherwise use server props
  const hasCache = exploreCache.hasLoaded && exploreCache.items.length > 0;
  
  const [items, setItems] = useState<Item[]>(hasCache ? exploreCache.items : initialItems);
  const [topItems, setTopItems] = useState<Item[]>(initialTopItem ? [initialTopItem] : []);
  const [categories, setCategories] = useState(exploreCache.categories?.length > 0 ? exploreCache.categories : initialCategories);
  const [loading, setLoading] = useState(!hasCache && initialItems.length === 0); // If no cache and no initial items, loading
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(exploreCache.page || 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState(exploreCache.category || 'all');
  const { openLoginModal, openDetailModal } = useModal();
  const { language } = useLanguage();
  const t = translations[language] as typeof translations['zh'];
  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    // If we don't have categories (e.g. server failed or something), fetch them. 
    // But we assume server passed them.
    if (categories.length <= 1 && !exploreCache.categories) {
        // Fallback fetch if needed, but for now rely on props
    }
  }, []);

  useEffect(() => {
    // Logic to decide whether to fetch items
    if (hasCache && exploreCache.category === category) {
      // Cache matches current category, do nothing (already set in state)
      setLoading(false);
    } else if (!hasCache && category === 'all' && initialItems.length > 0) {
      // No cache, but we have server props for 'all'.
      // We are good.
      setLoading(false);
      exploreCache.hasLoaded = true;
      exploreCache.items = initialItems;
      exploreCache.category = 'all';
    } else {
      // Category changed or no data, fetch
      fetchItems(0, false);
    }
    fetchUserLikes();
  }, [category]);

  const handleSearch = () => {
    setPage(0);
    fetchItems(0, false);
  };

  const filterByCategory = (cat: string) => {
    setCategory(cat);
    setPage(0);
  };

  const fetchItems = async (pageIndex = 0, isLoadMore = false) => {
    setLoading(true);
    
    const fetchLimit = pageIndex === 0 ? ITEMS_PER_PAGE + 1 : ITEMS_PER_PAGE;
    const rangeStart = pageIndex === 0 ? 0 : (pageIndex * ITEMS_PER_PAGE) + 1;
    const rangeEnd = rangeStart + fetchLimit - 1;

    let query = supabase
      .from('items')
      .select(`
        *,
        profiles:author_id (
          username,
          avatar_url
        )
      `)
      .eq('is_public', true)
      .order('daily_rank', { ascending: true, nullsFirst: false })
      .range(rangeStart, rangeEnd);

    if (category !== 'all') {
      const tagsToSearch = Object.entries(KNOWN_CATEGORIES)
        .filter(([tag, def]) => def.key === category)
        .map(([tag]) => tag);
      
      if (!tagsToSearch.includes(category)) {
        tagsToSearch.push(category);
      }

      query = query.overlaps('tags', tagsToSearch);
    }

    if (searchQuery) {
      query = query.ilike('title', `%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching items:', error);
    } else {
      const formattedItems = data.map((item: any) => ({
        ...item,
        author: item.profiles?.username || 'Unknown',
        authorAvatar: item.profiles?.avatar_url
      }));
      
      if (isLoadMore) {
        const newItems = [...items, ...formattedItems];
        setItems(newItems);
        exploreCache.items = newItems;
        exploreCache.page = pageIndex;
      } else {
        if (pageIndex === 0 && !searchQuery && category === 'all') {
           // If we are fetching 'all' again (e.g. refresh), split top item
           // But wait, if we are here, it means we are NOT using initial props.
           // If category is NOT all, we don't show Hero?
           // Original code:
           // if (pageIndex === 0 && !searchQuery) -> split
           // But wait, original code didn't check category for Hero.
           // Let's check original code.
           // "if (pageIndex === 0 && !searchQuery) { const top = ... }"
           // It seems Hero is shown for ANY category if it's the first page and no search?
           // No, usually Hero is only for 'all'.
           // Let's assume Hero is only for 'all' or if the design allows Hero for categories.
           // The original code didn't explicitly check category for Hero splitting, 
           // BUT `fetchItems` query filters by category.
           // So if I am in 'game', I get top game as Hero?
           // Yes, logic supports it.
           
          const top = formattedItems.slice(0, 1);
          const rest = formattedItems.slice(1);
          setTopItems(top);
          setItems(rest);
          exploreCache.items = rest; 
        } else {
          // If search query exists, no Hero.
          // If page > 0, no Hero.
          if (searchQuery) {
              setTopItems([]);
              setItems(formattedItems);
              exploreCache.items = formattedItems;
          } else {
              // Category switch, page 0, no search.
              const top = formattedItems.slice(0, 1);
              const rest = formattedItems.slice(1);
              setTopItems(top);
              setItems(rest);
              exploreCache.items = rest;
          }
        }
        exploreCache.page = 0;
      }
      
      exploreCache.category = category;
      exploreCache.hasLoaded = true;
    }
    setLoading(false);
  };

  const fetchUserLikes = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from('likes')
      .select('item_id')
      .eq('user_id', session.user.id);

    if (data) {
      setMyLikes(new Set(data.map((l: any) => l.item_id)));
    }
  };

  const handleLike = async (itemId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      openLoginModal();
      return;
    }

    const isLiked = myLikes.has(itemId);
    if (isLiked) {
      await supabase.from('likes').delete().match({ user_id: session.user.id, item_id: itemId });
      setMyLikes(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, likes: (i.likes || 0) - 1 } : i));
      setTopItems(prev => prev.map(i => i.id === itemId ? { ...i, likes: (i.likes || 0) - 1 } : i));
    } else {
      await supabase.from('likes').insert({ user_id: session.user.id, item_id: itemId });
      setMyLikes(prev => new Set(prev).add(itemId));
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, likes: (i.likes || 0) + 1 } : i));
      setTopItems(prev => prev.map(i => i.id === itemId ? { ...i, likes: (i.likes || 0) + 1 } : i));
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchItems(nextPage, true);
  };

  const getCategoryLabel = (cat: any) => {
    if (cat.translationKey === 'discover') return t.explore.discover;
    if (cat.translationKey && (t.categories as any)[cat.translationKey]) {
      return (t.categories as any)[cat.translationKey];
    }
    return cat.label;
  };

  const prefetchItem = (item: Item) => {
    if (!itemDetailsCache.has(item.id)) {
      itemDetailsCache.set(item.id, item);
    }
  };

  return (
    <div className="flex h-[100dvh] pt-16 bg-transparent overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 flex-shrink-0 border-r border-white/10 bg-black/20 backdrop-blur-xl hidden md:flex flex-col">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 px-2">
            <i className="fa-solid fa-store text-white"></i> {t.explore.title}
          </h2>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => filterByCategory(cat.id)}
              className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                category === cat.id 
                  ? 'bg-white text-black shadow-lg shadow-white/10' 
                  : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  category === cat.id ? 'bg-black/10' : 'bg-white/5'
                }`}>
                  <i className={`fa-solid ${cat.icon}`}></i>
                </div>
                {getCategoryLabel(cat)}
              </div>
              {(cat as any).count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  category === cat.id ? 'bg-black/10 text-black' : 'bg-white/5 text-slate-500'
                }`}>
                  {(cat as any).count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 shadow-lg">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
              <i className="fa-solid fa-code-branch text-white"></i> {t.explore.dev_center}
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.explore.dev_desc }} />
            <a href="/create" className="block w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold text-center rounded-lg transition shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
              <i className="fa-solid fa-wand-magic-sparkles"></i> {t.explore.start_create}
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
        {/* Mobile Category Filter (Fixed at top) */}
        <div className="md:hidden z-30 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => filterByCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-2 ${
                category === cat.id
                  ? 'bg-white text-black border-white'
                  : 'bg-slate-900/40 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {getCategoryLabel(cat)}
              {(cat as any).count > 0 && <span className="opacity-60">{(cat as any).count}</span>}
            </button>
          ))}
        </div>

        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Header & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {getCategoryLabel(categories.find(c => c.id === category) || categories[0])}
              </h1>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                {/* AI Features Badge */}
                <div className="flex flex-wrap items-center gap-3 px-3 py-1 rounded-lg bg-slate-900/40 backdrop-blur-md border border-white/10 self-start sm:self-auto">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                       <i className="fa-solid fa-microchip text-purple-400"></i>
                       {t.explore.ai_badge_driven}
                    </span>
                    <span className="w-px h-3 bg-white/10 hidden sm:block"></span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                       <i className="fa-solid fa-shield-halved text-green-400"></i>
                       {t.explore.ai_badge_security}
                    </span>
                    <span className="w-px h-3 bg-white/10 hidden sm:block"></span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                       <i className="fa-solid fa-bolt text-yellow-400"></i>
                       {t.explore.ai_badge_recommendation}
                    </span>
                    <span className="w-px h-3 bg-white/10 hidden sm:block"></span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                       <i className="fa-solid fa-copyright text-blue-400"></i>
                       {t.explore.ai_badge_copyright}
                    </span>
                </div>
              </div>
            </div>
            
            <div className="relative w-full md:w-80 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-search text-slate-500 group-focus-within:text-white transition-colors"></i>
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2.5 border border-white/10 rounded-xl leading-5 bg-slate-900/40 backdrop-blur-md text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-900/60 focus:border-white/20 focus:ring-1 focus:ring-white/20 sm:text-sm transition-all shadow-sm"
                placeholder={t.explore.search_placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Top 1 Featured Hero (App Store Style) */}
          {!searchQuery && topItems.length > 0 && topItems[0] && (
            <div className="mb-16 mt-8">
               {/* Hero Card */}
               <div className="relative group rounded-3xl bg-slate-900/40 backdrop-blur-md border border-white/10 overflow-hidden shadow-2xl transition-all hover:shadow-white/5 hover:border-white/20">
                  {/* Background Gradient Mesh */}
                  <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
                  
                  <div className="flex flex-col md:flex-row min-h-[450px]">
                    {/* Left: Content */}
                    <div className="flex-1 p-8 md:p-12 flex flex-col justify-center relative z-10">
                       <div className="flex items-center gap-3 mb-4">
                          <img 
                            src={topItems[0]?.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${topItems[0]?.author}`} 
                            className="w-8 h-8 rounded-full border border-white/10" 
                            alt={topItems[0]?.author} 
                            onError={(e) => {
                              e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${topItems[0]?.author}`;
                            }}
                          />
                          <span className="text-slate-400 text-sm font-medium">{topItems[0]?.author}</span>
                          {(topItems[0]?.total_score || 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white text-xs font-bold border border-white/10">
                              {topItems[0]?.total_score} 分
                            </span>
                          )}
                       </div>
                       
                       <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                         {topItems[0]?.title}
                       </h2>
                       
                       <p className="text-slate-400 text-lg mb-8 line-clamp-3 leading-relaxed max-w-xl">
                         {topItems[0]?.description}
                       </p>
                       
                       <div className="flex items-center gap-4 mt-auto">
                          <button 
                            onClick={() => topItems[0] && openDetailModal(topItems[0].id, topItems[0])}
                            className="px-8 py-4 bg-white text-black rounded-xl font-bold hover:bg-slate-200 transition shadow-lg shadow-white/5 flex items-center gap-2"
                          >
                            {t.explore.try_now || '立即体验'} <i className="fa-solid fa-arrow-right"></i>
                          </button>
                          <button 
                             onClick={() => topItems[0] && handleLike(topItems[0].id)}
                             className={`w-14 h-14 rounded-xl flex items-center justify-center border transition ${
                               topItems[0] && myLikes.has(topItems[0].id) 
                                 ? 'bg-rose-500/10 border-rose-500/50 text-rose-500' 
                                 : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                             }`}
                          >
                             <i className={`fa-solid fa-heart ${topItems[0] && myLikes.has(topItems[0].id) ? 'fa-beat' : ''}`}></i>
                          </button>
                       </div>
                    </div>

                    {/* Right: Preview Visual */}
                    <div className="w-full md:w-[55%] h-64 md:h-auto relative bg-black/20 border-t md:border-t-0 md:border-l border-white/5 overflow-hidden group-hover:bg-black/30 transition-colors">
                       <div className="absolute inset-0 flex items-center justify-center bg-transparent">
                          {topItems[0]?.content ? (
                            <iframe 
                                srcDoc={getPreviewContent(topItems[0]?.content, { raw: true, appId: topItems[0]?.id ? String(topItems[0].id) : undefined })} 
                                className="w-[200%] h-[200%] border-0 transform scale-50 origin-center pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity bg-slate-900" 
                                tabIndex={-1}
                                scrolling="no"
                                sandbox="allow-scripts allow-same-origin"
                                allow="autoplay 'none'; camera 'none'; microphone 'none'"
                                title="Featured App Preview"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-600">
                                <i className="fa-solid fa-image text-4xl mb-2"></i>
                                <span className="text-xs">No Preview</span>
                            </div>
                          )}
                           {/* Overlay for click */}
                           <div 
                             className="absolute inset-0 z-20 cursor-pointer"
                             onClick={() => topItems[0] && openDetailModal(topItems[0].id, topItems[0])}
                           ></div>
                       </div>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {/* App Grid */}
          {items.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800">
                <i className="fa-solid fa-box-open text-4xl opacity-50"></i>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{t.explore.no_apps}</h3>
              <p>{t.explore.no_apps_desc}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {items.map(item => (
                <ProjectCard 
                  key={item.id} 
                  item={item} 
                  isLiked={myLikes.has(item.id)} 
                  onLike={handleLike}
                  onClick={(id) => openDetailModal(id, item)}
                  onHover={prefetchItem}
                />
              ))}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-slate-800 border-t-brand-500 rounded-full animate-spin"></div>
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="flex justify-center mt-12 pb-12">
              <button 
                onClick={loadMore}
                className="px-8 py-3 bg-slate-900/40 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl font-bold transition border border-white/10 hover:border-white/20 flex items-center gap-2 backdrop-blur-md"
              >
                {t.explore.load_more} <i className="fa-solid fa-chevron-down text-xs"></i>
              </button>
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
