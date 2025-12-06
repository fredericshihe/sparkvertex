import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * 支付状态查询接口
 * 用于前端轮询检查订单是否已支付成功
 * 
 * Query Parameters:
 * - timestamp: 支付开始时间戳（可选），用于查询该时间点之后的订单
 * - limit: 返回订单数量限制（默认5）
 */
export async function GET(request: Request) {
  try {
    // 1. 验证用户身份
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set(name: string, value: string, options: CookieOptions) { 
            cookieStore.set({ name, value, ...options }) 
          },
          remove(name: string, options: CookieOptions) { 
            cookieStore.set({ name, value: '', ...options }) 
          },
        },
      }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 解析查询参数
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp');
    const limit = parseInt(searchParams.get('limit') || '5', 10);

    // 3. 构建查询
    let query = supabase
      .from('credit_orders')
      .select('id, out_trade_no, trade_no, amount, credits, status, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 20)); // 最多返回20条

    // 如果提供了时间戳，只查询该时间点之后创建的订单
    if (timestamp) {
      const date = new Date(parseInt(timestamp, 10));
      if (!isNaN(date.getTime())) {
        query = query.gte('created_at', date.toISOString());
      }
    }

    const { data: orders, error: fetchError } = await query;

    if (fetchError) {
      console.error('[Check Status] Query error:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to fetch orders' 
      }, { status: 500 });
    }

    // 4. 统计订单状态
    const statusCount = {
      paid: orders?.filter(o => o.status === 'paid').length || 0,
      pending: orders?.filter(o => o.status === 'pending').length || 0,
      pending_credits: orders?.filter(o => o.status === 'pending_credits').length || 0,
      failed: orders?.filter(o => o.status === 'failed').length || 0,
    };

    // 5. 查询用户当前积分
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      orders: orders || [],
      count: orders?.length || 0,
      statusCount,
      currentCredits: profile?.credits || 0,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[Check Status] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

/**
 * 查询单个订单状态
 * 
 * POST Body:
 * - orderId: 订单ID (可选)
 * - outTradeNo: 商户订单号 (可选)
 * 两者至少提供一个
 */
export async function POST(request: Request) {
  try {
    // 1. 验证用户身份
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value },
          set(name: string, value: string, options: CookieOptions) { 
            cookieStore.set({ name, value, ...options }) 
          },
          remove(name: string, options: CookieOptions) { 
            cookieStore.set({ name, value: '', ...options }) 
          },
        },
      }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. 解析请求参数
    const body = await request.json();
    const { orderId, outTradeNo } = body;

    if (!orderId && !outTradeNo) {
      return NextResponse.json({ 
        error: 'orderId or outTradeNo is required' 
      }, { status: 400 });
    }

    // 3. 查询订单
    let query = supabase
      .from('credit_orders')
      .select('*')
      .eq('user_id', user.id);

    if (orderId) {
      query = query.eq('id', orderId);
    } else if (outTradeNo) {
      query = query.eq('out_trade_no', outTradeNo);
    }

    const { data: order, error: fetchError } = await query.single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ 
          error: 'Order not found' 
        }, { status: 404 });
      }
      console.error('[Check Status] Query error:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to fetch order' 
      }, { status: 500 });
    }

    // 4. 返回订单信息（移除敏感字段）
    const { payment_info, ...safeOrder } = order;

    return NextResponse.json({
      order: safeOrder,
      isPaid: order.status === 'paid',
      isPending: order.status === 'pending',
      needsRetry: order.status === 'pending_credits',
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('[Check Status] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
