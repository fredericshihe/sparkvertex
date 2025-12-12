import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
  {
    auth: {
      // 自动刷新 token，防止会话过期
      autoRefreshToken: true,
      // 持久化会话
      persistSession: true,
      // 检测会话变化
      detectSessionInUrl: true,
      // 使用 PKCE 流程
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
