import { SupabaseClient } from '@supabase/supabase-js';
import { parse, ParserOptions } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
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

/**
 * 🆕 Shared Babel Parser Configuration
 * Comprehensive plugin list to handle all modern JavaScript/TypeScript syntax
 * Export this for use in other modules (patch.ts, etc.)
 */
export const BABEL_PARSER_CONFIG: ParserOptions = {
    sourceType: "module",
    plugins: [
        "jsx", 
        "typescript", 
        "classProperties",
        // 🔧 FIX: Only use decorators-legacy (not both decorators + decorators-legacy)
        // decorators-legacy is more compatible with React/RN projects
        "decorators-legacy",
        "dynamicImport",
        "exportDefaultFrom",
        "exportNamespaceFrom",
        "nullishCoalescingOperator",
        "optionalChaining",
        "objectRestSpread",
        "asyncGenerators",
        "classPrivateProperties",
        "classPrivateMethods",
        "doExpressions",
        "numericSeparator",
        "throwExpressions",
        "topLevelAwait",
        "importMeta",
        "logicalAssignment",
        "classStaticBlock",
        // Note: Some experimental plugins removed to avoid conflicts
        // "partialApplication", "pipelineOperator", "recordAndTuple" - may conflict
        "importAssertions"
    ] as any,
    errorRecovery: true,
    allowReturnOutsideFunction: true,
    allowSuperOutsideMethod: true,
    allowUndeclaredExports: true,
    allowAwaitOutsideFunction: true,
    allowImportExportEverywhere: true,
    allowNewTargetOutsideFunction: true,
    createParenthesizedExpressions: true
};

/**
 * Code chunk type definition
 */
export interface CodeChunk {
    id: string;
    content: string;
    type: string;
    startIndex?: number;
    endIndex?: number;
}

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
        
        // 个人主页 (New)
        '作品集': ['portfolio', 'gallery', 'showcase'],
        '简历': ['resume', 'cv', 'profile'],
        '个人站': ['personal', 'me', 'about'],
        '联系': ['contact', 'social', 'email'],

        // 服务预约 (New)
        '预约': ['appointment', 'booking', 'reserve'],
        '排期': ['schedule', 'calendar', 'time'],
        '咨询': ['consult', 'service', 'help'],
        '订单': ['order', 'ticket', 'status'],
        
        // 开发者工具
        '代码': ['code', 'editor', 'syntax'],
        '调试': ['debug', 'log', 'console'],
        '生成': ['generate', 'create', 'build'],
        '配置': ['config', 'setting', 'option'],
        
        // 数据可视化
        '图表': ['chart', 'graph', 'plot'],
        '分析': ['analyze', 'stat', 'report'],
        '展示': ['display', 'show', 'view'],
        
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

/**
 * AST Skeletonization Function
 * Parses code, removes function bodies, and returns the skeleton with stats.
 * @param code - The code chunk to skeletonize
 * @param chunkId - The chunk ID for logging
 * @returns Object with skeletonized code and statistics
 */
interface SkeletonResult {
    code: string;
    originalLines: number;
    resultLines: number;
    functionsHidden: number;
    functionsKept: number;
    wasModified: boolean; // 🆕 Flag to indicate if AST actually changed anything
}

