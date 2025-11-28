import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (code) {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    console.log('Auth Callback: Exchanging code for session...');
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Auth Callback Error:', error.message);
      // Security: Don't leak specific error details in URL
      return NextResponse.redirect(new URL(`/?error=auth_failed`, request.url));
    }
    console.log('Auth Callback: Session exchanged successfully');
  } else {
    console.log('Auth Callback: No code found in URL');
  }

  // URL to redirect to after sign in process completes
  console.log('Auth Callback: Redirecting to', next);
  return NextResponse.redirect(new URL(next, request.url));
}
