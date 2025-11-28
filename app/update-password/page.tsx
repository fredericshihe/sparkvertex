'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const router = useRouter();
  const { success, error } = useToast();

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setVerifying(false);
      }
    });

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setVerifying(false);
      } else {
        // Give a grace period
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: finalSession } }) => {
            if (!finalSession) {
              setErrorMsg('链接已失效或未检测到登录状态，请重新发送重置邮件');
              setVerifying(false);
            } else {
              setVerifying(false);
            }
          });
        }, 3000);
      }
    });

    return () => subscription.unsubscribe();
  }, [router, error]);

  const handleUpdatePassword = async () => {
    if (password !== confirmPassword) {
      error('两次输入的密码不一致');
      return;
    }
    
    // Strong password validation
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      error('密码需至少8位，且包含字母和数字');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;

      success('密码修改成功，请重新登录');
      await supabase.auth.signOut();
      router.push('/');
    } catch (err: any) {
      error(err.message || '修改密码失败');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-white text-center max-w-md">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg mb-2">正在验证链接有效性...</p>
          <button 
            onClick={() => router.push('/')}
            className="mt-8 text-sm text-slate-400 hover:text-white underline"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-white text-center max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-circle-exclamation text-red-500 text-2xl"></i>
          </div>
          <p className="text-lg mb-2 text-red-400">{errorMsg}</p>
          <button 
            onClick={() => router.push('/')}
            className="mt-8 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">设置新密码</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">新密码</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
              placeholder="请输入新密码"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">确认新密码</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition"
              placeholder="请再次输入新密码"
            />
          </div>

          <button 
            onClick={handleUpdatePassword}
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? '提交中...' : '确认修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
