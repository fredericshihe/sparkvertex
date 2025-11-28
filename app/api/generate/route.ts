import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// 使用 Node.js Runtime 以支持更长的超时设置
export const runtime = 'nodejs';
// 增加最大执行时间 (Vercel Hobby 限制 60s, Pro 限制 300s)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic'; 

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // 获取用户的 Access Token 用于传递给 Edge Function 进行鉴权
    const token = session.access_token;

    if (!supabaseUrl) {
        return NextResponse.json({ error: 'Server Configuration Error' }, { status: 500 });
    }

    // 服务器端请求 Supabase Edge Function，隐藏真实 URL
    // 增加 signal 以支持取消请求，但这里我们主要关注超时
    const controller = new AbortController();
    // 设置 55 秒超时，留 5 秒给 Next.js 处理响应
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-app`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // 传递用户 Token
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Upstream Error:', response.status, errorText);
        // Return the actual error from upstream for debugging
        return NextResponse.json({ error: `Generation failed: ${errorText}` }, { status: response.status });
    }

    // 透传流式响应
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
