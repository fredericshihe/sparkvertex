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
      
      // 提取爱发电用户唯一标识（用于额外验证）
      const afdianUserPrivateId = data.order.user_private_id;
      
      // 多层级匹配策略
      let order = null;
      let fetchError = null;
      let matchMethod = 'none';
      
      // 策略 1: 优先通过 remark（订单号）精确匹配
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
        
        if (order) {
          matchMethod = 'remark_exact';
          console.log('[Afdian Webhook] ✅ Matched by remark (exact)');
        }
      }
      
      // 策略 2: 如果 remark 匹配失败，尝试通过 metadata 中保存的 afdian_user_private_id 匹配
      if (!order && afdianUserPrivateId) {
        console.log('[Afdian Webhook] Trying to match by afdian_user_private_id:', afdianUserPrivateId);
        
        const result = await supabaseAdmin
          .from('credit_orders')
          .select('*')
          .eq('provider', 'afdian')
          .eq('status', 'pending')
          .eq('amount', orderAmount)
          .contains('metadata', { afdian_user_private_id: afdianUserPrivateId })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        order = result.data;
        fetchError = result.error;
        
        if (order) {
          matchMethod = 'user_private_id';
          console.log('[Afdian Webhook] ✅ Matched by afdian_user_private_id');
        }
      }
      
      // 策略 3: 兜底策略 - 金额 + 时间窗口匹配（高风险，记录警告）
      if (!order) {
        console.warn('[Afdian Webhook] ⚠️  Fallback to amount+time matching (risky!):', orderAmount);
        
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
          matchMethod = 'amount_time_fallback';
          console.warn('[Afdian Webhook] ⚠️  Matched by amount+time (fallback strategy)');
          
          // 额外验证：检查是否有多个匹配的订单（潜在误匹配风险）
          const { data: duplicateOrders, error: dupError } = await supabaseAdmin
            .from('credit_orders')
            .select('id, out_trade_no, created_at')
            .eq('provider', 'afdian')
            .eq('status', 'pending')
            .eq('amount', orderAmount)
            .gte('created_at', tenMinutesAgo);
            
          if (!dupError && duplicateOrders && duplicateOrders.length > 1) {
            console.error('[Afdian Webhook] 🚨 CRITICAL: Multiple pending orders with same amount detected!');
            console.error('[Afdian Webhook] Orders:', duplicateOrders.map(o => ({ id: o.id, out_trade_no: o.out_trade_no })));
            console.error('[Afdian Webhook] Trade No:', tradeNo);
            
            // 拒绝处理，需要人工介入
            return NextResponse.json({ 
              ec: 409, 
              em: 'Multiple matching orders detected, manual review required' 
            }, { status: 409 });
          }
        }
      }

      if (fetchError || !order) {
        console.error('[Afdian Webhook] Order not found for amount:', orderAmount, 'trade_no:', tradeNo);
        console.error('[Afdian Webhook] Afdian user_private_id:', afdianUserPrivateId);
        
        // 记录未匹配的 webhook（用于后续人工核对）
        await supabaseAdmin
          .from('credit_orders')
          .insert({
            out_trade_no: `UNMATCHED_${tradeNo}`,
            trade_no: tradeNo,
            amount: orderAmount,
            credits: 0,
            status: 'failed',
            provider: 'afdian',
            payment_info: data.order,
            metadata: {
              error: 'No matching pending order found',
              match_method: matchMethod,
              afdian_user_private_id: afdianUserPrivateId,
              webhook_received_at: new Date().toISOString()
            }
          })
          .select()
          .single();
        
        return NextResponse.json({ ec: 200, em: 'success' });
      }

      console.log('[Afdian Webhook] Found order:', order.id, 'Credits:', order.credits, 'Match method:', matchMethod);
      
      // 如果是通过 fallback 策略匹配的，更新订单 metadata 记录风险
      if (matchMethod === 'amount_time_fallback' && order.metadata) {
        await supabaseAdmin
          .from('credit_orders')
          .update({
            metadata: {
              ...order.metadata,
              match_method: matchMethod,
              match_risk: 'high',
              afdian_user_private_id: afdianUserPrivateId
            }
          })
          .eq('id', order.id);
      }

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
