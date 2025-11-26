import { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import ProductDetailClient from '@/components/ProductDetailClient';
import { notFound } from 'next/navigation';

interface Props {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: item } = await supabase
    .from('items')
    .select('title, description')
    .eq('id', params.id)
    .single();

  if (!item) {
    return {
      title: 'Item Not Found',
    };
  }

  return {
    title: item.title,
    description: item.description,
    manifest: `/api/manifest/${params.id}`,
    appleWebApp: {
      capable: true,
      title: item.title,
      statusBarStyle: 'black-translucent',
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { data: item } = await supabase
    .from('items')
    .select(`
      *,
      profiles:author_id (
        username,
        avatar_url
      )
    `)
    .eq('id', params.id)
    .single();

  if (!item) {
    notFound();
  }

  const formattedItem = {
    ...item,
    author: item.profiles?.username || 'Unknown',
    authorAvatar: item.profiles?.avatar_url
  };

  return <ProductDetailClient initialItem={formattedItem} id={params.id} initialMode={searchParams.mode as string} />;
}
