/**
 * 生成作品分享链接
 * 优先使用 share_token（更安全，不可预测）
 * 如果没有 share_token，回退到使用 ID
 */
export function getShareUrl(item: { id: string | number; share_token?: string }, mode?: 'app'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sparkvertex.com';
  const identifier = item.share_token || item.id;
  const baseUrl = `${origin}/p/${identifier}`;
  return mode === 'app' ? `${baseUrl}?mode=app` : baseUrl;
}

/**
 * 获取分享标识符（share_token 或 ID）
 */
export function getShareIdentifier(item: { id: string | number; share_token?: string }): string {
  return item.share_token || String(item.id);
}
