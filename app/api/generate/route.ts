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

    // 0. Deduct Credits
    // Creation: 0.5 points, Modification: 0.5 point
    const cost = 0.5;
    
    let creditResult, creditError;
    // Retry logic for unstable network connections
    for (let i = 0; i < 3; i++) {
        const res = await supabase.rpc('deduct_credits', { amount: cost });
        creditResult = res.data;
        creditError = res.error;
        
        if (!creditError) break;
        
        console.warn(`Credit deduction attempt ${i + 1} failed:`, creditError);
        if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (creditError) {
      console.error('Credit Deduction Error (Final):', creditError);
      return NextResponse.json({ error: 'Failed to process credits (Network Error)' }, { status: 500 });
    }

    if (!creditResult || !creditResult.success) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // 1. Create Task in DB
    const { data: task, error: taskError } = await supabase
      .from('generation_tasks')
      .insert({
        user_id: session.user.id,
        prompt: body.user_prompt,
        status: 'pending'
      })
      .select()
      .single();

    if (taskError || !task) {
        console.error('Task Creation Error:', taskError);
        return NextResponse.json({ 
            error: 'Failed to create generation task', 
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
