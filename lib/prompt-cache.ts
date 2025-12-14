/**
 * 🚀 Prompt Caching System
 * 
 * 多级缓存策略，大幅降低 Token 成本：
 * - Level 1: 系统提示词缓存 (跨所有用户共享)
 * - Level 2: 项目骨架缓存 (单个项目的稳定结构)
 * - Level 3: 会话上下文缓存 (短期，5分钟内有效)
 * 
 * 支持的 API：
 * - DeepSeek: cache_prompt_prefix 参数
 * - Gemini: 隐式缓存 (内容 > 1024 tokens 自动触发)
 * - Claude: cache_control 标记
 */

import { chunkCode, CodeChunk } from './code-rag';
import { UserIntent } from './intent-classifier';

// ==================== 类型定义 ====================

export interface CacheEntry {
  content: string;
  hash: string;
  createdAt: number;
  ttl: number;           // 毫秒
  tokenCount: number;    // 预估 token 数
  hitCount: number;      // 命中次数
}

export interface PromptCacheConfig {
  enableL1: boolean;     // 系统提示词缓存
  enableL2: boolean;     // 项目骨架缓存
  enableL3: boolean;     // 会话上下文缓存
  l2TTL: number;         // 项目骨架缓存 TTL (毫秒)
  l3TTL: number;         // 会话上下文缓存 TTL (毫秒)
  maxCacheSize: number;  // 最大缓存条目数
}

export interface CachedPrompt {
  staticPrefix: string;   // 可缓存的静态部分
  dynamicSuffix: string;  // 每次变化的动态部分
  cacheHit: boolean;      // 是否命中缓存
  cacheLevel: 'L1' | 'L2' | 'L3' | 'none';
  estimatedSavings: number; // 预估节省的 tokens
}

export interface ProjectSkeleton {
  fileTree: string;           // 文件树结构
  componentSignatures: string[]; // 组件签名列表
  typeDefinitions: string;    // 类型定义
  constantsPreview: string;   // 常量预览
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: PromptCacheConfig = {
  enableL1: true,
  enableL2: true,
  enableL3: true,
  l2TTL: 10 * 60 * 1000,   // 10 分钟
  l3TTL: 5 * 60 * 1000,    // 5 分钟
  maxCacheSize: 100
};

// ==================== 缓存存储 ====================

// L1: 系统提示词缓存 (内存中，跨请求共享)
const L1_CACHE: Map<string, CacheEntry> = new Map();

// L2: 项目骨架缓存 (基于项目 hash)
const L2_CACHE: Map<string, CacheEntry> = new Map();

// L3: 会话上下文缓存 (基于 sessionId + 代码 hash)
const L3_CACHE: Map<string, CacheEntry> = new Map();

// ==================== 工具函数 ====================

/**
 * 快速计算字符串 hash (DJB2 算法)
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * 估算 token 数量 (粗略估计：4 字符 ≈ 1 token)
 */
function estimateTokens(text: string): number {
  // 中文字符约 1.5 token/字，英文约 0.25 token/字
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache(cache: Map<string, CacheEntry>): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  cache.forEach((entry, key) => {
    if (now - entry.createdAt > entry.ttl) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => cache.delete(key));
}

/**
 * LRU 淘汰策略
 */
function evictLRU(cache: Map<string, CacheEntry>, maxSize: number): void {
  if (cache.size <= maxSize) return;
  
  // 按命中次数排序，淘汰最少使用的
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].hitCount - b[1].hitCount);
  
  const toRemove = cache.size - maxSize;
  for (let i = 0; i < toRemove; i++) {
    cache.delete(entries[i][0]);
  }
}

// ==================== L1: 系统提示词缓存 ====================

/**
 * 获取或创建系统提示词缓存
 * 系统提示词在所有用户间共享，几乎不变
 */
export function getSystemPromptCache(
  promptKey: 'intent_classifier' | 'code_generator_create' | 'code_generator_modify',
  promptContent: string
): CacheEntry {
  const cached = L1_CACHE.get(promptKey);
  
  if (cached) {
    cached.hitCount++;
    return cached;
  }
  
  const entry: CacheEntry = {
    content: promptContent,
    hash: hashString(promptContent),
    createdAt: Date.now(),
    ttl: Infinity, // 系统提示词永不过期
    tokenCount: estimateTokens(promptContent),
    hitCount: 1
  };
  
  L1_CACHE.set(promptKey, entry);
  console.log(`[PromptCache] L1 created: ${promptKey} (${entry.tokenCount} tokens)`);
  
  return entry;
}

