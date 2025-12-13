import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 这个 API 在 Vercel 上运行，使用 Puppeteer 会有限制
// 因此我们使用一个轻量级的方案：将 HTML 渲染到 canvas 然后截图
// 但更实际的方案是：在客户端生成封面图后上传

export async function POST(request: NextRequest) {
  try {
    const { itemId, coverDataUrl } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    }

    if (!coverDataUrl) {
      return NextResponse.json({ error: 'Missing coverDataUrl' }, { status: 400 });
    }

    // 验证 data URL 格式
    if (!coverDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image data URL' }, { status: 400 });
    }

    // 使用 service role key 来绕过 RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 将 data URL 转换为 Buffer
    const base64Data = coverDataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // 确定文件类型
    const mimeMatch = coverDataUrl.match(/data:image\/(\w+);/);
    const fileExt = mimeMatch ? mimeMatch[1] : 'png';
    const fileName = `covers/${itemId}.${fileExt}`;

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('icons')
      .upload(fileName, buffer, {
        contentType: `image/${fileExt}`,
        upsert: true // 覆盖已存在的文件
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload cover image' }, { status: 500 });
    }

    // 获取公开 URL（添加时间戳防止缓存）
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('icons')
      .getPublicUrl(fileName);
    
    // 添加时间戳参数来破坏浏览器和 CDN 缓存
    const coverUrlWithCache = `${publicUrl}?t=${Date.now()}`;

    // 更新数据库中的 cover_url
    const { error: updateError } = await supabaseAdmin
      .from('items')
      .update({ cover_url: coverUrlWithCache })
      .eq('id', itemId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update cover_url' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      cover_url: coverUrlWithCache 
    });

  } catch (error: any) {
    console.error('Generate cover error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
