import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// 使用 Node.js Runtime 以支持更长的超时设置
export const runtime = 'nodejs';
// 增加最大执行时间 (Vercel Hobby 限制 60s, Pro 限制 300s)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic'; 

export async function POST(request: Request) {
  try {
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
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: '未授权 (Unauthorized)' }, { status: 401 });
    }

    const body = await request.json();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // 获取用户的 Access Token 用于传递给 Edge Function 进行鉴权
    const token = session.access_token;

    if (!supabaseUrl) {
        return NextResponse.json({ error: '服务器配置错误 (Server Configuration Error)' }, { status: 500 });
    }

    // Note: Credit deduction is now handled entirely in the Edge Function to ensure atomicity and correct pricing based on model usage.
    
    // 1. Create Task in DB
    // Truncate prompt to avoid huge payload issues in DB (Postgres text limit is high, but network/timeout might be an issue)
    const MAX_PROMPT_LENGTH = 50000; // 50KB limit for DB storage
    const storedPrompt = body.user_prompt && body.user_prompt.length > MAX_PROMPT_LENGTH 
        ? body.user_prompt.substring(0, MAX_PROMPT_LENGTH) + '... (truncated)' 
        : body.user_prompt;

    const { data: task, error: taskError } = await supabase
      .from('generation_tasks')
      .insert({
        user_id: session.user.id,
        prompt: storedPrompt,
        status: 'pending'
      })
      .select()
      .single();

    if (taskError || !task) {
        console.error('Task Creation Error:', taskError);
        return NextResponse.json({ 
            error: '创建任务失败 (Failed to create generation task)', 
            details: taskError 
        }, { status: 500 });
    }

    // 2. Trigger Async Edge Function (Fire and Forget-ish)
    // We use fetch but don't await the full result, or we rely on the client to trigger it?
    // Better: We trigger it here, but we set a very short timeout so we don't wait for completion.
    // Actually, if we abort the request to Edge Function, does it stop?
    // Deno Edge Functions usually stop if the client disconnects unless they use background tasks.
    // BUT, we can use the "invoke" method from supabase-js which might handle auth better.
    
    // Let's try to just return the taskId to the client, and let the CLIENT trigger the heavy lifting.
    // This avoids Vercel timeout issues completely.
    
    return NextResponse.json({ taskId: task.id });

    /* 
    // Old Logic Removed
    const controller = new AbortController();
    ...
    */

  } catch (error) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: '服务器内部错误 (Internal Server Error)' }, { status: 500 });
  }
}
