import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { taskId, amount } = await request.json();

    if (!taskId || !amount) {
      return NextResponse.json({ error: 'Missing taskId or amount' }, { status: 400 });
    }

    const cookieStore = cookies();
    
    // 1. Verify User Session
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Admin Client for Database Operations
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Verify Task Ownership (Optional but recommended)
    const { data: task, error: taskError } = await adminSupabase
        .from('generation_tasks')
        .select('user_id, cost')
        .eq('id', taskId)
        .single();

    if (taskError || !task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized task access' }, { status: 403 });
    }

    // 4. Refund Credits
    // Ensure amount is a number
    const refundAmount = Number(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    
    // Fetch current credits first to ensure atomic-like update (though not truly atomic without RPC)
    const { data: profile, error: profileError } = await adminSupabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();
        
    if (profileError) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const newCredits = (Number(profile.credits) || 0) + refundAmount;

    const { error: updateError } = await adminSupabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', user.id);

    if (updateError) {
        return NextResponse.json({ error: 'Failed to update credits' }, { status: 500 });
    }

    return NextResponse.json({ success: true, newCredits });

  } catch (error: any) {
    console.error('Refund error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
