import { 
  createServerSupabase, 
  createAdminSupabase, 
  requireAuth, 
  apiSuccess, 
  ApiErrors,
  apiLog 
} from '@/lib/api-utils';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { taskId, amount } = await request.json();

    if (!taskId || !amount) {
      return ApiErrors.badRequest('Missing taskId or amount');
    }

    // 1. Verify User Session
    const supabase = createServerSupabase();
    const { session, errorResponse } = await requireAuth(supabase);

    if (errorResponse) return errorResponse;
    const user = session.user;

    // 2. Admin Client for Database Operations
    const adminSupabase = createAdminSupabase();

    // 3. Verify Task Ownership
    const { data: task, error: taskError } = await adminSupabase
        .from('generation_tasks')
        .select('user_id, cost')
        .eq('id', taskId)
        .single();

    if (taskError || !task) {
        return ApiErrors.notFound('Task not found');
    }

    if (task.user_id !== user.id) {
        return ApiErrors.forbidden('Unauthorized task access');
    }

    // 4. Refund Credits
    const refundAmount = Number(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
        return ApiErrors.badRequest('Invalid amount');
    }
    
    // 验证退款金额不超过任务消耗
    if (refundAmount > (task.cost || 0)) {
        return ApiErrors.badRequest('Refund amount exceeds task cost');
    }
    
    // Fetch current credits
    const { data: profile, error: profileError } = await adminSupabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();
        
    if (profileError) {
        return ApiErrors.notFound('Profile not found');
    }

    const newCredits = (Number(profile.credits) || 0) + refundAmount;

    const { error: updateError } = await adminSupabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', user.id);

    if (updateError) {
        return ApiErrors.serverError('Failed to update credits');
    }

    return apiSuccess({ newCredits });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    apiLog.error('Refund', 'Refund error:', error);
    return ApiErrors.serverError(message);
  }
}
