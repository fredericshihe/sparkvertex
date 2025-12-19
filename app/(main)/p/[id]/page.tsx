import { Metadata } from 'next';
import { createSafeAnonClient } from '@/lib/supabase-server-safe';
import ProductDetailClient from '@/components/ProductDetailClient';
import { notFound } from 'next/navigation';
import { Suspense, cache } from 'react';

// ISR: 缓存 1 小时 (3600秒)
// 这样后续用户访问同一作品时，会直接返回缓存的 HTML，速度极快
export const revalidate = 3600;

interface Props {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

// 使用 React cache 对请求进行去重
// 这样 generateMetadata 和 ProductPage 会共享同一个请求结果，避免重复查询数据库
const getItem = cache(async (idOrToken: string) => {
  const supabase = createSafeAnonClient();
  
  // 判断是数字 ID 还是 share_token
  const isNumericId = /^\d+$/.test(idOrToken);
  
  const query = supabase
    .from('items')
    .select(`
      *,
      profiles:author_id (
        username,
        avatar_url
      )
    `);
  
  // 根据类型选择查询方式
  const { data: item } = isNumericId 
    ? await query.eq('id', idOrToken).single()
    : await query.eq('share_token', idOrToken).single();
  
  return item;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getItem(params.id);

  if (!item) {
    return {
      title: 'Item Not Found',
    };
  }

  return {
    title: item.title,
    description: item.description,
    manifest: `/api/manifest/${params.id}`,
    icons: {
      icon: item.icon_url || '/icons/icon-192x192.png',
      apple: item.icon_url || '/icons/icon-192x192.png',
    },
    appleWebApp: {
      capable: true,
      title: item.title,
      statusBarStyle: 'black-translucent',
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const item = await getItem(params.id);

  if (!item) {
    notFound();
  }

  const formattedItem = {
    ...item,
    author: item.profiles?.username || 'Unknown',
    authorAvatar: item.profiles?.avatar_url
  };

  // 始终使用真实的数字 ID（即使是通过 share_token 访问的）
  const realId = String(item.id);

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><i className="fa-solid fa-circle-notch fa-spin text-brand-500 text-2xl"></i></div>}>
      <ProductDetailClient initialItem={formattedItem} id={realId} initialMode={searchParams.mode as string} />
    </Suspense>
  );
}
