import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
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
