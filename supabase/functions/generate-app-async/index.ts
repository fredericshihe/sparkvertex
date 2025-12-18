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
    const { system_prompt, user_prompt, type, image_url, model: requestedModel, tokens_per_credit } = body;
    
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

    // 🆓 检查是否使用免费模型 (DeepSeek)
    const isFreeModel = requestedModel === 'deepseek-v3';
    
    // 5. Check Credits (不扣费，只检查余额) - 免费模型跳过积分检查
    // const COST = type === 'modification' ? 5.0 : 15.0;
    // 改为基于 Token 计费，最低预留 1 积分
    const MIN_REQUIRED = isFreeModel ? 0 : 1;
    
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single();
      
    if (profileError || !profile) {
       console.error('获取用户资料失败:', profileError);
       return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const currentCredits = Number(profile.credits || 0);

    if (!isFreeModel && currentCredits < MIN_REQUIRED) {
       return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update status to processing
    await supabaseAdmin
      .from('generation_tasks')
      .update({ status: 'processing' })
      .eq('id', taskId);

    // 6. Call LLM
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    
    // 模型配置：支持用户选择的模型
    // 不同模型的积分汇率（基于 Gemini 官方定价）:
    // - deepseek-v3: 免费模型，不消耗积分
    // - gemini-2.5-flash: 1积分 = 15000 tokens (最便宜，速度快)
    // - gemini-3-flash-preview: 1积分 = 7000 tokens (性价比高，速度快)
    // - gemini-3-pro-preview: 1积分 = 3000 tokens (最强，最贵)
    // 注意：上下文 > 200k tokens 时，价格自动翻倍（tokensPerCredit / 2）
    const VALID_MODELS = ['deepseek-v3', 'gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-3-pro-preview'];
    const DEFAULT_TOKENS_PER_CREDIT: Record<string, number> = {
        'deepseek-v3': 0, // 免费
        'gemini-2.5-flash': 15000,
        'gemini-3-flash-preview': 7000,
        'gemini-3-pro-preview': 3000
    };
    // 超长上下文阈值（200k tokens）
    const LONG_CONTEXT_THRESHOLD = 200000;
    
    // 使用用户选择的模型，如果无效则使用默认
    let modelName = VALID_MODELS.includes(requestedModel) ? requestedModel : 'gemini-2.5-flash';
    
    // 确定积分汇率（使用前端传来的值或根据模型默认值）
    const tokensPerCredit = tokens_per_credit || DEFAULT_TOKENS_PER_CREDIT[modelName] || 3000;
    
    // 环境变量可覆盖（仅用于调试）
    const envModel = Deno.env.get('GOOGLE_MODEL_NAME');
    if (envModel) {
        modelName = envModel;
    }

    // 检查 API Key
    if (isFreeModel && !deepseekApiKey) {
        throw new Error('缺少 DeepSeek API Key');
    }
    if (!isFreeModel && !googleApiKey) {
        throw new Error('缺少 Google API Key');
    }

    // ============================================================
    // 🚀 隐式缓存优化 (Implicit Caching Optimization)
    // ============================================================
    // 
    // Gemini 隐式缓存触发条件（必须同时满足）：
    // 1. Token 数量 >= 1024 (Flash) 或 >= 4096 (Pro)
    // 2. 相同内容在多次请求中作为**前缀**出现
    // 3. 请求在短时间内发送（约 5-60 分钟有效期）
    // 4. 使用相同的 model 参数
    //
    // 缓存诊断：检查 response 中的 usage_metadata.cached_content_token_count
    // 
    // 参考文档：https://ai.google.dev/gemini-api/docs/caching?hl=zh-cn
    // ============================================================
    
    const finalSystemPrompt = system_prompt || 'You are a helpful assistant.';
    const userPromptStr = String(user_prompt);
    
    // 计算 System Prompt 的 token 估算（1 token ≈ 4 chars for English, ≈ 1.5 chars for Chinese）
    const systemPromptChars = finalSystemPrompt.length;
    const estimatedSystemTokens = Math.round(systemPromptChars / 3); // 保守估计
    
    // 简单哈希函数，用于检测 System Prompt 变化
    const hashString = (str: string): string => {
        let hash = 0;
        for (let i = 0; i < Math.min(str.length, 5000); i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    };
    
    const systemPromptHash = hashString(finalSystemPrompt);
    
    // 简化的请求摘要日志
    const minTokensRequired = modelName.includes('flash') ? 1024 : 4096;
    const cacheEligible = estimatedSystemTokens >= minTokensRequired;
    
    console.log(`\n┌─────────────────── 📤 生成请求 ───────────────────┐`);
    console.log(`│ 模型: ${modelName.padEnd(20)} 积分: ${currentCredits.toString().padEnd(10)} ${isFreeModel ? '🆓 免费' : ''} │`);
    console.log(`│ 系统提示: ${estimatedSystemTokens} tokens (哈希: ${systemPromptHash})  缓存: ${cacheEligible ? '✅' : '⚠️'}  │`);
    console.log(`│ 用户提示: ${Math.round(userPromptStr.length/1000)}k 字符                                              │`);
    console.log(`└──────────────────────────────────────────────────────────────┘`);

    // 构建消息数组以支持隐式缓存
    // 对于修改操作，将现有代码作为缓存内容放在messages数组前面
    const messages: any[] = [
        { role: 'system', content: finalSystemPrompt }
    ];

    // 尝试拆分 user_prompt 以提高缓存命中率
    // 如果 user_prompt 包含 "# EXISTING CODE"，则将其拆分为独立的消息
    const existingCodeMarker = '# EXISTING CODE (for context)';
    
    if (!image_url && userPromptStr.includes(existingCodeMarker)) {
        // 这是一个修改请求，包含代码上下文
        // 尝试找到代码块的结束位置，将代码块作为独立消息
        // 注意：Gemini 缓存基于最长公共前缀。如果代码块在前面，且保持不变，则可以被缓存。
        
        // 简单策略：将整个 user_prompt 作为一条消息发送
        // 因为在单文件修改模式下，代码本身就在变，拆分也无法利用跨轮缓存
        // 但为了确保 System Prompt 被缓存，我们保持 System Prompt 独立
        messages.push({ role: 'user', content: userPromptStr });
    } else if (image_url) {
        messages.push({
            role: 'user',
            content: [
                { type: 'text', text: userPromptStr },
                {
                    type: 'image_url',
                    image_url: {
                        url: image_url
                    }
                }
            ]
        });
    } else {
        messages.push({ role: 'user', content: userPromptStr });
    }

    // Create a stream to return to the client immediately
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let clientDisconnected = false;  // 移到 try 外部，避免 catch 块引用错误
            
            try {
                // Send initial keep-alive
                try {
                    controller.enqueue(encoder.encode(JSON.stringify({ status: 'started' }) + '\n'));
                } catch (e) {
                    console.log('客户端立即断开连接');
                    return;
                }

                let response;
                let retryCount = 0;
                const maxRetries = 3;
                let currentModel = modelName;

                // 🆓 调用 DeepSeek API (免费模型)
                const fetchDeepSeekCompletion = async () => {
                    return await fetch('https://api.deepseek.com/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${deepseekApiKey}`
                        },
                        body: JSON.stringify({
                            model: 'deepseek-chat',
                            max_tokens: 8192,  // DeepSeek API 限制最大 8192
                            messages: messages,
                            stream: true
                        })
                    });
                };

                // 调用 Gemini API
                const fetchGeminiCompletion = async (model: string) => {
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
                };

                // 根据模型选择调用不同的 API
                const fetchCompletion = async (model: string) => {
                    if (model === 'deepseek-v3') {
                        return await fetchDeepSeekCompletion();
                    }
                    return await fetchGeminiCompletion(model);
                };

                while (true) {
                    try {
                        response = await fetchCompletion(currentModel);

                        if (response.ok) break;

                        const errorText = await response.text();

                        // 处理 503 (服务过载) 或 429 (配额限制)
                        if (response.status === 503 || response.status === 429) {
                            console.warn(`API 错误 (${response.status}): ${errorText}`);
                            
                            // 如果遇到 429 错误，尝试切换到 Gemini 3 Flash Preview
                            if (response.status === 429 && !image_url && currentModel !== 'gemini-3-flash-preview') {
                                console.warn('配额超限，切换到 Gemini 3 Flash Preview 备用模型...');
                                currentModel = 'gemini-3-flash-preview'; 
                                retryCount = 0;
                                continue;
                            }

                            retryCount++;
                            if (retryCount > maxRetries) {
                                // 如果还未切换且可以切换，尝试 Gemini 3 Flash Preview
                                if (!image_url && currentModel !== 'gemini-3-flash-preview') {
                                     console.warn('重试次数已达上限，切换到 Gemini 3 Flash Preview 备用模型...');
                                     currentModel = 'gemini-3-flash-preview';
                                     retryCount = 0;
                                     continue;
                                }
                                
                                // 构造友好的错误信息
                                const modelNameMap: Record<string, string> = {
                                    'deepseek-v3': '免费模型',
                                    'gemini-2.5-flash': '极速模型',
                                    'gemini-3-flash-preview': '标准模型',
                                    'gemini-3-pro-preview': '专家模型'
                                };
                                const modelName = modelNameMap[currentModel] || currentModel;

                                let friendlyError = `${modelName}调用受限`;
                                if (response.status === 429) {
                                    friendlyError = `${modelName}达到调用频率限制 (Rate Limit)。请稍后重试，或尝试切换其他模型。`;
                                } else if (response.status === 503) {
                                    friendlyError = `${modelName}服务暂时不可用 (Service Overloaded)。请稍后重试，或尝试切换其他模型。`;
                                }
                                throw new Error(friendlyError);
                            }
                            
                            const delay = retryCount * 1000; 
                            console.warn(`${delay}ms 后重试...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }

                        throw new Error(`上游 API 错误: ${response.status} ${errorText}`);

                    } catch (e: any) {
                        if (e.message.startsWith('上游 API 错误')) throw e;
                        
                        retryCount++;
                        if (retryCount > maxRetries) throw e;
                        
                        const delay = retryCount * 1000;
                        console.warn(`网络错误: ${e.message}，${delay}ms 后重试...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }

                // 7. 处理流式响应并更新数据库
                const reader = response.body?.getReader();
                const decoder = new TextDecoder();
                
                // 初始化完整内容
                let fullContent = '';
                
                let streamBuffer = ''; 
                let lastUpdate = Date.now();
                let lastBroadcastLength = fullContent.length;
                let userCancelled = false; // 标记用户是否主动取消
                let isFirstChunk = true; // 🆕 首次响应标记，用于立即发送
                
                const taskChannel = supabaseAdmin.channel(`task-${taskId}`);
                // Using httpSend() for REST delivery, no WebSocket subscription needed

                // 🆕 发送心跳/连接确认，让前端知道 AI 已开始处理
                try {
                    await taskChannel.httpSend('heartbeat', { 
                        taskId, 
                        status: 'ai_started',
                        message: 'AI 引擎已启动，正在生成代码...'
                    });
                    console.log('💓 心跳已发送: AI 开始生成');
                } catch (e) {
                    console.warn('心跳发送失败:', e);
                }

                if (reader) {
                  try {
                    while (true) {
                      // 只有用户主动取消才停止生成
                      // 前端断开连接不应该中断后台生成
                      if (userCancelled) {
                          console.log('用户主动取消，停止生成');
                          console.log('用户取消，不扣除积分');
                          
                          // 更新任务状态为已取消
                          await supabaseAdmin
                              .from('generation_tasks')
                              .update({ status: 'cancelled', error_message: 'User cancelled' })
                              .eq('id', taskId);
                              
                          break;
                      }
                      
                      // 定期检查任务状态，如果用户已取消则停止
                      // 每5秒检查一次数据库状态
                      if (Date.now() - lastUpdate > 5000) {
                          const { data: taskStatus } = await supabaseAdmin
                              .from('generation_tasks')
                              .select('status')
                              .eq('id', taskId)
                              .single();
                          
                          if (taskStatus?.status === 'cancelled') {
                              console.log('检测到任务已被用户取消（数据库状态）');
                              userCancelled = true;
                              continue;
                          }
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
                                  
                                  // 隐式缓存监控：同时支持两种 API 格式
                                  // 1. Gemini 原生 API: usage_metadata.cached_content_token_count
                                  // 2. OpenAI 兼容 API: usage.cached_tokens 或 usage.prompt_tokens_details.cached_tokens
                                  // 注意：usage 通常只在流的最后一个 chunk 中返回
                                  
                                  const usageMetadata = data.usage_metadata;  // Gemini 原生格式
                                  const usage = data.usage;  // OpenAI 兼容格式
                                  
                                  if (usageMetadata || usage) {
                                      // 提取 Token 使用数据（支持两种 API 格式）
                                      let cachedTokens = 0;
                                      let totalPromptTokens = 0;
                                      let completionTokens = 0;
                                      
                                      if (usageMetadata) {
                                          cachedTokens = usageMetadata.cached_content_token_count || 0;
                                          totalPromptTokens = usageMetadata.prompt_token_count || 0;
                                          completionTokens = usageMetadata.candidates_token_count || 0;
                                      } else if (usage) {
                                          cachedTokens = usage.cached_tokens || usage.prompt_tokens_details?.cached_tokens || 0;
                                          totalPromptTokens = usage.prompt_tokens || 0;
                                          completionTokens = usage.completion_tokens || 0;
                                      }
                                      
                                      // 只在有数据时打印（通常在流结束时）
                                      if (totalPromptTokens > 0) {
                                          const cacheHitRate = cachedTokens > 0 ? ((cachedTokens / totalPromptTokens) * 100).toFixed(1) : '0';
                                          const cacheIcon = cachedTokens > 0 ? '✅' : '❌';
                                          console.log(`│ 📊 Token统计: 输入=${totalPromptTokens} 输出=${completionTokens} 缓存=${cachedTokens} (${cacheHitRate}%) ${cacheIcon}`);
                                      }
                                  }
                              } catch (e) {
                                  // ignore parse error
                              }
                          }
                      }

                // 优化3: Realtime 防抖 (已优化)
                      // 🆕 首次响应立即发送，后续累积 50 字符或 300ms 后广播
                      // 大幅减少用户感知延迟
                      const contentDiff = fullContent.length - lastBroadcastLength;
                      
                      // 🆕 首次收到内容时立即发送（用户感知延迟优化）
                      const shouldBroadcast = isFirstChunk && contentDiff > 0 || 
                                              contentDiff > 50 || 
                                              (contentDiff > 0 && Date.now() - lastUpdate > 300);
                      
                      if (shouldBroadcast) {
                          if (isFirstChunk && contentDiff > 0) {
                              console.log('🚀 首次响应，立即广播');
                              isFirstChunk = false;
                          }
                          
                          const newChunk = fullContent.slice(lastBroadcastLength);
                          
                          const payload = { 
                              chunk: newChunk, 
                              fullContent: fullContent,
                              taskId: taskId
                          };

                          // 即使前端断开，也尝试通过 Realtime 广播
                          // 这样如果用户刷新页面或重新连接，可以收到更新
                          try {
                              await taskChannel.httpSend('chunk', payload);
                          } catch (rtError) {
                              console.warn('Realtime广播失败:', rtError);
                          }
                          
                          lastBroadcastLength = fullContent.length;
                          lastUpdate = Date.now();
                          
                          // 只有在前端未断开时才尝试发送流响应
                          if (!clientDisconnected) {
                              try {
                                  controller.enqueue(encoder.encode(JSON.stringify({ status: 'processing', length: fullContent.length }) + '\n'));
                              } catch (streamErr) {
                                  // 前端断开连接，但继续后台生成
                                  console.log('客户端已关闭流，继续后台生成...');
                                  clientDisconnected = true;
                                  // 注意：不再 break，继续生成！
                              }
                          }
                      }
                    }
                  } catch (streamError: any) {
                      console.error('流读取错误:', streamError);
                      if (fullContent.length > 100) {
                          console.log('从流错误中恢复，保存部分内容...');
                      } else {
                          throw streamError;
                      }
                  }
                }
                
                // 流结束后的诊断日志
                console.log(`│ 📝 流结束: 接收到 ${fullContent.length} 字符`);
                if (fullContent.length === 0) {
                    console.log(`│ ⚠️ 警告: AI 返回空响应!`);
                } else if (fullContent.length < 100) {
                    console.log(`│ ⚠️ 响应过短: "${fullContent.substring(0, 100)}"`);
                }
                
                // 检查 AI 响应是否完整
                // 修改操作：需要包含 SEARCH/REPLACE 块
                // 创建操作：需要包含 HTML 内容
                const hasPatchContent = fullContent.includes('<<<<SEARCH') || fullContent.includes('<<<< SEARCH');
                const hasHtmlContent = fullContent.includes('<!DOCTYPE') || fullContent.includes('<html');
                
                // 检测各种"只有分析/计划"的模式
                const hasAnalysisOnly = fullContent.includes('/// ANALYSIS') || 
                                        fullContent.includes('/// SUMMARY') ||
                                        fullContent.includes('/// PLAN') ||
                                        fullContent.includes('无法完成') ||
                                        fullContent.includes('无法执行');
                
                // 如果内容太短，且没有有效的代码内容，则认为响应不完整
                const isIncompleteResponse = fullContent.length < 200 && !hasPatchContent && !hasHtmlContent;
                
                // 如果只有分析/计划没有代码，也是不完整的（AI 拒绝执行）
                const hasOnlyAnalysis = hasAnalysisOnly && !hasPatchContent && !hasHtmlContent && fullContent.length < 2000;
                
                if (isIncompleteResponse || hasOnlyAnalysis) {
                    console.log(`\n┌─────────────────── ⚠️ 响应不完整 ────────────────────┐`);
                    console.log(`│ 长度: ${fullContent.length} 字符`);
                    console.log(`│ 包含补丁: ${hasPatchContent} │ 包含HTML: ${hasHtmlContent} │ 仅分析: ${hasAnalysisOnly}`);
                    console.log(`│ 原因: ${isIncompleteResponse ? '内容过短 (<200)' : '仅有分析/计划，无实际代码'}`);
                    console.log(`│ 预览: ${fullContent.substring(0, 300).replace(/\n/g, '↵')}`);
                    console.log(`└───────────────────────────────────────────────────────────────┘`);
                    throw new Error(`AI 无法执行修改，可能是代码上下文不足。请尝试刷新页面后重试。`);
                }

                // 最终更新 - 即使客户端断开也要保存到数据库
                
                // 检测是否为 Patch 格式（用于修改操作）
                const isPatchFormat = fullContent.includes('<<<<SEARCH') || fullContent.includes('<<<< SEARCH');
                
                // 清洗内容：只对全量生成（创建作品）进行清洗，修改作品保留原始内容
                let cleanContent = fullContent;
                
                if (isPatchFormat) {
                    // Patch 格式（修改作品）：不做任何清洗，直接使用原始内容
                } else {
                    // 全量生成格式（创建作品）：需要清洗
                    
                    // 1. 检查是否有 markdown 代码块包裹
                    const hasMarkdownWrapper = /^[\s\S]*?```(?:html)?\s*\n/i.test(cleanContent);
                    
                    if (hasMarkdownWrapper) {
                        // 有 markdown 代码块，移除开头的 ```html 或 ```
                        cleanContent = cleanContent.replace(/^[\s\S]*?```(?:html)?\s*\n/i, '');
                        // 移除结尾的 ```
                        cleanContent = cleanContent.replace(/\s*```\s*$/, '');
                    }
                    
                    // 2. 截取 <!DOCTYPE html> 或 <html 之后的内容
                    // 这能有效去除 "STEP: ..." 等前缀干扰
                    const docTypeIndex = cleanContent.indexOf('<!DOCTYPE html>');
                    const htmlTagIndex = cleanContent.indexOf('<html');
                    
                    if (docTypeIndex !== -1) {
                        cleanContent = cleanContent.substring(docTypeIndex);
                    } else if (htmlTagIndex !== -1) {
                        cleanContent = cleanContent.substring(htmlTagIndex);
                    }
                    
                    // 3. 确保移除末尾的 ``` (可能在代码后面)
                    // 只移除真正在末尾的 markdown 标记
                    cleanContent = cleanContent.replace(/\n```\s*$/, '');
                }
                
                // 安全检查：如果清洗后内容过短（相比原始内容），可能清洗出错了
                if (cleanContent.length < 100 && fullContent.length > 500) {
                    console.warn(`⚠️ 清洗异常: ${fullContent.length} → ${cleanContent.length} chars`);
                    // 如果原始内容包含有效HTML，尝试直接使用原始内容
                    if (fullContent.includes('<!DOCTYPE html>') || fullContent.includes('<html')) {
                        const fallbackDocType = fullContent.indexOf('<!DOCTYPE html>');
                        const fallbackHtml = fullContent.indexOf('<html');
                        if (fallbackDocType !== -1) {
                            cleanContent = fullContent.substring(fallbackDocType);
                        } else if (fallbackHtml !== -1) {
                            cleanContent = fullContent.substring(fallbackHtml);
                        }
                        cleanContent = cleanContent.replace(/\n```\s*$/, '');
                    }
                }

                // 安全修复：移除会导致 JS 崩溃的 Python 风格 Unicode 转义
                const sanitizedContent = cleanContent.replace(/\\U([0-9a-fA-F]{8})/g, (match, p1) => {
                    return '\\u{' + p1.replace(/^0+/, '') + '}';
                });

                // 先计算 cost，以便在保存结果时一起保存
                // 计算 Token 消耗
                // 规则：中文=1 token, 英文=0.25 token (4 chars = 1 token)
                const calculateTokens = (text: string) => {
                    const chineseRegex = /[\u4e00-\u9fa5]/g;
                    const chineseMatches = text.match(chineseRegex);
                    const chineseCount = chineseMatches ? chineseMatches.length : 0;
                    const otherCount = (text || '').length - chineseCount;
                    return chineseCount + Math.ceil(otherCount / 4);
                };

                const inputTokens = calculateTokens((system_prompt || '') + (userPromptStr || ''));
                const outputTokens = calculateTokens(fullContent || '');
                const totalTokens = inputTokens + outputTokens;
                
                // 🆓 免费模型不扣费
                const actualCost = isFreeModel ? 0 : (() => {
                    // 检查是否超过200k token阈值（超长上下文模式，价格翻倍）
                    const isLongContext = inputTokens > LONG_CONTEXT_THRESHOLD;
                    const effectiveTokensPerCredit = isLongContext ? Math.floor(tokensPerCredit / 2) : tokensPerCredit;
                    
                    if (isLongContext) {
                        console.log(`⚠️ 超长上下文模式：输入 ${inputTokens} tokens > ${LONG_CONTEXT_THRESHOLD}，积分消耗翻倍`);
                    }
                    
                    // 根据用户选择的模型使用对应的积分汇率
                    // gemini-2.5-flash: 1积分=15000tokens, gemini-3-flash-preview: 1积分=7000tokens, gemini-3-pro-preview: 1积分=3000tokens
                    // 超长上下文时，汇率减半（相当于价格翻倍）
                    return Math.ceil(totalTokens / effectiveTokensPerCredit);
                })();

                // 保存结果和 cost 到数据库
                await supabaseAdmin
                    .from('generation_tasks')
                    .update({ result_code: sanitizedContent, status: 'completed', cost: actualCost })
                    .eq('id', taskId);
                
                // 扣除积分（免费模型跳过）
                if (!isFreeModel) {

                    const { data: finalProfile } = await supabaseAdmin
                        .from('profiles')
                        .select('credits')
                        .eq('id', user.id)
                        .single();
                        
                    if (finalProfile) {
                        const newBalance = (Number(finalProfile.credits) || 0) - actualCost;
                        await supabaseAdmin
                            .from('profiles')
                            .update({ credits: Math.max(0, newBalance) })
                            .eq('id', user.id);
                        
                        // 记录用户活动日志
                        const actionType = type === 'modification' ? 'modify' : 'create';
                        try {
                            await supabaseAdmin.rpc('log_user_activity', {
                                p_user_id: user.id,
                                p_action_type: actionType,
                                p_action_detail: { task_id: taskId, type: type, tokens: totalTokens, model: modelName },
                                p_credits_consumed: actualCost
                            });
                        } catch (logErr) {
                            // 活动日志记录失败不影响主流程
                        }
                        
                        // 完成摘要日志
                        console.log(`├─────────────────── ✅ 完成 ────────────────────┤`);
                        console.log(`│ 输出: ${Math.round(cleanContent.length/1000)}k 字符 │ Token: ${totalTokens} │ 消耗: ${actualCost} │ 余额: ${Math.max(0, newBalance)}`);
                        console.log(`└─────────────────────────────────────────────────────┘`);
                    }
                } else {
                    // 免费模型完成日志
                    console.log(`├─────────────────── ✅ 完成 (免费) ─────────────┤`);
                    console.log(`│ 输出: ${Math.round(cleanContent.length/1000)}k 字符 │ Token: ${totalTokens} │ 🆓 免费`);
                    console.log(`└─────────────────────────────────────────────────────┘`);
                }
                
                // 通过 Realtime 广播完成状态
                try {
                    await taskChannel.httpSend('completed', { taskId, fullContent: sanitizedContent, cost: actualCost });
                } catch (rtErr) {
                    // Realtime 失败不影响结果
                }
                
                // 清理频道
                try {
                    await supabaseAdmin.removeChannel(taskChannel);
                } catch (e) {
                    // 忽略清理错误
                }
                
                // 发送最终消息并关闭流
                if (!clientDisconnected) {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify({ status: 'completed' }) + '\n'));
                        controller.close();
                    } catch (e) {
                        // 客户端已断开，正常情况
                    }
                    clientDisconnected = true;
                }
            } catch (error: any) {
                const errorMessage = error.message || '生成过程中发生未知错误';
                
                console.log(`├─────────────────── ❌ 失败 ────────────────────────┤`);
                console.log(`│ 错误: ${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? '...' : ''}`);
                console.log(`└─────────────────────────────────────────────────────┘`);

                // 更新任务状态为失败
                try {
                    if (taskId) {
                        await supabaseAdmin
                            .from('generation_tasks')
                            .update({ status: 'failed', error_message: errorMessage })
                            .eq('id', taskId);
                    }
                } catch (e) {
                    // 忽略状态更新错误
                }
                
                // 发送错误并关闭流
                if (!clientDisconnected) {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify({ error: errorMessage }) + '\n'));
                        controller.close();
                    } catch (e) {
                        // 忽略
                    }
                    clientDisconnected = true;
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
    console.error('主处理器错误:', error);

    // 如果有 taskId，尝试更新任务状态为失败
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
            console.error('更新任务状态失败:', e);
        }
    }

    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
