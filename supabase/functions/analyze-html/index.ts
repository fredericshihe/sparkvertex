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

    // 验证 JWT 是否具有 service_role 权限
    // 我们创建一个临时的 Supabase Client 来验证 Token，或者手动解析 JWT
    // 这里使用最简单有效的方法：检查 Token 是否解析为 service_role
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    // 创建一个使用请求 Token 的客户端
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 获取用户/角色信息
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // 检查是否是 Service Role (通常 Service Role 不会返回 user，或者我们可以检查 JWT payload)
    // 更直接的方法是检查 JWT 的 role 字段。
    // 由于 Deno 环境限制，我们这里采用一种简单的策略：
    // 如果请求来自我们的 Next.js 后端（使用 Service Role Key），它应该能通过特定的校验。
    
    // 简单策略：直接比较 Authorization Header 是否包含 Service Role Key
    // 注意：这要求您在 Edge Function 环境变量中设置 SERVICE_ROLE_KEY
    // (Supabase CLI 不允许设置以 SUPABASE_ 开头的自定义 secret，所以我们改用 SERVICE_ROLE_KEY)
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
    
    // 如果配置了 Service Role Key，则强制检查
    if (serviceRoleKey) {
       if (token !== serviceRoleKey) {
         // 如果不是 Service Role Key，则拒绝请求
         // 这意味着只有您的 Next.js 后端（拥有 Service Role Key）才能调用此函数
         // 普通用户使用 Anon Key 将被拒绝
         return new Response(JSON.stringify({
           error: 'Unauthorized: Direct access restricted. Please use the application interface.'
         }), {
           status: 401,
           headers: { ...corsHeaders, 'Content-Type': 'application/json' }
         });
       }
    } else {
      // 如果没有配置 Service Role Key 环境变量，打印警告（生产环境应配置）
      console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY not set in Edge Function secrets. Security check skipped.');
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
        error: 'DeepSeek API Error',
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