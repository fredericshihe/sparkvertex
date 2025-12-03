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

const KNOWN_CATEGORIES: Record<string, { key: string, icon: string }> = {
  // Core Categories (English keys)
  game: { key: 'game', icon: 'fa-gamepad' },
  tool: { key: 'tool', icon: 'fa-screwdriver-wrench' },
  productivity: { key: 'productivity', icon: 'fa-list-check' },
  design: { key: 'design', icon: 'fa-palette' },
  devtool: { key: 'devtool', icon: 'fa-code' },
  entertainment: { key: 'entertainment', icon: 'fa-film' },
  education: { key: 'education', icon: 'fa-graduation-cap' },
  visualization: { key: 'visualization', icon: 'fa-chart-pie' },
  lifestyle: { key: 'lifestyle', icon: 'fa-mug-hot' },
  
  // Chinese mappings
  // 休闲游戏
  '游戏': { key: 'game', icon: 'fa-gamepad' },
  '游戏娱乐': { key: 'game', icon: 'fa-gamepad' },
  '休闲游戏': { key: 'game', icon: 'fa-gamepad' },
  '益智游戏': { key: 'game', icon: 'fa-gamepad' },
  'Game': { key: 'game', icon: 'fa-gamepad' },
  
  // 创意设计
  '创意': { key: 'design', icon: 'fa-palette' },
  '创意设计': { key: 'design', icon: 'fa-palette' },
  '设计': { key: 'design', icon: 'fa-palette' },
  '艺术': { key: 'design', icon: 'fa-palette' },
  'Eye Candy': { key: 'design', icon: 'fa-palette' },
  'Design': { key: 'design', icon: 'fa-palette' },
  
  // 办公效率
  '生产力': { key: 'productivity', icon: 'fa-list-check' },
  '办公效率': { key: 'productivity', icon: 'fa-list-check' },
  '效率': { key: 'productivity', icon: 'fa-list-check' },
  '办公': { key: 'productivity', icon: 'fa-list-check' },
  'Productivity': { key: 'productivity', icon: 'fa-list-check' },
  
  // 实用工具
  '工具': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  '实用工具': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  'Tiny Tools': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  '计算器': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  'Tool': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  
  // 开发者工具
  '开发者工具': { key: 'devtool', icon: 'fa-code' },
  '开发': { key: 'devtool', icon: 'fa-code' },
  '编程': { key: 'devtool', icon: 'fa-code' },
  '代码': { key: 'devtool', icon: 'fa-code' },
  'DevTool': { key: 'devtool', icon: 'fa-code' },
  'Developer': { key: 'devtool', icon: 'fa-code' },
  
  // 影音娱乐
  '影音娱乐': { key: 'entertainment', icon: 'fa-film' },
  '娱乐': { key: 'entertainment', icon: 'fa-film' },
  '音乐': { key: 'entertainment', icon: 'fa-music' },
  '视频': { key: 'entertainment', icon: 'fa-video' },
  '影视': { key: 'entertainment', icon: 'fa-film' },
  'Entertainment': { key: 'entertainment', icon: 'fa-film' },
  
  // 教育学习
  '教育': { key: 'education', icon: 'fa-graduation-cap' },
  '教育学习': { key: 'education', icon: 'fa-graduation-cap' },
  '学习': { key: 'education', icon: 'fa-graduation-cap' },
  '知识': { key: 'education', icon: 'fa-graduation-cap' },
  'Education': { key: 'education', icon: 'fa-graduation-cap' },
  
  // 数据可视化
  '数据可视化': { key: 'visualization', icon: 'fa-chart-pie' },
  '图表': { key: 'visualization', icon: 'fa-chart-pie' },
  '数据': { key: 'visualization', icon: 'fa-chart-pie' },
  'Visualization': { key: 'visualization', icon: 'fa-chart-pie' },
  
  // 生活便利
  '生活': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '生活便利': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '日常': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '健康': { key: 'lifestyle', icon: 'fa-heart-pulse' },
  'Lifestyle': { key: 'lifestyle', icon: 'fa-mug-hot' },
  
  // AI (Map to Tool or keep separate? User didn't specify AI, but it's common. Let's map to Tool or DevTool or keep separate if not in list. 
  // User said "Unify into...". So I should probably map AI to something else or just let it be if it doesn't match.
  // But wait, if I don't map it, it might show up as "AI" if I don't filter it out.
  // The logic in fetchCategories filters out ignored tags, then checks KNOWN_CATEGORIES.
  // If not known, it adds it as is.
  // I'll map AI to 'tool' or 'devtool' depending on context, but here simple mapping:
  'AI': { key: 'tool', icon: 'fa-robot' },
  'AI应用': { key: 'tool', icon: 'fa-robot' },
};

