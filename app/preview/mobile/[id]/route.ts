import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { id } = params;

  if (!id) {
    return new NextResponse('Missing ID', { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('temp_previews')
      .select('content')
      .eq('id', id)
      .single();

    if (error || !data) {
      return new NextResponse('Preview not found or expired', { status: 404 });
    }

    // Return the raw HTML content
    return new NextResponse(data.content, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Prevent caching so updates are seen immediately if we reuse IDs (though we use UUIDs)
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (e) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
