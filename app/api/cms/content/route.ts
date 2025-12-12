import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 确保在构建时即使没有环境变量也不会报错
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey);

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
