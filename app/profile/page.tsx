'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { exploreCache } from '@/lib/cache';
import ProjectCard from '@/components/ProjectCard';
import { useLanguage } from '@/context/LanguageContext';
import BackendDataPanel from '@/components/BackendDataPanel';

import { useRouter } from 'next/navigation';

export default function Profile() {
  const router = useRouter();
  const { openLoginModal, openDetailModal, openEditProfileModal, openPaymentQRModal, openManageOrdersModal, openCreditPurchaseModal } = useModal();
  const { success: toastSuccess } = useToast();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'works' | 'drafts' | 'purchased' | 'favorites'>('works');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ works: 0, drafts: 0, purchased: 0, favorites: 0 });
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all');
  
  // 后端数据面板状态
  const [showBackendPanel, setShowBackendPanel] = useState(false);

  useEffect(() => {
    checkAuth();
    
    // 检查 URL 参数，看是否是从支付页面跳转回来的
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      // 延迟一下再显示提示，让页面先加载
      setTimeout(() => {
        toastSuccess?.('支付成功！正在检查积分到账情况...');
      }, 500);
      
      // 清理 URL 参数
      window.history.replaceState({}, '', '/profile');
    }
  }, [toastSuccess]);

  useEffect(() => {
    if (user) {
      // ✅ 并行化初始数据获取 - 减少加载时间
      Promise.all([
        fetchProfile(),
        fetchCounts(), // 先获取计数，更快反馈
        fetchItems()
      ]);
      
      // 检查是否有待处理的支付
      const checkPendingPayment = () => {
        const pendingTime = localStorage.getItem('pending_payment_time');
        if (pendingTime) {
          const elapsed = Date.now() - parseInt(pendingTime);
          // 如果在10分钟内,提示用户刷新检查积分
          if (elapsed < 10 * 60 * 1000) {
            toastSuccess?.('正在检查支付状态...');
            // 刷新积分
            fetchProfile();
            // 清除标记
            localStorage.removeItem('pending_payment_time');
          }
        }
      };
      
      checkPendingPayment();

      // Subscribe to profile changes for real-time credit updates
      const channel = supabase
        .channel('profile-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          },
          (payload) => {
            const newProfile = payload.new as any;
            setProfile((prev: any) => ({ ...prev, ...newProfile }));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, activeTab]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUser(session.user);
      
      // Check daily bonus
      try {
        const { data: bonusData } = await supabase.rpc('check_daily_bonus');
        if (bonusData && bonusData.awarded) {
          toastSuccess(`${t.profile.daily_bonus} ${bonusData.credits}`);
          // Refresh profile to show new credits
          fetchProfile();
        }
      } catch (error) {
        console.error('Failed to check daily rewards:', error);
      }
    } else {
      openLoginModal();
    }
  };

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }
      
      if (data) {
        setProfile(data);
      }
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
    }
  };

  const fetchCounts = async () => {
    if (!user) return;

    try {
      // Fetch drafts count separately
      const { count: draftsCount } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', user.id)
        .eq('is_draft', true);

      // 使用存储过程一次性获取所有计数，减少延迟
      const { data, error } = await supabase.rpc('get_user_counts', { p_user_id: user.id });
      
      if (error) {
        console.error('Error calling get_user_counts:', error);
        // 降级到原有逻辑
        const [worksRes, purchasedRes, favoritesRes, pendingRes] = await Promise.all([
          supabase.from('items').select('id', { count: 'exact', head: true }).eq('author_id', user.id).neq('is_draft', true),
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('buyer_id', user.id),
          supabase.from('likes').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('seller_id', user.id).eq('status', 'paid')
        ]);
        setCounts({
          works: worksRes.count || 0,
          drafts: draftsCount || 0,
          purchased: purchasedRes.count || 0,
          favorites: favoritesRes.count || 0
        });
        setPendingOrdersCount(pendingRes.count || 0);
      } else if (data) {
        setCounts({
          works: data.works || 0,
          drafts: draftsCount || 0,
          purchased: data.purchased || 0,
          favorites: data.favorites || 0
        });
        setPendingOrdersCount(data.pending_orders || 0);
      }
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
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
          .eq('author_id', user.id)
          .neq('is_draft', true)
          .order('created_at', { ascending: false });
        setItems(data?.map(mapItemWithProfile) || []);
      } else if (activeTab === 'drafts') {
        const { data } = await supabase
          .from('items')
          .select(selectQuery)
          .eq('author_id', user.id)
          .eq('is_draft', true)
          .order('created_at', { ascending: false });
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
    } catch (error) {
      console.error('Unexpected error during logout:', error);
    } finally {
      // 1. Clear Supabase LocalStorage
      if (typeof window !== 'undefined') {
        Object.keys(window.localStorage).forEach(key => {
          if (key.startsWith('sb-')) {
            window.localStorage.removeItem(key);
          }
        });
      }

      // 2. Clear Cookies (Crucial for auth-helpers)
      if (typeof document !== 'undefined') {
        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
      }

      setUser(null);
      window.location.href = '/';
    }
  };

  const handleEditItem = (item: any) => {
    if (item.is_draft) {
      router.push(`/create?draftId=${item.id}`);
    } else {
      // 直接进入创作页面编辑
      router.push(`/create?editId=${item.id}`);
    }
  };

  // 更新作品 - 重新上传替换
  const handleUpdateItem = (item: any) => {
    router.push(`/upload?update=${item.id}`);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm(t.profile.delete_confirm)) return;

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
      alert(t.profile.delete_failed);
    }
  };

  const filteredItems = items.filter(item => {
    if (activeTab !== 'works') return true;
    if (filterVisibility === 'public') return item.is_public !== false;
    if (filterVisibility === 'private') return item.is_public === false;
    return true;
  });

  return (
    <div className="page-section relative z-10">
      {/* Profile Header */}
      <div className="relative h-64 overflow-hidden">
        {/* Removed gradient and pattern to show pure background */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-slate-900 to-transparent"></div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative -mt-20">
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 mb-8 text-center md:text-left">
          <div className="relative">
            <img 
              src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`} 
              className="w-32 h-32 rounded-full border-4 border-slate-900 bg-slate-800 object-cover"
              onError={(e) => {
                e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`;
              }}
            />
          </div>
          <div className="flex-grow mb-2 w-full md:w-auto">
            <h1 className="text-3xl font-bold text-white mb-1">{profile?.username || user?.email?.split('@')[0] || 'Loading...'}</h1>
            <p className="text-slate-400 text-sm max-w-xl mx-auto md:mx-0">{profile?.bio || t.profile.default_bio}</p>
          </div>
          <div className="flex flex-wrap justify-center md:justify-end gap-3 mb-4 w-full md:w-auto">
            <button 
              onClick={() => setShowBackendPanel(true)}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white transition text-sm font-bold shadow-lg shadow-brand-500/20"
            >
              <i className="fa-solid fa-database mr-2"></i>{t.profile.backend_data || '后端数据'}
            </button>
            <button 
              onClick={openEditProfileModal}
              className="px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-slate-800 transition text-sm font-bold"
            >
              <i className="fa-solid fa-pen-to-square mr-2"></i>{t.profile.edit_profile}
            </button>
            <button 
              onClick={openPaymentQRModal}
              className="px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-slate-800 transition text-sm font-bold"
            >
              <i className="fa-solid fa-qrcode mr-2"></i>{t.profile.payment_qr}
            </button>
            <button 
              onClick={openManageOrdersModal}
              className="relative px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-slate-800 transition text-sm font-bold"
            >
              <i className="fa-solid fa-list-check mr-2"></i>{t.profile.manage_orders}
              {pendingOrdersCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold border-2 border-slate-900 animate-bounce">
                  {pendingOrdersCount}
                </span>
              )}
            </button>
            <button 
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg glass-panel border border-slate-600 hover:bg-rose-900/30 hover:text-rose-400 hover:border-rose-500/50 transition text-sm font-bold"
            >
              <i className="fa-solid fa-right-from-bracket mr-2"></i>{t.profile.logout}
            </button>
          </div>
        </div>

        {/* Credits Section - Compact */}
        <div className="glass-panel p-4 rounded-xl border border-slate-700/50 mb-8 flex flex-col sm:flex-row gap-6 items-center">
          
          {/* Unified Credits */}
          <div className="flex items-center gap-4 flex-1 w-full">
            <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-lg shrink-0">
              <i className="fa-solid fa-coins"></i>
            </div>
            <div className="flex-1">
              <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-0.5">{t.profile.credits}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-white">
                  {profile?.credits !== undefined 
                    ? (Number.isInteger(profile.credits) ? profile.credits : Number(profile.credits).toFixed(1)) 
                    : 30}
                </span>
                <span className="text-xs text-slate-500">分</span>
              </div>
            </div>
            <button 
              onClick={openCreditPurchaseModal}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition shadow-lg shadow-brand-500/20 flex items-center gap-1"
            >
              <i className="fa-solid fa-plus"></i> {t.create?.get_credits || '充值'}
            </button>
          </div>

          {/* Info / Top-up Hint (Optional) */}
          <div className="hidden sm:block w-px h-8 bg-slate-700"></div>
          <div className="block sm:hidden w-full h-px bg-slate-700"></div>

          <div className="flex items-center gap-4 flex-1 w-full">
             <div className="text-sm text-slate-400">
                <p><i className="fa-solid fa-circle-info mr-1 text-blue-400"></i> {t.profile.daily_bonus}</p>
                <p className="mt-1"><i className="fa-solid fa-bolt mr-1 text-yellow-400"></i> {t.profile.create_cost}</p>
             </div>
          </div>

        </div>

        {/* Profile Tabs */}
        <div className="border-b border-slate-700 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-8 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('works')} 
              className={`px-4 py-3 font-bold text-sm transition whitespace-nowrap border-b-2 ${activeTab === 'works' ? 'text-brand-400 border-brand-500' : 'text-slate-400 border-transparent hover:text-white'}`}
            >
              {t.profile.tabs.works} <span className="ml-1 bg-brand-900/50 px-2 py-0.5 rounded-full text-xs">{counts.works}</span>
            </button>
            <button 
              onClick={() => setActiveTab('drafts')} 
              className={`px-4 py-3 font-bold text-sm transition whitespace-nowrap border-b-2 ${activeTab === 'drafts' ? 'text-brand-400 border-brand-500' : 'text-slate-400 border-transparent hover:text-white'}`}
            >
              {t.profile.tabs.drafts} <span className="ml-1 bg-slate-800 px-2 py-0.5 rounded-full text-xs">{counts.drafts}</span>
            </button>
            <button 
              onClick={() => setActiveTab('purchased')}  
              className={`px-4 py-3 font-bold text-sm transition whitespace-nowrap border-b-2 ${activeTab === 'purchased' ? 'text-brand-400 border-brand-500' : 'text-slate-400 border-transparent hover:text-white'}`}
            >
              {t.profile.tabs.purchased} <span className="ml-1 bg-slate-800 px-2 py-0.5 rounded-full text-xs">{counts.purchased}</span>
            </button>
            <button 
              onClick={() => setActiveTab('favorites')} 
              className={`px-4 py-3 font-bold text-sm transition whitespace-nowrap border-b-2 ${activeTab === 'favorites' ? 'text-brand-400 border-brand-500' : 'text-slate-400 border-transparent hover:text-white'}`}
            >
              {t.profile.tabs.favorites} <span className="ml-1 bg-slate-800 px-2 py-0.5 rounded-full text-xs">{counts.favorites}</span>
            </button>
          </div>

          {/* Visibility Filter (Only for Works tab) */}
          {activeTab === 'works' && (
            <div className="flex bg-slate-800/50 p-1 rounded-lg self-start md:self-auto">
              <button 
                onClick={() => setFilterVisibility('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filterVisibility === 'all' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.profile.filter.all}
              </button>
              <button 
                onClick={() => setFilterVisibility('public')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filterVisibility === 'public' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.profile.filter.public}
              </button>
              <button 
                onClick={() => setFilterVisibility('private')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filterVisibility === 'private' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.profile.filter.private}
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="pb-20">
          {loading ? (
            <div className="text-center py-20">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <i className="fa-solid fa-box-open text-4xl mb-4 opacity-50"></i>
              <p>
                {filterVisibility === 'all' ? t.profile.empty.all : 
                 filterVisibility === 'public' ? t.profile.empty.public : t.profile.empty.private}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredItems.map(item => (
                <div key={item.id} className="relative">
                  <ProjectCard 
                    item={item} 
                    isLiked={false} // TODO: Implement like status check
                    onLike={() => {}} // TODO: Implement like handler
                    onClick={(id) => openDetailModal(id, item)}
                    isOwner={activeTab === 'works' || activeTab === 'drafts'}
                    onEdit={handleEditItem}
                    onUpdate={handleUpdateItem}
                    onDelete={handleDeleteItem}
                  />
                  {activeTab === 'purchased' && item.orderStatus === 'paid' && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-10 border border-brand-500/50">
                        <div className="w-12 h-12 bg-brand-500/20 rounded-full flex items-center justify-center mb-3 animate-pulse">
                            <i className="fa-solid fa-hourglass-half text-brand-500 text-xl"></i>
                        </div>
                        <span className="text-white font-bold mb-1">{t.profile.waiting_confirm}</span>
                        <span className="text-xs text-slate-400">{t.profile.seller_confirming}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Logout Button - Removed from here */}
        </div>
      </div>
      
      {/* 后端数据管理面板 */}
      <BackendDataPanel
        isOpen={showBackendPanel}
        onClose={() => setShowBackendPanel(false)}
        userId={user?.id || null}
        language={language as 'zh' | 'en'}
        mode="production"
      />
    </div>
  );
}
