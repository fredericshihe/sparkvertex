/**
 * 🚀 Advanced RAG Optimizations
 * 
 * 三大前沿优化方向的实现：
 * 
 * 1. Semantic Cache (语义缓存) - 基于向量相似度的智能缓存
 * 2. Program Slicing (程序切片) - 基于数据流的精确代码提取
 * 3. Reflection Agent (反思代理) - 自动检测和修复错误
 * 
 * 设计原则：
 * - 渐进式启用，不影响现有功能
 * - 性能优先，避免阻塞主流程
 * - 详细日志，便于调试和优化
 */

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

// ==================== 类型定义 ====================

export interface SemanticCacheEntry {
    queryEmbedding: number[];       // 查询向量
    queryText: string;              // 原始查询文本
    result: SemanticCacheResult;    // 缓存的结果
    timestamp: number;              // 创建时间
    hitCount: number;               // 命中次数
    ttl: number;                    // 存活时间 (ms)
}

export interface SemanticCacheResult {
    intent: string;                 // 意图分类
    targetFiles: string[];          // 目标文件列表
    referenceFiles: string[];       // 参考文件列表
    confidence: number;             // 置信度
}

export interface ProgramSlice {
    targetVariable: string;         // 目标变量/函数名
    relevantLines: number[];        // 相关行号
    code: string;                   // 提取的代码切片
    dependencies: string[];         // 依赖的变量/函数
    dependents: string[];           // 被依赖的变量/函数
    compressionRatio: number;       // 压缩比
}

export interface DataFlowNode {
    name: string;                   // 变量/函数名
    type: 'variable' | 'function' | 'parameter' | 'import';
    definedAt: number;              // 定义位置（行号）
    usedAt: number[];               // 使用位置列表
    dependsOn: string[];            // 依赖的其他节点
    dependedBy: string[];           // 被其他节点依赖
}

export interface ReflectionResult {
    passed: boolean;                // 是否通过检查
    errors: ReflectionError[];      // 发现的错误列表
    suggestions: string[];          // 修复建议
    autoFixed?: string;             // 自动修复后的代码
}

export interface ReflectionError {
    type: 'syntax' | 'reference' | 'type' | 'logic';
    message: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning';
}

// ==================== 1. Semantic Cache (语义缓存) ====================

/**
 * 语义缓存存储
 * Key: hash of embedding vector (quantized)
 */
const SEMANTIC_CACHE: Map<string, SemanticCacheEntry> = new Map();

const SEMANTIC_CACHE_CONFIG = {
    maxSize: 500,                   // 最大缓存条目
    defaultTTL: 30 * 60 * 1000,     // 默认 30 分钟 TTL
    similarityThreshold: 0.92,      // 相似度阈值
    cleanupInterval: 5 * 60 * 1000, // 清理间隔
};

/**
 * 计算两个向量的余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 量化向量用于快速索引
 * 将连续向量转换为离散桶
 */
function quantizeVector(embedding: number[], buckets: number = 16): string {
    // 简化版 LSH (Locality Sensitive Hashing)
    const quantized = embedding.slice(0, 32).map((v, i) => {
        const bucket = Math.floor((v + 1) * buckets / 2);
        return Math.min(Math.max(bucket, 0), buckets - 1);
    });
    return quantized.join('-');
}

/**
 * 查询语义缓存
 * 
 * @param queryEmbedding - 查询向量
 * @param queryText - 原始查询文本（用于精确匹配优化）
 * @returns 缓存的结果，如果未命中返回 null
 */
export function querySemanticCache(
    queryEmbedding: number[],
    queryText: string
): SemanticCacheResult | null {
    const now = Date.now();
    
    // 1. 快速精确匹配（基于量化向量）
    const quantizedKey = quantizeVector(queryEmbedding);
    const exactMatch = SEMANTIC_CACHE.get(quantizedKey);
    
    if (exactMatch && now - exactMatch.timestamp < exactMatch.ttl) {
        exactMatch.hitCount++;
        console.log(`[SemanticCache] 🎯 Exact hit for: "${queryText.substring(0, 50)}..."`);
        return exactMatch.result;
    }
    
    // 2. 语义相似度搜索
    let bestMatch: SemanticCacheEntry | null = null;
    let bestSimilarity = 0;
    
    const entries = Array.from(SEMANTIC_CACHE.entries());
    for (let i = 0; i < entries.length; i++) {
        const [key, entry] = entries[i];
        // 跳过过期条目
        if (now - entry.timestamp > entry.ttl) continue;
        
        const similarity = cosineSimilarity(queryEmbedding, entry.queryEmbedding);
        
        if (similarity > bestSimilarity && similarity >= SEMANTIC_CACHE_CONFIG.similarityThreshold) {
            bestMatch = entry;
            bestSimilarity = similarity;
        }
    }
    
    if (bestMatch) {
        (bestMatch as SemanticCacheEntry).hitCount++;
        console.log(`[SemanticCache] 🔍 Semantic hit (${(bestSimilarity * 100).toFixed(1)}% similar)`);
        console.log(`[SemanticCache] 📝 Original: "${(bestMatch as SemanticCacheEntry).queryText.substring(0, 50)}..."`);
        console.log(`[SemanticCache] 📝 Current:  "${queryText.substring(0, 50)}..."`);
        return (bestMatch as SemanticCacheEntry).result;
    }
    
    console.log(`[SemanticCache] ❌ Cache miss for: "${queryText.substring(0, 50)}..."`);
    return null;
}

/**
 * 存储到语义缓存
 */
export function storeSemanticCache(
    queryEmbedding: number[],
    queryText: string,
    result: SemanticCacheResult,
    ttl?: number
): void {
    // 缓存清理
    if (SEMANTIC_CACHE.size >= SEMANTIC_CACHE_CONFIG.maxSize) {
        cleanupSemanticCache();
    }
    
    const quantizedKey = quantizeVector(queryEmbedding);
    
    const entry: SemanticCacheEntry = {
        queryEmbedding,
        queryText,
        result,
        timestamp: Date.now(),
        hitCount: 0,
        ttl: ttl || SEMANTIC_CACHE_CONFIG.defaultTTL
    };
    
    SEMANTIC_CACHE.set(quantizedKey, entry);
    console.log(`[SemanticCache] 💾 Stored: "${queryText.substring(0, 50)}..." (cache size: ${SEMANTIC_CACHE.size})`);
}

/**
 * 清理过期和低价值的缓存条目
 */
function cleanupSemanticCache(): void {
    const now = Date.now();
    const entries = Array.from(SEMANTIC_CACHE.entries());
    
    // 按价值排序：hitCount 高且新的排前面
    entries.sort((a, b) => {
        const scoreA = a[1].hitCount * 10 + (now - a[1].timestamp) / 60000;
        const scoreB = b[1].hitCount * 10 + (now - b[1].timestamp) / 60000;
        return scoreB - scoreA;
    });
    
    // 删除后半部分
    const toRemove = entries.slice(Math.floor(entries.length / 2));
    for (const [key] of toRemove) {
        SEMANTIC_CACHE.delete(key);
    }
    
    console.log(`[SemanticCache] 🧹 Cleanup: removed ${toRemove.length} entries`);
}

