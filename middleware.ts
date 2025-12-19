import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 简单的内存限流 (Simple In-Memory Rate Limiting)
// 注意：在 Serverless 环境或多实例部署中，内存限流是独立的，不是全局共享的。
// 对于单台轻量服务器，这足够有效。
const rateLimitMap = new Map();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1分钟
const MAX_REQUESTS_PER_WINDOW = 100; // 每分钟 100 次请求 (根据实际情况调整)

function checkRateLimit(ip: string) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  const requestLog = rateLimitMap.get(ip) || [];
  // 过滤掉过期的请求记录
  const recentRequests = requestLog.filter((timestamp: number) => timestamp > windowStart);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // 超限
  }
  
  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  
  // 定期清理内存 (防止 Map 无限增长)
  if (rateLimitMap.size > 10000) {
    rateLimitMap.clear();
  }
  
  return true; // 通过
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  // 0. 安全鉴权 (Security Auth) - 防止源站 IP 泄露被直接攻击
  // 配合阿里云 CDN 的 "回源 HTTP 请求头" 功能使用
  // 在 CDN 控制台设置: X-Source-Auth = [你的密钥]
  
  // 从环境变量获取密钥，如果未设置则记录警告（生产环境必须设置）
  const CDN_SECRET = process.env.CDN_SOURCE_SECRET;
  if (!CDN_SECRET && !isVercel) {
     console.warn('WARN: CDN_SOURCE_SECRET is not set in environment variables!');
  }
  
  const requestSecret = request.headers.get('x-source-auth');
  
  // 检查是否在 Vercel 环境 (Vercel 不需要此鉴权)
  const isVercel = !!process.env.VERCEL;
  
  // 检查是否在本地开发环境
  const isLocalDev = process.env.NODE_ENV === 'development' || 
                     request.headers.get('host')?.includes('localhost') ||
                     request.headers.get('host')?.startsWith('127.0.0.1') ||
                     request.headers.get('host')?.startsWith('192.168.');

  // 安全检查：只对非静态资源路径进行鉴权
  // 在非 Vercel 环境且非本地开发环境 (即阿里云服务器) 强制启用
  if (!isVercel && !isLocalDev && !pathname.startsWith('/_next/') && !pathname.startsWith('/static/')) {
      if (requestSecret !== CDN_SECRET) {
          // 如果请求没有带正确的密钥，说明不是来自 CDN，而是直接攻击源站 IP
          return new NextResponse('Forbidden: Direct Access Not Allowed', { status: 403 });
      }
  }

  // 1. 安全限流 (Rate Limiting) - 仅针对 API 和 动态页面
  // 静态资源已在下方排除，这里主要保护计算密集型接口
  if (!pathname.startsWith('/_next/') && !pathname.startsWith('/static/')) {
      if (!checkRateLimit(ip)) {
          return new NextResponse('Too Many Requests', { status: 429 });
      }
  }

  // 静态资源与 PWA 文件不需要 Supabase Session 刷新，避免增加首屏 TTFB

  // 静态资源与 PWA 文件不需要 Supabase Session 刷新，避免增加首屏 TTFB
  // 注意：matcher 已尽量排除，但这里再做一次兜底判断
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/fontawesome/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/workbox-') ||
    /\.(?:css|js|map|json|txt|xml|ico|svg|png|jpg|jpeg|gif|webp|avif|woff2?|ttf|otf|eot)$/.test(pathname)
  ) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // 只有存在 Supabase 相关 Cookie 时才请求 getUser；
  // 否则会为匿名访问/首屏增加一次网络往返，显著拖慢 TTFB。
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') || name.startsWith('supabase'))

  // 定义需要服务端验证的受保护路径
  // 首页 (/) 和探索页 (/explore) 等公开页面不需要服务端阻塞验证，从而极大降低 TTFB
  const protectedPaths = [
    '/admin',
    '/create',
    '/profile',
    '/run',
    '/upload',
    '/update-password'
  ]

  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path))

  // 仅在受保护路径执行服务端 Auth 检查
  if (hasSupabaseCookie && isProtectedPath) {
    await supabase.auth.getUser()
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons/.*|fontawesome/.*|.*\\.(?:css|js|map|json|txt|xml|ico|svg|png|jpg|jpeg|gif|webp|avif|woff2?|ttf|otf|eot)$).*)',
  ],
}
