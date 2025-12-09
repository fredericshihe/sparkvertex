/**
 * Supabase Schema Generator - 自然语言驱动的数据库结构生成
 * 
 * 核心功能：
 * 1. 分析用户需求，推导数据库 Schema
 * 2. 生成 Supabase SQL 迁移脚本
 * 3. 生成前端 Supabase SDK 调用代码
 * 4. 提供 RLS (Row Level Security) 策略
 */

export interface SchemaTable {
  name: string;
  description: string;
  columns: SchemaColumn[];
  rls_policies: RLSPolicy[];
  indexes: string[];
}

export interface SchemaColumn {
  name: string;
  type: string; // PostgreSQL 类型
  nullable: boolean;
  default?: string;
  references?: string; // e.g., "auth.users(id)"
  unique?: boolean;
  primary?: boolean;
}

export interface RLSPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using?: string;  // FOR SELECT, UPDATE, DELETE
  check?: string;  // FOR INSERT, UPDATE
}

export interface GeneratedSchema {
  tables: SchemaTable[];
  sql: string;
  frontendCode: string;
  setupInstructions: string[];
}

/**
 * 预设的常用业务模式 Schema 模板
 */
export const SCHEMA_TEMPLATES: Record<string, SchemaTable[]> = {
  // 待办事项应用
  'todo': [{
    name: 'todos',
    description: '待办事项表',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
      { name: 'title', type: 'text', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'completed', type: 'boolean', nullable: false, default: 'false' },
      { name: 'due_date', type: 'timestamptz', nullable: true },
      { name: 'priority', type: 'int', nullable: false, default: '0' },
      { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', nullable: false, default: 'now()' },
    ],
    rls_policies: [
      { name: 'Users can view own todos', operation: 'SELECT', using: 'auth.uid() = user_id' },
      { name: 'Users can create own todos', operation: 'INSERT', check: 'auth.uid() = user_id' },
      { name: 'Users can update own todos', operation: 'UPDATE', using: 'auth.uid() = user_id' },
      { name: 'Users can delete own todos', operation: 'DELETE', using: 'auth.uid() = user_id' },
    ],
    indexes: ['user_id', 'due_date', 'completed'],
  }],

  // 博客/内容管理
  'blog': [
    {
      name: 'posts',
      description: '文章表',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
        { name: 'author_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false, unique: true },
        { name: 'content', type: 'text', nullable: true },
        { name: 'excerpt', type: 'text', nullable: true },
        { name: 'cover_image', type: 'text', nullable: true },
        { name: 'published', type: 'boolean', nullable: false, default: 'false' },
        { name: 'published_at', type: 'timestamptz', nullable: true },
        { name: 'view_count', type: 'int', nullable: false, default: '0' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rls_policies: [
        { name: 'Anyone can view published posts', operation: 'SELECT', using: 'published = true OR auth.uid() = author_id' },
        { name: 'Authors can create posts', operation: 'INSERT', check: 'auth.uid() = author_id' },
        { name: 'Authors can update own posts', operation: 'UPDATE', using: 'auth.uid() = author_id' },
        { name: 'Authors can delete own posts', operation: 'DELETE', using: 'auth.uid() = author_id' },
      ],
      indexes: ['author_id', 'slug', 'published', 'published_at'],
    },
    {
      name: 'comments',
      description: '评论表',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
        { name: 'post_id', type: 'uuid', nullable: false, references: 'posts(id) ON DELETE CASCADE' },
        { name: 'user_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'content', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rls_policies: [
        { name: 'Anyone can view comments', operation: 'SELECT', using: 'true' },
        { name: 'Authenticated users can comment', operation: 'INSERT', check: 'auth.uid() = user_id' },
        { name: 'Users can delete own comments', operation: 'DELETE', using: 'auth.uid() = user_id' },
      ],
      indexes: ['post_id', 'user_id'],
    }
  ],

  // 电商/商品
  'ecommerce': [
    {
      name: 'products',
      description: '商品表',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
        { name: 'seller_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'price', type: 'numeric(10,2)', nullable: false },
        { name: 'stock', type: 'int', nullable: false, default: '0' },
        { name: 'category', type: 'text', nullable: true },
        { name: 'images', type: 'jsonb', nullable: false, default: "'[]'::jsonb" },
        { name: 'active', type: 'boolean', nullable: false, default: 'true' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rls_policies: [
        { name: 'Anyone can view active products', operation: 'SELECT', using: 'active = true OR auth.uid() = seller_id' },
        { name: 'Sellers can create products', operation: 'INSERT', check: 'auth.uid() = seller_id' },
        { name: 'Sellers can update own products', operation: 'UPDATE', using: 'auth.uid() = seller_id' },
      ],
      indexes: ['seller_id', 'category', 'price', 'active'],
    },
    {
      name: 'cart_items',
      description: '购物车表',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'product_id', type: 'uuid', nullable: false, references: 'products(id) ON DELETE CASCADE' },
        { name: 'quantity', type: 'int', nullable: false, default: '1' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rls_policies: [
        { name: 'Users can view own cart', operation: 'SELECT', using: 'auth.uid() = user_id' },
        { name: 'Users can add to cart', operation: 'INSERT', check: 'auth.uid() = user_id' },
        { name: 'Users can update cart', operation: 'UPDATE', using: 'auth.uid() = user_id' },
        { name: 'Users can remove from cart', operation: 'DELETE', using: 'auth.uid() = user_id' },
      ],
      indexes: ['user_id', 'product_id'],
    },
    {
      name: 'orders',
      description: '订单表',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
        { name: 'buyer_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'total_amount', type: 'numeric(10,2)', nullable: false },
        { name: 'status', type: 'text', nullable: false, default: "'pending'" },
        { name: 'shipping_address', type: 'jsonb', nullable: true },
        { name: 'items', type: 'jsonb', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rls_policies: [
        { name: 'Users can view own orders', operation: 'SELECT', using: 'auth.uid() = buyer_id' },
        { name: 'Users can create orders', operation: 'INSERT', check: 'auth.uid() = buyer_id' },
      ],
      indexes: ['buyer_id', 'status', 'created_at'],
    }
  ],

  // 积分系统
  'points': [{
    name: 'user_points',
    description: '用户积分表',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE', unique: true },
      { name: 'balance', type: 'int', nullable: false, default: '0' },
      { name: 'total_earned', type: 'int', nullable: false, default: '0' },
      { name: 'total_spent', type: 'int', nullable: false, default: '0' },
      { name: 'updated_at', type: 'timestamptz', nullable: false, default: 'now()' },
    ],
    rls_policies: [
      { name: 'Users can view own points', operation: 'SELECT', using: 'auth.uid() = user_id' },
    ],
    indexes: ['user_id'],
  }, {
    name: 'point_transactions',
    description: '积分交易记录表',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
      { name: 'amount', type: 'int', nullable: false },
      { name: 'type', type: 'text', nullable: false }, // 'earn', 'spend', 'bonus'
      { name: 'description', type: 'text', nullable: true },
      { name: 'reference_id', type: 'uuid', nullable: true },
      { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
    ],
    rls_policies: [
      { name: 'Users can view own transactions', operation: 'SELECT', using: 'auth.uid() = user_id' },
    ],
    indexes: ['user_id', 'type', 'created_at'],
  }],

  // 社交功能 (关注/点赞)
  'social': [
    {
      name: 'follows',
      description: '关注关系表',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
        { name: 'follower_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'following_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rls_policies: [
        { name: 'Anyone can view follows', operation: 'SELECT', using: 'true' },
        { name: 'Users can follow', operation: 'INSERT', check: 'auth.uid() = follower_id' },
        { name: 'Users can unfollow', operation: 'DELETE', using: 'auth.uid() = follower_id' },
      ],
      indexes: ['follower_id', 'following_id'],
    },
    {
      name: 'likes',
      description: '点赞表',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
        { name: 'target_type', type: 'text', nullable: false }, // 'post', 'comment', 'product'
        { name: 'target_id', type: 'uuid', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rls_policies: [
        { name: 'Anyone can view likes', operation: 'SELECT', using: 'true' },
        { name: 'Users can like', operation: 'INSERT', check: 'auth.uid() = user_id' },
        { name: 'Users can unlike', operation: 'DELETE', using: 'auth.uid() = user_id' },
      ],
      indexes: ['user_id', 'target_type', 'target_id'],
    }
  ],

  // 消息/通知
  'notifications': [{
    name: 'notifications',
    description: '通知表',
    columns: [
      { name: 'id', type: 'uuid', nullable: false, primary: true, default: 'gen_random_uuid()' },
      { name: 'user_id', type: 'uuid', nullable: false, references: 'auth.users(id) ON DELETE CASCADE' },
      { name: 'type', type: 'text', nullable: false },
      { name: 'title', type: 'text', nullable: false },
      { name: 'content', type: 'text', nullable: true },
      { name: 'data', type: 'jsonb', nullable: false, default: "'{}'::jsonb" },
      { name: 'read', type: 'boolean', nullable: false, default: 'false' },
      { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
    ],
    rls_policies: [
      { name: 'Users can view own notifications', operation: 'SELECT', using: 'auth.uid() = user_id' },
      { name: 'Users can mark as read', operation: 'UPDATE', using: 'auth.uid() = user_id' },
      { name: 'Users can delete notifications', operation: 'DELETE', using: 'auth.uid() = user_id' },
    ],
    indexes: ['user_id', 'read', 'created_at'],
  }],
};

/**
 * 从自然语言检测需要的 Schema 类型
 */
export function detectSchemaTypes(userPrompt: string): string[] {
  const prompt = userPrompt.toLowerCase();
  const detected: string[] = [];

  // 关键词映射
  const keywords: Record<string, string[]> = {
    'todo': ['待办', 'todo', 'task', '任务', '清单', 'checklist'],
    'blog': ['博客', 'blog', '文章', 'post', '内容', 'cms', '评论', 'comment'],
    'ecommerce': ['商品', 'product', '购物车', 'cart', '订单', 'order', '电商', 'shop', '商店', '购买'],
    'points': ['积分', 'points', 'credits', '余额', 'balance', '奖励', 'reward'],
    'social': ['关注', 'follow', '点赞', 'like', '收藏', 'favorite', '社交'],
    'notifications': ['通知', 'notification', '消息', 'message', '提醒', 'alert'],
  };

  for (const [type, words] of Object.entries(keywords)) {
    if (words.some(w => prompt.includes(w))) {
      detected.push(type);
    }
  }

  return detected.length > 0 ? detected : ['todo']; // 默认返回 todo
}

/**
 * 生成 SQL 建表语句
 */
export function generateTableSQL(table: SchemaTable): string {
  const lines: string[] = [];
  
  lines.push(`-- ${table.description}`);
  lines.push(`CREATE TABLE IF NOT EXISTS ${table.name} (`);
  
  const columnDefs = table.columns.map(col => {
    let def = `  ${col.name} ${col.type}`;
    if (col.primary) def += ' PRIMARY KEY';
    if (!col.nullable) def += ' NOT NULL';
    if (col.unique) def += ' UNIQUE';
    if (col.default) def += ` DEFAULT ${col.default}`;
    if (col.references) def += ` REFERENCES ${col.references}`;
    return def;
  });
  
  lines.push(columnDefs.join(',\n'));
  lines.push(');');
  lines.push('');
  
  // Enable RLS
  lines.push(`ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`);
  lines.push('');
  
  // RLS Policies
  for (const policy of table.rls_policies) {
    lines.push(`CREATE POLICY "${policy.name}" ON ${table.name}`);
    lines.push(`  FOR ${policy.operation}`);
    if (policy.using) lines.push(`  USING (${policy.using})`);
    if (policy.check) lines.push(`  WITH CHECK (${policy.check})`);
    lines.push(';');
  }
  lines.push('');
  
  // Indexes
  for (const indexCol of table.indexes) {
    lines.push(`CREATE INDEX IF NOT EXISTS idx_${table.name}_${indexCol} ON ${table.name}(${indexCol});`);
  }
  lines.push('');
  
  return lines.join('\n');
}

/**
 * 生成前端 Supabase 调用代码
 */
export function generateFrontendCode(tables: SchemaTable[]): string {
  const code: string[] = [];
  
  code.push(`// Supabase Client Setup`);
  code.push(`// 在你的 Supabase 项目中获取这些值：Settings -> API`);
  code.push(`const SUPABASE_URL = 'YOUR_SUPABASE_URL';`);
  code.push(`const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';`);
  code.push('');
  code.push(`// 创建 Supabase 客户端`);
  code.push(`const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);`);
  code.push('');
  
  code.push(`// ========== 数据操作函数 ==========`);
  code.push('');
  
  for (const table of tables) {
    const tableName = table.name;
    const pascalName = tableName.charAt(0).toUpperCase() + tableName.slice(1);
    
    code.push(`// ----- ${table.description} (${tableName}) -----`);
    code.push('');
    
    // 查询全部
    code.push(`async function get${pascalName}() {`);
    code.push(`  const { data, error } = await supabase`);
    code.push(`    .from('${tableName}')`);
    code.push(`    .select('*')`);
    code.push(`    .order('created_at', { ascending: false });`);
    code.push(`  if (error) throw error;`);
    code.push(`  return data;`);
    code.push(`}`);
    code.push('');
    
    // 查询单条
    code.push(`async function get${pascalName}ById(id) {`);
    code.push(`  const { data, error } = await supabase`);
    code.push(`    .from('${tableName}')`);
    code.push(`    .select('*')`);
    code.push(`    .eq('id', id)`);
    code.push(`    .single();`);
    code.push(`  if (error) throw error;`);
    code.push(`  return data;`);
    code.push(`}`);
    code.push('');
    
    // 创建
    const insertCols = table.columns.filter(c => 
      !c.primary && c.name !== 'created_at' && c.name !== 'updated_at' && !c.default?.includes('auth.uid')
    );
    code.push(`async function create${pascalName}(data) {`);
    code.push(`  // data 对象应包含: ${insertCols.map(c => c.name).join(', ')}`);
    code.push(`  const { data: result, error } = await supabase`);
    code.push(`    .from('${tableName}')`);
    code.push(`    .insert(data)`);
    code.push(`    .select()`);
    code.push(`    .single();`);
    code.push(`  if (error) throw error;`);
    code.push(`  return result;`);
    code.push(`}`);
    code.push('');
    
    // 更新
    code.push(`async function update${pascalName}(id, updates) {`);
    code.push(`  const { data, error } = await supabase`);
    code.push(`    .from('${tableName}')`);
    code.push(`    .update(updates)`);
    code.push(`    .eq('id', id)`);
    code.push(`    .select()`);
    code.push(`    .single();`);
    code.push(`  if (error) throw error;`);
    code.push(`  return data;`);
    code.push(`}`);
    code.push('');
    
    // 删除
    code.push(`async function delete${pascalName}(id) {`);
    code.push(`  const { error } = await supabase`);
    code.push(`    .from('${tableName}')`);
    code.push(`    .delete()`);
    code.push(`    .eq('id', id);`);
    code.push(`  if (error) throw error;`);
    code.push(`}`);
    code.push('');
  }
  
  // 认证相关代码
  code.push(`// ========== 用户认证 ==========`);
  code.push('');
  code.push(`async function signUp(email, password) {`);
  code.push(`  const { data, error } = await supabase.auth.signUp({ email, password });`);
  code.push(`  if (error) throw error;`);
  code.push(`  return data;`);
  code.push(`}`);
  code.push('');
  code.push(`async function signIn(email, password) {`);
  code.push(`  const { data, error } = await supabase.auth.signInWithPassword({ email, password });`);
  code.push(`  if (error) throw error;`);
  code.push(`  return data;`);
  code.push(`}`);
  code.push('');
  code.push(`async function signOut() {`);
  code.push(`  const { error } = await supabase.auth.signOut();`);
  code.push(`  if (error) throw error;`);
  code.push(`}`);
  code.push('');
  code.push(`async function getCurrentUser() {`);
  code.push(`  const { data: { user } } = await supabase.auth.getUser();`);
  code.push(`  return user;`);
  code.push(`}`);
  code.push('');
  
  return code.join('\n');
}

/**
 * 生成完整的 Schema 包
 */
export function generateSchema(userPrompt: string): GeneratedSchema {
  const schemaTypes = detectSchemaTypes(userPrompt);
  
  // 收集所有需要的表
  const allTables: SchemaTable[] = [];
  const seenTableNames = new Set<string>();
  
  for (const type of schemaTypes) {
    const templates = SCHEMA_TEMPLATES[type] || [];
    for (const table of templates) {
      if (!seenTableNames.has(table.name)) {
        allTables.push(table);
        seenTableNames.add(table.name);
      }
    }
  }
  
  // 生成 SQL
  const sqlParts: string[] = [
    '-- ========================================',
    '-- Auto-generated Supabase Schema',
    `-- Features: ${schemaTypes.join(', ')}`,
    `-- Generated at: ${new Date().toISOString()}`,
    '-- ========================================',
    '',
  ];
  
  for (const table of allTables) {
    sqlParts.push(generateTableSQL(table));
  }
  
  // 生成前端代码
  const frontendCode = generateFrontendCode(allTables);
  
  // 生成配置说明
  const setupInstructions = [
    '1. 登录 Supabase Dashboard (https://supabase.com/dashboard)',
    '2. 选择或创建项目',
    '3. 进入 SQL Editor',
    '4. 粘贴并执行上方的 SQL 代码',
    '5. 复制项目的 URL 和 anon key (Settings -> API)',
    '6. 替换前端代码中的 SUPABASE_URL 和 SUPABASE_ANON_KEY',
  ];
  
  return {
    tables: allTables,
    sql: sqlParts.join('\n'),
    frontendCode,
    setupInstructions,
  };
}

/**
 * 为 System Prompt 生成 Supabase 上下文
 */
export function getSupabaseContextForPrompt(userPrompt: string): string {
  const schema = generateSchema(userPrompt);
  
  if (schema.tables.length === 0) {
    return '';
  }
  
  return `
### Supabase Backend Integration
Based on your requirements, here's the recommended database schema and API code:

**Tables Needed:** ${schema.tables.map(t => t.name).join(', ')}

**Setup Instructions:**
${schema.setupInstructions.join('\n')}

**SQL Schema (run in Supabase SQL Editor):**
\`\`\`sql
${schema.sql}
\`\`\`

**Frontend Code (include in your app):**
\`\`\`javascript
${schema.frontendCode}
\`\`\`

**Important:**
- Include Supabase SDK: \`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\`
- Replace SUPABASE_URL and SUPABASE_ANON_KEY with your actual values
- All data operations are protected by Row Level Security (RLS)
`;
}
