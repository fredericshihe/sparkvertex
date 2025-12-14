import { Metadata } from 'next';
import { createSafeAnonClient } from '@/lib/supabase-server-safe';
import RunClient from './RunClient';
import { notFound } from 'next/navigation';
import { cache } from 'react';

export const revalidate = 3600;

interface Props {
  params: { id: string };
}

const getItem = cache(async (id: string) => {
  const supabase = createSafeAnonClient();
  const { data: item } = await supabase
    .from('items')
    .select(`
      *,
      profiles:author_id (
        username,
        avatar_url
      )
    `)
    .eq('id', id)
    .single();
  
  return item;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getItem(params.id);

  if (!item) {
    return { title: 'Not Found' };
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
    viewport: {
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      viewportFit: 'cover',
    },
  };
}

export default async function RunPage({ params }: Props) {
  const item = await getItem(params.id);

  if (!item) {
    notFound();
  }

  const formattedItem = {
    ...item,
    author: item.profiles?.username || 'Unknown',
    authorAvatar: item.profiles?.avatar_url
  };

  return <RunClient item={formattedItem} />;
}
