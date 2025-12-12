import { 
  createAdminSupabase, 
  isValidAppId, 
  DEFAULT_CORS_HEADERS, 
  createCorsOptionsResponse, 
  apiSuccess, 
  apiError, 
  ApiErrors,
  apiLog 
} from '@/lib/api-utils';

export async function OPTIONS() {
  return createCorsOptionsResponse();
}

export async function POST(req: Request) {
  try {
    // Get App ID from header
    const appId = req.headers.get('X-Spark-App-Id');
    
    apiLog.info('Submit', 'Received request. AppID:', appId);
    
    if (!appId) {
      apiLog.warn('Submit', 'Missing X-Spark-App-Id header');
      return apiError('Missing X-Spark-App-Id header', 400);
    }
    
    // Validate App ID
    if (!isValidAppId(appId)) {
      apiLog.warn('Submit', 'Invalid App ID format:', appId);
      return apiError('Invalid App ID', 400);
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
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Array.from(formData.entries())) {
        if (value instanceof File) {
           const fileInfo: Record<string, unknown> = {
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
               apiLog.warn('Submit', 'Failed to convert file to base64', e);
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
      return ApiErrors.payloadTooLarge('Payload too large (max 100KB)');
    }
    
    // Insert into database (create client per request to avoid state pollution)
    const supabase = createAdminSupabase();
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
      apiLog.error('Submit', 'Database error:', error);
      return ApiErrors.serverError('Failed to save data');
    }
    
    return apiSuccess(undefined, 'Data submitted successfully');
    
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    apiLog.error('Submit', 'Submit API error:', err);
    return ApiErrors.serverError(message);
  }
}
