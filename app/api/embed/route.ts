import { 
  createServerSupabase, 
  requireAuth, 
  apiSuccess, 
  ApiErrors, 
  apiLog 
} from '@/lib/api-utils';

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { session, errorResponse } = await requireAuth(supabase);

    if (errorResponse) return errorResponse;

    const { text } = await request.json();

    if (!text) {
      return ApiErrors.badRequest('No text provided');
    }

    // Use Supabase Edge Function for embeddings
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      apiLog.error('Embed', 'Supabase configuration missing');
      return ApiErrors.serverError('Server configuration error');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ input: text })
    });

    if (!response.ok) {
      const error = await response.text();
      apiLog.error('Embed', 'Edge Function error:', error);
      return ApiErrors.serverError('Failed to generate embedding');
    }

    const data = await response.json();
    return apiSuccess({ embedding: data.embedding });

  } catch (error) {
    apiLog.error('Embed', 'Embedding error:', error);
    return ApiErrors.serverError('Internal server error');
  }
}
