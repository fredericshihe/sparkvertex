
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// App ID 格式校验
const APP_ID_REGEX = /^(app_[a-f0-9-]+_[a-f0-9-]+|draft_[a-f0-9-]+)$/;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Spark-App-Id',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    // Get App ID from header
    const appId = req.headers.get('X-Spark-App-Id');
    
    console.log('[Submit API] Received request. AppID:', appId);
    
    if (!appId) {
      console.warn('[Submit API] Missing X-Spark-App-Id header');
      return NextResponse.json(
        { error: 'Missing X-Spark-App-Id header' }, 
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Validate App ID
    // Allow UUIDs (standard format for published apps), draft IDs, and numeric IDs (legacy/simple)
    const isDraft = appId.startsWith('draft_');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId);
    const isNumeric = /^\d+$/.test(appId);
    
    // 宽松验证：只要不是空的，且包含合法字符，就允许通过
    // 这样可以兼容各种 ID 格式，避免误杀
    if (!APP_ID_REGEX.test(appId) && !isDraft && !isUUID && !isNumeric) {
      // Fallback for other valid ID formats (must be at least 1 char to avoid garbage)
      if (!/^[a-zA-Z0-9_-]+$/.test(appId)) {
        console.warn('[Submit API] Invalid App ID format:', appId);
        return NextResponse.json(
          { error: 'Invalid App ID' }, 
          { status: 400, headers: corsHeaders }
        );
      }
    }
    
    // Get payload
    let payload;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries());
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      // Handle files if needed
      const obj: any = {};
      for (const [key, value] of Array.from(formData.entries())) {
        if (value instanceof File) {
           const fileInfo: any = {
             name: value.name,
             type: value.type,
             size: value.size,
             is_file: true
           };
           
           // If it's an image and small enough (< 50KB), store as base64 for preview
           if (value.type.startsWith('image/') && value.size < 50 * 1024) {
             try {
               const arrayBuffer = await value.arrayBuffer();
               const buffer = Buffer.from(arrayBuffer);
               const base64 = buffer.toString('base64');
               fileInfo.content = `data:${value.type};base64,${base64}`;
               fileInfo.has_content = true;
             } catch (e) {
               console.warn('Failed to convert file to base64', e);
             }
           } else {
             fileInfo._note = value.size > 50 * 1024 ? 'File too large to preview (>50KB)' : 'File content not stored';
           }
           
           obj[key] = fileInfo;
        } else {
           obj[key] = value;
        }
      }
      payload = obj;
    } else {
      // Text or other
      payload = await req.text();
    }
    
    // Payload size limit (100KB)
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (payloadStr.length > 100 * 1024) {
      return NextResponse.json(
        { error: 'Payload too large (max 100KB)' }, 
        { status: 413, headers: corsHeaders }
      );
    }
    
    // Rate limit (simple check)
    // ... (skip for now or implement if needed)
    
    // Insert into database
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    const { error } = await supabase
      .from('inbox_messages')
      .insert({
        app_id: appId,
        encrypted_payload: payloadStr,
        metadata: {
          ip: clientIP,
          user_agent: req.headers.get('user-agent')?.slice(0, 200),
          submitted_at: new Date().toISOString(),
          source: 'generic_submit_api'
        }
      });
      
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to save data' }, 
        { status: 500, headers: corsHeaders }
      );
    }
    
    return NextResponse.json(
      { success: true, message: 'Data submitted successfully' }, 
      { status: 200, headers: corsHeaders }
    );
    
  } catch (err: any) {
    console.error('Submit API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' }, 
      { status: 500, headers: corsHeaders }
    );
  }
}
