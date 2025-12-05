import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AFDIAN_USER_ID } from '@/lib/afdian';

export async function POST(request: Request) {
  try {
    if (!AFDIAN_USER_ID) {
      return NextResponse.json({ error: 'Afdian User ID not configured' }, { status: 500 });
    }

    // 1. 验证用户
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
          remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { amount, credits, item_id, plan_id } = await request.json();
    
    console.log('[Afdian Create] Request:', { user_id: user.id, amount, credits });
    
    // 2. 生成唯一的订单标识（用作 remark）
    // 格式：timestamp_userIdPrefix_random
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 15);
    const userIdPart = user.id.substring(0, 8);
    const outTradeNo = `${timestamp}_${userIdPart}_${randomPart}`;
    
    console.log('[Afdian Create] Generated remark:', outTradeNo);
    
    // 3. 在 localStorage 暂存订单信息（前端会用，但不是必需的）
    // Webhook 收到通知时，会根据 remark 和金额创建订单    // 4. 生成爱发电支付链接
    let payUrl: string;
    
    if (item_id) {
      // 商品购买模式: https://afdian.com/item/{item_id}?remark={订单号}
      payUrl = `https://afdian.com/item/${item_id}?remark=${encodeURIComponent(outTradeNo)}`;
    } else if (plan_id) {
      // 方案赞助模式: https://afdian.com/order/create?user_id=xxx&plan_id=xxx&remark=xxx
      const params = new URLSearchParams({
        user_id: AFDIAN_USER_ID,
        plan_id: plan_id,
        remark: outTradeNo,
      });
      payUrl = `https://afdian.com/order/create?${params.toString()}`;
    } else {
      // 通用赞助页面 (用户可以手动选择金额)
      const params = new URLSearchParams({
        user_id: AFDIAN_USER_ID,
        remark: outTradeNo,
      });
      payUrl = `https://afdian.com/order/create?${params.toString()}`;
    }

    return NextResponse.json({ url: payUrl });

  } catch (error: any) {
    console.error('[Afdian Create] Error:', error);
    // 如果是Supabase错误,返回更详细的信息
    if (error.code) {
      return NextResponse.json({ 
        error: error.message, 
        code: error.code,
        details: error.details 
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
