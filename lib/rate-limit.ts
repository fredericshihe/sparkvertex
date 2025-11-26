import { SupabaseClient } from '@supabase/supabase-js';

export async function checkRateLimit(
  client: SupabaseClient,
  userId: string,
  endpoint: string,
  limitMin: number,
  limitDay: number
): Promise<{ allowed: boolean; error?: string }> {
  const now = new Date();
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Get current usage
  const { data, error } = await client
    .from('user_api_limits')
    .select('*')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
    console.error('Rate limit check error:', error);
    // Fail open if DB error to avoid blocking users during outages
    return { allowed: true }; 
  }

  let minuteCount = 0;
  let dailyCount = 0;
  let lastRequestAt = new Date(0);
  let lastDate = today;

  if (data) {
    minuteCount = data.minute_count;
    dailyCount = data.daily_count;
    lastRequestAt = new Date(data.last_request_at);
    lastDate = data.last_date;
  }

  // 2. Check Minute Limit
  const timeDiff = now.getTime() - lastRequestAt.getTime();
  if (timeDiff < 60000) { // Less than 1 minute
    if (minuteCount >= limitMin) {
      return { allowed: false, error: `Rate limit exceeded. Max ${limitMin} requests per minute.` };
    }
    minuteCount++;
  } else {
    minuteCount = 1; // Reset
  }

  // 3. Check Daily Limit
  if (lastDate === today) {
    if (dailyCount >= limitDay) {
      return { allowed: false, error: `Daily quota exceeded. Max ${limitDay} requests per day.` };
    }
    dailyCount++;
  } else {
    dailyCount = 1; // Reset
    lastDate = today;
  }

  // 4. Update DB
  const { error: upsertError } = await client
    .from('user_api_limits')
    .upsert({
      user_id: userId,
      endpoint: endpoint,
      minute_count: minuteCount,
      last_request_at: now.toISOString(),
      daily_count: dailyCount,
      last_date: lastDate
    });

  if (upsertError) {
    console.error('Rate limit update error:', upsertError);
  }

  return { allowed: true };
}
