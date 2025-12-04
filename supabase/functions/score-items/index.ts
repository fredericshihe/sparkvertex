import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Environment & Auth Setup
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey || !googleApiKey) {
      throw new Error('缺少环境变量 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY)');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Determine Execution Mode (Single Item vs Batch Cron)
    let items = [];
    let isSingleItemMode = false;

    try {
      const body = await req.json();
      if (body && body.id) {
        console.log(`收到单个项目分析请求: ${body.id}`);
        const { data, error } = await supabase
          .from('items')
          .select('id, content, description, title')
          .eq('id', body.id)
          .single();
        
        if (error) throw error;
        if (data) {
          items = [data];
          isSingleItemMode = true;
        }
      }
    } catch (e) {
      // Body parsing failed or empty (expected for Cron calls)
    }

    if (!isSingleItemMode) {
      // Cron Mode: Fetch 5 unanalyzed items
      // 优化：每次处理5个项目以遵守执行时间限制
      // 优先处理从未分析过的项目
      const { data, error: fetchError } = await supabase
        .from('items')
        .select('id, content, description, title')
        .is('last_analyzed_at', null)
        .limit(5);

      if (fetchError) throw fetchError;
      items = data || [];
    }

    if (!items || items.length === 0) {
      // 即使没有新项目，仍然更新排名（如果是 Cron 任务）
      if (!isSingleItemMode) {
         try {
            console.log('没有新项目需要分析，正在更新每日排名...');
            await supabase.rpc('update_daily_ranks');
         } catch (e) {
            console.warn('更新每日排名失败:', e);
         }
      }

      return new Response(JSON.stringify({ message: '没有项目需要分析' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    // 3. 使用 Gemini 2.0 Flash 分析每个项目
    // 优化：使用 Gemini 2.0 Flash 以获得高速度和大上下文窗口
    // 这允许我们分析完整的代码文件而无需截断，确保最高精度
    for (const item of items) {
      try {
        console.log(`正在分析项目 ${item.id}...`);
        
        // Gemini 2.0 Flash 无需截断！
        const fullCode = item.content || ''; 
        
        const systemPrompt = `You are a Senior Code Auditor and Product Quality Expert.
Your task is to evaluate a single-file web application based on its source code.

Evaluate on three dimensions (0-100 score) using this strict rubric:

1. **Quality (Code & Architecture)**
   - 90-100: Production-ready, clean React/Tailwind, robust error handling, responsive, accessible, semantic HTML.
   - 70-89: Good structure, minor issues, mostly responsive.
   - 50-69: Functional but messy, poor naming, lack of responsiveness.
   - <50: Broken, spaghetti code, security risks.

2. **Richness (UX & Features)**
   - 90-100: Stunning UI, smooth animations, complex interactivity, "Wow" factor, complete feature set.
   - 70-89: Good looking, standard interactions, core features work well.
   - 50-69: Basic UI, bare minimum features, looks generic.
   - <50: Ugly, broken layout, missing features.

3. **Utility (Value & Innovation)**
   - 90-100: Solves a real problem uniquely, high replay value, or extremely useful tool.
   - 70-89: Useful but common (e.g., a good calculator), or fun but short-lived.
   - 50-69: Tech demo, low practical value.
   - <50: Useless, broken logic.

For reason_zh, you MUST use Simplified Chinese.

Return ONLY a valid JSON object:
{
  "quality": number,
  "richness": number,
  "utility": number,
  "reason_zh": "简明扼要、专业的评估总结（最多50字）。重点说明得分原因。必须使用中文。",
  "reason_en": "Concise, professional summary of the evaluation (max 50 words). Focus on why it got these scores. (English)"
}`;

        const userPrompt = `Title: ${item.title}\nDescription: ${item.description}\n\nFull Source Code:\n${fullCode}`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${googleApiKey}`
          },
          body: JSON.stringify({
            model: 'gemini-2.0-flash-exp',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.2, // 低温度以获得一致、客观的评分
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`项目 ${item.id} Gemini API 错误: ${response.status} ${errText}`);
          continue;
        }

        const aiData = await response.json();
        const content = aiData.choices[0].message.content;
        let scores;
        
        try {
          scores = JSON.parse(content);
        } catch (e) {
          // 回退：如果存在 markdown 代码块，尝试提取 JSON
          const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
             try {
                scores = JSON.parse(jsonMatch[1] || jsonMatch[0]);
             } catch (e2) {
                console.error(`项目 ${item.id} JSON 解析错误:`, content);
                continue;
             }
          } else {
             console.error(`项目 ${item.id} JSON 解析错误:`, content);
             continue;
          }
        }

        // 计算总分（加权平均）
        // Quality: 30%, Richness: 40%, Utility: 30%
        const totalScore = Math.round(
            (scores.quality * 0.3) + 
            (scores.richness * 0.4) + 
            (scores.utility * 0.3)
        );

        // 4. 更新数据库中的项目
        const { error: updateError } = await supabase
          .from('items')
          .update({
            quality_score: scores.quality,
            richness_score: scores.richness,
            utility_score: scores.utility,
            total_score: totalScore,
            analysis_reason: scores.reason_zh,
            analysis_reason_en: scores.reason_en,
            last_analyzed_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error(`项目 ${item.id} 数据库更新错误:`, updateError);
        } else {
          console.log(`项目 ${item.id} 评分完成 - 总分: ${totalScore} (质量: ${scores.quality}, 丰富度: ${scores.richness}, 实用性: ${scores.utility})`);
          results.push({ id: item.id, ...scores, total_score: totalScore });
        }

      } catch (err) {
        console.error(`处理项目 ${item.id} 时出错:`, err);
      }
    }

    // 5. 更新每日排名
    // 触发排名重新计算
    try {
        console.log('正在更新每日排名...');
        await supabase.rpc('update_daily_ranks');
        console.log('每日排名更新完成');
    } catch (e) {
        console.warn('更新每日排名失败:', e);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length, 
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge Function 错误:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
