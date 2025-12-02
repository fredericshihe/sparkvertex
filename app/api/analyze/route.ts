import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    // 1. Security Check: Verify User Session
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: Please login first' }, { status: 401 });
    }

    // 2. Rate Limiting
    // Limit: 50 per minute, 200 per day (Analysis is more frequent)
    const { allowed, error: rateLimitError } = await checkRateLimit(
      supabase, 
      session.user.id, 
      'analyze', 
      50, 
      200
    );

    if (!allowed) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    const { system_prompt, user_prompt, temperature = 0.7 } = await request.json();
    
    if (!user_prompt) {
      return NextResponse.json({ error: 'No user_prompt provided' }, { status: 400 });
    }

    // 3. Input Validation
    if (user_prompt.length > 100000) {
      return NextResponse.json({ error: 'Input too long' }, { status: 400 });
    }

    // 4. Try Supabase Edge Function (Priority)
    // This allows using the remote DeepSeek proxy which handles the API key securely
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // SECURITY: Use Service Role Key to authenticate as a privileged caller.
    // This allows you to configure the Edge Function to REJECT requests with the Anon Key,
    // preventing users from bypassing the rate limits in this API route.
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseKey) {
      console.warn('SECURITY WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Edge Function calls may fail or be insecure.');
    }

    if (supabaseUrl && supabaseKey) {
      try {
        const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-html`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({ system_prompt, user_prompt, temperature })
        });

        if (edgeResponse.ok) {
          // Parse SSE stream from Edge Function
          const reader = edgeResponse.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6).trim();
                  if (dataStr === '[DONE]') continue;
                  try {
                    const data = JSON.parse(dataStr);
                    fullContent += data.choices?.[0]?.delta?.content || '';
                  } catch (e) {}
                }
              }
            }
            if (fullContent) {
              return NextResponse.json({ content: fullContent });
            }
          }
        }
      } catch (e) {
        console.warn('Edge Function attempt failed, falling back to local/mock.');
      }
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    // Mock response if no key (or for specific demo prompts if needed)
    if (!apiKey) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000)); // Simulate network delay
      
      // Simple mock responses based on prompt content to simulate "intelligence"
      const promptLower = user_prompt.toLowerCase();
      const systemLower = system_prompt.toLowerCase();
      
      // 1. Category Analysis
      if ((systemLower.includes('应用分类专家') || systemLower.includes('category expert')) && !promptLower.includes('特定类别')) {
        const categories = ['休闲游戏', '实用工具', '办公效率', '教育学习', '生活便利', '创意设计', '数据可视化', '影音娱乐', '开发者工具', 'AI应用'];
        return NextResponse.json({ content: '创意设计' });
      }
      
      // 2. App Type Analysis (Eye Candy, etc.)
      if (promptLower.includes('特定类别') || promptLower.includes('eye candy')) {
        return NextResponse.json({ content: '["Eye Candy", "Micro-Interactions"]' });
      }
      
      // 3. Title Analysis
      if (systemLower.includes('标题') || systemLower.includes('title') || (systemLower.includes('前端代码分析专家') && promptLower.includes('标题'))) {
        return NextResponse.json({ content: systemLower.includes('title') ? 'AI Generated Creative Work' : 'AI 生成的创意作品' });
      }
      
      // 4. Description Analysis
      if (systemLower.includes('产品描述') || systemLower.includes('description') || (systemLower.includes('描述') && !systemLower.includes('prompt'))) {
        return NextResponse.json({ content: systemLower.includes('description') ? 'This is an AI analyzed description. The work contains HTML/CSS/JS code and is an interactive web app with modern UI.' : '这是一个由 AI 自动分析生成的描述。该作品包含 HTML/CSS/JS 代码，是一个交互式网页应用，具有现代化的界面设计。' });
      }
      
      // 5. Prompt Analysis (Check this BEFORE Tech Stack because Prompt request might contain "Tech")
      if (systemLower.includes('逆向工程') || systemLower.includes('prompt')) {
        return NextResponse.json({ content: '# Role\nCreative Developer\n\n# Task\nCreate a web application.\n\n# Style\nModern, Clean.\n\n# Tech\nHTML5, Tailwind CSS, JavaScript' });
      }

      // 6. Tech Stack Analysis
      if (systemLower.includes('技术栈') || systemLower.includes('tech stack') || (promptLower.includes('技术栈') && !promptLower.includes('prompt'))) {
        return NextResponse.json({ content: 'HTML5, CSS3, JavaScript, Tailwind CSS' });
      }
      
      // 7. Security Check
      if (systemLower.includes('安全') || systemLower.includes('security') || promptLower.includes('恶意行为')) {
        return NextResponse.json({ content: JSON.stringify({ isSafe: true, risks: [], severity: 'low' }) });
      }

      return NextResponse.json({ content: 'Mock AI Response' });
    }

    // Real DeepSeek API Call
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: system_prompt || "You are a helpful assistant." },
          { role: "user", content: user_prompt }
        ],
        temperature: temperature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    return NextResponse.json({ content });

  } catch (error: any) {
    console.error('Analysis error occurred.');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
