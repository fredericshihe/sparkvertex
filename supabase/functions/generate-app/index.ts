import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // 1. 处理 CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    // --- SECURITY CHECK START ---
    // 1. 身份验证 (Authentication)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 创建 Supabase Client (用于验证用户)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // 获取用户信息
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid Token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. 输入验证 (Input Validation)
    const { system_prompt, user_prompt, type } = await req.json();
    
    if (!user_prompt) throw new Error('Missing user_prompt');
    // Increased limit to 50,000 chars to support full file modification context
    if (user_prompt.length > 50000) {
       return new Response(JSON.stringify({ error: 'Input too long (max 50000 chars)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. 速率限制 (Rate Limiting)
    // 使用 Service Role Key 创建管理员客户端，用于读写限流表 (绕过 RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const userId = user.id;
    const endpoint = 'generate-app';
    const limitMin = 20;   // 每分钟 20 次 (Increased for testing)
    const limitDay = 200;  // 每天 200 次 (Increased for testing)

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 查询当前用户的限流记录
    const { data: limitData, error: limitError } = await supabaseAdmin
      .from('user_api_limits')
      .select('*')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .single();

    let minuteCount = 0;
    let dailyCount = 0;
    let lastRequestAt = new Date(0);
    let lastDate = today;

    if (limitData) {
      minuteCount = limitData.minute_count;
      dailyCount = limitData.daily_count;
      lastRequestAt = new Date(limitData.last_request_at);
      lastDate = limitData.last_date;
    }

    // 检查分钟限制
    const timeDiff = now.getTime() - lastRequestAt.getTime();
    if (timeDiff < 60000) { // 1分钟内
      if (minuteCount >= limitMin) {
        return new Response(JSON.stringify({ error: `Rate limit exceeded. Max ${limitMin} requests per minute.` }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      minuteCount++;
    } else {
      minuteCount = 1; // 重置
    }

    // 检查每日限制
    if (lastDate === today) {
      if (dailyCount >= limitDay) {
        return new Response(JSON.stringify({ error: `Daily limit exceeded. Max ${limitDay} requests per day.` }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      dailyCount++;
    } else {
      dailyCount = 1; // 新的一天，重置
      lastDate = today;
    }

    // 更新限流记录
    const { error: upsertError } = await supabaseAdmin
      .from('user_api_limits')
      .upsert({
        user_id: userId,
        endpoint: endpoint,
        minute_count: minuteCount,
        daily_count: dailyCount,
        last_request_at: now.toISOString(),
        last_date: lastDate
      }, { onConflict: 'user_id, endpoint' });

    if (upsertError) {
      console.error('Rate limit update error:', upsertError);
      // 可以选择忽略此错误继续，或者报错。为了用户体验，这里只记录日志。
    }

    // 4. Credit Check & Cost Calculation
    const isModification = type === 'modification';
    // Cost Calculation based on Gemini 3 Pro Pricing (Dec 2025)
    // Creation: 30 Credits (High complexity, large context)
    // Modification: 8 Credits (Context Caching enabled, lower input cost)
    
    const COST = isModification ? 8.0 : 30.0;
    
    // Fetch current credits
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
        
    if (profileError || !profile) {
        console.error('Profile fetch error:', profileError);
        return new Response(JSON.stringify({ error: 'Failed to fetch user profile' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const currentCredits = Number(profile.credits || 0);
    console.log(`User ${userId} has ${currentCredits} credits. Cost: ${COST}`);
    
    if (currentCredits < COST) {
        return new Response(JSON.stringify({ error: '您的积分不足，无法进行操作' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- SECURITY CHECK END ---

    // Get API Key from environment
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    
    // Determine model based on task type
    let modelName = 'gemini-3-pro-preview';
    if (type === 'modification') {
        modelName = 'gemini-3-pro-low';
    }

    // Allow environment variable override
    const envModel = Deno.env.get('GOOGLE_MODEL_NAME');
    if (envModel) {
        modelName = envModel;
    }
    
    if (!apiKey) {
      console.error('Missing API Key configuration');
      return new Response(JSON.stringify({ error: 'Server Configuration Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Using LLM API...');

    // 2. 构造请求
    // Upstream API Endpoint
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 65536, // Increased to ~65k to support very large generations
        // reasoning_effort: 'high',
        messages: [
          {
            role: 'system',
            content: system_prompt || 'You are a helpful assistant.'
          },
          {
            role: 'user',
            content: String(user_prompt)
          }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upstream API Error:', response.status, errorText);
      return new Response(JSON.stringify({
        error: errorText || 'Generation failed',
      }), {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // 5. Credit Deduction (Deduct only after successful upstream response)
    const newCredits = currentCredits - COST;
    const { error: creditUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', userId);
        
    if (creditUpdateError) {
        console.error('Credit update error (Post-Generation):', creditUpdateError);
        // We don't stop the stream here, but we log the error. 
        // Ideally we should have a reliable queue or transaction, but for now logging is sufficient.
    } else {
        console.log(`Deducted ${COST} credits. New balance: ${newCredits}`);
    }

    // 3. 响应处理与脱敏 (Response Sanitization)
    // 我们需要拦截流，过滤掉可能包含模型名称的字段
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (reader) {
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            // 简单的字符串替换，移除模型名称，替换为通用名称
            // 注意：这只是一个简单的文本替换，对于复杂的 JSON 结构可能不够完美，但在流式传输中通常有效
            // 更严谨的做法是解析 SSE 消息并重构，但会增加延迟
            const sanitizedChunk = chunk.replace(/"model"\s*:\s*"[^"]*"/g, '"model":"spark-vertex-ai-v1"');
            
            await writer.write(encoder.encode(sanitizedChunk));
          }
        } catch (err) {
          console.error('Stream processing error:', err);
        } finally {
          writer.close();
        }
      })();
    }

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('Edge Function Exception:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error',
      isException: true
    }), {
      status: 200, // Return 200 to handle error gracefully in frontend if needed
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
