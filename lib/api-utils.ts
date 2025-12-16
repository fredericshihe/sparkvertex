/**
 * API 工具函数
 * 统一 API 路由中的常用操作
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createSafeClient } from '@/lib/supabase-server-safe';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// =====================================================
// Supabase 客户端创建
// =====================================================

/**
 * 创建服务端 Supabase 客户端（带 cookie 认证）
 * 用于需要用户认证的 API 路由
 */
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );
}

/**
 * 创建 Supabase Admin 客户端（使用 Service Role Key）
 * 用于需要绕过 RLS 的操作
 * 注意：每次调用都创建新实例，避免跨请求状态污染
 */
export function createAdminSupabase() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
  const serviceRole = process.env['SUPABASE_SERVICE_ROLE_KEY'] || '';

  // If these are missing, downstream calls will fail with confusing 500s.
  // Fail fast with a clear message so the UI can surface it.
  if (!url || url.includes('placeholder.supabase.co')) {
    throw new Error('Server misconfigured: NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!serviceRole || serviceRole === 'placeholder-key') {
    throw new Error('Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createSafeClient();
}

// =====================================================
// App ID 校验
// =====================================================

/**
 * App ID 正则校验模式
 * 支持的格式：
 * - app_xxx_xxx (标准格式)
 * - draft_xxx (草稿格式)
 * - UUID 格式
 * - 数字 ID (旧版兼容)
 */
export const APP_ID_REGEX = /^(app_[a-f0-9-]+_[a-f0-9-]+|draft_[a-zA-Z0-9-_]+|\d+)$/;

/**
 * 验证 App ID 格式是否合法
 */
export function isValidAppId(appId: string | null | undefined): boolean {
  if (!appId) return false;
  
  const isDraft = appId.startsWith('draft_');
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId);
  const isNumeric = /^\d+$/.test(appId);
  
  if (APP_ID_REGEX.test(appId) || isDraft || isUUID || isNumeric) {
    return true;
  }
  
  // Fallback: 允许包含合法字符的 ID
  return /^[a-zA-Z0-9_-]+$/.test(appId);
}

// =====================================================
// CORS Headers
// =====================================================

/**
 * 默认 CORS 响应头
 * 注意：生产环境应该限制 Origin
 */
export const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Spark-App-Id, Authorization',
};

/**
 * 创建带 CORS 的 OPTIONS 响应
 */
export function createCorsOptionsResponse(customHeaders?: Record<string, string>) {
  return NextResponse.json({}, { 
    headers: { ...DEFAULT_CORS_HEADERS, ...customHeaders } 
  });
}

// =====================================================
// 统一响应格式
// =====================================================

interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
}

type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * 创建成功响应
 */
export function apiSuccess<T>(data?: T, message?: string, status = 200, headers?: Record<string, string>) {
  const response: ApiSuccessResponse<T> = { success: true };
  if (data !== undefined) response.data = data;
  if (message) response.message = message;
  
  return NextResponse.json(response, { 
    status, 
    headers: { ...DEFAULT_CORS_HEADERS, ...headers } 
  });
}

/**
 * 创建错误响应
 */
export function apiError(error: string, status = 400, code?: string, headers?: Record<string, string>) {
  const response: ApiErrorResponse = { success: false, error };
  if (code) response.code = code;
  
  return NextResponse.json(response, { 
    status, 
    headers: { ...DEFAULT_CORS_HEADERS, ...headers } 
  });
}

/**
 * 常用错误响应
 */
export const ApiErrors = {
  unauthorized: (message = '未授权，请先登录') => apiError(message, 401, 'UNAUTHORIZED'),
  forbidden: (message = '无权限访问') => apiError(message, 403, 'FORBIDDEN'),
  notFound: (message = '资源不存在') => apiError(message, 404, 'NOT_FOUND'),
  badRequest: (message = '请求参数错误') => apiError(message, 400, 'BAD_REQUEST'),
  rateLimited: (message = '请求过于频繁，请稍后再试') => apiError(message, 429, 'RATE_LIMITED'),
  serverError: (message = '服务器内部错误') => apiError(message, 500, 'SERVER_ERROR'),
  payloadTooLarge: (message = '请求数据过大') => apiError(message, 413, 'PAYLOAD_TOO_LARGE'),
};

// =====================================================
// 认证辅助函数
// =====================================================

/**
 * 获取当前用户会话
 * 返回 null 表示未登录
 */
export async function getCurrentSession(supabase: ReturnType<typeof createServerSupabase>) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

/**
 * 要求用户已登录的中间件
 * 返回 session 或错误响应
 */
export async function requireAuth(supabase: ReturnType<typeof createServerSupabase>) {
  const session = await getCurrentSession(supabase);
  if (!session) {
    return { session: null, errorResponse: ApiErrors.unauthorized() };
  }
  return { session, errorResponse: null };
}

// =====================================================
// 请求体解析
// =====================================================

/**
 * 解析请求体（支持 JSON、FormData、Text）
 */
export async function parseRequestBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    return req.json();
  }
  
  if (contentType.includes('application/x-www-form-urlencoded') || 
      contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const obj: Record<string, unknown> = {};
    
    for (const [key, value] of Array.from(formData.entries())) {
      if (value instanceof File) {
        obj[key] = {
          name: value.name,
          type: value.type,
          size: value.size,
          is_file: true,
        };
      } else {
        obj[key] = value;
      }
    }
    return obj;
  }
  
  return req.text();
}

// =====================================================
// 日志工具（生产环境可禁用）
// =====================================================

const isDev = process.env.NODE_ENV === 'development';

/**
 * API 日志（仅开发环境输出）
 */
export const apiLog = {
  info: (prefix: string, ...args: unknown[]) => {
    if (isDev) console.log(`[${prefix}]`, ...args);
  },
  warn: (prefix: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[${prefix}]`, ...args);
  },
  error: (prefix: string, ...args: unknown[]) => {
    // 错误日志始终输出
    console.error(`[${prefix}]`, ...args);
  },
};
