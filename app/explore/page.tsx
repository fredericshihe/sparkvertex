import { createServerClient } from '@supabase/ssr';
// import { cookies } from 'next/headers'; // Removed to enable static optimization/ISR
import ExploreClient from './ExploreClient';
import { Item } from '@/types/supabase';
import { KNOWN_CATEGORIES, CORE_CATEGORY_KEYS } from '@/lib/categories';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const Galaxy = dynamic(() => import('@/components/Galaxy'), { ssr: false });

// export const runtime = 'edge'; // 使用边缘运行时，降低延迟
export const revalidate = 300;  // ISR: 缓存 5 分钟，减少重复查询

export default async function ExplorePage() {
  // const cookieStore = cookies(); // Removed to enable static optimization
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return undefined; // No cookies needed for public data fetch
        },
      },
    }
  );

  // 并行执行所有数据库查询，大幅提升加载速度
  const [tagCountsResult, totalCountResult, itemsResult] = await Promise.all([
    // 1. 获取分类统计 - 使用 Promise.resolve 包装以支持 .catch
    Promise.resolve(supabase.rpc('get_tag_counts')).catch(() => ({ data: null, error: { message: 'RPC failed' } })),
    // 2. 获取总数
    supabase.from('items').select('*', { count: 'exact', head: true }).eq('is_public', true),
    // 3. 获取作品列表 - 减少初始加载数量以提升移动端性能
    supabase
      .from('items')
      .select(`
        *,
        profiles:author_id (
          username,
          avatar_url
        )
      `)
      .eq('is_public', true)
      .order('daily_rank', { ascending: true, nullsFirst: false })
      .range(0, 12)
  ]);

  const categoryCounts: Record<string, number> = {};
  CORE_CATEGORY_KEYS.forEach(k => categoryCounts[k] = 0);
  let totalCount = totalCountResult.count || 0;

  // 处理分类统计结果
  if (tagCountsResult.data && !tagCountsResult.error) {
    tagCountsResult.data.forEach((item: { tag: string, count: number }) => {
      const normalizedTag = item.tag.trim();
      const mapping = KNOWN_CATEGORIES[normalizedTag] || KNOWN_CATEGORIES[normalizedTag.toLowerCase()];
      if (mapping) {
        categoryCounts[mapping.key] = (categoryCounts[mapping.key] || 0) + Number(item.count);
      }
    });
  }

  const dynamicCategories = CORE_CATEGORY_KEYS.map(key => {
       const def = KNOWN_CATEGORIES[key]; 
       return {
         id: key,
         label: key,
         translationKey: key,
         icon: def ? def.icon : 'fa-folder',
         count: categoryCounts[key] || 0
       };
  }).sort((a, b) => b.count - a.count);

  const initialCategories = [
      { id: 'all', label: '发现', translationKey: 'discover', icon: 'fa-compass', count: totalCount },
      ...dynamicCategories
  ];

  let initialItems: Item[] = [];
  let initialTopItem: Item | undefined = undefined;

  if (itemsResult.data) {
      const formattedItems = itemsResult.data.map((item) => ({
        ...item,
        author: (item.profiles as { username?: string } | null)?.username || 'Unknown',
        authorAvatar: (item.profiles as { avatar_url?: string } | null)?.avatar_url
      }));

      if (formattedItems.length > 0) {
          initialTopItem = formattedItems[0];
          initialItems = formattedItems.slice(1);
      }
  }

  return (
    <div className="min-h-screen bg-zinc-950 relative">
      <div className="relative z-10">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-slate-600 border-t-brand-500 rounded-full animate-spin" /></div>}>
          <ExploreClient 
            initialItems={initialItems} 
            initialCategories={initialCategories} 
            initialTopItem={initialTopItem} 
          />
        </Suspense>
      </div>
    </div>
  );
}
