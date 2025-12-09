import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getRAGContext } from '@/lib/rag';
import { findRelevantCodeChunks, compressCode, chunkCode } from '@/lib/code-rag';
import { logRAGRequest, detectQueryLanguage, type RAGLogEntry } from '@/lib/rag-logger';
import { classifyUserIntent, UserIntent, generateFileSummary } from '@/lib/intent-classifier';

// 使用 Node.js Runtime 以支持更长的超时设置
export const runtime = 'nodejs';
// 增加最大执行时间 (Vercel Hobby 限制 60s, Pro 限制 300s)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic'; 

// SSE 事件类型
export type SSEEventType = 'thinking' | 'progress' | 'result' | 'error';

export interface SSEEvent {
    type: SSEEventType;
    data: unknown;
}

// 思考过程事件数据
export interface ThinkingEventData {
    reasoning: string;
    intent?: string;
    targets?: string[];
}

// 进度事件数据
export interface ProgressEventData {
    stage: 'intent' | 'rag' | 'compression';
    message: string;
    // 压缩统计信息（仅在 compression 阶段）
    compressionStats?: {
        originalSize: number;
        compressedSize: number;
        ratio: string;
        modulesFound: number;
    };
}

// 最终结果事件数据
export interface ResultEventData {
    taskId: string;
    ragContext: string;
    codeContext: string;
    compressedCode: string;
    ragSummary: string;
    targets: string[];
}

// 创建 SSE 流式响应
function createSSEStream() {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let isClosed = false;
    
    // 🆕 使用 highWaterMark: 0 禁用内部缓冲，确保 SSE 事件立即发送
    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c;
        },
        cancel() {
            isClosed = true;
            console.log('[SSE] Stream cancelled by client');
        }
    }, {
        highWaterMark: 0 // 禁用背压缓冲
    });
    
    const send = (event: SSEEvent) => {
        if (isClosed) return;
        try {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
        } catch (e) {
            console.warn('[SSE] Failed to send event:', e);
        }
    };
    
    const close = () => {
        if (isClosed) return;
        isClosed = true;
        try {
            // 发送结束事件
            const endData = `data: [DONE]\n\n`;
            controller.enqueue(encoder.encode(endData));
            controller.close();
        } catch (e) {
            console.warn('[SSE] Failed to close stream:', e);
        }
    };
    
    return { stream, send, close };
} 

export async function POST(request: Request) {
  // 检查是否请求 SSE 流式响应
  const acceptHeader = request.headers.get('Accept') || '';
  const useSSE = acceptHeader.includes('text/event-stream');
  
  // SSE 流式处理
  if (useSSE) {
    return handleSSERequest(request);
  }
  
  // 传统 JSON 响应（向后兼容）
  return handleJSONRequest(request);
}

