// GET /api/cms/history?app_id=xxx
// 需要用户登录验证 - 获取发布历史

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
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
    
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
    
    // 获取发布历史
    const { data, error } = await supabase
      .from('publish_history')
      .select('id, version, content_hash, published_at')
      .eq('app_id', app_id)
      .order('version', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[CMS History Error]', error);
      throw error;
    }
    
    // 获取当前版本
    const { data: current } = await supabase
      .from('public_content')
      .select('version')
      .eq('app_id', app_id)
      .single();
    
    return NextResponse.json({
      current_version: current?.version || 0,
      history: data || []
    });
    
  } catch (error: any) {
    console.error('[CMS History Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}

// POST /api/cms/history - 回滚到历史版本
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
    
    const { app_id, version } = await req.json();
    
    if (!app_id || version === undefined) {
      return NextResponse.json(
        { error: 'Missing app_id or version' }, 
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
    
    // 获取历史版本内容
    const { data: historyData, error: historyError } = await supabase
      .from('publish_history')
      .select('content, content_hash')
      .eq('app_id', app_id)
      .eq('version', version)
      .single();
    
    if (historyError || !historyData) {
      return NextResponse.json(
        { error: 'Version not found' }, 
        { status: 404 }
      );
    }
    
    // 获取当前版本号
    const { data: current } = await supabase
      .from('public_content')
      .select('version')
      .eq('app_id', app_id)
      .single();
    
    const newVersion = (current?.version || 0) + 1;
    
    // 恢复到历史版本（创建新版本）
    const { data, error } = await supabase
      .from('public_content')
      .upsert({
        app_id,
        content: historyData.content,
        version: newVersion,
        content_hash: historyData.content_hash,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'app_id'
      })
      .select()
      .single();
    
    if (error) {
      console.error('[CMS Rollback Error]', error);
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      message: `Rolled back to version ${version}`,
      new_version: data.version,
      published_at: data.published_at
    });
    
  } catch (error: any) {
    console.error('[CMS Rollback Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}
