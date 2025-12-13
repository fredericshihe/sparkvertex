import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import HomeClient from './HomeClient';

// ISR: 缓存 120 秒（2分钟）
export const revalidate = 120;

export default async function Home() {
  let heroItems: any[] = [];
  
  try {
    // 在服务端获取 Top 6 项目数据
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data, error } = await supabase
      .from('items')
      .select(`
        id, title, description, tags, prompt, content, downloads, page_views, likes, price, icon_url, daily_rank,
        total_score, quality_score, richness_score, utility_score, analysis_reason, analysis_reason_en,
        profiles:author_id (
          username,
          avatar_url
        )
      `)
      .eq('is_public', true)
      .order('daily_rank', { ascending: true })
      .limit(6);

    if (!error && data) {
      heroItems = data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        tags: item.tags || [],
        content: item.content,
        prompt: item.prompt,
        icon_url: item.icon_url,
        author: Array.isArray(item.profiles) ? item.profiles[0]?.username : item.profiles?.username || 'Unknown',
        authorAvatar: Array.isArray(item.profiles) ? item.profiles[0]?.avatar_url : item.profiles?.avatar_url,
        likes: item.likes || 0,
        downloads: item.downloads || 0,
        page_views: item.page_views || 0,
        price: item.price || 0,
        total_score: item.total_score,
        quality_score: item.quality_score,
        richness_score: item.richness_score,
        utility_score: item.utility_score,
        analysis_reason: item.analysis_reason,
        analysis_reason_en: item.analysis_reason_en
      }));
    }
  } catch (error) {
    console.error('Error fetching hero items:', error);
    // 即使出错也返回空数组，不会阻止页面渲染
  }

  return <HomeClient heroItems={heroItems} />;
}
