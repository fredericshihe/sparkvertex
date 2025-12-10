// POST /api/cms/publish
// 需要用户登录验证 - 将本地内容发布到云端

import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const APP_ID_REGEX = /^app_[a-f0-9-]+_[a-f0-9-]+$/;
const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

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
    
    const { app_id, content, content_hash } = await req.json();
    
    if (!app_id || !content) {
      return NextResponse.json(
        { error: 'Missing app_id or content' }, 
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
    
    // 内容大小限制
    const contentStr = JSON.stringify(content);
    if (contentStr.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: `Content too large (max ${MAX_CONTENT_SIZE / 1024}KB)` }, 
        { status: 413 }
      );
    }
    
    // 计算内容哈希（如果未提供）
    const computedHash = content_hash || 
      crypto.createHash('sha256').update(contentStr).digest('hex');
    
    // 获取当前版本号
    const { data: existing } = await supabase
      .from('public_content')
      .select('version')
      .eq('app_id', app_id)
      .single();
    
    const newVersion = (existing?.version || 0) + 1;
    
    // Upsert 公开内容
    const { data, error } = await supabase
      .from('public_content')
      .upsert({
        app_id,
        content,
        version: newVersion,
        content_hash: computedHash,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'app_id'
      })
      .select()
      .single();
    
    if (error) {
      console.error('[CMS Publish Error]', error);
      throw error;
    }
    
    // 更新用量统计
    const { error: statError } = await supabase.rpc('increment_usage_stat', {
      p_user_id: user.id,
      p_app_id: app_id,
      p_stat_type: 'cms_publish',
      p_count: 1,
      p_bytes: contentStr.length
    });
    
    if (statError) {
      console.error('Failed to increment usage stat:', statError);
    }
    
    // 构建公开访问 URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sparkvertex.com';
    const publicUrl = `${siteUrl}/api/cms/content/${app_id}`;
    
    return NextResponse.json({
      success: true,
      version: data.version,
      content_hash: computedHash,
      published_at: data.published_at,
      public_url: publicUrl
    });
    
  } catch (error: any) {
    console.error('[CMS Publish Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}
