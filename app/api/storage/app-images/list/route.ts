import { ApiErrors, apiSuccess, createAdminSupabase, createServerSupabase, requireAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET_ID = 'icons';
const USER_PREFIX_DIR = 'app-images';
const PAGE_SIZE = 200;

function extractBytesFromMetadata(metadata: any): number {
  if (!metadata) return 0;

  const candidates = [
    metadata.size,
    metadata.contentLength,
    metadata.content_length,
    metadata['content-length'],
    metadata.ContentLength,
  ];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  }

  return 0;
}

export async function GET(req: Request) {
  try {
    const supabase = createServerSupabase();
    const { session, errorResponse } = await requireAuth(supabase);
    if (errorResponse || !session) return errorResponse;

    const url = new URL(req.url);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || '0') || 0);
    const limit = Math.min(PAGE_SIZE, Math.max(1, Number(url.searchParams.get('limit') || String(PAGE_SIZE)) || PAGE_SIZE));

    const admin = createAdminSupabase();

    // Use Storage API list() instead of querying storage.objects directly
    const { data, error } = await admin.storage
      .from(BUCKET_ID)
      .list(`${session.user.id}/${USER_PREFIX_DIR}`, {
        limit,
        offset,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      console.error('[StorageList] List error:', error);
      return ApiErrors.serverError(error.message);
    }

    const files = data || [];
    const images = files.map((file) => {
      const fullPath = `${session.user.id}/${USER_PREFIX_DIR}/${file.name}`;
      const { data: pub } = admin.storage.from(BUCKET_ID).getPublicUrl(fullPath);
      const bytes = file.metadata?.size ?? extractBytesFromMetadata(file.metadata);
      return {
        path: fullPath,
        publicUrl: pub.publicUrl,
        bytes: typeof bytes === 'number' ? bytes : 0,
        createdAt: file.created_at,
      };
    });

    return apiSuccess({ images });
  } catch (error: any) {
    console.error('[StorageList] Failed:', error);
    return ApiErrors.serverError(error?.message || 'Failed to list images');
  }
}
