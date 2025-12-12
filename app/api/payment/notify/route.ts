import { createSafeClient } from '@/lib/supabase-server-safe';
import { NextResponse } from 'next/server';
import { getAlipaySdk } from '@/lib/alipay';
import { createLogger } from '@/lib/logger';

const logger = createLogger('PaymentNotify');

export async function POST(request: Request) {
  try {
    // 1. 获取支付宝 POST 过来的数据
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = String(value);
    });

    // 2. 验签
    const checkResult = getAlipaySdk().checkNotifySign(params);
    if (!checkResult) {
      logger.error('支付宝验签失败');
      return new NextResponse('fail', { status: 400 });
    }

    // 3. 检查交易状态
    const tradeStatus = params.trade_status;
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      const outTradeNo = params.out_trade_no;
      const tradeNo = params.trade_no;
      
      // 验证金额（防止篡改）
      const totalAmount = parseFloat(params.total_amount || '0');
      if (totalAmount <= 0) {
        logger.error('Invalid payment amount:', totalAmount);
        return new NextResponse('fail', { status: 400 });
      }

      // 初始化 Supabase Admin 客户端
      const supabaseAdmin = createSafeClient();
      
      // 4. 查询订单
      const { data: order, error: fetchError } = await supabaseAdmin
        .from('credit_orders')
        .select('*')
        .eq('out_trade_no', outTradeNo)
        .single();

      if (fetchError || !order) {
        logger.warn('Order not found:', outTradeNo);
        return new NextResponse('success'); // 订单不存在，返回 success 停止重试
      }

      // 验证订单金额与支付金额是否匹配
      if (Math.abs(order.amount - totalAmount) > 0.01) {
        logger.error('Payment amount mismatch:', { expected: order.amount, received: totalAmount });
        return new NextResponse('fail', { status: 400 });
      }

      if (order.status === 'pending') {
        // 5. 使用事务更新订单状态和用户积分
        // 先更新订单状态
        const { error: updateError } = await supabaseAdmin
          .from('credit_orders')
          .update({ 
            status: 'paid',
            trade_no: tradeNo,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id)
          .eq('status', 'pending'); // 乐观锁，防止重复处理

        if (updateError) {
          logger.error('Failed to update order status:', updateError);
          return new NextResponse('fail', { status: 500 });
        }

        // 6. 使用 RPC 原子更新用户积分（避免并发问题）
        const { error: creditError } = await supabaseAdmin.rpc('increment_user_credits', {
          p_user_id: order.user_id,
          p_amount: order.credits
        });

        // 如果 RPC 不存在，回退到普通更新
        if (creditError) {
          logger.warn('RPC increment_user_credits not available, using fallback');
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('credits')
            .eq('id', order.user_id)
            .single();
            
          if (profile) {
            const newCredits = (profile.credits || 0) + order.credits;
            await supabaseAdmin
              .from('profiles')
              .update({ credits: newCredits })
              .eq('id', order.user_id);
          }
        }
        
        logger.info('Payment processed successfully:', { orderId: order.id, credits: order.credits });
      }
    }

    return new NextResponse('success');

  } catch (error) {
    logger.error('Notify Error:', error);
    return new NextResponse('fail', { status: 500 });
  }
}
