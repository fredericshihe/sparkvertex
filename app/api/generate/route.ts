import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// 使用 Edge Runtime 以支持流式传输
export const runtime = 'edge';

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
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-app`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // 传递用户 Token
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Upstream Error:', response.status, errorText);
        return NextResponse.json({ error: 'Generation failed' }, { status: response.status });
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
