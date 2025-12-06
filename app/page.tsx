import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Hero from '@/components/Hero';

// 使用边缘运行时，降低延迟
export const runtime = 'edge';
// ISR: 缓存 120 秒（2分钟）
export const revalidate = 120;

export default async function Home() {
  // 在服务端获取 Top 5 项目数据，避免客户端请求
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

  let heroItems: any[] = [];
  try {
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
      .limit(5);

    if (!error && data) {
      heroItems = data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        tags: item.tags || [],
        content: item.content,
        prompt: item.prompt,
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
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="flex-grow relative">
        <Hero initialItems={heroItems} />
      </div>
    </div>
  );
}
