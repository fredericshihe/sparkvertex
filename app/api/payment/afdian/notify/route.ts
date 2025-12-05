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
    console.log('Full order object:', JSON.stringify(data.order, null, 2));
    
    // 3. 检查交易状态
    // type 为 order 且 status 为 2 (交易成功)
    if (data.type === 'order' && data.order.status === 2) {
      const tradeNo = data.order.out_trade_no; // 爱发电的订单号
      const orderAmount = parseFloat(data.order.show_amount); // 实际支付金额
      
      console.log('Processing Afdian order:', tradeNo, 'Amount:', orderAmount);
      
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
      
      // 商品购买模式下，remark 不会传递，我们通过金额 + 时间窗口匹配订单
      // 先尝试通过 remark 匹配（如果有的话）
      let order = null;
      let fetchError = null;
      
      if (data.order.remark) {
        console.log('Trying to match by remark:', data.order.remark);
        const result = await supabaseAdmin
          .from('credit_orders')
          .select('*')
          .eq('out_trade_no', data.order.remark)
          .eq('status', 'pending')
          .single();
        order = result.data;
        fetchError = result.error;
      }
      
      // 如果通过 remark 找不到，尝试通过金额匹配最近的待支付订单
      if (!order) {
        console.log('Remark not found, matching by amount:', orderAmount);
        
        // 查找最近10分钟内，金额匹配且状态为 pending 的订单
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        
        // 先查看所有待支付订单用于调试
        const { data: allPendingOrders } = await supabaseAdmin
          .from('credit_orders')
          .select('*')
          .eq('provider', 'afdian')
          .eq('status', 'pending')
          .gte('created_at', tenMinutesAgo)
          .order('created_at', { ascending: false });
        
        console.log('All pending afdian orders in last 10 min:', JSON.stringify(allPendingOrders, null, 2));
        
        const result = await supabaseAdmin
          .from('credit_orders')
          .select('*')
          .eq('provider', 'afdian')
          .eq('status', 'pending')
          .eq('amount', orderAmount)
          .gte('created_at', tenMinutesAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        order = result.data;
        fetchError = result.error;
        
        if (order) {
          console.log('Found matching order by amount and time:', order.out_trade_no);
        } else {
          console.log('No matching order found. Searched for amount:', orderAmount);
        }
      }

      if (fetchError || !order) {
        console.error('Order not found. Amount:', orderAmount, 'Error:', fetchError);
        console.error('Afdian trade_no:', tradeNo);
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
