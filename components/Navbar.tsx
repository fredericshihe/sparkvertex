'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [credits, setCredits] = useState<number | null>(null);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openLoginModal, openFeedbackModal, openCreditPurchaseModal } = useModal();
  const { success } = useToast();
  const { t, language, setLanguage } = useLanguage();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 控制移动端菜单打开时禁止body滚动
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    // Check for email verification hash
    if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('type=signup')) {
      success(t.nav.email_verified_success, 5000);
    }

    const fetchUserProfile = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url, credits')
          .eq('id', userId)
          .maybeSingle();
        
        if (error) {
          console.error('Error fetching profile:', error);
          return;
        }
  
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
        if (data?.credits !== undefined) {
          setCredits(data.credits);
        }
      } catch (error) {
        console.error('Unexpected error fetching profile:', error);
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
          fetchUserProfile(session.user.id);
        } else {
          setAvatarUrl('');
          setIsLoadingAvatar(true);
          fetchUserProfile(session.user.id);
        }
      } else {
        setAvatarUrl('');
        setCredits(null);
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
        setCredits(null);
        // Clear any other local state if necessary
      }
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 订阅积分实时更新
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('navbar-credits')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          const newCredits = (payload.new as any)?.credits;
          if (newCredits !== undefined) {
            setCredits(newCredits);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Hide Navbar in App Mode OR Create Page
  if (searchParams.get('mode') === 'app' || pathname === '/create') return null;

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const isActive = (path: string) => pathname === path ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5';

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  return (
    <nav className={`fixed w-full z-50 transition-all duration-500 ${scrolled ? 'bg-black/40 backdrop-blur-md border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center flex-shrink-0">
            <Link href="/" className="flex items-center cursor-pointer mr-12 group flex-shrink-0">
              <div className="flex-shrink-0 flex items-center">
                <Image 
                  src="/logo.png" 
                  alt="Logo" 
                  width={32}
                  height={32}
                  className="mr-3 object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                  priority
                />
              </div>
              <div className="flex items-center">
                <span className="font-medium text-lg tracking-wide text-white/90 group-hover:text-white transition-colors">Spark<span className="text-white/60">Vertex</span></span>
              </div>
            </Link>
            <div className="hidden md:block">
              <div className="flex items-baseline space-x-2">
                <Link href="/" className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/')}`}>{t.nav.home}</Link>
                <Link href="/explore" className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${isActive('/explore')}`}>{t.nav.explore}</Link>
                <Link href="/create" className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${isActive('/create')}`}>
                  <i className="fa-solid fa-wand-magic-sparkles text-white/60"></i> {t.nav.create}
                </Link>
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center ml-4 gap-4">
            <button onClick={toggleLanguage} className="text-white/50 hover:text-white px-3 py-1 rounded-full text-xs font-medium border border-white/5 hover:bg-white/5 transition-all duration-300">
              {language === 'zh' ? 'EN' : '中'}
            </button>
            <button onClick={openFeedbackModal} className="text-white/50 hover:text-white px-3 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 hover:bg-white/5" title={t.nav.feedback}>
              <i className="fa-solid fa-comment-dots"></i>
            </button>
            <Link href="/upload" className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 hover:text-white px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 backdrop-blur-sm">
              <i className="fa-solid fa-cloud-arrow-up mr-2 text-white/60"></i>{t.nav.upload}
            </Link>
            <div id="nav-auth-container" className="pl-2 border-l border-white/10 ml-2 flex items-center gap-3">
              {user ? (
                <>
                  {/* 积分显示和充值按钮 */}
                  <button 
                    onClick={openCreditPurchaseModal}
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-all duration-300"
                  >
                    <div className="flex items-center gap-1.5">
                      <i className="fa-solid fa-coins text-amber-400 text-sm"></i>
                      <span className="text-amber-300 font-semibold text-sm">
                        {credits !== null ? (Number.isInteger(credits) ? credits : credits.toFixed(1)) : '--'}
                      </span>
                    </div>
                    <div className="w-px h-4 bg-amber-500/20"></div>
                    <i className="fa-solid fa-plus text-amber-400/60 group-hover:text-amber-300 text-xs transition-colors"></i>
                  </button>
                  {/* 头像 */}
                  <Link href="/profile" className="flex items-center text-white/60 hover:text-white font-medium text-sm transition-all duration-300">
                     {isLoadingAvatar ? (
                       <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 animate-pulse"></div>
                     ) : (
                       <img 
                          src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                          className="w-8 h-8 rounded-full border border-white/10 object-cover hover:border-white/30 transition-colors" 
                          alt="Avatar"
                          onError={(e) => {
                            e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`;
                          }}
                       />
                     )}
                  </Link>
                </>
              ) : (
                <button onClick={openLoginModal} className="text-white/60 hover:text-white font-medium text-sm transition-all duration-300 px-3 py-2 hover:bg-white/5 rounded-full">{t.nav.login}</button>
              )}
            </div>
          </div>
          <div className="md:hidden flex items-center gap-3">
            <button onClick={toggleLanguage} className="text-white/50 hover:text-white px-2 py-1 rounded-md text-xs font-bold border border-white/10 hover:bg-white/5 transition">
              {language === 'zh' ? 'EN' : '中'}
            </button>
            <button onClick={toggleMobileMenu} className="text-white/60 hover:text-white p-2 active-scale">
              <i className={`fa-solid ${isMobileMenuOpen ? 'fa-xmark' : 'fa-bars'} text-lg`}></i>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* 背景遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            {/* 菜单内容 */}
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="md:hidden bg-black/95 backdrop-blur-xl border-b border-white/10 overflow-hidden absolute top-16 left-0 w-full shadow-2xl z-50"
            >
            <div className="px-4 pt-4 pb-6 space-y-2">
              <Link 
                href="/" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-base font-medium transition-all ${isActive('/')}`}
              >
                <span className="w-6 inline-flex justify-center"><i className="fa-solid fa-home text-brand-400"></i></span>
                <span className="ml-3">{t.nav.home}</span>
              </Link>
              <Link 
                href="/explore" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-base font-medium transition-all ${isActive('/explore')}`}
              >
                <span className="w-6 inline-flex justify-center"><i className="fa-solid fa-compass text-brand-400"></i></span>
                <span className="ml-3">{t.nav.explore}</span>
              </Link>
              <Link 
                href="/create" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-base font-medium transition-all ${isActive('/create')}`}
              >
                <span className="w-6 inline-flex justify-center"><i className="fa-solid fa-wand-magic-sparkles text-brand-400"></i></span>
                <span className="ml-3">{t.nav.create}</span>
              </Link>
              <button 
                onClick={() => {
                  openFeedbackModal();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center px-4 py-3 rounded-xl text-base font-medium text-white/80 hover:bg-white/5 transition-all"
              >
                <span className="w-6 inline-flex justify-center"><i className="fa-solid fa-comment-dots text-brand-400"></i></span>
                <span className="ml-3">{t.nav.feedback}</span>
              </button>
              <Link 
                href="/upload" 
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-base font-medium transition-all ${isActive('/upload')}`}
              >
                <span className="w-6 inline-flex justify-center"><i className="fa-solid fa-cloud-arrow-up text-brand-400"></i></span>
                <span className="ml-3">{t.nav.upload}</span>
              </Link>
              
              <div className="border-t border-white/10 my-2 pt-2">
                {user ? (
                  <>
                    {/* 移动端积分显示和充值 */}
                    <button 
                      onClick={() => {
                        openCreditPurchaseModal();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium hover:bg-white/5 transition-all mb-1"
                    >
                      <div className="flex items-center">
                        <span className="w-6 inline-flex justify-center"><i className="fa-solid fa-coins text-amber-400"></i></span>
                        <span className="ml-3 text-white/80">{language === 'zh' ? '我的积分' : 'Credits'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-300 font-semibold">
                          {credits !== null ? (Number.isInteger(credits) ? credits : credits.toFixed(1)) : '--'}
                        </span>
                        <span className="text-xs text-amber-400/60 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          {language === 'zh' ? '充值' : 'Top up'}
                        </span>
                      </div>
                    </button>
                    {/* 个人中心 */}
                    <Link 
                      href="/profile" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center px-4 py-3 rounded-xl text-base font-medium text-white/80 hover:bg-white/5 transition-all"
                    >
                      <span className="w-6 inline-flex justify-center">
                        <img 
                          src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                          className="w-5 h-5 rounded-full border border-white/10 object-cover" 
                          alt="Avatar"
                        />
                      </span>
                      <span className="ml-3">{language === 'zh' ? '个人中心' : 'Profile'}</span>
                    </Link>
                  </>
                ) : (
                  <button 
                    onClick={() => {
                      openLoginModal();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl text-base font-medium text-white/80 hover:bg-white/5 transition-all"
                  >
                    {t.nav.login}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}
