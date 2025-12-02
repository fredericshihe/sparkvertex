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

  let taskId: string | null = null;

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
    const body = await req.json();
    taskId = body.taskId;
    const { system_prompt, user_prompt, type, image_url } = body;
    
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

    // 6. Call LLM
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    
    // OPTIMIZATION 1: Model Routing (Mixed Model Strategy)
    // Use Gemini 3 Pro Preview for speed by default (Creation), Gemini 2.5 Flash for modifications (Point-and-Click)
    let modelName = 'gemini-3-pro-preview';
    if (type === 'modification') {
        modelName = 'gemini-2.5-flash';
    }
    
    const envModel = Deno.env.get('GOOGLE_MODEL_NAME');
    if (envModel) {
        modelName = envModel;
    }

    if (!apiKey) {
        throw new Error('Missing API Key');
    }

    // OPTIMIZATION 5: Precise Diff Strategy
    // Enforce strict context limits in system prompt to reduce token usage
    let finalSystemPrompt = system_prompt || 'You are a helpful assistant.';
    if (type === 'modification') {
        finalSystemPrompt += '\n\nCRITICAL INSTRUCTION: When generating diffs, DO NOT output large chunks of unchanged code. Only output the specific lines being modified with 3 lines of context before and after. This is for performance.';
    }

    // Construct messages
    const messages = [
        { role: 'system', content: finalSystemPrompt }
    ];

    if (image_url) {
        messages.push({
            role: 'user',
            content: [
                { type: 'text', text: String(user_prompt) },
                {
                    type: 'image_url',
                    image_url: {
                        url: image_url
                    }
                }
            ]
        });
    } else {
        messages.push({ role: 'user', content: String(user_prompt) });
    }

    // OPTIMIZATION 6: Prefill (Pre-computation)
    // Force the model to start immediately with the diff format
    // Note: We must manually initialize fullContent with this prefix later
    if (type === 'modification') {
        messages.push({ role: 'assistant', content: '<<<<SEARCH' });
    }

    // Create a stream to return to the client immediately
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            
            try {
                // Send initial keep-alive
                try {
                    controller.enqueue(encoder.encode(JSON.stringify({ status: 'started' }) + '\n'));
                } catch (e) {
                    console.log('Client disconnected immediately');
                    return;
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
                    messages: messages,
                    stream: true
                  })
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  console.error('Upstream API Error:', response.status, errorText);
                  throw new Error(`Upstream API Error: ${response.status} ${errorText}`);
                }

                // 7. Process Stream & Update DB
                const reader = response.body?.getReader();
                const decoder = new TextDecoder();
                
                // Initialize fullContent with prefill if applicable
                // This ensures the frontend receives the full valid syntax even if the model skips the prefilled part
                let fullContent = (type === 'modification') ? '<<<<SEARCH' : '';
                
                let dbBuffer = ''; 
                let streamBuffer = ''; 
                let lastUpdate = Date.now();
                let lastBroadcastLength = fullContent.length; // Track last broadcast length for debounce
                let streamClosed = false; 
                
                const taskChannel = supabaseAdmin.channel(`task-${taskId}`);
                taskChannel.subscribe((status) => {
                    if (status !== 'SUBSCRIBED') { 
                        console.log(`Channel status: ${status}`);
                    }
                });

                if (reader) {
                  while (true) {
                    if (streamClosed) {
                        console.log('Client disconnected, stopping generation');
                        break;
                    }

                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    streamBuffer += chunk;
                    
                    const lines = streamBuffer.split('\n');
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

                    // OPTIMIZATION 4: Realtime Debounce
                    // Accumulate ~150 chars or wait 500ms before broadcasting
                    // This significantly reduces the number of WebSocket messages
                    const contentDiff = fullContent.length - lastBroadcastLength;
                    
                    if (contentDiff > 150 || (contentDiff > 0 && Date.now() - lastUpdate > 500)) {
                        const newChunk = fullContent.slice(lastBroadcastLength);
                        
                        const msg = {
                            type: 'broadcast',
                            event: 'chunk',
                            payload: { 
                                chunk: newChunk, 
                                fullContent: fullContent,
                                taskId: taskId
                            }
                        };

                        try {
                            const channelAny = taskChannel as any;
                            if (typeof channelAny.httpSend === 'function') {
                                await channelAny.httpSend(msg);
                            } else {
                                await taskChannel.send(msg);
                            }
                        } catch (rtError) {
                            console.warn('Realtime send failed:', rtError);
                        }
                        
                        lastBroadcastLength = fullContent.length;
                        lastUpdate = Date.now();
                        
                        try {
                            controller.enqueue(encoder.encode(JSON.stringify({ status: 'processing', length: fullContent.length }) + '\n'));
                        } catch (streamErr) {
                            console.log('Stream closed by client, stopping updates');
                            streamClosed = true;
                            break; 
                        }
                    }

                    // OPTIMIZATION 3: DB Throttling
                    // REMOVED intermediate DB updates. 
                    // We only write to the database once at the very end to reduce IOPS and latency.
                  }
                }

                // Final Update - Always save to DB even if client disconnected
                console.log('Generation completed, saving result...');
                await supabaseAdmin
                    .from('generation_tasks')
                    .update({ result_code: fullContent, status: 'completed' })
                    .eq('id', taskId);
                console.log('Result saved successfully');
                
                // Broadcast completion via Realtime
                try {
                    const completionMsg = {
                        type: 'broadcast',
                        event: 'completed',
                        payload: { taskId, fullContent }
                    };
                    
                    const channelAny = taskChannel as any;
                    if (typeof channelAny.httpSend === 'function') {
                        await channelAny.httpSend(completionMsg);
                    } else {
                        await taskChannel.send(completionMsg);
                    }
                } catch (rtErr) {
                    console.log('Realtime completion broadcast failed:', rtErr);
                }
                
                // Clean up channel
                try {
                    await supabaseAdmin.removeChannel(taskChannel);
                } catch (e) {
                    console.log('Channel cleanup warning:', e);
                }
                
                // Send final message only if stream is still open
                if (!streamClosed) {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify({ status: 'completed' }) + '\n'));
                    } catch (e) {
                        console.log('Stream already closed, skipping final message');
                    }
                }
                
                try {
                    controller.close();
                } catch (e) {
                    // Ignore stream closed errors
                }
            } catch (error: any) {
                console.error('Async Generation Error:', error);
                
                const errorMessage = error.message || 'Unknown error occurred during generation';

                // Try to update task status to failed
                try {
                    if (taskId) {
                        await supabaseAdmin
                            .from('generation_tasks')
                            .update({ status: 'failed', error_message: errorMessage })
                            .eq('id', taskId);
                    }
                } catch (e) {}
                
                // Try to send error message if stream is still open
                try {
                    if (!controller.desiredSize || controller.desiredSize >= 0) {
                        controller.enqueue(encoder.encode(JSON.stringify({ error: errorMessage }) + '\n'));
                    }
                } catch (e) {
                    console.log('Cannot send error, stream already closed');
                }
                
                try {
                    controller.close();
                } catch (e) {
                    console.log('Stream already closed');
                }
            }
        }
    });

    return new Response(stream, { 
        headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/x-ndjson',
            'X-Content-Type-Options': 'nosniff'
        } 
    });

  } catch (error: any) {
    console.error('Main Handler Error:', error);

    // Try to update task status to failed if we have a taskId
    if (taskId) {
        try {
            const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );
            await supabaseAdmin
                .from('generation_tasks')
                .update({ status: 'failed', error_message: error.message })
                .eq('id', taskId);
        } catch (e) {
            console.error('Failed to update task status:', e);
        }
    }

    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
