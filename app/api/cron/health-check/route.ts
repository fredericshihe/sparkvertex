/**
 * P2: 支付系统健康检查和异常监控
 * 
 * 使用 Vercel Cron 或手动触发
 * 配置: vercel.json 中添加 cron 配置
 * 
 * Cron Expression: "*/15 * * * *" (每15分钟执行一次)
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 方式 1: Vercel Cron Secret 验证（生产环境自动添加）
    const authHeader = request.headers.get('authorization');
    
    // 方式 2: 自定义 CRON_SECRET 验证（用于手动测试）
    const cronSecret = process.env.CRON_SECRET;
    
    // Vercel Cron 会自动添加签名，格式: Bearer <vercel-cron-signature>
    // 本地测试时使用自定义 CRON_SECRET
    const isVercelCron = authHeader?.startsWith('Bearer ') && authHeader.length > 50;
    const isManualTest = cronSecret && authHeader === `Bearer ${cronSecret}`;
    
    if (!isVercelCron && !isManualTest) {
      console.log('[Cron] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 初始化 Supabase Admin 客户端
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ 
        error: 'Supabase configuration missing' 
      }, { status: 500 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('[Cron Health Check] Checking payment system health...');

    // 查询健康监控视图
    const { data: health, error } = await supabaseAdmin
      .from('payment_health_monitor')
      .select('*')
      .single();

    if (error) {
      console.error('[Cron Health Check] Error:', error);
      return NextResponse.json({ 
        error: 'Failed to check health',
        details: error.message
      }, { status: 500 });
    }

    // 检查异常情况
    const alerts: string[] = [];

    if (health.stale_pending_orders > 10) {
      alerts.push(`⚠️ ${health.stale_pending_orders} pending orders older than 1 hour`);
    }

    if (health.pending_credit_orders > 5) {
      alerts.push(`🚨 ${health.pending_credit_orders} orders with pending credits`);
    }

    if (health.success_rate_last_hour < 80 && health.recent_orders > 10) {
      alerts.push(`📉 Success rate dropped to ${health.success_rate_last_hour}%`);
    }

    // 如果有严重问题，可以在这里发送告警
    if (alerts.length > 0) {
      console.warn('[Cron Health Check] ALERTS:', alerts);
      
      // TODO: 集成告警系统（钉钉、Slack、邮件等）
      // await sendAlert(alerts);
    }

    console.log('[Cron Health Check] Health status:', {
      status: alerts.length === 0 ? 'healthy' : 'warning',
      ...health
    });

    return NextResponse.json({
      status: alerts.length === 0 ? 'healthy' : 'warning',
      alerts,
      metrics: health,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Cron Health Check] Exception:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
