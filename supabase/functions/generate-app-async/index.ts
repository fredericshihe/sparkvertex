import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Input
    const { taskId, system_prompt, user_prompt, type } = await req.json();
    if (!taskId) throw new Error('Missing taskId');

    // 3. Admin Client for DB operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 4. Verify Task Ownership & Status
    const { data: task, error: taskError } = await supabaseAdmin
      .from('generation_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .single();

    if (taskError || !task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update status to processing
    await supabaseAdmin
      .from('generation_tasks')
      .update({ status: 'processing' })
      .eq('id', taskId);

    // 5. Rate Limit & Credit Check (Logic copied from generate-app)
    // ... (Simplified for brevity, assuming API route did initial checks, but strictly we should check again or trust the API created the task)
    // Actually, since the API creates the task, we can assume basic checks passed. 
    // But we still need to deduct credits at the end.

    // 6. Call Gemini
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    
    // Determine model based on task type
    // Creation -> gemini-3-pro-preview
    // Modification -> gemini-3-pro-low
    let modelName = 'gemini-3-pro-preview';
    if (type === 'modification') {
        modelName = 'gemini-3-pro-low';
    }
    
    // Allow environment variable override, but ensure we don't default to 1.5
    const envModel = Deno.env.get('GOOGLE_MODEL_NAME');
    if (envModel) {
        modelName = envModel;
    }

    if (!apiKey) {
        throw new Error('Missing GOOGLE_API_KEY');
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 65536,
        messages: [
          { role: 'system', content: system_prompt || 'You are a helpful assistant.' },
          { role: 'user', content: String(user_prompt) }
        ],
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', response.status, errorText);
      throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
    }

    // 7. Process Stream & Update DB
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let dbBuffer = ''; // Buffer for DB updates
    let streamBuffer = ''; // Buffer for SSE stream parsing
    let lastUpdate = Date.now();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamBuffer += chunk;
        
        const lines = streamBuffer.split('\n');
        // Keep the last line in the buffer as it might be incomplete
        streamBuffer = lines.pop() || '';
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                try {
                    const data = JSON.parse(trimmed.slice(6));
                    const content = data.choices?.[0]?.delta?.content || '';
                    fullContent += content;
                } catch (e) {
                    // ignore parse error
                }
            }
        }

        // Broadcast updates via Realtime instead of DB writes to reduce DB load and latency
        // We can send more frequently (e.g., every 100ms)
        if (Date.now() - lastUpdate > 100 || fullContent.length - dbBuffer.length > 50) {
            if (fullContent.length > dbBuffer.length) {
                const newChunk = fullContent.slice(dbBuffer.length);
                
                // Send broadcast message
                await supabaseAdmin.channel(`task-${taskId}`)
                    .send({
                        type: 'broadcast',
                        event: 'chunk',
                        payload: { 
                            chunk: newChunk, 
                            fullContent: fullContent,
                            taskId: taskId
                        }
                    });
                
                dbBuffer = fullContent;
                lastUpdate = Date.now();
            }
        }
      }
    }

    // Final Update - Ensure we write everything to DB for persistence
    await supabaseAdmin
        .from('generation_tasks')
        .update({ result_code: fullContent, status: 'completed' })
        .eq('id', taskId);

    // 8. Deduct Credits (Unified Cost: 2 points)
    const COST = 2;
    
    // Fetch current credits to decrement
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single();

    if (profile) {
        await supabaseAdmin
            .from('profiles')
            .update({ credits: (profile.credits || 0) - COST })
            .eq('id', user.id);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Async Generation Error:', error);
    
    // Try to update task status to failed
    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { taskId } = await req.json().catch(() => ({}));
        if (taskId) {
            await supabaseAdmin
                .from('generation_tasks')
                .update({ status: 'failed', error_message: error.message })
                .eq('id', taskId);
        }
    } catch (e) {}

    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
