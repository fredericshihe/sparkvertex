import { SupabaseClient } from '@supabase/supabase-js';

/**
 * P1: 基于内存的速率限制器（用于 Edge Runtime）
 * 适用于无法访问持久化存储的场景
 */
interface RateLimitOptions {
  interval: number; // 时间窗口（毫秒）
  uniqueTokenPerInterval: number; // 每个时间窗口内唯一 token 的数量
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export default function rateLimit(options: RateLimitOptions) {
  const tokenCache = new Map<string, number[]>();

  return {
    check: async (limit: number, token: string): Promise<RateLimitResult> => {
      const now = Date.now();
      const windowStart = now - options.interval;

      // 获取该 token 的请求时间戳列表
      const timestamps = tokenCache.get(token) || [];

      // 过滤掉时间窗口外的请求
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);

      // 检查是否超过限制
      if (validTimestamps.length >= limit) {
        const oldestTimestamp = validTimestamps[0];
        const resetTime = oldestTimestamp + options.interval;

        throw new Error('Rate limit exceeded');
      }

      // 添加当前请求时间戳
      validTimestamps.push(now);
      tokenCache.set(token, validTimestamps);

      // 清理过期的 token（防止内存泄漏）
      if (tokenCache.size > options.uniqueTokenPerInterval) {
        const tokensToDelete: string[] = [];
        
        Array.from(tokenCache.entries()).forEach(([key, stamps]) => {
          const validStamps = stamps.filter((ts) => ts > windowStart);
          
          if (validStamps.length === 0) {
            tokensToDelete.push(key);
          } else {
            tokenCache.set(key, validStamps);
          }
        });
        
        tokensToDelete.forEach((key) => tokenCache.delete(key));
      }

      return {
        success: true,
        limit,
        remaining: limit - validTimestamps.length,
        reset: now + options.interval,
      };
    },
  };
}

/**
 * 基于数据库的速率限制器（原有功能，保持兼容性）
 */
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
