import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * 🆕 调用 Gemini 2.5 Flash 作为备用模型
 */
async function callGeminiFlash(systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number): Promise<any> {
  const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!googleApiKey) {
    throw new Error('缺少 GOOGLE_API_KEY 环境变量');
  }

  console.log('[Gemini] 🔄 Calling Gemini 2.5 Flash as fallback...');
  
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleApiKey}`
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Gemini] API 错误:', errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('[Gemini] ✅ Fallback successful');
  
  // 标记来源为 Gemini
  data._source = 'gemini-fallback';
  return data;
}

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { system_prompt, user_prompt, temperature, stream = false, max_tokens } = await req.json();
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    if (!user_prompt) {
      throw new Error('缺少 user_prompt 参数');
    }

    const systemPromptStr = system_prompt || 'You are a helpful assistant.';
    const userPromptStr = String(user_prompt);
    const tempValue = temperature || 0.3;
    const maxTokensValue = max_tokens || 5000;

    console.log(`[DeepSeek] 收到请求，用户提示: ${userPromptStr.substring(0, 100)}...`);

    // 🆕 尝试调用 DeepSeek，失败时回退到 Gemini
    let data: any;
    let usedFallback = false;

    if (deepseekApiKey) {
      try {
        // 调用 DeepSeek API (带 30 秒超时)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekApiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPromptStr },
              { role: 'user', content: userPromptStr }
            ],
            temperature: tempValue,
            max_tokens: maxTokensValue,
            stream: stream
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[DeepSeek] API 错误:', errorText);
          throw new Error(`DeepSeek API error: ${response.status}`);
        }

        // 流式响应直接透传（不支持 fallback）
        if (stream) {
          console.log('[DeepSeek] 返回流式响应');
          return new Response(response.body, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            }
          });
        }

        data = await response.json();
        data._source = 'deepseek';
        console.log('[DeepSeek] ✅ 返回非流式响应，内容长度:', JSON.stringify(data).length);

      } catch (deepseekError: any) {
        console.warn('[DeepSeek] ❌ 调用失败:', deepseekError.message);
        
        // 🆕 回退到 Gemini
        if (!stream) {
          try {
            data = await callGeminiFlash(systemPromptStr, userPromptStr, tempValue, maxTokensValue);
            usedFallback = true;
          } catch (geminiError: any) {
            console.error('[Gemini] ❌ 备用模型也失败:', geminiError.message);
            throw new Error(`Both DeepSeek and Gemini failed: ${deepseekError.message} / ${geminiError.message}`);
          }
        } else {
          // 流式模式不支持 fallback
          throw deepseekError;
        }
      }
    } else {
      // 没有 DeepSeek API Key，直接用 Gemini
      console.warn('[DeepSeek] ⚠️ 缺少 DEEPSEEK_API_KEY，直接使用 Gemini');
      data = await callGeminiFlash(systemPromptStr, userPromptStr, tempValue, maxTokensValue);
      usedFallback = true;
    }

    if (usedFallback) {
      console.log('[Intent] 🔄 Used Gemini fallback');
    }

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error: any) {
    console.error('[DeepSeek/Gemini] Edge Function 异常:', error);
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
