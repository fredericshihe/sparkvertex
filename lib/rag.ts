import { SupabaseClient } from '@supabase/supabase-js';

export async function getRAGContext(supabase: SupabaseClient, userPrompt: string) {
  try {
    // 1. Generate Embedding
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.warn('RAG: Missing Supabase Service Key');
        return '';
    }

    // 设置 10 秒超时，避免 embed 函数阻塞太久
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const embedResponse = await fetch(`${supabaseUrl}/functions/v1/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ input: userPrompt }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!embedResponse.ok) {
        console.warn('RAG: Embed function failed', await embedResponse.text());
        return '';
    }

    const embedData = await embedResponse.json();
    const embedding = embedData.embedding;

    if (!embedding) return '';

    console.log(`[RAG] Generated embedding for prompt: "${userPrompt.substring(0, 50)}..."`);

    // 2. Search Similar Items
    const { data: similarItems, error } = await supabase.rpc('match_items', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 3
    });

    if (error) {
        console.error('RAG: match_items error', error);
        return '';
    }

    if (!similarItems || similarItems.length === 0) {
        console.log('[RAG] No similar items found (threshold 0.7).');
        return '';
    }

    console.log(`[RAG] Found ${similarItems.length} similar items:`, similarItems.map((i: any) => i.title).join(', '));

    // 3. Fetch Content for Similar Items
    const ids = similarItems.map((item: any) => item.id);
    const { data: itemsContent } = await supabase
        .from('items')
        .select('id, title, description, code')
        .in('id', ids);

    if (!itemsContent) return '';

    // 4. Format Context
    const context = itemsContent.map((item: any) => 
      `### Reference: ${item.title}\nDescription: ${item.description}\nCode Snippet:\n${item.code.substring(0, 1000)}...\n`
    ).join('\n---\n');

    return `\n\n[Relevant Code Examples]\n${context}\nUse these examples to understand the coding style and structure, but do not copy them directly unless requested.`;
  } catch (error) {
    console.error('RAG Error:', error);
    return '';
  }
}
