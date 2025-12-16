import { createClient } from '@supabase/supabase-js';

// 彻底解决构建时环境变量缺失的问题
// 如果环境变量不存在，使用占位符，保证 createClient 不报错
// 运行时（Runtime）环境变量肯定存在，所以不会影响实际功能
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

export const createSafeClient = () => {
  // Use bracket notation to reduce the chance of build-time inlining.
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || PLACEHOLDER_URL;
  const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || PLACEHOLDER_KEY;

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
};

export const createSafeAnonClient = () => {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || PLACEHOLDER_URL;
  const supabaseKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || PLACEHOLDER_KEY;
  
  return createClient(supabaseUrl, supabaseKey);
};
