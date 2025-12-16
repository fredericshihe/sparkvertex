import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AuthCallback');

// 允许重定向的路径白名单
const ALLOWED_REDIRECT_PATHS = ['/', '/profile', '/create', '/explore', '/upload', '/guide'];

function isValidRedirectPath(path: string): boolean {
  // 只允许相对路径，且必须以 / 开头
  if (!path.startsWith('/')) return false;
  // 不允许协议相关路径 (//example.com)
  if (path.startsWith('//')) return false;
  // 不允许包含 @ 符号 (user@host)
  if (path.includes('@')) return false;
  // 检查是否是允许的路径或其子路径
  return ALLOWED_REDIRECT_PATHS.some(allowed => 
    path === allowed || path.startsWith(allowed + '/')
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const token = requestUrl.searchParams.get('token');
  const type = requestUrl.searchParams.get('type');
  const next = requestUrl.searchParams.get('next') || '/';

  // 验证重定向路径，防止 Open Redirect 攻击
  const safeRedirect = isValidRedirectPath(next) ? next : '/';

  const cookieStore = cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  );

  // 处理 Magic Link token (手机登录)
  if (token && type) {
    logger.debug('Verifying magic link token...');
    
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: type as 'magiclink' | 'email',
    });
    
    if (error) {
      logger.error('Failed to verify token:', error.message);
      return NextResponse.redirect(new URL(`/?error=auth_failed&details=${encodeURIComponent(error.message)}`, request.url));
    }
    
    logger.debug('Token verified successfully');
    return NextResponse.redirect(new URL(safeRedirect, request.url));
  }

  // 处理 OAuth code (邮箱/社交登录)
  if (code) {
    logger.debug('Exchanging code for session...');

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logger.error('Failed to exchange code:', error.message);
      
      // Check for specific PKCE error
      if (error.message.includes('code verifier')) {
        return NextResponse.redirect(new URL(`/?error=verifier_missing&details=${encodeURIComponent('请在同一个浏览器中打开链接')}`, request.url));
      }

      return NextResponse.redirect(new URL(`/?error=auth_failed&details=${encodeURIComponent(error.message)}`, request.url));
    }
    logger.debug('Session exchanged successfully');
  }

  logger.debug('Redirecting to:', safeRedirect);
  return NextResponse.redirect(new URL(safeRedirect, request.url));
}
