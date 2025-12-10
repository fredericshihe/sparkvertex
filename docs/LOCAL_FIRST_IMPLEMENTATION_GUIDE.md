# 🔧 SparkVertex Local-First 实施指南

## 快速开始：第一个 Local-First 应用

本文档提供具体的代码实现细节，帮助你快速上手。

---

## 一、平台端改造

### 1.1 数据库迁移脚本

在 `supabase/migrations/` 目录创建新迁移文件：

```sql
-- 文件: supabase/migrations/20251210_local_first_system.sql

-- ============================================
-- 云端信箱系统
-- ============================================

-- 信箱消息表
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- 性能索引
CREATE INDEX IF NOT EXISTS idx_inbox_app_id ON inbox_messages(app_id);
CREATE INDEX IF NOT EXISTS idx_inbox_unprocessed ON inbox_messages(app_id, processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_inbox_expires ON inbox_messages(expires_at);

-- RLS 策略
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

-- 公开写入
DROP POLICY IF EXISTS "inbox_public_insert" ON inbox_messages;
CREATE POLICY "inbox_public_insert" ON inbox_messages
  FOR INSERT WITH CHECK (TRUE);

-- 拥有者读取 (app_id 格式: app_{user_id}_{item_id})
DROP POLICY IF EXISTS "inbox_owner_select" ON inbox_messages;
CREATE POLICY "inbox_owner_select" ON inbox_messages
  FOR SELECT USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

-- 拥有者删除/更新
DROP POLICY IF EXISTS "inbox_owner_delete" ON inbox_messages;
CREATE POLICY "inbox_owner_delete" ON inbox_messages
  FOR DELETE USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

DROP POLICY IF EXISTS "inbox_owner_update" ON inbox_messages;
CREATE POLICY "inbox_owner_update" ON inbox_messages
  FOR UPDATE USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

-- ============================================
-- 扩展 items 表
-- ============================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS app_manifest JSONB DEFAULT '{}';
ALTER TABLE items ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS has_backend BOOLEAN DEFAULT FALSE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS app_type TEXT DEFAULT 'static';

-- app_type: 'static' | 'form' | 'fullstack'

COMMENT ON COLUMN items.app_manifest IS 'Schema definition for local-first apps';
COMMENT ON COLUMN items.schema_version IS 'Current schema version number';
COMMENT ON COLUMN items.has_backend IS 'Whether app has backend/data collection';
COMMENT ON COLUMN items.public_key IS 'User public key for E2E encryption';
COMMENT ON COLUMN items.app_type IS 'Application type: static, form, fullstack';

-- ============================================
-- 清理函数
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_inbox_messages()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM inbox_messages WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 统计函数
-- ============================================

CREATE OR REPLACE FUNCTION get_inbox_stats(p_app_id TEXT)
RETURNS TABLE (
  total_messages BIGINT,
  unprocessed_messages BIGINT,
  oldest_message TIMESTAMPTZ,
  newest_message TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_messages,
    COUNT(*) FILTER (WHERE processed = FALSE)::BIGINT as unprocessed_messages,
    MIN(created_at) as oldest_message,
    MAX(created_at) as newest_message
  FROM inbox_messages
  WHERE app_id = p_app_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1.2 API 路由实现

**创建 `app/api/mailbox/submit/route.ts`:**

```typescript
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// 使用 Service Role 绕过 RLS (因为是公开写入)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 简单的内存限流 (生产环境应使用 Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 60; // 每分钟最多 60 次
const RATE_WINDOW = 60 * 1000; // 1 分钟

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