/**
 * 获取缓存统计信息
 */
export function getSemanticCacheStats(): {
    size: number;
    totalHits: number;
    avgHitRate: number;
} {
    let totalHits = 0;
    
    Array.from(SEMANTIC_CACHE.values()).forEach(entry => {
        totalHits += entry.hitCount;
    });
    
    return {
        size: SEMANTIC_CACHE.size,
        totalHits,
        avgHitRate: SEMANTIC_CACHE.size > 0 ? totalHits / SEMANTIC_CACHE.size : 0
    };
}

// ==================== 1.5 Text-Based Fast Cache (文本快速缓存) ====================
// 不需要 embedding，基于文本 n-gram 相似度

interface TextCacheEntry {
    queryText: string;
    queryNgrams: Set<string>;
    result: SemanticCacheResult;
    timestamp: number;
    hitCount: number;
    ttl: number;
}

const TEXT_CACHE: Map<string, TextCacheEntry> = new Map();

const TEXT_CACHE_CONFIG = {
    maxSize: 200,
    defaultTTL: 30 * 60 * 1000,  // 30 分钟
    similarityThreshold: 0.75,   // n-gram 相似度阈值
    ngramSize: 3                 // 3-gram
};

/**
 * 提取文本的 n-gram 集合
 */
function extractNgrams(text: string, n: number = 3): Set<string> {
    const ngrams = new Set<string>();
    const normalized = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, ' ').replace(/\s+/g, ' ').trim();
    
    for (let i = 0; i <= normalized.length - n; i++) {
        ngrams.add(normalized.substring(i, i + n));
    }
    
    return ngrams;
}

/**
 * 计算两个 n-gram 集合的 Jaccard 相似度
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    
    let intersection = 0;
    const aArr = Array.from(a);
    for (let i = 0; i < aArr.length; i++) {
        if (b.has(aArr[i])) intersection++;
    }
    
    const union = a.size + b.size - intersection;
    return intersection / union;
}

/**
 * 快速查询文本缓存（不需要 embedding）
 */
export function queryTextCache(queryText: string): SemanticCacheResult | null {
    const now = Date.now();
    const queryNgrams = extractNgrams(queryText, TEXT_CACHE_CONFIG.ngramSize);
    
    // 精确匹配
    const hash = hashQueryText(queryText);
    const exactMatch = TEXT_CACHE.get(hash);
    if (exactMatch && now - exactMatch.timestamp < exactMatch.ttl) {
        exactMatch.hitCount++;
        console.log(`[TextCache] 🎯 Exact hit for: "${queryText.substring(0, 50)}..."`);
        return exactMatch.result;
    }
    
    // 相似度搜索
    let bestMatch: TextCacheEntry | null = null;
    let bestSimilarity = 0;
    
    const entries = Array.from(TEXT_CACHE.entries());
    for (let i = 0; i < entries.length; i++) {
        const [key, entry] = entries[i];
        if (now - entry.timestamp > entry.ttl) continue;
        
        const similarity = jaccardSimilarity(queryNgrams, entry.queryNgrams);
        if (similarity > bestSimilarity && similarity >= TEXT_CACHE_CONFIG.similarityThreshold) {
            bestMatch = entry;
            bestSimilarity = similarity;
        }
    }
    
    if (bestMatch) {
        bestMatch.hitCount++;
        console.log(`[TextCache] 🔍 Similarity hit (${(bestSimilarity * 100).toFixed(1)}%)`);
        console.log(`[TextCache] 📝 Original: "${bestMatch.queryText.substring(0, 50)}..."`);
        console.log(`[TextCache] 📝 Current:  "${queryText.substring(0, 50)}..."`);
        return bestMatch.result;
    }
    
    return null;
}

/**
 * 存储到文本缓存
 */
export function storeTextCache(
    queryText: string,
    result: SemanticCacheResult,
    ttl?: number
): void {
    if (TEXT_CACHE.size >= TEXT_CACHE_CONFIG.maxSize) {
        // 清理一半
        const entries = Array.from(TEXT_CACHE.entries())
            .sort((a, b) => b[1].hitCount - a[1].hitCount);
        const toRemove = entries.slice(Math.floor(entries.length / 2));
        toRemove.forEach(([key]) => TEXT_CACHE.delete(key));
    }
    
    const hash = hashQueryText(queryText);
    TEXT_CACHE.set(hash, {
        queryText,
        queryNgrams: extractNgrams(queryText, TEXT_CACHE_CONFIG.ngramSize),
        result,
        timestamp: Date.now(),
        hitCount: 0,
        ttl: ttl || TEXT_CACHE_CONFIG.defaultTTL
    });
    
    console.log(`[TextCache] 💾 Stored: "${queryText.substring(0, 50)}..." (size: ${TEXT_CACHE.size})`);
}

/**
 * 简单文本哈希
 */
function hashQueryText(text: string): string {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    let hash = 5381;
    for (let i = 0; i < normalized.length; i++) {
        hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}

// ==================== 2. Program Slicing (程序切片) ====================

const BABEL_PARSER_OPTIONS: parser.ParserOptions = {
    sourceType: 'module',
    plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator'
    ]
};

/**
 * 构建数据流图
 * 分析变量的定义和使用关系
 */
export function buildDataFlowGraph(code: string): Map<string, DataFlowNode> {
    const graph = new Map<string, DataFlowNode>();
    
    try {
        const ast = parser.parse(code, BABEL_PARSER_OPTIONS);
        
        // 第一遍：收集所有定义
        traverse(ast, {
            VariableDeclarator(path) {
                if (t.isIdentifier(path.node.id)) {
                    const name = path.node.id.name;
                    const line = path.node.loc?.start.line || 0;
                    
                    graph.set(name, {
                        name,
                        type: 'variable',
                        definedAt: line,
                        usedAt: [],
                        dependsOn: [],
                        dependedBy: []
                    });
                    
                    // 分析初始化表达式中的依赖
                    if (path.node.init) {
                        const deps = extractIdentifiers(path.node.init);
                        const node = graph.get(name)!;
                        node.dependsOn = deps;
                    }
                }
            },
            
            FunctionDeclaration(path) {
                if (path.node.id) {
                    const name = path.node.id.name;
                    const line = path.node.loc?.start.line || 0;
                    
                    graph.set(name, {
                        name,
                        type: 'function',
                        definedAt: line,
                        usedAt: [],
                        dependsOn: [],
                        dependedBy: []
                    });
                }
            },
            
            ImportSpecifier(path) {
                if (t.isIdentifier(path.node.local)) {
                    const name = path.node.local.name;
                    const line = path.node.loc?.start.line || 0;
                    
                    graph.set(name, {
                        name,
                        type: 'import',
                        definedAt: line,
                        usedAt: [],
                        dependsOn: [],
                        dependedBy: []
                    });
                }
            }
        });
        
        // 第二遍：收集使用位置和更新依赖关系
        traverse(ast, {
            Identifier(path) {
                const name = path.node.name;
                const node = graph.get(name);
                
                if (node && path.node.loc) {
                    const line = path.node.loc.start.line;
                    
                    // 不计算定义位置
                    if (line !== node.definedAt && !node.usedAt.includes(line)) {
                        node.usedAt.push(line);
                    }
                    
                    // 更新反向依赖
                    for (const dep of node.dependsOn) {
                        const depNode = graph.get(dep);
                        if (depNode && !depNode.dependedBy.includes(name)) {
                            depNode.dependedBy.push(name);
                        }
                    }
                }
            }
        });
        
    } catch (e) {
        console.warn('[ProgramSlicing] Failed to parse code:', e);
    }
    
    return graph;
}

