/**
 * 用户意图分类器 - RAG 系统的"大脑前额叶"
 * 在执行繁重的向量搜索之前，先快速判断用户想干什么
 */

export enum UserIntent {
  UI_MODIFICATION = 'UI_MODIFICATION',    // 改颜色、布局、样式
  LOGIC_FIX = 'LOGIC_FIX',                // 改 Bug、业务逻辑
  CONFIG_HELP = 'CONFIG_HELP',            // 环境变量、配置、启动问题
  NEW_FEATURE = 'NEW_FEATURE',            // 新增功能
  QA_EXPLANATION = 'QA_EXPLANATION',      // 解释代码、问答
  PERFORMANCE = 'PERFORMANCE',            // 性能优化
  REFACTOR = 'REFACTOR',                  // 代码重构
  DATA_OPERATION = 'DATA_OPERATION',      // 数据库、API、数据操作
  UNKNOWN = 'UNKNOWN'
}

export interface SearchStrategy {
  intent: UserIntent;
  fileExtensions: string[];     // 重点关注的文件后缀
  topK: number;                 // 检索数量
  useSemanticSearch: boolean;   // 是否用向量搜索
  useKeywordSearch: boolean;    // 是否用关键词搜索
  priorityPatterns: string[];   // 优先匹配的文件/目录模式
  excludePatterns: string[];    // 排除的文件/目录模式
  confidence: number;           // 分类置信度 (0-1)
}

// 关键词映射表 - 用于快速本地分类（无需调用 LLM）
const INTENT_KEYWORDS: Record<UserIntent, { 
  zh: string[], 
  en: string[],
  weight: number 
}> = {
  [UserIntent.UI_MODIFICATION]: {
    zh: ['颜色', '样式', '布局', 'CSS', '字体', '边距', '间距', '动画', '主题', 
         '暗色', '亮色', '图标', '按钮', '卡片', '边框', '阴影', '圆角', '居中',
         '响应式', '移动端', '显示', '隐藏', '宽度', '高度', '背景', '渐变'],
    en: ['color', 'style', 'layout', 'css', 'font', 'margin', 'padding', 'animation',
         'theme', 'dark', 'light', 'icon', 'button', 'card', 'border', 'shadow',
         'rounded', 'center', 'responsive', 'mobile', 'display', 'hidden', 'width',
         'height', 'background', 'gradient', 'tailwind', 'className'],
    weight: 1.0
  },
  [UserIntent.LOGIC_FIX]: {
    zh: ['修复', 'bug', '错误', '问题', '不工作', '失败', '崩溃', '报错', 
         '异常', '不对', '逻辑', '判断', '条件', '循环', '函数', '方法'],
    en: ['fix', 'bug', 'error', 'issue', 'broken', 'fail', 'crash', 'exception',
         'wrong', 'logic', 'condition', 'loop', 'function', 'method', 'debug',
         'undefined', 'null', 'NaN', 'TypeError', 'ReferenceError'],
    weight: 1.2
  },
  [UserIntent.CONFIG_HELP]: {
    zh: ['配置', '环境变量', '安装', '启动', '部署', '构建', '编译', '打包',
         '依赖', '版本', 'npm', 'yarn', 'pnpm', '设置'],
    en: ['config', 'configuration', 'env', 'environment', 'install', 'start', 
         'deploy', 'build', 'compile', 'bundle', 'dependency', 'version',
         'npm', 'yarn', 'pnpm', 'setup', 'package.json', 'tsconfig', '.env',
         'vercel', 'docker', 'next.config'],
    weight: 1.0
  },
  [UserIntent.NEW_FEATURE]: {
    zh: ['添加', '新增', '创建', '实现', '开发', '新功能', '新页面', '新组件',
         '集成', '接入'],
    en: ['add', 'new', 'create', 'implement', 'develop', 'feature', 'page',
         'component', 'integrate', 'build', 'make'],
    weight: 0.8
  },
  [UserIntent.QA_EXPLANATION]: {
    zh: ['什么', '为什么', '如何', '怎么', '解释', '说明', '是什么', '作用',
         '原理', '区别', '理解'],
    en: ['what', 'why', 'how', 'explain', 'describe', 'purpose', 'difference',
         'understand', 'mean', 'work', 'does'],
    weight: 0.6
  },
  [UserIntent.PERFORMANCE]: {
    zh: ['性能', '优化', '慢', '卡顿', '加速', '缓存', '懒加载', '内存',
         '渲染', '重渲染'],
    en: ['performance', 'optimize', 'slow', 'fast', 'speed', 'cache', 'lazy',
         'memory', 'render', 'rerender', 'memo', 'useMemo', 'useCallback'],
    weight: 1.1
  },
  [UserIntent.REFACTOR]: {
    zh: ['重构', '优化代码', '整理', '拆分', '合并', '提取', '抽象', '封装',
         '解耦', '清理'],
    en: ['refactor', 'clean', 'split', 'merge', 'extract', 'abstract', 'encapsulate',
         'decouple', 'organize', 'restructure', 'simplify'],
    weight: 0.9
  },
  [UserIntent.DATA_OPERATION]: {
    zh: ['数据库', '查询', 'API', '接口', '请求', '数据', '表', '字段',
         '增删改查', 'CRUD', '存储', '获取'],
    en: ['database', 'query', 'api', 'endpoint', 'request', 'data', 'table',
         'field', 'crud', 'storage', 'fetch', 'post', 'get', 'supabase',
         'prisma', 'sql', 'mutation'],
    weight: 1.0
  },
  [UserIntent.UNKNOWN]: {
    zh: [],
    en: [],
    weight: 0.5
  }
};

