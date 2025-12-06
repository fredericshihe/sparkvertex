import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// Initialize Supabase client with Service Role Key for admin access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Redis client
const redis = Redis.fromEnv();

const MODEL_TIMEOUT_MS = 30_000; // 30 seconds timeout
const CACHE_TTL_SEC = 600; // 10 minutes cache

export async function POST() {
  try {
    // 1. Fetch queued jobs (with row-level locking if possible, but simple select/update works for low concurrency)
    // We fetch jobs that are 'queued' and order by creation time
    const { data: jobs, error } = await supabase
      .from('ai_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Error fetching jobs:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return new Response('No queued jobs', { status: 200 });
    }

    // Process jobs in parallel
    await Promise.all(jobs.map(async (job) => {
      const cacheKey = `ai:${hashJob(job)}`;

      try {
        // 2. Check Cache
        const cached = await redis.get(cacheKey);
        if (cached) {
          await supabase
            .from('ai_jobs')
            .update({ 
              status: 'succeeded', 
              result: cached, 
              updated_at: new Date().toISOString() 
            })
            .eq('id', job.id);
          return;
        }

        // 3. Mark as running
        await supabase
          .from('ai_jobs')
          .update({ 
            status: 'running', 
            updated_at: new Date().toISOString() 
          })
          .eq('id', job.id);

        // 4. Call Model
        const result = await callModel(job, MODEL_TIMEOUT_MS);

        // 5. Cache Result
        await redis.set(cacheKey, result, { ex: CACHE_TTL_SEC });

        // 6. Update Job Success
        await supabase
          .from('ai_jobs')
          .update({ 
            status: 'succeeded', 
            result, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', job.id);

      } catch (e: any) {
        console.error(`Job ${job.id} failed:`, e);
        await supabase
          .from('ai_jobs')
          .update({ 
            status: 'failed', 
            error: String(e.message || e), 
            updated_at: new Date().toISOString() 
          })
          .eq('id', job.id);
      }
    }));

    return new Response(`Processed ${jobs.length} jobs`, { status: 200 });
  } catch (err: any) {
    console.error('Fatal error in job processor:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

function hashJob(job: any) {
  return crypto
    .createHash('sha256')
    .update(`${job.system_prompt}||${job.user_prompt}||${job.temperature ?? 0.7}`)
    .digest('hex');
}

async function callModel(job: any, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: job.system_prompt || "You are a helpful assistant." },
          { role: "user", content: job.user_prompt }
        ],
        temperature: job.temperature ?? 0.7
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timeoutId);
  }
}
