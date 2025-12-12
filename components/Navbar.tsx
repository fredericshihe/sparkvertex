'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openLoginModal, openFeedbackModal } = useModal();
  const { success } = useToast();
  const { t, language, setLanguage } = useLanguage();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Check for email verification hash
    if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('type=signup')) {
      success(t.nav.email_verified_success, 5000);
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

  const isActive = (path: string) => pathname === path ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5';

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  return (
    <nav className={`fixed w-full z-50 transition-all duration-500 ${scrolled ? 'bg-black/40 backdrop-blur-md border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center cursor-pointer mr-12 group">
              <div className="flex-shrink-0 flex items-center">
                <img 
                  src="/logo.png" 
                  alt="Logo" 
                  className="w-8 h-8 mr-3 object-contain opacity-90 group-hover:opacity-100 transition-opacity" 
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
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
            <div id="nav-auth-container" className="pl-2 border-l border-white/10 ml-2">
              {user ? (
                <Link href="/profile" className="flex items-center gap-2 text-white/60 hover:text-white font-medium text-sm transition-all duration-300">
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
              ) : (
                <button onClick={openLoginModal} className="text-white/60 hover:text-white font-medium text-sm transition-all duration-300 px-3 py-2 hover:bg-white/5 rounded-full">{t.nav.login}</button>
              )}
            </div>
          </div>
          <div className="md:hidden flex items-center gap-4">
            <button onClick={toggleLanguage} className="text-white/50 hover:text-white px-2 py-1 rounded-md text-xs font-bold border border-white/10 hover:bg-white/5 transition">
              {language === 'zh' ? 'EN' : '中'}
            </button>
            <button onClick={toggleMobileMenu} className="text-white/60 hover:text-white p-2"><i className="fa-solid fa-bars text-xl"></i></button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-40 md:hidden" onClick={toggleMobileMenu}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"></div>
          <div 
            className="absolute top-0 left-0 w-full bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/10 shadow-2xl animate-slide-down origin-top"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-2 pb-4 space-y-1">
              <Link href="/" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-home w-6 text-center text-white/50"></i> {t.nav.home}</Link>
              <Link href="/explore" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-lightbulb w-6 text-center text-white/50"></i> {t.nav.explore}</Link>
              <Link href="/create" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-wand-magic-sparkles w-6 text-center text-white/50"></i> {t.nav.create}</Link>
              <button onClick={() => { toggleMobileMenu(); openFeedbackModal(); }} className="block w-full text-left px-3 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-comment-dots w-6 text-center text-white/50"></i> {t.nav.feedback}</button>
              <Link href="/upload" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-cloud-arrow-up w-6 text-center text-white/50"></i> {t.nav.upload}</Link>
              <div className="border-t border-white/10 my-2 pt-2">
                {user ? (
                   <Link href="/profile" onClick={toggleMobileMenu} className="block px-3 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-user w-6 text-center text-white/50"></i> {t.nav.profile}</Link>
                ) : (
                   <button onClick={() => { toggleMobileMenu(); openLoginModal(); }} className="w-full text-left px-3 py-3 rounded-lg text-base font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all"><i className="fa-solid fa-user w-6 text-center text-white/50"></i> {t.nav.login_register}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
