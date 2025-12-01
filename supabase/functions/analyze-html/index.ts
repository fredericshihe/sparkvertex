import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // 获取 Authorization Header
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    // 验证 Service Role Key
    // 确保只有拥有 Service Role Key 的调用者（即我们的 Next.js 后端）才能访问此函数
    // 这防止了用户绕过 Next.js API 中的速率限制直接调用此 Edge Function
    
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = authHeader.replace('Bearer ', '');

    if (!serviceRoleKey) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not set in the environment.');
      return new Response(JSON.stringify({ error: 'Server Configuration Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (token !== serviceRoleKey) {
      console.warn('Unauthorized access attempt to analyze-html');
      return new Response(JSON.stringify({
        error: 'Unauthorized: Direct access restricted.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // --- SECURITY CHECK END ---

    const { system_prompt, user_prompt, temperature } = await req.json();
    const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    if (!apiKey) throw new Error('Missing API Key');
    if (!user_prompt) throw new Error('Missing user_prompt');

    // 2. 构造请求，开启 stream: true
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
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 如果上游报错，这里还是返回 JSON 错误信息
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

    // 3. 直接透传流 (Pipe Through)
    // 这样用户会立刻收到 SSE (Server-Sent Events) 数据流
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Edge Function Exception:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error',
      isException: true
    }), {
      status: 200, // 保持 200 以便前端能解析 JSON 错误（如果不是流式错误）
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});