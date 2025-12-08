import { SupabaseClient } from '@supabase/supabase-js';
import { analyzeDependencies, extractJSXComponents } from './ast-parser';
import { 
    classifyUserIntent, 
    UserIntent, 
    SearchStrategy,
    filterFilesByStrategy,
    prioritizeFilesByStrategy 
} from './intent-classifier';

// Re-export for external use
export type { SearchStrategy } from './intent-classifier';
export { UserIntent, classifyUserIntent } from './intent-classifier';
export { analyzeDependencies, analyzeFullDependencies } from './ast-parser';

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

// Helper: Extract dependencies from a component using AST + regex fallback
// Uses AST for JSX components, regex for variable references
function extractDependencies(content: string, allChunkIds: string[]): string[] {
    const deps: Set<string> = new Set();
    
    // 1. Use AST to extract JSX component usage (more accurate than regex)
    try {
        const jsxComponents = extractJSXComponents(content);
        for (const componentName of jsxComponents) {
            const chunkId = `component-${componentName}`;
            if (allChunkIds.includes(chunkId)) {
                deps.add(chunkId);
            }
        }
    } catch (error) {
        // Fallback to regex if AST parsing fails
        console.warn('[CodeRAG] AST parsing failed, using regex fallback:', error);
        const jsxUsageRegex = /<([A-Z][a-zA-Z0-9_]+)[\s/>]/g;
        let match;
        while ((match = jsxUsageRegex.exec(content)) !== null) {
            const componentName = match[1];
            const chunkId = `component-${componentName}`;
            if (allChunkIds.includes(chunkId)) {
                deps.add(chunkId);
            }
        }
    }
    
    // 2. Look for variable references to other components/constants
    // e.g., COLORS.primary, THEMES.dark, MAP_GRID, etc.
    // Improved regex: matches CONSTANT.prop OR just CONSTANT (if length > 3)
    // This ensures we catch constants passed as props like <Map data={MAP_GRID} />
    const varRefRegex = /\b([A-Z][A-Z0-9_]{2,})\b/g;
    let match;
    while ((match = varRefRegex.exec(content)) !== null) {
        const constName = match[1];
        // Filter out common keywords to reduce noise
        if (['React', 'JSON', 'Math', 'Date', 'Array', 'Object', 'console', 'window', 'document'].includes(constName)) continue;
        
        const chunkId = `component-${constName}`;
        if (allChunkIds.includes(chunkId)) {
            deps.add(chunkId);
        }
    }
    
    return Array.from(deps);
}

// Helper: Check if chunk is an "entry point" (App, Main, Index) - should be de-prioritized
function isEntryPointChunk(chunkId: string): boolean {
    const entryNames = ['App', 'Main', 'Index', 'Root', 'Layout'];
    return entryNames.some(name => chunkId.toLowerCase().includes(name.toLowerCase()));
}

// Helper: Check if a token is significant enough to match against component names
// Allows short but meaningful component names like Map, Tab, Nav, API
function isSignificant(token: string): boolean {
    // 1. Long enough (4+ chars)
    if (token.length >= 4) return true;
    // 2. 3-char PascalCase component name (Map, Tab, Nav, Box, Row, Col)
    if (token.length >= 3 && /^[A-Z]/.test(token)) return true;
    // 3. All-caps abbreviation (API, URL, UI)
    if (token.length >= 2 && /^[A-Z]+$/.test(token)) return true;
    
    return false;
}

