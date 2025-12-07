import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getRAGContext } from '@/lib/rag';
import { findRelevantCodeChunks, compressCode } from '@/lib/code-rag';

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
    
    // 1. Create Task in DB
    // Truncate prompt to avoid huge payload issues in DB (Postgres text limit is high, but network/timeout might be an issue)
    const MAX_PROMPT_LENGTH = 50000; // 50KB limit for DB storage
    const storedPrompt = body.user_prompt && body.user_prompt.length > MAX_PROMPT_LENGTH 
        ? body.user_prompt.substring(0, MAX_PROMPT_LENGTH) + '... (truncated)' 
        : body.user_prompt;

    const { data: task, error: taskError } = await adminSupabase
      .from('generation_tasks')
      .insert({
        user_id: session.user.id,
        prompt: storedPrompt,
        status: 'pending'
      })
      .select()
      .single();

    if (taskError || !task) {
        console.error('Task Creation Error:', taskError);
        return NextResponse.json({ 
            error: '创建任务失败 (Failed to create generation task)', 
            details: taskError 
        }, { status: 500 });
    }

    // 2. RAG Context Generation
    let ragContext = '';
    let codeContext = '';
    let compressedCode = '';

    try {
        // A. Reference RAG (Similar Apps)
        // DISABLED: Reference RAG is currently disabled for all modes (Generation & Modification) to save tokens and reduce noise.
        /*
        if (body.type !== 'modification') {
            ragContext = await getRAGContext(adminSupabase, body.user_prompt);
            if (ragContext) {
                console.log(`[RAG] Reference Context generated for task ${task.id}`);
            }
        } else {
            console.log(`[RAG] Skipping Reference RAG for modification task to save tokens.`);
        }
        */
       console.log('[RAG] Reference RAG skipped (Global Disable).');

        // B. Codebase RAG (For Modifications)
        // If this is a modification request (type='modification') and we have the current code
        if (body.type === 'modification' && body.current_code) {
             console.log(`[CodeRAG] Analyzing code for modification... Length: ${body.current_code.length}`);
             const relevantChunks = await findRelevantCodeChunks(
                 body.user_prompt, 
                 body.current_code,
                 process.env.NEXT_PUBLIC_SUPABASE_URL!,
                 process.env.SUPABASE_SERVICE_ROLE_KEY!
             );

             if (relevantChunks && relevantChunks.length > 0) {
                 codeContext = `\n\n### RELEVANT CODE CONTEXT (RAG)\nThe following code sections are most relevant to the user's request. Focus your changes here if possible:\n\n`;
                 codeContext += relevantChunks.map(c => `// --- Section: ${c.id} ---\n${c.content}\n`).join('\n');
                 
                 // Log which chunks were found relevant (helps debug compression rates)
                 const relevantIds = relevantChunks.map(c => c.id);
                 console.log(`[CodeRAG] Found ${relevantChunks.length} relevant chunks: ${relevantIds.join(', ')}`);
                 
                 // C. Smart Context Compression
                 // Skip compression for first edit on uploaded code (is_first_edit flag)
                 // This improves patch success rate for unfamiliar code structures
                 const isFirstEdit = body.is_first_edit === true;
                 
                 if (isFirstEdit) {
                     console.log('[CodeRAG] First edit on uploaded code - skipping compression for better patch accuracy');
                 } else if (body.current_code.length > 10000) {
                     // If code is large (> 10KB), compress it by collapsing irrelevant chunks
                     console.log('[CodeRAG] Code is large, applying Smart Compression...');
                     compressedCode = compressCode(body.current_code, relevantIds);
                     const compressionRate = ((1 - compressedCode.length / body.current_code.length) * 100).toFixed(1);
                     console.log(`[CodeRAG] Compressed: ${body.current_code.length} → ${compressedCode.length} chars (${compressionRate}% reduction)`);
                 }
             }
        }

    } catch (ragError) {
        console.warn('[RAG] Failed to generate context:', ragError);
        // Non-blocking, continue without RAG
    }
    
    return NextResponse.json({ taskId: task.id, ragContext, codeContext, compressedCode });

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
