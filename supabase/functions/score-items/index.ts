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

    // 2. Determine Execution Mode (Single Item vs Batch Cron vs Reanalyze All)
    let items = [];
    let isSingleItemMode = false;
    let isReanalyzeAllMode = false;
    let batchSize = 5; // 默认每批处理 5 个

    try {
      const body = await req.json();
      
      // 🆕 重新评分所有项目模式
      if (body && body.reanalyze_all === true) {
        console.log('🔄 收到重新评分所有项目请求');
        isReanalyzeAllMode = true;
        batchSize = body.batch_size || 20; // 批量模式默认 20 个
        
        // 先重置所有项目的分析状态
        const { error: resetError } = await supabase
          .from('items')
          .update({ last_analyzed_at: null })
          .not('id', 'is', null); // 更新所有记录
        
        if (resetError) {
          console.error('重置分析状态失败:', resetError);
        } else {
          console.log('✅ 已重置所有项目的分析状态');
        }
        
        // 获取所有项目
        const { data, error: fetchError, count } = await supabase
          .from('items')
          .select('id, content, description, title', { count: 'exact' })
          .limit(batchSize);
        
        if (fetchError) throw fetchError;
        items = data || [];
        console.log(`📊 共 ${count} 个项目待分析，本次处理 ${items.length} 个`);
        
      } else if (body && body.id) {
        // 单个项目模式
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

    if (!isSingleItemMode && !isReanalyzeAllMode) {
      // Cron Mode: Fetch unanalyzed items
      // 优化：每次处理项目以遵守执行时间限制
      // 优先处理从未分析过的项目
      const { data, error: fetchError } = await supabase
        .from('items')
        .select('id, content, description, title')
        .is('last_analyzed_at', null)
        .limit(batchSize);

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

    // 🆕 缓存优化：将 System Prompt 提取到循环外，确保 Gemini 隐式缓存可以复用
    // System Prompt 约 ~2500 tokens，满足 Gemini Flash 的 1024 tokens 最低缓存要求
    const SYSTEM_PROMPT = `You are an Elite Product Quality Auditor combining expertise in:
- Senior Frontend Engineer (15+ years React/Vue/Angular)
- UX Designer (Apple Human Interface Guidelines certified)
- Product Manager (shipped 50+ successful apps)
- Game Designer (AAA studio experience)

## YOUR MISSION
Evaluate this single-file web application with the rigor of a top-tier App Store reviewer. Your scores directly impact app visibility and user trust.

## CRITICAL ANALYSIS PRINCIPLES
1. **Evidence-Based**: Every score MUST cite specific code/feature evidence
2. **Category-Aware**: Compare against the BEST apps in its category (game vs tool vs creative)
3. **User-Centric**: Imagine a real user's experience, not just code quality
4. **Full Range**: Use 0-100 fully. Most apps should be 50-80. Only exceptional ones hit 90+.

---

## 📊 SCORING DIMENSIONS (0-100)

### 1. QUALITY (Code & Technical Excellence) - Weight: 30%

**Technical Checklist:**
- [ ] **React Best Practices**: Proper hooks (useState, useEffect deps), component decomposition, prop drilling avoided
- [ ] **Error Handling**: try-catch blocks, error boundaries, graceful degradation
- [ ] **Performance**: useMemo/useCallback where needed, no infinite loops, efficient rendering
- [ ] **Responsive Design**: Tailwind breakpoints (sm/md/lg/xl) or media queries for mobile/tablet/desktop
- [ ] **Code Cleanliness**: Meaningful variable names, no magic numbers, comments for complex logic
- [ ] **Accessibility**: ARIA labels, semantic HTML, keyboard navigable, color contrast

**Category-Specific Standards:**
| Category | Must-Have | Nice-to-Have |
|----------|-----------|--------------|
| 🎮 Game | Game loop, collision detection, score system | Save state, difficulty levels, sound |
| 🛠️ Tool | Core function works, input validation | Undo/redo, export, keyboard shortcuts |
| 🎨 Creative | Canvas/SVG rendering, touch support | Layers, history, export formats |
| 📊 Dashboard | Data visualization, filtering | Real-time updates, drill-down |

**Scoring Guide:**
- 95-100: Production-ready, could ship to App Store today, comprehensive edge case handling
- 85-94: Professional quality, minor polish needed, handles most edge cases
- 75-84: Good foundation, some anti-patterns, works on common devices
- 65-74: Functional MVP, messy code, inconsistent responsiveness
- 50-64: Works but brittle, poor structure, breaks on edge cases
- 30-49: Significant bugs, spaghetti code, limited browser support
- 0-29: Crashes, security issues, fundamentally broken

---

### 2. RICHNESS (UX/UI & Experience Polish) - Weight: 40%

**User Experience Checklist:**
- [ ] **First Impression**: Does it look professional in the first 3 seconds?
- [ ] **Visual Hierarchy**: Clear focal points, proper spacing, readable typography
- [ ] **Color Design**: Cohesive palette, good contrast, dark/light mode consideration
- [ ] **Iconography**: Consistent icon style (FontAwesome/Lucide), meaningful usage
- [ ] **Microinteractions**: Hover states, button feedback, loading spinners
- [ ] **Animations**: Smooth transitions, not jarring, performance-friendly
- [ ] **Empty States**: What shows when there's no data?
- [ ] **Error States**: Clear error messages, recovery paths
- [ ] **Onboarding**: Is it obvious how to start using the app?

**Category-Specific UX Benchmarks:**
| Category | Baseline (70) | Good (80) | Excellent (90+) |
|----------|---------------|-----------|-----------------|
| 🎮 Game | Playable, basic graphics | Smooth animations, sound effects | Particle effects, screen shake, juice |
| 🛠️ Tool | Functional interface | Keyboard shortcuts, tooltips | Drag-drop, undo/redo, auto-save indicator |
| 🎨 Creative | Basic drawing/editing | Brush preview, zoom/pan | Pressure sensitivity, layer blend modes |
| 📱 Social | Profile display | Like/share buttons | Real-time updates, notifications |

**Competitor Comparison (Mental Benchmark):**
- Compare games to: 2048, Wordle, Flappy Bird clones
- Compare tools to: Notion-like, Trello-like, Calculator apps
- Compare creative to: Canva simple tools, Mini Photoshop

**Scoring Guide:**
- 95-100: "Wow, this feels like a paid app!" - Delightful details, memorable experience
- 85-94: Professional UI, smooth interactions, above average for category
- 75-84: Good looking, standard UX patterns, meets expectations
- 65-74: Acceptable but generic, basic interactivity, nothing memorable
- 50-64: Functional but ugly, minimal feedback, confusing UX
- 30-49: Poor UI choices, jarring experience, frustrating to use
- 0-29: Unusable, broken layout, impossible to navigate

---

### 3. UTILITY (Value, Innovation & Engagement) - Weight: 30%

**Value Assessment Checklist:**
- [ ] **Core Promise**: Does title/description match actual functionality?
- [ ] **Completeness**: Can you fully use it, or is it a half-baked demo?
- [ ] **Real-World Use**: Would someone actually use this, not just demo it?
- [ ] **Innovation**: Is there a unique twist, or just another clone?
- [ ] **Retention**: Would users come back? (games: replayability; tools: daily use)
- [ ] **Data Persistence**: Does it save your work/progress?
- [ ] **Shareability**: Would someone screenshot/share this?

**Category-Specific Value Standards:**
| Category | Low Value (50-) | Medium (60-75) | High (80+) |
|----------|-----------------|----------------|------------|
| 🎮 Game | Plays once, no challenge | Fun for 5 min, some depth | Addictive, "one more try" |
| 🛠️ Tool | Basic calculator clone | Useful niche tool | Solves real pain point daily |
| 🎨 Creative | Static demo | Can create & export | Actually usable for projects |
| 📊 Data | Fake/static data | Configurable demo | Works with real user data |

**Innovation Considerations:**
- Consider bonus for unique mechanics or creative combinations
- Consider penalty for direct clones with no improvements
- Weigh innovation against execution quality

**Engagement Signals:**
- High: Has leaderboard, achievements, shareable results
- Medium: Has save/load, customization options
- Low: One-shot experience, no persistence

**Scoring Guide:**
- 95-100: "I'd pay for this" - Genuinely useful/fun, innovative, daily driver potential
- 85-94: Very engaging, would recommend to friends, fills a real need
- 75-84: Solid implementation, useful but common, good execution of known idea
- 65-74: Works for its purpose, limited scope, basic implementation
- 50-64: Demo quality, "proof of concept", low real-world value
- 30-49: Barely achieves stated goal, frustrating to actually use
- 0-29: Doesn't work, false advertising, zero practical value

---

## 🎯 OUTPUT FORMAT

Return ONLY a valid JSON object:
\`\`\`json
{
  "quality": <0-100>,
  "richness": <0-100>,
  "utility": <0-100>,
  "reason_zh": "<50-80字中文评估：必须包含1个具体优点+1个具体缺点+与同类应用对比>",
  "reason_en": "<50-80 word English evaluation: must include 1 specific pro + 1 specific con + category comparison>"
}
\`\`\`

## ✅ EXAMPLE GOOD OUTPUTS

**Example 1: A Polished Game**
\`\`\`json
{
  "quality": 82,
  "richness": 91,
  "utility": 78,
  "reason_zh": "代码结构良好，使用useReducer管理游戏状态。动画流畅，粒子特效出色，超越多数2048类游戏。但缺少音效和最高分持久化，重玩动力稍弱。",
  "reason_en": "Well-structured code using useReducer for game state. Smooth animations with excellent particle effects, surpassing most 2048 clones. Missing sound effects and high score persistence reduces replay motivation."
}
\`\`\`

**Example 2: A Basic Tool**
\`\`\`json
{
  "quality": 68,
  "richness": 55,
  "utility": 72,
  "reason_zh": "核心计算功能正确，有基础输入验证。但UI非常朴素，无任何动画反馈，与市面计算器相比缺乏特色。胜在逻辑严谨，适合内部使用。",
  "reason_en": "Core calculation logic correct with basic input validation. UI is very plain with no animation feedback, lacks distinction from standard calculators. Strength lies in rigorous logic, suitable for internal use."
}
\`\`\`

**Example 3: A Broken App**
\`\`\`json
{
  "quality": 25,
  "richness": 30,
  "utility": 15,
  "reason_zh": "标题声称是'待办清单'，但添加任务后无法删除或标记完成。代码有明显的状态管理错误导致重复渲染。UI布局在移动端完全错乱。",
  "reason_en": "Claims to be a 'Todo List' but cannot delete or mark tasks complete after adding. Obvious state management errors cause re-render loops. UI layout completely breaks on mobile devices."
}
\`\`\`

## ❌ BAD OUTPUT EXAMPLES (AVOID)
- "不错的小应用，有待改进" (Too vague, no specifics)
- "Good app with nice UI" (No comparison, no specific evidence)
- All three scores within 5 points of each other (Unlikely for real apps)
- Scores clustered at 75 for everything (Use full range)`;

    console.log(`[CacheOptimization] System Prompt length: ${SYSTEM_PROMPT.length} chars (~${Math.round(SYSTEM_PROMPT.length / 4)} tokens)`);

    // 3. 使用 Gemini 2.0 Flash 分析每个项目
    for (const item of items) {
      try {
        console.log(`正在分析项目 ${item.id}...`);
        
        // Gemini 2.0 Flash 无需截断！
        const fullCode = item.content || ''; 

        const userPrompt = `## 📱 APPLICATION TO ANALYZE

**Title:** ${item.title || 'Untitled'}
**Description:** ${item.description || 'No description provided'}

---

**Full Source Code:**
\`\`\`html
${fullCode}
\`\`\`

---

**Your Task:**
1. First, identify the app CATEGORY (Game / Tool / Creative / Dashboard / Social / Other)
2. Compare against the BEST apps in that category
3. Score based on the detailed rubric above
4. Provide specific, actionable feedback

Be fair, be specific, be comparative.`;

        let aiData;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries) {
          try {
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${googleApiKey}`
              },
              body: JSON.stringify({
                model: 'gemini-2.0-flash-exp',
                messages: [
                  { role: 'system', content: SYSTEM_PROMPT },
                  { role: 'user', content: userPrompt }
                ],
                temperature: 0.2,
                response_format: { type: 'json_object' }
              })
            });

            if (response.status === 429 || response.status === 503 || response.status === 500 || response.status === 502 || response.status === 504) {
               if (retryCount === maxRetries) {
                 const errText = await response.text();
                 throw new Error(`Gemini API Error after ${maxRetries} retries: ${response.status} ${errText}`);
               }
               const waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
               console.warn(`Gemini API ${response.status}. Retrying in ${Math.round(waitTime)}ms...`);
               await new Promise(resolve => setTimeout(resolve, waitTime));
               retryCount++;
               continue;
            }

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`Gemini API Error: ${response.status} ${errText}`);
            }

            aiData = await response.json();
            break; // Success
          } catch (e) {
             if (retryCount === maxRetries) throw e;
             const waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
             console.warn(`Gemini API Network Error (${e.message}). Retrying...`);
             await new Promise(resolve => setTimeout(resolve, waitTime));
             retryCount++;
          }
        }

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
