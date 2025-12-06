import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAfdianSignature, AfdianWebhookPayload, isStrictSignatureMode } from '@/lib/afdian';

export async function POST(request: Request) {
  try {
    // 0. 环境变量校验
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Afdian Webhook] Missing required environment variables');
      return NextResponse.json({ 
        ec: 500, 
        em: 'server configuration error' 
      }, { status: 500 });
    }

    // 1. 获取爱发电 POST 过来的 JSON 数据
    const payload: AfdianWebhookPayload = await request.json();
    
    // P2: 优化日志记录 - 只记录必要的非敏感信息
    console.log('[Afdian Webhook] Processing:', {
      trade_no: payload.data?.order?.out_trade_no?.substring(0, 20) + '...',
      amount: payload.data?.order?.show_amount,
      status: payload.data?.order?.status,
      type: payload.data?.type
    });

    // 2. 验签
    const isValid = verifyAfdianSignature(payload);
    if (!isValid) {
      console.error('[Afdian Webhook] Signature verification failed for order:', payload.data?.order?.out_trade_no);
      // 只对爱发电官方测试请求返回 200
      if (payload.data?.order?.out_trade_no === 'afdian_test_order' || 
          payload.data?.order?.out_trade_no?.startsWith('test_')) {
        console.log('[Afdian Webhook] Official test request, returning success');
        return NextResponse.json({ ec: 200, em: 'test success' });
      }
      // 其他所有验签失败的请求都拒绝
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
      
      // 先检查订单是否已存在（防止重复支付）
      // 同时检查 out_trade_no（我们的订单号）和 trade_no（爱发电交易号）
      let order = null;
      
      if (data.order.remark || tradeNo) {
        console.log('[Afdian Webhook] Checking for existing order - remark:', data.order.remark, 'trade_no:', tradeNo);
        
        const { data: existingOrders, error: checkError } = await supabaseAdmin
          .from('credit_orders')
          .select('*')
          .or(`out_trade_no.eq.${data.order.remark},trade_no.eq.${tradeNo}`);
        
        if (checkError) {
          console.error('[Afdian Webhook] Error checking existing orders:', checkError);
          return NextResponse.json({ ec: 500, em: 'database error' }, { status: 500 });
        }
        
        // 检查是否有已支付的订单
        const paidOrder = existingOrders?.find(o => o.status === 'paid');
        if (paidOrder) {
          console.log('[Afdian Webhook] Order already paid:', paidOrder.id);
          return NextResponse.json({ ec: 200, em: 'order already processed' });
        }
        
        // 使用第一个匹配的订单（如果有的话）
        order = existingOrders?.[0] || null;
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
        
        // P0: 严格的价格-积分映射表（防止篡改）
        const STRICT_PRICE_MAP: Record<number, { price: number, tolerance: number }> = {
          1: { price: 19.9, tolerance: 0.5 },      // Basic (测试) - 允许 ±0.5 误差
          350: { price: 49.9, tolerance: 0.5 },    // Standard
          800: { price: 99.9, tolerance: 0.5 },    // Premium
          2000: { price: 198.0, tolerance: 1.0 }   // Ultimate
        };
        
        // 如果 remark 中没有 credits 信息，则根据金额反推
        if (!credits || isNaN(credits)) {
          // 从金额反推积分数（向下取整到最接近的套餐）
          const creditOptions = Object.keys(STRICT_PRICE_MAP).map(Number).sort((a, b) => a - b);
          let matchedCredits = null;
          
          for (const option of creditOptions) {
            const { price, tolerance } = STRICT_PRICE_MAP[option];
            if (Math.abs(orderAmount - price) <= tolerance) {
              matchedCredits = option;
              break;
            }
          }
          
          if (!matchedCredits) {
            console.error('[Afdian Webhook] Cannot match amount to any plan:', orderAmount);
            return NextResponse.json({ 
              ec: 400, 
              em: 'invalid payment amount' 
            }, { status: 400 });
          }
          
          credits = matchedCredits;
          console.log('[Afdian Webhook] Matched amount', orderAmount, 'to', credits, 'credits');
        }
        
        // P0: 严格验证金额是否匹配积分数
        const expectedPlan = STRICT_PRICE_MAP[credits];
        if (!expectedPlan) {
          console.error('[Afdian Webhook] Invalid credits value:', credits);
          return NextResponse.json({ 
            ec: 400, 
            em: 'invalid credits value' 
          }, { status: 400 });
        }
        
        const { price: expectedPrice, tolerance } = expectedPlan;
        const priceDiff = Math.abs(orderAmount - expectedPrice);
        
        if (priceDiff > tolerance) {
          console.error('[Afdian Webhook] Amount verification failed!', {
            expected: expectedPrice,
            got: orderAmount,
            diff: priceDiff,
            tolerance,
            credits
          });
          return NextResponse.json({ 
            ec: 400, 
            em: 'amount verification failed' 
          }, { status: 400 });
        }
        
        console.log('[Afdian Webhook] Amount validation passed:', { amount: orderAmount, credits, expected: expectedPrice });
        
        // P0: 使用数据库函数实现原子性事务（防止并发竞争）
        // 调用存储过程处理订单创建和积分更新
        const { data: result, error: processError } = await supabaseAdmin
          .rpc('process_credit_order', {
            p_user_id: userId,
            p_out_trade_no: data.order.remark || tradeNo,
            p_trade_no: tradeNo,
            p_amount: orderAmount,
            p_credits: credits,
            p_provider: 'afdian',
            p_payment_info: data.order
          });
        
        if (processError) {
          console.error('[Afdian Webhook] Failed to process order:', processError);
          
          // 检查是否是重复订单
          if (processError.message?.includes('already exists') || processError.code === '23505') {
            console.log('[Afdian Webhook] Duplicate order detected, treating as success');
            return NextResponse.json({ ec: 200, em: 'order already exists' });
          }
          
          // 检查是否是用户不存在
          if (processError.message?.includes('not found')) {
            return NextResponse.json({ 
              ec: 400, 
              em: 'user not found' 
            }, { status: 400 });
          }
          
          return NextResponse.json({ 
            ec: 500, 
            em: 'failed to process order' 
          }, { status: 500 });
        }
        
        console.log('[Afdian Webhook] Order processed successfully:', {
          order_id: result?.order_id,
          old_credits: result?.old_credits,
          new_credits: result?.new_credits
        });
        
      } else {
        // 订单已存在但未支付，更新为已支付
        console.log('[Afdian Webhook] Updating existing order:', order.id);
        
        // 先验证用户是否存在
        const { data: userProfile, error: userCheckError } = await supabaseAdmin
          .from('profiles')
          .select('id, credits')
          .eq('id', order.user_id)
          .single();
        
        if (userCheckError || !userProfile) {
          console.error('[Afdian Webhook] User profile not found:', order.user_id, userCheckError);
          return NextResponse.json({ 
            ec: 400, 
            em: 'user not found' 
          }, { status: 400 });
        }
        
        // 更新订单状态
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
        
        // 更新用户积分
        const oldCredits = userProfile.credits || 0;
        const newCredits = oldCredits + order.credits;
        
        const { error: creditError } = await supabaseAdmin
          .from('profiles')
          .update({ credits: newCredits })
          .eq('id', order.user_id);
        
        if (creditError) {
          console.error('[Afdian Webhook] CRITICAL: Failed to update credits for order:', order.id, creditError);
          // 积分更新失败，将订单状态改为 pending_credits
          await supabaseAdmin
            .from('credit_orders')
            .update({ status: 'pending_credits' })
            .eq('id', order.id);
          
          return NextResponse.json({ 
            ec: 500, 
            em: 'credit update failed, will retry' 
          }, { status: 500 });
        }
        
        console.log('[Afdian Webhook] Credits updated:', oldCredits, '->', newCredits);
      }
    }
    return NextResponse.json({ ec: 200, em: 'success' });

  } catch (error) {
    console.error('[Afdian Webhook] Error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ ec: 500, em: 'internal server error' }, { status: 500 });
  }
}