// 文件扩展名映射
const EXTENSION_MAP: Record<UserIntent, string[]> = {
  [UserIntent.UI_MODIFICATION]: ['.tsx', '.jsx', '.css', '.scss', '.sass', '.styled.ts', '.styled.tsx', '.module.css'],
  [UserIntent.LOGIC_FIX]: ['.ts', '.tsx', '.js', '.jsx'],
  [UserIntent.CONFIG_HELP]: ['.json', '.js', '.ts', '.env', '.yaml', '.yml', '.toml', '.config.js', '.config.ts'],
  [UserIntent.NEW_FEATURE]: ['.ts', '.tsx', '.js', '.jsx'],
  [UserIntent.QA_EXPLANATION]: ['.ts', '.tsx', '.js', '.jsx', '.md'],
  [UserIntent.PERFORMANCE]: ['.ts', '.tsx', '.js', '.jsx'],
  [UserIntent.REFACTOR]: ['.ts', '.tsx', '.js', '.jsx'],
  [UserIntent.DATA_OPERATION]: ['.ts', '.js', '.sql'],
  [UserIntent.UNKNOWN]: []
};

// 优先目录模式
const PRIORITY_PATTERNS: Record<UserIntent, string[]> = {
  [UserIntent.UI_MODIFICATION]: ['components/', 'styles/', 'app/', 'pages/'],
  [UserIntent.LOGIC_FIX]: ['lib/', 'utils/', 'hooks/', 'services/', 'app/api/'],
  [UserIntent.CONFIG_HELP]: ['/', 'config/', '.env'],
  [UserIntent.NEW_FEATURE]: ['components/', 'app/', 'pages/', 'lib/'],
  [UserIntent.QA_EXPLANATION]: [],
  [UserIntent.PERFORMANCE]: ['components/', 'hooks/', 'lib/'],
  [UserIntent.REFACTOR]: ['components/', 'lib/', 'utils/', 'hooks/'],
  [UserIntent.DATA_OPERATION]: ['lib/', 'app/api/', 'supabase/', 'services/'],
  [UserIntent.UNKNOWN]: []
};

// 排除目录模式
const EXCLUDE_PATTERNS: Record<UserIntent, string[]> = {
  [UserIntent.UI_MODIFICATION]: ['node_modules/', '.git/', 'dist/', 'build/'],
  [UserIntent.LOGIC_FIX]: ['node_modules/', '.git/', 'dist/', 'build/', '*.test.*', '*.spec.*'],
  [UserIntent.CONFIG_HELP]: ['node_modules/', '.git/', 'src/', 'components/'],
  [UserIntent.NEW_FEATURE]: ['node_modules/', '.git/', 'dist/', 'build/'],
  [UserIntent.QA_EXPLANATION]: ['node_modules/', '.git/'],
  [UserIntent.PERFORMANCE]: ['node_modules/', '.git/', '*.test.*'],
  [UserIntent.REFACTOR]: ['node_modules/', '.git/', 'dist/'],
  [UserIntent.DATA_OPERATION]: ['node_modules/', '.git/', 'components/', 'styles/'],
  [UserIntent.UNKNOWN]: ['node_modules/', '.git/']
};

