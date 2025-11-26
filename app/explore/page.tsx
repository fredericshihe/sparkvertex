'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Item } from '@/types/supabase';
import ProjectCard from '@/components/ProjectCard';
import { useModal } from '@/context/ModalContext';
import { exploreCache } from '@/lib/cache';

export default function Explore() {
  const [items, setItems] = useState<Item[]>(exploreCache.items);
  const [loading, setLoading] = useState(!exploreCache.hasLoaded);
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(exploreCache.page);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState(exploreCache.category);
  const { openLoginModal, openDetailModal } = useModal();
  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    // If we have cached data and the category matches, don't fetch again
    // This ensures instant load when navigating back
    if (exploreCache.hasLoaded && exploreCache.category === category && items.length > 0) {
      setLoading(false);
    } else {
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
    let query = supabase
      .from('items')
      .select(`
        *,
        profiles:author_id (
          username,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })
      .range(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE - 1);

    if (category !== 'all') {
      query = query.contains('tags', [category]);
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
        // Update Cache
        exploreCache.items = newItems;
        exploreCache.page = pageIndex;
      } else {
        setItems(formattedItems);
        // Update Cache
        exploreCache.items = formattedItems;
        exploreCache.page = 0;
      }
      
      // Update Cache Meta
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
    <div className="page-section relative z-10 pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Creative Header */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold mb-6 text-white">灵枢广场</h2>
          <p className="text-slate-400 mb-8 text-xl">精选单文件、离线可用的创意灵感</p>
          <div className="max-w-2xl mx-auto relative">
            <div className="absolute inset-0 bg-brand-500/20 blur-xl rounded-full"></div>
            <div className="relative flex items-center bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full p-2 shadow-2xl">
              <i className="fa-solid fa-search text-slate-400 ml-4 text-xl"></i>
              <input 
                type="text" 
                placeholder="搜索：赛博朋克计算器、3D 粒子效果..." 
                className="flex-1 bg-transparent border-none text-white px-4 py-3 focus:outline-none text-lg placeholder-slate-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button onClick={handleSearch} className="bg-brand-600 hover:bg-brand-500 text-white px-8 py-3 rounded-full font-bold transition shadow-lg shadow-brand-500/20 whitespace-nowrap">
                搜索
              </button>
            </div>
          </div>
          
          {/* Floating Tags */}
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <button onClick={() => filterByCategory('all')} className={`px-4 py-2 rounded-full border transition text-sm hover:-translate-y-1 ${category === 'all' ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:text-white hover:border-brand-500'}`}>✨ 全部</button>
            <button onClick={() => filterByCategory('Eye Candy')} className={`px-4 py-2 rounded-full border transition text-sm hover:-translate-y-1 ${category === 'Eye Candy' ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:text-white hover:border-brand-500'}`}>👁️ 视觉系</button>
            <button onClick={() => filterByCategory('Micro-Interactions')} className={`px-4 py-2 rounded-full border transition text-sm hover:-translate-y-1 ${category === 'Micro-Interactions' ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:text-white hover:border-brand-500'}`}>👆 交互系</button>
            <button onClick={() => filterByCategory('Tiny Tools')} className={`px-4 py-2 rounded-full border transition text-sm hover:-translate-y-1 ${category === 'Tiny Tools' ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:text-white hover:border-brand-500'}`}>🛠️ 工具系</button>
          </div>
        </div>

        {items.length === 0 && !loading ? (
          <div className="text-center text-slate-500 py-20">
            <i className="fa-solid fa-ghost text-4xl mb-4 opacity-50"></i>
            <p>暂时没有发现任何作品</p>
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
          <div className="text-center py-10">
            <div className="inline-block w-8 h-8 border-2 border-slate-600 border-t-brand-500 rounded-full animate-spin"></div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="text-center mt-12">
            <button 
              onClick={loadMore}
              className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-medium transition border border-slate-700"
            >
              加载更多
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
