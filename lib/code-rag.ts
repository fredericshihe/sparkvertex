import { SupabaseClient } from '@supabase/supabase-js';

// Helper to calculate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 1. Chunking Logic
export function chunkCode(code: string): { id: string, content: string, type: string, startIndex?: number, endIndex?: number }[] {
    const chunks: { id: string, content: string, type: string, startIndex?: number, endIndex?: number }[] = [];
    
    // Simple splitting strategy for Single File React
    // 1. Extract CSS/Style
    const styleMatch = code.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
        chunks.push({
            id: 'style-block',
            content: styleMatch[1].trim(),
            type: 'css',
            startIndex: styleMatch.index! + 7, // Skip <style>
            endIndex: styleMatch.index! + styleMatch[0].length - 8 // Skip </style>
        });
    }

    // 2. Extract Components (Heuristic: const X = ... or function X)
    // We look for top-level component definitions inside the script tag
    const scriptContentMatch = code.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
    if (scriptContentMatch) {
        const scriptContent = scriptContentMatch[1];
        const scriptStartOffset = scriptContentMatch.index! + 25; // <script type="text/babel"> length
        
        // Split by component definitions roughly
        // Regex to find "const ComponentName =" or "function ComponentName"
        // This is a naive splitter, but works for simple React files
        const componentRegex = /(?:const|function)\s+([A-Z][a-zA-Z0-9_]*)\s*(?:=|\()/g;
        let match;
        let lastIndex = 0;
        let lastComponentName = 'Imports/Setup';

        while ((match = componentRegex.exec(scriptContent)) !== null) {
            const componentName = match[1];
            const startIndex = match.index;
            
            // Save previous chunk
            if (startIndex > lastIndex) {
                const content = scriptContent.substring(lastIndex, startIndex).trim();
                if (content.length > 50) { // Filter tiny chunks
                    chunks.push({
                        id: `component-${lastComponentName}`,
                        content: content,
                        type: 'js',
                        startIndex: scriptStartOffset + lastIndex,
                        endIndex: scriptStartOffset + startIndex
                    });
                }
            }
            
            lastIndex = startIndex;
            lastComponentName = componentName;
        }
        
        // Add the last chunk
        if (lastIndex < scriptContent.length) {
            chunks.push({
                id: `component-${lastComponentName}`,
                content: scriptContent.substring(lastIndex).trim(),
                type: 'js',
                startIndex: scriptStartOffset + lastIndex,
                endIndex: scriptStartOffset + scriptContent.length
            });
        }
    } else {
        // Fallback: Split by lines if no script tag found (unlikely)
        const lines = code.split('\n');
        const chunkSize = 100;
        let currentLine = 0;
        let charCount = 0;
        
        for (let i = 0; i < lines.length; i += chunkSize) {
            const chunkLines = lines.slice(i, i + chunkSize);
            const content = chunkLines.join('\n');
            chunks.push({
                id: `chunk-${i}`,
                content: content,
                type: 'text',
                startIndex: charCount,
                endIndex: charCount + content.length
            });
            charCount += content.length + 1; // +1 for newline
        }
    }

    return chunks;
}

