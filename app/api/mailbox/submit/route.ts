// POST /api/mailbox/submit
// 公开接口，任何人都可以调用 - 用于表单数据加密投递

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 简单的内存限流器
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkSimpleRateLimit(key: string, maxRequests: number, windowSeconds: number): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

// App ID 格式校验 - 支持多种格式：
// 1. 已发布: app_{user_id}_{item_id} (例如: app_abc123_def456)
// 2. 草稿/预览: draft_{user_id} 或 draft_{user_id}_{session_id} (例如: draft_abc123_xyz789)
// 3. 纯数字 ID: 1, 123, 387 等 (数据库中的 item.id)
// 注意：允许下划线和连字符，以支持 UUID 和 Session ID (Session ID 可能包含字母)
const APP_ID_REGEX = /^(app_[a-f0-9-]+_[a-f0-9-]+|draft_[a-zA-Z0-9-_]+|\d+)$/;

// CORS 头 - 允许 iframe 跨域调用
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function POST(req: Request) {
  try {
    const { app_id, payload, metadata } = await req.json();
    
    // 基本校验
    if (!app_id || !payload) {
      return NextResponse.json(
        { error: 'Missing app_id or payload' }, 
        { status: 400, headers: corsHeaders }
      );
    }
    
    // 校验 app_id 格式 - 支持多种格式
    // APP_ID_REGEX 已经支持: app_xxx_xxx, draft_xxx, 纯数字
    if (!APP_ID_REGEX.test(app_id)) {
      // 兼容旧格式 UUID (例如: abc123-def456-...)
      if (!/^[a-f0-9-]{20,}$/.test(app_id)) {
        return NextResponse.json(
          { error: 'Invalid app_id format' }, 
          { status: 400, headers: corsHeaders }
        );
      }
    }
    
    // Payload 大小限制 (100KB)
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (payloadStr.length > 100 * 1024) {
      return NextResponse.json(
        { error: 'Payload too large (max 100KB)' }, 
        { status: 413, headers: corsHeaders }
      );
    }
    
    // 限流检查 (每分钟最多 60 次投递)
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateLimitKey = `mailbox:${app_id}:${clientIP}`;
    
    if (!checkSimpleRateLimit(rateLimitKey, 60, 60)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' }, 
        { status: 429, headers: corsHeaders }
      );
    }
    
    // 写入数据库
    console.log('[Mailbox Submit] Inserting message for app_id:', app_id);
    
    const { data: insertedData, error } = await supabase
      .from('inbox_messages')
      .insert({
        app_id,
        encrypted_payload: payloadStr,
        metadata: {
          ...metadata,
          ip: clientIP,
          user_agent: req.headers.get('user-agent')?.slice(0, 200),
          submitted_at: new Date().toISOString()
        }
      })
      .select()
      .single();
    
    if (error) {
      console.error('[Mailbox Submit Error]', error);
      throw error;
    }
    
    console.log('[Mailbox Submit] Successfully inserted:', insertedData?.id);
    
    // 更新用量统计 (忽略错误，不影响主流程)
    // 对于 draft_{userId}_{sessionId} 格式，我们需要正确提取 userId
    let userId = '';
    if (app_id.startsWith('draft_')) {
      const parts = app_id.split('_');
      // parts[0] is 'draft'
      // parts[1] is userId (or 'guest')
      // parts[2] might be sessionId
      userId = parts[1];
    } else {
      // app_{userId}_{itemId}
      userId = app_id.split('_')[1];
    }

    if (userId && userId !== 'guest') {
      try {
        await supabase.rpc('increment_usage_stat', {
          p_user_id: userId,
          p_app_id: app_id,
          p_stat_type: 'inbox_message',
          p_count: 1,
          p_bytes: payloadStr.length
        });
      } catch (e) {
        // 忽略统计更新失败，可能是 RPC 不存在
        console.warn('[Usage stat update failed]', e);
      }
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Data submitted successfully'
    }, {
      headers: corsHeaders
    });
    
  } catch (error: any) {
    console.error('[Mailbox Submit Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500, headers: corsHeaders }
    );
  }
}

// 支持 CORS (允许从生成的应用调用)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
