'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useModal } from '@/context/ModalContext';

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal } = useModal();
  const [view, setView] = useState<'login' | 'forgot_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

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
      setMessage('请输入有效的邮箱地址');
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
      const redirectUrl = `${window.location.origin}/update-password`;
      
      console.log('Sending password reset (implicit) with redirect to:', redirectUrl);

      const { error } = await authClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
      setMessage('重置密码邮件已发送，请检查您的邮箱');
    } catch (error: any) {
      console.error('Reset password error:', error.message);
      if (error.message?.includes('security purposes') && error.message?.includes('seconds')) {
        const seconds = error.message.match(/after (\d+) seconds/)?.[1] || '60';
        setMessage(`操作过于频繁，请 ${seconds} 秒后再试`);
      } else {
        setMessage('发送请求失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (type: 'login' | 'register') => {
    // Security: Rate Limiting Check
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setMessage(`尝试次数过多，请 ${remaining} 秒后再试`);
      return;
    }

    if (!validateEmail(email)) {
      setMessage('请输入有效的邮箱地址');
      return;
    }

    if (!validatePassword(password)) {
      setMessage('密码需至少8位，且包含字母和数字');
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
            },
          },
        });
        if (error) throw error;

        // Check if user already exists (Supabase might return success with empty identities for existing users)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setMessage('该邮箱已被注册，请直接登录');
        } else {
          setMessage('注册确认邮件已发送！\n如未收到，请检查垃圾箱或尝试直接登录。');
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
      console.error('Auth error:', error.message);
      
      // Check for specific errors that shouldn't count towards lockout
      const isRegistrationError = type === 'register' && (error.message?.includes('already registered') || error.message?.includes('User already registered'));
      
      if (!isRegistrationError) {
        // Security: Rate Limiting Increment
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        
        if (newAttempts >= 10) { // Increased limit to 10
          setLockoutUntil(Date.now() + 60000); // 1 minute lockout
          setMessage('尝试次数过多，请 1 分钟后再试');
          setLoading(false);
          return;
        }
      }

      // Security: Generic Error Messages
      if (isRegistrationError) {
          setMessage('该邮箱已被注册，请直接登录');
      } else if (type === 'login') {
          setMessage('邮箱或密码错误');
      } else {
          setMessage('操作失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm touch-none" onClick={closeLoginModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl animate-float-up overscroll-contain">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">
            {view === 'login' ? '登录 / 注册' : '重置密码'}
          </h2>
          <button onClick={closeLoginModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        {view === 'login' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">邮箱</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-400">密码</label>
                <button 
                  onClick={() => {
                    setView('forgot_password');
                    setMessage('');
                  }}
                  className="text-xs text-brand-500 hover:text-brand-400 transition"
                >
                  忘记密码？
                </button>
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
              />
            </div>
            
            {message && <p className="text-red-400 text-sm text-center">{message}</p>}

            <button 
              onClick={() => handleAuth('login')}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '处理中...' : '登录'}
            </button>
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-900 text-slate-500">或者</span>
              </div>
            </div>

            <button 
              onClick={() => handleAuth('register')}
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg transition border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              注册新账号
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm mb-4">
              请输入您的注册邮箱，我们将向您发送重置密码的链接。
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">邮箱</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
                placeholder="your@email.com"
              />
            </div>

            {message && (
              <p className={`text-sm text-center ${message.includes('已发送') ? 'text-green-400' : 'text-red-400'}`}>
                {message}
              </p>
            )}

            <button 
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '发送中...' : '发送重置链接'}
            </button>

            <button 
              onClick={() => {
                setView('login');
                setMessage('');
              }}
              className="w-full text-slate-400 hover:text-white text-sm py-2 transition"
            >
              返回登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
