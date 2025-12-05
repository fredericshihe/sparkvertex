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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { amount, credits, item_id, plan_id } = await request.json();
    
    // 2. 生成唯一订单号
    const outTradeNo = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 3. 在数据库创建订单
    const { error: dbError } = await supabase
      .from('credit_orders')
      .insert({
        user_id: session.user.id,
        out_trade_no: outTradeNo,
        amount: amount,
        credits: credits,
        status: 'pending',
        provider: 'afdian' // 标记为爱发电订单
      });

    if (dbError) throw dbError;

    // 4. 生成爱发电支付链接
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
    console.error('Afdian Payment Create Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
