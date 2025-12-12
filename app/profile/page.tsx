'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { exploreCache } from '@/lib/cache';
import ProjectCard from '@/components/ProjectCard';
import { useLanguage } from '@/context/LanguageContext';
import BackendDataPanel from '@/components/BackendDataPanel';
import Galaxy from '@/components/Galaxy';

import { useRouter } from 'next/navigation';

export default function Profile() {
  const router = useRouter();
  const { openLoginModal, openDetailModal, openEditProfileModal, openCreditPurchaseModal } = useModal();
  const { success: toastSuccess } = useToast();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'works' | 'drafts' | 'favorites'>('works');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ works: 0, drafts: 0, favorites: 0 });
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
        const [worksRes, favoritesRes] = await Promise.all([
          supabase.from('items').select('id', { count: 'exact', head: true }).eq('author_id', user.id).neq('is_draft', true),
          supabase.from('likes').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
        ]);
        setCounts({
          works: worksRes.count || 0,
          drafts: draftsCount || 0,
          favorites: favoritesRes.count || 0
        });
      } else if (data) {
        setCounts({
          works: data.works || 0,
          drafts: draftsCount || 0,
          favorites: data.favorites || 0
        });
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
    <div className="min-h-screen bg-black text-white pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row items-start gap-8 mb-12">
           {/* Avatar */}
           <div className="relative group">
              <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
                <img 
                  src={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`} 
                  className="w-full h-full rounded-full bg-zinc-900 object-cover"
                  onError={(e) => {
                    e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`;
                  }}
                />
              </div>
              <button 
                onClick={openEditProfileModal}
                className="absolute bottom-0 right-0 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition shadow-lg"
              >
                <i className="fa-solid fa-camera text-xs"></i>
              </button>
           </div>

           {/* Info */}
           <div className="flex-1 min-w-0 pt-2">
              <div className="flex flex-wrap items-center gap-4 mb-2">
                <h1 className="text-3xl font-bold text-white truncate">
                  {profile?.username || user?.email?.split('@')[0] || 'Loading...'}
                </h1>
              </div>
              <p className="text-slate-400 text-sm max-w-2xl mb-6 leading-relaxed">
                {profile?.bio || t.profile.default_bio}
              </p>

              {/* Stats Row */}
              <div className="flex flex-wrap gap-6 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-yellow-400">
                    <i className="fa-solid fa-coins"></i>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase">{t.profile.credits}</div>
                    <div className="text-white font-bold">
                      {profile?.credits !== undefined 
                        ? (Number.isInteger(profile.credits) ? profile.credits : Number(profile.credits).toFixed(1)) 
                        : 30}
                    </div>
                  </div>
                  <button onClick={openCreditPurchaseModal} className="ml-1 text-brand-400 hover:text-brand-300"><i className="fa-solid fa-plus-circle"></i></button>
                </div>
                
                <div className="w-px h-8 bg-white/10"></div>

                <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-blue-400">
                    <i className="fa-solid fa-layer-group"></i>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase">{t.profile.tabs.works}</div>
                    <div className="text-white font-bold">{counts.works}</div>
                  </div>
                </div>

                <div className="w-px h-8 bg-white/10"></div>

                <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-pink-400">
                    <i className="fa-solid fa-heart"></i>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase">{t.profile.tabs.favorites}</div>
                    <div className="text-white font-bold">{counts.favorites}</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 items-center">
                <button 
                  onClick={() => setShowBackendPanel(true)}
                  className="group relative px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white text-sm font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center gap-2 border border-white/10 overflow-hidden mr-2"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <i className="fa-solid fa-database text-indigo-200 group-hover:text-white transition-colors"></i>
                  <span className="relative z-10">{t.profile.backend_data || '后端数据'}</span>
                  <i className="fa-solid fa-sparkles text-yellow-300 text-xs animate-pulse"></i>
                </button>
                <button 
                  onClick={openEditProfileModal}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition flex items-center gap-2"
                >
                  <i className="fa-solid fa-pen-to-square text-slate-400"></i>{t.profile.edit_profile}
                </button>
                <button 
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 text-sm font-medium transition flex items-center gap-2 ml-auto md:ml-0"
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                </button>
              </div>
           </div>
        </div>

        {/* Tabs & Filter */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-white/10 pb-1">
          <div className="flex gap-6 overflow-x-auto no-scrollbar">
            {[
              { id: 'works', label: t.profile.tabs.works, count: counts.works },
              { id: 'drafts', label: t.profile.tabs.drafts, count: counts.drafts },
              { id: 'favorites', label: t.profile.tabs.favorites, count: counts.favorites },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`pb-3 font-medium text-sm transition whitespace-nowrap relative ${
                  activeTab === tab.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-white text-black' : 'bg-white/10 text-slate-400'
                }`}>{tab.count}</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-white rounded-t-full"></div>
                )}
              </button>
            ))}
          </div>

          {/* Visibility Filter (Only for Works tab) */}
          {activeTab === 'works' && (
            <div className="flex bg-white/5 border border-white/10 p-1 rounded-lg self-start md:self-auto">
              <button 
                onClick={() => setFilterVisibility('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filterVisibility === 'all' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.profile.filter.all}
              </button>
              <button 
                onClick={() => setFilterVisibility('public')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filterVisibility === 'public' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.profile.filter.public}
              </button>
              <button 
                onClick={() => setFilterVisibility('private')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filterVisibility === 'private' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.profile.filter.private}
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex justify-center py-20">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 border border-dashed border-white/10 rounded-2xl bg-white/5">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <i className="fa-solid fa-box-open text-2xl opacity-50"></i>
              </div>
              <p>
                {filterVisibility === 'all' ? t.profile.empty.all : 
                 filterVisibility === 'public' ? t.profile.empty.public : t.profile.empty.private}
              </p>
              {activeTab === 'works' && (
                <button 
                  onClick={() => router.push('/create')}
                  className="mt-6 px-6 py-2 bg-white text-black rounded-lg font-bold hover:bg-slate-200 transition"
                >
                  {t.create?.start_creating || 'Start Creating'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredItems.map(item => (
                <div key={item.id} className="relative group">
                  <ProjectCard 
                    item={item} 
                    isLiked={false} 
                    onLike={() => {}} 
                    onClick={(id) => openDetailModal(id, item)}
                    isOwner={activeTab === 'works' || activeTab === 'drafts'}
                    onEdit={handleEditItem}
                    onUpdate={handleUpdateItem}
                    onDelete={handleDeleteItem}
                  />
                </div>
              ))}
            </div>
          )}
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