// Helper: Extract Chinese keywords that might match component names
function extractChineseKeywords(prompt: string): string[] {
    const keywordMap: Record<string, string[]> = {
        // 休闲游戏
        '地图': ['map', 'grid', 'maze', 'level', 'world'],
        '迷宫': ['maze', 'grid', 'map'],
        '关卡': ['level', 'stage', 'mission'],
        '角色': ['character', 'player', 'avatar', 'hero'],
        '怪兽': ['monster', 'enemy', 'boss', 'mob'],
        '敌人': ['monster', 'enemy', 'boss'],
        '战斗': ['battle', 'fight', 'combat', 'attack'],
        '技能': ['skill', 'ability', 'move', 'magic'],
        '道具': ['item', 'inventory', 'bag', 'loot'],
        '背包': ['bag', 'inventory', 'storage'],
        '商店': ['shop', 'store', 'market', 'merchant'],
        '任务': ['quest', 'task', 'mission'],
        '成就': ['achievement', 'trophy', 'badge'],
        '排行榜': ['leaderboard', 'rank', 'score'],
        '分数': ['score', 'point', 'stat'],
        '血量': ['hp', 'health', 'life'],
        '蓝量': ['mp', 'mana', 'energy'],
        '经验': ['exp', 'level', 'growth'],
        '等级': ['level', 'rank', 'grade'],
        '金币': ['gold', 'coin', 'money', 'currency'],
        '钻石': ['diamond', 'gem', 'premium'],
        
        // 益智/解谜
        '拼图': ['puzzle', 'piece', 'board'],
        '棋盘': ['board', 'grid', 'cell', 'tile'],
        '方块': ['block', 'cube', 'tile', 'brick'],
        '卡牌': ['card', 'deck', 'hand'],
        '消除': ['match', 'clear', 'crush'],
        '数独': ['sudoku', 'grid', 'number'],
        '填字': ['crossword', 'word', 'grid'],
        
        // 实用工具
        '计算': ['calc', 'math', 'compute'],
        '转换': ['convert', 'transform', 'change'],
        '查询': ['search', 'query', 'find'],
        '天气': ['weather', 'forecast', 'climate'],
        '日历': ['calendar', 'date', 'schedule'],
        '时钟': ['clock', 'time', 'timer', 'watch'],
        '待办': ['todo', 'task', 'list'],
        '笔记': ['note', 'memo', 'editor'],
        '翻译': ['translate', 'lang', 'i18n'],
        
        // 教育学习
        '课程': ['course', 'lesson', 'class'],
        '题目': ['question', 'quiz', 'exam', 'test'],
        '答案': ['answer', 'solution', 'key'],
        '科普': ['wiki', 'info', 'guide'],
        '单词': ['word', 'vocab', 'dict'],
        
        // 创意设计
        '画板': ['canvas', 'draw', 'paint'],
        '色彩': ['color', 'palette', 'theme'],
        '排版': ['layout', 'grid', 'flex'],
        '图标': ['icon', 'svg', 'image'],
        '动画': ['anim', 'motion', 'transition'],
        
        // 开发者工具
        '代码': ['code', 'editor', 'syntax'],
        '调试': ['debug', 'log', 'console'],
        '生成': ['generate', 'create', 'build'],
        '配置': ['config', 'setting', 'option'],
        
        // 数据可视化
        '图表': ['chart', 'graph', 'plot'],
        '分析': ['analyze', 'stat', 'report'],
        '展示': ['display', 'show', 'view'],
        
        // 影音娱乐
        '音乐': ['music', 'audio', 'sound', 'song'],
        '视频': ['video', 'player', 'movie'],
        '播放': ['play', 'media', 'stream'],
        
        // 生活便利
        '健康': ['health', 'fit', 'body'],
        '记账': ['finance', 'money', 'bill'],
        '日常': ['daily', 'life', 'habit'],
        
        // 通用 UI
        '按钮': ['button', 'btn', 'action'],
        '输入': ['input', 'form', 'field'],
        '列表': ['list', 'table', 'grid'],
        '弹窗': ['modal', 'dialog', 'popup'],
        '导航': ['nav', 'menu', 'tab', 'bar'],
        '侧边栏': ['sidebar', 'drawer', 'panel'],
        '页脚': ['footer', 'bottom', 'end'],
        '页头': ['header', 'top', 'start'],
        '卡片': ['card', 'box', 'container'],
        '图片': ['image', 'img', 'pic', 'photo'],
        '链接': ['link', 'url', 'href'],
        '文本': ['text', 'label', 'title', 'desc']
    };
    
    const result: string[] = [];
    for (const [chinese, english] of Object.entries(keywordMap)) {
        if (prompt.includes(chinese)) {
            result.push(...english);
        }
    }
    return result;
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

// Helper: Extract semantic signature from a component
function extractComponentSignature(content: string): { 
    props: string, 
    state: string[], 
    effects: string[],
    handlers: string[],
    renders: string 
} {
    const result: { props: string, state: string[], effects: string[], handlers: string[], renders: string } = {
        props: '',
        state: [],
        effects: [],
        handlers: [],
        renders: ''
    };
    
    // 1. Extract Props (from function parameters)
    const propsMatch = content.match(/(?:const|function)\s+\w+\s*=?\s*\([\s\n]*\{?\s*([^)}]*?)\s*\}?[\s\n]*\)[\s\n]*(?:=>|{)/);
    if (propsMatch && propsMatch[1].trim()) {
        // Clean up: remove types, default values, keep just names
        const propsRaw = propsMatch[1];
        const propNames = propsRaw.split(',')
            .map(p => p.split('=')[0].split(':')[0].trim())
            .filter(p => p && !p.includes('{') && !p.includes('}'));
        if (propNames.length > 0) {
            result.props = propNames.join(', ');
        }
    }
    
    // 2. Extract State (useState calls) - limit to first 5
    const stateMatches = Array.from(content.matchAll(/const\s+\[(\w+),\s*set(\w+)\]\s*=\s*useState(?:<[^>]+>)?\s*\(/g));
    if (stateMatches.length > 0) {
        result.state = stateMatches.slice(0, 5).map(m => m[1]);
    }
    
    // 3. Extract Effects (useEffect patterns) - simplified
    const effectMatches = Array.from(content.matchAll(/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([^\]]*)\]/g));
    if (effectMatches.length > 0) {
        result.effects = effectMatches.slice(0, 3).map(m => {
            const deps = m[1].trim();
            return deps ? `[${deps}]` : '[]';
        });
    }
    
    // 4. Extract Handler functions (const handleXxx = or function handleXxx)
    const handlerMatches = Array.from(content.matchAll(/(?:const|function)\s+(handle\w+|on\w+)\s*=?\s*(?:\([^)]*\)|async\s*\([^)]*\))\s*(?:=>|{)/g));
    if (handlerMatches.length > 0) {
        result.handlers = handlerMatches.slice(0, 5).map(m => m[1]);
    }
    
    // 5. Extract Root JSX element
    const returnMatch = content.match(/return\s*\(\s*\n?\s*<(\w+)(?:\s+[^>]*)?>/);
    if (returnMatch) {
        // Try to get className for context
        const classMatch = content.match(/return\s*\(\s*\n?\s*<\w+[^>]*className=["']([^"']+)["']/);
        if (classMatch) {
            const classes = classMatch[1].split(' ').slice(0, 3).join(' ');
            result.renders = `<${returnMatch[1]} className="${classes}...">`;
        } else {
            result.renders = `<${returnMatch[1]}>`;
        }
    }
    
    return result;
}

// Helper: Extract JSX children component names for compression summary
function extractJSXChildrenSummary(content: string): string[] {
    const children: Set<string> = new Set();
    
    // Match JSX component usage (PascalCase tags)
    const jsxTagRegex = /<([A-Z][a-zA-Z0-9_]+)[\s/>]/g;
    let match;
    while ((match = jsxTagRegex.exec(content)) !== null) {
        children.add(match[1]);
    }
    
    // Remove self (if component renders itself recursively)
    const selfNameMatch = content.match(/(?:const|function)\s+([A-Z][a-zA-Z0-9_]*)/);
    if (selfNameMatch) {
        children.delete(selfNameMatch[1]);
    }
    
    return Array.from(children);
}

// Intent-based compression thresholds
// Lower threshold = more aggressive compression (fewer lines needed to trigger compression)
// UI changes need less context, logic changes need more
type CompressionIntent = 'UI_MODIFICATION' | 'LOGIC_FIX' | 'NEW_FEATURE' | 'DATA_OPERATION' | 'REFACTOR' | 'PERFORMANCE' | 'UNKNOWN';

const COMPRESSION_THRESHOLDS: Record<CompressionIntent, number> = {
    'UI_MODIFICATION': 8,    // 颜色、样式、布局 - 非常激进，只需要目标组件
    'LOGIC_FIX': 12,         // 修复 Bug - 中等，可能需要相关代码
    'NEW_FEATURE': 15,       // 新功能 - 保守，需要理解更多上下文
    'DATA_OPERATION': 12,    // 数据操作 - 中等
    'REFACTOR': 10,          // 重构 - 中等偏激进
    'PERFORMANCE': 12,       // 性能优化 - 中等
    'UNKNOWN': 15,           // 默认 - 保守
};

// 3. Semantic Compression Logic - Aggressive Mode
// Goal: Reduce tokens as much as possible while preserving patch accuracy
export function compressCode(
    code: string, 
    relevantChunkIds: string[], 
    explicitTargets: string[] = [],
    intent?: string // Optional: UserIntent from intent-classifier
): string {
    const chunks = chunkCode(code);
    // Sort chunks by startIndex descending to replace from bottom up without messing indices
    // Only consider JS chunks for now as they are inside the script tag
    const jsChunks = chunks.filter(c => c.type === 'js' && c.startIndex !== undefined).sort((a, b) => b.startIndex! - a.startIndex!);
    
    // Dynamic compression threshold based on intent
    const intentKey = (intent as CompressionIntent) || 'UNKNOWN';
    const compressionThreshold = COMPRESSION_THRESHOLDS[intentKey] || 15;
    
    console.log(`[Compression] Total JS chunks: ${jsChunks.length}, Relevant IDs: ${relevantChunkIds.join(', ')}`);
    console.log(`[Compression] Intent: ${intent || 'UNKNOWN'}, Threshold: ${compressionThreshold} lines`);
    if (explicitTargets.length > 0) {
        console.log(`[Compression] Explicit targets (Force Expand): ${explicitTargets.join(', ')}`);
    }
    
    let compressed = code;
    let compressedCount = 0;

    for (const chunk of jsChunks) {
        const lines = chunk.content.split('\n');
        
        // Only skip ReactDOM.render (essential for app to work)
        if (chunk.id.includes('ReactDOM')) {
            console.log(`[Compression] Skipping ${chunk.id} (ReactDOM render)`);
            continue;
        }
        
        // Check if this chunk is in the relevant list
        const isRelevant = relevantChunkIds.includes(chunk.id);
        
        // Check if this chunk is an explicit target (Intent-Aware Decompression)
        const componentName = chunk.id.replace('component-', '');
        const isExplicitTarget = explicitTargets.some(t => 
            t.toLowerCase() === componentName.toLowerCase() || 
            chunk.id.toLowerCase().includes(t.toLowerCase())
        );

        if (isExplicitTarget) {
            console.log(`[Compression] Force expanding ${chunk.id} (Explicit Target)`);
            continue;
        }

        // Intent-Driven Expansion: If intent is DATA/LOGIC, do NOT compress large arrays/objects
        // These are often configuration data (MAP_GRID, MONSTERS) that need to be fully visible
        const isDataOrLogicIntent = explicitTargets.length > 0; // If we have targets, it implies specific intent
        // Or we can check if the chunk looks like a data definition (const X = [...])
        const isDataDefinition = /const\s+[A-Z0-9_]+\s*=\s*[\[\{]/.test(chunk.content);
        
        if (isDataOrLogicIntent && isDataDefinition) {
             console.log(`[Compression] Force expanding ${chunk.id} (Data Definition in Logic/Data Intent)`);
             continue;
        }

        if (isRelevant) {
            console.log(`[Compression] Keeping ${chunk.id} (relevant, ${lines.length} lines)`);
            continue;
        }
        
        // Use dynamic compression threshold based on mode
        if (lines.length <= compressionThreshold) {
            console.log(`[Compression] Skipping ${chunk.id} (too small: ${lines.length} lines, threshold: ${compressionThreshold})`);
            continue;
        }
        
        // This chunk is irrelevant and large enough, apply semantic compression
        console.log(`[Compression] Compressing ${chunk.id} (${lines.length} lines)`);
        
        const sig = extractComponentSignature(chunk.content);
        
        // Build semantic summary with more detail for better AI understanding
        const summaryParts: string[] = [];
        if (sig.props) summaryParts.push(`Props: ${sig.props}`);
        if (sig.state.length > 0) summaryParts.push(`State: ${sig.state.join(', ')}`);
        if (sig.handlers.length > 0) summaryParts.push(`Handlers: ${sig.handlers.slice(0, 3).join(', ')}${sig.handlers.length > 3 ? '...' : ''}`);
        if (sig.effects.length > 0) summaryParts.push(`Effects: ${sig.effects.length}`);
        if (sig.renders) summaryParts.push(`Renders: ${sig.renders}`);
        
        // Extract key JSX children for better context (up to 5)
        const jsxChildren = extractJSXChildrenSummary(chunk.content);
        if (jsxChildren.length > 0) {
            summaryParts.push(`Children: ${jsxChildren.slice(0, 5).join(', ')}${jsxChildren.length > 5 ? '...' : ''}`);
        }
        
        const summaryText = summaryParts.length > 0 
            ? summaryParts.join(' | ') 
            : `${lines.length} lines of logic`;
        
        // Create compressed replacement with semantic info and READ-ONLY warning
        const replacement = `/** @semantic-compressed ${componentName} (${lines.length} lines) [READ-ONLY]
 * ${summaryText}
 * ⚠️ THIS IS READ-ONLY CONTEXT - DO NOT MODIFY THIS COMPONENT
 * ⚠️ If you need to change ${componentName}, tell the user to explicitly request it
 * ⚠️ NEVER use this compressed code in SEARCH blocks
 */
const ${componentName} = ${sig.props ? `({ ${sig.props} })` : '()'} => { /* compressed - do not modify */ };`;

        compressed = compressed.substring(0, chunk.startIndex!) + replacement + compressed.substring(chunk.endIndex!);
        compressedCount++;
    }
    
    if (compressedCount > 0) {
        console.log(`[Compression] Semantically compressed ${compressedCount} component(s)`);
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

        // D. Rank Chunks with Entry Point De-prioritization
        const allChunkIds = chunks.map(c => c.id);
        const scoredChunks = chunks.map((chunk, index) => {
            let score = cosineSimilarity(promptEmbedding, chunkEmbeddings[index]);
            
            // De-prioritize entry point files (App, Main, Index)
            // They contain too many keywords and pollute the relevance scores
            if (isEntryPointChunk(chunk.id)) {
                score *= 0.85; // 15% penalty
            }
            
            return {
                ...chunk,
                score,
                originalScore: cosineSimilarity(promptEmbedding, chunkEmbeddings[index])
            };
        });

        // Sort by score descending
        scoredChunks.sort((a, b) => b.score - a.score);

        // E. Smart Selection Strategy with Dependency Graph
        // Goal: Include target component AND its direct dependencies
        // 优化：提高阈值，减少噪音，让 AI 更聚焦于核心文件
        
        const topScore = scoredChunks.length > 0 ? scoredChunks[0].score : 0;
        
        // 提高阈值：聚焦于高相关性的代码块
        // 原来: 0.45 / 0.38 / 0.32 → 现在: 0.65 / 0.55 / 0.45
        // 配合智能压缩和 AST 依赖分析，可以更激进地筛选
        const dynamicThreshold = topScore > 0.8 ? 0.65 : topScore > 0.7 ? 0.55 : 0.45;
        
        // Log scores for debugging (show original scores too)
        console.log(`[CodeRAG] Chunk scores: ${scoredChunks.map(c => {
            const suffix = isEntryPointChunk(c.id) ? '(entry,-15%)' : '';
            return `${c.id.replace('component-', '')}=${c.score.toFixed(3)}${suffix}`;
        }).join(', ')}`);
        
        // Step 1: Initial selection - Top N chunks above threshold
        // 限制最多 6 个核心块，平衡精度和效率
        const MAX_INITIAL_CHUNKS = 6;
        let relevantChunks = scoredChunks.filter(c => c.score > dynamicThreshold).slice(0, MAX_INITIAL_CHUNKS);
        
        // Step 2: Safety net - at least Top 3
        if (relevantChunks.length < 3 && scoredChunks.length >= 3) {
            relevantChunks = scoredChunks.slice(0, 3);
        }
        
        // Step 3: Prompt mention detection (CRITICAL for accuracy)
        // If user mentions a component name, force include it
        // OPTIMIZATION: Avoid "multi-word trap" - only match if component name is specific enough
        const promptLower = userPrompt.toLowerCase();
        const chineseKeywords = extractChineseKeywords(promptLower);
        
        let promptMatchCount = 0;
        const MAX_PROMPT_MATCHES = 5; // Increased from 3 to 5 to catch more relevant components (e.g. Map, Grid, Screen)
        
        for (const chunk of scoredChunks) {
            if (promptMatchCount >= MAX_PROMPT_MATCHES) break;
            
            const componentName = chunk.id.replace('component-', '');
            const componentNameLower = componentName.toLowerCase();
            
            // Only match if component name is significant (PascalCase 3+, CAPS 2+, or 4+ chars)
            // This allows Map, Tab, Nav, API while still preventing noise
            if (!isSignificant(componentName)) continue;
            
            const shouldInclude = 
                promptLower.includes(componentNameLower) || 
                promptLower.includes(componentNameLower.replace('screen', '')) ||
                promptLower.includes(componentNameLower.replace('component', '')) ||
                // Chinese keyword matching
                chineseKeywords.some(kw => componentNameLower.includes(kw));
            
            // Boost score for data definitions (MAP_GRID, etc.) if they are somewhat relevant
            // This helps them survive the threshold cut even if semantic similarity is slightly lower
            // Data definitions are critical for game/app logic, use lower threshold (0.50)
            const isDataDefinition = /const\s+[A-Z0-9_]+\s*=\s*[\[\{]/.test(chunk.content);
            if (isDataDefinition && chunk.score > 0.50) { // Lower threshold for data
                 if (!relevantChunks.find(c => c.id === chunk.id)) {
                    console.log(`[CodeRAG] Boosting data definition ${chunk.id} (score=${chunk.score.toFixed(3)})`);
                    relevantChunks.push(chunk);
                    continue;
                 }
            }

            if (shouldInclude && !relevantChunks.find(c => c.id === chunk.id)) {
                console.log(`[CodeRAG] Force including ${chunk.id} (mentioned in prompt)`);
                relevantChunks.push(chunk);
                promptMatchCount++;
            }
        }
        
        // Step 4: Dependency Graph Expansion with DEPTH LIMIT
        // Only include DIRECT dependencies (Depth=1) to prevent "recursion bomb"
        const dependencySet = new Set<string>(relevantChunks.map(c => c.id));
        const MAX_DEPENDENCY_SIZE = 20000; // 20KB limit for dependencies (原来30KB，更精简)
        const MAX_TOTAL_CHUNKS = 10; // 最多10个块，包含依赖
        let totalDependencySize = 0;
        
        // ✅ SAFETY: Create snapshot of initial chunks to iterate
        // This physically prevents infinite loops even if relevantChunks gets modified
        const initialQueue = [...relevantChunks];
        
        for (const chunk of initialQueue) {
            // initialQueue is frozen, no need for originalChunkIds check
            
            // 检查是否已达到总块数限制
            if (dependencySet.size >= MAX_TOTAL_CHUNKS) {
                console.log(`[CodeRAG] Reached max chunk limit (${MAX_TOTAL_CHUNKS}), stopping dependency expansion`);
                break;
            }
            
            const deps = extractDependencies(chunk.content, allChunkIds);
            for (const depId of deps) {
                if (!dependencySet.has(depId)) {
                    // 再次检查总块数限制
                    if (dependencySet.size >= MAX_TOTAL_CHUNKS) break;
                    
                    const depChunk = scoredChunks.find(c => c.id === depId);
                    if (depChunk) {
                        // Check size limit
                        const depSize = depChunk.content.length;
                        if (totalDependencySize + depSize > MAX_DEPENDENCY_SIZE) {
                            console.log(`[CodeRAG] Skipping ${depId} (dependency size limit reached)`);
                            continue;
                        }
                        console.log(`[CodeRAG] Adding ${depId} (dependency of ${chunk.id}, ${depSize} chars)`);
                        dependencySet.add(depId);
                        totalDependencySize += depSize;
                    }
                }
            }
        }
        
        // Rebuild relevantChunks with dependencies
        relevantChunks = scoredChunks.filter(c => dependencySet.has(c.id));
        
        // Step 5: Always include Imports/Setup (hook definitions, constants)
        const importsChunk = scoredChunks.find(c => c.id.includes('Imports'));
        if (importsChunk && !relevantChunks.find(c => c.id.includes('Imports'))) {
            relevantChunks.push(importsChunk);
        }
        
        // Step 6: Include App only if it has low enough rank (avoid noise)
        // App is only useful if it's in top 4, otherwise it's just routing noise
        const appChunk = scoredChunks.find(c => c.id.includes('App'));
        const appRank = scoredChunks.findIndex(c => c.id.includes('App'));
        if (appChunk && appRank < 4 && !relevantChunks.find(c => c.id.includes('App'))) {
            relevantChunks.push(appChunk);
        }
        
        console.log(`[CodeRAG] Threshold: ${dynamicThreshold.toFixed(2)}, Selected: ${relevantChunks.length}/${scoredChunks.length} (includes deps)`);
        
        return relevantChunks;

    } catch (error) {
        console.error('Code RAG Error:', error);
        return null;
    }
}

// ============================================
// Enhanced RAG with Intent Classification
// ============================================

export interface EnhancedRAGOptions {
    useLLMForIntent?: boolean;
    llmThreshold?: number;
    generateText?: (options: { model: string; prompt: string }) => Promise<string>;
}

export interface EnhancedRAGResult {
    strategy: SearchStrategy;
    relevantChunks: Array<{
        id: string;
        content: string;
        type: string;
        score: number;
        startIndex?: number;
        endIndex?: number;
    }> | null;
    metadata: {
        totalChunks: number;
        selectedChunks: number;
        intent: UserIntent;
        confidence: number;
        searchTime: number;
    };
}

/**
 * 增强版 RAG 搜索 - 集成意图分类
 * 在执行向量搜索前先分析用户意图，智能调整搜索策略
 */
export async function findRelevantCodeChunksWithIntent(
    userPrompt: string,
    code: string,
    supabaseUrl: string,
    supabaseKey: string,
    options?: EnhancedRAGOptions
): Promise<EnhancedRAGResult> {
    const startTime = Date.now();
    
    // Step 0: 意图分类
    const strategy = await classifyUserIntent(userPrompt, {
        useLLM: options?.useLLMForIntent,
        llmThreshold: options?.llmThreshold,
        generateText: options?.generateText
    });
    
    console.log(`🎯 [EnhancedRAG] Intent: ${strategy.intent} (confidence: ${(strategy.confidence * 100).toFixed(1)}%)`);
    console.log(`📋 [EnhancedRAG] Strategy: topK=${strategy.topK}, semantic=${strategy.useSemanticSearch}, keyword=${strategy.useKeywordSearch}`);
    
    // Step 1: 使用原有的搜索逻辑，但应用策略调整
    const relevantChunks = await findRelevantCodeChunks(
        userPrompt,
        code,
        supabaseUrl,
        supabaseKey
    );
    
    const searchTime = Date.now() - startTime;
    
    // 构建元数据
    const chunks = chunkCode(code);
    const metadata = {
        totalChunks: chunks.length,
        selectedChunks: relevantChunks?.length || 0,
        intent: strategy.intent,
        confidence: strategy.confidence,
        searchTime
    };
    
    console.log(`⏱️ [EnhancedRAG] Search completed in ${searchTime}ms`);
    
    return {
        strategy,
        relevantChunks,
        metadata
    };
}

/**
 * 快速意图分析 - 仅返回策略，不执行搜索
 * 适用于需要预先了解用户意图的场景
 */
export async function analyzeIntent(
    userPrompt: string,
    options?: {
        useLLM?: boolean;
        generateText?: (options: { model: string; prompt: string }) => Promise<string>;
    }
): Promise<SearchStrategy> {
    return classifyUserIntent(userPrompt, {
        useLLM: options?.useLLM,
        generateText: options?.generateText
    });
}
