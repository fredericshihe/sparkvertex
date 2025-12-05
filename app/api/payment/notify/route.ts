import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAlipaySdk } from '@/lib/alipay';

export async function POST(request: Request) {
  try {
    // 1. 获取支付宝 POST 过来的数据
    const formData = await request.formData();
    const params: any = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });

    // 2. 验签
    const checkResult = getAlipaySdk().checkNotifySign(params);
    if (!checkResult) {
      console.error('支付宝验签失败');
      // 签名失败也要返回 success 吗？通常不，返回 fail 让支付宝重试，或者直接忽略
      return new NextResponse('fail', { status: 400 });
    }

    // 3. 检查交易状态
    const tradeStatus = params.trade_status;
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      const outTradeNo = params.out_trade_no;
      const tradeNo = params.trade_no;

      // 初始化 Supabase Admin 客户端
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
      
      // 4. 查询订单
      const { data: order, error: fetchError } = await supabaseAdmin
        .from('credit_orders')
        .select('*')
        .eq('out_trade_no', outTradeNo)
        .single();

      if (fetchError || !order) {
        console.error('Order not found:', outTradeNo);
        return new NextResponse('success'); // 订单不存在，可能是测试数据，返回 success 停止重试
      }

      if (order.status === 'pending') {
        // 5. 更新订单状态
        const { error: updateError } = await supabaseAdmin
          .from('credit_orders')
          .update({ 
            status: 'paid',
            trade_no: tradeNo,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id);

        if (updateError) {
            console.error('Failed to update order status:', updateError);
            return new NextResponse('fail', { status: 500 });
        }

        // 6. 给用户加积分
        // 先获取当前积分
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('credits')
            .eq('id', order.user_id)
            .single();
            
        if (profile) {
            const newCredits = (profile.credits || 0) + order.credits;
            await supabaseAdmin
                .from('profiles')
                .update({ credits: newCredits })
                .eq('id', order.user_id);
        }
      }
    }

    return new NextResponse('success');

  } catch (error) {
    console.error('Notify Error:', error);
    return new NextResponse('fail', { status: 500 });
  }
}