// SSE 流式响应处理
async function handleSSERequest(request: Request) {
  const { stream, send, close } = createSSEStream();
  
  // 启动异步处理
  (async () => {
    try {
      const cookieStore = cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value
            },
            set(name: string, value: string, options: CookieOptions) {
              cookieStore.set({ name, value, ...options })
            },
            remove(name: string, options: CookieOptions) {
              cookieStore.set({ name, value: '', ...options })
            },
          },
        }
      );
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        send({ type: 'error', data: { error: '未授权 (Unauthorized)' } });
        close();
        return;
      }

      const body = await request.json();
      
      // 🆕 立即发送连接确认，让前端知道 SSE 通道已建立
      console.log('[SSE] Connection established, sending heartbeat...');
      send({ type: 'progress', data: { stage: 'intent', message: '连接已建立，开始处理...' } as ProgressEventData });
      
      // 🆕 全量修复模式：跳过压缩，发送完整代码给AI
      const skipCompression = body.skip_compression === true;
      if (skipCompression) {
        console.log('[SSE] Full Repair mode - skipping RAG/compression, sending full code');
      }
      
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        send({ type: 'error', data: { error: '服务器配置错误' } });
        close();
        return;
      }

      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      );

      // 创建任务
      const MAX_PROMPT_LENGTH = 50000;
      const storedPrompt = body.user_prompt && body.user_prompt.length > MAX_PROMPT_LENGTH 
        ? body.user_prompt.substring(0, MAX_PROMPT_LENGTH) + '... (truncated)' 
        : body.user_prompt;

      let task = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await adminSupabase
          .from('generation_tasks')
          .insert({ user_id: session.user.id, prompt: storedPrompt, status: 'pending' })
          .select()
          .single();
          
        if (!result.error && result.data) {
          task = result.data;
          break;
        }
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!task) {
        send({ type: 'error', data: { error: '创建任务失败' } });
        close();
        return;
      }

      // 发送进度：开始意图分析
      send({ type: 'progress', data: { stage: 'intent', message: '正在分析您的需求...' } as ProgressEventData });

      let ragContext = '';
      let codeContext = '';
      let compressedCode = '';
      let intentResult: Awaited<ReturnType<typeof classifyUserIntent>> | null = null;
      let intentLatencyMs = 0;
      let ragLatencyMs = 0;
      let compressionLatencyMs = 0;
      let chunksTotal = 0;
      let chunksSelected = 0;
      const ragStartTime = Date.now();

      try {
        if (body.type === 'modification' && body.user_prompt && body.current_code) {
          // 🆕 立即发送"正在分析"状态，让用户知道处理已开始
          send({ type: 'progress', data: { stage: 'intent', message: '正在分析您的需求...' } as ProgressEventData });
          
          // Step 1: 意图分类
          const chunks = chunkCode(body.current_code);
          const fileSummaries = chunks.slice(0, 15).map(chunk => 
            generateFileSummary(chunk.id.replace('component-', ''), chunk.content)
          );

          const intentRes = await classifyUserIntent(body.user_prompt, { fileSummaries });
          intentResult = intentRes;
          intentLatencyMs = intentResult.latencyMs;

          console.log(`[SSE] Intent: ${intentResult.intent}, reasoning: ${intentResult.reasoning?.substring(0, 50)}...`);

          // 🎯 立即发送思考过程！
          if (intentResult.reasoning) {
            send({ 
              type: 'thinking', 
              data: { 
                reasoning: intentResult.reasoning,
                intent: intentResult.intent,
                targets: intentResult.targets
              } as ThinkingEventData 
            });
          }

          // 发送进度：RAG 分析
          send({ type: 'progress', data: { stage: 'rag', message: '正在定位相关代码...' } as ProgressEventData });

          // Step 2: RAG 分析 (传入 Intent Classifier 的结果以动态调整限制)
          const isGlobalReview = intentResult?.intent === 'GLOBAL_REVIEW' || 
            (body.user_prompt.includes('检查') && body.user_prompt.includes('全部')) ||
            (body.user_prompt.toLowerCase().includes('review') && body.user_prompt.toLowerCase().includes('all'));
          
          const relevantChunks = await findRelevantCodeChunks(
            body.user_prompt, 
            body.current_code,
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
              explicitTargets: intentResult?.targets || [],
              referenceTargets: intentResult?.referenceTargets || [],
              isGlobalReview
            }
          );
          ragLatencyMs = Date.now() - ragStartTime - intentLatencyMs;

          if (intentResult.targets && intentResult.targets.length > 0) {
            codeContext += `\n\n### 🚀 OPTIMIZATION HINT\nI have detected that you likely need to modify these specific components: ${intentResult.targets.join(', ')}.\nPlease consider using the \`<<<<AST_REPLACE: TargetName>>>>\` format for these to ensure precision and avoid truncation.`;
          }

          chunksTotal = body.current_code.split(/\n(?=(?:const|function|class|export)\s)/).length;
          chunksSelected = relevantChunks?.length || 0;

          if (relevantChunks && relevantChunks.length > 0) {
            codeContext = `\n\n### RELEVANT CODE CONTEXT (RAG)\nThe following code sections are most relevant to the user's request. Focus your changes here if possible:\n\n`;
            codeContext += relevantChunks.map(c => `// --- Section: ${c.id} ---\n${c.content}\n`).join('\n');
            
            const relevantIds = relevantChunks.map(c => c.id);
            console.log(`[CodeRAG] Found ${relevantChunks.length} relevant chunks: ${relevantIds.join(', ')}`);
            
            // Step 3: 压缩 (全量修复时跳过)
            if (body.current_code.length > 10000 && !skipCompression) {
              send({ type: 'progress', data: { stage: 'compression', message: '正在优化上下文...' } as ProgressEventData });
              console.log('[CodeRAG] Code is large, applying Smart Compression...');
              
              const compressionStartTime = Date.now();
              const explicitTargets = intentResult?.targets || [];
              const referenceTargets = intentResult?.referenceTargets || [];
              const detectedIntent = intentResult?.intent || UserIntent.UNKNOWN;
              
              compressedCode = compressCode(body.current_code, relevantIds, explicitTargets, detectedIntent, referenceTargets);
              compressionLatencyMs = Date.now() - compressionStartTime;
              
              const compressionRate = ((1 - compressedCode.length / body.current_code.length) * 100).toFixed(1);
              console.log(`[CodeRAG] Compressed: ${body.current_code.length} → ${compressedCode.length} chars (${compressionRate}% reduction, ${compressionLatencyMs}ms)`);
              
              // 🆕 发送压缩完成事件，附带统计信息
              send({ 
                type: 'progress', 
                data: { 
                  stage: 'compression', 
                  message: `上下文优化完成 (${compressionRate}% 压缩率)`,
                  compressionStats: {
                    originalSize: body.current_code.length,
                    compressedSize: compressedCode.length,
                    ratio: `${compressionRate}%`,
                    modulesFound: chunksSelected
                  }
                } as ProgressEventData 
              });
            } else if (skipCompression && body.current_code) {
              // 🆕 全量修复模式：直接使用完整代码，不压缩
              console.log(`[CodeRAG] Full Repair mode - using full code: ${body.current_code.length} chars`);
              // 不设置 compressedCode，后续会使用 body.current_code
            }
          }
        } else if (body.type === 'modification' && body.user_prompt) {
          intentResult = await classifyUserIntent(body.user_prompt);
          if (intentResult.reasoning) {
            send({ type: 'thinking', data: { reasoning: intentResult.reasoning, intent: intentResult.intent } as ThinkingEventData });
          }
        }
      } catch (ragError) {
        console.warn('[SSE RAG] Failed:', ragError);
      }

      // 异步记录日志
      const totalLatencyMs = Date.now() - ragStartTime;
      if (body.type === 'modification' && body.user_prompt) {
        const logEntry: RAGLogEntry = {
          userId: session.user.id,
          userQuery: body.user_prompt,
          queryLanguage: detectQueryLanguage(body.user_prompt),
          detectedIntent: intentResult?.intent || UserIntent.UNKNOWN,
          intentConfidence: intentResult?.confidence || 0,
          intentSource: intentResult?.source || 'local',
          intentLatencyMs, ragLatencyMs, compressionLatencyMs, totalLatencyMs,
          codeLength: body.current_code?.length || 0,
          compressedLength: compressedCode?.length || 0,
          compressionRatio: compressedCode && body.current_code ? compressedCode.length / body.current_code.length : 0,
          chunksTotal, chunksSelected,
          model: body.model
        };
        logRAGRequest(logEntry).catch(err => console.warn('[SSE RAG Logger] Failed:', err));
      }

      // 构建 RAG 摘要
      let ragSummary = '';
      if (body.type === 'modification') {
        const intentMap: Record<string, string> = {
          'UI_MODIFICATION': '界面调整', 'LOGIC_MODIFICATION': '逻辑修改', 'BUG_FIX': '问题修复',
          'NEW_FEATURE': '新功能开发', 'PERFORMANCE': '性能优化', 'REFACTOR': '代码重构', 'UNKNOWN': '通用修改'
        };
        const intent = intentResult?.intent || 'UNKNOWN';
        const intentCn = intentMap[intent] || '通用修改';
        const compressionRate = compressedCode && body.current_code 
          ? ((1 - compressedCode.length / body.current_code.length) * 100).toFixed(0) : '0';
        ragSummary = `识别意图：${intentCn}\n分析结果：已定位 ${chunksSelected} 个核心模块，上下文优化 ${compressionRate}%`;
      }

      // 发送最终结果
      send({ 
        type: 'result', 
        data: { 
          taskId: task.id, 
          ragContext, 
          codeContext, 
          compressedCode, 
          ragSummary,
          targets: intentResult?.targets || []
        } as ResultEventData 
      });
      
      close();
    } catch (error) {
      console.error('[SSE] Error:', error);
      send({ type: 'error', data: { error: '服务器内部错误' } });
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // 🆕 禁用 nginx/proxy 缓冲，确保 SSE 实时到达
    },
  });
}

