import { apiSuccess, ApiErrors, apiLog } from '@/lib/api-utils';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();

    if (!itemId) {
      return ApiErrors.badRequest('缺少 itemId');
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 调用 score-items Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/score-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ id: itemId })
    });

    if (!response.ok) {
      const errorText = await response.text();
      apiLog.error('ScoreItem', '评分函数调用失败:', errorText);
      return ApiErrors.serverError('评分失败');
    }

    const result = await response.json();
    return apiSuccess(result);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    apiLog.error('ScoreItem', 'API 错误:', error);
    return ApiErrors.serverError(message);
  }
}
