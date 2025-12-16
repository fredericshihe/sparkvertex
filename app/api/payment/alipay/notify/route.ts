import { NextRequest, NextResponse } from 'next/server';
import { getAlipaySdk } from '@/lib/alipay';
import { createSafeClient } from '@/lib/supabase-server-safe';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AlipayNotify');

/**
 * 支付宝异步通知接口
 * 文档: https://opendocs.alipay.com/open/270/105902
 * 
 * 通知参数包括:
 * - out_trade_no: 商户订单号
 * - trade_no: 支付宝交易号
 * - trade_status: 交易状态 (TRADE_SUCCESS/TRADE_FINISHED)
 * - total_amount: 订单金额
 * - buyer_pay_amount: 买家实付金额
 * 
 * 验证签名后处理订单
 */
export async function POST(req: NextRequest) {
  try {
    // 获取所有 POST 参数
    const formData = await req.formData();
    const params: Record<string, string> = {};
    
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    logger.info('收到支付宝通知:', {
      out_trade_no: params.out_trade_no,
      trade_status: params.trade_status,
      total_amount: params.total_amount,
    });

    // 1. 验证签名
    const alipay = getAlipaySdk();
    const isValid = alipay.checkNotifySign(params);

    if (!isValid) {
      logger.error('签名验证失败');
      return new NextResponse('fail', { status: 400 });
    }

    // 2. 提取关键参数
    const {
      out_trade_no,      // 商户订单号
      trade_no,          // 支付宝交易号
      trade_status,      // 交易状态
      total_amount,      // 订单金额
      buyer_pay_amount,  // 买家实付金额
    } = params;

    // 3. 使用 admin 客户端查询订单
    const supabaseAdmin = createSafeClient();
    const { data: order, error: orderError } = await supabaseAdmin
      .from('credit_orders')
      .select('*')
      .eq('out_trade_no', out_trade_no)
      .single();

    if (orderError || !order) {
      logger.error('订单不存在:', out_trade_no);
      return new NextResponse('fail', { status: 404 });
    }

    // 4. 检查订单是否已处理
    if (order.status === 'completed' || order.status === 'paid') {
      logger.info('订单已处理，跳过:', out_trade_no);
      return new NextResponse('success');
    }

    // 5. 验证金额
    const paidAmount = parseFloat(buyer_pay_amount || total_amount);
    if (Math.abs(paidAmount - order.amount) > 0.01) {
      logger.error('金额不匹配:', {
        expected: order.amount,
        received: paidAmount,
      });
      return new NextResponse('fail', { status: 400 });
    }

    // 6. 处理不同的交易状态
    if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
      // 支付成功，开始处理订单
      logger.info('支付成功，开始充值:', {
        orderId: out_trade_no,
        userId: order.user_id,
        credits: order.credits,
      });

      // 更新订单状态
      const { error: orderUpdateError } = await supabaseAdmin
        .from('credit_orders')
        .update({ 
          status: 'paid',
          trade_no,
          payment_info: params,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (orderUpdateError) {
        logger.error('更新订单失败:', orderUpdateError);
        return new NextResponse('fail', { status: 500 });
      }

      // 更新用户积分
      const { error: creditsError } = await supabaseAdmin
        .from('profiles')
        .update({ 
          credits: supabaseAdmin.rpc('increment_credits', { amount: order.credits }),
        })
        .eq('id', order.user_id);

      // 或者使用 RPC 增加积分
      const { error: rpcError } = await supabaseAdmin.rpc('add_credits', {
        p_user_id: order.user_id,
        p_credits: order.credits,
      });

      if (rpcError) {
        // 如果 RPC 不存在，直接更新
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('credits')
          .eq('id', order.user_id)
          .single();
        
        if (profile) {
          await supabaseAdmin
            .from('profiles')
            .update({ 
              credits: (profile.credits || 0) + order.credits,
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.user_id);
        }
      }

      logger.info('充值成功:', {
        orderId: out_trade_no,
        userId: order.user_id,
        credits: order.credits,
      });

      return new NextResponse('success');
    } 
    else if (trade_status === 'TRADE_CLOSED') {
      // 交易关闭
      await supabaseAdmin
        .from('credit_orders')
        .update({ 
          status: 'failed',
          trade_no,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      logger.info('交易关闭:', out_trade_no);
      return new NextResponse('success');
    }
    else {
      // 其他状态暂不处理
      logger.info('未处理的交易状态:', trade_status);
      return new NextResponse('success');
    }

  } catch (error) {
    logger.error('处理通知失败:', error);
    return new NextResponse('fail', { status: 500 });
  }
}

// 允许 GET 请求（用于测试）
export async function GET() {
  return NextResponse.json({
    message: '支付宝异步通知接口',
    method: 'POST',
  });
}
