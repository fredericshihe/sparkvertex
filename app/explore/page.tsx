import { createServerClient } from '@supabase/ssr';
// import { cookies } from 'next/headers'; // Removed to enable static optimization/ISR
import ExploreClient from './ExploreClient';
import { Item } from '@/types/supabase';
import { KNOWN_CATEGORIES, CORE_CATEGORY_KEYS } from '@/lib/categories';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const Galaxy = dynamic(() => import('@/components/Galaxy'), { ssr: false });

// export const runtime = 'edge'; // 使用边缘运行时，降低延迟
export const revalidate = 60;  // ISR: 缓存 60 秒

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

  const categoryCounts: Record<string, number> = {};
  CORE_CATEGORY_KEYS.forEach(k => categoryCounts[k] = 0);
  let totalCount = 0;

  // 1. Fetch Categories (Optimized with RPC)
  try {
    const { data: tagCounts, error } = await supabase.rpc('get_tag_counts');
    
    if (error) throw error;

    if (tagCounts) {
      tagCounts.forEach((item: { tag: string, count: number }) => {
        const normalizedTag = item.tag.trim();
        const mapping = KNOWN_CATEGORIES[normalizedTag] || KNOWN_CATEGORIES[normalizedTag.toLowerCase()];
        if (mapping) {
           categoryCounts[mapping.key] = (categoryCounts[mapping.key] || 0) + Number(item.count);
        }
      });
      
      // Get total count efficiently
      const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('is_public', true);
      totalCount = count || 0;
    }
  } catch (error) {
    console.warn('RPC get_tag_counts failed, falling back to legacy method:', error);
    
    // Fallback: Fetch all tags (Slow but works without migration)
    const { data: tagsData } = await supabase
      .from('items')
      .select('tags')
      .eq('is_public', true);

    if (tagsData) {
      totalCount = tagsData.length;
      tagsData.forEach((item: { tags: string[] | null }) => {
        if (Array.isArray(item.tags)) {
          const firstChineseTag = item.tags.find((tag: string) => tag && /[\u4e00-\u9fa5]/.test(tag));
          if (firstChineseTag) {
            const normalizedTag = firstChineseTag.trim();
            const mapping = KNOWN_CATEGORIES[normalizedTag] || KNOWN_CATEGORIES[normalizedTag.toLowerCase()];
            if (mapping) {
               categoryCounts[mapping.key] = (categoryCounts[mapping.key] || 0) + 1;
            }
          }
        }
      });
    }
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

  // 2. Fetch Items (Page 0, Category 'all')
  const { data: itemsData } = await supabase
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
      .range(0, 12); // 13 items

  let initialItems: Item[] = [];
  let initialTopItem: Item | undefined = undefined;

  if (itemsData) {
      const formattedItems = itemsData.map((item) => ({
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