/**
 * 本地快速意图分类（无需 LLM）
 * 基于关键词匹配，适合大多数明确的请求
 */
export function classifyIntentLocal(query: string): { intent: UserIntent; confidence: number } {
  const queryLower = query.toLowerCase();
  const scores: Map<UserIntent, number> = new Map();

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const { zh, en, weight } = keywords;
    let score = 0;
    let matchCount = 0;

    // 中文关键词匹配
    for (const kw of zh) {
      if (query.includes(kw)) {
        score += weight;
        matchCount++;
      }
    }

    // 英文关键词匹配
    for (const kw of en) {
      if (queryLower.includes(kw.toLowerCase())) {
        score += weight;
        matchCount++;
      }
    }

    // 归一化分数
    if (matchCount > 0) {
      scores.set(intent as UserIntent, score * Math.log2(matchCount + 1));
    }
  }

  // 找出最高分
  let bestIntent = UserIntent.UNKNOWN;
  let bestScore = 0;

  scores.forEach((score, intent) => {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  });

  // 计算置信度（0-1）
  const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0;

  return { intent: bestIntent, confidence };
}

/**
 * DeepSeek API 配置（通过 Supabase Edge Function 调用）
 */
export interface DeepSeekConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authToken?: string;  // 用户的 auth token
  temperature?: number;
  timeoutMs?: number;  // 超时时间（毫秒），默认 5000ms
}

// 默认超时时间：15秒 (从 5秒 增加，避免复杂分析时超时)
const DEFAULT_DEEPSEEK_TIMEOUT = 15000;

/**
 * 使用 DeepSeek API 进行意图分类（通过 Supabase Edge Function）
 * 性价比高，速度快，中文理解能力强
 * API Key 存储在 Edge Function Secrets 中，前端不需要暴露
 * 
 * ⚠️ 超时降级：如果 DeepSeek 在 timeoutMs 内未响应，自动降级为 UNKNOWN
 */
