import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  // Fetch item details
  const { data: item } = await supabase
    .from('items')
    .select('title, description, icon_url')
    .eq('id', id)
    .single();

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
    start_url: `/p/${id}?mode=app`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: icons
  };

  return NextResponse.json(manifest);
}
