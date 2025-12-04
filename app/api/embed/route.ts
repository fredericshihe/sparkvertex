import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    // Use Supabase Edge Function for embeddings
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase configuration missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ input: text })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Edge Function error:', error);
      return NextResponse.json({ error: 'Failed to generate embedding' }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json({ embedding: data.embedding });

  } catch (error) {
    console.error('Embedding error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
