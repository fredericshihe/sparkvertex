'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openLoginModal, openFeedbackModal } = useModal();
  const { success } = useToast();

  useEffect(() => {
    // Check for email verification hash
    if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('type=signup')) {
      success('邮箱验证成功，已自动登录', 5000);
    }

    const fetchUserAvatar = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', userId)
          .maybeSingle();
        
        if (error) {
          console.error('Error fetching avatar:', error);
          return;
        }
  
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
      } catch (error) {
        console.error('Unexpected error fetching avatar:', error);
      } finally {
        setIsLoadingAvatar(false);
      }
    };

    const handleSession = (session: any) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const metadataAvatar = session.user.user_metadata?.avatar_url;
        if (metadataAvatar) {
          setAvatarUrl(metadataAvatar);
          // Background update check
          fetchUserAvatar(session.user.id);
        } else {
          setAvatarUrl('');
          setIsLoadingAvatar(true);
          fetchUserAvatar(session.user.id);
        }
      } else {
        setAvatarUrl('');
        setIsLoadingAvatar(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
        // If refresh token is invalid, force sign out to clear bad state
        if (error.message.includes('Refresh Token')) {
          supabase.auth.signOut();
        }
      }
      handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAvatarUrl('');
        // Clear any other local state if necessary
      }
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Hide Navbar in App Mode OR Create Page
  if (searchParams.get('mode') === 'app' || pathname === '/create') return null;

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const isActive = (path: string) => pathname === path ? 'bg-slate-700' : '';

  return (
    <nav className="fixed w-full z-50 glass-panel border-b border-slate-700/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center cursor-pointer mr-8">
              <div className="flex-shrink-0 flex items-center">
                <img 
                  src="/logo.png" 
                  alt="Logo" 
                  className="w-8 h-8 mr-2 object-contain mix-blend-screen" 
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div className="flex items-center">
                <span className="font-bold text-lg md:text-xl tracking-tight text-white">Spark<span className="text-brand-500">Vertex</span> 灵枢</span>
              </div>
            </Link>
            <div className="hidden md:block">
              <div className="flex items-baseline space-x-4">
                <Link href="/" className={`hover:bg-slate-700 px-3 py-2 rounded-md text-sm font-medium transition text-white ${isActive('/')}`}>首页</Link>
                <Link href="/why" className={`hover:bg-slate-700 px-3 py-2 rounded-md text-sm font-medium transition text-white ${isActive('/why')}`}>核心理念</Link>
                <Link href="/guide" className={`hover:bg-slate-700 px-3 py-2 rounded-md text-sm font-medium transition text-white ${isActive('/guide')}`}>开发流程</Link>
                <Link href="/explore" className={`hover:bg-slate-700 px-3 py-2 rounded-md text-sm font-medium transition text-white ${isActive('/explore')}`}>灵枢广场</Link>
                <Link href="/create" className={`hover:bg-slate-700 px-3 py-2 rounded-md text-sm font-medium transition text-white flex items-center gap-2 ${isActive('/create')}`}>
                  <i className="fa-solid fa-wand-magic-sparkles text-brand-400"></i> 开始创造
                </Link>
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center ml-4 gap-4">
            <button onClick={openFeedbackModal} className="text-slate-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition flex items-center gap-2" title="问题反馈">
              <i className="fa-solid fa-comment-dots"></i>
              <span>反馈</span>
            </button>
            <Link href="/upload" className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-full text-sm font-medium transition shadow-lg shadow-brand-500/30">
              <i className="fa-solid fa-cloud-arrow-up mr-2"></i>上传作品
            </Link>
            <div id="nav-auth-container">
              {user ? (
                <Link href="/profile" className="flex items-center gap-2 text-slate-300 hover:text-white font-medium text-sm transition">
                   {isLoadingAvatar ? (
                     <div className="w-8 h-8 rounded-full border border-slate-600 bg-slate-800 animate-pulse"></div>
                   ) : (
                     <img 
                        src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                        className="w-8 h-8 rounded-full border border-slate-600 object-cover" 
                        alt="Avatar"
                        onError={(e) => {
                          e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`;
                        }}
                     />
                   )}
                </Link>
              ) : (
                <button onClick={openLoginModal} className="text-slate-300 hover:text-white font-medium text-sm transition">登录</button>
              )}
            </div>
          </div>
          <div className="md:hidden flex items-center">
            <button onClick={toggleMobileMenu} className="text-gray-300 hover:text-white p-2"><i className="fa-solid fa-bars text-xl"></i></button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-40 md:hidden" onClick={toggleMobileMenu}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"></div>
          <div 
            className="absolute top-0 left-0 w-full bg-slate-900/95 backdrop-blur-xl border-b border-slate-800 shadow-2xl animate-slide-down origin-top"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-2 pb-4 space-y-1">
              <Link href="/" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-home w-6 text-center"></i> 首页</Link>
              <Link href="/why" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-book w-6 text-center"></i> 核心理念</Link>
              <Link href="/guide" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-wand-magic-sparkles w-6 text-center"></i> 开发流程</Link>
              <Link href="/explore" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-lightbulb w-6 text-center"></i> 灵枢广场</Link>
              <Link href="/create" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-wand-magic-sparkles w-6 text-center"></i> 开始创造</Link>
              <button onClick={() => { toggleMobileMenu(); openFeedbackModal(); }} className="block w-full text-left px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-comment-dots w-6 text-center"></i> 问题反馈</button>
              <Link href="/upload" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-md text-base font-medium text-brand-400 hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-cloud-arrow-up w-6 text-center"></i> 上传作品</Link>
              <div className="border-t border-slate-800 my-2 pt-2">
                {user ? (
                   <Link href="/profile" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-user w-6 text-center"></i> 个人中心</Link>
                ) : (
                   <button onClick={() => { toggleMobileMenu(); openLoginModal(); }} className="w-full text-left px-3 py-3 rounded-md text-base font-medium text-white hover:bg-slate-800 active:bg-slate-800 transition touch-manipulation"><i className="fa-solid fa-user w-6 text-center"></i> 登录 / 注册</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
