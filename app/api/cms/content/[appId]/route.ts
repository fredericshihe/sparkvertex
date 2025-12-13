// GET /api/cms/content/[appId]
// 公开接口 - 返回已发布的内容 (带 CDN 缓存)

import { createSafeClient } from '@/lib/supabase-server-safe';
import { NextResponse } from 'next/server';

const APP_ID_REGEX = /^app_[a-f0-9-]+_[a-f0-9-]+$/;

export async function GET(
  req: Request,
  { params }: { params: { appId: string } }
) {
  const supabase = createSafeClient();
  try {
    const { appId } = params;
    
    // 校验 app_id 格式
    if (!APP_ID_REGEX.test(appId)) {
      return NextResponse.json(
        { error: 'Invalid app_id' }, 
        { status: 400 }
      );
    }
    
    // 检查是否请求特定版本
    const { searchParams } = new URL(req.url);
    const version = searchParams.get('version');
    
    let data;
    let error;
    
    if (version) {
      // 从历史记录获取特定版本
      const result = await supabase
        .from('publish_history')
        .select('content, version, published_at')
        .eq('app_id', appId)
        .eq('version', parseInt(version))
        .single();
      
      data = result.data;
      error = result.error;
    } else {
      // 获取最新版本
      const result = await supabase
        .from('public_content')
        .select('content, version, published_at, content_hash')
        .eq('app_id', appId)
        .single();
      
      data = result.data;
      error = result.error;
    }
    
    if (error || !data) {
      return NextResponse.json(
        { error: 'Content not found' }, 
        { status: 404 }
      );
    }
    
    // 设置缓存头
    // CDN 缓存 5 分钟，浏览器缓存 1 分钟
    // 使用 stale-while-revalidate 提高性能
    const headers: HeadersInit = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      'CDN-Cache-Control': 'public, max-age=300',
      'Vercel-CDN-Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // 如果有 content_hash，添加 ETag
    if ((data as any).content_hash) {
      headers['ETag'] = `"${(data as any).content_hash}"`;
    }
    
    return NextResponse.json(data, { headers });
    
  } catch (error: any) {
    console.error('[CMS Content Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}

// 支持 CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
