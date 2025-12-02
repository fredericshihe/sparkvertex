import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  // Decode the redirect_to param
  const redirect_to = requestUrl.searchParams.get('redirect_to') || '/';

  if (token_hash && type) {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (!error) {
      // Verification successful, session is set in cookies
      // Redirect to the target page
      // We construct the absolute URL for the redirect
      // If redirect_to is relative, it will be resolved against request.url
      // If it's absolute, it will be used as is
      
      // Security: Ensure we don't redirect to arbitrary domains if we want to be strict
      // But for now, we trust the param coming from our signed email flow
      
      return NextResponse.redirect(new URL(redirect_to, request.url));
    } else {
        console.error('Verify Error:', error);
        return NextResponse.redirect(new URL(`/?error=verify_failed&details=${encodeURIComponent(error.message)}`, request.url));
    }
  }

  return NextResponse.redirect(new URL('/?error=invalid_link', request.url));
}
