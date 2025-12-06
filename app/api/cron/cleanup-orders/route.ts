/**
 * P1: 定期清理过期未支付订单
 * 
 * 使用 Vercel Cron 或手动触发
 * 配置: vercel.json 中添加 cron 配置
 * 
 * Cron Expression: "0 2 * * *" (每天凌晨2点执行)
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

    console.log('[Cron Cleanup Orders] Starting cleanup job...');

    // 调用数据库函数清理过期订单
    const { data, error } = await supabaseAdmin.rpc('cleanup_expired_orders');

    if (error) {
      console.error('[Cron Cleanup Orders] Error:', error);
      return NextResponse.json({ 
        error: 'Failed to cleanup orders',
        details: error.message
      }, { status: 500 });
    }

    console.log('[Cron Cleanup Orders] Completed:', data);

    return NextResponse.json({
      success: true,
      ...data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Cron Cleanup Orders] Exception:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