export async function classifyIntentWithDeepSeek(
  query: string,
  config?: DeepSeekConfig
): Promise<{ intent: UserIntent; confidence: number; latencyMs: number; source: 'deepseek' | 'timeout_fallback'; targets: string[] }> {
  const startTime = Date.now();
  const {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    authToken,
    temperature = 0.3,
    timeoutMs = DEFAULT_DEEPSEEK_TIMEOUT
  } = config || {};

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[IntentClassifier] Missing Supabase config');
    return { intent: UserIntent.UNKNOWN, confidence: 0, latencyMs: Date.now() - startTime, source: 'timeout_fallback', targets: [] };
  }

  const systemPrompt = `你是一个代码助手路由器。分析用户的请求并将其分类，同时提取用户明确想要修改的目标组件或变量名。

请返回 JSON 格式：
{
  "intent": "类别名称",
  "targets": ["目标1", "目标2"]
}

类别说明：
- UI_MODIFICATION: 修改颜色、样式、布局、CSS、组件外观、主题
- LOGIC_FIX: 修复Bug、修改数据流、算法、业务逻辑、错误处理
- CONFIG_HELP: 环境变量、package.json、构建设置、部署、安装
- NEW_FEATURE: 添加全新的页面、组件或功能
- QA_EXPLANATION: 询问代码如何工作、解释概念、文档
- PERFORMANCE: 优化速度、减少渲染、缓存、内存管理
- REFACTOR: 重构代码、提取组件、清理代码
- DATA_OPERATION: 数据库查询、API调用、数据获取、数据变更
- UNKNOWN: 无法确定意图

targets 说明：
- 提取用户明确提到的组件名、变量名、函数名（如 "MAP_GRID", "BattleScene"）
- 如果没有明确目标，返回空数组 []
- 自动转换为大写或驼峰形式以匹配代码习惯
- 不要包含 "App" 或 "Main" 这种通用组件，除非用户明确指定

IMPORTANT:
1. You must output STRICT JSON format only.
2. Do NOT output any "Thinking Process", "Plan", or Markdown code blocks.
3. Start directly with "{".
`;

  const userPrompt = `用户请求: "${query}"`;

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.warn(`[IntentClassifier] DeepSeek timeout after ${timeoutMs}ms, falling back to UNKNOWN`);
  }, timeoutMs);

  try {
    // 通过 Supabase Edge Function 调用 DeepSeek API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      // 必须加上 Authorization，使用 Anon Key 通过网关验证
      'Authorization': `Bearer ${supabaseAnonKey}`
    };
    
    // 如果有用户 token，优先使用用户 token
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/deepseek-chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        temperature,
        stream: false  // 意图分类不需要流式输出
      }),
      signal: controller.signal  // 添加超时信号
    });

    // 清除超时定时器
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[IntentClassifier] DeepSeek Edge Function error:', errorText);
      return { intent: UserIntent.UNKNOWN, confidence: 0, latencyMs: Date.now() - startTime, source: 'timeout_fallback', targets: [] };
    }

    // 处理非流式响应
    const data = await response.json();
    
    // Edge Function 返回的格式可能是直接的 JSON 或 SSE 格式
    let result = '';
    if (data.choices?.[0]?.message?.content) {
      result = data.choices[0].message.content;
    } else if (data.content) {
      result = data.content;
    } else if (typeof data === 'string') {
      result = data;
    }

    // 尝试解析 JSON
    let intentStr = UserIntent.UNKNOWN;
    let targets: string[] = [];
    
    let jsonString = result;

    // 1. 尝试提取 Markdown 代码块中的 JSON
    const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
    } else {
        // 2. 如果没有代码块，尝试寻找第一个 { 和最后一个 }
        const firstBrace = result.indexOf('{');
        const lastBrace = result.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonString = result.substring(firstBrace, lastBrace + 1);
        }
    }

    // 3. 清理可能存在的注释 (// ...) 这是一个简单的正则，处理标准 JSON 不支持的注释
    jsonString = jsonString.replace(/\/\/.*$/gm, ''); 

    try {
        const parsed = JSON.parse(jsonString);
        intentStr = parsed.intent as UserIntent;
        targets = Array.isArray(parsed.targets) ? parsed.targets : [];
    } catch (e) {
        // 降级处理：如果不是 JSON，尝试直接提取意图
        console.warn('[IntentClassifier] Failed to parse JSON, falling back to regex. Raw text:', result);
        intentStr = result.trim().toUpperCase().replace(/[^A-Z_]/g, '') as UserIntent;
    }

    const latencyMs = Date.now() - startTime;

    console.log(`🤖 [IntentClassifier] DeepSeek response: ${intentStr} (${latencyMs}ms), Targets: ${targets.join(', ')}`);

    // 验证返回的意图是否有效
    if (Object.values(UserIntent).includes(intentStr)) {
      return { intent: intentStr, confidence: 0.9, latencyMs, source: 'deepseek', targets };
    }

    return { intent: UserIntent.UNKNOWN, confidence: 0.3, latencyMs, source: 'deepseek', targets: [] };
  } catch (error: any) {
    // 清除超时定时器（以防异常发生在 fetch 之前）
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    
    // 区分超时和其他错误
    if (error.name === 'AbortError') {
      console.warn(`[IntentClassifier] DeepSeek request aborted (timeout: ${timeoutMs}ms)`);
      return { intent: UserIntent.UNKNOWN, confidence: 0, latencyMs, source: 'timeout_fallback', targets: [] };
    }
    
    console.error('[IntentClassifier] DeepSeek classification failed:', error);
    return { intent: UserIntent.UNKNOWN, confidence: 0, latencyMs, source: 'timeout_fallback', targets: [] };
  }
}

/**
 * 使用 LLM 进行意图分类（通用接口，支持自定义 generateText）
 * 当本地分类置信度低时使用
 */
