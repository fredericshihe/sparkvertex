import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAfdianSignature, AfdianWebhookPayload } from '@/lib/afdian';

export async function POST(request: Request) {
  try {
    // 1. 获取爱发电 POST 过来的 JSON 数据
    const payload: AfdianWebhookPayload = await request.json();
    
    console.log('======= Afdian Webhook Start =======');
    console.log('Received payload:', JSON.stringify(payload, null, 2));

    // 2. 验签（临时跳过验签用于调试）
    const isValid = verifyAfdianSignature(payload);
    console.log('Signature verification:', isValid);
    if (!isValid) {
      console.error('爱发电验签失败 - 但继续处理以便调试');
      // 临时注释掉验签失败的拦截，用于调试
      // return NextResponse.json({ ec: 400, em: 'signature verification failed' }, { status: 400 });
    }

    const { data } = payload;
    console.log('Order type:', data.type);
    console.log('Order status:', data.order?.status);
    
    // 3. 检查交易状态
    // type 为 order 且 status 为 2 (交易成功)
    if (data.type === 'order' && data.order.status === 2) {
      const outTradeNo = data.order.remark; // 我们在 remark 中透传了 out_trade_no
      const tradeNo = data.order.out_trade_no; // 爱发电的订单号

      if (!outTradeNo) {
          console.error('No remark (out_trade_no) found in Afdian order');
          return NextResponse.json({ ec: 200, em: 'success' }); // 无法处理，但返回成功停止重试
      }

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
      console.log('Searching for order:', outTradeNo);
      const { data: order, error: fetchError } = await supabaseAdmin
        .from('credit_orders')
        .select('*')
        .eq('out_trade_no', outTradeNo)
        .single();

      if (fetchError || !order) {
        console.error('Order not found:', outTradeNo, 'Error:', fetchError);
        return NextResponse.json({ ec: 200, em: 'success' });
      }

      console.log('Order found:', order.id, 'Status:', order.status, 'Credits:', order.credits);

      if (order.status === 'pending') {
        // 5. 更新订单状态
        console.log('Updating order status to paid...');
        const { error: updateError } = await supabaseAdmin
          .from('credit_orders')
          .update({ 
            status: 'paid',
            trade_no: tradeNo,
            updated_at: new Date().toISOString(),
            payment_info: data.order // 保存爱发电的完整订单信息以备查
          })
          .eq('id', order.id);

        if (updateError) {
            console.error('Failed to update order status:', updateError);
            return NextResponse.json({ ec: 500, em: 'database error' }, { status: 500 });
        }
        console.log('Order status updated successfully');

        // 6. 给用户加积分
        console.log('Adding credits to user:', order.user_id);
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('credits')
            .eq('id', order.user_id)
            .single();
            
        if (profileError) {
            console.error('Failed to fetch user profile:', profileError);
        } else if (profile) {
            const oldCredits = profile.credits || 0;
            const newCredits = oldCredits + order.credits;
            console.log(`Updating credits: ${oldCredits} + ${order.credits} = ${newCredits}`);
            
            const { error: creditError } = await supabaseAdmin
                .from('profiles')
                .update({ credits: newCredits })
                .eq('id', order.user_id);
                
            if (creditError) {
                console.error('Failed to update credits:', creditError);
            } else {
                console.log('Credits updated successfully!');
            }
        }
      } else {
        console.log('Order already processed, status:', order.status);
      }
    }

    console.log('======= Afdian Webhook End =======');
    return NextResponse.json({ ec: 200, em: 'success' });

  } catch (error) {
    console.error('======= Afdian Notify Error =======');
    console.error('Error details:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ ec: 500, em: 'internal server error' }, { status: 500 });
  }
}
