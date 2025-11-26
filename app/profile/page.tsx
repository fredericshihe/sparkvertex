'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { exploreCache } from '@/lib/cache';
import ProjectCard from '@/components/ProjectCard';

import { useRouter } from 'next/navigation';

export default function Profile() {
  const router = useRouter();
  const { openLoginModal, openDetailModal, openEditProfileModal, openPaymentQRModal, openManageOrdersModal } = useModal();
  const [activeTab, setActiveTab] = useState<'works' | 'purchased' | 'favorites'>('works');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ works: 0, purchased: 0, favorites: 0 });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchItems();
      fetchCounts();
    }
  }, [user, activeTab]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUser(session.user);
    } else {
      openLoginModal();
    }
  };

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data);
  };

  const fetchCounts = async () => {
    if (!user) return;

    // Works count
    const { count: worksCount } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', user.id);

    // Purchased count
    const { count: purchasedCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', user.id);

    // Favorites count
    const { count: favoritesCount } = await supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    setCounts({
      works: worksCount || 0,
      purchased: purchasedCount || 0,
      favorites: favoritesCount || 0
    });
  };

  const fetchItems = async () => {
    setLoading(true);
    
    const selectQuery = `
      *,
      profiles:author_id (
        username,
        avatar_url
      )
    `;

    const mapItemWithProfile = (item: any) => ({
      ...item,
      author: item.profiles?.username || 'Unknown',
      authorAvatar: item.profiles?.avatar_url
    });

    try {
      if (activeTab === 'works') {
        const { data } = await supabase
          .from('items')
          .select(selectQuery)
          .eq('author_id', user.id);
        setItems(data?.map(mapItemWithProfile) || []);
      } else if (activeTab === 'purchased') {
        // Fetch items purchased by user
        const { data: orders } = await supabase
          .from('orders')
          .select('item_id, status')
          .eq('buyer_id', user.id);
          
        if (orders && orders.length > 0) {
          const itemIds = orders.map((o: any) => o.item_id);
          const { data: itemsData } = await supabase
            .from('items')
            .select(selectQuery)
            .in('id', itemIds);
            
          // Merge status
          const mergedItems = itemsData?.map(item => {
             // Find the most recent order for this item
             const order = orders.find((o: any) => o.item_id === item.id);
             return mapItemWithProfile({ ...item, orderStatus: order?.status });
          });
          
          setItems(mergedItems || []);
        } else {
          setItems([]);
        }
      } else if (activeTab === 'favorites') {
        const { data: likes } = await supabase
          .from('likes')
          .select('item_id')
          .eq('user_id', user.id);
          
        if (likes && likes.length > 0) {
          const ids = likes.map((l: any) => l.item_id);
          const { data: itemsData } = await supabase
            .from('items')
            .select(selectQuery)
            .in('id', ids);
          setItems(itemsData?.map(mapItemWithProfile) || []);
        } else {
          setItems([]);
        }
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      // Clear local storage manually to ensure token is removed
      if (typeof window !== 'undefined') {
        Object.keys(window.localStorage).forEach(key => {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            window.localStorage.removeItem(key);
          }
        });
      }
    } catch (error) {
      console.error('Unexpected error during logout:', error);
    } finally {
      setUser(null);
      window.location.href = '/';
    }
  };

  const handleEditItem = (item: any) => {
    router.push(`/upload?edit=${item.id}`);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('确定要删除这个作品吗？此操作无法撤销。')) return;

    try {
      // Delete the item (Database cascade will handle orders and likes)
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setItems(prev => prev.filter(item => item.id !== id));
      setCounts(prev => ({ ...prev, works: Math.max(0, prev.works - 1) }));

      // Update global cache
      exploreCache.removeItem(id);
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('删除失败，请重试');
    }
  };

  return (
    <div className="page-section relative z-10">
      {/* Profile Header */}
      <div className="relative h-64 overflow-hidden">
        {/* Removed gradient and pattern to show pure background */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-slate-900 to-transparent"></div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative -mt-20">
        <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
          <div className="relative">
            <img 
              src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`} 
              className="w-32 h-32 rounded-full border-4 border-slate-900 bg-slate-800 object-cover"
            />
          </div>
          <div className="flex-grow mb-2">
            <h1 className="text-3xl font-bold text-white mb-1">{profile?.username || user?.email?.split('@')[0] || 'Loading...'}</h1>
            <p className="text-slate-400 text-sm max-w-xl">{profile?.bio || '这个家伙很懒，什么都没写'}</p>
          </div>
          <div className="flex gap-3 mb-4">
            <button 
              onClick={openEditProfileModal}
              className="px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-slate-800 transition text-sm font-bold"
            >
              <i className="fa-solid fa-pen-to-square mr-2"></i>编辑资料
            </button>
            <button 
              onClick={openPaymentQRModal}
              className="px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-slate-800 transition text-sm font-bold"
            >
              <i className="fa-solid fa-qrcode mr-2"></i>收款码
            </button>
            <button 
              onClick={openManageOrdersModal}
              className="px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-slate-800 transition text-sm font-bold"
            >
              <i className="fa-solid fa-list-check mr-2"></i>订单管理
            </button>
            <button 
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-rose-900/30 hover:text-rose-400 hover:border-rose-500/50 transition text-sm font-bold"
            >
              <i className="fa-solid fa-right-from-bracket mr-2"></i>退出
            </button>
          </div>
        </div>

        {/* Profile Tabs */}
        <div className="border-b border-slate-700 mb-8">
          <div className="flex gap-8 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('works')} 
              className={`px-4 py-3 font-bold text-sm transition whitespace-nowrap border-b-2 ${activeTab === 'works' ? 'text-brand-400 border-brand-500' : 'text-slate-400 border-transparent hover:text-white'}`}
            >
              我的作品 <span className="ml-1 bg-brand-900/50 px-2 py-0.5 rounded-full text-xs">{counts.works}</span>
            </button>
            <button 
              onClick={() => setActiveTab('purchased')} 
              className={`px-4 py-3 font-bold text-sm transition whitespace-nowrap border-b-2 ${activeTab === 'purchased' ? 'text-brand-400 border-brand-500' : 'text-slate-400 border-transparent hover:text-white'}`}
            >
              已购买 <span className="ml-1 bg-slate-800 px-2 py-0.5 rounded-full text-xs">{counts.purchased}</span>
            </button>
            <button 
              onClick={() => setActiveTab('favorites')} 
              className={`px-4 py-3 font-bold text-sm transition whitespace-nowrap border-b-2 ${activeTab === 'favorites' ? 'text-brand-400 border-brand-500' : 'text-slate-400 border-transparent hover:text-white'}`}
            >
              我的喜欢 <span className="ml-1 bg-slate-800 px-2 py-0.5 rounded-full text-xs">{counts.favorites}</span>
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="pb-20">
          {loading ? (
            <div className="text-center py-20">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <i className="fa-solid fa-box-open text-4xl mb-4 opacity-50"></i>
              <p>这里空空如也</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {items.map(item => (
                <div key={item.id} className="relative">
                  <ProjectCard 
                    item={item} 
                    isLiked={false} // TODO: Implement like status check
                    onLike={() => {}} // TODO: Implement like handler
                    onClick={(id) => openDetailModal(id, item)}
                    isOwner={activeTab === 'works'}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                  />
                  {activeTab === 'purchased' && item.orderStatus === 'paid' && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-10 border border-brand-500/50">
                        <div className="w-12 h-12 bg-brand-500/20 rounded-full flex items-center justify-center mb-3 animate-pulse">
                            <i className="fa-solid fa-hourglass-half text-brand-500 text-xl"></i>
                        </div>
                        <span className="text-white font-bold mb-1">等待确认</span>
                        <span className="text-xs text-slate-400">卖家确认收款中...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Logout Button - Removed from here */}
        </div>
      </div>
    </div>
  );
}