export async function classifyIntentWithLLM(
  query: string,
  generateText: (options: { model: string; prompt: string }) => Promise<string>
): Promise<{ intent: UserIntent; confidence: number }> {
  const prompt = `You are a code assistant router. Analyze the user's query and classify it into ONE of these categories:

CATEGORIES:
- UI_MODIFICATION: Changing colors, styles, layout, CSS, component visuals, themes
- LOGIC_FIX: Fixing bugs, changing data flow, algorithms, business logic, error handling
- CONFIG_HELP: Environment variables, package.json, build settings, deployment, installation
- NEW_FEATURE: Adding completely new screens, pages, components, or capabilities
- QA_EXPLANATION: Asking how code works, explaining concepts, documentation
- PERFORMANCE: Optimizing speed, reducing renders, caching, memory management
- REFACTOR: Restructuring code, extracting components, cleaning up
- DATA_OPERATION: Database queries, API calls, data fetching, mutations
- UNKNOWN: Cannot determine intent

User Query: "${query}"

Instructions:
1. Analyze the query carefully
2. Consider the primary action the user wants
3. Return ONLY the category name (e.g., "UI_MODIFICATION")

Category:`;

  try {
    const result = await generateText({ 
      model: 'gemini-1.5-flash', 
      prompt 
    });
    
    const intentStr = result.trim().toUpperCase().replace(/[^A-Z_]/g, '') as UserIntent;
    
    // 验证返回的意图是否有效
    if (Object.values(UserIntent).includes(intentStr)) {
      return { intent: intentStr, confidence: 0.85 };
    }
    
    return { intent: UserIntent.UNKNOWN, confidence: 0.3 };
  } catch (error) {
    console.error('[IntentClassifier] LLM classification failed:', error);
    return { intent: UserIntent.UNKNOWN, confidence: 0 };
  }
}

/**
 * 主分类函数 - 智能选择分类方式
 * 优先使用本地分类，置信度低时使用 DeepSeek API
 * 
 * 返回值包含 source 字段，用于追踪分类来源：
 * - 'local': 本地规则分类
 * - 'deepseek': DeepSeek API 分类
 * - 'timeout_fallback': DeepSeek 超时后的降级
 */
export async function classifyUserIntent(
  query: string,
  options?: {
    useLLM?: boolean;
    useDeepSeek?: boolean;
    llmThreshold?: number;
    generateText?: (options: { model: string; prompt: string }) => Promise<string>;
    deepSeekConfig?: DeepSeekConfig;
  }
): Promise<SearchStrategy & { source: 'local' | 'deepseek' | 'timeout_fallback'; latencyMs: number; targets?: string[] }> {
  const startTime = Date.now();
  const { 
    useLLM = false,
    useDeepSeek = true, // 默认启用 DeepSeek
    llmThreshold = 0.6,
    generateText,
    deepSeekConfig
  } = options || {};

  // Step 1: 先尝试本地分类
  let { intent, confidence } = classifyIntentLocal(query);
  let source: 'local' | 'deepseek' | 'timeout_fallback' = 'local';
  let targets: string[] = [];

  console.log(`🧠 [IntentClassifier] Local classification: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%)`);

  // Step 2: 如果置信度低，使用 AI 增强
  if (confidence < llmThreshold) {
    // 优先使用 DeepSeek（性价比高，中文理解好）
    if (useDeepSeek) {
      console.log(`🤖 [IntentClassifier] Low confidence, using DeepSeek API...`);
      const deepSeekResult = await classifyIntentWithDeepSeek(query, deepSeekConfig);
      
      if (deepSeekResult.confidence > confidence) {
        intent = deepSeekResult.intent;
        confidence = deepSeekResult.confidence;
        source = deepSeekResult.source;
        targets = deepSeekResult.targets;
        console.log(`🎯 [IntentClassifier] DeepSeek override: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%, source: ${source}, targets: ${targets.join(', ')})`);
      }
    }
    // 备用：使用自定义 LLM
    else if (useLLM && generateText) {
      console.log(`🤖 [IntentClassifier] Low confidence, using custom LLM...`);
      const llmResult = await classifyIntentWithLLM(query, generateText);
      
      if (llmResult.confidence > confidence) {
        intent = llmResult.intent;
        confidence = llmResult.confidence;
        source = 'local'; // Custom LLM 算作 local
        console.log(`🎯 [IntentClassifier] LLM override: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%)`);
      }
    }
  }

  const latencyMs = Date.now() - startTime;

  // Step 3: 根据意图构建搜索策略
  const strategy = buildSearchStrategy(intent, confidence);
  return { ...strategy, source, latencyMs, targets };
}

