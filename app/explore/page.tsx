import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExploreClient from './ExploreClient';
import { Item } from '@/types/supabase';

const KNOWN_CATEGORIES: Record<string, { key: string, icon: string }> = {
  // Core Categories (English keys)
  game: { key: 'game', icon: 'fa-gamepad' },
  tool: { key: 'tool', icon: 'fa-screwdriver-wrench' },
  productivity: { key: 'productivity', icon: 'fa-list-check' },
  design: { key: 'design', icon: 'fa-palette' },
  devtool: { key: 'devtool', icon: 'fa-code' },
  entertainment: { key: 'entertainment', icon: 'fa-film' },
  education: { key: 'education', icon: 'fa-graduation-cap' },
  visualization: { key: 'visualization', icon: 'fa-chart-pie' },
  lifestyle: { key: 'lifestyle', icon: 'fa-mug-hot' },
  
  // Chinese mappings
  '游戏': { key: 'game', icon: 'fa-gamepad' },
  '游戏娱乐': { key: 'game', icon: 'fa-gamepad' },
  '休闲游戏': { key: 'game', icon: 'fa-gamepad' },
  '益智游戏': { key: 'game', icon: 'fa-gamepad' },
  'Game': { key: 'game', icon: 'fa-gamepad' },
  
  '创意': { key: 'design', icon: 'fa-palette' },
  '创意设计': { key: 'design', icon: 'fa-palette' },
  '设计': { key: 'design', icon: 'fa-palette' },
  '艺术': { key: 'design', icon: 'fa-palette' },
  'Eye Candy': { key: 'design', icon: 'fa-palette' },
  'Design': { key: 'design', icon: 'fa-palette' },
  
  '生产力': { key: 'productivity', icon: 'fa-list-check' },
  '办公效率': { key: 'productivity', icon: 'fa-list-check' },
  '效率': { key: 'productivity', icon: 'fa-list-check' },
  '办公': { key: 'productivity', icon: 'fa-list-check' },
  'Productivity': { key: 'productivity', icon: 'fa-list-check' },
  
  '工具': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  '实用工具': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  'Tiny Tools': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  '计算器': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  'Tool': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  
  '开发者工具': { key: 'devtool', icon: 'fa-code' },
  '开发': { key: 'devtool', icon: 'fa-code' },
  '编程': { key: 'devtool', icon: 'fa-code' },
  '代码': { key: 'devtool', icon: 'fa-code' },
  'DevTool': { key: 'devtool', icon: 'fa-code' },
  'Developer': { key: 'devtool', icon: 'fa-code' },
  
  '影音娱乐': { key: 'entertainment', icon: 'fa-film' },
  '娱乐': { key: 'entertainment', icon: 'fa-film' },
  '音乐': { key: 'entertainment', icon: 'fa-music' },
  '视频': { key: 'entertainment', icon: 'fa-video' },
  '影视': { key: 'entertainment', icon: 'fa-film' },
  'Entertainment': { key: 'entertainment', icon: 'fa-film' },
  
  '教育': { key: 'education', icon: 'fa-graduation-cap' },
  '教育学习': { key: 'education', icon: 'fa-graduation-cap' },
  '学习': { key: 'education', icon: 'fa-graduation-cap' },
  '知识': { key: 'education', icon: 'fa-graduation-cap' },
  'Education': { key: 'education', icon: 'fa-graduation-cap' },
  
  '数据可视化': { key: 'visualization', icon: 'fa-chart-pie' },
  '图表': { key: 'visualization', icon: 'fa-chart-pie' },
  '数据': { key: 'visualization', icon: 'fa-chart-pie' },
  'Visualization': { key: 'visualization', icon: 'fa-chart-pie' },
  
  '生活': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '生活便利': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '日常': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '健康': { key: 'lifestyle', icon: 'fa-heart-pulse' },
  'Lifestyle': { key: 'lifestyle', icon: 'fa-mug-hot' },
  
  'AI': { key: 'tool', icon: 'fa-robot' },
  'AI应用': { key: 'tool', icon: 'fa-robot' },
};

export const dynamic = 'force-dynamic';

export default async function ExplorePage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  );

  // 1. Fetch Categories
  const { data: tagsData } = await supabase
    .from('items')
    .select('tags')
    .eq('is_public', true);

  const CORE_KEYS = ['game', 'design', 'productivity', 'tool', 'devtool', 'entertainment', 'education', 'visualization', 'lifestyle'];
  const categoryCounts: Record<string, number> = {};
  CORE_KEYS.forEach(k => categoryCounts[k] = 0);

  if (tagsData) {
    tagsData.forEach((item: any) => {
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

  const dynamicCategories = CORE_KEYS.map(key => {
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
      { id: 'all', label: '发现', translationKey: 'discover', icon: 'fa-compass', count: tagsData?.length || 0 },
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
      const formattedItems = itemsData.map((item: any) => ({
        ...item,
        author: item.profiles?.username || 'Unknown',
        authorAvatar: item.profiles?.avatar_url
      }));

      if (formattedItems.length > 0) {
          initialTopItem = formattedItems[0];
          initialItems = formattedItems.slice(1);
      }
  }

  return (
    <ExploreClient 
      initialItems={initialItems} 
      initialCategories={initialCategories} 
      initialTopItem={initialTopItem} 
    />
  );
}
