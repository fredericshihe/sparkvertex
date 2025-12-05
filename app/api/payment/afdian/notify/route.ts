import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAfdianSignature, AfdianWebhookPayload, isStrictSignatureMode } from '@/lib/afdian';

export async function POST(request: Request) {
  try {
    // 1. 获取爱发电 POST 过来的 JSON 数据
    const payload: AfdianWebhookPayload = await request.json();
    
    console.log('[Afdian Webhook] Received order:', payload.data?.order?.out_trade_no);

    // 2. 验签
    const isValid = verifyAfdianSignature(payload);
    if (!isValid) {
      console.error('[Afdian Webhook] Signature verification failed for order:', payload.data?.order?.out_trade_no);
      // 严格模式下拒绝无效签名的请求
      return NextResponse.json({ 
        ec: 400, 
        em: 'signature verification failed' 
      }, { status: 400 });
    }

    const { data } = payload;
    
    // 3. 检查交易状态 (type=order, status=2 表示交易成功)
    if (data.type === 'order' && data.order.status === 2) {
      const tradeNo = data.order.out_trade_no;
      const orderAmount = parseFloat(data.order.show_amount);
      
      console.log('[Afdian Webhook] Processing order:', tradeNo, 'Amount:', orderAmount);
      
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
      
      // 优先通过 remark 匹配订单，如果没有则使用金额+时间窗口
      let order = null;
      let fetchError = null;
      
      if (data.order.remark) {
        console.log('[Afdian Webhook] Matching by remark:', data.order.remark);
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
        console.log('[Afdian Webhook] Remark not found, matching by amount:', orderAmount);
        
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        
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
          console.log('[Afdian Webhook] Matched order:', order.out_trade_no);
        }
      }

      if (fetchError || !order) {
        console.error('[Afdian Webhook] Order not found for amount:', orderAmount, 'trade_no:', tradeNo);
        return NextResponse.json({ ec: 200, em: 'success' });
      }

      console.log('[Afdian Webhook] Found order:', order.id, 'Credits:', order.credits);

      // 幂等性检查：如果 trade_no 已经存在于其他 paid 订单，说明已处理过
      const { data: existingPaidOrder } = await supabaseAdmin
        .from('credit_orders')
        .select('id')
        .eq('trade_no', tradeNo)
        .eq('status', 'paid')
        .single();

      if (existingPaidOrder) {
        console.log('[Afdian Webhook] Order already processed (idempotency check):', tradeNo);
        return NextResponse.json({ ec: 200, em: 'success' });
      }

      if (order.status === 'pending') {
        // 5. 原子性更新订单状态（使用 RPC 调用数据库函数，包含事务和锁）
        const { data: result, error: processError } = await supabaseAdmin
          .rpc('process_credit_order', {
            order_id: order.id,
            afdian_trade_no: tradeNo,
            afdian_order_info: data.order
          });

        if (processError) {
          console.error('[Afdian Webhook] Failed to process order:', processError);
          return NextResponse.json({ ec: 500, em: 'database error' }, { status: 500 });
        }

        if (result && result.success) {
          console.log('[Afdian Webhook] Credits updated:', result.old_credits, '->', result.new_credits);
        } else {
          console.error('[Afdian Webhook] Process failed:', result);
        }
      }
    }
    return NextResponse.json({ ec: 200, em: 'success' });

  } catch (error) {
    console.error('[Afdian Webhook] Error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ec: 500, em: 'internal server error' }, { status: 500 });
  }
}
