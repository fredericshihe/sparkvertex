/**
 * 用户意图分类器 - RAG 系统的"大脑前额叶"
 * 在执行繁重的向量搜索之前，先快速判断用户想干什么
 */

import { getSystemPromptCache, logCacheStats } from './prompt-cache';
import { queryTextCache, storeTextCache, SemanticCacheResult } from './advanced-rag';

export enum UserIntent {
  UI_MODIFICATION = 'UI_MODIFICATION',    // 改颜色、布局、样式
  LOGIC_FIX = 'LOGIC_FIX',                // 改 Bug、业务逻辑
  CONFIG_HELP = 'CONFIG_HELP',            // 环境变量、配置、启动问题
  NEW_FEATURE = 'NEW_FEATURE',            // 新增功能
  QA_EXPLANATION = 'QA_EXPLANATION',      // 解释代码、问答
  PERFORMANCE = 'PERFORMANCE',            // 性能优化
  REFACTOR = 'REFACTOR',                  // 代码重构
  DATA_OPERATION = 'DATA_OPERATION',      // 数据库、API、数据操作
  BACKEND_SETUP = 'BACKEND_SETUP',        // 🆕 后端配置 (Supabase/数据库/认证)
  GLOBAL_REVIEW = 'GLOBAL_REVIEW',        // 🆕 全局代码审查
  // =========== Local-First 架构新增 ===========
  LOCAL_DB_APP = 'LOCAL_DB_APP',          // 🆕 本地数据库应用 (PGLite/IndexedDB) - 数据主权模式
  CMS_APP = 'CMS_APP',                    // 🆕 CMS/内容发布类应用
  FORM_COLLECTION = 'FORM_COLLECTION',    // 🆕 表单收集/问卷类应用 (云端信箱)
  OFFLINE_FIRST = 'OFFLINE_FIRST',        // 🆕 离线优先应用
  FILE_UPLOAD_APP = 'FILE_UPLOAD_APP',    // 🆕 文件上传类应用
  UNKNOWN = 'UNKNOWN'
}

/**
 * 🚨 紧急兜底函数：从文本中提取 PascalCase 组件名
 * 当 DeepSeek 没有正确输出 JSON 时，从 Reasoning 文本中提取文件名
 * 
 * 匹配规则：
 * - PascalCase 单词 (e.g., MapScreen, BattleScene, App)
 * - SCREAMING_CASE 常量 (e.g., MAP_GRID, GAME_CONFIG)
 * - 排除常见的非组件词 (e.g., Component, Screen, View 单独出现)
 */