/**
 * 从 AST 节点中提取所有标识符
 */
function extractIdentifiers(node: t.Node): string[] {
    const identifiers: string[] = [];
    
    traverse(t.file(t.program([t.expressionStatement(node as t.Expression)])), {
        Identifier(path) {
            if (!identifiers.includes(path.node.name)) {
                identifiers.push(path.node.name);
            }
        }
    }, undefined, { 
        // 独立作用域，避免影响外部
    });
    
    return identifiers;
}

/**
 * 计算程序切片
 * 给定目标变量，提取所有影响它的代码和被它影响的代码
 * 
 * @param code - 完整源代码
 * @param targetName - 目标变量/函数名
 * @param direction - 切片方向：backward(影响目标的), forward(被目标影响的), both
 * @returns 代码切片
 */
export function computeProgramSlice(
    code: string,
    targetName: string,
    direction: 'backward' | 'forward' | 'both' = 'both'
): ProgramSlice | null {
    console.log(`[ProgramSlicing] 🔪 Computing slice for "${targetName}" (${direction})`);
    
    const graph = buildDataFlowGraph(code);
    const targetNode = graph.get(targetName);
    
    if (!targetNode) {
        console.log(`[ProgramSlicing] ❌ Target "${targetName}" not found in code`);
        return null;
    }
    
    const relevantNames = new Set<string>([targetName]);
    
    // Backward slice: 所有影响目标的变量
    if (direction === 'backward' || direction === 'both') {
        const queue = [...targetNode.dependsOn];
        while (queue.length > 0) {
            const dep = queue.shift()!;
            if (!relevantNames.has(dep)) {
                relevantNames.add(dep);
                const depNode = graph.get(dep);
                if (depNode) {
                    queue.push(...depNode.dependsOn);
                }
            }
        }
    }
    
    // Forward slice: 所有被目标影响的变量
    if (direction === 'forward' || direction === 'both') {
        const queue = [...targetNode.dependedBy];
        while (queue.length > 0) {
            const dep = queue.shift()!;
            if (!relevantNames.has(dep)) {
                relevantNames.add(dep);
                const depNode = graph.get(dep);
                if (depNode) {
                    queue.push(...depNode.dependedBy);
                }
            }
        }
    }
    
    // 收集所有相关行号
    const relevantLines = new Set<number>();
    const dependencies: string[] = [];
    const dependents: string[] = [];
    
    Array.from(relevantNames).forEach(name => {
        const node = graph.get(name);
        if (node) {
            relevantLines.add(node.definedAt);
            node.usedAt.forEach(line => relevantLines.add(line));
            
            if (targetNode.dependsOn.includes(name)) {
                dependencies.push(name);
            }
            if (targetNode.dependedBy.includes(name)) {
                dependents.push(name);
            }
        }
    });
    
    // 提取相关代码行
    const lines = code.split('\n');
    const sortedLines = Array.from(relevantLines).sort((a, b) => a - b);
    
    // 添加上下文行（每个相关行的前后各 1 行）
    const expandedLines = new Set<number>();
    for (const line of sortedLines) {
        expandedLines.add(Math.max(1, line - 1));
        expandedLines.add(line);
        expandedLines.add(Math.min(lines.length, line + 1));
    }
    
    const slicedCode = Array.from(expandedLines)
        .sort((a, b) => a - b)
        .map(lineNum => `${lineNum.toString().padStart(4)}: ${lines[lineNum - 1] || ''}`)
        .join('\n');
    
    const compressionRatio = slicedCode.length / code.length;
    
    console.log(`[ProgramSlicing] ✅ Slice computed:`);
    console.log(`  - Target: ${targetName}`);
    console.log(`  - Dependencies: ${dependencies.join(', ') || 'none'}`);
    console.log(`  - Dependents: ${dependents.join(', ') || 'none'}`);
    console.log(`  - Compression: ${(compressionRatio * 100).toFixed(1)}% of original`);
    
    return {
        targetVariable: targetName,
        relevantLines: sortedLines,
        code: slicedCode,
        dependencies,
        dependents,
        compressionRatio
    };
}

/**
 * 从用户请求中提取目标变量名
 */
export function extractTargetFromRequest(request: string): string[] {
    const targets: string[] = [];
    
    // 匹配常见模式
    const patterns = [
        // "修复 xxx 变量"
        /(?:修复|fix|修改|change|更新|update)\s+[`'"]?(\w+)[`'"]?\s*(?:变量|variable|函数|function)?/gi,
        // "xxx 未定义"
        /[`'"]?(\w+)[`'"]?\s*(?:未定义|undefined|is not defined)/gi,
        // "xxx 的问题"
        /[`'"]?(\w+)[`'"]?\s*(?:的问题|有问题|出错|error)/gi,
        // 直接引用 `xxx`
        /`(\w{3,})`/g
    ];
    
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(request)) !== null) {
            const target = match[1];
            if (target && !targets.includes(target) && target.length > 2) {
                targets.push(target);
            }
        }
    }
    
    return targets;
}

// ==================== 3. Reflection Agent (反思代理) ====================

/**
 * 反思代理配置
 */
const REFLECTION_CONFIG = {
    enableSyntaxCheck: true,
    enableReferenceCheck: true,
    enableTypeCheck: false,  // 需要 TypeScript 编译器
    autoFixAttempts: 2,
    maxErrorsToReport: 10
};

/**
 * 检查代码语法
 */
function checkSyntax(code: string): ReflectionError[] {
    const errors: ReflectionError[] = [];
    
    try {
        parser.parse(code, BABEL_PARSER_OPTIONS);
    } catch (e: any) {
        errors.push({
            type: 'syntax',
            message: e.message,
            line: e.loc?.line,
            column: e.loc?.column,
            severity: 'error'
        });
    }
    
    return errors;
}

/**
 * 检查引用完整性
 * 确保所有使用的变量都有定义
 */
