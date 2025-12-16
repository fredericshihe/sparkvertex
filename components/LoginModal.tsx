'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';

export default function LoginModal() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { isLoginModalOpen, closeLoginModal } = useModal();
  const { success: showSuccess, error: showError } = useToast();
  
  // Views: 'login' (Email), 'register', 'forgot_password', 'phone'
  const [view, setView] = useState<'login' | 'register' | 'forgot_password' | 'phone'>('phone');
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Phone Auth State
  const [phone, setPhone] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [showEmailSent, setShowEmailSent] = useState(false);
  
  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);
  
  // Reset state when modal opens
  useEffect(() => {
    if (isLoginModalOpen) {
      setLoginAttempts(0);
      setLockoutUntil(null);
      setMessage('');
      setView('phone'); // Default to phone login
      setShowEmailSent(false);
      setCodeSent(false);
      setVerifyCode('');
      setCountdown(0);
    }
  }, [isLoginModalOpen]);

  if (!isLoginModalOpen) return null;

  // --- Validation ---
  const validateEmail = (email: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  const validatePassword = (password: string) => /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@32941%*#?&]{8,}$/.test(password);
  const validatePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone.replace(/\s/g, ''));

  // --- Phone Auth Handlers ---
  const handleSendCode = async () => {
    const normalizedPhone = phone.replace(/\s/g, '');
    if (!validatePhone(normalizedPhone)) {
      setMessage(language === 'zh' ? '请输入有效的手机号码' : 'Please enter a valid phone number');
      return;
    }
    
    setLoading(true);
    setMessage('');
    
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setCodeSent(true);
        setCountdown(60);
        setMessage(language === 'zh' ? '验证码已发送' : 'Code sent');
      } else {
        setMessage(data.message || (language === 'zh' ? '发送失败' : 'Failed to send'));
      }
    } catch (error) {
      setMessage(language === 'zh' ? '网络错误，请重试' : 'Network error, please retry');
    } finally {
      setLoading(false);
    }
  };
  
  const handlePhoneLogin = async () => {
    if (!verifyCode || verifyCode.length < 4) {
      setMessage(language === 'zh' ? '请输入验证码' : 'Please enter the code');
      return;
    }
    
    setLoading(true);
    setMessage('');
    
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/\s/g, ''), code: verifyCode }),
      });
      
      const data = await res.json();
      
      if (data.success && data.redirectUrl) {
        showSuccess(language === 'zh' ? '登录成功' : 'Login successful');
        closeLoginModal();
        // 重定向到 auth/callback 完成登录
        router.push(data.redirectUrl);
      } else {
        setMessage(data.message || (language === 'zh' ? '验证失败' : 'Verification failed'));
      }
    } catch (error) {
      setMessage(language === 'zh' ? '网络错误，请重试' : 'Network error, please retry');
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---

  const handleResetPassword = async () => {
    if (!validateEmail(email)) {
      setMessage(t.auth_modal.error_invalid_email);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const authClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { flowType: 'implicit' } }
      );
      const redirectUrl = `${window.location.origin}/update-password?lang=${language}`;
      const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
      if (error) throw error;
      setMessage(t.auth_modal.success_reset_sent);
    } catch (error: any) {
      console.error('Reset password error:', error);
      if (error.message?.includes('fetch failed') || error.message?.includes('Failed to fetch')) {
        setMessage(t.auth_modal.error_network);
      } else if (error.message?.includes('seconds') || error.status === 429) {
        setMessage(t.auth_modal.error_too_many_attempts);
      } else {
        setMessage(t.auth_modal.error_generic);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (type: 'login' | 'register') => {
    if (lockoutUntil && Date.now() < lockoutUntil) {
      setMessage(t.auth_modal.error_too_many_attempts_min.replace('{n}', '1'));
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
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: email.split('@')[0],
              username: email.split('@')[0],
              locale: language,
            },
          },
        });
        
        if (error) throw error;

        // Check if auto-login happened (e.g. autoConfirm is on)
        if (data.session) {
          showSuccess(t.auth_modal.register_success);
          closeLoginModal();
          return;
        }

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setMessage(t.auth_modal.error_email_exists);
        } else {
          setShowEmailSent(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setLoginAttempts(0);
        closeLoginModal();
      }
    } catch (error: any) {
      console.error('Auth error:', error);

      // 1. Rate Limit Errors
      if (error.message?.includes('rate limit') || error.status === 429) {
         setMessage(t.auth_modal.error_rate_limit);
         return;
      }

      // 2. Network Errors
      if (error.message?.includes('fetch failed') || error.message?.includes('Failed to fetch') || error.message?.includes('Network request failed')) {
        setMessage(t.auth_modal.error_network);
        return;
      }
      
      // 3. Registration Specific Errors
      if (type === 'register') {
        if (error.message?.includes('already registered') || error.message?.includes('User already registered')) {
          setMessage(t.auth_modal.error_email_exists);
          return;
        }
        if (error.message?.includes('Password should be at least') || error.message?.includes('weak_password')) {
          setMessage(t.auth_modal.error_invalid_password);
          return;
        }
        if (error.message?.includes('Unable to validate email address: invalid format')) {
          setMessage(t.auth_modal.error_invalid_email);
          return;
        }
      }

      // 4. Login Specific Errors
      if (type === 'login') {
        if (error.message?.includes('Invalid login credentials')) {
          setMessage(t.auth_modal.error_wrong_credentials);
        } else if (error.message?.includes('Email not confirmed')) {
          setMessage(t.auth_modal.error_email_not_confirmed);
        } else {
          setMessage(t.auth_modal.error_login_failed);
        }
      } else {
        // 5. Fallback for other errors (including unknown registration errors)
        // If we have a specific error message from Supabase that is readable, we might want to show it, 
        // but for now let's stick to safe generic messages or the raw message if it seems safe.
        // Actually, for better UX, let's try to map common ones or show generic.
        setMessage(error.message || t.auth_modal.error_generic);
      }

      // 6. Login Attempt Counting (only for non-registration errors that are not rate limits)
      if (type === 'login') {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        if (newAttempts >= 10) {
          setLockoutUntil(Date.now() + 60000);
          setMessage(t.auth_modal.error_too_many_attempts_min.replace('{n}', '1'));
        }
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
        <p className="text-slate-400 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t.auth_modal.email_sent_desc.replace('{email}', email) }}></p>
      </div>
      <button onClick={() => { setShowEmailSent(false); setView('login'); setMessage(''); }} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg transition border border-slate-700">
        {t.auth_modal.back_login}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm touch-none" onClick={closeLoginModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in zoom-in fade-in duration-300 ring-1 ring-white/5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">
            {showEmailSent ? t.auth_modal.register_success : 
             view === 'register' ? t.auth_modal.create_account : 
             view === 'forgot_password' ? t.auth_modal.reset_password : 
             t.auth_modal.welcome_back}
          </h2>
          <button onClick={closeLoginModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        {showEmailSent ? renderEmailSent() : view === 'forgot_password' ? (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm mb-4">{t.auth_modal.reset_desc}</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 focus:bg-black/40 outline-none transition-all placeholder-slate-500" placeholder={t.auth_modal.email_placeholder} />
            {message && <p className="text-sm text-center py-2 rounded border text-red-400 bg-red-500/10 border-red-500/20">{message}</p>}
            <button onClick={handleResetPassword} disabled={loading} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 shadow-lg shadow-brand-500/20">{loading ? t.auth_modal.sending : t.auth_modal.send_reset}</button>
            <button onClick={() => { setView('login'); setMessage(''); }} className="w-full text-slate-400 hover:text-white text-sm py-2 transition">{t.auth_modal.back_login}</button>
          </div>
        ) : view === 'phone' ? (
          <div className="space-y-4">
            {/* Phone Input */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1 ml-1">
                {language === 'zh' ? '手机号' : 'Phone Number'}
              </label>
              <div className="flex gap-2">
                <div className="flex items-center bg-black/20 border border-white/10 rounded-xl px-3 text-slate-400 text-sm">
                  +86
                </div>
                <input 
                  type="tel" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 focus:bg-black/40 outline-none transition-all placeholder-slate-500" 
                  placeholder={language === 'zh' ? '请输入手机号' : 'Enter phone number'}
                />
              </div>
            </div>
            
            {/* Verification Code */}
            {codeSent && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1 ml-1">
                  {language === 'zh' ? '验证码' : 'Verification Code'}
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={verifyCode} 
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-center tracking-[0.5em] text-lg font-mono focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 focus:bg-black/40 outline-none transition-all placeholder-slate-500" 
                    placeholder="000000"
                    maxLength={6}
                  />
                  <button 
                    onClick={handleSendCode}
                    disabled={loading || countdown > 0}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-white text-sm font-medium rounded-xl transition border border-white/10 disabled:text-slate-500 whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}s` : (language === 'zh' ? '重新发送' : 'Resend')}
                  </button>
                </div>
              </div>
            )}
            
            {/* Message */}
            {message && (
              <p className={`text-sm text-center py-2 rounded-lg border ${
                message.includes('已发送') || message.includes('sent') 
                  ? 'text-green-400 bg-green-500/10 border-green-500/20' 
                  : 'text-red-400 bg-red-500/10 border-red-500/20'
              }`}>
                {message}
              </p>
            )}
            
            {/* Action Button */}
            {!codeSent ? (
              <button 
                onClick={handleSendCode}
                disabled={loading || !phone || phone.length < 11}
                className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-brand-500/20 disabled:opacity-50"
              >
                {loading ? (language === 'zh' ? '发送中...' : 'Sending...') : (language === 'zh' ? '获取验证码' : 'Get Code')}
              </button>
            ) : (
              <button 
                onClick={handlePhoneLogin}
                disabled={loading || verifyCode.length < 4}
                className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-brand-500/20 disabled:opacity-50"
              >
                {loading ? (language === 'zh' ? '验证中...' : 'Verifying...') : (language === 'zh' ? '登录 / 注册' : 'Login / Register')}
              </button>
            )}
            
            {/* Switch to Email */}
            <div className="text-center pt-4 border-t border-white/5">
              <button 
                onClick={() => { setView('login'); setMessage(''); }}
                className="text-slate-400 hover:text-white text-sm transition flex items-center justify-center gap-2 mx-auto"
              >
                <i className="fa-solid fa-envelope text-xs"></i>
                {language === 'zh' ? '使用邮箱登录' : 'Login with Email'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1 ml-1">{t.auth_modal.email_label}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 focus:bg-black/40 outline-none transition-all placeholder-slate-500" placeholder={t.auth_modal.email_placeholder} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1 ml-1">
                  <label className="block text-sm font-medium text-slate-400">{t.auth_modal.password_label}</label>
                  {view === 'login' && <button onClick={() => { setView('forgot_password'); setMessage(''); }} className="text-xs text-brand-400 hover:text-brand-300 transition">{t.auth_modal.forgot_password}</button>}
                </div>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 focus:bg-black/40 outline-none transition-all placeholder-slate-500" placeholder={view === 'register' ? t.auth_modal.password_hint : t.auth_modal.password_placeholder} />
              </div>
              {message && <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">{message}</p>}
              <button onClick={() => handleEmailAuth(view === 'register' ? 'register' : 'login')} disabled={loading} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-brand-500/20 disabled:opacity-50">{loading ? (view === 'register' ? t.auth_modal.registering : t.auth_modal.logging_in) : (view === 'register' ? t.auth_modal.register_btn : t.auth_modal.login_btn)}</button>
            </>
            
            <div className="text-center mt-4 pt-4 border-t border-white/5 space-y-2">
              <button 
                onClick={() => { setView('phone'); setMessage(''); }}
                className="text-slate-400 hover:text-white text-sm transition flex items-center justify-center gap-2 mx-auto"
              >
                <i className="fa-solid fa-mobile-screen text-xs"></i>
                {language === 'zh' ? '使用手机号登录' : 'Login with Phone'}
              </button>
              <div>
                <span className="text-slate-500 text-sm">{view === 'register' ? t.auth_modal.has_account : t.auth_modal.no_account}</span>
                <button 
                  onClick={() => { setView(view === 'register' ? 'login' : 'register'); setMessage(''); }}
                  className="text-brand-400 hover:text-brand-300 text-sm font-bold ml-2 transition"
                >
                  {view === 'register' ? t.auth_modal.go_login : t.auth_modal.go_register}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