// 3. Compression Logic
export function compressCode(code: string, relevantChunkIds: string[]): string {
    const chunks = chunkCode(code);
    // Sort chunks by startIndex descending to replace from bottom up without messing indices
    // Only consider JS chunks for now as they are inside the script tag
    const jsChunks = chunks.filter(c => c.type === 'js' && c.startIndex !== undefined).sort((a, b) => b.startIndex! - a.startIndex!);
    
    let compressed = code;

    for (const chunk of jsChunks) {
        // Always keep Imports/Setup and the last chunk (usually ReactDOM.render)
        if (chunk.id.includes('Imports/Setup') || chunk.id.includes('ReactDOM')) continue;

        // Special handling for App component - ALWAYS keep it full
        // App is the main entry point and most frequently modified
        if (chunk.id.includes('App')) {
            console.log('[Compression] Keeping App component in full');
            continue;
        }

        if (!relevantChunkIds.includes(chunk.id)) {
            // This chunk is irrelevant, compress it
            const lines = chunk.content.split('\n');
            
            let replacement = '';
            if (lines.length <= 15) {
                // Small component: Keep full content (not worth compressing)
                continue;
            } else {
                // Large component: Smart compression
                // Keep: Header (first 5 lines) + Return statement region + Footer (last 3 lines)
                const header = lines.slice(0, 5).join('\n');
                const footer = lines.slice(-3).join('\n');
                
                // Find the return statement region (critical for UI modifications)
                let returnRegion = '';
                const returnIndex = lines.findIndex(l => /^\s*return\s*[\(\{]/.test(l) || /^\s*return\s*$/.test(l));
                if (returnIndex !== -1 && returnIndex > 5 && returnIndex < lines.length - 5) {
                    // Include 3 lines before and 5 lines after the return keyword
                    const returnStart = Math.max(5, returnIndex - 2);
                    const returnEnd = Math.min(lines.length - 3, returnIndex + 8);
                    returnRegion = `\n  // ... middle code omitted ...\n${lines.slice(returnStart, returnEnd).join('\n')}`;
                }
                
                const omittedCount = lines.length - 8 - (returnRegion ? 10 : 0);
                if (omittedCount <= 5) {
                    // Not enough to compress, keep full
                    continue;
                }
                
                replacement = `${header}${returnRegion}\n  // ... ${omittedCount} lines omitted (not relevant to current task) ...\n${footer}`;
            }

            // Perform replacement
            // Since we are replacing in the original string, and we iterate backwards, indices are valid.
            compressed = compressed.substring(0, chunk.startIndex!) + replacement + compressed.substring(chunk.endIndex!);
        }
    }
    
    return compressed;
}


// 2. Embedding & Retrieval Logic
export async function findRelevantCodeChunks(
    userPrompt: string, 
    code: string, 
    supabaseUrl: string, 
    supabaseKey: string
) {
    try {
        // A. Chunk the code
        const chunks = chunkCode(code);
        if (chunks.length === 0) return null;

        // B. Prepare inputs for embedding (Prompt + All Chunks)
        // We need to embed the prompt AND the chunks to compare them.
        // In a real vector DB, chunks are pre-embedded. Here we do it on-the-fly.
        // Optimization: If code hasn't changed, we could cache these embeddings? 
        // For now, we assume we re-calculate.
        
        const inputs = [userPrompt, ...chunks.map(c => `[${c.type}] ${c.content.substring(0, 1000)}`)]; // Truncate for embedding to save tokens/limits

        // C. Call Edge Function (Batch)
        const response = await fetch(`${supabaseUrl}/functions/v1/embed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ inputs })
        });

        if (!response.ok) throw new Error('Failed to get embeddings');
        
        const { embeddings } = await response.json();
        if (!embeddings || embeddings.length !== inputs.length) throw new Error('Invalid embedding response');

        const promptEmbedding = embeddings[0];
        const chunkEmbeddings = embeddings.slice(1);

        // D. Rank Chunks
        const scoredChunks = chunks.map((chunk, index) => ({
            ...chunk,
            score: cosineSimilarity(promptEmbedding, chunkEmbeddings[index])
        }));

        // Sort by score descending
        scoredChunks.sort((a, b) => b.score - a.score);

        // E. Smart Selection Strategy
        // - Always include App component if it exists (most frequently modified)
        // - Use adaptive threshold: if top match is very high (>0.7), be stricter; otherwise be lenient
        // - Cap at Top 5 to balance context vs token usage
        
        const topScore = scoredChunks.length > 0 ? scoredChunks[0].score : 0;
        // Adaptive threshold: high confidence request = stricter filter
        const dynamicThreshold = topScore > 0.7 ? 0.45 : 0.35;
        
        let relevantChunks = scoredChunks.filter(c => c.score > dynamicThreshold).slice(0, 5);
        
        // Ensure App component is always included if it exists (critical for most modifications)
        const appChunk = scoredChunks.find(c => c.id.includes('App'));
        if (appChunk && !relevantChunks.find(c => c.id.includes('App'))) {
            relevantChunks.push(appChunk);
        }
        
        console.log(`[CodeRAG] Dynamic threshold: ${dynamicThreshold.toFixed(2)} (top score: ${topScore.toFixed(2)})`);
        
        return relevantChunks;

    } catch (error) {
        console.error('Code RAG Error:', error);
        return null;
    }
}