function skeletonizeCode(code: string, chunkId?: string): SkeletonResult {
    const originalLines = code.split('\n').length;
    let functionsHidden = 0;
    let functionsKept = 0;

    // ⚡ Minimum line threshold: Don't skeletonize small files
    // For files < 25 lines, AST transformation + pretty print often INCREASES size
    const MIN_LINES_THRESHOLD = 25;
    if (originalLines < MIN_LINES_THRESHOLD) {
        console.log(`[AST] ⏭️ Skipping ${chunkId || 'unknown'}: ${originalLines} lines (below ${MIN_LINES_THRESHOLD} threshold)`);
        return {
            code,
            originalLines,
            resultLines: originalLines,
            functionsHidden: 0,
            functionsKept: 0,
            wasModified: false
        };
    }

    // 🆕 Removed hardcoded skip for CONTAINER_BASE_UNIT_FOR_LAUNCH
    // The enhanced parser with more plugins should handle it now
    // If it still fails, the catch block will use brutalTruncate as fallback

    // 🧹 Pre-process: Clean up common syntax issues that break Babel
    let cleanedInput = code;
    
    // Fix: Remove BOM if present
    if (cleanedInput.charCodeAt(0) === 0xFEFF) {
        cleanedInput = cleanedInput.slice(1);
    }
    
    // Fix: Normalize line endings
    cleanedInput = cleanedInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Fix: Remove zero-width characters that can break parsing
    cleanedInput = cleanedInput.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // 🆕 Fix: Handle edge cases that commonly break parsers
    // Remove hashbang/shebang if present
    cleanedInput = cleanedInput.replace(/^#!.*\n/, '');
    
    // Fix trailing commas in edge cases (defensive)
    cleanedInput = cleanedInput.replace(/,(\s*[}\]])/g, '$1');
    
    // 🆕 P1 FIX: Handle TypeScript `as const` assertions that sometimes trip up parser
    // Convert `} as const;` to `};` for parsing, then restore if needed
    const hasAsConst = /\}\s*as\s+const\s*;?/.test(cleanedInput);
    if (hasAsConst) {
        cleanedInput = cleanedInput.replace(/\}\s*as\s+const\s*;?/g, '};');
    }
    
    // 🆕 P1 FIX: Handle satisfies keyword (TypeScript 4.9+)
    cleanedInput = cleanedInput.replace(/\}\s*satisfies\s+\w+\s*;?/g, '};');
    
    // 🆕 P1 FIX: Remove type annotations from arrow functions that break parsing
    // e.g., `const fn: SomeType = () => {}` sometimes fails
    cleanedInput = cleanedInput.replace(/:\s*\([^)]+\)\s*=>\s*[^=]/g, (match) => {
        // Only remove if it looks like a type annotation causing issues
        return match;  // Keep as is for now, but could strip type annotation
    });
    
    // 🆕 P2 FIX: Handle styled-components template literals
    // styled.div`...` or styled(Component)`...`
    cleanedInput = cleanedInput.replace(/styled\s*\([^)]+\)\s*`[^`]*`/g, 'styled.div``');
    cleanedInput = cleanedInput.replace(/styled\.\w+`[^`]*`/g, 'styled.div``');
    
    // 🆕 P2 FIX: Handle CSS-in-JS with complex template literals
    cleanedInput = cleanedInput.replace(/css`[^`]*`/g, 'css``');

    try {
        // 1. Parse code to AST with comprehensive plugin support
        // 🆕 Enhanced: Try multiple parser configurations if first fails
        let ast;
        try {
            ast = parse(cleanedInput, BABEL_PARSER_CONFIG);
        } catch (firstError: any) {
            // 🆕 Fallback 1: Try with Flow plugin instead of TypeScript
            console.warn(`[AST] Primary parse failed: ${firstError.message}, trying Flow fallback...`);
            try {
                const flowConfig = {
                    ...BABEL_PARSER_CONFIG,
                    plugins: [...(BABEL_PARSER_CONFIG.plugins as any[]).filter(p => p !== 'typescript'), 'flow']
                };
                ast = parse(cleanedInput, flowConfig);
            } catch (flowError: any) {
                // 🆕 Fallback 2: Minimal config for plain JavaScript
                console.warn(`[AST] Flow parse failed: ${flowError.message}, trying minimal JS config...`);
                const minimalConfig = {
                    sourceType: "module" as const,
                    plugins: ["jsx"] as any,
                    errorRecovery: true,
                    allowReturnOutsideFunction: true,
                    allowAwaitOutsideFunction: true
                };
                ast = parse(cleanedInput, minimalConfig);
            }
        }

        // Helper: Estimate the "size" of a node by counting its source characters
        const estimateNodeSize = (node: any): number => {
            if (!node) return 0;
            if (node.start !== undefined && node.end !== undefined) {
                return node.end - node.start;
            }
            return 0;
        };

        // 2. Traverse and modify AST
        // 🚨 FIX: Process BOTH traditional functions AND arrow functions in variable declarations
        traverse(ast, {
            // Handle: function foo() {}, class methods, object methods
            "FunctionDeclaration|FunctionExpression|ObjectMethod|ClassMethod"(path: any) {
                const node = path.node;
                if (!node.body || node.body.type !== 'BlockStatement') {
                    functionsKept++;
                    return;
                }
                
                const bodySize = estimateNodeSize(node.body);
                const bodyStatements = node.body.body.length;
                
                // 🔧 NEW LOGIC: Hide if body is > 100 chars OR > 3 statements
                // This catches functions with few statements but lots of JSX
                if (bodySize < 100 && bodyStatements <= 3) {
                    functionsKept++;
                    return;
                }

                functionsHidden++;
                const hiddenInfo = bodyStatements > 0 ? `${bodyStatements} statements` : `${bodySize} chars`;
                
                // Replace body with empty block + comment
                path.get("body").replaceWith(
                    t.addComment(
                        t.blockStatement([]),
                        "inner",
                        ` ... ${hiddenInfo} hidden ... `
                    )
                );
            },
            
            // 🚨 CRITICAL FIX: Handle arrow functions (most React components use this!)
            // Pattern: const MyComponent = () => { ... } OR const MyComponent = () => <JSX />
            ArrowFunctionExpression(path: any) {
                const node = path.node;
                
                // Case 1: Arrow with block body: () => { return <JSX /> }
                if (node.body && node.body.type === 'BlockStatement') {
                    const bodySize = estimateNodeSize(node.body);
                    const bodyStatements = node.body.body.length;
                    
                    if (bodySize < 100 && bodyStatements <= 3) {
                        functionsKept++;
                        return;
                    }

                    functionsHidden++;
                    const hiddenInfo = bodyStatements > 0 ? `${bodyStatements} statements` : `${bodySize} chars`;
                    
                    path.get("body").replaceWith(
                        t.addComment(
                            t.blockStatement([]),
                            "inner",
                            ` ... ${hiddenInfo} hidden ... `
                        )
                    );
                }
                // Case 2: Arrow with expression body: () => <JSX /> (implicit return)
                else if (node.body) {
                    const bodySize = estimateNodeSize(node.body);
                    
                    // Only hide if the expression is large (> 100 chars, likely JSX)
                    if (bodySize < 100) {
                        functionsKept++;
                        return;
                    }
                    
                    functionsHidden++;
                    
                    // Convert to block body with hidden comment
                    // () => <JSX /> becomes () => { /* ... hidden ... */ }
                    path.get("body").replaceWith(
                        t.addComment(
                            t.blockStatement([]),
                            "inner",
                            ` ... ${bodySize} chars hidden (JSX expression) ... `
                        )
                    );
                }
            }
        });

        // 3. Generate new code
        // CRITICAL: Preserve function signatures! Don't over-compress.
        const output = generate(ast, {
            retainLines: false,  // Don't preserve original line positions
            compact: false,      // DON'T compact - we need readable signatures
            minified: false,     // Don't minify
            comments: true,      // Keep comments (including our hidden markers)
            concise: false,      // DON'T use concise - it removes formatting
            // Ensure function parameters stay on same line as function
            auxiliaryCommentBefore: undefined,
            auxiliaryCommentAfter: undefined
        }, cleanedInput);  // Use cleanedInput, not original code

        // Post-process: Remove excessive blank lines (more than 1 consecutive)
        const cleanedCode = output.code.replace(/\n{3,}/g, '\n\n');
        const resultLines = cleanedCode.split('\n').length;
        
        // 🚨 SAFETY CHECK: If "compressed" code is longer than original, discard it!
        if (resultLines >= originalLines || functionsHidden === 0) {
            // No improvement or no functions were hidden - don't add wrapper overhead
            if (functionsHidden === 0) {
                console.log(`[AST] ℹ️ No functions hidden for ${chunkId || 'unknown'}, keeping original`);
            } else {
                console.warn(`[AST] ⚠️ Negative compression detected for ${chunkId || 'unknown'} (${originalLines} -> ${resultLines}). Reverting to original.`);
            }
            return {
                code,
                originalLines,
                resultLines: originalLines,
                functionsHidden: 0,
                functionsKept: 0,
                wasModified: false
            };
        }

        return {
            code: cleanedCode,
            originalLines,
            resultLines,
            functionsHidden,
            functionsKept,
            wasModified: true
        };

    } catch (error: any) {
        // 🚨 AST parsing failed - return original code WITHOUT modification
        // CRITICAL: Set wasModified=false so caller knows NOT to add comment wrapper
        console.warn(`[AST] Skeletonization failed for ${chunkId || 'unknown'}: ${error?.message || error}`);
        return {
            code,
            originalLines,
            resultLines: originalLines,
            functionsHidden: 0,
            functionsKept: 0,
            wasModified: false
        };
    }
}

/**
 * 🆕 P0 FIX: Data Skeleton - Smart compression for pure data/config files
 * Instead of brutal truncation that loses values, we preserve ALL export keys
 * but truncate long VALUES (arrays, objects).
 * 
 * This ensures LLM can see:
 * - All exported constant NAMES (critical for references)
 * - Short values intact
 * - Long values truncated but structure preserved
 */
function dataSkeletonize(code: string, chunkId: string): { code: string; originalLines: number; resultLines: number; wasModified: boolean } {
    const lines = code.split('\n');
    const originalLines = lines.length;
    
    // Detect if this is a pure data file (only const/export statements, no functions)
    const hasFunctions = /function\s+\w+|=>\s*\{|\.map\(|\.filter\(|\.reduce\(/.test(code);
    const hasExports = /export\s+(const|let|var)/.test(code) || /^const\s+[A-Z]/.test(code);
    
    // Only apply to pure data files
    if (hasFunctions || !hasExports) {
        return { code, originalLines, resultLines: originalLines, wasModified: false };
    }
    
    console.log(`[DataSkeleton] 📊 Processing ${chunkId} as pure data file...`);
    
    // Strategy: Find all top-level const declarations and preserve key names
    // For each declaration:
    // - If value is short (< 100 chars), keep it
    // - If value is long array/object, show structure + "N items/keys truncated"
    
    const result: string[] = [];
    let i = 0;
    let totalExports = 0;
    let truncatedExports = 0;
    
    while (i < lines.length) {
        const line = lines[i];
        
        // Check for export/const declaration start
        const declMatch = line.match(/^(export\s+)?(const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
        
        if (declMatch) {
            const [, exportKeyword, declType, varName, valueStart] = declMatch;
            totalExports++;
            
            // Collect the full value (might span multiple lines)
            let fullValue = valueStart;
            let bracketDepth = 0;
            let valueEndLine = i;
            
            // Count brackets in valueStart
            for (const char of valueStart) {
                if (char === '[' || char === '{' || char === '(') bracketDepth++;
                if (char === ']' || char === '}' || char === ')') bracketDepth--;
            }
            
            // If brackets aren't balanced, keep reading
            while (bracketDepth > 0 && valueEndLine < lines.length - 1) {
                valueEndLine++;
                const nextLine = lines[valueEndLine];
                fullValue += '\n' + nextLine;
                for (const char of nextLine) {
                    if (char === '[' || char === '{' || char === '(') bracketDepth++;
                    if (char === ']' || char === '}' || char === ')') bracketDepth--;
                }
            }
            
            // Now decide: keep full value or truncate?
            const valueLines = fullValue.split('\n').length;
            const prefix = `${exportKeyword || ''}${declType} ${varName} = `;
            
            if (valueLines <= 5 && fullValue.length < 300) {
                // Short value - keep intact
                result.push(prefix + fullValue);
            } else {
                // Long value - truncate intelligently
                truncatedExports++;
                
                // Detect type and count items
                const isArray = valueStart.trim().startsWith('[');
                const isObject = valueStart.trim().startsWith('{');
                
                if (isArray) {
                    // Count array items (rough estimate)
                    const itemCount = (fullValue.match(/\{[^{}]*\}/g) || []).length || 
                                     (fullValue.match(/,/g) || []).length + 1;
                    result.push(`${prefix}[ /* ${itemCount} items - see source for values */ ];`);
                } else if (isObject) {
                    // Extract top-level keys
                    const keyMatches = fullValue.match(/^\s*['"]?(\w+)['"]?\s*:/gm) || [];
                    const keys = keyMatches.slice(0, 5).map(k => k.replace(/[:'"\s]/g, ''));
                    const keyPreview = keys.length > 0 ? keys.join(', ') + (keyMatches.length > 5 ? '...' : '') : '';
                    result.push(`${prefix}{ /* ${keyMatches.length} keys: ${keyPreview} */ };`);
                } else {
                    // Primitive or unknown - keep first line
                    result.push(`${prefix}${valueStart.slice(0, 80)}... /* truncated */;`);
                }
            }
            
            i = valueEndLine + 1;
            continue;
        }
        
        // Keep imports and other short lines
        if (line.trim().startsWith('import') || line.trim().startsWith('//') || line.trim() === '') {
            result.push(line);
        }
        i++;
    }
    
    const resultLines = result.length;
    const wasModified = truncatedExports > 0;
    
    if (wasModified) {
        console.log(`[DataSkeleton] ✅ ${chunkId}: preserved ${totalExports} exports, truncated ${truncatedExports} large values (${originalLines} → ${resultLines} lines)`);
    }
    
    return {
        code: result.join('\n'),
        originalLines,
        resultLines,
        wasModified
    };
}

/**
 * 🚨 BRUTAL TRUNCATION: Last resort when AST fails or is ineffective
 * Simply keeps the first N lines (imports + signatures) and truncates the rest
 * This guarantees compression even for unparseable code
 * 
 * 🆕 P0 FIX: Now checks for data files FIRST and uses dataSkeletonize instead
 */
function brutalTruncate(code: string, chunkId: string, maxLines: number = 15): { code: string; originalLines: number; resultLines: number; wasTruncated: boolean } {
    const lines = code.split('\n');
    const originalLines = lines.length;
    
    if (originalLines <= maxLines) {
        return { code, originalLines, resultLines: originalLines, wasTruncated: false };
    }
    
    // 🆕 P0 FIX: Check if this is a data/config file - use smart skeleton instead
    const isPureDataFile = /^(export\s+)?(const|let)\s+[A-Z][A-Z0-9_]*\s*=\s*[\[\{]/m.test(code) &&
                          !/function\s+\w+\s*\(|=>\s*\{/.test(code);
    
    if (isPureDataFile) {
        const skeleton = dataSkeletonize(code, chunkId);
        if (skeleton.wasModified) {
            return {
                code: skeleton.code,
                originalLines: skeleton.originalLines,
                resultLines: skeleton.resultLines,
                wasTruncated: true
            };
        }
    }
    
    // Fallback to brutal truncation for non-data files
    const keptLines = lines.slice(0, maxLines);
    const truncatedCode = keptLines.join('\n') + `\n// ... ${originalLines - maxLines} more lines truncated for ${chunkId} ...`;
    
    console.log(`[Truncate] ✂️ Brutally truncated ${chunkId}: ${originalLines} → ${maxLines + 1} lines`);
    
    return {
        code: truncatedCode,
        originalLines,
        resultLines: maxLines + 1,
        wasTruncated: true
    };
}

/**
 * Sample Data Definition - Compress large data arrays/objects
 * Shows structure + first few items to save tokens
 * @param content - The data definition code
 * @param chunkId - The chunk ID for logging
 * @returns Sampled code or original if too small
 */
