import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- SECURITY CHECK START ---
    // 注意：意图分类是轻量级操作，可以不强制要求用户登录
    // 但如果需要限制滥用，可以取消下面的注释
    /*
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    */
    // --- SECURITY CHECK END ---

    const { system_prompt, user_prompt, temperature, stream = false } = await req.json();
    const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    if (!apiKey) {
      throw new Error('Missing DEEPSEEK_API_KEY');
    }
    if (!user_prompt) {
      throw new Error('Missing user_prompt');
    }

    // 调用 DeepSeek API
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
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
        temperature: temperature || 0.7,
        max_tokens: 100,  // 意图分类只需要很短的响应
        stream: stream
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error:', errorText);
      return new Response(JSON.stringify({
        error: 'Upstream API Error',
        details: errorText
      }), {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // 根据 stream 参数返回不同格式
    if (stream) {
      // 流式响应：直接透传 SSE
      return new Response(response.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      // 非流式响应：解析并返回 JSON
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

  } catch (error) {
    console.error('Edge Function Exception:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error',
      isException: true
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
