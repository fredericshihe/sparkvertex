import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

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
