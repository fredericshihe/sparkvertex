import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getRAGContext } from '@/lib/rag';
import { findRelevantCodeChunks, compressCode } from '@/lib/code-rag';
import { logRAGRequest, detectQueryLanguage, type RAGLogEntry } from '@/lib/rag-logger';
import { classifyUserIntent, UserIntent } from '@/lib/intent-classifier';

// 使用 Node.js Runtime 以支持更长的超时设置
export const runtime = 'nodejs';
// 增加最大执行时间 (Vercel Hobby 限制 60s, Pro 限制 300s)
export const maxDuration = 60; 
export const dynamic = 'force-dynamic'; 

export async function POST(request: Request) {
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
            
            const intentPromise = classifyUserIntent(body.user_prompt);
            
            const ragPromise = findRelevantCodeChunks(
                 body.user_prompt, 
                 body.current_code,
                 process.env.NEXT_PUBLIC_SUPABASE_URL!,
                 process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // Wait for both to complete
            const [intentRes, relevantChunks] = await Promise.all([intentPromise, ragPromise]);
            
            // Update results
            intentResult = intentRes;
            intentLatencyMs = intentResult.latencyMs;
            ragLatencyMs = Date.now() - ragStartTime - intentLatencyMs; // Approximate

            console.log(`[IntentClassifier] Intent: ${intentResult.intent} (confidence: ${intentResult.confidence}, source: ${intentResult.source}, ${intentLatencyMs}ms)`);
            
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
                     
                     // Pass intent to compressCode for dynamic threshold adjustment
                     const detectedIntent = intentResult?.intent || UserIntent.UNKNOWN;
                     compressedCode = compressCode(body.current_code, relevantIds, explicitTargets, detectedIntent);
                     
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
        targets: intentResult?.targets || [] // Return targets for client-side patch safety
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