export async function POST(req: Request) {
  try {
    const headersList = headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    // 解析请求
    const body = await req.json();
    const { app_id, payload, metadata = {} } = body;
    
    // 基本验证
    if (!app_id || typeof app_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid app_id' },
        { status: 400 }
      );
    }
    
    if (!payload || typeof payload !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid payload' },
        { status: 400 }
      );
    }
    
    // app_id 格式验证: app_{uuid}_{uuid}
    const appIdPattern = /^app_[a-f0-9-]{36}_[a-f0-9-]{36}$/;
    if (!appIdPattern.test(app_id)) {
      return NextResponse.json(
        { error: 'Invalid app_id format' },
        { status: 400 }
      );
    }
    
    // payload 大小限制 (100KB)
    if (payload.length > 100 * 1024) {
      return NextResponse.json(
        { error: 'Payload too large (max 100KB)' },
        { status: 413 }
      );
    }
    
    // 限流检查
    const rateLimitKey = `mailbox:${app_id}:${ip}`;
    if (!checkRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    // 写入数据库
    const { data, error } = await supabase
      .from('inbox_messages')
      .insert({
        app_id,
        encrypted_payload: payload,
        metadata: {
          ...metadata,
          ip,
          user_agent: headersList.get('user-agent') || 'unknown',
          submitted_at: new Date().toISOString()
        }
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[Mailbox Submit Error]', error);
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message_id: data.id
    });
    
  } catch (error: any) {
    console.error('[Mailbox Submit Exception]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 处理 OPTIONS 请求 (CORS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

**创建 `app/api/mailbox/sync/route.ts`:**

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }
    
    // 解析参数
    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get('app_id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    
    if (!app_id) {
      return NextResponse.json(
        { error: 'Missing app_id parameter' },
        { status: 400 }
      );
    }
    
    // 验证用户是否拥有此应用
    const expectedPrefix = `app_${user.id}_`;
    if (!app_id.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: 'Access denied. You do not own this app.' },
        { status: 403 }
      );
    }
    
    // 获取未处理的消息
    const { data: messages, error } = await supabase
      .from('inbox_messages')
      .select('id, encrypted_payload, metadata, created_at')
      .eq('app_id', app_id)
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) {
      console.error('[Mailbox Sync Error]', error);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      );
    }
    
    // 获取统计信息
    const { data: stats } = await supabase
      .rpc('get_inbox_stats', { p_app_id: app_id });
    
    return NextResponse.json({
      messages: messages || [],
      stats: stats?.[0] || null,
      fetched_at: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[Mailbox Sync Exception]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**创建 `app/api/mailbox/ack/route.ts`:**

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证用户登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const body = await req.json();
    const { message_ids, action = 'mark_processed' } = body;
    
    // 支持单个 ID 或数组
    const ids = Array.isArray(message_ids) ? message_ids : [message_ids];
    
    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing message_ids' },
        { status: 400 }
      );
    }
    
    // 限制单次操作数量
    if (ids.length > 100) {
      return NextResponse.json(
        { error: 'Too many IDs (max 100)' },
        { status: 400 }
      );
    }
    
    let result;
    
    if (action === 'delete') {
      // 直接删除 (RLS 会确保只能删除自己的)
      const { error, count } = await supabase
        .from('inbox_messages')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
      result = { deleted: count };
      
    } else {
      // 标记为已处理
      const { error, count } = await supabase
        .from('inbox_messages')
        .update({ processed: true })
        .in('id', ids);
      
      if (error) throw error;
      result = { processed: count };
    }
    
    return NextResponse.json({
      success: true,
      ...result
    });
    
  } catch (error: any) {
    console.error('[Mailbox Ack Error]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## 二、代码生成模板

### 2.1 PGLite 集成模板

**创建 `lib/templates/pglite-bundle.ts`:**

```typescript
/**
 * PGLite 运行时模板
 * 这段代码会被注入到生成的 HTML 中
 */

export const PGLITE_RUNTIME = `
<!-- PGLite Runtime (Injected by SparkVertex) -->
<script type="module">
// ============================================
// SparkVertex Local Database Runtime
// Version: 1.0.0
// ============================================

const SPARK_CONFIG = {
  APP_ID: '{{APP_ID}}',
  API_BASE: '{{API_BASE}}',
  SCHEMA_VERSION: {{SCHEMA_VERSION}},
  MIGRATIONS: {{MIGRATIONS_JSON}}
};

// ---- PGLite Database ----
class SparkDB {
  constructor() {
    this.db = null;
    this.ready = false;
    this.error = null;
  }
  
  async init() {
    try {
      // 动态加载 PGLite
      const { PGlite } = await import('https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.0/dist/index.js');
      
      // 使用 OPFS (最佳性能) 或降级到 IndexedDB
      try {
        this.db = new PGlite('opfs://spark-' + SPARK_CONFIG.APP_ID);
      } catch (opfsError) {
        console.warn('OPFS not available, falling back to IndexedDB');
        this.db = new PGlite('idb://spark-' + SPARK_CONFIG.APP_ID);
      }
      
      // 初始化迁移表
      await this.db.query(\`
        CREATE TABLE IF NOT EXISTS _spark_meta (
          key TEXT PRIMARY KEY,
          value JSONB,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      \`);
      
      // 应用迁移
      await this.runMigrations();
      
      this.ready = true;
      console.log('🔮 SparkDB initialized');
      
      // 通知 UI
      window.dispatchEvent(new CustomEvent('spark-db-ready'));
      
      return true;
    } catch (e) {
      this.error = e;
      console.error('SparkDB init failed:', e);
      window.dispatchEvent(new CustomEvent('spark-db-error', { detail: e }));
      return false;
    }
  }
  
  async query(sql, params = []) {
    if (!this.ready) throw new Error('Database not initialized');
    return this.db.query(sql, params);
  }
  
  async runMigrations() {
    // 获取当前版本
    let currentVersion = 0;
    try {
      const result = await this.db.query(
        "SELECT value FROM _spark_meta WHERE key = 'schema_version'"
      );
      if (result.rows.length > 0) {
        currentVersion = result.rows[0].value.version || 0;
      }
    } catch (e) {
      // 表可能还不存在
    }
    
    console.log('Current schema version:', currentVersion);
    console.log('Target version:', SPARK_CONFIG.SCHEMA_VERSION);
    
    // 按顺序应用迁移
    for (const migration of SPARK_CONFIG.MIGRATIONS) {
      if (migration.version > currentVersion) {
        console.log('Applying migration v' + migration.version + '...');
        
        await this.db.query('BEGIN');
        try {
          await this.db.query(migration.sql);
          
          // 更新版本号
          await this.db.query(\`
            INSERT INTO _spark_meta (key, value) 
            VALUES ('schema_version', $1)
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
          \`, [JSON.stringify({ version: migration.version })]);
          
          await this.db.query('COMMIT');
          console.log('✅ Migration v' + migration.version + ' applied');
        } catch (e) {
          await this.db.query('ROLLBACK');
          console.error('❌ Migration v' + migration.version + ' failed:', e);
          throw e;
        }
      }
    }
  }
  
  async exportAll() {
    const tables = await this.db.query(\`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename NOT LIKE '_spark%'
    \`);
    
    const exportData = {};
    for (const { tablename } of tables.rows) {
      const data = await this.db.query('SELECT * FROM ' + tablename);
      exportData[tablename] = data.rows;
    }
    
    return {
      app_id: SPARK_CONFIG.APP_ID,
      version: SPARK_CONFIG.SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      tables: exportData
    };
  }
  
  async importData(data) {
    // 简单的数据导入 (仅用于恢复)
    for (const [tableName, rows] of Object.entries(data.tables)) {
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = columns.map((_, i) => '$' + (i + 1)).join(', ');
        
        await this.db.query(
          'INSERT INTO ' + tableName + ' (' + columns.join(', ') + ') VALUES (' + placeholders + ') ON CONFLICT DO NOTHING',
          values
        );
      }
    }
  }
}

// ---- Cloud Sync Service ----
class SparkSync {
  constructor(privateKey) {
    this.privateKey = privateKey;
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSync = null;
  }
  
  async start(intervalMs = 30000) {
    await this.sync();
    this.syncInterval = setInterval(() => this.sync(), intervalMs);
  }
  
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  
  async sync() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    
    try {
      // 1. 拉取新消息
      const res = await fetch(
        SPARK_CONFIG.API_BASE + '/api/mailbox/sync?app_id=' + SPARK_CONFIG.APP_ID,
        { credentials: 'include' }
      );
      
      if (!res.ok) {
        if (res.status === 401) {
          console.warn('Sync: Not logged in');
          window.dispatchEvent(new CustomEvent('spark-sync-auth-required'));
          return;
        }
        throw new Error('Sync failed: ' + res.status);
      }
      
      const { messages, stats } = await res.json();
      
      if (messages.length === 0) {
        console.log('📭 No new messages');
        this.lastSync = new Date();
        return;
      }
      
      console.log('📬 Received ' + messages.length + ' messages');
      
      // 2. 处理每条消息
      const processedIds = [];
      for (const msg of messages) {
        try {
          const decrypted = await this.decrypt(msg.encrypted_payload);
          await this.saveToLocal(decrypted);
          processedIds.push(msg.id);
        } catch (e) {
          console.error('Failed to process message:', e);
        }
      }
      
      // 3. 确认收到
      if (processedIds.length > 0) {
        await fetch(SPARK_CONFIG.API_BASE + '/api/mailbox/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message_ids: processedIds, action: 'delete' })
        });
      }
      
      // 4. 触发备份
      if (window.sparkBackup?.autoSave) {
        await window.sparkBackup.save();
      }
      
      this.lastSync = new Date();
      window.dispatchEvent(new CustomEvent('spark-sync-complete', { 
        detail: { count: processedIds.length, stats } 
      }));
      
    } catch (e) {
      console.error('Sync error:', e);
      window.dispatchEvent(new CustomEvent('spark-sync-error', { detail: e }));
    } finally {
      this.isSyncing = false;
    }
  }
  
  async decrypt(encryptedPayload) {
    const { data } = JSON.parse(atob(encryptedPayload));
    
    const key = await crypto.subtle.importKey(
      'jwk',
      this.privateKey,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      key,
      new Uint8Array(data)
    );
    
    return JSON.parse(new TextDecoder().decode(decrypted));
  }
  
  async saveToLocal(data) {
    // 这部分由 AI 根据具体 Schema 生成
    {{SAVE_TO_LOCAL_IMPL}}
  }
}

// ---- File Backup Service ----
class SparkBackup {
  constructor() {
    this.fileHandle = null;
    this.lastBackup = null;
    this.autoSave = false;
  }
  
  async connect() {
    try {
      this.fileHandle = await window.showSaveFilePicker({
        suggestedName: 'spark-backup-' + SPARK_CONFIG.APP_ID.slice(-8) + '.json',
        types: [{
          description: 'SparkVertex Backup',
          accept: { 'application/json': ['.json'] }
        }]
      });
      
      this.autoSave = true;
      console.log('💾 Backup file connected');
      window.dispatchEvent(new CustomEvent('spark-backup-connected'));
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Backup connect failed:', e);
      }
      return false;
    }
  }
  
  async save() {
    if (!this.fileHandle) return false;
    
    try {
      const exportData = await window.sparkDB.exportAll();
      
      const writable = await this.fileHandle.createWritable();
      await writable.write(JSON.stringify(exportData, null, 2));
      await writable.close();
      
      this.lastBackup = new Date();
      console.log('✅ Backup saved');
      window.dispatchEvent(new CustomEvent('spark-backup-saved', { detail: this.lastBackup }));
      return true;
    } catch (e) {
      console.error('Backup save failed:', e);
      return false;
    }
  }
  
  async restore() {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{
          description: 'SparkVertex Backup',
          accept: { 'application/json': ['.json'] }
        }]
      });
      
      const file = await fileHandle.getFile();
      const content = await file.text();
      const data = JSON.parse(content);
      
      if (data.app_id !== SPARK_CONFIG.APP_ID) {
        throw new Error('Backup is for a different app');
      }
      
      await window.sparkDB.importData(data);
      console.log('📥 Data restored');
      window.dispatchEvent(new CustomEvent('spark-backup-restored'));
      return data;
    } catch (e) {
      console.error('Restore failed:', e);
      return null;
    }
  }
}

// ---- Initialize ----
window.sparkDB = new SparkDB();
window.sparkBackup = new SparkBackup();

// Auto-init database
window.sparkDB.init();
</script>
`;

/**
 * 生成完整的 PGLite 运行时代码
 */
export function generatePGLiteRuntime(config: {
  appId: string;
  apiBase: string;
  schemaVersion: number;
  migrations: Array<{ version: number; sql: string }>;
  saveToLocalImpl: string;
}): string {
  return PGLITE_RUNTIME
    .replace(/\{\{APP_ID\}\}/g, config.appId)
    .replace(/\{\{API_BASE\}\}/g, config.apiBase)
    .replace(/\{\{SCHEMA_VERSION\}\}/g, String(config.schemaVersion))
    .replace('{{MIGRATIONS_JSON}}', JSON.stringify(config.migrations))
    .replace('{{SAVE_TO_LOCAL_IMPL}}', config.saveToLocalImpl);
}
```

### 2.2 表单加密提交模板

**创建 `lib/templates/form-submit.ts`:**

```typescript
/**
 * 加密表单提交模板
 * 注入到采集端 HTML 中
 */

export const FORM_SUBMIT_TEMPLATE = `
<script>
// SparkVertex Encrypted Form Submission
const SPARK_FORM_CONFIG = {
  APP_ID: '{{APP_ID}}',
  API_BASE: '{{API_BASE}}',
  PUBLIC_KEY: {{PUBLIC_KEY_JSON}}
};

async function sparkSubmit(formData) {
  try {
    // 1. 加密数据
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      SPARK_FORM_CONFIG.PUBLIC_KEY,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );
    
    const encoded = new TextEncoder().encode(JSON.stringify(formData));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      encoded
    );
    
    const payload = btoa(JSON.stringify({
      data: Array.from(new Uint8Array(encrypted))
    }));
    
    // 2. 发送到云端信箱
    const res = await fetch(SPARK_FORM_CONFIG.API_BASE + '/api/mailbox/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: SPARK_FORM_CONFIG.APP_ID,
        payload: payload,
        metadata: {
          form_id: '{{FORM_ID}}',
          submitted_at: new Date().toISOString()
        }
      })
    });
    
    if (!res.ok) throw new Error('Submit failed');
    
    return { success: true };
  } catch (e) {
    console.error('SparkSubmit error:', e);
    return { success: false, error: e.message };
  }
}

// 便捷函数：提交整个表单
async function sparkSubmitForm(formElement) {
  const formData = Object.fromEntries(new FormData(formElement));
  return sparkSubmit(formData);
}
</script>
`;

export function generateFormSubmitScript(config: {
  appId: string;
  apiBase: string;
  publicKey: JsonWebKey;
  formId?: string;
}): string {
  return FORM_SUBMIT_TEMPLATE
    .replace(/\{\{APP_ID\}\}/g, config.appId)
    .replace(/\{\{API_BASE\}\}/g, config.apiBase)
    .replace('{{PUBLIC_KEY_JSON}}', JSON.stringify(config.publicKey))
    .replace('{{FORM_ID}}', config.formId || 'default');
}
```

---

## 三、现有代码修改清单

### 3.1 意图分类器修改

**文件: `lib/intent-classifier.ts`**

新增以下代码：

```typescript
// === 新增：应用类型检测 ===

export type AppType = 'static' | 'form' | 'fullstack';

const BACKEND_INDICATORS = {
  zh: {
    form: ['表单', '收集', '登记', '报名', '提交', '调查问卷', '预约', '反馈'],
    fullstack: ['管理', '后台', '仪表盘', '统计', '导出', 'CRM', '库存', '订单管理', '会员系统']
  },
  en: {
    form: ['form', 'collect', 'register', 'submit', 'survey', 'booking', 'feedback'],
    fullstack: ['admin', 'dashboard', 'manage', 'statistics', 'export', 'CRM', 'inventory', 'orders', 'members']
  }
};

export function detectAppType(prompt: string, language: string = 'zh'): AppType {
  const indicators = BACKEND_INDICATORS[language as 'zh' | 'en'] || BACKEND_INDICATORS.en;
  const lowerPrompt = prompt.toLowerCase();
  
  // 检查是否是完整后台
  if (indicators.fullstack.some(kw => lowerPrompt.includes(kw.toLowerCase()))) {
    return 'fullstack';
  }
  
  // 检查是否是表单收集
  if (indicators.form.some(kw => lowerPrompt.includes(kw.toLowerCase()))) {
    return 'form';
  }
  
  return 'static';
}
```

### 3.2 生成流程修改

**文件: `app/create/page.tsx`**

在 `startGeneration` 函数中，添加应用类型检测：

```typescript
// 在 startGeneration 函数开始处添加
const appType = detectAppType(promptText, language);
console.log('[Generation] Detected app type:', appType);

// 如果是带后端的应用，需要额外生成 manifest
if (appType !== 'static') {
  // TODO: 生成 app_manifest
  // TODO: 调用不同的 AI Prompt
}
```

### 3.3 Prompt 系统修改

**文件: `lib/prompts.ts`**

添加新的系统提示 (见上方 `GET_FULLSTACK_SYSTEM_PROMPT`)

---

## 四、Cron 任务配置

**修改 `vercel.json`:**

```json
{
  "crons": [
    {
      "path": "/api/cron/health-check",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/cleanup-orders",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/retry-credits",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/cron/cleanup-inbox",
      "schedule": "0 4 * * *"
    }
  ]
}
```

**创建 `app/api/cron/cleanup-inbox/route.ts`:**

```typescript
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  // 验证 Cron 密钥
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_inbox_messages');
    
    if (error) throw error;
    
    console.log('[Cron] Cleaned up inbox messages:', data);
    
    return NextResponse.json({
      success: true,
      deleted: data,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Cron] Cleanup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

## 五、测试清单

### 5.1 API 测试

```bash
# 测试投递接口
curl -X POST https://your-domain.com/api/mailbox/submit \
  -H "Content-Type: application/json" \
  -d '{"app_id": "app_xxx_yyy", "payload": "encrypted_data_here"}'

# 测试同步接口 (需要登录后的 Cookie)
curl https://your-domain.com/api/mailbox/sync?app_id=app_xxx_yyy \
  -H "Cookie: sb-xxx=yyy"
```

### 5.2 前端测试

1. 生成一个带表单的应用
2. 检查生成的代码是否包含 PGLite 初始化
3. 提交表单数据，检查是否加密发送
4. 在管理端检查数据是否正确解密
5. 测试硬盘备份功能
6. 测试数据恢复功能

---

*实施指南版本: 1.0.0*
*最后更新: 2025-12-09*