// 传统 JSON 响应处理（向后兼容）
async function handleJSONRequest(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    );
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: '未授权 (Unauthorized)' }, { status: 401 });
    }

    const body = await request.json();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    // 获取用户的 Access Token 用于传递给 Edge Function 进行鉴权
    const token = session.access_token;

    if (!supabaseUrl) {
        return NextResponse.json({ error: '服务器配置错误 (Server Configuration Error)' }, { status: 500 });
    }

    // Use Admin Client for DB operations to avoid potential client-side connection issues
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    );

    // Note: Credit deduction is now handled entirely in the Edge Function to ensure atomicity and correct pricing based on model usage.
    
    // 1. Create Task in DB (with Retry)
    // Truncate prompt to avoid huge payload issues in DB (Postgres text limit is high, but network/timeout might be an issue)
    const MAX_PROMPT_LENGTH = 50000; // 50KB limit for DB storage
    const storedPrompt = body.user_prompt && body.user_prompt.length > MAX_PROMPT_LENGTH 
        ? body.user_prompt.substring(0, MAX_PROMPT_LENGTH) + '... (truncated)' 
        : body.user_prompt;

    let task = null;
    let taskError = null;
    
    // Retry logic for unstable connections (e.g. ECONNRESET)
    for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await adminSupabase
          .from('generation_tasks')
          .insert({
            user_id: session.user.id,
            prompt: storedPrompt,
            status: 'pending'
          })
          .select()
          .single();
          
        if (!result.error && result.data) {
            task = result.data;
            taskError = null;
            break;
        }
        
        taskError = result.error;
        console.warn(`[Task Creation] Attempt ${attempt} failed:`, result.error?.message);
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (taskError || !task) {
        console.error('Task Creation Error:', taskError);
        return NextResponse.json({ 
            error: '创建任务失败 (Failed to create generation task)', 
            details: taskError 
        }, { status: 500 });
    }

    // 2. RAG Context Generation with Intent Classification & Logging
    let ragContext = '';
    let codeContext = '';
    let compressedCode = '';
    
    // RAG 性能追踪
    const ragStartTime = Date.now();
    let intentResult: Awaited<ReturnType<typeof classifyUserIntent>> | null = null;
    let intentLatencyMs = 0;
    let ragLatencyMs = 0;
    let compressionLatencyMs = 0;
    let chunksTotal = 0;
    let chunksSelected = 0;

    try {
        // Parallel Execution: Intent Classification & Code RAG
        // This significantly reduces latency by running independent tasks concurrently.
        if (body.type === 'modification' && body.user_prompt && body.current_code) {
            console.log('[Parallel] Starting Intent Classification and Code RAG...');
            
            // 🆕 Step 0: Quick chunking to generate file summaries for better Intent Classification
            const chunks = chunkCode(body.current_code);
            const fileSummaries = chunks.slice(0, 15).map(chunk => 
                generateFileSummary(chunk.id.replace('component-', ''), chunk.content)
            );
            console.log(`[FileSummaries] Generated ${fileSummaries.length} summaries for DeepSeek context`);
            
            // Pass file summaries to Intent Classification for better recall
            // 🆕 分离 Intent Classification 以便先推送思考过程
            const intentRes = await classifyUserIntent(body.user_prompt, {
                fileSummaries // 🆕 Inject dependency hints
            });
            
            // Update intent result
            intentResult = intentRes;
            intentLatencyMs = intentResult.latencyMs;
            
            console.log(`[IntentClassifier] Intent: ${intentResult.intent} (confidence: ${intentResult.confidence}, source: ${intentResult.source}, ${intentLatencyMs}ms)`);
            
            // 🆕 如果使用 SSE，在这里可以先推送 reasoning（由调用方处理）
            // 思考过程存储在 intentResult.reasoning 中
            
            // 🆕 检测是否为全局审查模式
            const isGlobalReview = intentResult?.intent === 'GLOBAL_REVIEW' || 
              (body.user_prompt.includes('检查') && body.user_prompt.includes('全部')) ||
              (body.user_prompt.toLowerCase().includes('review') && body.user_prompt.toLowerCase().includes('all'));
            
            // 然后并行执行 RAG (传入 Intent Classifier 结果以动态调整限制)
            const ragPromise = findRelevantCodeChunks(
                 body.user_prompt, 
                 body.current_code,
                 process.env.NEXT_PUBLIC_SUPABASE_URL!,
                 process.env.SUPABASE_SERVICE_ROLE_KEY!,
                 {
                   explicitTargets: intentResult?.targets || [],
                   referenceTargets: intentResult?.referenceTargets || [],
                   isGlobalReview
                 }
            );

            const relevantChunks = await ragPromise;
            ragLatencyMs = Date.now() - ragStartTime - intentLatencyMs;
            
            // Scheme 2: Modular Generation Hint
            // If we have explicit targets, encourage the AI to use AST_REPLACE
            if (intentResult.targets && intentResult.targets.length > 0) {
                const targetHint = `\n\n### 🚀 OPTIMIZATION HINT\nI have detected that you likely need to modify these specific components: ${intentResult.targets.join(', ')}.\nPlease consider using the \`<<<<AST_REPLACE: TargetName>>>>\` format for these to ensure precision and avoid truncation.`;
                // Append to user prompt effectively (or prepend to code context)
                // We'll append it to the codeContext later or just modify the prompt passed to LLM?
                // Let's append it to codeContext for visibility
                codeContext += targetHint;
            }

            // Process RAG Results
             chunksTotal = body.current_code.split(/\n(?=(?:const|function|class|export)\s)/).length;
             chunksSelected = relevantChunks?.length || 0;

             if (relevantChunks && relevantChunks.length > 0) {
                 codeContext = `\n\n### RELEVANT CODE CONTEXT (RAG)\nThe following code sections are most relevant to the user's request. Focus your changes here if possible:\n\n`;
                 codeContext += relevantChunks.map(c => `// --- Section: ${c.id} ---\n${c.content}\n`).join('\n');
                 
                 const relevantIds = relevantChunks.map(c => c.id);
                 console.log(`[CodeRAG] Found ${relevantChunks.length} relevant chunks: ${relevantIds.join(', ')}`);
                 
                 // D. Smart Context Compression (Intent-Aware)
                 if (body.current_code.length > 10000) {
                     console.log('[CodeRAG] Code is large, applying Smart Compression...');
                     const compressionStartTime = Date.now();
                     
                     // Pass explicit targets from intent classification to force expansion
                     const explicitTargets = intentResult?.targets || [];
                     
                     // NEW: Pass reference targets (skeleton only, not full code)
                     const referenceTargets = intentResult?.referenceTargets || [];
                     
                     // Pass intent to compressCode for dynamic threshold adjustment
                     const detectedIntent = intentResult?.intent || UserIntent.UNKNOWN;
                     compressedCode = compressCode(body.current_code, relevantIds, explicitTargets, detectedIntent, referenceTargets);
                     
                     compressionLatencyMs = Date.now() - compressionStartTime;
                     const compressionRate = ((1 - compressedCode.length / body.current_code.length) * 100).toFixed(1);
                     console.log(`[CodeRAG] Compressed: ${body.current_code.length} → ${compressedCode.length} chars (${compressionRate}% reduction, ${compressionLatencyMs}ms)`);
                 }
             }
        } else if (body.type === 'modification' && body.user_prompt) {
            // Fallback for cases without current_code (shouldn't happen in normal flow)
            intentResult = await classifyUserIntent(body.user_prompt);
        }

        console.log('[RAG] Reference RAG skipped (Global Disable).');

    } catch (ragError) {
        console.warn('[RAG] Failed to generate context:', ragError);
        // Non-blocking, continue without RAG
    }
    
    // E. 异步记录 RAG 日志（fire-and-forget，不阻塞响应）
    const totalLatencyMs = Date.now() - ragStartTime;
    if (body.type === 'modification' && body.user_prompt) {
        const logEntry: RAGLogEntry = {
            userId: session.user.id,
            userQuery: body.user_prompt,
            queryLanguage: detectQueryLanguage(body.user_prompt),
            detectedIntent: intentResult?.intent || UserIntent.UNKNOWN,
            intentConfidence: intentResult?.confidence || 0,
            intentSource: intentResult?.source || 'local',
            intentLatencyMs,
            ragLatencyMs,
            compressionLatencyMs,
            totalLatencyMs,
            codeLength: body.current_code?.length || 0,
            compressedLength: compressedCode?.length || 0,
            compressionRatio: compressedCode && body.current_code 
                ? compressedCode.length / body.current_code.length 
                : 0,
            chunksTotal,
            chunksSelected,
            model: body.model
        };
        
        // Fire-and-forget: 不等待日志写入完成
        logRAGRequest(logEntry).catch(err => {
            console.warn('[RAG Logger] Async log failed:', err);
        });
    }
    
    // Construct RAG Summary for UI
    let ragSummary = '';
    if (body.type === 'modification') {
        const intentMap: Record<string, string> = {
            'UI_MODIFICATION': '界面调整',
            'LOGIC_MODIFICATION': '逻辑修改',
            'BUG_FIX': '问题修复',
            'NEW_FEATURE': '新功能开发',
            'PERFORMANCE': '性能优化',
            'REFACTOR': '代码重构',
            'UNKNOWN': '通用修改'
        };

        const intent = intentResult?.intent || 'UNKNOWN';
        const intentCn = intentMap[intent] || '通用修改';
        
        const compressionRate = compressedCode && body.current_code 
            ? ((1 - compressedCode.length / body.current_code.length) * 100).toFixed(0)
            : '0';
        
        ragSummary = `识别意图：${intentCn}\n分析结果：已定位 ${chunksSelected} 个核心模块，上下文优化 ${compressionRate}%`;
    }

    return NextResponse.json({ 
        taskId: task.id, 
        ragContext, 
        codeContext, 
        compressedCode, 
        ragSummary,
        targets: intentResult?.targets || [], // Return targets for client-side patch safety
        reasoning: intentResult?.reasoning || null // 🆕 返回 DeepSeek 思考过程
    });

    /* 
    // Old Logic Removed
    const controller = new AbortController();
    ...
    */

  } catch (error) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: '服务器内部错误 (Internal Server Error)' }, { status: 500 });
  }
}
