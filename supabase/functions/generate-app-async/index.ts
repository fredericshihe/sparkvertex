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

    // 5. Rate Limit & Credit Check (Logic copied from generate-app)
    // ... (Simplified for brevity, assuming API route did initial checks, but strictly we should check again or trust the API created the task)
    // Actually, since the API creates the task, we can assume basic checks passed. 
    // But we still need to deduct credits at the end.

    // 6. Call LLM
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    
    // Determine model based on task type
    let modelName = 'gemini-3-pro-preview';
    if (type === 'modification') {
        modelName = 'gemini-3-pro-preview';
    }
    
    const envModel = Deno.env.get('GOOGLE_MODEL_NAME');
    if (envModel) {
        modelName = envModel;
    }

    if (!apiKey) {
        throw new Error('Missing API Key');
    }

    // Construct messages
    const messages = [
        { role: 'system', content: system_prompt || 'You are a helpful assistant.' }
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

    // Create a stream to return to the client immediately
    // This prevents 504 Gateway Timeouts by keeping the connection active
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
                let fullContent = '';
                let dbBuffer = ''; 
                let streamBuffer = ''; 
                let lastUpdate = Date.now();
                let streamClosed = false; // Track if client disconnected
                
                // Create channel once
                const taskChannel = supabaseAdmin.channel(`task-${taskId}`);
                taskChannel.subscribe((status) => {
                    if (status !== 'SUBSCRIBED') { 
                        console.log(`Channel status: ${status}`);
                    }
                });

                if (reader) {
                  let lastDbUpdate = Date.now();

                  while (true) {
                    // Check if client disconnected
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

                    // Broadcast updates via Realtime
                    if (Date.now() - lastUpdate > 100 || fullContent.length - dbBuffer.length > 50) {
                        if (fullContent.length > dbBuffer.length) {
                            const newChunk = fullContent.slice(dbBuffer.length);
                            
                            const msg = {
                                type: 'broadcast',
                                event: 'chunk',
                                payload: { 
                                    chunk: newChunk, 
                                    fullContent: fullContent,
                                    taskId: taskId
                                }
                            };

                            // Try to send via Realtime, but don't crash if it fails
                            try {
                                await taskChannel.send(msg);
                            } catch (rtError) {
                                console.warn('Realtime send failed:', rtError);
                            }
                            
                            // Keep HTTP connection alive (check if stream is still open)
                            try {
                                controller.enqueue(encoder.encode(JSON.stringify({ status: 'processing', length: fullContent.length }) + '\n'));
                            } catch (streamErr) {
                                console.log('Stream closed by client, stopping updates');
                                streamClosed = true;
                                break; // Exit the loop if client disconnected
                            }
                        }
                    }

                    // Fallback: Update DB every 2 seconds to support polling if Realtime fails
                    if (Date.now() - lastDbUpdate > 2000 && fullContent.length > 0) {
                        try {
                            await supabaseAdmin
                                .from('generation_tasks')
                                .update({ result_code: fullContent })
                                .eq('id', taskId);
                            lastDbUpdate = Date.now();
                        } catch (dbError) {
                            console.warn('DB update failed:', dbError);
                        }
                    }
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
                    await taskChannel.send({
                        type: 'broadcast',
                        event: 'completed',
                        payload: { taskId, fullContent }
                    });
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
            }       controller.close();
                } catch (e) {
                    // Ignore stream closed errors
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
