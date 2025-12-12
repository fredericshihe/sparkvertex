// GET /api/mailbox/sync?app_id=xxx
// 需要用户登录验证 - 拉取未处理的加密消息

import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const since = searchParams.get('since'); // ISO timestamp
    
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
    
    // 构建查询
    let query = supabase
      .from('inbox_messages')
      .select('id, encrypted_payload, metadata, created_at')
      .eq('app_id', app_id)
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    // 如果提供了 since 参数，只获取该时间之后的消息
    if (since) {
      query = query.gt('created_at', since);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[Mailbox Sync Error]', error);
      throw error;
    }
    
    // 获取未处理消息总数
    const { count } = await supabase
      .from('inbox_messages')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', app_id)
      .eq('processed', false);
    
    return NextResponse.json({
      messages: data || [],
      total_pending: count || 0,
      has_more: (count || 0) > limit
    });
    
  } catch (error: any) {
    console.error('[Mailbox Sync Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}
