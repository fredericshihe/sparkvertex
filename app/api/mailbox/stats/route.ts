// GET /api/mailbox/stats?app_id=xxx
// 需要用户登录验证 - 获取信箱统计信息

import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const APP_ID_REGEX = /^app_[a-f0-9-]+_[a-f0-9-]+$/;

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get('app_id');
    
    if (!app_id) {
      return NextResponse.json(
        { error: 'Missing app_id' }, 
        { status: 400 }
      );
    }
    
    // 校验 app_id 格式
    if (!APP_ID_REGEX.test(app_id)) {
      return NextResponse.json(
        { error: 'Invalid app_id format' }, 
        { status: 400 }
      );
    }
    
    // 验证用户是否拥有此应用
    const expectedPrefix = `app_${user.id}_`;
    if (!app_id.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: 'Forbidden' }, 
        { status: 403 }
      );
    }
    
    // 获取统计数据
    const [
      { count: totalMessages },
      { count: pendingMessages },
      { count: processedMessages }
    ] = await Promise.all([
      supabase
        .from('inbox_messages')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', app_id),
      supabase
        .from('inbox_messages')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', app_id)
        .eq('processed', false),
      supabase
        .from('inbox_messages')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', app_id)
        .eq('processed', true)
    ]);
    
    // 获取最近消息时间
    const { data: latestMessage } = await supabase
      .from('inbox_messages')
      .select('created_at')
      .eq('app_id', app_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    // 获取本月用量
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { data: usageStats } = await supabase
      .from('usage_stats')
      .select('count, bytes_used')
      .eq('app_id', app_id)
      .eq('stat_type', 'inbox_message')
      .gte('period_start', `${currentMonth}-01`)
      .single();
    
    return NextResponse.json({
      app_id,
      stats: {
        total: totalMessages || 0,
        pending: pendingMessages || 0,
        processed: processedMessages || 0,
        latest_message_at: latestMessage?.created_at || null
      },
      usage: {
        messages_this_month: usageStats?.count || 0,
        bytes_this_month: usageStats?.bytes_used || 0
      }
    });
    
  } catch (error: any) {
    console.error('[Mailbox Stats Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}
