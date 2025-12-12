// POST /api/mailbox/upload
// 公开接口 - 处理加密文件上传到 inbox-files 桶

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import rateLimit from '@/lib/rate-limit';

// 确保在构建时即使没有环境变量也不会报错
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey);

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

const APP_ID_REGEX = /^app_[a-f0-9-]+_[a-f0-9-]+$/;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const appId = formData.get('app_id') as string;
    const chunkIndex = formData.get('chunk_index') as string | null;
    const totalChunks = formData.get('total_chunks') as string | null;
    
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
    
    // 限制文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 
        { status: 413 }
      );
    }
    
    // 限流检查
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateLimitKey = `mailbox_upload:${appId}:${clientIP}`;
    
    try {
      await limiter.check(30, rateLimitKey); // 30 uploads per minute
    } catch (e) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' }, 
        { status: 429 }
      );
    }
    
    // 生成唯一路径
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    
    // 如果是分片上传，添加分片索引到路径
    let path: string;
    if (chunkIndex !== null && totalChunks !== null) {
      path = `${appId}/${timestamp}_${randomId}_chunk${chunkIndex}of${totalChunks}.enc`;
    } else {
      path = `${appId}/${timestamp}_${randomId}.enc`;
    }
    
    // 读取文件内容
    const fileBuffer = await file.arrayBuffer();
    
    // 上传到 inbox-files 桶
    const { data, error } = await supabase.storage
      .from('inbox-files')
      .upload(path, fileBuffer, {
        contentType: 'application/octet-stream',
        upsert: false
      });
    
    if (error) {
      console.error('[Mailbox Upload Error]', error);
      
      // 如果 bucket 不存在，返回友好错误
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
    
    // 更新用量统计
    const userId = appId.split('_')[1];
    if (userId) {
      const { error: statError } = await supabase.rpc('increment_usage_stat', {
        p_user_id: userId,
        p_app_id: appId,
        p_stat_type: 'file_upload',
        p_count: 1,
        p_bytes: file.size
      });
      
      if (statError) {
        console.error('Failed to increment usage stat:', statError);
      }
    }
    
    return NextResponse.json({ 
      success: true,
      path: data.path,
      bucket: 'inbox-files',
      size: file.size,
      chunk_info: chunkIndex !== null ? {
        index: parseInt(chunkIndex),
        total: parseInt(totalChunks || '1')
      } : null
    });
    
  } catch (error: any) {
    console.error('[Mailbox Upload Error]', error);
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
