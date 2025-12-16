import { ApiErrors, apiSuccess, createAdminSupabase, createServerSupabase, requireAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET_ID = 'icons';
const USER_PREFIX_DIR = 'app-images';
const DEFAULT_QUOTA_MB = 100;
const PAGE_SIZE = 1000;

function getQuotaBytes() {
  const mbRaw = process.env.USER_IMAGE_QUOTA_MB;
  const mb = mbRaw ? Number(mbRaw) : DEFAULT_QUOTA_MB;
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_QUOTA_MB;
  return Math.floor(safeMb * 1024 * 1024);
}

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

async function computeUsedBytes(admin: ReturnType<typeof createAdminSupabase>, userId: string) {
  let usedBytes = 0;
  let offset = 0;

  // Use Storage API list() to enumerate files in user's app-images folder
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.storage
      .from(BUCKET_ID)
      .list(`${userId}/${USER_PREFIX_DIR}`, {
        limit: PAGE_SIZE,
        offset,
      });

    if (error) {
      console.error('[computeUsedBytes] List error:', error);
      throw error;
    }

    const files = data || [];
    if (files.length === 0) break;

    for (const file of files) {
      // file.metadata contains size info; also check file.metadata?.size
      const size = file.metadata?.size ?? extractBytesFromMetadata(file.metadata);
      usedBytes += typeof size === 'number' ? size : 0;
    }

    if (files.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return usedBytes;
}

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { session, errorResponse } = await requireAuth(supabase);
    if (errorResponse || !session) return errorResponse;

    const quotaBytes = getQuotaBytes();
    const admin = createAdminSupabase();
    const usedBytes = await computeUsedBytes(admin, session.user.id);
    const remainingBytes = Math.max(0, quotaBytes - usedBytes);

    return apiSuccess({
      quotaBytes,
      usedBytes,
      remainingBytes,
    });
  } catch (error: any) {
    console.error('[StorageQuota] Failed:', error);
    return ApiErrors.serverError(error?.message || 'Failed to get quota');
  }
}
