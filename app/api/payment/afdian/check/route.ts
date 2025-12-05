import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
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

    const { out_trade_no } = await request.json();
    if (!out_trade_no) {
      return NextResponse.json({ error: 'Missing out_trade_no' }, { status: 400 });
    }

    // 查询订单状态
    const { data: order, error } = await supabase
      .from('credit_orders')
      .select('*')
      .eq('out_trade_no', out_trade_no)
      .eq('user_id', session.user.id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 返回订单状态
    return NextResponse.json({ 
      status: order.status,
      credits: order.credits,
      paid: order.status === 'paid'
    });

  } catch (error: any) {
    console.error('Check order error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
