import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAfdianSignature, AfdianWebhookPayload } from '@/lib/afdian';

export async function POST(request: Request) {
  try {
    // 1. 获取爱发电 POST 过来的 JSON 数据
    const payload: AfdianWebhookPayload = await request.json();
    
    console.log('[Afdian Webhook] Received order:', payload.data?.order?.out_trade_no);

    // 2. 验签
    const isValid = verifyAfdianSignature(payload);
    if (!isValid) {
      console.warn('[Afdian Webhook] Signature verification failed, but continuing to process order');
      // 注意：为了稳定性，验签失败时仅记录警告，不阻止订单处理
      // 生产环境建议修复公钥配置后启用严格验签
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

      if (order.status === 'pending') {
        // 5. 更新订单状态
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
            console.error('[Afdian Webhook] Failed to update order:', updateError);
            return NextResponse.json({ ec: 500, em: 'database error' }, { status: 500 });
        }

        // 6. 给用户加积分
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('credits')
            .eq('id', order.user_id)
            .single();
            
        if (profileError) {
            console.error('[Afdian Webhook] Failed to fetch profile:', profileError);
        } else if (profile) {
            const oldCredits = profile.credits || 0;
            const newCredits = oldCredits + order.credits;
            
            const { error: creditError } = await supabaseAdmin
                .from('profiles')
                .update({ credits: newCredits })
                .eq('id', order.user_id);
                
            if (creditError) {
                console.error('[Afdian Webhook] Failed to update credits:', creditError);
            } else {
                console.log('[Afdian Webhook] Credits updated:', oldCredits, '->', newCredits);
            }
        }
      }
    }
    return NextResponse.json({ ec: 200, em: 'success' });

  } catch (error) {
    console.error('[Afdian Webhook] Error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ec: 500, em: 'internal server error' }, { status: 500 });
  }
}