function extractFileNamesFromText(text: string): string[] {
  const fileNames = new Set<string>();
  
  // 匹配 PascalCase (至少两个大写字母开头的单词)
  // e.g., MapScreen, BattleScene, PlayerStats, App
  const pascalCaseRegex = /\b([A-Z][a-z]+(?:[A-Z][a-z]*)+)\b/g;
  let match;
  while ((match = pascalCaseRegex.exec(text)) !== null) {
    const name = match[1];
    // 排除一些通用词
    if (!['Component', 'Screen', 'View', 'Page', 'Modal', 'Context', 'Provider', 'Hook', 'Function', 'Method', 'Class', 'Type', 'Interface', 'Props', 'State', 'Effect', 'Callback', 'Memo', 'Reducer', 'Action', 'Dispatch'].includes(name)) {
      fileNames.add(name);
    }
  }
  
  // 匹配 SCREAMING_CASE 常量 (用于 Data 文件)
  // e.g., MAP_GRID, GAME_CONFIG, PLAYER_DATA
  const screamingCaseRegex = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
  while ((match = screamingCaseRegex.exec(text)) !== null) {
    fileNames.add(match[1]);
  }
  
  // 匹配简单的单词 + "Screen" / "Scene" / "Component" 组合
  // e.g., "Map Screen" -> MapScreen
  const compoundRegex = /\b([A-Z][a-z]+)\s+(Screen|Scene|Component|Page|Modal|View)\b/g;
  while ((match = compoundRegex.exec(text)) !== null) {
    fileNames.add(match[1] + match[2]);
  }
  
  // 匹配中文后的组件名 (e.g., "检查 App 组件" -> App)
  const chineseContextRegex = /[\u4e00-\u9fa5]\s*([A-Z][a-zA-Z]+)\s*[\u4e00-\u9fa5]?/g;
  while ((match = chineseContextRegex.exec(text)) !== null) {
    const name = match[1];
    if (name.length >= 3) { // 至少3个字符
      fileNames.add(name);
    }
  }
  
  return Array.from(fileNames);
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
         '异常', '不对', '逻辑', '判断', '条件', '循环', '函数', '方法',
         // 🆕 运行时错误和数据获取失败
         '看不到', '不显示', '没有数据', '获取失败', '加载失败', '请求失败',
         '实时', '更新失败', '无法获取', '空白', '消失', '丢失', '缺失',
         // 🆕 API 和网络相关
         '接口', '请求', '返回', '响应', '超时', '网络', '代理', '跨域'],
    en: ['fix', 'bug', 'error', 'issue', 'broken', 'fail', 'crash', 'exception',
         'wrong', 'logic', 'condition', 'loop', 'function', 'method', 'debug',
         'undefined', 'null', 'NaN', 'TypeError', 'ReferenceError',
         // 🆕 Runtime errors and data fetching failures
         'not showing', 'not working', 'not loading', 'not updating', 'not fetching',
         'missing', 'empty', 'blank', 'disappeared', 'lost', 'cannot see', 'can\'t see',
         'no data', 'fetch failed', 'request failed', 'realtime', 'real-time', 'live',
         // 🆕 API and network related (HIGH WEIGHT for confidence boost)
         'api', 'fetch', 'request', 'response', 'axios', 'http', 'https', 'endpoint',
         'cors', 'proxy', 'timeout', 'network', 'loading', 'async', 'await', 'promise'],
    weight: 1.5  // 🔧 Increased to 1.5 for stronger LOGIC_FIX detection
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
         '增删改查', 'CRUD', '存储', '获取', '加载', '同步', '上传', '下载'],
    en: ['database', 'query', 'api', 'endpoint', 'request', 'data', 'table',
         'field', 'crud', 'storage', 'fetch', 'post', 'get', 'supabase',
         'prisma', 'sql', 'mutation', 'axios', 'load', 'sync', 'upload', 'download'],
    weight: 1.2 // Increased from 1.0 to prioritize data operations over UI
  },
  [UserIntent.BACKEND_SETUP]: {
    zh: ['后端', '数据库', '用户登录', '用户注册', '认证', '鉴权', '存数据',
         '保存数据', '持久化', '会员', '积分系统', '订阅', '支付', '数据表',
         '建表', '存储', '账号', '密码', '登录注册'],
    en: ['backend', 'database', 'auth', 'authentication', 'login', 'signup',
         'register', 'persist', 'save data', 'store data', 'membership',
         'subscription', 'payment', 'table', 'schema', 'supabase', 'firebase',
         'user account', 'password', 'session', 'jwt', 'api key'],
    weight: 1.3  // 高权重，优先检测后端需求
  },
  [UserIntent.UNKNOWN]: {
    zh: [],
    en: [],
    weight: 0.5
  },
  [UserIntent.GLOBAL_REVIEW]: {
    zh: ['检查', '全部', '审查', '全局', '整体', '所有文件', '完整检查'],
    en: ['review', 'all', 'check', 'global', 'entire', 'whole', 'full'],
    weight: 1.3
  },
  // =========== Local-First 架构新增意图 ===========
  [UserIntent.LOCAL_DB_APP]: {
    zh: ['本地数据库', '离线存储', '本地存储', 'PGLite', 'IndexedDB', '浏览器数据库',
         '本地优先', '离线数据', '数据持久化', '本地缓存', 'OPFS', '客户端数据库',
         '数据不上传', '数据主权', '隐私', '断网可用', '断网', '无网络',
         '记账', '记账本', '账本', '个人财务', '密码管理', '密码本', '日记', '笔记',
         '库存管理', '进销存', '仓库', '收银', 'POS', '门店', '店铺管理',
         '客户管理', 'CRM', '通讯录', '名单管理', '会员管理', '私域',
         '健康记录', '体重记录', '运动记录', '饮食记录', '私人数据'],
    en: ['local database', 'offline storage', 'local storage', 'pglite', 'indexeddb',
         'browser database', 'local first', 'offline data', 'persist', 'opfs',
         'client side database', 'wasm database', 'sqlite', 'dexie',
         'data sovereignty', 'privacy', 'works offline', 'no upload', 'offline capable',
         'accounting', 'personal finance', 'expense tracker', 'budget', 'password manager',
         'diary', 'journal', 'notes', 'inventory', 'pos', 'stock management', 'warehouse',
         'crm', 'customer management', 'contact list', 'member management',
         'health tracker', 'weight tracker', 'fitness log', 'private data'],
    weight: 1.5  // 提高权重，确保这些场景被优先识别
  },
  [UserIntent.CMS_APP]: {
    zh: ['内容管理', 'CMS', '博客', '文章发布', '内容发布', '发布系统', '静态网站',
         '页面发布', '内容展示', '公开内容', '版本管理', '发布历史'],
    en: ['cms', 'content management', 'blog', 'publish', 'article', 'static site',
         'content publish', 'page publish', 'public content', 'version history',
         'rollback', 'cdn', 'headless cms'],
    weight: 1.3
  },
  [UserIntent.FORM_COLLECTION]: {
    zh: ['表单', '问卷', '收集数据', '用户提交', '反馈收集', '信息收集', '报名',
         '调查', '投票', '预约', '订单', '申请', '注册表单', '上门服务', '服务预约',
         '宠物服务', '家政服务', '美容预约', '医疗预约', '维修预约', '咨询表单',
         '联系表单', '留言', '反馈', '客户信息', '预订', '点餐', '下单', '购物车'],
    en: ['form', 'survey', 'collect', 'submission', 'feedback', 'questionnaire',
         'registration', 'inquiry', 'booking', 'order', 'application', 'signup form',
         'contact form', 'lead generation', 'appointment', 'reservation', 'schedule',
         'service request', 'pet service', 'home service', 'beauty appointment',
         'medical booking', 'repair request', 'customer info', 'checkout', 'cart'],
    weight: 1.4  // 提高权重确保优先识别
  },
  [UserIntent.OFFLINE_FIRST]: {
    zh: ['离线', '断网', '无网络', '离线优先', '网络恢复', '同步', '冲突解决',
         'PWA', '渐进式', '后台同步', '消息队列'],
    en: ['offline', 'offline first', 'network', 'sync', 'synchronize', 'conflict',
         'pwa', 'progressive', 'background sync', 'queue', 'reconnect'],
    weight: 1.2
  },
  [UserIntent.FILE_UPLOAD_APP]: {
    zh: ['文件上传', '图片上传', '附件', '文件管理', '图片压缩', '加密上传',
         '分片上传', '大文件', '拖拽上传', '媒体文件', '文档管理'],
    en: ['file upload', 'image upload', 'attachment', 'file manager', 'compress',
         'encrypt upload', 'chunked upload', 'large file', 'drag drop', 'media',
         'document manager', 'storage', 'bucket'],
    weight: 1.2
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
  [UserIntent.BACKEND_SETUP]: ['.ts', '.tsx', '.js', '.sql'],
  [UserIntent.UNKNOWN]: [],
  [UserIntent.GLOBAL_REVIEW]: ['.ts', '.tsx', '.js', '.jsx', '.css', '.json'],
  // =========== Local-First 架构新增 ===========
  [UserIntent.LOCAL_DB_APP]: ['.ts', '.tsx', '.js', '.jsx', '.sql'],
  [UserIntent.CMS_APP]: ['.ts', '.tsx', '.js', '.jsx', '.html', '.md'],
  [UserIntent.FORM_COLLECTION]: ['.ts', '.tsx', '.js', '.jsx'],
  [UserIntent.OFFLINE_FIRST]: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  [UserIntent.FILE_UPLOAD_APP]: ['.ts', '.tsx', '.js', '.jsx']
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
  [UserIntent.BACKEND_SETUP]: ['lib/', 'app/api/', 'supabase/', 'services/'],
  [UserIntent.UNKNOWN]: [],
  [UserIntent.GLOBAL_REVIEW]: ['components/', 'lib/', 'app/', 'hooks/', 'context/'],
  // =========== Local-First 架构新增 ===========
  [UserIntent.LOCAL_DB_APP]: ['lib/', 'lib/templates/', 'hooks/', 'components/'],
  [UserIntent.CMS_APP]: ['lib/', 'lib/templates/', 'app/api/cms/', 'components/'],
  [UserIntent.FORM_COLLECTION]: ['lib/', 'lib/templates/', 'app/api/mailbox/', 'components/'],
  [UserIntent.OFFLINE_FIRST]: ['lib/', 'lib/templates/', 'hooks/', 'public/'],
  [UserIntent.FILE_UPLOAD_APP]: ['lib/', 'lib/templates/', 'app/api/mailbox/', 'components/']
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
  [UserIntent.BACKEND_SETUP]: ['node_modules/', '.git/', 'components/', 'styles/'],
  [UserIntent.UNKNOWN]: ['node_modules/', '.git/'],
  [UserIntent.GLOBAL_REVIEW]: ['node_modules/', '.git/', 'dist/', 'build/'],
  // =========== Local-First 架构新增 ===========
  [UserIntent.LOCAL_DB_APP]: ['node_modules/', '.git/', 'dist/', 'build/'],
  [UserIntent.CMS_APP]: ['node_modules/', '.git/', 'dist/', 'build/'],
  [UserIntent.FORM_COLLECTION]: ['node_modules/', '.git/', 'dist/', 'build/'],
  [UserIntent.OFFLINE_FIRST]: ['node_modules/', '.git/', 'dist/', 'build/'],
  [UserIntent.FILE_UPLOAD_APP]: ['node_modules/', '.git/', 'dist/', 'build/']
};

