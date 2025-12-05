import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import alipaySdk from '@/lib/alipay';
import { AlipayFormData } from 'alipay-sdk';

export async function POST(request: Request) {
  try {
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

    let { amount, credits } = await request.json();

    // TODO: 测试代码 - 强制修改 19.9 档位为 0.01 元，积分改为 1
    if (amount === 19.9) {
      amount = 0.01;
      credits = 1;
    }
    
    // 2. 生成唯一订单号
    const outTradeNo = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 3. 在数据库创建订单 (使用 credit_orders 表以免与现有 orders 表冲突)
    const { error: dbError } = await supabase
      .from('credit_orders')
      .insert({
        user_id: session.user.id,
        out_trade_no: outTradeNo,
        amount: amount,
        credits: credits,
        status: 'pending'
      });

    if (dbError) throw dbError;

    // 4. 调用支付宝接口
    const formData = new AlipayFormData();
    formData.setMethod('get');
    
    // 手机网站支付
    formData.addField('bizContent', {
      outTradeNo: outTradeNo,
      productCode: 'QUICK_WAP_WAY',
      totalAmount: amount.toString(),
      subject: `购买 ${credits} 积分`,
      body: 'Spark Vertex 积分充值',
    });

    // 设置回调地址
    formData.addField('notifyUrl', `${process.env.NEXT_PUBLIC_APP_URL}/api/payment/notify`);
    // 支付成功后跳转回的页面
    formData.addField('returnUrl', `${process.env.NEXT_PUBLIC_APP_URL}/profile`);

    // 生成支付链接
    const result = await alipaySdk.exec(
      'alipay.trade.wap.pay',
      {},
      { formData: formData }
    );

    return NextResponse.json({ url: result });

  } catch (error: any) {
    console.error('Payment Create Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
