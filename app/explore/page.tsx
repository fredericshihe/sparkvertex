'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Item } from '@/types/supabase';
import ProjectCard from '@/components/ProjectCard';
import { useModal } from '@/context/ModalContext';
import { exploreCache } from '@/lib/cache';
import { getPreviewContent } from '@/lib/preview';

const KNOWN_CATEGORIES: Record<string, { label: string, icon: string }> = {
  // Core Categories (English keys)
  game: { label: '游戏娱乐', icon: 'fa-gamepad' },
  tool: { label: '实用工具', icon: 'fa-screwdriver-wrench' },
  productivity: { label: '生产力', icon: 'fa-list-check' },
  social: { label: '社交互动', icon: 'fa-comments' },
  info: { label: '信息资讯', icon: 'fa-newspaper' },
  education: { label: '教育学习', icon: 'fa-graduation-cap' },
  
  // Chinese mappings (Direct match)
  '游戏': { label: '游戏娱乐', icon: 'fa-gamepad' },
  '游戏娱乐': { label: '游戏娱乐', icon: 'fa-gamepad' },
  '休闲游戏': { label: '游戏娱乐', icon: 'fa-gamepad' },
  
  '工具': { label: '实用工具', icon: 'fa-screwdriver-wrench' },
  '实用工具': { label: '实用工具', icon: 'fa-screwdriver-wrench' },
  'Tiny Tools': { label: '实用工具', icon: 'fa-screwdriver-wrench' },
  
  '生产力': { label: '生产力', icon: 'fa-list-check' },
  '办公效率': { label: '生产力', icon: 'fa-list-check' },
  
  '社交': { label: '社交互动', icon: 'fa-comments' },
  '社交互动': { label: '社交互动', icon: 'fa-comments' },
  
  '资讯': { label: '信息资讯', icon: 'fa-newspaper' },
  '信息资讯': { label: '信息资讯', icon: 'fa-newspaper' },
  
  '教育': { label: '教育学习', icon: 'fa-graduation-cap' },
  '教育学习': { label: '教育学习', icon: 'fa-graduation-cap' },
  
  '生活': { label: '生活便利', icon: 'fa-mug-hot' },
  '生活便利': { label: '生活便利', icon: 'fa-mug-hot' },
  
  '创意': { label: '创意设计', icon: 'fa-palette' },
  '创意设计': { label: '创意设计', icon: 'fa-palette' },
  'Eye Candy': { label: '创意设计', icon: 'fa-palette' },
  
  'AI': { label: 'AI应用', icon: 'fa-robot' },
  'AI应用': { label: 'AI应用', icon: 'fa-robot' },
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
  const [categories, setCategories] = useState(exploreCache.categories?.length > 0 ? exploreCache.categories : [{ id: 'all', label: '发现', icon: 'fa-compass' }]);
  const [loading, setLoading] = useState(!exploreCache.hasLoaded);
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(exploreCache.page);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState(exploreCache.category || 'all');
  const [featuredItem, setFeaturedItem] = useState<Item | null>(null);
  const { openLoginModal, openDetailModal } = useModal();
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

    const tagCounts: Record<string, number> = {};
    data.forEach(item => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag: string) => {
          if (tag) {
            const normalizedTag = tag.trim();
            tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + 1;
          }
        });
      }
    });

    // Map tags to known categories or create new ones
    const categoryMap = new Map<string, { id: string, label: string, icon: string, count: number }>();

    Object.entries(tagCounts).forEach(([tag, count]) => {
      // 1. Filter out ignored tags
      if (IGNORED_TAGS.has(tag.toLowerCase())) return;

      // 2. Only allow tags with Chinese characters (Match Detail Page logic)
      if (!/[\u4e00-\u9fa5]/.test(tag)) return;

      // 3. Use tag directly as label, try to find icon
      const known = KNOWN_CATEGORIES[tag] || KNOWN_CATEGORIES[tag.toLowerCase()];
      const icon = known ? known.icon : 'fa-hashtag';
      
      categoryMap.set(tag, {
        id: tag,
        label: tag,
        icon,
        count
      });
    });

    const dynamicCategories = Array.from(categoryMap.values());

    // Sort by count
    dynamicCategories.sort((a, b) => b.count - a.count);

    const finalCategories = [
      { id: 'all', label: '发现', icon: 'fa-compass', count: data.length },
      ...dynamicCategories
    ];

    setCategories(finalCategories);
    exploreCache.categories = finalCategories;
  };

  const fetchFeaturedItem = async () => {
    try {
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
      .order('created_at', { ascending: false })
      .range(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE - 1);

    if (category !== 'all') {
      query = query.overlaps('tags', [category]);
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

  return (
    <div className="flex h-screen pt-16 bg-slate-950 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl hidden md:flex flex-col">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 px-2">
            <i className="fa-solid fa-store text-brand-500"></i> 灵枢广场
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
                {cat.label}
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
              <i className="fa-solid fa-code-branch text-brand-400"></i> 开发者中心
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              仅需 <span className="text-brand-400 font-bold text-sm">5分钟</span>，<br/>
              人人都能开发自己的应用。
            </p>
            <a href="/create" className="block w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold text-center rounded-lg transition shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2">
              <i className="fa-solid fa-wand-magic-sparkles"></i> 开始创作
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        {/* Mobile Category Filter (Horizontal Scroll) */}
        <div className="md:hidden sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
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
              {cat.label}
              {(cat as any).count > 0 && <span className="opacity-60">{(cat as any).count}</span>}
            </button>
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Header & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {categories.find(c => c.id === category)?.label || '发现'}
              </h1>
              <p className="text-slate-400 text-sm">
                {category === 'all' ? '探索全网最热门的微应用' : `浏览 ${categories.find(c => c.id === category)?.label} 相关的应用`}
              </p>
            </div>
            
            <div className="relative w-full md:w-80 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-search text-slate-500 group-focus-within:text-brand-500 transition-colors"></i>
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2.5 border border-slate-700 rounded-xl leading-5 bg-slate-900 text-slate-300 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:text-sm transition-all shadow-sm"
                placeholder="搜索应用..."
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
                    🚀 本日精选
                  </span>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight line-clamp-2">
                    {featuredItem.title}
                  </h2>
                  <p className="text-slate-300 text-lg mb-8 max-w-xl line-clamp-3">
                    {featuredItem.description}
                  </p>
                  <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                    <button onClick={() => openDetailModal(featuredItem.id, featuredItem)} className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 transition shadow-lg shadow-white/10 flex items-center gap-2">
                      <i className="fa-solid fa-play"></i> 立即体验
                    </button>
                    <a href="/create" className="px-6 py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-500 transition shadow-lg shadow-brand-500/20">
                      我也要创作
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
              <h3 className="text-lg font-bold text-white mb-2">暂无相关应用</h3>
              <p>换个关键词搜索，或者去创建一个吧！</p>
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
                加载更多 <i className="fa-solid fa-chevron-down text-xs"></i>
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
