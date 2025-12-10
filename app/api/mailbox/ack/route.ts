// POST /api/mailbox/ack
// 需要用户登录验证 - 确认消息已接收处理

import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }
    
    const { message_ids, app_id } = await req.json();
    
    // 支持单个 message_id 或数组
    const ids = message_ids || [];
    const messageIdList = Array.isArray(ids) ? ids : [ids];
    
    if (messageIdList.length === 0) {
      return NextResponse.json(
        { error: 'Missing message_ids' }, 
        { status: 400 }
      );
    }
    
    // 限制单次确认数量
    if (messageIdList.length > 100) {
      return NextResponse.json(
        { error: 'Too many message_ids (max 100)' }, 
        { status: 400 }
      );
    }
    
    // 验证用户是否拥有这些消息的应用
    const expectedPrefix = `app_${user.id}_`;
    
    // 方式1: 如果提供了 app_id，直接验证
    if (app_id && !app_id.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: 'Forbidden' }, 
        { status: 403 }
      );
    }
    
    // 批量更新消息状态
    const { data, error } = await supabase
      .from('inbox_messages')
      .update({ processed: true })
      .in('id', messageIdList)
      .like('app_id', `${expectedPrefix}%`) // 确保只更新用户自己的消息
      .select('id');
    
    if (error) {
      console.error('[Mailbox Ack Error]', error);
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      acknowledged: data?.length || 0
    });
    
  } catch (error: any) {
    console.error('[Mailbox Ack Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}
