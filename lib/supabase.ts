import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // 自动刷新 token，防止会话过期
      autoRefreshToken: true,
      // 持久化会话到 localStorage
      persistSession: true,
      // 检测会话变化
      detectSessionInUrl: true,
      // 在可见性变化时刷新会话（防止长时间停留导致 token 过期）
      storageKey: 'supabase.auth.token',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      // 设置较短的刷新间隔，确保 token 在过期前刷新
      flowType: 'pkce',
    },
    realtime: {
      timeout: 20000,
      headers: {
        'Connection': 'keep-alive'
      }
    }
  }
);