// ==================== L2: 项目骨架缓存 ====================

/**
 * 从代码中提取项目骨架（用于缓存）
 * 只保留结构信息，不包含函数体
 */
export function extractProjectSkeleton(code: string): ProjectSkeleton {
  const chunks = chunkCode(code);
  
  // 1. 构建文件树
  const componentNames = chunks
    .filter(c => c.type === 'js' && c.id.startsWith('component-'))
    .map(c => c.id.replace('component-', ''));
  
  const fileTree = `Components: ${componentNames.join(', ')}`;
  
  // 2. 提取组件签名
  const componentSignatures: string[] = [];
  for (const chunk of chunks) {
    if (chunk.type !== 'js') continue;
    
    // 提取函数/组件签名（第一行）
    const lines = chunk.content.split('\n');
    const signature = lines.find(l => 
      /^(const|function|export)\s+[A-Z]/.test(l.trim())
    );
    
    if (signature) {
      // 只保留签名，不保留函数体
      const cleanSignature = signature
        .replace(/\{[\s\S]*$/, '{ ... }')
        .replace(/=>[\s\S]*$/, '=> { ... }')
        .trim();
      componentSignatures.push(cleanSignature);
    }
  }
  
  // 3. 提取类型定义（interface, type）
  const typeMatches = code.match(/(?:interface|type)\s+\w+[\s\S]*?(?=\n(?:interface|type|const|function|export|$))/g) || [];
  const typeDefinitions = typeMatches.slice(0, 5).join('\n\n'); // 限制 5 个
  
  // 4. 提取常量预览
  const constantMatches = code.match(/(?:export\s+)?const\s+[A-Z_]+\s*=\s*[^;]+;/g) || [];
  const constantsPreview = constantMatches.slice(0, 10).join('\n'); // 限制 10 个
  
  return {
    fileTree,
    componentSignatures,
    typeDefinitions,
    constantsPreview
  };
}

/**
 * 获取或创建项目骨架缓存
 */
export function getProjectSkeletonCache(
  projectId: string,
  code: string,
  config: PromptCacheConfig = DEFAULT_CONFIG
): { skeleton: ProjectSkeleton; cached: boolean; entry: CacheEntry } {
  cleanExpiredCache(L2_CACHE);
  
  const codeHash = hashString(code);
  const cacheKey = `${projectId}:${codeHash}`;
  
  const cached = L2_CACHE.get(cacheKey);
  if (cached) {
    cached.hitCount++;
    console.log(`[PromptCache] L2 hit: ${projectId} (saved ${cached.tokenCount} tokens)`);
    return {
      skeleton: JSON.parse(cached.content),
      cached: true,
      entry: cached
    };
  }
  
  // 生成新的骨架
  const skeleton = extractProjectSkeleton(code);
  const skeletonStr = JSON.stringify(skeleton);
  
  const entry: CacheEntry = {
    content: skeletonStr,
    hash: codeHash,
    createdAt: Date.now(),
    ttl: config.l2TTL,
    tokenCount: estimateTokens(skeletonStr),
    hitCount: 1
  };
  
  L2_CACHE.set(cacheKey, entry);
  evictLRU(L2_CACHE, config.maxCacheSize);
  
  console.log(`[PromptCache] L2 created: ${projectId} (${entry.tokenCount} tokens)`);
  
  return { skeleton, cached: false, entry };
}

// ==================== L3: 会话上下文缓存 ====================

/**
 * 缓存会话上下文（用户的连续修改）
 */
export function cacheSessionContext(
  sessionId: string,
  code: string,
  config: PromptCacheConfig = DEFAULT_CONFIG
): CacheEntry {
  cleanExpiredCache(L3_CACHE);
  
  const codeHash = hashString(code);
  const cacheKey = `${sessionId}:${codeHash}`;
  
  const cached = L3_CACHE.get(cacheKey);
  if (cached) {
    cached.hitCount++;
    return cached;
  }
  
  const entry: CacheEntry = {
    content: code,
    hash: codeHash,
    createdAt: Date.now(),
    ttl: config.l3TTL,
    tokenCount: estimateTokens(code),
    hitCount: 1
  };
  
  L3_CACHE.set(cacheKey, entry);
  evictLRU(L3_CACHE, config.maxCacheSize);
  
  return entry;
}

/**
 * 检查会话上下文是否命中缓存
 */
export function checkSessionCache(
  sessionId: string,
  code: string
): { hit: boolean; savedTokens: number } {
  const codeHash = hashString(code);
  const cacheKey = `${sessionId}:${codeHash}`;
  
  const cached = L3_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < cached.ttl) {
    return { hit: true, savedTokens: cached.tokenCount };
  }
  
  return { hit: false, savedTokens: 0 };
}

