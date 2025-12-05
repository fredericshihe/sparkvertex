import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAfdianSignature, AfdianWebhookPayload, isStrictSignatureMode } from '@/lib/afdian';

export async function POST(request: Request) {
  try {
    // 1. 获取爱发电 POST 过来的 JSON 数据
    const payload: AfdianWebhookPayload = await request.json();
    
    console.log('[Afdian Webhook] Received order:', payload.data?.order?.out_trade_no);
    console.log('[Afdian Webhook] Full payload:', JSON.stringify(payload, null, 2));

    // 2. 验签
    const isValid = verifyAfdianSignature(payload);
    if (!isValid) {
      console.error('[Afdian Webhook] Signature verification failed for order:', payload.data?.order?.out_trade_no);
      // 严格模式下拒绝无效签名的请求
      // 但对于测试请求，我们返回 200 以便爱发电知道 URL 是可达的
      if (payload.data?.order?.out_trade_no?.includes('test') || !payload.data?.order?.remark) {
        console.log('[Afdian Webhook] Treating as test request, returning success');
        return NextResponse.json({ ec: 200, em: 'test success' });
      }
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
      
      // 先检查订单是否已存在
      let order = null;
      
      if (data.order.remark) {
        console.log('[Afdian Webhook] Checking for existing order with remark:', data.order.remark);
        const result = await supabaseAdmin
          .from('credit_orders')
          .select('*')
          .eq('out_trade_no', data.order.remark)
          .maybeSingle();
        order = result.data;
        
        if (order && order.status === 'paid') {
          console.log('[Afdian Webhook] Order already paid, skipping');
          return NextResponse.json({ ec: 200, em: 'order already processed' });
        }
      }
      
      // 如果订单不存在，根据金额判断应该给多少积分并创建订单
      if (!order) {
        console.log('[Afdian Webhook] Creating new order from webhook');
        
        // 根据金额映射积分（与前端 PACKAGES 保持一致）
        const creditMapping: Record<number, number> = {
          19.9: 1,    // Basic (测试期间)
          49.9: 350,  // Standard
          99.9: 800,  // Premium
          198.0: 2000 // Ultimate
        };
        
        const credits = creditMapping[orderAmount] || Math.floor(orderAmount * 10); // 默认按 1元=10积分
        
        // 从 remark 中提取 user_id（格式：timestamp_userId8位_random）
        let userId: string | null = null;
        if (data.order.remark) {
          const parts = data.order.remark.split('_');
          if (parts.length >= 3) {
            const userIdPrefix = parts[1]; // userId 的前8位
            
            console.log('[Afdian Webhook] Searching for user with prefix:', userIdPrefix);
            
            // 查询完整的 user_id（UUID格式匹配）
            const { data: profiles, error: profileError } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .like('id', `${userIdPrefix}%`)
              .limit(1)
              .maybeSingle();
            
            if (profileError) {
              console.error('[Afdian Webhook] Profile query error:', profileError);
            }
            
            if (profiles) {
              userId = profiles.id;
              console.log('[Afdian Webhook] Found user:', userId);
            } else {
              console.error('[Afdian Webhook] No user found with prefix:', userIdPrefix);
            }
          }
        }
        
        if (!userId) {
          console.error('[Afdian Webhook] Cannot extract user_id from remark:', data.order.remark);
          return NextResponse.json({ ec: 200, em: 'cannot identify user' });
        }
        
        // 创建订单
        const { data: newOrder, error: createError } = await supabaseAdmin
          .from('credit_orders')
          .insert({
            user_id: userId,
            out_trade_no: data.order.remark || tradeNo,
            trade_no: tradeNo,
            amount: orderAmount,
            credits: credits,
            status: 'paid',
            provider: 'afdian',
            payment_info: data.order
          })
          .select()
          .single();
        
        if (createError) {
          console.error('[Afdian Webhook] Failed to create order:', createError);
          return NextResponse.json({ ec: 500, em: 'failed to create order' }, { status: 500 });
        }
        
        order = newOrder;
        console.log('[Afdian Webhook] Created order:', order.id, 'Credits:', order.credits);
      } else {
        // 订单已存在但未支付，更新为已支付
        console.log('[Afdian Webhook] Updating existing order:', order.id);
        const { error: updateError } = await supabaseAdmin
          .from('credit_orders')
          .update({ 
            status: 'paid',
            trade_no: tradeNo,
            updated_at: new Date().toISOString(),
            payment_info: data.order
          })
          .eq('id', order.id);

        if (updateError) {
          console.error('[Afdian Webhook] Failed to update order:', updateError);
          return NextResponse.json({ ec: 500, em: 'database error' }, { status: 500 });
        }
      }
      
      // 给用户加积分
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
    return NextResponse.json({ ec: 200, em: 'success' });

  } catch (error) {
    console.error('[Afdian Webhook] Error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ec: 500, em: 'internal server error' }, { status: 500 });
  }
}
