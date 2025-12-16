import { ApiErrors, apiSuccess, createAdminSupabase, createServerSupabase, requireAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET_ID = 'icons';
const USER_PREFIX_DIR = 'app-images';

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabase();
    const { session, errorResponse } = await requireAuth(supabase);
    if (errorResponse || !session) return errorResponse;

    const body = await req.json().catch(() => ({}));
    const path = body?.path;

    if (typeof path !== 'string' || !path) {
      return ApiErrors.badRequest('Missing path');
    }

    const requiredPrefix = `${session.user.id}/${USER_PREFIX_DIR}/`;
    if (!path.startsWith(requiredPrefix)) {
      return ApiErrors.forbidden('Invalid path');
    }

    const admin = createAdminSupabase();
    const { error } = await admin.storage.from(BUCKET_ID).remove([path]);
    if (error) return ApiErrors.serverError(error.message);

    return apiSuccess({ deleted: true });
  } catch (error: any) {
    console.error('[StorageDelete] Failed:', error);
    return ApiErrors.serverError(error?.message || 'Delete failed');
  }
}