function checkReferences(code: string): ReflectionError[] {
    const errors: ReflectionError[] = [];
    
    try {
        const ast = parser.parse(code, BABEL_PARSER_OPTIONS);
        
        // 收集所有定义
        const definitions = new Set<string>();
        
        // 内置全局变量和 React 相关
        const builtins = new Set([
            'window', 'document', 'console', 'fetch', 'setTimeout', 'setInterval',
            'clearTimeout', 'clearInterval', 'Promise', 'JSON', 'Math', 'Date',
            'Array', 'Object', 'String', 'Number', 'Boolean', 'Function',
            'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect',
            'Error', 'TypeError', 'SyntaxError', 'ReferenceError',
            'React', 'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo',
            'useContext', 'useReducer', 'useLayoutEffect', 'useImperativeHandle',
            'createContext', 'forwardRef', 'memo', 'lazy', 'Suspense', 'Fragment',
            'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
            'require', 'module', 'exports', '__dirname', '__filename',
            'process', 'global', 'Buffer',
            'alert', 'confirm', 'prompt', 'location', 'history', 'navigator',
            'localStorage', 'sessionStorage', 'indexedDB',
            'XMLHttpRequest', 'FormData', 'Blob', 'File', 'FileReader',
            'URL', 'URLSearchParams', 'Headers', 'Request', 'Response',
            'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
            'HTMLElement', 'Element', 'Node', 'NodeList',
            'requestAnimationFrame', 'cancelAnimationFrame',
            'getComputedStyle', 'matchMedia', 'ResizeObserver', 'IntersectionObserver',
            'performance', 'crypto', 'atob', 'btoa',
            // JSX 相关
            'children', 'props', 'state', 'context', 'ref',
            // 常见库
            'axios', 'lodash', '_', 'moment', 'dayjs'
        ]);
        
        // 第一遍：收集定义
        traverse(ast, {
            VariableDeclarator(path) {
                if (t.isIdentifier(path.node.id)) {
                    definitions.add(path.node.id.name);
                }
            },
            FunctionDeclaration(path) {
                if (path.node.id) {
                    definitions.add(path.node.id.name);
                }
            },
            ImportSpecifier(path) {
                if (t.isIdentifier(path.node.local)) {
                    definitions.add(path.node.local.name);
                }
            },
            ImportDefaultSpecifier(path) {
                definitions.add(path.node.local.name);
            },
            ImportNamespaceSpecifier(path) {
                definitions.add(path.node.local.name);
            },
            // 函数参数
            Identifier(path) {
                if (path.parentPath.isFunctionDeclaration() || 
                    path.parentPath.isFunctionExpression() ||
                    path.parentPath.isArrowFunctionExpression()) {
                    definitions.add(path.node.name);
                }
            }
        });
        
        // 第二遍：检查使用
        const reported = new Set<string>();
        
        traverse(ast, {
            Identifier(path) {
                const name = path.node.name;
                
                // 跳过定义、属性访问、JSX 标签名
                if (path.parentPath.isVariableDeclarator() && path.key === 'id') return;
                if (path.parentPath.isMemberExpression() && path.key === 'property') return;
                if (path.parentPath.isJSXOpeningElement() || path.parentPath.isJSXClosingElement()) return;
                if (path.parentPath.isObjectProperty() && path.key === 'key') return;
                
                if (!definitions.has(name) && !builtins.has(name) && !reported.has(name)) {
                    // 检查是否是组件（首字母大写）
                    if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
                        // 可能是 React 组件，暂不报错
                        return;
                    }
                    
                    reported.add(name);
                    errors.push({
                        type: 'reference',
                        message: `'${name}' is not defined`,
                        line: path.node.loc?.start.line,
                        column: path.node.loc?.start.column,
                        severity: 'error'
                    });
                }
            }
        });
        
    } catch (e) {
        // 解析失败，已经在 syntax check 中报告
    }
    
    return errors.slice(0, REFLECTION_CONFIG.maxErrorsToReport);
}

/**
 * 运行反思检查
 * 
 * @param code - 待检查的代码
 * @returns 检查结果
 */
export function runReflectionCheck(code: string): ReflectionResult {
    console.log('[Reflection] 🔍 Running checks...');
    
    const errors: ReflectionError[] = [];
    const suggestions: string[] = [];
    
    // 1. 语法检查
    if (REFLECTION_CONFIG.enableSyntaxCheck) {
        const syntaxErrors = checkSyntax(code);
        errors.push(...syntaxErrors);
        
        if (syntaxErrors.length > 0) {
            suggestions.push('代码存在语法错误，请检查括号、引号是否配对。');
        }
    }
    
    // 2. 引用检查
    if (REFLECTION_CONFIG.enableReferenceCheck && errors.length === 0) {
        // 只有语法正确时才检查引用
        const refErrors = checkReferences(code);
        errors.push(...refErrors);
        
        if (refErrors.length > 0) {
            const missingVars = refErrors.map(e => e.message.match(/'(\w+)'/)?.[1]).filter(Boolean);
            suggestions.push(`以下变量未定义：${missingVars.join(', ')}。请确保导入或定义这些变量。`);
        }
    }
    
    const passed = errors.length === 0;
    
    console.log(`[Reflection] ${passed ? '✅ All checks passed' : `❌ Found ${errors.length} errors`}`);
    
    return {
        passed,
        errors,
        suggestions
    };
}

/**
 * 带自动修复的反思检查
 * 如果发现错误，尝试自动修复
 * 
 * @param code - 原始代码
 * @param generateFix - 生成修复代码的函数（调用 LLM）
 * @returns 检查结果，如果自动修复成功，包含修复后的代码
 */
export async function runReflectionWithAutoFix(
    code: string,
    generateFix?: (code: string, errors: ReflectionError[]) => Promise<string>
): Promise<ReflectionResult> {
    let currentCode = code;
    let attempts = 0;
    
    while (attempts < REFLECTION_CONFIG.autoFixAttempts) {
        const result = runReflectionCheck(currentCode);
        
        if (result.passed) {
            return {
                ...result,
                autoFixed: attempts > 0 ? currentCode : undefined
            };
        }
        
        // 如果没有提供修复函数，或已达到最大尝试次数，返回当前结果
        if (!generateFix || attempts >= REFLECTION_CONFIG.autoFixAttempts - 1) {
            return result;
        }
        
        console.log(`[Reflection] 🔄 Attempting auto-fix (attempt ${attempts + 1})...`);
        
        try {
            currentCode = await generateFix(currentCode, result.errors);
            attempts++;
        } catch (e) {
            console.error('[Reflection] Auto-fix failed:', e);
            return result;
        }
    }
    
    return runReflectionCheck(currentCode);
}

/**
 * 生成修复提示词
 * 用于请求 LLM 修复代码
 */
export function generateFixPrompt(code: string, errors: ReflectionError[]): string {
    const errorList = errors.map(e => 
        `- Line ${e.line || '?'}: ${e.type.toUpperCase()}: ${e.message}`
    ).join('\n');
    
    return `以下代码存在错误，请修复：

## 错误列表
${errorList}

## 原始代码
\`\`\`javascript
${code}
\`\`\`

请提供修复后的完整代码，确保：
1. 修复所有上述错误
2. 保持原有功能不变
3. 不要引入新的错误

只返回修复后的代码，不需要解释。`;
}

// ==================== 导出统一接口 ====================

export interface AdvancedRAGStats {
    semanticCache: ReturnType<typeof getSemanticCacheStats>;
    programSlicing: {
        enabled: boolean;
        lastSliceRatio: number;
    };
    reflection: {
        enabled: boolean;
        lastCheckPassed: boolean;
    };
}

let lastSliceRatio = 0;
let lastCheckPassed = true;

export function getAdvancedRAGStats(): AdvancedRAGStats {
    return {
        semanticCache: getSemanticCacheStats(),
        programSlicing: {
            enabled: true,
            lastSliceRatio
        },
        reflection: {
            enabled: REFLECTION_CONFIG.enableSyntaxCheck || REFLECTION_CONFIG.enableReferenceCheck,
            lastCheckPassed
        }
    };
}

