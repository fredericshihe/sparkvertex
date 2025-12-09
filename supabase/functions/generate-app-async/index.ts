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

    // 5. Check Credits (不扣费，只检查余额)
    // const COST = type === 'modification' ? 5.0 : 15.0;
    // 改为基于 Token 计费，最低预留 1 积分
    const MIN_REQUIRED = 1;
    
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
    console.log(`User ${user.id} has ${currentCredits} credits. Min required: ${MIN_REQUIRED}`);

    if (currentCredits < MIN_REQUIRED) {
       return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    console.log(`余额充足，生成完成后将根据实际 Token 扣除积分`);

    // Update status to processing
    await supabaseAdmin
      .from('generation_tasks')
      .update({ status: 'processing' })
      .eq('id', taskId);

    // 6. Call LLM
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    
    // 模型配置：支持用户选择的模型
    // 不同模型的积分汇率（基于 Gemini 官方定价）:
    // - gemini-2.5-flash: 1积分 = 15000 tokens (最便宜，速度快)
    // - gemini-2.5-pro: 1积分 = 4000 tokens (均衡)
    // - gemini-3-pro-preview: 1积分 = 3000 tokens (最强，最贵)
    // 注意：上下文 > 200k tokens 时，价格自动翻倍（tokensPerCredit / 2）
    const VALID_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro-preview'];
    const DEFAULT_TOKENS_PER_CREDIT: Record<string, number> = {
        'gemini-2.5-flash': 15000,
        'gemini-2.5-pro': 4000,
        'gemini-3-pro-preview': 3000
    };
    // 超长上下文阈值（200k tokens）
    const LONG_CONTEXT_THRESHOLD = 200000;
    
    // 使用用户选择的模型，如果无效则使用默认
    let modelName = VALID_MODELS.includes(requestedModel) ? requestedModel : 'gemini-2.5-flash';
    
    // 确定积分汇率（使用前端传来的值或根据模型默认值）
    const tokensPerCredit = tokens_per_credit || DEFAULT_TOKENS_PER_CREDIT[modelName] || 3000;
    
    console.log(`使用模型: ${modelName}, 积分汇率: 1积分=${tokensPerCredit}tokens`);
    
    // 环境变量可覆盖（仅用于调试）
    const envModel = Deno.env.get('GOOGLE_MODEL_NAME');
    if (envModel) {
        modelName = envModel;
        console.log(`环境变量覆盖模型为: ${envModel}`);
    }

    if (!googleApiKey) {
        throw new Error('缺少 Google API Key');
    }

    // 优化2: 隐式缓存设置
    // 系统提示词设计为稳定且足够长(>1024 tokens)以触发Gemini隐式缓存
    // 关键点：system prompt保持不变，user prompt包含变化的内容
    const finalSystemPrompt = system_prompt || 'You are a helpful assistant.';

    // 构建消息数组以支持隐式缓存
    // 对于修改操作，将现有代码作为缓存内容放在messages数组前面
    const messages = [
        { role: 'system', content: finalSystemPrompt }
    ];

    // 尝试拆分 user_prompt 以提高缓存命中率
    // 如果 user_prompt 包含 "# EXISTING CODE"，则将其拆分为独立的消息
    const existingCodeMarker = '# EXISTING CODE (for context)';
    const userPromptStr = String(user_prompt);
    
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
                let currentModel = modelName;

                // 调用 Gemini API
                const fetchCompletion = async (model: string) => {
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

                while (true) {
                    try {
                        console.log(`尝试使用 ${currentModel} 生成...`);
                        response = await fetchCompletion(currentModel);

                        if (response.ok) break;

                        const errorText = await response.text();

                        // 处理 503 (服务过载) 或 429 (配额限制)
                        if (response.status === 503 || response.status === 429) {
                            console.warn(`API 错误 (${response.status}): ${errorText}`);
                            
                            // 如果遇到 429 错误，尝试切换到 Gemini 2.5 Pro
                            if (response.status === 429 && !image_url && currentModel !== 'gemini-2.5-pro') {
                                console.warn('配额超限，切换到 Gemini 2.5 Pro 备用模型...');
                                currentModel = 'gemini-2.5-pro'; 
                                retryCount = 0;
                                continue;
                            }

                            retryCount++;
                            if (retryCount > maxRetries) {
                                // 如果还未切换且可以切换，尝试 Gemini 2.5 Pro
                                if (!image_url && currentModel !== 'gemini-2.5-pro') {
                                     console.warn('重试次数已达上限，切换到 Gemini 2.5 Pro 备用模型...');
                                     currentModel = 'gemini-2.5-pro';
                                     retryCount = 0;
                                     continue;
                                }
                                
                                throw new Error(`上游 API 错误: ${response.status} ${errorText}`);
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
                let clientDisconnected = false;  // 标记前端连接是否断开（但不影响后台生成）
                let userCancelled = false; // 标记用户是否主动取消
                
                const taskChannel = supabaseAdmin.channel(`task-${taskId}`);
                // Using httpSend() for REST delivery, no WebSocket subscription needed

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
                                  
                                  // 隐式缓存监控：检查usage_metadata以追踪缓存命中情况
                                  // Gemini会在响应中返回cached_content_token_count
                                  if (data.usage_metadata) {
                                      const usage = data.usage_metadata;
                                      const cachedTokens = usage.cached_content_token_count || 0;
                                      const totalPromptTokens = usage.prompt_token_count || 0;
                                      const cacheHitRate = totalPromptTokens > 0 ? (cachedTokens / totalPromptTokens * 100).toFixed(1) : '0';
                                      
                                      console.log(`🚀 Implicit Cache Stats: ${cachedTokens}/${totalPromptTokens} tokens cached (${cacheHitRate}% hit rate)`);
                                      
                                      // 如果缓存命中率>80%，说明隐式缓存工作良好
                                      if (cachedTokens > 0) {
                                          console.log(`✅ Cache hit! Saved ${cachedTokens} tokens (~${(cachedTokens * 0.0001).toFixed(2)} credits)`);
                                      }
                                  }
                              } catch (e) {
                                  // ignore parse error
                              }
                          }
                      }

                // 优化3: Realtime 防抖
                      // 累积约150字符或等待500ms后再广播
                      // 显著减少 WebSocket 消息数量
                      const contentDiff = fullContent.length - lastBroadcastLength;
                      
                      if (contentDiff > 150 || (contentDiff > 0 && Date.now() - lastUpdate > 500)) {
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
                              console.warn('Realtime 发送失败:', rtError);
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
                
                // 检查 AI 响应是否完整
                // 如果内容太短且只有 PLAN，说明响应被截断
                const isIncompleteResponse = fullContent.length < 500 && 
                                              fullContent.includes('/// PLAN') && 
                                              !fullContent.includes('<<<<SEARCH') &&
                                              !fullContent.includes('<!DOCTYPE') &&
                                              !fullContent.includes('<html');
                
                if (isIncompleteResponse) {
                    console.error('AI 响应不完整：只有 PLAN 没有代码');
                    console.log('内容长度:', fullContent.length);
                    console.log('内容预览:', fullContent.substring(0, 300));
                    throw new Error('AI 响应不完整，请重试');
                }

                // 最终更新 - 即使客户端断开也要保存到数据库
                console.log('生成完成，正在保存结果...');
                console.log(`原始内容长度: ${fullContent.length}`);
                
                // 检测是否为 Patch 格式（用于修改操作）
                const isPatchFormat = fullContent.includes('<<<<SEARCH') || fullContent.includes('<<<< SEARCH');
                
                // 清洗内容：只对全量生成（创建作品）进行清洗，修改作品保留原始内容
                let cleanContent = fullContent;
                
                if (isPatchFormat) {
                    // Patch 格式（修改作品）：不做任何清洗，直接使用原始内容
                    console.log('检测到 Patch 格式（修改作品），不进行清洗');
                } else {
                    // 全量生成格式（创建作品）：需要清洗
                    console.log('全量生成格式（创建作品），进行清洗');
                    
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
                
                console.log(`清洗后内容长度: ${cleanContent.length}`);
                
                // 安全检查：如果清洗后内容过短（相比原始内容），可能清洗出错了
                if (cleanContent.length < 100 && fullContent.length > 500) {
                    console.error('警告：清洗后内容过短，可能清洗逻辑有问题');
                    console.log('原始内容长度:', fullContent.length);
                    console.log('清洗后内容预览:', cleanContent.substring(0, 200));
                    console.log('原始内容预览:', fullContent.substring(0, 500));
                    // 如果原始内容包含有效HTML，尝试直接使用原始内容
                    if (fullContent.includes('<!DOCTYPE html>') || fullContent.includes('<html')) {
                        console.log('尝试从原始内容中提取HTML...');
                        const fallbackDocType = fullContent.indexOf('<!DOCTYPE html>');
                        const fallbackHtml = fullContent.indexOf('<html');
                        if (fallbackDocType !== -1) {
                            cleanContent = fullContent.substring(fallbackDocType);
                        } else if (fallbackHtml !== -1) {
                            cleanContent = fullContent.substring(fallbackHtml);
                        }
                        // 移除末尾的 markdown 标记
                        cleanContent = cleanContent.replace(/\n```\s*$/, '');
                        console.log('回退后内容长度:', cleanContent.length);
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
                
                // 检查是否超过200k token阈值（超长上下文模式，价格翻倍）
                const isLongContext = inputTokens > LONG_CONTEXT_THRESHOLD;
                const effectiveTokensPerCredit = isLongContext ? Math.floor(tokensPerCredit / 2) : tokensPerCredit;
                
                if (isLongContext) {
                    console.log(`⚠️ 超长上下文模式：输入 ${inputTokens} tokens > ${LONG_CONTEXT_THRESHOLD}，积分消耗翻倍`);
                }
                
                // 根据用户选择的模型使用对应的积分汇率
                // gemini-2.5-flash: 1积分=15000tokens, gemini-2.5-pro: 1积分=4000tokens, gemini-3-pro-preview: 1积分=3000tokens
                // 超长上下文时，汇率减半（相当于价格翻倍）
                const actualCost = Math.ceil(totalTokens / effectiveTokensPerCredit);

                // 保存结果和 cost 到数据库（cost 用于退款时查询）
                await supabaseAdmin
                    .from('generation_tasks')
                    .update({ result_code: sanitizedContent, status: 'completed', cost: actualCost })
                    .eq('id', taskId);
                console.log('结果保存成功');
                
                // 生成成功，现在扣除积分
                console.log(`生成成功，Token统计: 输入=${inputTokens}, 输出=${outputTokens}, 总计=${totalTokens}`);
                console.log(`扣除 ${actualCost} 积分 (模型: ${modelName}, 汇率: 1积分=${effectiveTokensPerCredit}Tokens${isLongContext ? ' [超长上下文双倍扣费]' : ''})...`);

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
                    console.log(`积分已扣除。剩余: ${Math.max(0, newBalance)}`);
                    
                    // 记录用户活动日志（用于分析）
                    const actionType = type === 'modification' ? 'modify' : 'create';
                    try {
                        await supabaseAdmin.rpc('log_user_activity', {
                            p_user_id: user.id,
                            p_action_type: actionType,
                            p_action_detail: { task_id: taskId, type: type, tokens: totalTokens },
                            p_credits_consumed: actualCost
                        });
                        console.log(`活动日志已记录: ${actionType}, 消耗 ${actualCost} 积分`);
                    } catch (logErr) {
                        console.warn('活动日志记录失败:', logErr);
                    }
                } else {
                    console.warn('无法扣除积分：找不到用户档案');
                }
                
                // 通过 Realtime 广播完成状态
                try {
                    // httpSend(event: string, payload: any, opts?: { timeout?: number })
                    // 发送清洗后的内容，确保前端预览正常
                    await taskChannel.httpSend('completed', { taskId, fullContent: sanitizedContent, cost: actualCost });
                } catch (rtErr) {
                    console.log('Realtime 完成广播失败:', rtErr);
                }
                
                // 清理频道
                try {
                    await supabaseAdmin.removeChannel(taskChannel);
                } catch (e) {
                    console.log('频道清理警告:', e);
                }
                
                // 仅在客户端仍连接时发送最终消息
                if (!clientDisconnected) {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify({ status: 'completed' }) + '\n'));
                    } catch (e) {
                        console.log('客户端已断开，跳过最终消息');
                        clientDisconnected = true;
                    }
                }
                
                // 只在客户端未断开时尝试关闭流
                if (!clientDisconnected) {
                    try {
                        controller.close();
                        clientDisconnected = true;
                    } catch (e: any) {
                        // 忽略流关闭错误（Http: connection closed before message completed）
                        if (e.name === 'Http' || e.message?.includes('connection closed') || e.message?.includes('cannot close')) {
                            console.log('客户端已提前关闭连接（正常，生成已完成保存）');
                        } else {
                            console.warn('流关闭错误:', e);
                        }
                        clientDisconnected = true;
                    }
                }
            } catch (error: any) {
                console.error('异步生成错误:', error);
                
                const errorMessage = error.message || '生成过程中发生未知错误';

                // 尝试更新任务状态为失败（不需要退款，因为还没扣费）
                try {
                    if (taskId) {
                        await supabaseAdmin
                            .from('generation_tasks')
                            .update({ status: 'failed', error_message: errorMessage })
                            .eq('id', taskId);
                        console.log(`生成失败 (${errorMessage})，未扣除积分`);
                    }
                } catch (e) {
                    console.error('状态更新失败:', e);
                }
                
                // 如果客户端仍连接，尝试发送错误消息
                if (!clientDisconnected) {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify({ error: errorMessage }) + '\n'));
                    } catch (e) {
                        console.log('无法发送错误，客户端已断开');
                        clientDisconnected = true;
                    }
                }
                
                // 只在客户端未断开时尝试关闭流
                if (!clientDisconnected) {
                    try {
                        controller.close();
                        clientDisconnected = true;
                    } catch (e) {
                        console.log('流已关闭');
                        clientDisconnected = true;
                    }
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
