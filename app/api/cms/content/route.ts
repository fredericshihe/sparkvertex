import { createSafeClient } from '@/lib/supabase-server-safe';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createSafeClient();
  const { searchParams } = new URL(req.url);
  const appId = searchParams.get('appId');
  const slug = searchParams.get('slug');

  if (!appId || !slug) {
    return NextResponse.json({ error: 'Missing appId or slug' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('public_content')
      .select('*')
      .eq('app_id', appId)
      .eq('slug', slug)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }
}