function sampleDataDefinition(content: string, chunkId: string): string {
    const lines = content.split('\n');
    
    // If it's small enough, don't bother sampling
    if (lines.length <= 20) {
        return content;
    }
    
    // Try to detect array or object structure
    // Pattern: const NAME = [ ... ] or const NAME = { ... }
    const arrayMatch = content.match(/^(const\s+[A-Z0-9_]+\s*=\s*)\[/);
    const objectMatch = content.match(/^(const\s+[A-Z0-9_]+\s*=\s*)\{/);
    
    if (arrayMatch) {
        // It's an array - sample first 3 items
        // Find the first 3 complete items (objects or primitives)
        const prefix = arrayMatch[1];
        const arrayContent = content.slice(prefix.length);
        
        // Try to find item boundaries (look for },\n or ],\n patterns)
        let bracketDepth = 0;
        let itemCount = 0;
        let sampleEnd = 0;
        let inString = false;
        
        for (let i = 0; i < arrayContent.length && itemCount < 3; i++) {
            const char = arrayContent[i];
            const prevChar = i > 0 ? arrayContent[i-1] : '';
            
            // Track string state (simplified - doesn't handle all escape cases)
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (char === '[' || char === '{' || char === '(') {
                    bracketDepth++;
                } else if (char === ']' || char === '}' || char === ')') {
                    bracketDepth--;
                    // If we're back to depth 1 (inside the main array), we found an item
                    if (bracketDepth === 1 || (bracketDepth === 0 && char === '}')) {
                        // Look for comma after this
                        const nextChars = arrayContent.slice(i, i + 5);
                        if (nextChars.includes(',')) {
                            itemCount++;
                            sampleEnd = i + nextChars.indexOf(',') + 1;
                        }
                    }
                }
            }
        }
        
        if (itemCount >= 2 && sampleEnd > 0) {
            const sampledArray = arrayContent.slice(0, sampleEnd);
            const totalItems = (content.match(/\{[^{}]*\}/g) || []).length;
            
            return `${prefix}[
${sampledArray}
  // ... ${totalItems - itemCount} more items omitted (total: ${totalItems})
];`;
        }
    }
    
    if (objectMatch) {
        // It's an object - sample first 3 key-value pairs
        const prefix = objectMatch[1];
        
        // Find first 3 top-level keys
        let bracketDepth = 0;
        let keyCount = 0;
        let sampleEnd = 0;
        let inString = false;
        const objectContent = content.slice(prefix.length);
        
        for (let i = 0; i < objectContent.length && keyCount < 3; i++) {
            const char = objectContent[i];
            const prevChar = i > 0 ? objectContent[i-1] : '';
            
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (char === '{' || char === '[' || char === '(') {
                    bracketDepth++;
                } else if (char === '}' || char === ']' || char === ')') {
                    bracketDepth--;
                }
                
                // At depth 1, look for commas (end of key-value pair)
                if (bracketDepth === 1 && char === ',') {
                    keyCount++;
                    sampleEnd = i + 1;
                }
            }
        }
        
        if (keyCount >= 2 && sampleEnd > 0) {
            const sampledObject = objectContent.slice(0, sampleEnd);
            const totalKeys = (content.match(/^\s*[a-zA-Z_]\w*\s*:/gm) || []).length;
            
            return `${prefix}{
${sampledObject}
  // ... ${totalKeys - keyCount} more keys omitted (total: ${totalKeys})
};`;
        }
    }
    
    // Couldn't parse structure, return original
    return content;
}

// ========================================
// 🚫 DEPRECATED: Zero-Reparse Compression (Direct Chunk Processing)
// ========================================
// This function was an optimization attempt but caused "double personality" issue:
// - DirectCompress ran first (fast but dumb, couldn't do DataSkeleton)
// - Standard Compression ran second (smart, has DataSkeleton + small file protection)
// Result: Double processing with no benefit.
//
// DECISION: Keep Standard Compression only. It's smarter and has Fast-path batch discard.
// This code is kept for reference but NOT exported or used.
//
// Original insight (still valid for future optimization):
// "你只需要把这 11 个 chunks 组装起来。LLM 并不在乎 File A 和 File C 之间原本隔了多少个文件。"

interface DirectCompressionResult {
    /** Concatenated context for LLM */
    context: string;
    /** Stats for logging */
    stats: {
        totalChunks: number;
        fullCodeChunks: number;
        skeletonizedChunks: number;
        totalLines: number;
        compressedLines: number;
    };
}

/**
 * @deprecated Use compressCode() instead - it has DataSkeleton, small file protection, and Fast-path.
 * 
 * 🆕 直接压缩：跳过重新解析，直接使用 RAG 返回的 chunks
 * 
 * @param relevantChunks - RAG 返回的相关代码块（已包含 content）
 * @param explicitTargets - 需要全量代码的文件（files_to_edit）
 * @param referenceTargets - 需要骨架化的文件（files_to_read）
 * @param intent - 用户意图（用于调整压缩策略）
 */
function compressChunksDirect(
    relevantChunks: CodeChunk[],
    explicitTargets: string[] = [],
    referenceTargets: string[] = [],
    intent?: string
): DirectCompressionResult {
    const startTime = Date.now();
    console.log(`[DirectCompress] 🚀 Processing ${relevantChunks.length} chunks directly (no re-parse)`);
    console.log(`[DirectCompress] Targets: edit=${explicitTargets.length}, read=${referenceTargets.length}`);

    const contextParts: string[] = [];
    let fullCodeCount = 0;
    let skeletonizedCount = 0;
    let totalLines = 0;
    let compressedLines = 0;

    // 模糊匹配辅助函数
    const fuzzyMatch = (target: string, name: string): boolean => {
        const t = target.toLowerCase().trim();
        const n = name.toLowerCase().trim();
        if (t === n) return true;
        if (t.includes(n) || n.includes(t)) return true;
        return false;
    };

    // 检查是否是编辑目标
    const isEditTarget = (chunk: CodeChunk): boolean => {
        const componentName = chunk.id.replace('component-', '');
        return explicitTargets.some(t => fuzzyMatch(t, componentName) || fuzzyMatch(t, chunk.id));
    };

    // 检查是否是引用目标
    const isRefTarget = (chunk: CodeChunk): boolean => {
        const componentName = chunk.id.replace('component-', '');
        return referenceTargets.some(t => fuzzyMatch(t, componentName) || fuzzyMatch(t, chunk.id));
    };

    for (const chunk of relevantChunks) {
        const lines = chunk.content.split('\n').length;
        totalLines += lines;

        // 1. 编辑目标 → 全量代码
        if (isEditTarget(chunk)) {
            contextParts.push(`// ===== [EDIT TARGET] ${chunk.id} =====\n${chunk.content}`);
            compressedLines += lines;
            fullCodeCount++;
            console.log(`[DirectCompress] 📝 Full code: ${chunk.id} (${lines} lines)`);
            continue;
        }

        // 2. 引用目标或其他相关文件 → 尝试骨架化
        if (lines > 20) {
            const skeleton = skeletonizeCode(chunk.content, chunk.id);
            if (skeleton.wasModified && skeleton.resultLines < lines * 0.8) {
                contextParts.push(`// ===== [CONTEXT] ${chunk.id} (skeleton) =====\n${skeleton.code}`);
                compressedLines += skeleton.resultLines;
                skeletonizedCount++;
                const reduction = Math.round((1 - skeleton.resultLines / lines) * 100);
                console.log(`[DirectCompress] 📖 Skeleton: ${chunk.id}: ${lines} → ${skeleton.resultLines} lines (${reduction}%)`);
                continue;
            }
        }

        // 3. 小文件或骨架化失败 → 保留原样
        contextParts.push(`// ===== [CONTEXT] ${chunk.id} =====\n${chunk.content}`);
        compressedLines += lines;
        console.log(`[DirectCompress] 📄 Kept as-is: ${chunk.id} (${lines} lines)`);
    }

    const elapsedMs = Date.now() - startTime;
    const overallReduction = totalLines > 0 ? Math.round((1 - compressedLines / totalLines) * 100) : 0;
    console.log(`[DirectCompress] ✅ Done in ${elapsedMs}ms: ${fullCodeCount} full, ${skeletonizedCount} skeletonized, ${overallReduction}% reduction`);

    return {
        context: contextParts.join('\n\n'),
        stats: {
            totalChunks: relevantChunks.length,
            fullCodeChunks: fullCodeCount,
            skeletonizedChunks: skeletonizedCount,
            totalLines,
            compressedLines
        }
    };
}


