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
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await (admin as any)
      .schema('storage')
      .from('objects')
      .select('metadata')
      .eq('bucket_id', BUCKET_ID)
      .like('name', `${userId}/${USER_PREFIX_DIR}/%`)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = (data || []) as Array<{ metadata: any }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      usedBytes += extractBytesFromMetadata(row.metadata);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return usedBytes;
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabase();
    const { session, errorResponse } = await requireAuth(supabase);
    if (errorResponse || !session) return errorResponse;

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return ApiErrors.badRequest('Missing file');
    }

    if (!file.type?.startsWith('image/')) {
      return ApiErrors.badRequest('Only image uploads are allowed');
    }

    // Hard cap request size from client perspective (compressed file should be small)
    if (file.size > 5 * 1024 * 1024) {
      return ApiErrors.payloadTooLarge('Image must be under 5MB');
    }

    const quotaBytes = getQuotaBytes();
    const admin = createAdminSupabase();
    const usedBytes = await computeUsedBytes(admin, session.user.id);

    if (usedBytes + file.size > quotaBytes) {
      const remainingBytes = Math.max(0, quotaBytes - usedBytes);
      return ApiErrors.payloadTooLarge(
        `Storage quota exceeded. Remaining: ${remainingBytes} bytes`
      );
    }

    const ext = file.type === 'image/webp' ? 'webp' : file.type.split('/')[1] || 'img';
    const path = `${session.user.id}/${USER_PREFIX_DIR}/${Date.now()}_${randomId()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET_ID)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return ApiErrors.serverError(uploadError.message);
    }

    const { data: pub } = admin.storage.from(BUCKET_ID).getPublicUrl(path);

    const newUsedBytes = usedBytes + file.size;
    const remainingBytes = Math.max(0, quotaBytes - newUsedBytes);

    return apiSuccess({
      path,
      publicUrl: pub.publicUrl,
      quotaBytes,
      usedBytes: newUsedBytes,
      remainingBytes,
    });
  } catch (error: any) {
    console.error('[StorageUpload] Failed:', error);
    return ApiErrors.serverError(error?.message || 'Upload failed');
  }
}