/**
 * 智能代码提取
 * 结合语义缓存和程序切片，提取最相关的代码
 */
export async function smartCodeExtract(
    code: string,
    userRequest: string,
    embedding?: number[]
): Promise<{
    extractedCode: string;
    compressionRatio: number;
    cacheHit: boolean;
}> {
    // 1. 尝试语义缓存
    if (embedding) {
        const cached = querySemanticCache(embedding, userRequest);
        if (cached) {
            return {
                extractedCode: code, // 缓存命中时返回完整代码（可以进一步优化）
                compressionRatio: 1,
                cacheHit: true
            };
        }
    }
    
    // 2. 尝试程序切片
    const targets = extractTargetFromRequest(userRequest);
    
    if (targets.length > 0) {
        const slices: ProgramSlice[] = [];
        
        for (const target of targets) {
            const slice = computeProgramSlice(code, target, 'both');
            if (slice) {
                slices.push(slice);
            }
        }
        
        if (slices.length > 0) {
            // 合并所有切片
            const allLines = new Set<number>();
            slices.forEach(s => s.relevantLines.forEach(l => allLines.add(l)));
            
            const lines = code.split('\n');
            const extractedCode = Array.from(allLines)
                .sort((a, b) => a - b)
                .map(lineNum => `${lineNum.toString().padStart(4)}: ${lines[lineNum - 1] || ''}`)
                .join('\n');
            
            const ratio = extractedCode.length / code.length;
            lastSliceRatio = ratio;
            
            return {
                extractedCode,
                compressionRatio: ratio,
                cacheHit: false
            };
        }
    }
    
    // 3. 兜底：返回完整代码
    return {
        extractedCode: code,
        compressionRatio: 1,
        cacheHit: false
    };
}

// ==================== 4. Type Definitions Generator (P1 优化) ====================
/**
 * 🆕 P1: 类型定义生成器
 * 
 * 将完整代码转换为轻量级类型定义 (.d.ts 风格)
 * 用于参考文件的极大压缩，保留核心语义信息
 * 
 * 优势：
 * - Token 减少 30-50%
 * - 保留函数签名、类型信息
 * - 去除具体实现细节
 */

export interface TypeDefinitionResult {
    typeDefinition: string;     // 生成的类型定义
    originalTokens: number;     // 原始预估 token 数
    compressedTokens: number;   // 压缩后预估 token 数
    savedPercent: number;       // 节省百分比
    exports: string[];          // 导出的符号列表
}

/**
 * 提取函数签名（不含函数体）
 */
function extractFunctionSignature(funcCode: string): string {
    // 匹配 arrow function: const name = (params) => { ... }
    const arrowMatch = funcCode.match(
        /^(export\s+)?(const|let)\s+(\w+)\s*(?::\s*([^=]+))?\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^=>{]+))?\s*=>/
    );
    if (arrowMatch) {
        const [, exportKw, , name, typeAnnotation, params, returnType] = arrowMatch;
        const exp = exportKw ? 'export ' : '';
        const ret = returnType?.trim() || typeAnnotation?.trim() || 'unknown';
        return `${exp}declare const ${name}: (${params.trim()}) => ${ret};`;
    }
    
    // 匹配 function declaration: function name(params) { ... }
    const funcMatch = funcCode.match(
        /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/
    );
    if (funcMatch) {
        const [, exportKw, asyncKw, name, params, returnType] = funcMatch;
        const exp = exportKw ? 'export ' : '';
        const ret = returnType?.trim() || (asyncKw ? 'Promise<void>' : 'void');
        return `${exp}declare function ${name}(${params.trim()}): ${ret};`;
    }
    
    return '';
}

/**
 * 提取 React 组件签名
 */
function extractComponentSignature(componentCode: string): string {
    // 匹配 React.FC 或 FC 类型
    const fcMatch = componentCode.match(
        /^(export\s+)?(const|let)\s+(\w+)\s*:\s*(React\.)?FC\s*(?:<([^>]+)>)?\s*=/
    );
    if (fcMatch) {
        const [, exportKw, , name, , propsType] = fcMatch;
        const exp = exportKw ? 'export ' : '';
        const props = propsType || '{}';
        return `${exp}declare const ${name}: React.FC<${props}>;`;
    }
    
    // 匹配普通函数组件: const Name = () => <...>
    const componentMatch = componentCode.match(
        /^(export\s+)?(const|let)\s+([A-Z]\w+)\s*=\s*(?:React\.memo\()?\s*\(?\s*\(?([^)]*)\)?\s*(?::\s*([^=>{]+))?\s*=>/
    );
    if (componentMatch) {
        const [, exportKw, , name, params, returnType] = componentMatch;
        const exp = exportKw ? 'export ' : '';
        // 提取 props 类型
        const propsMatch = params.match(/\{\s*([^}]+)\s*\}\s*:\s*(\w+)/);
        const propsType = propsMatch ? propsMatch[2] : (params.includes(':') ? params.split(':')[1]?.trim() : 'Props');
        return `${exp}declare const ${name}: React.FC<${propsType || 'unknown'}>;`;
    }
    
    return '';
}

/**
 * 提取接口定义
 */
function extractInterfaces(code: string): string[] {
    const interfaces: string[] = [];
    
    // 匹配 interface 定义
    const interfaceRegex = /(export\s+)?interface\s+\w+(?:\s+extends\s+[\w,\s]+)?\s*\{[^}]*\}/g;
    let match;
    while ((match = interfaceRegex.exec(code)) !== null) {
        interfaces.push(match[0]);
    }
    
    // 匹配 type 定义
    const typeRegex = /(export\s+)?type\s+\w+\s*=\s*[^;]+;/g;
    while ((match = typeRegex.exec(code)) !== null) {
        interfaces.push(match[0]);
    }
    
    return interfaces;
}

/**
 * 提取常量声明（保留类型和简化值）
 */