// 3. Semantic Compression Logic - Aggressive Mode with Primary/Reference Target Distinction
// Goal: Reduce tokens as much as possible while preserving patch accuracy
export function compressCode(
    code: string, 
    relevantChunkIds: string[], 
    explicitTargets: string[] = [],
    intent?: string, // Optional: UserIntent from intent-classifier
    referenceTargets: string[] = [], // NEW: Targets that only need skeleton (interface only)
    preChunkedData?: CodeChunk[] // 🚀 NEW: Pass pre-chunked data to avoid re-parsing
): string {
    // 🚀 OPTIMIZATION: Use pre-chunked data if available (from RAG)
    // This avoids calling chunkCode() twice on the same HTML
    const chunks = preChunkedData || chunkCode(code);
    
    if (preChunkedData) {
        console.log(`[Compression] 🚀 Using pre-chunked data (${preChunkedData.length} chunks, skipped re-parse)`);
    }
    
    // Sort chunks by startIndex descending to replace from bottom up without messing indices
    // Only consider JS chunks for now as they are inside the script tag
    const jsChunks = chunks.filter(c => c.type === 'js' && c.startIndex !== undefined).sort((a, b) => b.startIndex! - a.startIndex!);
    
    // ========================================
    // 🚨 NEW: Function Name → Parent File Resolution
    // ========================================
    // Problem: DeepSeek may return function names (handleEncounter, resetGame) instead of file names (App)
    // Solution: Search each chunk to find which file contains these functions, then add parent to explicitTargets
    const resolvedTargets = [...explicitTargets];
    const functionToParentMap: Map<string, string> = new Map();
    
    // Build a map of function names -> parent chunk IDs
    for (const chunk of jsChunks) {
        const componentName = chunk.id.replace('component-', '');
        
        // Search for function definitions in this chunk
        // Patterns: function xxx, const xxx =, let xxx =, var xxx =, xxx: function, xxx()
        const functionPatterns = [
            /(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=|[<(])/g,
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:function|\(|async)/g,
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/g,
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g
        ];
        
        for (const pattern of functionPatterns) {
            let match;
            while ((match = pattern.exec(chunk.content)) !== null) {
                const funcName = match[1];
                if (funcName && funcName.length > 2) {
                    // Store the mapping (function name -> parent chunk ID)
                    if (!functionToParentMap.has(funcName.toLowerCase())) {
                        functionToParentMap.set(funcName.toLowerCase(), componentName);
                    }
                }
            }
        }
    }
    
    // Now check if any explicitTargets are function names that need resolution
    const targetsToCheck = [...explicitTargets];
    const parentFilesAdded: string[] = [];
    
    for (const target of targetsToCheck) {
        const targetLower = target.toLowerCase().trim();
        
        // Check if this target matches any chunk ID directly
        const directMatch = jsChunks.some(chunk => {
            const componentName = chunk.id.replace('component-', '').toLowerCase();
            return componentName === targetLower || componentName.includes(targetLower) || targetLower.includes(componentName);
        });
        
        if (!directMatch) {
            // This target doesn't match any file directly - it might be a function name
            // Look up the parent file from our map
            const parentFile = functionToParentMap.get(targetLower);
            if (parentFile && !resolvedTargets.some(t => t.toLowerCase() === parentFile.toLowerCase())) {
                console.log(`🔍 [TargetResolution] Function "${target}" found in "${parentFile}" - adding parent to targets`);
                resolvedTargets.push(parentFile);
                parentFilesAdded.push(parentFile);
            } else if (!parentFile) {
                // Try partial match on function map
                functionToParentMap.forEach((parent, funcName) => {
                    if (funcName.includes(targetLower) || targetLower.includes(funcName)) {
                        if (!resolvedTargets.some(t => t.toLowerCase() === parent.toLowerCase())) {
                            console.log(`🔍 [TargetResolution] Function "${target}" (partial: ${funcName}) found in "${parent}" - adding parent to targets`);
                            resolvedTargets.push(parent);
                            parentFilesAdded.push(parent);
                        }
                    }
                });
            }
        }
    }
    
    if (parentFilesAdded.length > 0) {
        console.log(`🔍 [TargetResolution] Added ${parentFilesAdded.length} parent files: ${parentFilesAdded.join(', ')}`);
    }
    
    // Use resolved targets instead of original
    const finalExplicitTargets = resolvedTargets;
    
    // Dynamic compression threshold based on intent
    const intentKey = (intent as CompressionIntent) || 'UNKNOWN';
    const compressionThreshold = COMPRESSION_THRESHOLDS[intentKey] || 15;
    
    // 🆕 Cleaner logging: show RAG selection vs total chunks
    console.log(`[Compression] 📊 RAG selected ${relevantChunkIds.length} chunks, Total in file: ${jsChunks.length}`);
    console.log(`[Compression] Intent: ${intent || 'UNKNOWN'}, Compression threshold: ${compressionThreshold} lines`);
    if (finalExplicitTargets.length > 0) {
        console.log(`[Compression] 📝 Primary targets (Full Code): ${finalExplicitTargets.join(', ')}`);
    }
    if (referenceTargets.length > 0) {
        console.log(`[Compression] 📖 Reference targets (Skeleton): ${referenceTargets.join(', ')}`);
    }

    // 🚨 FAIL-SAFE MODE:
    // If intent is modification but explicitTargets is empty (DeepSeek failed to parse),
    // we MUST NOT skeletonize everything. We fallback to treating relevantChunks as targets.
    let failSafeMode = false;
    const modificationIntents = [
        UserIntent.UI_MODIFICATION, 
        UserIntent.LOGIC_FIX, 
        UserIntent.NEW_FEATURE,
        UserIntent.PERFORMANCE,
        UserIntent.REFACTOR,
        UserIntent.DATA_OPERATION
    ];
    
    if (finalExplicitTargets.length === 0 && modificationIntents.includes(intent as UserIntent)) {
        console.warn("⚠️ [Compression] Fail-Safe Mode Activated: Modification intent with empty target list.");
        console.warn("⚠️ [Compression] Will preserve ALL relevant chunks to prevent accidental skeletonization.");
        failSafeMode = true;
    }
    
    let compressed = code;
    let compressedCount = 0;
    let skeletonizedReferenceCount = 0;

    // ========================================
    // 🚀 P0 OPTIMIZATION: Pre-filter irrelevant chunks
    // ========================================
    // Problem: Previously we iterated ALL 34 chunks, discarding 20+ as irrelevant.
    // Solution: Build a STRICT whitelist - only chunks explicitly in relevantChunkIds or targets.
    // This prevents "ghost files" like BagScreen from leaking through.
    
    const relevantSet = new Set(relevantChunkIds);
    const targetList = [...finalExplicitTargets, ...referenceTargets].map(t => t.toLowerCase());
    
    // Helper to check if a chunk should be processed at all
    // 🚨 STRICT MODE: Only allow chunks that are EXPLICITLY listed
    const shouldProcessChunk = (chunk: CodeChunk): boolean => {
        const componentName = chunk.id.replace('component-', '');
        const componentNameLower = componentName.toLowerCase();
        
        // 1. In RAG's relevant list - MUST be exact match
        if (relevantSet.has(chunk.id)) return true;
        
        // 2. Matches explicit/reference targets (strict match only)
        // Only match if target name is sufficiently similar (not just substring)
        for (const target of targetList) {
            // Exact match
            if (componentNameLower === target) return true;
            // Target is a significant part of component name (e.g., "App" in "App")
            // But NOT "Bag" in "BagScreen" unless "BagScreen" is the target
            if (componentNameLower === target || target === componentNameLower) return true;
        }
        
        // 3. Essential system components only (not user components)
        if (chunk.id === 'component-ReactDOM.render' || chunk.id === 'component-Imports/Setup') return true;
        
        // 4. style-block is always needed for CSS
        if (chunk.id === 'style-block') return true;
        
        // 🚫 REMOVED: Small data definitions exception
        // This was causing "ghost files" to leak through
        // Data definitions should be explicitly selected by RAG or DeepSeek
        
        return false;
    };
    
    // Pre-filter: separate chunks into "process" and "discard" piles
    const chunksToProcess: CodeChunk[] = [];
    const chunksToDiscard: CodeChunk[] = [];
    
    for (const chunk of jsChunks) {
        if (shouldProcessChunk(chunk)) {
            chunksToProcess.push(chunk);
        } else {
            chunksToDiscard.push(chunk);
        }
    }
    
    // Batch discard irrelevant chunks (single pass, sorted by startIndex desc)
    // This is much faster than processing them one by one
    if (chunksToDiscard.length > 0) {
        console.log(`[Compression] 🚀 Fast-path: Batch discarding ${chunksToDiscard.length} irrelevant chunks`);
        
        // Sort by startIndex descending for safe replacement
        chunksToDiscard.sort((a, b) => b.startIndex! - a.startIndex!);
        
        for (const chunk of chunksToDiscard) {
            const placeholder = `/* [OMITTED] ${chunk.id} */`;
            compressed = compressed.substring(0, chunk.startIndex!) + placeholder + compressed.substring(chunk.endIndex!);
        }
        compressedCount += chunksToDiscard.length;
    }
    
    console.log(`[Compression] ✅ Processing ${chunksToProcess.length} whitelisted chunks`);

    // Now only process the relevant chunks
    for (const chunk of chunksToProcess) {
        const lines = chunk.content.split('\n');
        
        // Only skip ReactDOM.render (essential for app to work)
        if (chunk.id.includes('ReactDOM')) {
            console.log(`[Compression] Skipping ${chunk.id} (ReactDOM render)`);
            continue;
        }
        
        // Check if this chunk is in the relevant list
        const isRelevant = relevantChunkIds.includes(chunk.id);
        
        // Check if this chunk is an explicit PRIMARY target (must have full code for editing)
        const componentName = chunk.id.replace('component-', '');
        
        // 🔍 增强模糊匹配：支持双向包含 + 忽略大小写
        const fuzzyMatch = (target: string, name: string): boolean => {
            const t = target.toLowerCase().trim();
            const n = name.toLowerCase().trim();
            // 完全匹配
            if (t === n) return true;
            // target 包含 name（如 "MapScreen组件" 包含 "mapscreen"）
            if (t.includes(n)) return true;
            // name 包含 target（如 "mapscreen" 包含 "map"，但我们只在 target 较长时使用）
            if (n.includes(t) && t.length >= 3) return true;
            return false;
        };
        
        // 🚨 Use finalExplicitTargets (resolved) instead of original explicitTargets
        const isExplicitTarget = finalExplicitTargets.some(t => 
            fuzzyMatch(t, componentName) || fuzzyMatch(t, chunk.id)
        );

        // NEW: Check if this chunk is a REFERENCE target (needs skeleton only, not full code)
        const isReferenceTarget = referenceTargets.some(t => 
            fuzzyMatch(t, componentName) || fuzzyMatch(t, chunk.id)
        );

        // ========================================
        // 🚨 REVISED: "Aggressive Skeletonization" Strategy
        // ========================================
        // User Request: "For non-primary target files, force AST parsing, keep only export function signatures and type definitions, delete function body content."
        
        // 1. Primary Targets: Keep FULL Code
        if (isExplicitTarget || (failSafeMode && isRelevant)) {
            const reason = isExplicitTarget ? "Primary Target - will be edited" : "Fail-Safe - kept for reference";
            console.log(`[Compression] 📝 Full code: ${chunk.id} (${reason})`);
            continue;
        }

        // 2. Context Files (Relevant but not Primary): SKELETONIZE
        // This includes both explicit referenceTargets AND any other relevant chunks found by RAG
        if (isRelevant || isReferenceTarget) {
            // Only skeletonize if it's large enough to matter
            if (lines.length > 10) {
                const skeleton = skeletonizeCode(chunk.content, chunk.id);
                
                // 🚨 AST succeeded and modified code
                if (skeleton.wasModified) {
                    const reductionPercent = Math.round((1 - skeleton.resultLines / skeleton.originalLines) * 100);
                    console.log(`[AST] 📖 Context skeleton: ${chunk.id}: ${skeleton.originalLines} → ${skeleton.resultLines} lines (${reductionPercent}% reduction)`);
                    
                    // Only add wrapper if there was actual compression (> 10%)
                    let replacement: string;
                    if (reductionPercent >= 10) {
                        replacement = `/** @context-skeleton ${chunk.id} [INTERFACE ONLY] */\n${skeleton.code}`;
                    } else {
                        replacement = skeleton.code;
                    }

                    compressed = compressed.substring(0, chunk.startIndex!) + replacement + compressed.substring(chunk.endIndex!);
                    skeletonizedReferenceCount++;
                    continue;
                }
                
                // 🚨 AST failed or didn't help - decide whether to truncate or keep
                // 🆕 P1 FIX: For small files (< 50 lines), DON'T truncate - too risky
                // Truncating a 22-line file to 16 lines might break syntax (e.g., unclosed braces)
                // The 6-line savings is not worth the syntax error risk
                if (lines.length >= 50) {
                    const truncated = brutalTruncate(chunk.content, chunk.id, 15);
                    if (truncated.wasTruncated) {
                        const reductionPercent = Math.round((1 - truncated.resultLines / truncated.originalLines) * 100);
                        console.log(`[Truncate] 📖 Context truncated: ${chunk.id}: ${truncated.originalLines} → ${truncated.resultLines} lines (${reductionPercent}% reduction)`);
                        
                        const replacement = `/** @truncated ${chunk.id} [IMPORTS + SIGNATURE ONLY] */\n${truncated.code}`;
                        compressed = compressed.substring(0, chunk.startIndex!) + replacement + compressed.substring(chunk.endIndex!);
                        skeletonizedReferenceCount++;
                        continue;
                    }
                }
                
                // Small files (< 50 lines) or failed truncation: keep as-is
                console.log(`[Compression] Keeping ${chunk.id} (small context file, ${lines.length} lines - safe to keep)`);
                continue;
            } else {
                console.log(`[Compression] Keeping ${chunk.id} (context but small: ${lines.length} lines)`);
                continue;
            }
        }
        
        // ========================================
        // 🛡️ SAFETY NET: Handle any chunks that slipped through pre-filtering
        // ========================================
        // With STRICT pre-filtering, this should NEVER execute.
        // If it does, it means there's a bug in the filtering logic.
        
        // Small data definitions - check if they're in relevant list
        const isDataDefinition = /const\s+[A-Z0-9_]+\s*=\s*[\[\{]/.test(chunk.content);
        if (isDataDefinition && lines.length <= 10 && relevantSet.has(chunk.id)) {
            console.log(`[Compression] Keeping ${chunk.id} (small data definition, ${lines.length} lines)`);
            continue;
        }
        
        // 🚨 STRICT: If a chunk reaches here, it should NOT have passed pre-filtering
        // Discard it to maintain consistency with RAG's selection
        const placeholder = `/* [OMITTED] ${chunk.id} - not in RAG selection */`;
        console.log(`[Compression] 🧹 Discarding unfiltered chunk: ${chunk.id} (${lines.length} lines)`);
        compressed = compressed.substring(0, chunk.startIndex!) + placeholder + compressed.substring(chunk.endIndex!);
        compressedCount++;
    }
    
    if (compressedCount > 0 || skeletonizedReferenceCount > 0) {
        console.log(`[Compression] Summary: ${compressedCount} discarded (batch), ${skeletonizedReferenceCount} skeletonized`);
    }
    
    return compressed;
}


// 2. Embedding & Retrieval Logic
/**
 * 🆕 增强参数：支持传入用户显式指定的文件列表
 * 当用户明确点名大量文件时，动态提高 chunk 限制
 */
export interface RAGOptions {
    explicitTargets?: string[];  // Intent Classifier 识别的 files_to_edit
    referenceTargets?: string[]; // Intent Classifier 识别的 files_to_read
    isGlobalReview?: boolean;    // 是否是全局审查模式
    intent?: string;             // User intent for filtering (LOGIC_FIX, UI_MODIFICATION, etc.)
    trustMode?: boolean;         // 🆕 信任模式：DeepSeek 指定的文件直接使用，不做向量搜索
    forceDeepSeek?: boolean;     // 🆕 是否启用 DeepSeek Only 模式
    preChunkedData?: CodeChunk[]; // 🚀 NEW: Pre-chunked data to avoid re-parsing (shared with route.ts)
    modelName?: string;          // 🆕 P3 FIX: 模型名称，用于动态调整 chunk 上限
}

/**
 * 🆕 信任模式压缩策略
 * - files_to_edit: 全量代码（不压缩）
 * - files_to_read: 智能压缩（保留签名）
 * - 其他文件: 丢弃
 */
export interface TrustModeCompressionResult {
    editFiles: Array<{ id: string; content: string; compressed: boolean }>;
    readFiles: Array<{ id: string; content: string; compressed: boolean; originalSize: number; compressedSize: number }>;
    discardedCount: number;
    totalSize: number;
}

/**
 * 🆕 精准模式：基于 DeepSeek 的文件列表直接加载，跳过向量搜索
 * 
 * 流程：
 * 1. 根据 files_to_edit 和 files_to_read 过滤 chunks
 * 2. files_to_edit → 全量代码
 * 3. files_to_read → 智能压缩
 * 4. 其他文件 → 丢弃
 */
export function applyTrustModeCompression(
    chunks: CodeChunk[],
    filesToEdit: string[],
    filesToRead: string[]
): TrustModeCompressionResult {
    console.log(`[CodeRAG] 🎯 Trust Mode: ${filesToEdit.length} edit files, ${filesToRead.length} read files`);
    
    const editFiles: TrustModeCompressionResult['editFiles'] = [];
    const readFiles: TrustModeCompressionResult['readFiles'] = [];
    let discardedCount = 0;
    let totalSize = 0;
    
    // 构建匹配函数（模糊匹配文件名）
    const matchesTarget = (chunkId: string, targets: string[]): boolean => {
        const chunkIdLower = chunkId.toLowerCase();
        return targets.some(target => {
            const targetLower = target.toLowerCase();
            // 完全匹配或部分匹配
            return chunkIdLower.includes(targetLower) || 
                   targetLower.includes(chunkIdLower) ||
                   chunkIdLower.replace(/[^a-z0-9]/g, '').includes(targetLower.replace(/[^a-z0-9]/g, ''));
        });
    };
    
    for (const chunk of chunks) {
        const isEditTarget = matchesTarget(chunk.id, filesToEdit);
        const isReadTarget = matchesTarget(chunk.id, filesToRead);
        
        if (isEditTarget) {
            // files_to_edit → 全量代码（不压缩）
            editFiles.push({
                id: chunk.id,
                content: chunk.content,
                compressed: false
            });
            totalSize += chunk.content.length;
            console.log(`[CodeRAG] ✏️ EDIT: ${chunk.id} (${chunk.content.length} chars, FULL)`);
        } else if (isReadTarget) {
            // files_to_read → 智能压缩
            const originalSize = chunk.content.length;
            // 对于 read 文件，使用 skeletonizeCode 进行压缩
            const skeleton = skeletonizeCode(chunk.content, chunk.id);
            const compressed = skeleton.wasModified ? skeleton.code : chunk.content;
            const compressedSize = compressed.length;
            
            readFiles.push({
                id: chunk.id,
                content: compressed,
                compressed: skeleton.wasModified,
                originalSize,
                compressedSize
            });
            totalSize += compressedSize;
            
            const ratio = originalSize > 0 ? ((1 - compressedSize / originalSize) * 100).toFixed(1) : '0';
            console.log(`[CodeRAG] 📖 READ: ${chunk.id} (${originalSize} → ${compressedSize} chars, -${ratio}%)`);
        } else {
            // 其他文件 → 丢弃
            discardedCount++;
        }
    }
    
    console.log(`[CodeRAG] 🗑️ Discarded ${discardedCount} irrelevant chunks`);
    console.log(`[CodeRAG] 📊 Total context size: ${totalSize} chars`);
    
    return { editFiles, readFiles, discardedCount, totalSize };
}

export async function findRelevantCodeChunks(
    userPrompt: string, 
    code: string, 
    supabaseUrl: string, 
    supabaseKey: string,
    options?: RAGOptions
) {
    const { explicitTargets = [], referenceTargets = [], isGlobalReview = false, intent, preChunkedData, modelName } = options || {};
    
    // 🆕 动态计算 chunk 限制
    const userExplicitFileCount = explicitTargets.length + referenceTargets.length;
    
    // 🚨 恐慌模式检测：如果 Intent Classifier 超时/失败，targets 可能为空
    // 此时我们需要更宽松的限制，避免漏掉关键文件
    const isPanicMode = userExplicitFileCount === 0 && !isGlobalReview;
    
    // 🆕 Prompt 复杂度检测：长 Prompt 或包含多个代码关键词时，提高限制
    const promptComplexity = userPrompt.length > 500 ? 'high' : 
                             userPrompt.length > 200 ? 'medium' : 'low';
    const codeKeywordsCount = (userPrompt.match(/\b(function|component|class|hook|screen|modal|page|error|undefined|bug|fix)\b/gi) || []).length;
    const hasMultipleKeywords = codeKeywordsCount >= 3;
    
    // 🆕 P3 FIX: 根据模型能力动态调整 chunk 基数
    // DeepSeek V3 (8K output): 基数较低，防止超出 token 限制
    // Gemini 2.5 Flash (64K): 可以处理更多上下文
    // Gemini 2.5 Pro (64K): 最强，可以处理最多上下文
    const MODEL_CHUNK_MULTIPLIER: Record<string, number> = {
        'deepseek-v3': 0.8,       // DeepSeek 输出限制，减少上下文
        'gemini-2.5-flash': 1.2,  // Flash 模型可以处理更多
        'gemini-2.5-pro': 1.5,    // Pro 模型上下文窗口最大
        'gemini-3-pro-preview': 1.5
    };
    const chunkMultiplier = MODEL_CHUNK_MULTIPLIER[modelName || ''] || 1.0;
    
    let dynamicMaxChunks: number;
    
    if (isGlobalReview) {
        // 全局审查模式：最宽松
        dynamicMaxChunks = Math.min(25, userExplicitFileCount + 10);
    } else if (userExplicitFileCount > 10) {
        // 用户指定 10+ 文件
        dynamicMaxChunks = Math.min(20, userExplicitFileCount + 5);
    } else if (isPanicMode && (promptComplexity !== 'low' || hasMultipleKeywords)) {
        // 🚨 恐慌模式：Intent Classifier 失败但 Prompt 复杂
        dynamicMaxChunks = 15;
        console.warn(`[CodeRAG] 🚨 PANIC MODE: No explicit targets but complex prompt (${promptComplexity}, ${codeKeywordsCount} keywords). Raising limit to ${dynamicMaxChunks}`);
    } else if (userExplicitFileCount > 0) {
        // 有明确目标
        dynamicMaxChunks = Math.max(10, userExplicitFileCount + 3);
    } else {
        // 默认限制
        dynamicMaxChunks = 10;
    }
    
    // 🆕 P3 FIX: 应用模型乘数调整
    dynamicMaxChunks = Math.round(dynamicMaxChunks * chunkMultiplier);
    if (modelName) {
        console.log(`[CodeRAG] 📊 Model-aware chunk limit: ${dynamicMaxChunks} (model: ${modelName}, multiplier: ${chunkMultiplier})`);
    }
    
    if (userExplicitFileCount > 0) {
        console.log(`[CodeRAG] User explicitly named ${userExplicitFileCount} files, dynamic max chunks: ${dynamicMaxChunks}`);
    }
    
    // 🆕 预处理 Prompt：如果包含完整代码上下文，必须截断，否则 Embedding 会被淹没
    let processedPrompt = userPrompt;
    const userRequestMarker = '# USER REQUEST';
    const markerIndex = userPrompt.lastIndexOf(userRequestMarker);
    
    if (markerIndex !== -1) {
        // 提取 # USER REQUEST 之后的内容
        const extracted = userPrompt.substring(markerIndex + userRequestMarker.length).trim();
        if (extracted.length > 0) {
            processedPrompt = extracted;
            console.log('[CodeRAG] Extracted user request from full context prompt for embedding');
        }
    } else {
        // 兜底：如果太长且没有标记，只取最后 2000 字符
        const MAX_PROMPT_LENGTH = 2000;
        if (userPrompt.length > MAX_PROMPT_LENGTH) {
            processedPrompt = userPrompt.slice(-MAX_PROMPT_LENGTH);
            console.log('[CodeRAG] Truncated long prompt to last 2000 chars for embedding');
        }
    }

    try {
        // A. Chunk the code (or use pre-chunked data)
        // 🚀 OPTIMIZATION: Use pre-chunked data if available (shared with route.ts)
        const chunks = preChunkedData || chunkCode(code);
        if (chunks.length === 0) return null;
        
        if (preChunkedData) {
            console.log(`[CodeRAG] 🚀 Using pre-chunked data (${chunks.length} chunks, skipped re-parse)`);
        }

        // B. Prepare inputs for embedding (Prompt + All Chunks)
        // We need to embed the prompt AND the chunks to compare them.
        // In a real vector DB, chunks are pre-embedded. Here we do it on-the-fly.
        // Optimization: If code hasn't changed, we could cache these embeddings? 
        // For now, we assume we re-calculate.
        
        const inputs = [processedPrompt, ...chunks.map(c => `[${c.type}] ${c.content.substring(0, 1000)}`)]; // Truncate for embedding to save tokens/limits

        // C. Call Edge Function (Batch) with Retry
        let response;
        let retries = 3;
        while (retries > 0) {
            try {
                response = await fetch(`${supabaseUrl}/functions/v1/embed`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify({ inputs })
                });
                if (response.ok) break;
                console.warn(`[CodeRAG] Embed fetch failed with status ${response.status}, retrying... (${retries} left)`);
            } catch (e: any) {
                console.warn(`[CodeRAG] Embed fetch error: ${e.message}, retrying... (${retries} left)`);
            }
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 1000));
        }

        if (!response || !response.ok) throw new Error('Failed to get embeddings after retries');
        
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
        
        // 🧹 INTENT-BASED FILTERING: Remove irrelevant file types based on intent
        // For LOGIC_FIX/DATA_OPERATION: Filter out style/CSS files - they're NEVER relevant for bug fixes
        if (intent === 'LOGIC_FIX' || intent === 'DATA_OPERATION') {
            // 🚨 AGGRESSIVE PATTERN: Match any style-related chunk
            const stylePatterns = /style|css|scss|less|tailwind|styled|\.css|theme|color/i;
            const beforeCount = scoredChunks.length;
            
            // Filter in place
            const filteredChunks = scoredChunks.filter(c => {
                const isStyle = stylePatterns.test(c.id) || c.id === 'style-block';
                if (isStyle) {
                    console.log(`[CodeRAG] 🚫 Banned ${c.id} (style file in ${intent} mode)`);
                }
                return !isStyle;
            });
            
            if (filteredChunks.length > 0 && filteredChunks.length < beforeCount) {
                const removed = beforeCount - filteredChunks.length;
                console.log(`[CodeRAG] 🧹 Filtered ${removed} style chunks for ${intent} intent`);
                scoredChunks.length = 0;
                scoredChunks.push(...filteredChunks);
            }
        }

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
        // 🆕 P2 FIX: Use processedPrompt (extracted user request) instead of full userPrompt
        // This prevents matching component names that appear in the code context, not the user's actual request
        const promptLower = processedPrompt.toLowerCase();
        const chineseKeywords = extractChineseKeywords(promptLower);
        
        // 🆕 ERROR-DRIVEN RETRIEVAL: If prompt contains error messages, prioritize related files
        const errorMatch = promptLower.match(/(?:can't find variable|is not defined|undefined is not an object|cannot read property)\s+['"]?(\w+)['"]?/i);
        if (errorMatch) {
            const missingVar = errorMatch[1];
            console.log(`[CodeRAG] 🚨 Detected runtime error for variable: ${missingVar}`);
            
            // Find files that define this variable
            const definingChunks = scoredChunks.filter(c => 
                c.content.includes(`const ${missingVar}`) || 
                c.content.includes(`let ${missingVar}`) || 
                c.content.includes(`function ${missingVar}`) ||
                c.content.includes(`class ${missingVar}`) ||
                c.content.includes(`interface ${missingVar}`)
            );
            
            for (const chunk of definingChunks) {
                if (!relevantChunks.find(c => c.id === chunk.id)) {
                    console.log(`[CodeRAG] 🚑 Adding ${chunk.id} (defines missing variable ${missingVar})`);
                    relevantChunks.push(chunk);
                }
            }
        }

        let promptMatchCount = 0;
        const MAX_PROMPT_MATCHES = 3; // Reduced from 5 to 3 - rely more on DeepSeek targets
        
        // 🆕 P0 OPTIMIZATION: Disable aggressive "mentioned in prompt" matching
        // Trust DeepSeek's files_to_edit and files_to_read instead of string matching
        // This prevents "screen" matching "LaunchScreen", "DexScreen", etc.
        const TRUST_DEEPSEEK_ONLY = explicitTargets.length > 0 || referenceTargets.length > 0;
        
        if (TRUST_DEEPSEEK_ONLY) {
            console.log(`[CodeRAG] 🛡️ Using STRICT mode: trusting DeepSeek targets only (${explicitTargets.length} edit, ${referenceTargets.length} read)`);
        }
        
        for (const chunk of scoredChunks) {
            if (promptMatchCount >= MAX_PROMPT_MATCHES) break;
            
            const componentName = chunk.id.replace('component-', '');
            const componentNameLower = componentName.toLowerCase();
            
            // Only match if component name is significant (PascalCase 3+, CAPS 2+, or 4+ chars)
            // This allows Map, Tab, Nav, API while still preventing noise
            if (!isSignificant(componentName)) continue;
            
            // 🔍 P0 FIX: ULTRA-STRICT MATCHING LOGIC
            // If DeepSeek provided targets, ONLY match if component is explicitly mentioned as a whole word
            let shouldInclude = false;

            // Helper: Check if EXACT component name exists in prompt as a whole word
            const isExactMatchInPrompt = (name: string) => {
                if (!name || name.length < 2) return false;
                const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Must be surrounded by word boundaries (not partial match)
                return new RegExp(`\\b${escaped}\\b`, 'i').test(promptLower);
            };

            // 1. Direct EXACT match only (e.g. "MapScreen" must appear as "MapScreen")
            // NOT "screen" matching "MapScreen" or "DexScreen"
            if (isExactMatchInPrompt(componentName)) {
                shouldInclude = true;
            }
            
            // 2. 🆕 If DeepSeek is trusted, skip fuzzy Chinese keyword matching entirely
            // This is the key change - we don't want "地图" to match every *Screen component
            if (TRUST_DEEPSEEK_ONLY) {
                // Skip fuzzy matching - DeepSeek already told us what to edit
                // Only include if it's an exact match found above
            } else {
                // Fallback: When DeepSeek didn't provide targets, use careful keyword matching
                if (!shouldInclude && chineseKeywords.length > 0) {
                    // Split PascalCase/camelCase into parts
                    // e.g. "MapScreen" -> ["map", "screen"]
                    const parts = componentName
                        .split(/(?=[A-Z])|[-_]/)
                        .map(p => p.toLowerCase())
                        .filter(p => p.length > 0);
                    
                    // 🆕 Only match if the FIRST part matches (the semantic core)
                    // e.g. "地图" should match "Map" in "MapScreen", not "Screen"
                    const corePart = parts[0];
                    if (corePart && corePart.length >= 3) {
                        shouldInclude = chineseKeywords.some(kw => {
                            // Only exact match on core part
                            if (corePart === kw) return true;
                            // Very strict prefix: keyword must be 80%+ of core
                            if (corePart.startsWith(kw) && kw.length >= corePart.length * 0.8) return true;
                            return false;
                        });
                    }
                }
            }
            
            // Boost score for data definitions (MAP_GRID, etc.) if they are somewhat relevant
            // Data definitions are critical for game/app logic, use lower threshold (0.50)
            // 🆕 But only if DeepSeek didn't provide targets (avoid noise)
            const isDataDefinition = /const\s+[A-Z0-9_]+\s*=\s*[\[\{]/.test(chunk.content);
            if (!TRUST_DEEPSEEK_ONLY && isDataDefinition && chunk.score > 0.55) {
                 if (!relevantChunks.find(c => c.id === chunk.id)) {
                    console.log(`[CodeRAG] Boosting data definition ${chunk.id} (score=${chunk.score.toFixed(3)})`);
                    relevantChunks.push(chunk);
                    continue;
                 }
            }

            if (shouldInclude && !relevantChunks.find(c => c.id === chunk.id)) {
                console.log(`[CodeRAG] Force including ${chunk.id} (exact match in prompt)`);
                relevantChunks.push(chunk);
                promptMatchCount++;
            }
        }
        
        // Step 4: Dependency Graph Expansion with DEPTH LIMIT
        // Only include DIRECT dependencies (Depth=1) to prevent "recursion bomb"
        const dependencySet = new Set<string>(relevantChunks.map(c => c.id));
        const MAX_DEPENDENCY_SIZE = isGlobalReview ? 50000 : 20000; // 全局审查模式允许更大
        const MAX_TOTAL_CHUNKS = dynamicMaxChunks; // 🆕 使用动态计算的限制
        let totalDependencySize = 0;
        
        // 🆕 Step 4.1: 强制包含用户显式指定的文件
        if (explicitTargets.length > 0) {
            for (const target of explicitTargets) {
                const targetLower = target.toLowerCase();
                const matchingChunk = scoredChunks.find(c => 
                    c.id.toLowerCase().includes(targetLower) || 
                    c.id.toLowerCase().replace('component-', '').includes(targetLower)
                );
                if (matchingChunk && !dependencySet.has(matchingChunk.id)) {
                    console.log(`[CodeRAG] Force including ${matchingChunk.id} (explicit target from intent)`);
                    dependencySet.add(matchingChunk.id);
                    relevantChunks.push(matchingChunk);
                }
            }
        }
        
        // ✅ SAFETY: Create snapshot of initial chunks to iterate
        // This physically prevents infinite loops even if relevantChunks gets modified
        // 🆕 OPTIMIZATION: Sort queue to prioritize Explicit Targets -> High Score -> Mentioned
        // This ensures dependencies of critical files are processed before we hit the chunk limit
        const initialQueue = [...relevantChunks].sort((a, b) => {
            // Check if A or B are explicit targets
            const aIsExplicit = explicitTargets.some(t => a.id.toLowerCase().includes(t.toLowerCase()));
            const bIsExplicit = explicitTargets.some(t => b.id.toLowerCase().includes(t.toLowerCase()));
            
            if (aIsExplicit && !bIsExplicit) return -1; // A comes first
            if (!aIsExplicit && bIsExplicit) return 1;  // B comes first
            
            // If both or neither are explicit, keep original order
            return 0;
        });
        
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

// ============================================
// 🆕 DeepSeek Only RAG - 两阶段精准模式
// ============================================

export interface DeepSeekRAGOptions {
    supabaseUrl: string;
    supabaseKey: string;
    fileTree?: string;           // 文件树字符串（推荐）
    fileSummaries?: string[];    // 文件摘要列表（备用）
    authToken?: string;          // 用户 auth token
    timeoutMs?: number;          // DeepSeek 超时时间
}

export interface DeepSeekRAGResult {
    // 意图分类结果
    intent: string;
    confidence: number;
    source: 'local' | 'deepseek' | 'gemini_fallback' | 'timeout_fallback';
    reasoning?: string;
    
    // 文件列表
    filesToEdit: string[];
    filesToRead: string[];
    
    // 压缩后的上下文
    context: {
        editFiles: Array<{ id: string; content: string }>;
        readFiles: Array<{ id: string; content: string; compressionRatio: number }>;
    };
    
    // 元数据
    metadata: {
        totalChunks: number;
        selectedChunks: number;
        discardedChunks: number;
        totalContextSize: number;
        latencyMs: number;
        phases: {
            intentClassification: number;
            fileLoading: number;
            compression: number;
        };
    };
}

/**
 * 🚀 DeepSeek Only RAG - 精准制导模式
 * 
 * 两阶段策略：
 * 1. 第一阶段：仅发送文件树 + 用户 Prompt 给 DeepSeek，获取 files_to_edit/read
 * 2. 第二阶段：根据 DeepSeek 的指示精准加载文件
 *    - files_to_edit → 全量代码
 *    - files_to_read → 智能压缩
 *    - 其他文件 → 丢弃
 * 
 * @param userPrompt 用户请求
 * @param code 完整代码（将被 chunk 化）
 * @param options 配置选项
 */
export async function findRelevantCodeWithDeepSeek(
    userPrompt: string,
    code: string,
    options: DeepSeekRAGOptions
): Promise<DeepSeekRAGResult> {
    const startTime = Date.now();
    const phases = { intentClassification: 0, fileLoading: 0, compression: 0 };
    
    console.log(`\n🤖 [DeepSeek RAG] Starting precision mode...`);
    console.log(`📝 [DeepSeek RAG] User prompt: "${userPrompt.substring(0, 100)}${userPrompt.length > 100 ? '...' : ''}"`);
    
    // ========== Phase 1: DeepSeek 意图分类 ==========
    const phase1Start = Date.now();
    
    const intentResult = await classifyUserIntent(userPrompt, {
        forceDeepSeek: true,  // 🆕 强制使用 DeepSeek
        useDeepSeek: true,
        fileTree: options.fileTree,
        fileSummaries: options.fileSummaries,
        deepSeekConfig: {
            supabaseUrl: options.supabaseUrl,
            supabaseAnonKey: options.supabaseKey,
            authToken: options.authToken,
            timeoutMs: options.timeoutMs || 45000,
            fileTree: options.fileTree,
            fileSummaries: options.fileSummaries
        }
    });
    
    phases.intentClassification = Date.now() - phase1Start;
    
    const filesToEdit = intentResult.targets || [];
    const filesToRead = intentResult.referenceTargets || [];
    
    console.log(`\n🎯 [DeepSeek RAG] Phase 1 complete (${phases.intentClassification}ms)`);
    console.log(`   Intent: ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(1)}%)`);
    console.log(`   Source: ${intentResult.source}`);
    console.log(`   files_to_edit: [${filesToEdit.join(', ')}]`);
    console.log(`   files_to_read: [${filesToRead.join(', ')}]`);
    
    // ========== Phase 2: 精准加载文件 ==========
    const phase2Start = Date.now();
    
    // Chunk 代码
    const chunks = chunkCode(code);
    console.log(`\n📦 [DeepSeek RAG] Phase 2: Loading ${chunks.length} chunks...`);
    
    phases.fileLoading = Date.now() - phase2Start;
    
    // ========== Phase 3: 信任模式压缩 ==========
    const phase3Start = Date.now();
    
    // 如果 DeepSeek 没有返回任何目标，使用 fallback
    if (filesToEdit.length === 0 && filesToRead.length === 0) {
        console.warn(`⚠️ [DeepSeek RAG] No targets from DeepSeek, falling back to top chunks`);
        
        // Fallback: 使用向量搜索的 top 结果
        const fallbackChunks = await findRelevantCodeChunks(
            userPrompt,
            code,
            options.supabaseUrl,
            options.supabaseKey,
            { intent: intentResult.intent }
        );
        
        phases.compression = Date.now() - phase3Start;
        const totalLatency = Date.now() - startTime;
        
        return {
            intent: intentResult.intent,
            confidence: intentResult.confidence,
            source: intentResult.source,
            reasoning: intentResult.reasoning,
            filesToEdit: [],
            filesToRead: [],
            context: {
                editFiles: [],
                readFiles: fallbackChunks?.map(c => ({
                    id: c.id,
                    content: c.content,
                    compressionRatio: 0
                })) || []
            },
            metadata: {
                totalChunks: chunks.length,
                selectedChunks: fallbackChunks?.length || 0,
                discardedChunks: chunks.length - (fallbackChunks?.length || 0),
                totalContextSize: fallbackChunks?.reduce((sum, c) => sum + c.content.length, 0) || 0,
                latencyMs: totalLatency,
                phases
            }
        };
    }
    
    // 应用信任模式压缩
    const compressionResult = applyTrustModeCompression(chunks, filesToEdit, filesToRead);
    
    phases.compression = Date.now() - phase3Start;
    const totalLatency = Date.now() - startTime;
    
    console.log(`\n✅ [DeepSeek RAG] Complete!`);
    console.log(`   Total time: ${totalLatency}ms (Intent: ${phases.intentClassification}ms, Load: ${phases.fileLoading}ms, Compress: ${phases.compression}ms)`);
    console.log(`   Context size: ${compressionResult.totalSize} chars`);
    console.log(`   Selected: ${compressionResult.editFiles.length + compressionResult.readFiles.length} files`);
    console.log(`   Discarded: ${compressionResult.discardedCount} files`);
    
    return {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        source: intentResult.source,
        reasoning: intentResult.reasoning,
        filesToEdit,
        filesToRead,
        context: {
            editFiles: compressionResult.editFiles.map(f => ({
                id: f.id,
                content: f.content
            })),
            readFiles: compressionResult.readFiles.map(f => ({
                id: f.id,
                content: f.content,
                compressionRatio: f.originalSize > 0 ? 1 - f.compressedSize / f.originalSize : 0
            }))
        },
        metadata: {
            totalChunks: chunks.length,
            selectedChunks: compressionResult.editFiles.length + compressionResult.readFiles.length,
            discardedChunks: compressionResult.discardedCount,
            totalContextSize: compressionResult.totalSize,
            latencyMs: totalLatency,
            phases
        }
    };
}

/**
 * 🔧 辅助函数：生成文件树字符串
 * 从 CodeChunk 数组生成简洁的文件树
 */
export function generateFileTreeFromChunks(chunks: CodeChunk[]): string {
    const fileNames = Array.from(new Set(chunks.map(c => c.id)));
    
    // 按类型分组
    const groups: Record<string, string[]> = {};
    
    for (const chunk of chunks) {
        const type = chunk.type || 'unknown';
        if (!groups[type]) groups[type] = [];
        if (!groups[type].includes(chunk.id)) {
            groups[type].push(chunk.id);
        }
    }
    
    // 生成树状结构
    let tree = `📁 Project Files (${fileNames.length} total)\n`;
    
    for (const [type, files] of Object.entries(groups)) {
        tree += `\n├── ${type}/ (${files.length})\n`;
        files.slice(0, 10).forEach((f, i) => {
            const isLast = i === Math.min(files.length - 1, 9);
            tree += `│   ${isLast ? '└──' : '├──'} ${f}\n`;
        });
        if (files.length > 10) {
            tree += `│   └── ... and ${files.length - 10} more\n`;
        }
    }
    
    return tree;
}

/**
 * 🆕 智能架构摘要生成器
 * 从 CodeChunk 数组提取所有组件/函数/常量的签名，生成紧凑的架构概览
 * 让 DeepSeek 能够看到完整的项目结构而不超时
 * 
 * 输出格式:
 * ┌─ Components ─┐
 * MapScreen(props) - React component
 * BattleScene({player, enemy}) - React component  
 * 
 * ┌─ Constants ─┐
 * MONSTERS: Array[12] - Monster definitions
 * TILE_CLASSES: Object{6 keys} - Tile type mappings
 * 
 * ┌─ Functions ─┐
 * calculateDamage(attacker, defender, move) → number
 * saveGame(state) → void
 */
export function generateArchitectureSummary(chunks: CodeChunk[]): string {
    const components: string[] = [];
    const constants: string[] = [];
    const functions: string[] = [];
    const hooks: string[] = [];
    const types: string[] = [];
    
    for (const chunk of chunks) {
        const name = chunk.id.replace('component-', '');
        const content = chunk.content;
        
        // Skip style blocks and imports
        if (chunk.type === 'style' || name === 'Imports/Setup' || name === 'style-block') continue;
        
        try {
            // 🔍 分析代码签名
            const signature = extractCodeSignature(name, content);
            
            if (signature.type === 'component') {
                components.push(signature.summary);
            } else if (signature.type === 'constant') {
                constants.push(signature.summary);
            } else if (signature.type === 'function') {
                functions.push(signature.summary);
            } else if (signature.type === 'hook') {
                hooks.push(signature.summary);
            } else if (signature.type === 'type') {
                types.push(signature.summary);
            }
        } catch (e) {
            // Fallback: just use the name
            if (/^[A-Z][a-z]/.test(name)) {
                components.push(`${name} - component`);
            } else if (/^[A-Z_]+$/.test(name)) {
                constants.push(`${name} - constant`);
            } else {
                functions.push(`${name}()`);
            }
        }
    }
    
    // 🎨 生成紧凑的架构摘要
    let summary = `📐 Architecture Summary (${chunks.length} modules)\n\n`;
    
    if (components.length > 0) {
        summary += `┌─ React Components (${components.length}) ─┐\n`;
        summary += components.join('\n') + '\n\n';
    }
    
    if (constants.length > 0) {
        summary += `┌─ Constants & Data (${constants.length}) ─┐\n`;
        summary += constants.join('\n') + '\n\n';
    }
    
    if (functions.length > 0) {
        summary += `┌─ Functions (${functions.length}) ─┐\n`;
        summary += functions.join('\n') + '\n\n';
    }
    
    if (hooks.length > 0) {
        summary += `┌─ Custom Hooks (${hooks.length}) ─┐\n`;
        summary += hooks.join('\n') + '\n\n';
    }
    
    if (types.length > 0) {
        summary += `┌─ Types & Interfaces (${types.length}) ─┐\n`;
        summary += types.join('\n') + '\n\n';
    }
    
    return summary.trim();
}

/**
 * 🔍 提取代码签名
 * 分析代码块，提取有意义的签名信息
 */
function extractCodeSignature(name: string, content: string): { type: string; summary: string } {
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim() || '';
    
    // 1️⃣ React Component Detection
    // Patterns: const X = () => {, function X(, const X = ({props}) =>
    const componentPatterns = [
        /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*\(?\s*\{?([^}=]*)\}?\s*\)?\s*=>/,  // Arrow function
        /^(?:export\s+)?function\s+(\w+)\s*\(\s*\{?([^}]*)\}?\s*\)/,  // Function declaration
        /^(?:export\s+)?const\s+(\w+)\s*:\s*(?:React\.)?FC/,  // TypeScript FC
    ];
    
    for (const pattern of componentPatterns) {
        const match = firstLine.match(pattern) || content.slice(0, 500).match(pattern);
        if (match) {
            const componentName = match[1] || name;
            const propsStr = match[2]?.trim();
            
            // Check if it returns JSX (React component indicator)
            const hasJSX = content.includes('return (') && (content.includes('<') || content.includes('/>'));
            const hasHooks = /use[A-Z]\w+\(/.test(content);
            
            if (hasJSX || hasHooks) {
                const props = propsStr ? `{${propsStr.split(',').slice(0, 3).map(p => p.trim().split(':')[0].split('=')[0].trim()).filter(Boolean).join(', ')}}` : '';
                const hooksUsed = extractHooksUsed(content);
                const hookInfo = hooksUsed.length > 0 ? ` [uses: ${hooksUsed.slice(0, 3).join(', ')}${hooksUsed.length > 3 ? '...' : ''}]` : '';
                return {
                    type: 'component',
                    summary: `${componentName}(${props})${hookInfo}`
                };
            }
        }
    }
    
    // 2️⃣ Constant/Data Detection
    // Patterns: const UPPER_CASE = [...], const UPPER_CASE = {...}
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
        const arrayMatch = content.match(/=\s*\[([\s\S]*?)\]/);
        const objectMatch = content.match(/=\s*\{([\s\S]*?)\}/);
        
        if (arrayMatch) {
            // Count array items
            const items = arrayMatch[1].split(',').filter(s => s.trim()).length;
            const preview = extractArrayPreview(arrayMatch[1]);
            return {
                type: 'constant',
                summary: `${name}: Array[${items}] ${preview}`
            };
        } else if (objectMatch) {
            // Count object keys
            const keys = extractObjectKeys(objectMatch[1]);
            return {
                type: 'constant',
                summary: `${name}: Object{${keys.slice(0, 4).join(', ')}${keys.length > 4 ? '...' : ''}}`
            };
        } else {
            // Simple constant
            const valueMatch = content.match(/=\s*(['"`]?)([^'"`\n;]+)\1/);
            const valuePreview = valueMatch ? valueMatch[2].slice(0, 30) : 'value';
            return {
                type: 'constant',
                summary: `${name} = ${valuePreview}${valuePreview.length >= 30 ? '...' : ''}`
            };
        }
    }
    
    // 3️⃣ Custom Hook Detection
    if (name.startsWith('use') && /^use[A-Z]/.test(name)) {
        const paramsMatch = content.match(/(?:function|const)\s+\w+\s*[=]?\s*\(([^)]*)\)/);
        const params = paramsMatch ? paramsMatch[1].split(',').slice(0, 3).map(p => p.trim().split(':')[0].trim()).filter(Boolean) : [];
        const returns = extractHookReturn(content);
        return {
            type: 'hook',
            summary: `${name}(${params.join(', ')}) → ${returns}`
        };
    }
    
    // 4️⃣ Regular Function Detection
    const funcMatch = content.match(/(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)\s*[=]?\s*(?:async\s*)?\(([^)]*)\)/);
    if (funcMatch) {
        const funcName = funcMatch[1] || name;
        const params = funcMatch[2].split(',').slice(0, 4).map(p => p.trim().split(':')[0].split('=')[0].trim()).filter(Boolean);
        const isAsync = content.includes('async') && content.includes('await');
        const returnType = extractReturnType(content);
        return {
            type: 'function',
            summary: `${isAsync ? 'async ' : ''}${funcName}(${params.join(', ')}) → ${returnType}`
        };
    }
    
    // 5️⃣ Type/Interface Detection
    if (content.includes('interface ') || content.includes('type ')) {
        const typeMatch = content.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/);
        if (typeMatch) {
            return {
                type: 'type',
                summary: `${typeMatch[1]}`
            };
        }
    }
    
    // Fallback
    return {
        type: 'unknown',
        summary: name
    };
}

/**
 * 提取组件中使用的 Hooks
 */
function extractHooksUsed(content: string): string[] {
    const hooks: string[] = [];
    const hookPattern = /\b(use[A-Z]\w+)\s*\(/g;
    let match;
    while ((match = hookPattern.exec(content)) !== null) {
        if (!hooks.includes(match[1])) {
            hooks.push(match[1]);
        }
    }
    return hooks;
}

/**
 * 提取数组预览（前几个元素的关键信息）
 */
function extractArrayPreview(arrayContent: string): string {
    // Try to extract meaningful preview
    const items = arrayContent.split(',').slice(0, 2);
    const previews: string[] = [];
    
    for (const item of items) {
        // Object in array: extract first key
        const keyMatch = item.match(/(\w+)\s*:/);
        if (keyMatch) {
            previews.push(keyMatch[1]);
        } else {
            // Simple value
            const valueMatch = item.match(/['"`]?(\w+)['"`]?/);
            if (valueMatch) previews.push(valueMatch[1]);
        }
    }
    
    return previews.length > 0 ? `(${previews.join(', ')}...)` : '';
}

/**
 * 提取对象的键名
 */
function extractObjectKeys(objectContent: string): string[] {
    const keys: string[] = [];
    const keyPattern = /['"`]?(\w+)['"`]?\s*:/g;
    let match;
    while ((match = keyPattern.exec(objectContent)) !== null) {
        if (!keys.includes(match[1])) {
            keys.push(match[1]);
        }
    }
    return keys;
}

/**
 * 提取 Hook 返回值类型
 */
function extractHookReturn(content: string): string {
    // Look for return statement pattern
    const returnMatch = content.match(/return\s*\[([^\]]+)\]/);
    if (returnMatch) {
        const items = returnMatch[1].split(',').map(s => s.trim().split(':')[0].trim());
        return `[${items.slice(0, 3).join(', ')}${items.length > 3 ? '...' : ''}]`;
    }
    
    const returnObjMatch = content.match(/return\s*\{([^}]+)\}/);
    if (returnObjMatch) {
        const keys = returnObjMatch[1].split(',').map(s => s.trim().split(':')[0].trim());
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    }
    
    return 'unknown';
}

/**
 * 提取函数返回类型
 */
function extractReturnType(content: string): string {
    // TypeScript return type annotation
    const tsReturnMatch = content.match(/\)\s*:\s*(\w+(?:<[^>]+>)?)/);
    if (tsReturnMatch) return tsReturnMatch[1];
    
    // Infer from return statements
    if (content.includes('return true') || content.includes('return false')) return 'boolean';
    if (/return\s+\d+/.test(content)) return 'number';
    if (/return\s+['"`]/.test(content)) return 'string';
    if (/return\s*\[/.test(content)) return 'Array';
    if (/return\s*\{/.test(content)) return 'Object';
    if (content.includes('async')) return 'Promise';
    
    return 'void';
}

