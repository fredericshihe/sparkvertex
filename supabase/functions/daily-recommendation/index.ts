import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase Client with Service Role Key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey || !deepseekApiKey) {
      throw new Error('Missing environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch unanalyzed items (Limit 5 per run to avoid timeouts)
    // Prioritize items that have never been analyzed
    const { data: items, error: fetchError } = await supabase
      .from('items')
      .select('id, content, description, title')
      .is('last_analyzed_at', null)
      .limit(5);

    if (fetchError) throw fetchError;

    if (!items || items.length === 0) {
      // If all new items are analyzed, check for old items to re-analyze (optional, maybe older than 30 days)
      // For now, just return
      return new Response(JSON.stringify({ message: 'No new items to analyze' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    // 2. Analyze each item
    for (const item of items) {
      try {
        const codeSnippet = item.content ? item.content.substring(0, 15000) : ''; // Truncate to avoid token limits
        
        const systemPrompt = `You are a Senior Code Auditor and Product Manager. 
Analyze the provided HTML/JS code for a single-file web application.
Evaluate it on three dimensions (0-100 score):
1. Quality: Code cleanliness, modern practices (React/Tailwind), error handling, structure.
2. Richness: Feature completeness, UI complexity, visual appeal, interactivity.
3. Utility: Practical value, problem-solving capability, reusability.

Return ONLY a valid JSON object in this format:
{
  "quality": number,
  "richness": number,
  "utility": number,
  "reason": "Short summary of the evaluation (max 50 words)"
}`;

        const userPrompt = `Title: ${item.title}\nDescription: ${item.description}\nCode:\n${codeSnippet}`;

        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deepseekApiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' } 
          })
        });

        if (!response.ok) {
          console.error(`API Error for item ${item.id}: ${response.statusText}`);
          continue;
        }

        const aiData = await response.json();
        const content = aiData.choices[0].message.content;
        let scores;
        
        try {
          scores = JSON.parse(content);
        } catch (e) {
          console.error(`JSON Parse Error for item ${item.id}:`, content);
          continue;
        }

        // 3. Update Item in DB
        const { error: updateError } = await supabase
          .from('items')
          .update({
            quality_score: scores.quality,
            richness_score: scores.richness,
            utility_score: scores.utility,
            analysis_reason: scores.reason,
            last_analyzed_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error(`DB Update Error for item ${item.id}:`, updateError);
        } else {
          results.push({ id: item.id, ...scores });
        }

      } catch (err) {
        console.error(`Error processing item ${item.id}:`, err);
      }
    }

    // 4. Update Daily Ranks (Global Ranking)
    // This runs after the batch analysis to keep ranks fresh
    // We rank by total_score (weighted) first, then popularity metrics
    const { error: rankError } = await supabase.rpc('update_daily_ranks');
    
    // If RPC doesn't exist yet (we need to create it in migration), we can do it via raw SQL if supported, 
    // but RPC is safer. For now, let's assume we'll add the RPC in the migration or just skip this step if it fails.
    // Actually, let's add the RPC to the migration file I just created.

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length, 
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
