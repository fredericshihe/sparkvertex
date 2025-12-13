import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-server-safe';
import { VARIANT_CREDITS_MAP, LEMON_SQUEEZY_CONFIG } from '@/lib/lemon-squeezy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = LEMON_SQUEEZY_CONFIG.WEBHOOK_SECRET;

    if (!secret) {
      console.error('LEMONSQUEEZY_WEBHOOK_SECRET is not set');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
    const signature = Buffer.from(req.headers.get('X-Signature') || '', 'utf8');

    // 1. 安全验证：确保请求真的来自 Lemon Squeezy
    if (!crypto.timingSafeEqual(digest, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventName = payload.meta.event_name;

    // 2. 只处理订单支付成功事件
    if (eventName === 'order_created') {
      const { attributes } = payload.data;
      const customData = payload.meta.custom_data;

      // 获取前端传过来的 user_id
      const userId = customData?.user_id; 
      // 获取用户买了哪个变体
      const variantId = attributes.first_order_item.variant_id;
      const orderId = payload.data.id;
      
      if (userId && variantId) {
        const creditsToAdd = VARIANT_CREDITS_MAP[String(variantId)] || 0;

        if (creditsToAdd > 0) {
          console.log(`[Lemon Webhook] Processing order ${orderId} for user ${userId}`);

          // 3.1 幂等性检查：检查订单是否已处理
          const { data: existingOrder } = await supabaseAdmin
            .from('credit_orders')
            .select('id')
            .eq('out_trade_no', orderId)
            .single();

          if (existingOrder) {
            console.log(`[Lemon Webhook] Order ${orderId} already processed.`);
            return NextResponse.json({ received: true, message: 'Already processed' });
          }

          // 3.2 记录订单到 credit_orders 表
          const { error: insertError } = await supabaseAdmin
            .from('credit_orders')
            .insert({
              user_id: userId,
              out_trade_no: orderId,
              trade_no: attributes.identifier,
              amount: attributes.total / 100, // cents to dollars
              credits: creditsToAdd,
              status: 'paid',
              provider: 'lemonsqueezy',
              payment_info: payload,
              metadata: {
                variant_id: variantId,
                user_email: attributes.user_email,
                currency: attributes.currency
              }
            });

          if (insertError) {
            console.error('[Lemon Webhook] Failed to insert order:', insertError);
            // 即使记录失败，也尝试给用户加分，或者选择中断？
            // 为了保障用户权益，建议继续加分，但记录错误
          }

          // 3.3 数据库操作：给用户加分 (使用 RPC 原子操作)
          const { error } = await supabaseAdmin.rpc('increment_user_credits', {
            p_user_id: userId,
            p_amount: creditsToAdd
          });

          if (error) {
            console.error('[Lemon Webhook] RPC failed:', error);
            // Fallback: Read and Update
            const { data: profile } = await supabaseAdmin
              .from('profiles')
              .select('credits')
              .eq('id', userId)
              .single();
            
            if (profile) {
              const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({ credits: (profile.credits || 0) + creditsToAdd })
                .eq('id', userId);
              
              if (updateError) {
                console.error('[Lemon Webhook] Fallback update failed:', updateError);
                return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 });
              }
            } else {
               console.error('[Lemon Webhook] User profile not found:', userId);
            }
          }
          
          console.log('[Lemon Webhook] Credits added successfully!');
        } else {
            console.warn(`[Lemon Webhook] Unknown variant ID: ${variantId}`);
        }
      } else {
          console.warn('[Lemon Webhook] Missing user_id or variant_id', { userId, variantId });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Lemon Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
