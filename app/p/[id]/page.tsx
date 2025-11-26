import { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import ProductDetailClient from '@/components/ProductDetailClient';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: item } = await supabase
    .from('items')
    .select('title, description, icon_url')
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

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center"><i className="fa-solid fa-circle-notch fa-spin text-brand-500 text-2xl"></i></div>}>
      <ProductDetailClient initialItem={formattedItem} id={params.id} initialMode={searchParams.mode as string} />
    </Suspense>
  );
}
