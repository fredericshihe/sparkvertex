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
    
    // 2. 检查是否有相同金额的未支付订单（5分钟内）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingOrder } = await supabase
      .from('credit_orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .eq('amount', amount)
      .eq('credits', credits)
      .eq('provider', 'afdian')
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    let outTradeNo: string;
    
    // 如果存在未支付订单，复用它
    if (existingOrder) {
      console.log('[Afdian Create] Reusing existing pending order:', existingOrder.out_trade_no);
      outTradeNo = existingOrder.out_trade_no;
    } else {
      // 生成新的唯一订单号
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substr(2, 9);
      const userIdPart = user.id.substr(0, 8);
      outTradeNo = `${timestamp}_${userIdPart}_${randomPart}`;
      
      // 3. 在数据库创建订单订单
      const { error: dbError } = await supabase
        .from('credit_orders')
        .insert({
          user_id: user.id,
          out_trade_no: outTradeNo,
          amount: amount,
          credits: credits,
          status: 'pending',
          provider: 'afdian' // 标记为爱发电订单
        });

      if (dbError) {
        console.error('[Afdian Create] Database error:', dbError);
        // 检查是否是唯一性约束冲突
        if (dbError.code === '23505') {
          return NextResponse.json({ error: 'Duplicate order, please try again' }, { status: 409 });
        }
        throw dbError;
      }
    }    // 4. 生成爱发电支付链接
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
