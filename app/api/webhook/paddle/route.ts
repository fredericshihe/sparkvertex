import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSafeClient } from '@/lib/supabase-server-safe';
import { PRICE_CREDITS_MAP, PADDLE_CONFIG } from '@/lib/paddle';

export const dynamic = 'force-dynamic';

/**
 * Paddle Webhook 处理
 * 文档: https://developer.paddle.com/webhooks/overview
 * 
 * 支持的事件:
 * - transaction.completed: 交易完成，用户支付成功
 * - transaction.paid: 交易已支付（可选，通常使用 completed）
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createSafeClient();

    // 1. 获取请求体和签名
    const rawBody = await req.text();
    const signature = req.headers.get('paddle-signature');

    if (!signature) {
      console.error('[Paddle Webhook] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    // 2. 验证签名
    const webhookSecret = PADDLE_CONFIG.WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Paddle Webhook] PADDLE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const isValid = verifyPaddleSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error('[Paddle Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. 解析事件
    const event = JSON.parse(rawBody);
    console.log('[Paddle Webhook] Received event:', event.event_type);

    // 4. 处理事件
    if (event.event_type === 'transaction.completed' || event.event_type === 'transaction.paid') {
      return await handleTransactionCompleted(event, supabaseAdmin);
    }

    // 其他事件直接返回成功
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Paddle Webhook] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * 验证 Paddle Webhook 签名
 * https://developer.paddle.com/webhooks/signature-verification
 */
function verifyPaddleSignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    // 解析签名头: ts=TIMESTAMP;h1=SIGNATURE
    const parts = signature.split(';').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts.ts;
    const expectedSignature = parts.h1;

    if (!timestamp || !expectedSignature) {
      return false;
    }

    // 构建待签名字符串
    const signedPayload = `${timestamp}:${rawBody}`;

    // 计算 HMAC-SHA256
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const computedSignature = hmac.digest('hex');

    // 比较签名
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(computedSignature)
    );
  } catch (error) {
    console.error('[Paddle Webhook] Signature verification error:', error);
    return false;
  }
}

/**
 * 处理交易完成事件
 */
async function handleTransactionCompleted(event: any, supabaseAdmin: ReturnType<typeof createSafeClient>): Promise<NextResponse> {
  const data = event.data;
  const transactionId = data.id;
  const customData = data.custom_data || {};
  const userId = customData.user_id;

  console.log('[Paddle Webhook] Transaction completed:', {
    transactionId,
    userId,
    status: data.status,
    items: data.items,
  });

  // 检查必要数据
  if (!userId) {
    console.error('[Paddle Webhook] Missing user_id in custom_data');
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  // 获取购买的商品信息
  const items = data.items || [];
  if (items.length === 0) {
    console.error('[Paddle Webhook] No items in transaction');
    return NextResponse.json({ error: 'No items' }, { status: 400 });
  }

  // 获取 price_id 并计算积分
  const priceId = items[0]?.price?.id;
  const creditsToAdd = PRICE_CREDITS_MAP[priceId];

  if (!creditsToAdd) {
    console.error('[Paddle Webhook] Unknown price_id:', priceId);
    return NextResponse.json({ error: 'Unknown price' }, { status: 400 });
  }

  // 检查订单是否已处理
  const { data: existingOrder } = await supabaseAdmin
    .from('credit_orders')
    .select('id')
    .eq('out_trade_no', transactionId)
    .single();

  if (existingOrder) {
    console.log(`[Paddle Webhook] Transaction ${transactionId} already processed.`);
    return NextResponse.json({ received: true, message: 'Already processed' });
  }

  // 获取金额
  const totalAmount = data.details?.totals?.total 
    ? parseFloat(data.details.totals.total) / 100 // Paddle 返回的是最小货币单位
    : 0;

  // 创建订单记录
  const { error: insertError } = await supabaseAdmin
    .from('credit_orders')
    .insert({
      user_id: userId,
      out_trade_no: transactionId,
      trade_no: data.invoice_id || transactionId,
      amount: totalAmount,
      credits: creditsToAdd,
      status: 'paid',
      provider: 'paddle',
      payment_info: event,
      metadata: {
        price_id: priceId,
        customer_id: data.customer_id,
        currency: data.currency_code,
        email: customData.email,
      }
    });

  if (insertError) {
    console.error('[Paddle Webhook] Failed to insert order:', insertError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // 增加用户积分
  const { error: creditError } = await supabaseAdmin.rpc('increment_user_credits', {
    p_user_id: userId,
    p_amount: creditsToAdd
  });

  if (creditError) {
    console.error('[Paddle Webhook] Failed to add credits:', creditError);
    // 订单已记录，即使积分添加失败也返回成功，避免 Paddle 重试
    // 后续可通过后台手动处理
  }

  console.log(`[Paddle Webhook] Successfully added ${creditsToAdd} credits to user ${userId}`);
  return NextResponse.json({ received: true, credits: creditsToAdd });
}
