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
    
    // 2. 检查是否有相同金额的未支付订单（5分钟内）
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingOrder, error: queryError } = await supabase
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
    
    if (queryError) {
      console.error('[Afdian Create] Query error:', queryError);
    }
    
    let outTradeNo: string;
    
    // 如果存在未支付订单，复用它
    if (existingOrder) {
      console.log('[Afdian Create] Reusing existing pending order:', existingOrder.out_trade_no);
      outTradeNo = existingOrder.out_trade_no;
    } else {
      console.log('[Afdian Create] No existing order found, creating new one');
      
      // 生成新的唯一订单号（使用更强的唯一性保证）
      const timestamp = Date.now();
      const randomPart = Math.random().toString(36).substring(2, 15);
      const userIdPart = user.id.substring(0, 8);
      const extraRandom = Math.floor(Math.random() * 10000);
      outTradeNo = `${timestamp}_${userIdPart}_${randomPart}_${extraRandom}`;
      
      console.log('[Afdian Create] Generated order ID:', outTradeNo);
      
      // 3. 在数据库创建订单
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
        console.error('[Afdian Create] Error details:', { code: dbError.code, message: dbError.message, details: dbError.details });
        
        // 检查是否是唯一性约束冲突
        if (dbError.code === '23505') {
          // 如果真的发生了冲突，尝试再次查询最新的订单
          const { data: retryOrder } = await supabase
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
          
          if (retryOrder) {
            console.log('[Afdian Create] Found order after conflict, reusing:', retryOrder.out_trade_no);
            outTradeNo = retryOrder.out_trade_no;
          } else {
            return NextResponse.json({ error: 'Duplicate order conflict, please try again in a moment' }, { status: 409 });
          }
        } else {
          throw dbError;
        }
      } else {
        console.log('[Afdian Create] Order created successfully');
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
