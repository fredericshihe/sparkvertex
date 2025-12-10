// POST /api/cms/upload
// 需要用户登录验证 - 管理员上传公开资源到 public-assets 桶

import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const APP_ID_REGEX = /^app_[a-f0-9-]+_[a-f0-9-]+$/;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// 允许的 MIME 类型
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/pdf'
];

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    
    // 验证登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const appId = formData.get('app_id') as string;
    const folder = formData.get('folder') as string | null; // 可选的子文件夹
    
    if (!file || !appId) {
      return NextResponse.json(
        { error: 'Missing file or app_id' }, 
        { status: 400 }
      );
    }
    
    // 校验 app_id 格式
    if (!APP_ID_REGEX.test(appId)) {
      return NextResponse.json(
        { error: 'Invalid app_id format' }, 
        { status: 400 }
      );
    }
    
    // 校验所有权
    const expectedPrefix = `app_${user.id}_`;
    if (!appId.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: 'Forbidden' }, 
        { status: 403 }
      );
    }
    
    // 限制文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 
        { status: 413 }
      );
    }
    
    // 验证 MIME 类型
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type}` }, 
        { status: 415 }
      );
    }
    
    // 生成唯一路径 (保留原始扩展名)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    
    // 构建路径
    let path: string;
    if (folder) {
      // 清理文件夹名称
      const cleanFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '');
      path = `${appId}/${cleanFolder}/${timestamp}_${randomId}.${ext}`;
    } else {
      path = `${appId}/${timestamp}_${randomId}.${ext}`;
    }
    
    // 读取文件内容
    const fileBuffer = await file.arrayBuffer();
    
    // 上传到 public-assets 桶
    const { data, error } = await supabase.storage
      .from('public-assets')
      .upload(path, fileBuffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: '31536000' // 1 year cache
      });
    
    if (error) {
      console.error('[CMS Upload Error]', error);
      
      if (error.message?.includes('Bucket not found')) {
        return NextResponse.json(
          { error: 'Storage not configured. Please contact administrator.' }, 
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        { error: 'Upload failed' }, 
        { status: 500 }
      );
    }
    
    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('public-assets')
      .getPublicUrl(data.path);
    
    // 更新用量统计
    const { error: statError } = await supabase.rpc('increment_usage_stat', {
      p_user_id: user.id,
      p_app_id: appId,
      p_stat_type: 'storage_bytes',
      p_count: 1,
      p_bytes: file.size
    });
    
    if (statError) {
      console.error('Failed to increment usage stat:', statError);
    }
    
    return NextResponse.json({ 
      success: true,
      path: data.path,
      url: publicUrl,
      bucket: 'public-assets',
      size: file.size,
      mime_type: file.type
    });
    
  } catch (error: any) {
    console.error('[CMS Upload Error]', error);
    return NextResponse.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}
