import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  if (code) {
    const cookieStore = cookies();
    // Determine if we are on a secure connection
    const isSecure = requestUrl.protocol === 'https:';
    
    const supabase = createRouteHandlerClient({ 
      cookies: () => cookieStore 
    });
    
    console.log('Auth Callback: Exchanging code for session...');
    // Log cookie names for debugging (don't log values)
    console.log('Available cookies:', cookieStore.getAll().map(c => c.name));

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('Auth Callback Error:', error.message);
      
      // Check for specific PKCE error
      if (error.message.includes('code verifier')) {
        // Redirect to a help page or home with specific instruction
        return NextResponse.redirect(new URL(`/?error=verifier_missing&details=${encodeURIComponent('请在同一个浏览器中打开链接')}`, request.url));
      }

      return NextResponse.redirect(new URL(`/?error=auth_failed&details=${encodeURIComponent(error.message)}`, request.url));
    }
    console.log('Auth Callback: Session exchanged successfully');
  } else {
    console.log('Auth Callback: No code found in URL');
  }

  // URL to redirect to after sign in process completes
  console.log('Auth Callback: Redirecting to', next);
  return NextResponse.redirect(new URL(next, request.url));
}