// =========== 🆕 Few-Shot 模式匹配 - 高置信度快速通道 ===========
// 这些模式几乎 100% 确定意图，直接返回高置信度，跳过 DeepSeek 调用
const FEW_SHOT_PATTERNS: Array<{
  pattern: RegExp;
  intent: UserIntent;
  confidence: number; // 0.65-0.9, must be > 0.6 to skip DeepSeek
}> = [
  // ========== LOGIC_FIX (Bug/Error patterns) - 最常见 ==========
  { pattern: /看不到.*(数据|价格|内容|信息|结果|列表|图片)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  { pattern: /.*(数据|价格|内容|信息|结果).*(不显示|不出来|消失|丢失)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  { pattern: /(无法|不能|没办法).*(获取|加载|请求|显示|登录|注册)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  { pattern: /(报错|出错|错误|异常|崩溃|白屏|卡死)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.80 },
  { pattern: /(修复|修一下|修改|fix|bug|debug)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.75 },
  { pattern: /not (showing|working|loading|displaying|updating|fetching)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  { pattern: /(can'?t|cannot|couldn'?t|won'?t|doesn'?t) (see|get|fetch|load|work|display)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  { pattern: /(no|missing|empty|blank|undefined|null) (data|results?|content|response|value)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.80 },
  { pattern: /(error|exception|failed|failure|crash|broken)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.75 },
  { pattern: /(api|fetch|request|axios).*(fail|error|timeout|cors)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  { pattern: /(cors|跨域|代理|proxy).*(问题|错误|失败)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  { pattern: /(实时|realtime|real-time|live).*(不|no|not|fail)/i, intent: UserIntent.LOGIC_FIX, confidence: 0.85 },
  
  // ========== UI_MODIFICATION (Style patterns) ==========
  { pattern: /(改|换|调整|修改).*(颜色|字体|样式|布局|间距|大小|位置)/i, intent: UserIntent.UI_MODIFICATION, confidence: 0.80 },
  { pattern: /(change|modify|adjust|update).*(color|font|style|layout|spacing|size)/i, intent: UserIntent.UI_MODIFICATION, confidence: 0.80 },
  { pattern: /把.*(改成|换成|调成).*(红|蓝|绿|黑|白|大|小)/i, intent: UserIntent.UI_MODIFICATION, confidence: 0.85 },
  { pattern: /(好看|美化|优化.*界面|ui.*优化)/i, intent: UserIntent.UI_MODIFICATION, confidence: 0.75 },
  { pattern: /(tailwind|css|scss|styled|className).*(add|change|修改)/i, intent: UserIntent.UI_MODIFICATION, confidence: 0.80 },
  
  // ========== DATA_OPERATION (Database/API patterns) ==========
  { pattern: /(数据库|database|supabase|prisma|sql).*(查询|插入|更新|删除|query|insert|update|delete)/i, intent: UserIntent.DATA_OPERATION, confidence: 0.85 },
  { pattern: /(增|删|改|查|crud)/i, intent: UserIntent.DATA_OPERATION, confidence: 0.70 },
  { pattern: /(存|读|写).*(数据|记录|信息)/i, intent: UserIntent.DATA_OPERATION, confidence: 0.75 },
  { pattern: /(api|接口).*(调用|请求|返回)/i, intent: UserIntent.DATA_OPERATION, confidence: 0.75 },
  
  // ========== NEW_FEATURE (Add feature patterns) ==========
  { pattern: /(添加|新增|加个|实现|开发).*(功能|页面|组件|按钮|模块)/i, intent: UserIntent.NEW_FEATURE, confidence: 0.80 },
  { pattern: /(add|create|implement|build|make).*(feature|page|component|button|module)/i, intent: UserIntent.NEW_FEATURE, confidence: 0.80 },
  { pattern: /我想要.*(功能|页面|效果)/i, intent: UserIntent.NEW_FEATURE, confidence: 0.75 },
  
  // ========== CONFIG_HELP (Setup/Config patterns) ==========
  { pattern: /(环境|配置|安装|部署|启动).*(变量|问题|失败|报错)/i, intent: UserIntent.CONFIG_HELP, confidence: 0.80 },
  { pattern: /(npm|yarn|pnpm).*(install|error|fail)/i, intent: UserIntent.CONFIG_HELP, confidence: 0.80 },
  { pattern: /(\.env|next\.config|package\.json|tsconfig)/i, intent: UserIntent.CONFIG_HELP, confidence: 0.75 },
  { pattern: /(vercel|docker|deploy|部署)/i, intent: UserIntent.CONFIG_HELP, confidence: 0.75 },
  
  // ========== PERFORMANCE (Optimization patterns) ==========
  { pattern: /(性能|优化|慢|卡|加速|缓存)/i, intent: UserIntent.PERFORMANCE, confidence: 0.75 },
  { pattern: /(slow|fast|speed|performance|optimize|cache|memo)/i, intent: UserIntent.PERFORMANCE, confidence: 0.75 },
  
  // ========== BACKEND_SETUP (Auth/Backend patterns) ==========
  { pattern: /(用户|登录|注册|认证|鉴权|会员)/i, intent: UserIntent.BACKEND_SETUP, confidence: 0.70 },
  { pattern: /(auth|login|signup|register|authentication)/i, intent: UserIntent.BACKEND_SETUP, confidence: 0.75 },
  { pattern: /(supabase|firebase).*(配置|设置|初始化)/i, intent: UserIntent.BACKEND_SETUP, confidence: 0.80 },
];

/**
 * 本地快速意图分类（无需 LLM）
 * 🔧 优化策略：
 * 1. Few-Shot 模式匹配 - 高置信度快速通道，跳过 DeepSeek
 * 2. 关键词匹配 - 多维度评分
 * 3. 后处理规则 - 修正常见误分类
 * 4. 置信度增强 - 单一意图匹配时提高置信度
 */
export function classifyIntentLocal(query: string): { intent: UserIntent; confidence: number } {
  const queryLower = query.toLowerCase();
  
  // ========== Phase 1: Few-Shot 模式匹配（高置信度快速通道）==========
  for (const { pattern, intent, confidence } of FEW_SHOT_PATTERNS) {
    if (pattern.test(query) || pattern.test(queryLower)) {
      console.log(`[LocalIntent] ⚡ Few-Shot match: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%)`);
      return { intent, confidence };
    }
  }
  
  // ========== Phase 2: 关键词匹配评分 ==========
  const scores: Map<UserIntent, number> = new Map();
  const matchDetails: Map<UserIntent, string[]> = new Map(); // 调试用

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const { zh, en, weight } = keywords;
    let score = 0;
    let matchCount = 0;
    const matches: string[] = [];

    // 中文关键词匹配
    for (const kw of zh) {
      if (query.includes(kw)) {
        score += weight;
        matchCount++;
        matches.push(kw);
      }
    }

    // 英文关键词匹配
    for (const kw of en) {
      if (queryLower.includes(kw.toLowerCase())) {
        score += weight;
        matchCount++;
        matches.push(kw);
      }
    }

    // 🔧 改进的分数计算：使用更陡峭的对数曲线
    if (matchCount > 0) {
      // 基础分 = 权重 * 匹配数的对数
      // 增加匹配数奖励：每多匹配一个关键词，额外 +0.5 权重
      const matchBonus = Math.min(matchCount * 0.5, 3); // 最多 +3 奖励
      scores.set(intent as UserIntent, score * Math.log2(matchCount + 1) + matchBonus);
      matchDetails.set(intent as UserIntent, matches);
    }
  }

  // ========== Phase 3: 后处理规则修正 ==========
  // Rule 1: Bug 模式检测 - 强制提升 LOGIC_FIX
  const bugPatterns = [
    /看不到.*(数据|价格|内容|信息|结果)/,
    /.*(数据|价格|内容|信息|结果).*不显示/,
    /.*(数据|价格|内容|信息|结果).*消失/,
    /无法获取/,
    /获取失败/,
    /加载失败/,
    /请求失败/,
    /not (showing|displaying|loading|updating|working)/i,
    /(can't|cannot|couldn't) (see|get|fetch|load)/i,
    /no (data|results|content|response)/i
  ];
  
  const isBugReport = bugPatterns.some(pattern => pattern.test(query));
  
  if (isBugReport) {
    const currentUIScore = scores.get(UserIntent.UI_MODIFICATION) || 0;
    const currentLogicScore = scores.get(UserIntent.LOGIC_FIX) || 0;
    
    // If currently classified as UI but matches bug patterns, boost LOGIC_FIX
    if (currentUIScore > currentLogicScore) {
      scores.set(UserIntent.LOGIC_FIX, currentLogicScore + currentUIScore * 2.0);
      console.log(`[LocalIntent] 🔧 Bug pattern detected, boosting LOGIC_FIX score`);
    } else {
      // 即使 LOGIC_FIX 已经是最高分，也额外增加置信度
      scores.set(UserIntent.LOGIC_FIX, currentLogicScore * 1.5 + 2);
    }
  }

  // ========== Phase 4: 计算最终结果 ==========
  let bestIntent = UserIntent.UNKNOWN;
  let bestScore = 0;
  let secondBestScore = 0;

  scores.forEach((score, intent) => {
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestIntent = intent;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  });

  // 🔧 改进的置信度计算
  const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
  let confidence = totalScore > 0 ? bestScore / totalScore : 0;
  
  // 置信度增强策略：
  // 1. 如果最高分显著高于第二高分（>2倍），提升置信度
  // 2. 如果只有一个意图匹配，大幅提升置信度
  const scoreRatio = secondBestScore > 0 ? bestScore / secondBestScore : 10;
  const matchingIntents = scores.size;
  
  if (matchingIntents === 1) {
    // 单一意图匹配 - 高置信度
    confidence = Math.min(confidence + 0.3, 0.85);
    console.log(`[LocalIntent] 📊 Single intent match, boosted confidence to ${(confidence * 100).toFixed(1)}%`);
  } else if (scoreRatio >= 2.0) {
    // 最高分是第二高分的 2 倍以上 - 中等提升
    confidence = Math.min(confidence + 0.15, 0.80);
    console.log(`[LocalIntent] 📊 Clear winner (ratio=${scoreRatio.toFixed(1)}), boosted confidence to ${(confidence * 100).toFixed(1)}%`);
  } else if (scoreRatio >= 1.5) {
    // 最高分是第二高分的 1.5 倍以上 - 轻微提升
    confidence = Math.min(confidence + 0.08, 0.75);
  }
  
  // 调试输出
  if (matchDetails.size > 0) {
    const detailStr = Array.from(matchDetails.entries())
      .map(([intent, matches]) => `${intent}:[${matches.slice(0, 3).join(',')}${matches.length > 3 ? '...' : ''}]`)
      .join(' | ');
    console.log(`[LocalIntent] 🔍 Keyword matches: ${detailStr}`);
  }

  return { intent: bestIntent, confidence };
}

/**
 * 生成文件摘要，用于提示 LLM 文件之间的依赖关系
 * 通用设计：适用于任何 JS/TS 项目
 */
export function generateFileSummary(filename: string, code: string): string {
  const summaryParts: string[] = [];

  // --- 1. 提取 Import 依赖 (最关键) ---
  const importRegex = /(?:import\s+.*?from\s+|require\(\s*)['"]([^'"]+)['"]/g;
  const imports = new Set<string>();
  
  // 只扫描前 3000 个字符 (通常 import 都在头部)
  const headCode = code.slice(0, 3000);
  let match;
  
  while ((match = importRegex.exec(headCode)) !== null) {
    // 清理路径，只保留文件名关键部分
    const cleanName = match[1].split('/').pop()?.replace(/\.(js|ts|tsx|jsx)$/, '');
    if (cleanName && cleanName !== filename.split('.')[0] && !cleanName.startsWith('@')) {
      imports.add(cleanName);
    }
  }
  
  // 只取前 5 个 import，避免 Prompt 太长
  const importList = Array.from(imports).slice(0, 5);
  if (importList.length > 0) {
    summaryParts.push(`Imports:[${importList.join(',')}${imports.size > 5 ? '...' : ''}]`);
  }

  // --- 2. 猜测文件类型 ---
  if (code.includes('return <') || code.includes('return (') && code.includes('<')) {
    summaryParts.push("UI");
  } else if (code.match(/export\s+(const|let)\s+[A-Z][A-Z0-9_]*\s*=\s*(\[|\{)/)) {
    summaryParts.push("Data");
  } else if (code.includes('navigation') || code.includes('Navigator') || code.includes('router')) {
    summaryParts.push("Router");
  } else if (code.includes('useEffect') || code.includes('useState') || code.includes('useMemo')) {
    summaryParts.push("Hook");
  }

  // --- 3. 检测导出内容 ---
  const exportMatch = code.match(/export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/);
  if (exportMatch) {
    summaryParts.push(`Exports:${exportMatch[1]}`);
  }

  // 格式: "MapScreen (UI|Imports:[BattleScene,BagScreen])"
  const extraInfo = summaryParts.length > 0 ? ` (${summaryParts.join('|')})` : '';
  return `${filename}${extraInfo}`;
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
  fileSummaries?: string[]; // 🆕 文件摘要列表，用于依赖提示
  fileTree?: string;        // 🆕 完整文件树字符串
  forceDeepSeek?: boolean;  // 🆕 强制使用 DeepSeek，跳过本地分类
}

// 默认超时时间：60秒 (DeepSeek V3/R1 推理时间可能较长，尤其是大型项目)
const DEFAULT_DEEPSEEK_TIMEOUT = 60000;

/**
 * 使用 DeepSeek API 进行意图分类（通过 Supabase Edge Function）
 * 性价比高，速度快，中文理解能力强
 * API Key 存储在 Edge Function Secrets 中，前端不需要暴露
 * 
 * ⚠️ 超时降级：如果 DeepSeek 在 timeoutMs 内未响应，自动降级为 UNKNOWN
 * 
 * @param query 用户查询
 * @param config DeepSeek 配置
 * @param fileSummaries 可选：文件摘要列表（用于依赖提示）
 */
export async function classifyIntentWithDeepSeek(
  query: string,
  config?: DeepSeekConfig,
  fileSummariesArg?: string[]
): Promise<{ intent: UserIntent; confidence: number; latencyMs: number; source: 'deepseek' | 'gemini_fallback' | 'timeout_fallback'; targets: string[]; referenceTargets: string[]; reasoning?: string }> {
  const startTime = Date.now();
  const {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    authToken,
    temperature = 0.3,
    timeoutMs = DEFAULT_DEEPSEEK_TIMEOUT,
    fileSummaries: fileSummariesFromConfig,
    fileTree
  } = config || {};

  // 支持从参数或 config 中获取 fileSummaries
  const fileSummaries = fileSummariesArg || fileSummariesFromConfig;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[IntentClassifier] Missing Supabase config');
    return { intent: UserIntent.UNKNOWN, confidence: 0, latencyMs: Date.now() - startTime, source: 'timeout_fallback', targets: [], referenceTargets: [] };
  }

  // 🆕 预处理 Query：如果包含完整代码上下文，必须截断，否则 DeepSeek 会被淹没
  // 这里的 Query 可能是 "dbPrompt"，包含了 # EXISTING CODE ... # USER REQUEST ...
  let processedQuery = query;
  const userRequestMarker = '# USER REQUEST';
  const markerIndex = query.lastIndexOf(userRequestMarker);
  
  if (markerIndex !== -1) {
      // 提取 # USER REQUEST 之后的内容
      const extracted = query.substring(markerIndex + userRequestMarker.length).trim();
      if (extracted.length > 0) {
          processedQuery = extracted;
          console.log('[IntentClassifier] Extracted user request from full context prompt');
      }
  } else {
      // 兜底：如果太长且没有标记，只取最后 2000 字符
      const MAX_QUERY_LENGTH = 2000;
      if (query.length > MAX_QUERY_LENGTH) {
          processedQuery = query.slice(-MAX_QUERY_LENGTH);
          console.log('[IntentClassifier] Truncated long query to last 2000 chars');
      }
  }

  // 🚀 Semantic Cache：查询文本缓存（基于 n-gram 相似度）
  // 如果用户换个说法问同一个问题，可以直接复用之前的结果
  const cachedResult = queryTextCache(processedQuery);
  if (cachedResult) {
      const latencyMs = Date.now() - startTime;
      console.log(`[IntentClassifier] 🚀 TextCache HIT! Saved DeepSeek call (${latencyMs}ms)`);
      return {
          intent: cachedResult.intent as UserIntent,
          confidence: cachedResult.confidence,
          latencyMs,
          source: 'deepseek', // 标记为 deepseek 因为结果来自之前的 DeepSeek 调用
          targets: cachedResult.targetFiles,
          referenceTargets: cachedResult.referenceFiles,
          reasoning: cachedResult.reasoning || '智能匹配历史分析结果'
      };
  }

  // 🆕 优先使用文件树，否则使用文件摘要
  // 限制上下文大小以避免 DeepSeek 超时
  let contextSection = '';
  const MAX_CONTEXT_LENGTH = 3000; // 限制上下文长度
  
  if (fileTree) {
    // 如果文件树太长，截断但保留结构
    let truncatedTree = fileTree;
    if (fileTree.length > MAX_CONTEXT_LENGTH) {
        // 保留前 2500 字符 + 提示还有更多
        truncatedTree = fileTree.slice(0, MAX_CONTEXT_LENGTH - 100) + '\n... (truncated, more components exist)';
        console.log(`[IntentClassifier] Truncated fileTree from ${fileTree.length} to ${MAX_CONTEXT_LENGTH} chars`);
    }
    contextSection = `\n\n📁 Project Architecture:\n\`\`\`\n${truncatedTree}\n\`\`\``;
  } else if (fileSummaries && fileSummaries.length > 0) {
    // 限制文件摘要数量
    const limitedSummaries = fileSummaries.slice(0, 20);
    contextSection = `\n\n可用文件 (${fileSummaries.length} total, showing top 20):\n${limitedSummaries.join('\n')}`;
  }

  // 🧠 架构师模式 Prompt：深度分析依赖关系
  const systemPrompt = `# Role: Senior Software Architect & Code Navigator

You are an expert at analyzing codebases. Your task is to precisely identify which files need to be **modified** vs **read-only** for the user's request.
${contextSection}

## 🎯 CORE MISSION
Analyze the user's request and the file tree to determine:
1. **files_to_edit**: Files that MUST be modified to fulfill the request
2. **files_to_read**: Files needed for context/reference only (interfaces, types, data)

## ⚠️ CRITICAL RULES

### 🚫 Style File Exclusion
- **NEVER** include CSS/SCSS/style files unless user explicitly mentions "style", "CSS", "color", "theme"
- For bug reports → Look at Logic/State files, NOT style files
- For "not showing" issues → Check data flow, NOT styling

### 🔗 Dependency Chain Rules
1. **Navigation Rule**: Modifying navigation/tabs/menu? → MUST include App/Navigator/Router component (usually the root component that renders navigation)
2. **Delete Feature Rule**: Deleting a feature/tab/menu item? → Include the parent component that renders it
3. **Parent-Child Rule**: Modifying component props? → Check parent components
4. **Data Flow Rule**: Changing data structure? → Check all consumers
5. **Import Rule**: Adding new imports? → Verify export exists

### 🔍 Look for Feature Markers
When analyzing the Architecture Summary, pay attention to component features:
- <Navigation> = This component handles navigation/tabs/menu
- <Router> = This component handles routing/screens
- <renders:X,Y,Z> = This component renders X, Y, Z as children

### 📊 Prioritization
- **RECALL > PRECISION**: Better to include an unnecessary file than miss a critical one
- When uncertain → Put in files_to_edit (safer)
- files_to_read = purely informational (types, constants, interfaces)

## 📝 OUTPUT FORMAT
**Output ONLY valid JSON. No explanations outside JSON. Start with \`{\`**
**IMPORTANT: The "reasoning" field MUST be in Chinese (中文).**

\`\`\`json
{
  "reasoning": "用中文简要分析：用户想要做什么，需要修改哪些文件，为什么...",
  "intent": "LOGIC_FIX | UI_MODIFICATION | NEW_FEATURE | DATA_OPERATION | CONFIG_HELP | PERFORMANCE | REFACTOR | QA_EXPLANATION | UNKNOWN",
  "files_to_edit": ["ComponentA", "ComponentB"],
  "files_to_read": ["TypeDefinitions", "Constants"]
}
\`\`\`

## 🏷️ Intent Categories
- **LOGIC_FIX**: Bug fixes, algorithm errors, data flow issues, "not working/showing" problems
- **UI_MODIFICATION**: Styling, colors, layout, CSS, visual changes
- **NEW_FEATURE**: Adding new pages, components, features
- **DATA_OPERATION**: Database queries, API calls, data structure changes
- **CONFIG_HELP**: Environment, build, deployment issues
- **PERFORMANCE**: Speed, caching, optimization
- **REFACTOR**: Code cleanup, restructuring`;

  // 🚀 L1 缓存：系统提示词缓存
  // 只缓存静态部分，contextSection 是动态的
  const staticSystemPromptPart = systemPrompt.split(contextSection)[0] || systemPrompt;
  const l1Cache = getSystemPromptCache('intent_classifier', staticSystemPromptPart);
  const cacheHit = l1Cache.hitCount > 1;
  
  if (cacheHit) {
    console.log(`[IntentClassifier] 🚀 L1 Cache hit! Saved ~${l1Cache.tokenCount} tokens`);
  }

  const userPrompt = `User Request: "${processedQuery}"

Analyze this request and return the JSON response.`;

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

    // Retry logic for DeepSeek API
    let response;
    let retries = 3;
    while (retries > 0) {
        try {
            response = await fetch(`${supabaseUrl}/functions/v1/deepseek-chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    system_prompt: systemPrompt,
                    user_prompt: userPrompt,
                    temperature,
                    max_tokens: 5000,
                    stream: false
                }),
                signal: controller.signal
            });
            if (response.ok) break;
            console.warn(`[IntentClassifier] DeepSeek fetch failed with status ${response.status}, retrying... (${retries} left)`);
        } catch (e: any) {
            // Don't retry on abort (timeout)
            if (e.name === 'AbortError') throw e;
            console.warn(`[IntentClassifier] DeepSeek fetch error: ${e.message}, retrying... (${retries} left)`);
        }
        retries--;
        if (retries > 0) await new Promise(r => setTimeout(r, 1000));
    }

    // Clear timeout if successful or retries exhausted
    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'Network error after retries';
      console.error('[IntentClassifier] DeepSeek Edge Function error:', errorText);
      return { intent: UserIntent.UNKNOWN, confidence: 0, latencyMs: Date.now() - startTime, source: 'timeout_fallback', targets: [], referenceTargets: [] };
    }

    // 处理非流式响应
    const data = await response.json();
    
    // 🆕 检测是否使用了 Gemini fallback
    const usedGeminiFallback = data._source === 'gemini-fallback';
    if (usedGeminiFallback) {
      console.log('[IntentClassifier] 🔄 DeepSeek failed, used Gemini 2.5 Flash fallback');
    }
    
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
    let referenceTargets: string[] = [];
    let reasoning: string | undefined;
    
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
        // 支持新旧两种格式
        const rawTargets = Array.isArray(parsed.files_to_edit) ? parsed.files_to_edit : (Array.isArray(parsed.targets) ? parsed.targets : []);
        const rawReferenceTargets = Array.isArray(parsed.files_to_read) ? parsed.files_to_read : [];
        
        // 🧹 清洗文件名：移除中文备注、括号内容等
        const cleanFileName = (name: string): string => {
          return name
            .replace(/[（(][^）)]*[）)]/g, '') // 移除中英文括号及其内容
            .replace(/[\u4e00-\u9fa5]/g, '') // 移除所有中文字符
            .replace(/\s+/g, '') // 移除空格
            .trim();
        };
        
        targets = rawTargets.map(cleanFileName).filter(Boolean);
        referenceTargets = rawReferenceTargets.map(cleanFileName).filter(Boolean);
        
        // 提取 reasoning（思维链输出）
        reasoning = parsed.reasoning;
        
        // 🚨 兜底提取：如果 files_to_edit 为空，尝试从 reasoning 中提取文件名
        if (targets.length === 0 && reasoning) {
          const extractedFromReasoning = extractFileNamesFromText(reasoning);
          if (extractedFromReasoning.length > 0) {
            console.warn(`⚠️ [IntentClassifier] files_to_edit was empty, extracted ${extractedFromReasoning.length} files from reasoning: [${extractedFromReasoning.join(', ')}]`);
            targets = extractedFromReasoning;
          }
        }
    } catch (e) {
        // 降级处理：如果不是 JSON，尝试直接提取意图
        console.warn('[IntentClassifier] Failed to parse JSON, falling back to regex. Raw text:', result.substring(0, 500));
        
        // 尝试提取意图
        const intentMatch = result.match(/(?:"intent"\s*:\s*"?|intent:\s*)([A-Z_]+)/i);
        if (intentMatch) {
          intentStr = intentMatch[1].toUpperCase() as UserIntent;
        }
        
        // 🚨 关键兆底：从Reasoning文本中提取PascalCase组件名
        const extractedFiles = extractFileNamesFromText(result);
        if (extractedFiles.length > 0) {
          console.warn(`⚠️ [IntentClassifier] Extracted ${extractedFiles.length} files from raw text: [${extractedFiles.join(', ')}]`);
          targets = extractedFiles;
        }
        
        // 提取reasoning（如果有 REASONING 标记）
        // 使用 [\s\S] 代替 . 配合 s 标志，兼容 ES5+
        const reasoningMatch = result.match(/REASONING[:\s]*([\s\S]*?)(?=FILES_TO_|\n\n|$)/i);
        if (reasoningMatch) {
          reasoning = reasoningMatch[1].trim();
        } else {
          reasoning = result; // 整个输出都当作 reasoning
        }
    }

    const latencyMs = Date.now() - startTime;

    console.log(`🤖 [IntentClassifier] DeepSeek response: ${intentStr} (${latencyMs}ms)`);
    if (reasoning) {
      console.log(`   💭 Reasoning: ${reasoning.substring(0, 100)}${reasoning.length > 100 ? '...' : ''}`);
    }
    console.log(`   📝 files_to_edit: [${targets.join(', ')}]`);
    console.log(`   📖 files_to_read: [${referenceTargets.join(', ')}]`);

    // 验证返回的意图是否有效
    if (Object.values(UserIntent).includes(intentStr)) {
      // 🚨 最终防线：如果意图是修改类，但 files_to_edit 为空
      // 这通常意味着 DeepSeek 抽风了，或者解析失败了。
      // 我们不能让它返回空列表，否则会导致所有文件被骨架化。
      if ((intentStr === UserIntent.UI_MODIFICATION || intentStr === UserIntent.LOGIC_FIX || intentStr === UserIntent.NEW_FEATURE) && targets.length === 0) {
          console.warn("⚠️ [IntentClassifier] Modification intent detected but files_to_edit is empty! Activating FAIL-SAFE mode.");
          // 在这里我们无法知道哪些文件是相关的，所以我们只能依赖上层 (CodeRAG) 来处理这种情况。
          // 但我们可以标记一个特殊的 flag 或者在 reasoning 里说明。
          if (!reasoning) reasoning = "FAIL-SAFE: Empty edit list detected.";
      }

      // 🚀 存储到语义缓存（只缓存有效且有目标文件的结果）
      if (targets.length > 0 || referenceTargets.length > 0) {
          storeTextCache(processedQuery, {
              intent: intentStr,
              targetFiles: targets,
              referenceFiles: referenceTargets,
              confidence: 0.9
          });
      }

      return { intent: intentStr, confidence: 0.9, latencyMs, source: usedGeminiFallback ? 'gemini_fallback' : 'deepseek', targets, referenceTargets, reasoning };
    }

    return { intent: UserIntent.UNKNOWN, confidence: 0.3, latencyMs, source: usedGeminiFallback ? 'gemini_fallback' : 'deepseek', targets: [], referenceTargets: [] };
  } catch (error: any) {
    // 清除超时定时器（以防异常发生在 fetch 之前）
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    
    // 区分超时和其他错误
    if (error.name === 'AbortError') {
      console.warn(`[IntentClassifier] DeepSeek request aborted (timeout: ${timeoutMs}ms)`);
      
      // 🆘 紧急兆底：使用本地分类器 + 从 Prompt 提取文件名
      const localResult = classifyIntentLocal(query);
      const extractedFiles = extractFileNamesFromText(query);
      
      console.warn(`[IntentClassifier] 🆘 PANIC FALLBACK: Using local classifier (${localResult.intent}, conf=${localResult.confidence.toFixed(2)}) + extracted files: [${extractedFiles.join(', ')}]`);
      
      return { 
        intent: localResult.intent, 
        confidence: localResult.confidence * 0.5, // 降低置信度表示不确定
        latencyMs, 
        source: 'timeout_fallback', 
        targets: extractedFiles,  // 🆕 传递提取到的文件名
        referenceTargets: [] 
      };
    }
    
    console.error('[IntentClassifier] DeepSeek classification failed:', error);
    
    // 🆘 同样的兆底逻辑
    const localResult = classifyIntentLocal(query);
    const extractedFiles = extractFileNamesFromText(query);
    
    return { 
      intent: localResult.intent, 
      confidence: localResult.confidence * 0.5,
      latencyMs, 
      source: 'timeout_fallback', 
      targets: extractedFiles,
      referenceTargets: [] 
    };
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
 * 
 * 🆕 支持两种模式：
 * - 默认模式：先本地分类，置信度低时使用 DeepSeek API
 * - forceDeepSeek 模式：跳过本地分类，直接使用 DeepSeek（推荐用于生产环境）
 * 
 * 返回值包含 source 字段，用于追踪分类来源：
 * - 'local': 本地规则分类
 * - 'deepseek': DeepSeek API 分类
 * - 'gemini_fallback': DeepSeek 失败后使用 Gemini 2.5 Flash
 * - 'timeout_fallback': 所有 API 都失败后的本地降级
 */
export async function classifyUserIntent(
  query: string,
  options?: {
    useLLM?: boolean;
    useDeepSeek?: boolean;
    forceDeepSeek?: boolean;  // 🆕 强制使用 DeepSeek，跳过本地分类
    llmThreshold?: number;
    generateText?: (options: { model: string; prompt: string }) => Promise<string>;
    deepSeekConfig?: DeepSeekConfig;
    fileSummaries?: string[]; // 文件摘要，用于依赖提示
    fileTree?: string;        // 🆕 完整文件树（推荐）
  }
): Promise<SearchStrategy & { source: 'local' | 'deepseek' | 'gemini_fallback' | 'timeout_fallback'; latencyMs: number; targets?: string[]; referenceTargets?: string[]; reasoning?: string }> {
  const startTime = Date.now();
  const { 
    useLLM = false,
    useDeepSeek = true,
    forceDeepSeek = false,  // 🆕 默认关闭，保持向后兼容
    llmThreshold = 0.6,
    generateText,
    deepSeekConfig,
    fileSummaries,
    fileTree
  } = options || {};

  let intent: UserIntent;
  let confidence: number;
  let source: 'local' | 'deepseek' | 'gemini_fallback' | 'timeout_fallback' = 'local';
  let targets: string[] = [];
  let referenceTargets: string[] = [];
  let reasoning: string | undefined;

  // 🆕 DeepSeek Only 模式：跳过本地分类，直接调用 DeepSeek
  if (forceDeepSeek && useDeepSeek) {
    console.log(`🤖 [IntentClassifier] Force DeepSeek mode: Analyzing with file tree...`);
    
    // 合并配置，添加文件树支持
    const mergedConfig: DeepSeekConfig = {
      ...deepSeekConfig,
      fileSummaries: fileSummaries || deepSeekConfig?.fileSummaries,
      fileTree: fileTree || deepSeekConfig?.fileTree,
      forceDeepSeek: true
    };
    
    const deepSeekResult = await classifyIntentWithDeepSeek(query, mergedConfig);
    
    intent = deepSeekResult.intent;
    confidence = deepSeekResult.confidence;
    source = deepSeekResult.source;
    targets = deepSeekResult.targets;
    referenceTargets = deepSeekResult.referenceTargets;
    reasoning = deepSeekResult.reasoning;
    
    console.log(`🎯 [IntentClassifier] DeepSeek result: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%, source: ${source})`);
    console.log(`   📝 files_to_edit: [${targets.join(', ')}]`);
    console.log(`   📖 files_to_read: [${referenceTargets.join(', ')}]`);
    if (reasoning) {
      console.log(`   💭 Reasoning: ${reasoning.substring(0, 200)}${reasoning.length > 200 ? '...' : ''}`);
    }
    
    const latencyMs = Date.now() - startTime;
    const strategy = buildSearchStrategy(intent, confidence);
    return { ...strategy, source, latencyMs, targets, referenceTargets, reasoning };
  }

  // 默认模式：先本地分类
  const localResult = classifyIntentLocal(query);
  intent = localResult.intent;
  confidence = localResult.confidence;

  console.log(`🧠 [IntentClassifier] Local classification: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%)`);

  // 如果置信度低，使用 AI 增强
  if (confidence < llmThreshold) {
    // 优先使用 DeepSeek（性价比高，中文理解好）
    if (useDeepSeek) {
      console.log(`🤖 [IntentClassifier] Low confidence, using DeepSeek API...`);
      // 合并 fileSummaries 和 fileTree 到 deepSeekConfig
      const mergedConfig: DeepSeekConfig = {
        ...deepSeekConfig,
        fileSummaries: fileSummaries || deepSeekConfig?.fileSummaries,
        fileTree: fileTree || deepSeekConfig?.fileTree
      };
      const deepSeekResult = await classifyIntentWithDeepSeek(query, mergedConfig);
      
      if (deepSeekResult.confidence > confidence) {
        intent = deepSeekResult.intent;
        confidence = deepSeekResult.confidence;
        source = deepSeekResult.source;
        targets = deepSeekResult.targets;
        referenceTargets = deepSeekResult.referenceTargets;
        reasoning = deepSeekResult.reasoning;
        console.log(`🎯 [IntentClassifier] DeepSeek override: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%, source: ${source})`);
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

  // 根据意图构建搜索策略
  const strategy = buildSearchStrategy(intent, confidence);
  return { ...strategy, source, latencyMs, targets, referenceTargets, reasoning };
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
