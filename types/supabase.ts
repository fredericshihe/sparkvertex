export interface Item {
  id: string;
  created_at: string;
  title: string;
  description: string;
  user_id: string;
  author_id: string;
  file_url: string;
  price: number;
  currency: string;
  views: number; // Download count in original code
  page_views: number;
  likes: number;
  category: string;
  tags: string[];
  content?: string; // HTML content
  prompt?: string;
  author?: string; // Joined from profiles
  authorAvatar?: string; // Joined from profiles
  color?: string;
  downloads?: number;
  icon_url?: string;
  cover_url?: string; // 作品封面预览图
  is_public?: boolean;
  quality_score?: number;
  richness_score?: number;
  utility_score?: number;
  total_score?: number;
  daily_rank?: number;
  analysis_reason?: string;
  analysis_reason_en?: string;
  is_draft?: boolean;
  draft_data?: any;
  public_key?: string; // E2EE 公钥 (JWK JSON 字符串)
  compiled_content?: string; // 🚀 预编译的 JSX 内容（无需浏览器端 Babel）
}

export interface Order {
  id: string;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  item_id: number;
  price: number;
  status: string;
  remark?: string;
  amount: number;
}

export interface Feedback {
  id: string;
  user_id?: string;
  email: string;
  type: string;
  content: string;
  screenshot?: string;
  user_agent?: string;
  page_url?: string;
  created_at: string;
  status: string;
}

// ============================================
// Code RAG Types (Intent Classification & AST)
// ============================================

export enum UserIntent {
  UI_MODIFICATION = 'UI_MODIFICATION',
  LOGIC_FIX = 'LOGIC_FIX',
  CONFIG_HELP = 'CONFIG_HELP',
  NEW_FEATURE = 'NEW_FEATURE',
  QA_EXPLANATION = 'QA_EXPLANATION',
  PERFORMANCE = 'PERFORMANCE',
  REFACTOR = 'REFACTOR',
  DATA_OPERATION = 'DATA_OPERATION',
  UNKNOWN = 'UNKNOWN'
}

export interface SearchStrategy {
  intent: UserIntent;
  fileExtensions: string[];
  topK: number;
  useSemanticSearch: boolean;
  useKeywordSearch: boolean;
  priorityPatterns: string[];
  excludePatterns: string[];
  confidence: number;
}

export interface ImportInfo {
  moduleSpecifier: string;
  isTypeOnly: boolean;
  defaultImport?: string;
  namedImports: string[];
  namespaceImport?: string;
}

export interface DependencyAnalysis {
  imports: ImportInfo[];
  exports: ExportInfo[];
  valueDependencies: string[];
  typeDependencies: string[];
  localReferences: string[];
}

export interface ExportInfo {
  name: string;
  isDefault: boolean;
  isTypeOnly: boolean;
}