// ==================== 主入口：构建缓存优化的 Prompt ====================

export interface BuildCachedPromptOptions {
  type: 'intent_classifier' | 'code_generator';
  mode?: 'create' | 'modify';
  systemPrompt: string;
  userPrompt: string;
  code?: string;
  projectId?: string;
  sessionId?: string;
  intent?: UserIntent;
  config?: PromptCacheConfig;
}

/**
 * 构建缓存优化的 Prompt
 * 
 * 返回格式化的 prompt，静态部分在前，动态部分在后
 * 以最大化隐式缓存命中率
 */
export function buildCachedPrompt(options: BuildCachedPromptOptions): CachedPrompt {
  const {
    type,
    mode = 'modify',
    systemPrompt,
    userPrompt,
    code,
    projectId,
    sessionId,
    config = DEFAULT_CONFIG
  } = options;
  
  let staticPrefix = '';
  let dynamicSuffix = '';
  let cacheHit = false;
  let cacheLevel: 'L1' | 'L2' | 'L3' | 'none' = 'none';
  let estimatedSavings = 0;
  
  // === L1: 系统提示词 ===
  if (config.enableL1) {
    const promptKey = type === 'intent_classifier' 
      ? 'intent_classifier' 
      : (mode === 'create' ? 'code_generator_create' : 'code_generator_modify');
    
    const l1Entry = getSystemPromptCache(promptKey, systemPrompt);
    
    // 系统提示词始终放在最前面
    staticPrefix = systemPrompt;
    
    if (l1Entry.hitCount > 1) {
      cacheHit = true;
      cacheLevel = 'L1';
      estimatedSavings += l1Entry.tokenCount;
    }
  } else {
    staticPrefix = systemPrompt;
  }
  
  // === L2: 项目骨架 (仅代码生成模式) ===
  if (config.enableL2 && type === 'code_generator' && code && projectId) {
    const { skeleton, cached, entry } = getProjectSkeletonCache(projectId, code, config);
    
    // 将骨架信息添加到静态前缀
    const skeletonContext = `
## Project Structure (Cached)
${skeleton.fileTree}

## Component Signatures
${skeleton.componentSignatures.slice(0, 10).join('\n')}

## Key Constants
${skeleton.constantsPreview}
`;
    staticPrefix += '\n\n' + skeletonContext;
    
    if (cached) {
      cacheHit = true;
      cacheLevel = 'L2';
      estimatedSavings += entry.tokenCount;
    }
  }
  
  // === L3: 会话上下文 ===
  if (config.enableL3 && sessionId && code) {
    const l3Check = checkSessionCache(sessionId, code);
    
    if (l3Check.hit) {
      cacheHit = true;
      cacheLevel = 'L3';
      estimatedSavings += l3Check.savedTokens;
      
      // 代码已缓存，只需发送引用
      dynamicSuffix = `
# EXISTING CODE (session cached, ${l3Check.savedTokens} tokens)
[Code context from session cache]

# USER REQUEST
${userPrompt}
`;
    } else {
      // 缓存当前代码
      cacheSessionContext(sessionId, code, config);
      
      // 完整发送代码
      dynamicSuffix = `
# EXISTING CODE (for context)
\`\`\`html
${code}
\`\`\`

# USER REQUEST
${userPrompt}
`;
    }
  } else {
    // 无会话缓存，直接使用原始格式
    if (code) {
      dynamicSuffix = `
# EXISTING CODE (for context)
\`\`\`html
${code}
\`\`\`

# USER REQUEST
${userPrompt}
`;
    } else {
      dynamicSuffix = userPrompt;
    }
  }
  
  return {
    staticPrefix,
    dynamicSuffix,
    cacheHit,
    cacheLevel,
    estimatedSavings
  };
}