function extractConstantSignature(constCode: string): string {
    // 匹配 const NAME: Type = value
    const typedMatch = constCode.match(
        /^(export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*:\s*([^=]+)\s*=/
    );
    if (typedMatch) {
        const [, exportKw, name, type] = typedMatch;
        const exp = exportKw ? 'export ' : '';
        return `${exp}declare const ${name}: ${type.trim()};`;
    }
    
    // 匹配 const NAME = { ... } (对象字面量)
    const objectMatch = constCode.match(
        /^(export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\{/
    );
    if (objectMatch) {
        const [, exportKw, name] = objectMatch;
        const exp = exportKw ? 'export ' : '';
        // 尝试推断类型
        if (constCode.includes('readonly')) {
            return `${exp}declare const ${name}: Readonly<Record<string, unknown>>;`;
        }
        return `${exp}declare const ${name}: Record<string, unknown>;`;
    }
    
    // 匹配 const NAME = [...] (数组)
    const arrayMatch = constCode.match(
        /^(export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[/
    );
    if (arrayMatch) {
        const [, exportKw, name] = arrayMatch;
        const exp = exportKw ? 'export ' : '';
        return `${exp}declare const ${name}: readonly unknown[];`;
    }
    
    return '';
}

/**
 * 🆕 P1: 生成类型定义
 * 
 * 将完整代码转换为 .d.ts 风格的类型定义
 * 用于参考文件的极大压缩
 * 
 * @param code - 原始代码
 * @param options - 配置选项
 * @returns 类型定义结果
 */
export function generateTypeDefinition(code: string, options: {
    includeInterfaces?: boolean;   // 包含 interface/type 定义
    includeComponents?: boolean;   // 包含 React 组件签名
    includeFunctions?: boolean;    // 包含函数签名
    includeConstants?: boolean;    // 包含常量声明
    maxLines?: number;             // 最大行数限制
} = {}): TypeDefinitionResult {
    const {
        includeInterfaces = true,
        includeComponents = true,
        includeFunctions = true,
        includeConstants = true,
        maxLines = 100
    } = options;
    
    const lines: string[] = [];
    const exports: string[] = [];
    
    // 估算原始 token 数 (约 4 字符 = 1 token)
    const originalTokens = Math.ceil(code.length / 4);
    
    // 1. 提取接口/类型定义
    if (includeInterfaces) {
        const interfaces = extractInterfaces(code);
        for (const intf of interfaces) {
            if (lines.length < maxLines) {
                lines.push(intf);
                const nameMatch = intf.match(/(?:interface|type)\s+(\w+)/);
                if (nameMatch) exports.push(nameMatch[1]);
            }
        }
    }
    
    // 2. 处理各个代码块
    const codeBlocks = code.split(/\n(?=(?:export\s+)?(?:const|function|let|var)\s+[A-Z])/);
    
    for (const block of codeBlocks) {
        if (lines.length >= maxLines) break;
        
        const trimmed = block.trim();
        if (!trimmed) continue;
        
        // 2a. React 组件
        if (includeComponents && /^(?:export\s+)?(?:const|let)\s+[A-Z]/.test(trimmed)) {
            const sig = extractComponentSignature(trimmed);
            if (sig) {
                lines.push(sig);
                const nameMatch = sig.match(/const\s+(\w+)/);
                if (nameMatch) exports.push(nameMatch[1]);
                continue;
            }
        }
        
        // 2b. 函数
        if (includeFunctions && /^(?:export\s+)?(?:async\s+)?function\s+/.test(trimmed)) {
            const sig = extractFunctionSignature(trimmed);
            if (sig) {
                lines.push(sig);
                const nameMatch = sig.match(/function\s+(\w+)/);
                if (nameMatch) exports.push(nameMatch[1]);
                continue;
            }
        }
        
        // 2c. 箭头函数
        if (includeFunctions && /^(?:export\s+)?(?:const|let)\s+\w+\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\(/.test(trimmed)) {
            const sig = extractFunctionSignature(trimmed);
            if (sig) {
                lines.push(sig);
                const nameMatch = sig.match(/const\s+(\w+)/);
                if (nameMatch) exports.push(nameMatch[1]);
                continue;
            }
        }
        
        // 2d. 常量 (全大写)
        if (includeConstants && /^(?:export\s+)?const\s+[A-Z_][A-Z0-9_]*\s*[=:]/.test(trimmed)) {
            const sig = extractConstantSignature(trimmed);
            if (sig) {
                lines.push(sig);
                const nameMatch = sig.match(/const\s+(\w+)/);
                if (nameMatch) exports.push(nameMatch[1]);
                continue;
            }
        }
    }
    
    const typeDefinition = lines.join('\n\n');
    const compressedTokens = Math.ceil(typeDefinition.length / 4);
    const savedPercent = originalTokens > 0 
        ? Math.round((1 - compressedTokens / originalTokens) * 100) 
        : 0;
    
    console.log(`[TypeDefinition] 📝 Generated: ${lines.length} declarations`);
    console.log(`[TypeDefinition] 💨 Compression: ${originalTokens} → ${compressedTokens} tokens (saved ${savedPercent}%)`);
    console.log(`[TypeDefinition] 📤 Exports: ${exports.slice(0, 5).join(', ')}${exports.length > 5 ? '...' : ''}`);
    
    return {
        typeDefinition,
        originalTokens,
        compressedTokens,
        savedPercent,
        exports
    };
}

/**
 * 🆕 P1: 智能压缩策略
 * 
 * 根据文件大小和角色选择最佳压缩策略
 * - 目标文件 (edit): 保留完整代码
 * - 参考文件 (read): 使用类型定义压缩
 * - 大文件 (>500行): 结合程序切片
 * 
 * @param code - 原始代码
 * @param role - 文件角色: 'edit' | 'read'
 * @param userRequest - 用户请求 (用于程序切片)
 * @returns 压缩后的代码和元信息
 */
export function smartCompress(
    code: string,
    role: 'edit' | 'read',
    userRequest?: string
): { code: string; strategy: string; savedPercent: number } {
    const lineCount = code.split('\n').length;
    
    // 目标文件：保留完整代码
    if (role === 'edit') {
        if (lineCount > 500 && userRequest) {
            // 大文件 + 有目标：使用程序切片
            const targets = extractTargetFromRequest(userRequest);
            if (targets.length > 0) {
                for (const target of targets) {
                    const slice = computeProgramSlice(code, target, 'both');
                    if (slice && slice.compressionRatio < 0.7) {
                        return {
                            code: slice.code,
                            strategy: 'program-slicing',
                            savedPercent: Math.round((1 - slice.compressionRatio) * 100)
                        };
                    }
                }
            }
        }
        return { code, strategy: 'full-code', savedPercent: 0 };
    }
    
    // 参考文件：使用类型定义压缩
    if (role === 'read') {
        const result = generateTypeDefinition(code);
        if (result.savedPercent >= 20) {
            return {
                code: `// Type definitions for reference (${result.exports.length} exports)\n${result.typeDefinition}`,
                strategy: 'type-definition',
                savedPercent: result.savedPercent
            };
        }
    }
    
    // 兜底：返回原始代码
    return { code, strategy: 'full-code', savedPercent: 0 };
}

// ==================== 5. P3: GraphRAG PageRank Pruning ====================
/**
 * 🆕 P3: PageRank 剪枝
 * 
 * 使用 PageRank 算法计算节点重要性，智能剪枝低优先级节点
 * 防止复杂项目中的上下文爆炸
 * 
 * 原理：
 * - 被多个节点依赖的节点（如核心组件）PageRank 更高
 * - 孤立或边缘节点 PageRank 较低
 * - 根据 PageRank 分数动态调整上下文大小
 */

export interface PageRankResult {
    scores: Map<string, number>;    // 节点 -> PageRank 分数
    ranked: string[];               // 按分数排序的节点列表
    pruned: string[];               // 被剪枝的节点
    kept: string[];                 // 保留的节点
}

export interface GraphPruneOptions {
    damping?: number;               // 阻尼系数 (默认 0.85)
    iterations?: number;            // 迭代次数 (默认 20)
    convergenceThreshold?: number;  // 收敛阈值 (默认 0.0001)
    keepTopPercent?: number;        // 保留前 N% 节点 (默认 70)
    minNodes?: number;              // 最少保留节点数 (默认 5)
    maxNodes?: number;              // 最多保留节点数 (默认 20)
    boostTargets?: string[];        // 额外加权的目标节点
}

/**
 * 计算 PageRank 分数
 * 
 * @param graph - 依赖图 { dependencies, dependents, nodes }
 * @param options - 配置选项
 * @returns PageRank 结果
 */
export function computePageRank(
    graph: { dependencies: Map<string, string[]>; dependents: Map<string, string[]>; nodes: string[] },
    options: GraphPruneOptions = {}
): PageRankResult {
    const {
        damping = 0.85,
        iterations = 20,
        convergenceThreshold = 0.0001,
        keepTopPercent = 70,
        minNodes = 5,
        maxNodes = 20,
        boostTargets = []
    } = options;
    
    const N = graph.nodes.length;
    if (N === 0) {
        return { scores: new Map(), ranked: [], pruned: [], kept: [] };
    }
    
    // 初始化分数 (均匀分布)
    const scores = new Map<string, number>();
    const initialScore = 1 / N;
    for (const node of graph.nodes) {
        scores.set(node, initialScore);
    }
    
    // 迭代计算 PageRank
    for (let iter = 0; iter < iterations; iter++) {
        const newScores = new Map<string, number>();
        let maxDelta = 0;
        
        for (const node of graph.nodes) {
            // 计算从其他节点流入的分数
            const incomingNodes = graph.dependents.get(node) || [];
            let incomingScore = 0;
            
            for (const incoming of incomingNodes) {
                const outgoingCount = (graph.dependencies.get(incoming) || []).length;
                if (outgoingCount > 0) {
                    incomingScore += (scores.get(incoming) || 0) / outgoingCount;
                }
            }
            
            // PageRank 公式: PR(A) = (1-d)/N + d * Σ(PR(Ti)/C(Ti))
            const newScore = (1 - damping) / N + damping * incomingScore;
            newScores.set(node, newScore);
            
            maxDelta = Math.max(maxDelta, Math.abs(newScore - (scores.get(node) || 0)));
        }
        
        // 更新分数
        newScores.forEach((score, node) => scores.set(node, score));
        
        // 检查收敛
        if (maxDelta < convergenceThreshold) {
            console.log(`[PageRank] Converged at iteration ${iter + 1}`);
            break;
        }
    }
    
    // 对目标节点进行加权 boost
    if (boostTargets.length > 0) {
        const boostFactor = 2.0;
        for (const target of boostTargets) {
            const currentScore = scores.get(target);
            if (currentScore !== undefined) {
                scores.set(target, currentScore * boostFactor);
            }
        }
    }
    
    // 按分数排序
    const ranked = [...graph.nodes].sort((a, b) => 
        (scores.get(b) || 0) - (scores.get(a) || 0)
    );
    
    // 计算保留数量
    const keepCount = Math.min(
        maxNodes,
        Math.max(
            minNodes,
            Math.ceil(N * keepTopPercent / 100)
        )
    );
    
    const kept = ranked.slice(0, keepCount);
    const pruned = ranked.slice(keepCount);
    
    console.log(`[PageRank] 📊 Computed for ${N} nodes`);
    console.log(`[PageRank] 🔝 Top 5: ${ranked.slice(0, 5).map(n => `${n}(${(scores.get(n)! * 100).toFixed(1)})`).join(', ')}`);
    console.log(`[PageRank] ✂️ Pruned ${pruned.length} nodes, kept ${kept.length}`);
    
    return { scores, ranked, pruned, kept };
}

/**
 * 🆕 P3: 使用 PageRank 剪枝依赖图
 * 
 * @param graph - 原始依赖图
 * @param targetIds - 用户指定的目标节点（会被 boost）
 * @param options - 剪枝选项
 * @returns 剪枝后的节点列表
 */
export function pruneGraphByPageRank(
    graph: { dependencies: Map<string, string[]>; dependents: Map<string, string[]>; nodes: string[] },
    targetIds: string[],
    options?: GraphPruneOptions
): { kept: string[]; pruned: string[]; scores: Map<string, number> } {
    const result = computePageRank(graph, {
        ...options,
        boostTargets: targetIds
    });
    
    // 确保目标节点一定被保留
    const keptSet = new Set(result.kept);
    for (const target of targetIds) {
        if (!keptSet.has(target) && graph.nodes.includes(target)) {
            keptSet.add(target);
            // 从 pruned 中移除
            const prunedIndex = result.pruned.indexOf(target);
            if (prunedIndex !== -1) {
                result.pruned.splice(prunedIndex, 1);
            }
        }
    }
    
    return {
        kept: Array.from(keptSet),
        pruned: result.pruned,
        scores: result.scores
    };
}

// ==================== 6. P4: Unified Diff Output Format ====================
/**
 * 🆕 P4: Unified Diff 输出格式
 * 
 * 让 AI 输出 unified diff 格式而非完整代码
 * 减少 30% 输出 Token，加快生成速度
 * 
 * 支持两种模式：
 * 1. 纯 Diff 模式：AI 只输出 diff，由客户端应用
 * 2. 混合模式：小修改用 diff，大修改用完整代码
 */

export interface UnifiedDiffOptions {
    contextLines?: number;          // diff 上下文行数 (默认 3)
    maxDiffPercent?: number;        // 超过此比例改动则用完整代码 (默认 50)
}

/**
 * 生成 Unified Diff 格式
 * 
 * @param originalCode - 原始代码
 * @param newCode - 新代码
 * @param filename - 文件名（用于 diff 头部）
 * @param options - 配置选项
 * @returns Unified diff 字符串
 */
export function generateUnifiedDiff(
    originalCode: string,
    newCode: string,
    filename: string = 'file.tsx',
    options: UnifiedDiffOptions = {}
): string {
    const { contextLines = 3 } = options;
    
    const originalLines = originalCode.split('\n');
    const newLines = newCode.split('\n');
    
    // 使用简化的 diff 算法（LCS-based）
    const hunks = computeDiffHunks(originalLines, newLines, contextLines);
    
    if (hunks.length === 0) {
        return ''; // 无变化
    }
    
    // 构建 unified diff 格式
    let diff = `--- a/${filename}\n`;
    diff += `+++ b/${filename}\n`;
    
    for (const hunk of hunks) {
        // Hunk 头部: @@ -start,count +start,count @@
        diff += `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;
        
        for (const line of hunk.lines) {
            diff += line + '\n';
        }
    }
    
    return diff;
}

interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
}

/**
 * 计算 diff hunks
 */
function computeDiffHunks(
    oldLines: string[],
    newLines: string[],
    contextLines: number
): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    
    // 简化的 diff：逐行比较，找出变化区域
    const changes: { type: 'same' | 'delete' | 'insert'; oldIdx: number; newIdx: number }[] = [];
    
    let oldIdx = 0;
    let newIdx = 0;
    
    // 使用简单的 LCS 算法找出公共子序列
    const lcs = computeLCS(oldLines, newLines);
    let lcsIdx = 0;
    
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
        if (lcsIdx < lcs.length && 
            oldIdx < oldLines.length && 
            newIdx < newLines.length &&
            oldLines[oldIdx] === lcs[lcsIdx] && 
            newLines[newIdx] === lcs[lcsIdx]) {
            // 相同行
            changes.push({ type: 'same', oldIdx, newIdx });
            oldIdx++;
            newIdx++;
            lcsIdx++;
        } else if (oldIdx < oldLines.length && 
                   (lcsIdx >= lcs.length || oldLines[oldIdx] !== lcs[lcsIdx])) {
            // 删除行
            changes.push({ type: 'delete', oldIdx, newIdx: -1 });
            oldIdx++;
        } else if (newIdx < newLines.length) {
            // 插入行
            changes.push({ type: 'insert', oldIdx: -1, newIdx });
            newIdx++;
        }
    }
    
    // 将变化分组为 hunks
    let currentHunk: DiffHunk | null = null;
    let lastChangeIdx = -contextLines - 1;
    
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        
        if (change.type !== 'same') {
            // 检查是否需要新建 hunk
            if (!currentHunk || i - lastChangeIdx > contextLines * 2) {
                // 完成当前 hunk
                if (currentHunk) {
                    // 添加后续上下文
                    for (let j = lastChangeIdx + 1; j <= Math.min(lastChangeIdx + contextLines, changes.length - 1); j++) {
                        if (changes[j].type === 'same') {
                            currentHunk.lines.push(' ' + oldLines[changes[j].oldIdx]);
                            currentHunk.oldCount++;
                            currentHunk.newCount++;
                        }
                    }
                    hunks.push(currentHunk);
                }
                
                // 新建 hunk
                currentHunk = {
                    oldStart: Math.max(1, (change.oldIdx >= 0 ? change.oldIdx : changes[i-1]?.oldIdx ?? 0) - contextLines + 1),
                    oldCount: 0,
                    newStart: Math.max(1, (change.newIdx >= 0 ? change.newIdx : changes[i-1]?.newIdx ?? 0) - contextLines + 1),
                    newCount: 0,
                    lines: []
                };
                
                // 添加前导上下文
                for (let j = Math.max(0, i - contextLines); j < i; j++) {
                    if (changes[j].type === 'same') {
                        currentHunk.lines.push(' ' + oldLines[changes[j].oldIdx]);
                        currentHunk.oldCount++;
                        currentHunk.newCount++;
                    }
                }
            }
            
            // 添加变化行
            if (change.type === 'delete') {
                currentHunk!.lines.push('-' + oldLines[change.oldIdx]);
                currentHunk!.oldCount++;
            } else if (change.type === 'insert') {
                currentHunk!.lines.push('+' + newLines[change.newIdx]);
                currentHunk!.newCount++;
            }
            
            lastChangeIdx = i;
        }
    }
    
    // 完成最后一个 hunk
    if (currentHunk) {
        for (let j = lastChangeIdx + 1; j <= Math.min(lastChangeIdx + contextLines, changes.length - 1); j++) {
            if (changes[j].type === 'same') {
                currentHunk.lines.push(' ' + oldLines[changes[j].oldIdx]);
                currentHunk.oldCount++;
                currentHunk.newCount++;
            }
        }
        hunks.push(currentHunk);
    }
    
    return hunks;
}

/**
 * 计算最长公共子序列 (LCS)
 */
function computeLCS(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    
    // 使用空间优化的 LCS
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    
    // 回溯找出 LCS
    const lcs: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            lcs.unshift(a[i - 1]);
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    
    return lcs;
}

/**
 * 解析 Unified Diff 并应用到原始代码
 * 
 * @param originalCode - 原始代码
 * @param diff - Unified diff 字符串
 * @returns 应用后的新代码，或 null 如果解析失败
 */
export function applyUnifiedDiff(
    originalCode: string,
    diff: string
): string | null {
    try {
        const lines = originalCode.split('\n');
        const diffLines = diff.split('\n');
        
        // 解析 hunks
        const hunks: { oldStart: number; oldCount: number; changes: { type: '+' | '-' | ' '; content: string }[] }[] = [];
        let currentHunk: typeof hunks[0] | null = null;
        
        for (const line of diffLines) {
            // 跳过文件头
            if (line.startsWith('---') || line.startsWith('+++')) continue;
            
            // 解析 hunk 头
            const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (hunkMatch) {
                if (currentHunk) hunks.push(currentHunk);
                currentHunk = {
                    oldStart: parseInt(hunkMatch[1], 10),
                    oldCount: parseInt(hunkMatch[2] || '1', 10),
                    changes: []
                };
                continue;
            }
            
            // 解析变化行
            if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
                currentHunk.changes.push({
                    type: line[0] as '+' | '-' | ' ',
                    content: line.slice(1)
                });
            }
        }
        
        if (currentHunk) hunks.push(currentHunk);
        
        // 从后往前应用 hunks（避免行号偏移）
        const result = [...lines];
        for (let i = hunks.length - 1; i >= 0; i--) {
            const hunk = hunks[i];
            const startIdx = hunk.oldStart - 1;
            
            // 收集新行
            const newLines: string[] = [];
            for (const change of hunk.changes) {
                if (change.type === '+' || change.type === ' ') {
                    newLines.push(change.content);
                }
            }
            
            // 替换
            result.splice(startIdx, hunk.oldCount, ...newLines);
        }
        
        return result.join('\n');
    } catch (e) {
        console.error('[UnifiedDiff] Failed to apply diff:', e);
        return null;
    }
}

/**
 * 🆕 P4: 构建使用 Diff 输出的 Prompt 指令
 * 
 * 添加到 System Prompt 中，指导 AI 输出 unified diff 格式
 */
export function buildDiffOutputInstructions(): string {
    return `
## Output Format: Unified Diff (Preferred)

When making code changes, prefer outputting in **unified diff format** for efficiency:

\`\`\`diff
--- a/filename.tsx
+++ b/filename.tsx
@@ -10,7 +10,8 @@
 // context line (unchanged)
 // context line (unchanged)
-const oldValue = 1;
+const newValue = 2;
+const additionalLine = 3;
 // context line (unchanged)
\`\`\`

### When to use Diff vs Full Code:
- **Use Diff**: Small to medium changes (< 50% of file modified)
- **Use Full Code**: Large rewrites, new files, or when structure changes significantly

### Diff Format Rules:
1. Include 3 lines of context before and after changes
2. Use \`-\` for removed lines, \`+\` for added lines
3. Use \` \` (space) for unchanged context lines
4. Include accurate line numbers in @@ headers
`;
}

/**
 * 检测 AI 输出是否为 diff 格式
 */
export function isDiffOutput(output: string): boolean {
    return output.includes('--- a/') && 
           output.includes('+++ b/') && 
           output.includes('@@ -');
}

/**
 * 智能选择输出格式
 * 根据预期修改量决定使用 diff 还是完整代码
 * 
 * @param originalCode - 原始代码
 * @param estimatedChangePercent - 预估修改百分比
 * @param options - 配置选项
 * @returns 推荐的输出格式
 */
export function selectOutputFormat(
    originalCode: string,
    estimatedChangePercent: number,
    options: UnifiedDiffOptions = {}
): 'diff' | 'full' {
    const { maxDiffPercent = 50 } = options;
    
    // 小文件总是用完整代码
    const lineCount = originalCode.split('\n').length;
    if (lineCount < 30) {
        return 'full';
    }
    
    // 根据修改量选择
    if (estimatedChangePercent < maxDiffPercent) {
        return 'diff';
    }
    
    return 'full';
}