/**
 * 根据意图构建搜索策略
 */
export function buildSearchStrategy(intent: UserIntent, confidence: number): SearchStrategy {
  const baseStrategy: SearchStrategy = {
    intent,
    fileExtensions: EXTENSION_MAP[intent] || [],
    topK: 5,
    useSemanticSearch: true,
    useKeywordSearch: true,
    priorityPatterns: PRIORITY_PATTERNS[intent] || [],
    excludePatterns: EXCLUDE_PATTERNS[intent] || [],
    confidence
  };

  // 根据意图调整策略
  switch (intent) {
    case UserIntent.UI_MODIFICATION:
      return {
        ...baseStrategy,
        topK: 5,
        // UI 修改通常需要精确匹配组件名
        useKeywordSearch: true
      };

    case UserIntent.LOGIC_FIX:
      return {
        ...baseStrategy,
        topK: 8,
        // 逻辑问题通常需要更多上下文
        useSemanticSearch: true
      };

    case UserIntent.CONFIG_HELP:
      return {
        ...baseStrategy,
        topK: 3,
        // 配置通常靠精确文件名匹配
        useSemanticSearch: false,
        useKeywordSearch: true
      };

    case UserIntent.NEW_FEATURE:
      return {
        ...baseStrategy,
        topK: 6,
        // 新功能需要了解现有架构
        useSemanticSearch: true
      };

    case UserIntent.QA_EXPLANATION:
      return {
        ...baseStrategy,
        topK: 4,
        // 解释性问题可能需要更广泛的上下文
        useSemanticSearch: true
      };

    case UserIntent.PERFORMANCE:
      return {
        ...baseStrategy,
        topK: 6,
        // 性能问题需要分析多个相关组件
        useSemanticSearch: true
      };

    case UserIntent.REFACTOR:
      return {
        ...baseStrategy,
        topK: 8,
        // 重构需要理解完整的代码结构
        useSemanticSearch: true
      };

    case UserIntent.DATA_OPERATION:
      return {
        ...baseStrategy,
        topK: 5,
        // 数据操作通常涉及特定的 API/数据库文件
        useKeywordSearch: true
      };

    default:
      return {
        ...baseStrategy,
        topK: 5,
        fileExtensions: [], // 不限制文件类型
        useSemanticSearch: true,
        useKeywordSearch: true
      };
  }
}

/**
 * 根据策略过滤文件列表
 */
export function filterFilesByStrategy(
  files: string[],
  strategy: SearchStrategy
): string[] {
  return files.filter(file => {
    // 检查排除模式
    for (const pattern of strategy.excludePatterns) {
      if (file.includes(pattern) || matchGlob(file, pattern)) {
        return false;
      }
    }

    // 如果没有指定扩展名限制，允许所有文件
    if (strategy.fileExtensions.length === 0) {
      return true;
    }

    // 检查文件扩展名
    return strategy.fileExtensions.some(ext => file.endsWith(ext));
  });
}

/**
 * 根据策略对文件进行优先级排序
 */
export function prioritizeFilesByStrategy(
  files: string[],
  strategy: SearchStrategy
): string[] {
  return files.sort((a, b) => {
    const aScore = calculatePriorityScore(a, strategy);
    const bScore = calculatePriorityScore(b, strategy);
    return bScore - aScore; // 高分在前
  });
}

function calculatePriorityScore(file: string, strategy: SearchStrategy): number {
  let score = 0;

  // 优先目录匹配
  for (const pattern of strategy.priorityPatterns) {
    if (file.includes(pattern)) {
      score += 10;
    }
  }

  // 扩展名匹配
  if (strategy.fileExtensions.some(ext => file.endsWith(ext))) {
    score += 5;
  }

  return score;
}

/**
 * 简单的 glob 匹配
 */
function matchGlob(path: string, pattern: string): boolean {
  // 简单实现：支持 * 和 **
  const regex = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\./g, '\\.');
  
  return new RegExp(regex).test(path);
}