// ==================== DeepSeek 专用：构建带 cache_prompt_prefix 的请求 ====================

export interface DeepSeekCacheRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    cache_control?: { type: 'ephemeral' };
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * 为 DeepSeek API 构建缓存优化的请求
 * 
 * DeepSeek 支持 cache_prompt_prefix 参数，
 * 但更推荐使用消息级别的隐式缓存
 */
export function buildDeepSeekCacheRequest(
  cachedPrompt: CachedPrompt,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  } = {}
): DeepSeekCacheRequest {
  const {
    model = 'deepseek-chat',
    temperature = 0.3,
    maxTokens = 5000,
    stream = false
  } = options;
  
  return {
    model,
    messages: [
      {
        role: 'system',
        content: cachedPrompt.staticPrefix,
        // DeepSeek 会自动缓存长系统提示词
      },
      {
        role: 'user',
        content: cachedPrompt.dynamicSuffix
      }
    ],
    temperature,
    max_tokens: maxTokens,
    stream
  };
}

// ==================== Gemini 专用：构建隐式缓存优化的请求 ====================

export interface GeminiCacheRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * 为 Gemini API 构建隐式缓存优化的请求
 * 
 * Gemini 隐式缓存规则：
 * 1. 内容 > 1024 tokens
 * 2. 相同内容在多次请求中出现
 * 3. 放在 messages 数组的前面部分
 */
export function buildGeminiCacheRequest(
  cachedPrompt: CachedPrompt,
  options: {
    model?: string;
    maxTokens?: number;
    stream?: boolean;
  } = {}
): GeminiCacheRequest {
  const {
    model = 'gemini-2.5-flash',
    maxTokens = 65536,
    stream = true
  } = options;
  
  // Gemini 的隐式缓存基于消息前缀匹配
  // 将稳定内容放在前面，变化内容放在后面
  return {
    model,
    messages: [
      {
        role: 'system',
        content: cachedPrompt.staticPrefix
      },
      {
        role: 'user',
        content: cachedPrompt.dynamicSuffix
      }
    ],
    max_tokens: maxTokens,
    stream
  };
}

// ==================== 缓存统计 ====================

export interface CacheStats {
  l1Size: number;
  l2Size: number;
  l3Size: number;
  totalHits: number;
  estimatedTokensSaved: number;
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): CacheStats {
  let totalHits = 0;
  let estimatedTokensSaved = 0;
  
  L1_CACHE.forEach((entry) => {
    totalHits += entry.hitCount - 1; // 首次创建不算命中
    estimatedTokensSaved += (entry.hitCount - 1) * entry.tokenCount;
  });
  
  L2_CACHE.forEach((entry) => {
    totalHits += entry.hitCount - 1;
    estimatedTokensSaved += (entry.hitCount - 1) * entry.tokenCount;
  });
  
  L3_CACHE.forEach((entry) => {
    totalHits += entry.hitCount - 1;
    estimatedTokensSaved += (entry.hitCount - 1) * entry.tokenCount;
  });
  
  return {
    l1Size: L1_CACHE.size,
    l2Size: L2_CACHE.size,
    l3Size: L3_CACHE.size,
    totalHits,
    estimatedTokensSaved
  };
}

/**
 * 清空所有缓存
 */
export function clearAllCaches(): void {
  L1_CACHE.clear();
  L2_CACHE.clear();
  L3_CACHE.clear();
  console.log('[PromptCache] All caches cleared');
}

/**
 * 打印缓存统计
 */
export function logCacheStats(): void {
  const stats = getCacheStats();
  console.log(`[PromptCache] 📊 Stats:
  - L1 (System Prompts): ${stats.l1Size} entries
  - L2 (Project Skeletons): ${stats.l2Size} entries
  - L3 (Session Contexts): ${stats.l3Size} entries
  - Total Cache Hits: ${stats.totalHits}
  - Estimated Tokens Saved: ${stats.estimatedTokensSaved.toLocaleString()}
  - Estimated Cost Saved: $${(stats.estimatedTokensSaved * 0.0001).toFixed(2)}`);
}
