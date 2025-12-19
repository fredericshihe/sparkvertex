import { NextResponse } from 'next/server';
import { createSafeAnonClient } from '@/lib/supabase-server-safe';

const supabase = createSafeAnonClient();

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  
  // Get referer to determine if it's from /run or /p page
  const referer = request.headers.get('referer') || '';
  const isRunPage = referer.includes('/run/');

  // Fetch item details
  // Support both numeric ID and share_token
  const isNumericId = /^\d+$/.test(id);
  const query = supabase
    .from('items')
    .select('title, description, icon_url');
    
  const { data: item } = isNumericId
    ? await query.eq('id', id).single()
    : await query.eq('share_token', id).single();

  if (!item) {
    return new NextResponse('Item not found', { status: 404 });
  }

  const icons = item.icon_url 
    ? [
        {
          src: item.icon_url,
          sizes: "192x192",
          type: "image/png"
        },
        {
          src: item.icon_url,
          sizes: "512x512",
          type: "image/png"
        }
      ]
    : [
        {
          src: "/icons/icon-192x192.png",
          sizes: "192x192",
          type: "image/png"
        },
        {
          src: "/icons/icon-512x512.png",
          sizes: "512x512",
          type: "image/png"
        }
      ];

  const manifest = {
    name: item.title,
    short_name: item.title.length > 12 ? item.title.substring(0, 12) + '...' : item.title,
    description: item.description,
    start_url: isRunPage ? `/run/${id}` : `/p/${id}?mode=app`,
    scope: isRunPage ? `/run/${id}` : `/p/${id}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: icons
  };

  return NextResponse.json(manifest);
}
