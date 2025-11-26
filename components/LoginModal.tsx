'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal } = useModal();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!isLoginModalOpen) return null;

  const handleAuth = async (type: 'login' | 'register') => {
    setLoading(true);
    setMessage('');
    
    try {
      if (type === 'register') {
        const { error } = await supabase.auth.signUp({
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
        setMessage('注册成功！请检查邮箱验证链接。');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        closeLoginModal();
      }
    } catch (error: any) {
      setMessage(error.message || '发生错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeLoginModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 p-8 shadow-2xl">
        <h2 className="text-2xl font-bold mb-6 text-center text-white">登录 / 注册</h2>
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
            <label className="block text-sm font-medium text-slate-400 mb-1">密码</label>
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
      </div>
    </div>
  );
}
