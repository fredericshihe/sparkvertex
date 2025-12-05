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
        
        // 从 remark 中提取 user_id 和 credits
        // 支持三种格式以保持向后兼容：
        // 1. 最新格式：userId|credits|timestamp|random（直接包含完整UUID和积分数）
        // 2. 新格式：userId|timestamp|random（直接包含完整UUID）
        // 3. 旧格式：timestamp_userIdPrefix_random（需要查询匹配）
        let userId: string | null = null;
        let credits: number | null = null;
        
        if (data.order.remark) {
          // 尝试最新格式（userId|credits|timestamp|random）
          if (data.order.remark.includes('|')) {
            const parts = data.order.remark.split('|');
            if (parts.length >= 4) {
              userId = parts[0]; // 完整的 user_id
              credits = parseInt(parts[1], 10); // 积分数
              console.log('[Afdian Webhook] Extracted from latest format - user_id:', userId, 'credits:', credits);
            } else if (parts.length >= 3) {
              userId = parts[0]; // 完整的 user_id
              console.log('[Afdian Webhook] Extracted user_id from new format:', userId);
              
              // 验证 UUID 格式
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (!uuidRegex.test(userId)) {
                console.error('[Afdian Webhook] Invalid UUID format:', userId);
                userId = null;
              }
            }
          } else {
            // 旧格式：timestamp_userIdPrefix_random（向后兼容）
            const parts = data.order.remark.split('_');
            if (parts.length >= 3) {
              const userIdPrefix = parts[1];
              console.log('[Afdian Webhook] Using legacy format, searching for user with prefix:', userIdPrefix);
              
              // 查询所有 profiles 并在应用层过滤
              const { data: allProfiles, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('id');
              
              if (profileError) {
                console.error('[Afdian Webhook] Profile query error:', profileError);
              }
              
              if (allProfiles && allProfiles.length > 0) {
                const matchedProfile = allProfiles.find(p => p.id.startsWith(userIdPrefix));
                if (matchedProfile) {
                  userId = matchedProfile.id;
                  console.log('[Afdian Webhook] Found user (legacy):', userId);
                } else {
                  console.error('[Afdian Webhook] No user found with prefix:', userIdPrefix);
                }
              }
            }
          }
        }
        
        if (!userId) {
          console.error('[Afdian Webhook] Cannot extract user_id from remark:', data.order.remark);
          return NextResponse.json({ ec: 200, em: 'cannot identify user' });
        }
        
        // 如果 remark 中没有 credits 信息，则根据金额映射
        if (!credits || isNaN(credits)) {
          const creditMapping: Record<number, number> = {
            19.9: 1,    // Basic (测试期间)
            49.9: 350,  // Standard
            99.9: 800,  // Premium
            198.0: 2000 // Ultimate
          };
          credits = creditMapping[orderAmount] || Math.floor(orderAmount * 10);
          console.log('[Afdian Webhook] Calculated credits from amount:', orderAmount, '->', credits);
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
