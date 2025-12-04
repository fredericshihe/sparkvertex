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

    // 5. Credit Deduction
    const COST = type === 'modification' ? 0.5 : 3.0;
    
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single();
      
    if (profileError || !profile) {
       console.error('Profile fetch error:', profileError);
       return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const currentCredits = Number(profile.credits || 0);
    console.log(`User ${user.id} has ${currentCredits} credits. Cost: ${COST}`);

    if (currentCredits < COST) {
       return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const newCredits = currentCredits - COST;
    
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', user.id);
      
    if (updateError) {
       console.error('Credit deduction error:', updateError);
       return new Response(JSON.stringify({ error: 'Failed to deduct credits' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    console.log(`Deducted ${COST} credits. New balance: ${newCredits}`);

    // Update status to processing
    await supabaseAdmin
      .from('generation_tasks')
      .update({ status: 'processing' })
      .eq('id', taskId);

    // 6. Call LLM
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    // OPTIMIZATION 1: Model Routing (Mixed Model Strategy)
    // Use Gemini 3 Pro Preview for speed by default (Creation).
    // For modifications, we use Gemini 2.5 Pro as primary if no image is involved.
    let primaryProvider = 'google';
    let modelName = 'gemini-3-pro-preview';
    
    if (type === 'modification' && !image_url) {
        primaryProvider = 'google';
        modelName = 'gemini-2.5-pro';
    }
    
    const envModel = Deno.env.get('GOOGLE_MODEL_NAME');
    if (envModel && primaryProvider === 'google') {
        modelName = envModel;
    }

    if (primaryProvider === 'google' && !googleApiKey) {
        throw new Error('Missing Google API Key');
    }
    if (primaryProvider === 'deepseek' && !deepseekApiKey) {
        // Fallback to Google if DeepSeek key is missing
        console.warn('Missing DeepSeek API Key, falling back to Google');
        primaryProvider = 'google';
        modelName = 'gemini-3-pro-preview';
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

                let response;
                let retryCount = 0;
                const maxRetries = 3;
                let currentProvider = primaryProvider;
                let currentModel = modelName;

                // Helper to fetch from provider
                const fetchCompletion = async (provider: string, model: string) => {
                    if (provider === 'deepseek') {
                        return await fetch('https://api.deepseek.com/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${deepseekApiKey}`
                            },
                            body: JSON.stringify({
                                model: model, // Use the passed model name (deepseek-reasoner)
                                messages: messages,
                                stream: true,
                                temperature: 0.7,
                                max_tokens: 8192 // Explicitly set max_tokens for DeepSeek Reasoner if needed, though it defaults high
                            })
                        });
                    } else {
                        return await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${googleApiKey}`
                            },
                            body: JSON.stringify({
                                model: model,
                                max_tokens: 65536,
                                messages: messages,
                                stream: true
                            })
                        });
                    }
                };

                while (true) {
                    try {
                        console.log(`Attempting generation with ${currentProvider} (${currentModel})...`);
                        response = await fetchCompletion(currentProvider, currentModel);

                        if (response.ok) break;

                        const errorText = await response.text();
                        
                        // Log usage metadata for debugging cache hits
                        try {
                            // Note: usage_metadata is not available in error response, but might be in success response headers or body
                            // For stream=true, usage is usually in the last chunk.
                        } catch (e) {}

                        // Retry on 503 (Overloaded) or 429 (Rate Limit)
                        if (response.status === 503 || response.status === 429) {
                            console.warn(`Provider ${currentProvider} Error (${response.status}): ${errorText}`);
                            
                            // If Google fails with 429, switch to Gemini 2.5 Pro immediately if available
                            if (currentProvider === 'google' && response.status === 429 && !image_url && currentModel !== 'gemini-2.5-pro') {
                                console.warn('Google Quota Exceeded. Switching to Gemini 2.5 Pro fallback...');
                                currentProvider = 'google';
                                currentModel = 'gemini-2.5-pro'; 
                                retryCount = 0; // Reset retries for new provider
                                continue;
                            }

                            retryCount++;
                            if (retryCount > maxRetries) {
                                // If we exhausted retries on Google and haven't switched yet (maybe due to image_url), try Gemini 2.5 Pro if possible
                                if (currentProvider === 'google' && !image_url && currentModel !== 'gemini-2.5-pro') {
                                     console.warn('Google Max Retries. Switching to Gemini 2.5 Pro fallback...');
                                     currentProvider = 'google';
                                     currentModel = 'gemini-2.5-pro';
                                     retryCount = 0;
                                     continue;
                                }
                                
                                throw new Error(`Upstream API Error: ${response.status} ${errorText}`);
                            }
                            
                            const delay = retryCount * 1000; 
                            console.warn(`Retrying in ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }

                        throw new Error(`Upstream API Error: ${response.status} ${errorText}`);

                    } catch (e: any) {
                        // If it's the error we just threw, rethrow it
                        if (e.message.startsWith('Upstream API Error')) throw e;
                        
                        // Network errors
                        retryCount++;
                        if (retryCount > maxRetries) throw e;
                        
                        const delay = retryCount * 1000;
                        console.warn(`Network Error: ${e.message}. Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }

                // 7. Process Stream & Update DB
                const reader = response.body?.getReader();
                const decoder = new TextDecoder();
                
                // Initialize fullContent
                let fullContent = '';
                
                let dbBuffer = ''; 
                let streamBuffer = ''; 
                let lastUpdate = Date.now();
                let lastBroadcastLength = fullContent.length; // Track last broadcast length for debounce
                let streamClosed = false; 
                
                const taskChannel = supabaseAdmin.channel(`task-${taskId}`);
                await taskChannel.subscribe((status) => {
                    if (status !== 'SUBSCRIBED') { 
                        console.log(`Channel status: ${status}`);
                    }
                });

                if (reader) {
                  try {
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
                              taskChannel.send(msg);
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
                    }
                  } catch (streamError: any) {
                      console.error('Stream reading error:', streamError);
                      // If we have partial content, we should try to save it or at least not fail completely if it's substantial
                      if (fullContent.length > 100) {
                          console.log('Recovering from stream error with partial content...');
                      } else {
                          throw streamError;
                      }
                  }
                }

                // Final Update - Always save to DB even if client disconnected
                console.log('Generation completed, saving result...');
                
                // SAFETY FIX: Remove Python-style Unicode escapes that crash JS (Backend Sync)
                const sanitizedContent = fullContent.replace(/\\U([0-9a-fA-F]{8})/g, (match, p1) => {
                    return '\\u{' + p1.replace(/^0+/, '') + '}';
                });

                await supabaseAdmin
                    .from('generation_tasks')
                    .update({ result_code: sanitizedContent, status: 'completed' })
                    .eq('id', taskId);
                console.log('Result saved successfully');
                
                // Broadcast completion via Realtime
                try {
                    const completionMsg = {
                        type: 'broadcast',
                        event: 'completed',
                        payload: { taskId, fullContent }
                    };
                    
                    taskChannel.send(completionMsg);
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
