'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

export default function LoginModal() {
  const { t, language } = useLanguage();
  const { isLoginModalOpen, closeLoginModal } = useModal();
  const [view, setView] = useState<'login' | 'register' | 'forgot_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [showEmailSent, setShowEmailSent] = useState(false);

  // Reset state when modal opens to prevent stale lockout state
  useEffect(() => {
    if (isLoginModalOpen) {
      // Optional: Don't reset lockout if it's still valid? 
      // For better UX, we reset it because client-side limits are easily bypassed anyway (refresh).
      // This fixes the issue where a user gets locked out, closes modal, comes back later and is still locked out.
      setLoginAttempts(0);
      setLockoutUntil(null);
      setMessage('');
      setView('login');
      setShowEmailSent(false);
    }
  }, [isLoginModalOpen]);

  if (!isLoginModalOpen) return null;

  // Security: Input Validation
  const validateEmail = (email: string) => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email);
  };

  const validatePassword = (password: string) => {
    // Min 8 chars, at least one letter and one number
    const re = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    return re.test(password);
  };

  const handleResetPassword = async () => {
    if (!validateEmail(email)) {
      setMessage(t.auth_modal.error_invalid_email);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      // Use a separate client with implicit flow for password reset to support cross-device scenarios
      // (e.g. request on desktop, open link on mobile)
      const authClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            flowType: 'implicit',
          },
        }
      );

      // Direct redirect to the update password page, skipping the server-side callback
      // This allows the client-side library to handle the session from the URL hash
      // We append the language param so the landing page knows which language to display
      const redirectUrl = `${window.location.origin}/update-password?lang=${language}`;
      
      console.log('Sending password reset (implicit) with redirect to:', redirectUrl);

      const { error } = await authClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
      setMessage(t.auth_modal.success_reset_sent);
    } catch (error: any) {
      console.error('Reset password error:', error.message);
      if (error.message?.includes('security purposes') && error.message?.includes('seconds')) {
        const seconds = error.message.match(/after (\d+) seconds/)?.[1] || '60';
        setMessage(t.auth_modal.error_too_many_attempts.replace('{n}', seconds));
      } else {
        setMessage(t.auth_modal.error_generic);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (type: 'login' | 'register') => {
    // Security: Rate Limiting Check
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setMessage(t.auth_modal.error_too_many_attempts.replace('{n}', remaining.toString()));
      return;
    }

    if (!validateEmail(email)) {
      setMessage(t.auth_modal.error_invalid_email);
      return;
    }

    if (!validatePassword(password)) {
      setMessage(t.auth_modal.error_invalid_password);
      return;
    }

    setLoading(true);
    setMessage('');
    
    try {
      if (type === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0],
              username: email.split('@')[0],
              locale: language, // Store user's preferred language
            },
          },
        });
        if (error) throw error;

        // Check if user already exists (Supabase might return success with empty identities for existing users)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setMessage(t.auth_modal.error_email_exists);
        } else {
          setShowEmailSent(true);
          setMessage('');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Reset attempts on success
        setLoginAttempts(0);
        setLockoutUntil(null);
        closeLoginModal();
      }
    } catch (error: any) {
      console.error('Auth error full object:', error);
      console.error('Auth error message:', error.message);

      // Handle Rate Limit specifically
      if (error.message?.includes('rate limit') || error.status === 429) {
         // Try to extract wait time from error message
         const waitSeconds = error.message.match(/(\d+)\s*seconds?/)?.[1];
         const waitMinutes = error.message.match(/(\d+)\s*minutes?/)?.[1];
         
         // 如果是用户打开窗口后的第一次尝试就遇到限流，说明是 IP 问题或历史遗留问题
         const isFirstAttempt = loginAttempts === 0;

         if (waitSeconds) {
             setMessage(t.auth_modal.error_too_many_attempts.replace('{n}', waitSeconds));
         } else if (waitMinutes) {
             setMessage(t.auth_modal.error_too_many_attempts_min.replace('{n}', waitMinutes));
         } else {
             // Generic 429
             if (isFirstAttempt) {
                 setMessage(t.auth_modal.error_ip_limit);
             } else {
                 setMessage(t.auth_modal.error_rate_limit);
             }
         }
         setLoading(false);
         return;
      }
      
      // Check for specific errors that shouldn't count towards lockout
      const isRegistrationError = type === 'register' && (error.message?.includes('already registered') || error.message?.includes('User already registered'));
      
      if (!isRegistrationError) {
        // Security: Rate Limiting Increment
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        
        if (newAttempts >= 10) { // Increased limit to 10
          setLockoutUntil(Date.now() + 60000); // 1 minute lockout
          setMessage(t.auth_modal.error_too_many_attempts_min.replace('{n}', '1'));
          setLoading(false);
          return;
        }
      }

      // Security: Generic Error Messages
      if (isRegistrationError) {
          setMessage(t.auth_modal.error_email_exists);
      } else if (type === 'login') {
          if (error.message?.includes('Invalid login credentials')) {
             setMessage(t.auth_modal.error_wrong_credentials);
          } else if (error.message?.includes('Email not confirmed')) {
             setMessage(t.auth_modal.error_email_not_confirmed);
          } else {
             setMessage(t.auth_modal.error_login_failed);
          }
      } else {
          setMessage(t.auth_modal.error_generic);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderEmailSent = () => (
    <div className="text-center space-y-6 py-4">
      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto animate-bounce">
        <i className="fa-solid fa-envelope-circle-check text-4xl text-green-500"></i>
      </div>
      <div>
        <h3 className="text-xl font-bold text-white mb-2">{t.auth_modal.email_sent_title}</h3>
        <p className="text-slate-400 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t.auth_modal.email_sent_desc.replace('{email}', email) }}>
        </p>
      </div>
      <div className="bg-slate-800/50 rounded-lg p-4 text-xs text-slate-500 text-left">
        <p className="mb-2 font-bold"><i className="fa-solid fa-circle-info mr-1"></i> {t.auth_modal.email_not_received}</p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>{t.auth_modal.check_spam}</li>
          <li>{t.auth_modal.wait_retry}</li>
          <li>{t.auth_modal.check_email}</li>
        </ul>
      </div>
      <button 
        onClick={() => {
          setShowEmailSent(false);
          setView('login');
          setMessage('');
        }}
        className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg transition border border-slate-700"
      >
        {t.auth_modal.back_login}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm touch-none" onClick={closeLoginModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl animate-float-up overscroll-contain">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">
            {showEmailSent ? t.auth_modal.register_success : 
             view === 'login' ? t.auth_modal.welcome_back : 
             view === 'register' ? t.auth_modal.create_account : t.auth_modal.reset_password}
          </h2>
          <button onClick={closeLoginModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        {showEmailSent ? renderEmailSent() : view === 'login' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.auth_modal.email_label}</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder={t.auth_modal.email_placeholder}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-400">{t.auth_modal.password_label}</label>
                <button 
                  onClick={() => {
                    setView('forgot_password');
                    setMessage('');
                  }}
                  className="text-xs text-brand-500 hover:text-brand-400 transition"
                >
                  {t.auth_modal.forgot_password}
                </button>
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder={t.auth_modal.password_placeholder}
              />
            </div>
            
            {message && <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded border border-red-500/20">{message}</p>}

            <button 
              onClick={() => handleAuth('login')}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.auth_modal.logging_in : t.auth_modal.login_btn}
            </button>
            
            <div className="text-center mt-4">
              <span className="text-slate-500 text-sm">{t.auth_modal.no_account}</span>
              <button 
                onClick={() => {
                  setView('register');
                  setMessage('');
                }}
                className="text-brand-400 hover:text-brand-300 text-sm font-bold ml-2 transition"
              >
                {t.auth_modal.go_register}
              </button>
            </div>
          </div>
        ) : view === 'register' ? (
          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-400 flex items-start gap-2">
                <i className="fa-solid fa-circle-info mt-0.5"></i>
                <span>{t.auth_modal.register_terms}</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.auth_modal.email_label}</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder={t.auth_modal.email_placeholder}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.auth_modal.password_label}</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder={t.auth_modal.password_hint}
              />
            </div>
            
            {message && <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded border border-red-500/20">{message}</p>}

            <button 
              onClick={() => handleAuth('register')}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.auth_modal.registering : t.auth_modal.register_btn}
            </button>
            
            <div className="text-center mt-4">
              <span className="text-slate-500 text-sm">{t.auth_modal.has_account}</span>
              <button 
                onClick={() => {
                  setView('login');
                  setMessage('');
                }}
                className="text-brand-400 hover:text-brand-300 text-sm font-bold ml-2 transition"
              >
                {t.auth_modal.go_login}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm mb-4">
              {t.auth_modal.reset_desc}
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t.auth_modal.email_label}</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder={t.auth_modal.email_placeholder}
              />
            </div>

            {message && (
              <p className={`text-sm text-center py-2 rounded border ${message.includes('已发送') ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                {message}
              </p>
            )}

            <button 
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.auth_modal.sending : t.auth_modal.send_reset}
            </button>

            <button 
              onClick={() => {
                setView('login');
                setMessage('');
              }}
              className="w-full text-slate-400 hover:text-white text-sm py-2 transition"
            >
              {t.auth_modal.back_login}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
