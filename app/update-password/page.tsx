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
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setVerifying(false);
        setErrorMsg('');
      }
    });

    const initSession = async () => {
      // 1. Try to manually parse hash if present (Fix for cross-device implicit flow)
      // This is crucial when the automatic detection fails or is slow
      if (typeof window !== 'undefined' && window.location.hash && window.location.hash.includes('access_token')) {
        try {
          const hash = window.location.hash.substring(1); // remove #
          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          
          if (access_token) {
            console.log('Manual hash parsing: Found access token');
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || '',
            });
            
            if (!error && data.session) {
              console.log('Manual hash parsing: Session set successfully');
              setVerifying(false);
              return;
            }
          }
        } catch (e) {
          console.error('Error parsing hash:', e);
        }
      }

      // 2. Fallback to standard check
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setVerifying(false);
      } else {
        // Wait a bit just in case
        setTimeout(async () => {
           const { data: { session: finalSession } } = await supabase.auth.getSession();
           if (finalSession) {
             setVerifying(false);
           } else {
             setErrorMsg('链接已失效或未检测到登录状态，请重新发送重置邮件');
             setVerifying(false);
           }
        }, 3000);
      }
    };

    initSession();

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
      setSuccessMsg('密码修改成功！正在跳转回首页...');
      
      await supabase.auth.signOut();
      
      // Delay redirect to let user see the success message
      setTimeout(() => {
        router.push('/');
      }, 2000);
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

  if (successMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-white text-center max-w-md">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-check text-green-500 text-2xl"></i>
          </div>
          <p className="text-lg mb-2 text-green-400">{successMsg}</p>
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
