'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

export default function LoginModal() {
  const { t, language } = useLanguage();
  const { isLoginModalOpen, closeLoginModal } = useModal();
  
  // Views: 'login' (Email), 'phone' (Phone Login), 'register', 'forgot_password'
  const [view, setView] = useState<'login' | 'phone' | 'register' | 'forgot_password'>('login');
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [showEmailSent, setShowEmailSent] = useState(false);
  
  // SMS State
  const [countdown, setCountdown] = useState(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isLoginModalOpen) {
      setLoginAttempts(0);
      setLockoutUntil(null);
      setMessage('');
      setView('login');
      setShowEmailSent(false);
      setPhone('');
      setCode('');
      setCountdown(0);
    }
  }, [isLoginModalOpen]);

  // Countdown Timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  if (!isLoginModalOpen) return null;

  // --- Validation ---
  const validateEmail = (email: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  const validatePassword = (password: string) => /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@32941%*#?&]{8,}$/.test(password);
  const validatePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);

  // --- Handlers ---

  const handleSendCode = async () => {
    if (!validatePhone(phone)) {
      setMessage('请输入有效的手机号码');
      return;
    }
    
    setLoading(true);
    setMessage('');
    
    try {
      const res = await fetch('/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '发送失败');
      }
      
      setCountdown(60);
      setMessage('验证码已发送');
    } catch (error: any) {
      console.error('Send SMS Error:', error);
      setMessage(error.message || t.auth_modal.error_generic);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async () => {
    if (!validatePhone(phone)) {
      setMessage('请输入有效的手机号码');
      return;
    }
    if (!code || code.length !== 6) {
      setMessage('请输入6位验证码');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/auth/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '登录失败');
      }

      // Set Session
      const { error } = await supabase.auth.setSession(data.session);
      if (error) throw error;

      closeLoginModal();
    } catch (error: any) {
      console.error('Phone Login Error:', error);
      setMessage(error.message || t.auth_modal.error_login_failed);
    } finally {
      setLoading(false);
    }
  };

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
      setMessage(error.message?.includes('seconds') ? t.auth_modal.error_too_many_attempts : t.auth_modal.error_generic);
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
            data: {
              full_name: email.split('@')[0],
              username: email.split('@')[0],
              locale: language,
            },
          },
        });
        if (error) throw error;
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
      if (error.message?.includes('rate limit') || error.status === 429) {
         setMessage(t.auth_modal.error_rate_limit);
         return;
      }
      
      const isRegistrationError = type === 'register' && (error.message?.includes('already registered'));
      if (!isRegistrationError) {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        if (newAttempts >= 10) {
          setLockoutUntil(Date.now() + 60000);
          setMessage(t.auth_modal.error_too_many_attempts_min.replace('{n}', '1'));
          setLoading(false);
          return;
        }
      }

      if (isRegistrationError) setMessage(t.auth_modal.error_email_exists);
      else if (type === 'login') {
          if (error.message?.includes('Invalid login credentials')) setMessage(t.auth_modal.error_wrong_credentials);
          else if (error.message?.includes('Email not confirmed')) setMessage(t.auth_modal.error_email_not_confirmed);
          else setMessage(t.auth_modal.error_login_failed);
      } else setMessage(t.auth_modal.error_generic);
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
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm touch-none" onClick={closeLoginModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl animate-float-up overscroll-contain">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">
            {showEmailSent ? t.auth_modal.register_success : 
             view === 'register' ? t.auth_modal.create_account : 
             view === 'forgot_password' ? t.auth_modal.reset_password : 
             t.auth_modal.welcome_back}
          </h2>
          <button onClick={closeLoginModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        {showEmailSent ? renderEmailSent() : view === 'forgot_password' ? (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm mb-4">{t.auth_modal.reset_desc}</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder={t.auth_modal.email_placeholder} />
            {message && <p className="text-sm text-center py-2 rounded border text-red-400 bg-red-500/10 border-red-500/20">{message}</p>}
            <button onClick={handleResetPassword} disabled={loading} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition disabled:opacity-50">{loading ? t.auth_modal.sending : t.auth_modal.send_reset}</button>
            <button onClick={() => { setView('login'); setMessage(''); }} className="w-full text-slate-400 hover:text-white text-sm py-2 transition">{t.auth_modal.back_login}</button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tabs */}
            {view !== 'register' && (
              <div className="flex border-b border-slate-700 mb-4">
                <button 
                  onClick={() => { setView('login'); setMessage(''); }}
                  className={`flex-1 pb-2 text-sm font-bold transition ${view === 'login' ? 'text-brand-400 border-b-2 border-brand-400' : 'text-slate-400 hover:text-white'}`}
                >
                  {t.auth_modal.email_label}
                </button>
                <button 
                  onClick={() => { setView('phone'); setMessage(''); }}
                  className={`flex-1 pb-2 text-sm font-bold transition ${view === 'phone' ? 'text-brand-400 border-b-2 border-brand-400' : 'text-slate-400 hover:text-white'}`}
                >
                  手机登录
                </button>
              </div>
            )}

            {view === 'phone' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">手机号码</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder="请输入手机号" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">验证码</label>
                  <div className="flex gap-2">
                    <input type="text" value={code} onChange={(e) => setCode(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder="6位验证码" maxLength={6} />
                    <button 
                      onClick={handleSendCode}
                      disabled={loading || countdown > 0 || !validatePhone(phone)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
                    >
                      {countdown > 0 ? `${countdown}s` : '获取验证码'}
                    </button>
                  </div>
                </div>
                {message && <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded border border-red-500/20">{message}</p>}
                <button onClick={handlePhoneLogin} disabled={loading} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50">{loading ? '登录中...' : '登录 / 注册'}</button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">{t.auth_modal.email_label}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder={t.auth_modal.email_placeholder} />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-400">{t.auth_modal.password_label}</label>
                    {view === 'login' && <button onClick={() => { setView('forgot_password'); setMessage(''); }} className="text-xs text-brand-500 hover:text-brand-400 transition">{t.auth_modal.forgot_password}</button>}
                  </div>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" placeholder={view === 'register' ? t.auth_modal.password_hint : t.auth_modal.password_placeholder} />
                </div>
                {message && <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded border border-red-500/20">{message}</p>}
                <button onClick={() => handleEmailAuth(view === 'register' ? 'register' : 'login')} disabled={loading} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50">{loading ? (view === 'register' ? t.auth_modal.registering : t.auth_modal.logging_in) : (view === 'register' ? t.auth_modal.register_btn : t.auth_modal.login_btn)}</button>
              </>
            )}
            
            <div className="text-center mt-4">
              <span className="text-slate-500 text-sm">{view === 'register' ? t.auth_modal.has_account : t.auth_modal.no_account}</span>
              <button 
                onClick={() => { setView(view === 'register' ? 'login' : 'register'); setMessage(''); }}
                className="text-brand-400 hover:text-brand-300 text-sm font-bold ml-2 transition"
              >
                {view === 'register' ? t.auth_modal.go_login : t.auth_modal.go_register}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
