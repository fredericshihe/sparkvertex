import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 安全检查 ---
    // 注意：意图分类是轻量级操作，可以不强制要求用户登录
    // 但如果需要限制滥用，可以取消下面的注释
    /*
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未授权' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    */
    // --- 安全检查结束 ---

    const { system_prompt, user_prompt, temperature, stream = false } = await req.json();
    const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    if (!apiKey) {
      throw new Error('缺少 DEEPSEEK_API_KEY 环境变量');
    }
    if (!user_prompt) {
      throw new Error('缺少 user_prompt 参数');
    }

    console.log(`[DeepSeek] 收到请求，用户提示: ${String(user_prompt).substring(0, 100)}...`);

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
        temperature: temperature || 0.3,
        max_tokens: 200,  // 意图分类需要返回 JSON，稍微增加 token 限制
        stream: stream
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DeepSeek] API 错误:', errorText);
      return new Response(JSON.stringify({
        error: '上游 API 错误',
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
      console.log('[DeepSeek] 返回流式响应');
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
      console.log('[DeepSeek] 返回非流式响应，内容长度:', JSON.stringify(data).length);
      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

  } catch (error) {
    console.error('[DeepSeek] Edge Function 异常:', error);
    return new Response(JSON.stringify({
      error: error.message || '未知错误',
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