const IGNORED_TAGS = new Set([
  // Tech Stack
  'react', 'nextjs', 'next.js', 'tailwind', 'tailwindcss', 'typescript', 'ts', 'js', 'javascript', 'css', 'html', 'supabase', 'postgres', 'database', 'storage', 'edge functions', 'node', 'python', 'ai', 'gpt', 'llm', 'vercel',
  // Styles (Keep categories focused on functionality)
  'cyberpunk', 'minimalist', 'retro', 'cute', 'business', 'native', 'glassmorphism', 'neobrutalism', 'cartoon', 'lowpoly', 'dark_fantasy', 'neumorphism', 'industrial', 'swiss', 'editorial', 'card', 'bubble', 'material', 'paper', 'gamified', 'dark_mode', 'kanban'
]);

// Dynamic Category Logic:
// 1. Filter out IGNORED_TAGS (Tech stack, styles)
// 2. Map to KNOWN_CATEGORIES if possible
// 3. Create new categories for other tags

export default function Explore() {
  const [items, setItems] = useState<Item[]>(exploreCache.items);
  const [categories, setCategories] = useState(exploreCache.categories?.length > 0 ? exploreCache.categories : [{ id: 'all', label: '发现', translationKey: 'discover', icon: 'fa-compass' }]);
  const [loading, setLoading] = useState(!exploreCache.hasLoaded);
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(exploreCache.page);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState(exploreCache.category || 'all');
  const [featuredItem, setFeaturedItem] = useState<Item | null>(null);
  const { openLoginModal, openDetailModal } = useModal();
  const { language } = useLanguage();
  const t = translations[language];
  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchCategories();
    fetchFeaturedItem();
  }, []);

  useEffect(() => {
    if (exploreCache.hasLoaded && exploreCache.category === category && items.length > 0) {
      setLoading(false);
    } else {
      fetchItems(0, false);
    }
    fetchUserLikes();
  }, [category]);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('items')
      .select('tags')
      .eq('is_public', true);

    if (error) {
      console.error('Error fetching tags:', error);
      return;
    }

    // Initialize counts for core categories
    const CORE_KEYS = ['game', 'design', 'productivity', 'tool', 'devtool', 'entertainment', 'education', 'visualization', 'lifestyle'];
    const categoryCounts: Record<string, number> = {};
    CORE_KEYS.forEach(k => categoryCounts[k] = 0);

    data.forEach(item => {
      if (Array.isArray(item.tags)) {
        // Rule: Only identify the first Chinese tag
        const firstChineseTag = item.tags.find((tag: string) => tag && /[\u4e00-\u9fa5]/.test(tag));
        
        if (firstChineseTag) {
          const normalizedTag = firstChineseTag.trim();
          // Map to Core Key
          const mapping = KNOWN_CATEGORIES[normalizedTag] || KNOWN_CATEGORIES[normalizedTag.toLowerCase()];
          if (mapping) {
             categoryCounts[mapping.key] = (categoryCounts[mapping.key] || 0) + 1;
          }
        }
      }
    });

    // Build the categories array for UI
    const dynamicCategories = CORE_KEYS.map(key => {
       const def = KNOWN_CATEGORIES[key]; 
       return {
         id: key,
         label: key,
         translationKey: key,
         icon: def ? def.icon : 'fa-folder',
         count: categoryCounts[key] || 0
       };
    });

    // Sort by count
    dynamicCategories.sort((a, b) => b.count - a.count);

    const finalCategories = [
      { id: 'all', label: '发现', translationKey: 'discover', icon: 'fa-compass', count: data.length },
      ...dynamicCategories
    ];

    setCategories(finalCategories);
    exploreCache.categories = finalCategories;
  };

  const fetchFeaturedItem = async () => {
    try {
      // 1. Try to fetch the Daily Rank #1 item
      const { data: rankedData } = await supabase
        .from('items')
        .select(`
          *,
          profiles:author_id (
            username,
            avatar_url
          )
        `)
        .eq('is_public', true)
        .eq('daily_rank', 1)
        .limit(1)
        .maybeSingle();

      if (rankedData) {
        const formattedItem = {
          ...rankedData,
          author: rankedData.profiles?.username || 'Unknown',
          authorAvatar: rankedData.profiles?.avatar_url
        };
        setFeaturedItem(formattedItem);
        return;
      }

      // 2. Fallback: Random item based on date seed
      const { count } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('is_public', true);

      if (!count) return;

      const today = new Date();
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      const offset = seed % count;

      const { data } = await supabase
        .from('items')
        .select(`
          *,
          profiles:author_id (
            username,
            avatar_url
          )
        `)
        .eq('is_public', true)
        .range(offset, offset)
        .single();

      if (data) {
        const formattedItem = {
          ...data,
          author: data.profiles?.username || 'Unknown',
          authorAvatar: data.profiles?.avatar_url
        };
        setFeaturedItem(formattedItem);
      }
    } catch (error) {
      console.error('Error fetching featured item:', error);
    }
  };

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
      // Sort by Daily Rank (High Quality) first, then Newest
      .order('daily_rank', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE - 1);

    if (category !== 'all') {
      // Expand category key to all tags that map to it
      const tagsToSearch = Object.entries(KNOWN_CATEGORIES)
        .filter(([tag, def]) => def.key === category)
        .map(([tag]) => tag);
      
      // Also include the category key itself
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
        setItems(formattedItems);
        exploreCache.items = formattedItems;
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
    } else {
      await supabase.from('likes').insert({ user_id: session.user.id, item_id: itemId });
      setMyLikes(prev => new Set(prev).add(itemId));
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, likes: (i.likes || 0) + 1 } : i));
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
    <div className="flex h-screen pt-16 bg-slate-950 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl hidden md:flex flex-col">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 px-2">
            <i className="fa-solid fa-store text-brand-500"></i> {t.explore.title}
          </h2>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => filterByCategory(cat.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                category === cat.id 
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  category === cat.id ? 'bg-white/20' : 'bg-slate-800'
                }`}>
                  <i className={`fa-solid ${cat.icon}`}></i>
                </div>
                {getCategoryLabel(cat)}
              </div>
              {(cat as any).count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  category === cat.id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'
                }`}>
                  {(cat as any).count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-gradient-to-br from-purple-900/50 to-brand-900/50 rounded-xl p-4 border border-white/5 shadow-lg">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
              <i className="fa-solid fa-code-branch text-brand-400"></i> {t.explore.dev_center}
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: t.explore.dev_desc }} />
            <a href="/create" className="block w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold text-center rounded-lg transition shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2">
              <i className="fa-solid fa-wand-magic-sparkles"></i> {t.explore.start_create}
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
        {/* Mobile Category Filter (Fixed at top) */}
        <div className="md:hidden z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => filterByCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-2 ${
                category === cat.id
                  ? 'bg-brand-600 border-brand-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
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
              <p className="text-slate-400 text-sm">
                {category === 'all' 
                  ? t.explore.explore_all_desc 
                  : t.explore.browse_category.replace('{category}', getCategoryLabel(categories.find(c => c.id === category) || categories[0]))}
              </p>
            </div>
            
            <div className="relative w-full md:w-80 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-search text-slate-500 group-focus-within:text-brand-500 transition-colors"></i>
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2.5 border border-slate-700 rounded-xl leading-5 bg-slate-900 text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:text-sm transition-all shadow-sm"
                placeholder={t.explore.search_placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Featured Banner (Only on 'all' category) */}
          {category === 'all' && !searchQuery && featuredItem && (
            <div className="mb-12 relative rounded-3xl overflow-hidden bg-gradient-to-r from-brand-900 to-purple-900 border border-white/10 shadow-2xl group">
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-30"></div>
              <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              
              <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
                <div className="flex-1 text-center md:text-left">
                  <span className="inline-block px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 text-xs font-bold mb-4 border border-brand-500/30">
                    🚀 {t.explore.featured_today}
                  </span>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight line-clamp-2">
                    {featuredItem.title}
                  </h2>
                  <p className="text-slate-300 text-lg mb-8 max-w-xl line-clamp-3">
                    {featuredItem.description}
                  </p>
                  <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                    <button onClick={() => openDetailModal(featuredItem.id, featuredItem)} className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 transition shadow-lg shadow-white/10 flex items-center gap-2">
                      <i className="fa-solid fa-play"></i> {t.explore.try_now}
                    </button>
                    <a href="/create" className="px-6 py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-500 transition shadow-lg shadow-brand-500/20">
                      {t.explore.create_too}
                    </a>
                  </div>
                </div>
                <div className="w-full md:w-1/3 aspect-video md:aspect-square bg-slate-800/50 rounded-2xl border border-white/10 backdrop-blur-sm relative overflow-hidden group-hover:scale-105 transition duration-700 shadow-2xl">
                   <iframe 
                      srcDoc={getPreviewContent(featuredItem.content || '')} 
                      className="absolute top-0 left-0 w-[200%] h-[200%] border-0 transform scale-50 origin-top-left pointer-events-none" 
                      tabIndex={-1}
                      scrolling="no"
                      title="Featured App Preview"
                   />
                   {/* Overlay to prevent interaction and handle click */}
                   <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => openDetailModal(featuredItem.id, featuredItem)}></div>
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
                className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl font-bold transition border border-slate-800 hover:border-slate-700 flex items-center gap-2"
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
