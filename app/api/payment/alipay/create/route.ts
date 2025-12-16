import { NextRequest, NextResponse } from 'next/server';
import { getAlipaySdk } from '@/lib/alipay';
import { createClient } from '@/lib/supabase-server';
import { createSafeClient } from '@/lib/supabase-server-safe';
import { ALIPAY_CREDIT_PACKAGES, type CreditPackage } from '@/lib/alipay-config';

/**
 * 创建支付宝支付订单 - 电脑网站支付
 * API: alipay.trade.page.pay
 * 文档: https://opendocs.alipay.com/open/270/105898
 */
export async function POST(req: NextRequest) {
  try {
    const { packageId } = await req.json();

    if (!packageId) {
      return NextResponse.json(
        { error: '缺少套餐ID' },
        { status: 400 }
      );
    }

    // 查找套餐
    const selectedPackage: CreditPackage | undefined = ALIPAY_CREDIT_PACKAGES.find(
      (pkg: CreditPackage) => pkg.id === packageId
    );

    if (!selectedPackage) {
      return NextResponse.json(
        { error: '套餐不存在' },
        { status: 400 }
      );
    }

    // 使用服务端 Supabase 客户端获取当前用户
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    // 生成订单号 (时间戳 + 随机数)
    const outTradeNo = `AL${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // 使用 admin 客户端
    const supabaseAdmin = createSafeClient();

    // 先取消该用户之前的待处理订单（相同金额和provider）
    await supabaseAdmin
      .from('credit_orders')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('amount', selectedPackage.price)
      .eq('provider', 'alipay')
      .eq('status', 'pending');

    // 创建新订单
    const { data: order, error: dbError } = await supabaseAdmin
      .from('credit_orders')
      .insert({
        user_id: user.id,
        out_trade_no: outTradeNo,
        amount: selectedPackage.price,
        credits: selectedPackage.credits,
        status: 'pending',
        provider: 'alipay',
        metadata: { package_id: packageId },
      })
      .select()
      .single();

    if (dbError || !order) {
      console.error('[Alipay Create] Database error:', dbError);
      return NextResponse.json(
        { error: '创建订单失败' },
        { status: 500 }
      );
    }

    // 初始化支付宝 SDK
    const alipay = getAlipaySdk();

    // 构建业务参数
    const bizContent = {
      out_trade_no: outTradeNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: selectedPackage.price.toFixed(2),
      subject: `SparkVertex 积分充值 - ${selectedPackage.credits}积分`,
      body: `购买${selectedPackage.credits}积分套餐`,
    };

    // 使用 pageExecute 方法，传入 'GET' 直接返回 URL
    const paymentUrl = alipay.pageExecute('alipay.trade.page.pay', 'GET', {
      notify_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payment/alipay/notify`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile?payment=success`,
      bizContent,
    });

    console.log('[Alipay Create] Order created:', {
      orderId: outTradeNo,
      amount: selectedPackage.price,
      credits: selectedPackage.credits,
      paymentUrl: paymentUrl?.substring(0, 100) + '...',
    });

    return NextResponse.json({
      success: true,
      paymentUrl,
      orderId: outTradeNo,
    });

  } catch (error) {
    console.error('[Alipay Create] Error:', error);
    return NextResponse.json(
      { error: '创建支付订单失败' },
      { status: 500 }
    );
  }
}
