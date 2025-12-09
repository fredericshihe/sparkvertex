# 🏛️ SparkVertex 本地优先架构升级规划

## 📋 执行摘要

本文档详细规划如何将 SparkVertex 从当前的"云端托管生成代码"模式升级为**"Local-First + 云端信箱 + 动态 CMS"**的三端协同架构。

### 当前架构 vs 目标架构

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              当前架构 (v1)                                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   用户 ──▶ SparkVertex ──▶ AI 生成代码 ──▶ 存入 Supabase (items 表)                  │
│                                    │                                                 │
│                                    └──▶ 用户获得静态 HTML (无数据库能力)              │
│                                                                                      │
│   问题: 生成的应用只能展示，无法收集/存储/管理数据                                      │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

                                      ↓ 升级 ↓

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        目标架构 (v2.1 - Local-First + CMS)                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐                       │
│   │ Public App  │◀──┐   │ Supabase    │   ┌──▶│ Local App   │                       │
│   │ (展示端)    │   │   │ (云端)      │   │   │ (管理端)    │                       │
│   └──────┬──────┘   │   └──────┬──────┘   │   └──────┬──────┘                       │
│          │          │          │          │          │                              │
│          │          │   ┌──────┴──────┐   │          │                              │
│          │          └───┤ Public JSON │◀──┘          │                              │
│        (投递)           │ (CDN存储)   │  (发布内容)   │                              │
│          │              └─────────────┘              │                              │
│          │                     ▲                     │                              │
│          │              ┌──────┴──────┐       ┌──────┴──────┐                       │
│          └─────────────▶│ Inbox Table │◀──────┤ PGLite      │                       │
│            (加密投递)   │ (加密信箱)  │(同步)  │ (本地数据)  │                       │
│                         └─────────────┘       └──────┬──────┘                       │
│                                                      │                              │
│                                               ┌──────┴──────┐                       │
│                                               │ 硬盘备份    │                       │
│                                               │ (JSON文件)  │                       │
│                                               └─────────────┘                       │
│                                                                                      │
│   数据流向:                                                                          │
│   📥 Public -> Local: 收集数据 (加密信箱)                                            │
│   📤 Local -> Public: 控制展示 (静态 JSON CDN)                                       │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 核心能力矩阵

| 能力 | v1 (当前) | v2.1 (目标) |
|------|-----------|-------------|
| 静态展示 | ✅ | ✅ |
| 数据收集 | ❌ | ✅ 加密信箱 |
| 本地数据库 | ❌ | ✅ PGLite |
| 硬盘备份 | ❌ | ✅ File System API |
| 动态内容发布 | ❌ | ✅ CDN JSON |
| 离线使用 | ❌ | ✅ PWA + OPFS |
| Schema 迁移 | ❌ | ✅ 增量迁移 |
| 🆕 加密文件上传 | ❌ | ✅ 端到端加密 |
| 🆕 公开资源发布 | ❌ | ✅ CDN 分发 |
| 🆕 图片压缩 | ❌ | ✅ 浏览器端 WebP |
| 🆕 大文件分片 | ❌ | ✅ 分片加密上传 |

---

## 📅 分阶段实施计划

### 🚀 第一阶段：基础设施建设 (2-3 周)

#### 1.1 平台数据库扩展

**新增表结构 (Supabase)**

```sql
-- ============================================
-- 1. 云端信箱表 (所有用户的加密数据暂存)
-- ============================================
CREATE TABLE inbox_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,                    -- 应用唯一标识 (app_{user_id}_{item_id})
  encrypted_payload TEXT NOT NULL,         -- 加密后的数据 (平台无法解读)
  metadata JSONB DEFAULT '{}',             -- 非敏感元数据 (时间戳、来源IP等)
  processed BOOLEAN DEFAULT FALSE,         -- 是否已被本地应用拉取
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days') -- 30天后自动过期
);

-- 索引优化
CREATE INDEX idx_inbox_app_id ON inbox_messages(app_id);
CREATE INDEX idx_inbox_processed ON inbox_messages(app_id, processed) WHERE processed = FALSE;
CREATE INDEX idx_inbox_expires ON inbox_messages(expires_at);

-- RLS 策略: 任何人都可以投递，但只有拥有者可以读取
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

-- 公开写入策略 (投递)
CREATE POLICY "Anyone can submit to inbox" ON inbox_messages
  FOR INSERT WITH CHECK (TRUE);

-- 拥有者读取策略
CREATE POLICY "Owner can read inbox" ON inbox_messages
  FOR SELECT USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

-- 拥有者删除策略
CREATE POLICY "Owner can delete inbox" ON inbox_messages
  FOR DELETE USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

-- ============================================
-- 2. 公开内容表 (CMS 发布功能)
-- ============================================
-- 存储用户发布的公开内容 (非加密，供 Public App 读取)
CREATE TABLE public_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL UNIQUE,             -- 应用唯一标识
  content JSONB NOT NULL DEFAULT '{}',     -- 公开内容 (菜单、公告、配置等)
  version INTEGER DEFAULT 1,               -- 内容版本号
  published_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_public_content_app_id ON public_content(app_id);

-- RLS 策略: 任何人可读，只有拥有者可写
ALTER TABLE public_content ENABLE ROW LEVEL SECURITY;

-- 公开读取
CREATE POLICY "Anyone can read public content" ON public_content
  FOR SELECT USING (TRUE);

-- 拥有者写入
CREATE POLICY "Owner can insert public content" ON public_content
  FOR INSERT WITH CHECK (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

CREATE POLICY "Owner can update public content" ON public_content
  FOR UPDATE USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

-- ============================================
-- 3. 应用清单表 (扩展 items 表)
-- ============================================
-- 在现有 items 表上新增字段
ALTER TABLE items ADD COLUMN IF NOT EXISTS app_manifest JSONB DEFAULT '{}';
ALTER TABLE items ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS has_backend BOOLEAN DEFAULT FALSE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS has_cms BOOLEAN DEFAULT FALSE;      -- 新增: 是否有 CMS 功能
ALTER TABLE items ADD COLUMN IF NOT EXISTS public_key TEXT; -- 用户公钥 (用于加密)

-- Manifest 结构示例:
-- {
--   "version": 5,
--   "schema": {
--     "tables": [
--       { "name": "submissions", "columns": [...] },
--       { "name": "menu_items", "columns": [...] }   // CMS 内容表
--     ]
--   },
--   "features": ["form_collection", "local_db", "cloud_sync", "cms_publish"],
--   "cms": {
--     "publishable_tables": ["menu_items", "announcements"],
--     "public_fields": { "menu_items": ["name", "price", "image", "active"] }
--   },
--   "migrations": [
--     { "version": 2, "sql": "ALTER TABLE submissions ADD COLUMN email TEXT;" }
--   ]
-- }

-- ============================================
-- 4. 密钥对存储表 (可选，用户也可本地存储)
-- ============================================
CREATE TABLE user_keypairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  -- private_key 永远不存云端！用户自己保管
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, app_id)
);

-- 定时清理过期信箱数据
CREATE OR REPLACE FUNCTION cleanup_expired_inbox()
RETURNS void AS $$
BEGIN
  DELETE FROM inbox_messages WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 1.2 新增 API 端点

**文件位置: `app/api/`**

```
app/api/
├── mailbox/                 # 加密信箱 (数据收集)
│   ├── submit/route.ts      # 公开投递接口
│   ├── upload/route.ts      # 🆕 加密文件上传接口
│   ├── sync/route.ts        # 拉取数据接口 (需鉴权)
│   ├── ack/route.ts         # 确认收到接口 (需鉴权)
│   └── stats/route.ts       # 统计接口 (需鉴权)
│
└── cms/                     # CMS 发布 (内容控制)
    ├── publish/route.ts     # 发布内容接口 (需鉴权)
    ├── upload/route.ts      # 🆕 公开资源上传接口 (需鉴权)
    ├── content/[appId]/route.ts  # 获取公开内容 (公开)
    └── history/route.ts     # 发布历史接口 (需鉴权)
```

**submit/route.ts (投递接口)**
```typescript
// POST /api/mailbox/submit
// 公开接口，任何人都可以调用

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 使用 Service Role 绕过 RLS
);

export async function POST(req: Request) {
  try {
    const { app_id, payload, metadata } = await req.json();
    
    // 基本校验
    if (!app_id || !payload) {
      return NextResponse.json({ error: 'Missing app_id or payload' }, { status: 400 });
    }
    
    // 校验 app_id 格式
    if (!/^app_[a-f0-9-]+_[a-f0-9-]+$/.test(app_id)) {
      return NextResponse.json({ error: 'Invalid app_id format' }, { status: 400 });
    }
    
    // 限流检查 (每分钟最多 60 次投递)
    const rateLimitKey = `mailbox:${app_id}`;
    // TODO: 实现 Redis 限流
    
    // 写入数据库
    const { error } = await supabase
      .from('inbox_messages')
      .insert({
        app_id,
        encrypted_payload: payload,
        metadata: {
          ...metadata,
          ip: req.headers.get('x-forwarded-for') || 'unknown',
          user_agent: req.headers.get('user-agent'),
          submitted_at: new Date().toISOString()
        }
      });
    
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Mailbox Submit Error]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**sync/route.ts (同步接口)**
```typescript
// GET /api/mailbox/sync?app_id=xxx
// 需要用户登录验证

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get('app_id');
    
    if (!app_id) {
      return NextResponse.json({ error: 'Missing app_id' }, { status: 400 });
    }
    
    // 验证用户是否拥有此应用
    const expectedPrefix = `app_${user.id}_`;
    if (!app_id.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // 获取未处理的消息
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('id, encrypted_payload, metadata, created_at')
      .eq('app_id', app_id)
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(100);
    
    if (error) throw error;
    
    return NextResponse.json({ messages: data || [] });
  } catch (error: any) {
    console.error('[Mailbox Sync Error]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

#### 1.3 CMS 发布 API

**cms/publish/route.ts (发布接口)**
```typescript
// POST /api/cms/publish
// 需要用户登录验证 - 将本地内容发布到云端

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { app_id, content } = await req.json();
    
    if (!app_id || !content) {
      return NextResponse.json({ error: 'Missing app_id or content' }, { status: 400 });
    }
    
    // 验证用户是否拥有此应用
    const expectedPrefix = `app_${user.id}_`;
    if (!app_id.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // 内容大小限制 (1MB)
    const contentStr = JSON.stringify(content);
    if (contentStr.length > 1024 * 1024) {
      return NextResponse.json({ error: 'Content too large (max 1MB)' }, { status: 413 });
    }
    
    // Upsert 公开内容
    const { data, error } = await supabase
      .from('public_content')
      .upsert({
        app_id,
        content,
        version: Date.now(), // 使用时间戳作为版本号
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'app_id'
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      version: data.version,
      published_at: data.published_at,
      // 返回公开访问 URL
      public_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/cms/content/${app_id}`
    });
  } catch (error: any) {
    console.error('[CMS Publish Error]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**cms/content/[appId]/route.ts (公开内容接口)**
```typescript
// GET /api/cms/content/[appId]
// 公开接口 - 返回已发布的内容 (带 CDN 缓存)

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: Request,
  { params }: { params: { appId: string } }
) {
  try {
    const { appId } = params;
    
    // 校验 app_id 格式
    if (!/^app_[a-f0-9-]+_[a-f0-9-]+$/.test(appId)) {
      return NextResponse.json({ error: 'Invalid app_id' }, { status: 400 });
    }
    
    // 获取公开内容
    const { data, error } = await supabase
      .from('public_content')
      .select('content, version, published_at')
      .eq('app_id', appId)
      .single();
    
    if (error || !data) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    
    // 设置缓存头 (CDN 缓存 5 分钟，浏览器缓存 1 分钟)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        'CDN-Cache-Control': 'public, max-age=300',
        'Vercel-CDN-Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    console.error('[CMS Content Error]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// 支持 CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

#### 1.3 多媒体存储架构 (Secure Drop-box)

> **核心理念**: 大文件与元数据分离，引入对象存储支持图片、语音、视频的加密传输

**引入两个 Supabase Storage Buckets:**

| 存储桶 | 用途 | 权限 | 状态 |
|--------|------|------|------|
| 🔒 `inbox-files` | 用户上传的身份证、录音、视频证据 | 公众可写，仅拥有者可读 | **加密二进制流** |
| 📢 `public-assets` | 管理员发布的 Banner、产品视频、语音介绍 | 拥有者可写，公众可读 | **公开明文 CDN** |

**Storage Bucket 配置 (Supabase Dashboard 或 SQL)**

```sql
-- ============================================
-- 5. 创建 Storage Buckets
-- ============================================

-- 加密收件箱 (用户上传的私密文件)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-files',
  'inbox-files',
  FALSE,  -- 非公开
  52428800,  -- 50MB 限制
  ARRAY['application/octet-stream', 'image/*', 'audio/*', 'video/*', 'application/pdf']
);

-- 公开资源库 (管理员发布的资源)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-assets',
  'public-assets',
  TRUE,  -- 公开
  104857600,  -- 100MB 限制
  ARRAY['image/*', 'audio/*', 'video/*', 'application/pdf']
);

-- RLS 策略: inbox-files
CREATE POLICY "Anyone can upload to inbox-files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'inbox-files');

CREATE POLICY "Owner can read inbox-files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'inbox-files' AND
  (storage.foldername(name))[1] LIKE 'app_' || auth.uid()::TEXT || '_%'
);

-- RLS 策略: public-assets
CREATE POLICY "Owner can upload to public-assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'public-assets' AND
  (storage.foldername(name))[1] LIKE 'app_' || auth.uid()::TEXT || '_%'
);

CREATE POLICY "Anyone can read public-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');
```

##### 场景一：Public → Local (加密文件上传)

**场景**: 用户在表单中上传身份证照片或语音反馈

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                      加密文件上传流程 (浏览器端)                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [用户选择文件]                                                                 │
│       │                                                                         │
│       │ 1. 生成一次性 AES-GCM 密钥 (FileKey)                                    │
│       ▼                                                                         │
│  [加密文件内容]                                                                 │
│       │                                                                         │
│       │ 2. FileKey + 原始数据 → 加密二进制流                                    │
│       ▼                                                                         │
│  [上传到 inbox-files]                                                           │
│       │                                                                         │
│       │ 3. POST encrypted_video.enc → 获得 path                                 │
│       ▼                                                                         │
│  [加密 FileKey]                                                                 │
│       │                                                                         │
│       │ 4. 使用 App 公钥加密 FileKey                                            │
│       ▼                                                                         │
│  [投递到信箱]                                                                   │
│       │                                                                         │
│       └─ 5. { type: 'file', path, encrypted_key, iv } → inbox_messages          │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

**新增 API: `app/api/mailbox/upload/route.ts`**

```typescript
// POST /api/mailbox/upload
// 处理加密文件上传到 inbox-files 桶

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const appId = formData.get('app_id') as string;
    
    if (!file || !appId) {
      return NextResponse.json({ error: 'Missing file or app_id' }, { status: 400 });
    }
    
    // 校验 app_id 格式
    if (!/^app_[a-f0-9-]+_[a-f0-9-]+$/.test(appId)) {
      return NextResponse.json({ error: 'Invalid app_id' }, { status: 400 });
    }
    
    // 限制文件大小 (50MB)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 });
    }
    
    // 生成唯一路径
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    const path = `${appId}/${timestamp}_${randomId}.enc`;
    
    // 上传到 inbox-files 桶
    const { data, error } = await supabase.storage
      .from('inbox-files')
      .upload(path, file, {
        contentType: 'application/octet-stream',
        upsert: false
      });
    
    if (error) {
      console.error('[Upload Error]', error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true,
      path: data.path,
      bucket: 'inbox-files'
    });
    
  } catch (error: any) {
    console.error('[Upload Error]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**前端加密上传模板: `lib/templates/file-upload.ts`**

```typescript
export const ENCRYPTED_FILE_UPLOAD_TEMPLATE = `
// ============================================
// SparkVertex 加密文件上传
// ============================================

class SparkFileUploader {
  constructor(appId, appPublicKey) {
    this.appId = appId;
    this.appPublicKey = appPublicKey;
    this.apiBase = '{{API_BASE}}';
  }
  
  // 上传并加密文件
  async upload(file, onProgress) {
    try {
      // 1. 生成一次性 AES-GCM 密钥
      const fileKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
      
      // 2. 生成随机 IV
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      // 3. 读取并加密文件内容
      const fileContent = await this.readFileAsArrayBuffer(file);
      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        fileKey,
        fileContent
      );
      
      onProgress?.({ stage: 'encrypted', progress: 50 });
      
      // 4. 上传加密文件到 Storage
      const formData = new FormData();
      formData.append('file', new Blob([encryptedContent]));
      formData.append('app_id', this.appId);
      
      const uploadRes = await fetch(\`\${this.apiBase}/api/mailbox/upload\`, {
        method: 'POST',
        body: formData
      });
      
      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }
      
      const { path } = await uploadRes.json();
      onProgress?.({ stage: 'uploaded', progress: 80 });
      
      // 5. 导出并加密 FileKey
      const exportedKey = await window.crypto.subtle.exportKey("raw", fileKey);
      const encryptedKey = await this.encryptKeyWithPublicKey(exportedKey);
      
      onProgress?.({ stage: 'complete', progress: 100 });
      
      // 返回投递信息
      return {
        type: 'encrypted_file',
        path: path,
        key: encryptedKey,
        iv: Array.from(iv),
        original_name: file.name,
        original_size: file.size,
        mime_type: file.type
      };
      
    } catch (e) {
      console.error('Upload failed:', e);
      throw e;
    }
  }
  
  // 读取文件为 ArrayBuffer
  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  
  // 使用公钥加密对称密钥
  async encryptKeyWithPublicKey(keyData) {
    const publicKey = await window.crypto.subtle.importKey(
      "jwk",
      this.appPublicKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      keyData
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  }
}

window.SparkFileUploader = SparkFileUploader;
`;
```

##### 场景二：Local → Public (公开资源发布)

**场景**: 管理员发布带图文和视频的文章

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                      公开资源发布流程 (管理端)                                   │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [管理员选择媒体文件]                                                           │
│       │                                                                         │
│       │ 1. (可选) 本地压缩/转码 (FFmpeg.wasm)                                   │
│       ▼                                                                         │
│  [上传到 public-assets]                                                         │
│       │                                                                         │
│       │ 2. 直接上传明文文件                                                     │
│       ▼                                                                         │
│  [获取 CDN URL]                                                                 │
│       │                                                                         │
│       │ 3. https://cdn.supabase.co/.../my-video.mp4                             │
│       ▼                                                                         │
│  [更新 content.json]                                                            │
│       │                                                                         │
│       └─ 4. 发布更新到 public_content 表                                        │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

**新增 API: `app/api/cms/upload/route.ts`**

```typescript
// POST /api/cms/upload
// 管理员上传公开资源到 public-assets 桶

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 验证登录
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const appId = formData.get('app_id') as string;
    
    if (!file || !appId) {
      return NextResponse.json({ error: 'Missing file or app_id' }, { status: 400 });
    }
    
    // 校验所有权
    const expectedPrefix = \`app_\${user.id}_\`;
    if (!appId.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // 限制文件大小 (100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 413 });
    }
    
    // 生成唯一路径 (保留原始扩展名)
    const ext = file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().slice(0, 8);
    const path = \`\${appId}/\${timestamp}_\${randomId}.\${ext}\`;
    
    // 上传到 public-assets 桶
    const { data, error } = await supabase.storage
      .from('public-assets')
      .upload(path, file, {
        contentType: file.type,
        upsert: false
      });
    
    if (error) {
      console.error('[CMS Upload Error]', error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
    
    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('public-assets')
      .getPublicUrl(data.path);
    
    return NextResponse.json({ 
      success: true,
      path: data.path,
      url: publicUrl,
      bucket: 'public-assets'
    });
    
  } catch (error: any) {
    console.error('[CMS Upload Error]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

##### 媒体类型处理策略

| 媒体类型 | 挑战 | 解决方案 | 推荐库 |
|----------|------|----------|--------|
| **图片** | 容易 | Canvas 压缩，上传前转 WebP | `browser-image-compression` |
| **语音** | 中等 | MediaRecorder API，直接录制 WebM/MP3 | `react-media-recorder` |
| **视频** | 困难 | 分片上传 (Multipart Upload)，每片单独加密 | `uppy`, `tus-js-client` |
| **文档** | 安全 | 强制加密，PDF/Word 通常含敏感信息 | Native File API |

**图片压缩模板: `lib/templates/image-compress.ts`**

```typescript
export const IMAGE_COMPRESS_TEMPLATE = `
// 浏览器端图片压缩
async function compressImage(file, maxSizeMB = 1, maxWidthOrHeight = 1920) {
  // 动态加载压缩库
  const imageCompression = await import('browser-image-compression');
  
  const options = {
    maxSizeMB,
    maxWidthOrHeight,
    useWebWorker: true,
    fileType: 'image/webp'  // 转换为 WebP 格式
  };
  
  const compressed = await imageCompression.default(file, options);
  console.log(\`压缩: \${file.size} → \${compressed.size} (\${Math.round(compressed.size/file.size*100)}%)\`);
  
  return compressed;
}
`;
```

**大文件分片上传模板 (进阶): `lib/templates/chunked-upload.ts`**

```typescript
export const CHUNKED_UPLOAD_TEMPLATE = `
// 大文件分片加密上传 (用于视频等)
class ChunkedEncryptedUploader {
  constructor(appId, appPublicKey) {
    this.appId = appId;
    this.appPublicKey = appPublicKey;
    this.chunkSize = 5 * 1024 * 1024; // 5MB 每片
    this.apiBase = '{{API_BASE}}';
  }
  
  async upload(file, onProgress) {
    // 1. 生成主密钥
    const masterKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    
    const totalChunks = Math.ceil(file.size / this.chunkSize);
    const chunkPaths = [];
    
    // 2. 分片加密上传
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      // 每片使用不同的 IV
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const chunkData = await chunk.arrayBuffer();
      const encryptedChunk = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        masterKey,
        chunkData
      );
      
      // 上传分片
      const formData = new FormData();
      formData.append('file', new Blob([iv, encryptedChunk])); // IV 前置
      formData.append('app_id', this.appId);
      formData.append('chunk_index', i.toString());
      formData.append('total_chunks', totalChunks.toString());
      
      const res = await fetch(\`\${this.apiBase}/api/mailbox/upload\`, {
        method: 'POST',
        body: formData
      });
      
      const { path } = await res.json();
      chunkPaths.push(path);
      
      onProgress?.({
        stage: 'uploading',
        progress: Math.round((i + 1) / totalChunks * 90)
      });
    }
    
    // 3. 加密主密钥
    const exportedKey = await window.crypto.subtle.exportKey("raw", masterKey);
    const encryptedKey = await this.encryptKeyWithPublicKey(exportedKey);
    
    onProgress?.({ stage: 'complete', progress: 100 });
    
    return {
      type: 'chunked_encrypted_file',
      chunks: chunkPaths,
      key: encryptedKey,
      original_name: file.name,
      original_size: file.size,
      mime_type: file.type
    };
  }
  
  async encryptKeyWithPublicKey(keyData) {
    // ... 同上
  }
}
`;
```

##### 潜在限制与应对策略

| 限制 | 问题描述 | 解决方案 |
|------|----------|----------|
| **浏览器内存** | 2GB 视频读入内存会崩溃 | 使用 **Streams API** 流式处理 |
| **流量成本** | 视频消耗大量带宽和存储 | 限制附件大小 (免费版 50MB)，付费版更高 |
| **本地存储压力** | 下载所有视频会撑满硬盘 | 支持 **"按需下载"**，列表只显示元数据 |
| **大文件传输** | 网络不稳定导致上传失败 | **断点续传** (记录已上传分片) |

---

### 🧠 第二阶段：AI 代码生成升级 (3-4 周)

#### 2.1 新增应用类型识别

**修改文件: `lib/intent-classifier.ts`**

```typescript
// 新增意图类型
export type AppIntent = 
  | 'STATIC_APP'        // 纯展示类 (当前支持)
  | 'FORM_COLLECTION'   // 表单收集类 (新增)
  | 'LOCAL_DATABASE'    // 本地数据库类 (新增)
  | 'FULL_STACK'        // 前后端完整应用 (新增)
  | 'CMS_APP'           // 内容管理类 (新增)
  ;

// 关键词映射
const BACKEND_KEYWORDS = {
  zh: [
    '收集', '登记', '报名', '提交', '表单', '数据库', '存储', '管理',
    '后台', '统计', '导出', '备份', '同步', '用户数据', '订单',
    'CRM', '客户管理', '会员', '库存', '记录'
  ],
  en: [
    'collect', 'register', 'submit', 'form', 'database', 'store', 'manage',
    'admin', 'statistics', 'export', 'backup', 'sync', 'user data', 'orders',
    'CRM', 'customer', 'member', 'inventory', 'records'
  ]
};

// CMS 关键词 (动态内容发布)
const CMS_KEYWORDS = {
  zh: [
    '菜单', '菜品', '价格', '公告', '动态', '发布', '更新', '展示',
    '餐厅', '商品', '产品', '博客', '文章', '日程', '活动安排',
    '库存显示', '售罄', '上架', '下架'
  ],
  en: [
    'menu', 'dish', 'price', 'announcement', 'post', 'publish', 'update', 'display',
    'restaurant', 'product', 'item', 'blog', 'article', 'schedule', 'agenda',
    'stock display', 'sold out', 'available', 'unavailable'
  ]
};

export function detectAppIntent(prompt: string, language: string): AppIntent {
  const backendKW = BACKEND_KEYWORDS[language as 'zh' | 'en'] || BACKEND_KEYWORDS.en;
  const cmsKW = CMS_KEYWORDS[language as 'zh' | 'en'] || CMS_KEYWORDS.en;
  const lowerPrompt = prompt.toLowerCase();
  
  const hasBackendKeyword = backendKW.some(kw => lowerPrompt.includes(kw.toLowerCase()));
  const hasCmsKeyword = cmsKW.some(kw => lowerPrompt.includes(kw.toLowerCase()));
  
  // 同时有收集和发布需求 = 完整应用
  if (hasBackendKeyword && hasCmsKeyword) {
    return 'FULL_STACK';
  }
  
  // 有发布/展示需求但不需要收集 = CMS 应用
  if (hasCmsKeyword) {
    // 检查是否需要管理后台
    if (lowerPrompt.includes('管理') || lowerPrompt.includes('后台') || lowerPrompt.includes('admin')) {
      return 'CMS_APP';
    }
    return 'CMS_APP'; // 即使没有明确说管理，也需要有个地方修改内容
  }
  
  // 只有收集需求
  if (hasBackendKeyword) {
    if (lowerPrompt.includes('管理') || lowerPrompt.includes('后台') || lowerPrompt.includes('admin')) {
      return 'FULL_STACK';
    }
    return 'FORM_COLLECTION';
  }
  
  return 'STATIC_APP';
}
```

#### 2.2 生成代码模板库

**新增文件: `lib/templates/`**

```
lib/templates/
├── base.ts                 # 基础 HTML 模板
├── pglite-core.ts          # PGLite 数据库核心代码
├── crypto.ts               # 加密/解密模块
├── sync-service.ts         # 云端同步服务
├── backup-service.ts       # 硬盘备份服务
├── migration-manager.ts    # 数据库迁移管理器
├── admin-ui.ts             # 管理后台 UI 组件
├── cms-publish.ts          # 🆕 CMS 发布服务模板
├── cms-public-viewer.ts    # 🆕 CMS 公开展示端模板
├── file-upload.ts          # 🆕 加密文件上传模板
├── image-compress.ts       # 🆕 图片压缩模板
└── chunked-upload.ts       # 🆕 大文件分片上传模板
```

**pglite-core.ts (核心模板)**
```typescript
export const PGLITE_CORE_TEMPLATE = `
// ============================================
// SparkVertex Local Database Core
// Powered by PGLite (PostgreSQL in WASM)
// ============================================

import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";

class SparkDB {
  constructor() {
    this.db = null;
    this.ready = false;
  }
  
  async init() {
    try {
      // 使用 OPFS 获得最佳性能
      this.db = new PGlite("opfs://spark-{{APP_ID}}");
      
      // 初始化迁移系统
      await this.db.query(\`
        CREATE TABLE IF NOT EXISTS _spark_migrations (
          id SERIAL PRIMARY KEY,
          version INTEGER UNIQUE,
          applied_at TIMESTAMP DEFAULT NOW()
        );
      \`);
      
      this.ready = true;
      console.log('🔮 SparkDB Ready');
      return true;
    } catch (e) {
      console.error('SparkDB Init Failed:', e);
      return false;
    }
  }
  
  async query(sql, params = []) {
    if (!this.ready) throw new Error('Database not initialized');
    return this.db.query(sql, params);
  }
  
  async getCurrentVersion() {
    const result = await this.query('SELECT MAX(version) as v FROM _spark_migrations');
    return result.rows[0]?.v || 0;
  }
  
  async applyMigration(version, sql) {
    const current = await this.getCurrentVersion();
    if (current >= version) return false; // Already applied
    
    await this.query('BEGIN');
    try {
      await this.query(sql);
      await this.query('INSERT INTO _spark_migrations (version) VALUES ($1)', [version]);
      await this.query('COMMIT');
      console.log(\`✅ Migration v\${version} applied\`);
      return true;
    } catch (e) {
      await this.query('ROLLBACK');
      console.error(\`❌ Migration v\${version} failed:\`, e);
      throw e;
    }
  }
  
  async exportAll() {
    // 获取所有用户表
    const tables = await this.query(\`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename NOT LIKE '_spark%'
    \`);
    
    const exportData = {};
    for (const { tablename } of tables.rows) {
      const data = await this.query(\`SELECT * FROM \${tablename}\`);
      exportData[tablename] = data.rows;
    }
    
    return {
      version: await this.getCurrentVersion(),
      exported_at: new Date().toISOString(),
      tables: exportData
    };
  }
}

window.sparkDB = new SparkDB();
`;

export const SYNC_SERVICE_TEMPLATE = `
// ============================================
// SparkVertex Cloud Sync Service
// ============================================

class SparkSync {
  constructor(appId, privateKey) {
    this.appId = appId;
    this.privateKey = privateKey;
    this.apiBase = '{{API_BASE}}';
    this.syncInterval = null;
  }
  
  async start(intervalMs = 30000) {
    // 立即执行一次
    await this.sync();
    
    // 定时执行
    this.syncInterval = setInterval(() => this.sync(), intervalMs);
  }
  
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
  
  async sync() {
    try {
      // 1. 从云端拉取新消息
      const res = await fetch(\`\${this.apiBase}/api/mailbox/sync?app_id=\${this.appId}\`, {
        credentials: 'include' // 携带登录凭证
      });
      
      if (!res.ok) throw new Error('Sync failed');
      
      const { messages } = await res.json();
      
      if (messages.length === 0) {
        console.log('📭 No new messages');
        return;
      }
      
      console.log(\`📬 Received \${messages.length} new messages\`);
      
      // 2. 处理每条消息
      for (const msg of messages) {
        try {
          // 解密
          const decrypted = await this.decrypt(msg.encrypted_payload);
          
          // 写入本地数据库
          await this.saveToLocal(decrypted);
          
          // 确认收到
          await fetch(\`\${this.apiBase}/api/mailbox/ack\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message_id: msg.id })
          });
          
        } catch (e) {
          console.error('Message processing failed:', e);
        }
      }
      
      // 3. 触发硬盘备份
      if (window.sparkBackup) {
        await window.sparkBackup.save();
      }
      
    } catch (e) {
      console.error('Sync error:', e);
    }
  }
  
  async decrypt(encryptedPayload) {
    // 使用 Web Crypto API 解密
    const { iv, data } = JSON.parse(atob(encryptedPayload));
    
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
    // 由 AI 根据具体 Schema 生成
    {{SAVE_TO_LOCAL_LOGIC}}
  }
}

window.sparkSync = null; // 由应用初始化时创建
`;

export const BACKUP_SERVICE_TEMPLATE = `
// ============================================
// SparkVertex File System Backup
// ============================================

class SparkBackup {
  constructor() {
    this.fileHandle = null;
    this.lastBackup = null;
  }
  
  async connect() {
    try {
      this.fileHandle = await window.showSaveFilePicker({
        suggestedName: 'spark-backup-{{APP_ID}}.json',
        types: [{
          description: 'SparkVertex Backup',
          accept: { 'application/json': ['.json'] }
        }]
      });
      
      console.log('💾 Backup file connected');
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Backup connection failed:', e);
      }
      return false;
    }
  }
  
  async save() {
    if (!this.fileHandle) {
      console.log('⚠️ No backup file connected');
      return false;
    }
    
    try {
      // 从 PGLite 导出所有数据
      const exportData = await window.sparkDB.exportAll();
      
      // 写入文件
      const writable = await this.fileHandle.createWritable();
      await writable.write(JSON.stringify(exportData, null, 2));
      await writable.close();
      
      this.lastBackup = new Date();
      console.log('✅ Backup saved at', this.lastBackup.toLocaleString());
      return true;
    } catch (e) {
      console.error('Backup failed:', e);
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
      
      // TODO: 实现数据恢复逻辑
      console.log('📥 Restore data:', data);
      
      return data;
    } catch (e) {
      console.error('Restore failed:', e);
      return null;
    }
  }
}

window.sparkBackup = new SparkBackup();
`;

// ============================================
// 🆕 CMS 发布服务模板
// ============================================
export const CMS_PUBLISH_SERVICE_TEMPLATE = `
// ============================================
// SparkVertex CMS Publish Service
// Local → Public 数据流发布
// ============================================

class SparkCMSPublish {
  constructor(appId) {
    this.appId = appId;
    this.apiBase = '{{API_BASE}}';
    this.lastPublish = null;
    this.publishStatus = 'idle'; // idle | publishing | success | error
  }
  
  // 从本地数据库提取公开内容
  async extractPublicContent() {
    if (!window.sparkDB || !window.sparkDB.ready) {
      throw new Error('Local database not ready');
    }
    
    // 获取 CMS 内容表的数据
    const result = await window.sparkDB.query(\`
      SELECT * FROM cms_content 
      WHERE is_public = true 
      ORDER BY sort_order ASC, created_at DESC
    \`);
    
    // 转换为 JSON 结构
    return {
      version: Date.now(),
      items: result.rows.map(row => ({
        id: row.id,
        type: row.content_type,
        title: row.title,
        content: JSON.parse(row.content_json || '{}'),
        thumbnail: row.thumbnail_url,
        sortOrder: row.sort_order,
        updatedAt: row.updated_at
      })),
      metadata: {
        appId: this.appId,
        exportedAt: new Date().toISOString(),
        itemCount: result.rows.length
      }
    };
  }
  
  // 发布到云端 CDN
  async publish(options = {}) {
    if (this.publishStatus === 'publishing') {
      console.log('⏳ Publish already in progress');
      return null;
    }
    
    this.publishStatus = 'publishing';
    
    try {
      // 1. 提取公开内容
      const content = await this.extractPublicContent();
      
      if (content.items.length === 0) {
        console.log('📭 No public content to publish');
        this.publishStatus = 'idle';
        return null;
      }
      
      console.log(\`📤 Publishing \${content.items.length} items...\`);
      
      // 2. 上传到云端
      const res = await fetch(\`\${this.apiBase}/api/cms/publish\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          app_id: this.appId,
          content_json: content,
          content_hash: await this.hashContent(content),
          ...options
        })
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Publish failed');
      }
      
      const result = await res.json();
      
      // 3. 更新发布状态
      this.lastPublish = new Date();
      this.publishStatus = 'success';
      
      console.log('✅ Published successfully!');
      console.log('🌐 Public URL:', result.public_url);
      
      // 4. 触发自定义事件
      window.dispatchEvent(new CustomEvent('spark:cms:published', {
        detail: { url: result.public_url, content }
      }));
      
      return result;
      
    } catch (e) {
      console.error('❌ Publish failed:', e);
      this.publishStatus = 'error';
      throw e;
    }
  }
  
  // 生成内容哈希 (用于检测变更)
  async hashContent(content) {
    const str = JSON.stringify(content.items);
    const buffer = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // 获取发布历史
  async getPublishHistory(limit = 10) {
    const res = await fetch(
      \`\${this.apiBase}/api/cms/history?app_id=\${this.appId}&limit=\${limit}\`,
      { credentials: 'include' }
    );
    return res.json();
  }
  
  // 回滚到历史版本
  async rollback(version) {
    const res = await fetch(\`\${this.apiBase}/api/cms/rollback\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        app_id: this.appId,
        version
      })
    });
    return res.json();
  }
}

window.sparkCMS = null; // 由应用初始化时创建
`;

// ============================================
// 🆕 CMS 公开展示端模板
// ============================================
export const CMS_PUBLIC_VIEWER_TEMPLATE = `
// ============================================
// SparkVertex CMS Public Viewer
// 纯展示端 - 无本地数据库依赖
// ============================================

class SparkCMSViewer {
  constructor(appId) {
    this.appId = appId;
    this.contentUrl = '{{CONTENT_URL}}'; // CDN URL
    this.content = null;
    this.loading = false;
    this.error = null;
    this.lastFetch = null;
    this.autoRefreshInterval = null;
  }
  
  // 获取公开内容
  async fetchContent(options = {}) {
    if (this.loading) return this.content;
    
    this.loading = true;
    this.error = null;
    
    try {
      const url = new URL(this.contentUrl);
      // 添加缓存破坏参数
      if (options.bypassCache) {
        url.searchParams.set('_t', Date.now());
      }
      
      const res = await fetch(url.toString());
      
      if (!res.ok) {
        throw new Error(\`Failed to fetch content: \${res.status}\`);
      }
      
      this.content = await res.json();
      this.lastFetch = new Date();
      
      console.log(\`📥 Loaded \${this.content.items?.length || 0} items\`);
      
      // 触发内容更新事件
      window.dispatchEvent(new CustomEvent('spark:cms:loaded', {
        detail: { content: this.content }
      }));
      
      return this.content;
      
    } catch (e) {
      console.error('❌ Content fetch failed:', e);
      this.error = e.message;
      throw e;
    } finally {
      this.loading = false;
    }
  }
  
  // 获取指定类型的内容
  getItemsByType(type) {
    if (!this.content?.items) return [];
    return this.content.items.filter(item => item.type === type);
  }
  
  // 获取单个内容项
  getItemById(id) {
    if (!this.content?.items) return null;
    return this.content.items.find(item => item.id === id);
  }
  
  // 开启自动刷新 (适用于餐厅菜单等实时场景)
  startAutoRefresh(intervalMs = 60000) {
    this.stopAutoRefresh();
    this.autoRefreshInterval = setInterval(async () => {
      try {
        await this.fetchContent({ bypassCache: true });
      } catch (e) {
        console.error('Auto refresh failed:', e);
      }
    }, intervalMs);
    console.log(\`🔄 Auto refresh enabled: every \${intervalMs/1000}s\`);
  }
  
  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
  
  // 渲染助手方法
  renderMenuGrid(container, options = {}) {
    const items = this.getItemsByType('menu_item');
    container.innerHTML = items.map(item => \`
      <div class="menu-item" data-id="\${item.id}">
        \${item.thumbnail ? \`<img src="\${item.thumbnail}" alt="\${item.title}">\` : ''}
        <h3>\${item.title}</h3>
        <p class="price">\${item.content.price}</p>
        \${item.content.description ? \`<p class="desc">\${item.content.description}</p>\` : ''}
      </div>
    \`).join('');
  }
  
  renderEventList(container, options = {}) {
    const items = this.getItemsByType('event');
    container.innerHTML = items.map(item => \`
      <div class="event-item" data-id="\${item.id}">
        <h3>\${item.title}</h3>
        <p class="date">\${item.content.date}</p>
        <p class="location">\${item.content.location}</p>
        \${item.content.description ? \`<p class="desc">\${item.content.description}</p>\` : ''}
      </div>
    \`).join('');
  }
}

window.sparkViewer = null; // 由应用初始化时创建

// 自动初始化 (如果 data-app-id 存在)
document.addEventListener('DOMContentLoaded', () => {
  const appId = document.body.dataset.appId;
  if (appId) {
    window.sparkViewer = new SparkCMSViewer(appId);
    window.sparkViewer.fetchContent().then(() => {
      console.log('🚀 CMS Viewer initialized');
    });
  }
});
`;
```

#### 2.3 AI Prompt 升级

**修改文件: `lib/prompts.ts`**

```typescript
// 新增：带后端能力的系统提示
export const GET_FULLSTACK_SYSTEM_PROMPT = (language: string, appManifest: any) => {
  const lang = language === 'zh' ? 'Chinese' : 'English';
  
  return `You are a Full-Stack Local-First Application Architect.

## Your Mission
Generate a complete React application with:
1. **Frontend UI** - Beautiful, responsive interface
2. **Local Database** - PGLite (PostgreSQL in WASM)
3. **Cloud Sync** - Encrypted data synchronization
4. **Backup System** - File System Access API

## Current App Manifest
\`\`\`json
${JSON.stringify(appManifest, null, 2)}
\`\`\`

## Code Structure Requirements

### 1. Database Initialization
\`\`\`javascript
// At app startup
await window.sparkDB.init();

// Apply migrations (if updating)
const MIGRATIONS = {{MIGRATIONS}};
for (const m of MIGRATIONS) {
  await window.sparkDB.applyMigration(m.version, m.sql);
}
\`\`\`

### 2. Data Operations
\`\`\`javascript
// Insert
await window.sparkDB.query(
  'INSERT INTO submissions (name, phone) VALUES ($1, $2)',
  [formData.name, formData.phone]
);

// Query
const result = await window.sparkDB.query('SELECT * FROM submissions');
\`\`\`

### 3. Sync Service Setup
\`\`\`javascript
// After user logs in
window.sparkSync = new SparkSync('{{APP_ID}}', privateKey);
window.sparkSync.start();
\`\`\`

## Output Format
Output a complete HTML file with:
1. React components for UI
2. PGLite initialization code
3. Sync service integration
4. Backup button/functionality

Use ${lang} for all user-facing text.
`;
};

// Schema 迁移专用 Prompt
export const GET_MIGRATION_PROMPT = (currentManifest: any, userRequest: string) => {
  return `You are a Database Migration Expert.

## Current Schema
\`\`\`json
${JSON.stringify(currentManifest.schema, null, 2)}
\`\`\`

## Current Version: ${currentManifest.version}

## User Request
"${userRequest}"

## Your Task
1. Analyze the requested changes
2. Generate SQL migration statements (ALTER TABLE only, NO DROP TABLE)
3. Update the schema JSON
4. Flag any dangerous operations

## Output Format
\`\`\`json
{
  "analysis": "Brief description of changes",
  "dangerous": false,
  "warning": null,
  "migration": {
    "version": ${currentManifest.version + 1},
    "sql": "ALTER TABLE ... ; ALTER TABLE ...;"
  },
  "new_schema": { ... }
}
\`\`\`

## Rules
1. NEVER use DROP TABLE or DROP COLUMN without user confirmation
2. Preserve all existing data
3. Use sensible defaults for new columns
4. Keep column renames as RENAME, not drop+add
`;
};

// 🆕 CMS 应用专用 Prompt
export const GET_CMS_APP_PROMPT = (language: string, appType: string) => {
  const lang = language === 'zh' ? 'Chinese' : 'English';
  
  const CMS_TYPES = {
    'restaurant_menu': {
      contentFields: ['name', 'price', 'description', 'category', 'image_url', 'is_available', 'spicy_level'],
      exampleContent: { name: '宫保鸡丁', price: 38, category: '热菜', is_available: true }
    },
    'event_schedule': {
      contentFields: ['title', 'date', 'time', 'location', 'description', 'ticket_price', 'capacity'],
      exampleContent: { title: '周末音乐会', date: '2025-02-01', time: '19:00', location: '主舞台' }
    },
    'product_catalog': {
      contentFields: ['name', 'price', 'sku', 'stock', 'description', 'images', 'category'],
      exampleContent: { name: '无线蓝牙耳机', price: 299, sku: 'BT-001', stock: 50 }
    },
    'blog_posts': {
      contentFields: ['title', 'content', 'author', 'tags', 'featured_image', 'excerpt'],
      exampleContent: { title: '如何做好咖啡', author: '咖啡师小王', tags: ['咖啡', '技巧'] }
    }
  };
  
  const typeConfig = CMS_TYPES[appType] || CMS_TYPES['product_catalog'];
  
  return \`You are a CMS Application Architect specializing in Local-First systems.

## Your Mission
Generate a complete CMS application with TWO PARTS:

### Part 1: Admin Dashboard (管理端)
- Built with PGLite (local PostgreSQL)
- Content editing interface
- Publish to cloud button
- Sync status indicator

### Part 2: Public Display (展示端)
- Pure CSR (Client-Side Rendering)
- Fetches from static JSON CDN
- No database dependency
- Beautiful responsive grid/list layout

## App Type: ${appType}
## Content Fields: ${typeConfig.contentFields.join(', ')}
## Example Content:
\\\`\\\`\\\`json
${JSON.stringify(typeConfig.exampleContent, null, 2)}
\\\`\\\`\\\`

## Database Schema (Admin)
\\\`\\\`\\\`sql
CREATE TABLE cms_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content_json JSONB NOT NULL,
  thumbnail_url TEXT,
  is_public BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
\\\`\\\`\\\`

## Admin Features Required
1. Add/Edit/Delete content items
2. Toggle visibility (is_public)
3. Drag-drop reordering
4. Image upload (via Supabase Storage)
5. "Publish" button → uploads JSON to CDN
6. Publish history & rollback

## Public Display Features
1. Auto-fetch content.json on load
2. Grid/List view toggle
3. Category filtering
4. Search functionality
5. Auto-refresh option (for live displays)
6. Offline fallback (last cached version)

## Output Format
Output TWO separate HTML files:
1. \\\`admin.html\\\` - The management dashboard
2. \\\`public.html\\\` - The public display page

Use ${lang} for all user-facing text.
\`;
};

// 🆕 CMS 双向数据流说明 Prompt
export const GET_CMS_ARCHITECTURE_PROMPT = () => {
  return \`## SparkVertex CMS 架构说明

### 数据流向

\\\`\\\`\\\`
[Public 访客]                    [Local 管理员]
     |                               |
     | HTTP GET                      | PGLite
     v                               v
+----------+                   +-----------+
| CDN/静态  | <---- Publish ---| 本地数据库 |
| JSON文件  |                   | (浏览器)   |
+----------+                   +-----------+
                                     ^
                                     | Sync
                                     v
                              +-----------+
                              | Supabase  |
                              | inbox_    |
                              | messages  |
                              +-----------+
                                     ^
                                     | Encrypt + POST
                                     |
                              [Public 表单提交]
\\\`\\\`\\\`

### 安全模型
- 公开内容: 静态 JSON，无认证
- 管理操作: 需登录 + Owner 验证
- 表单提交: 公钥加密 → 私钥解密
\`;
};
```

---

### 🎨 第三阶段：前端组件开发 (2-3 周)

#### 3.1 新增管理端组件

**新增文件: `components/LocalDBManager.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';

interface LocalDBManagerProps {
  appId: string;
  onDataChange?: (data: any[]) => void;
}

export default function LocalDBManager({ appId, onDataChange }: LocalDBManagerProps) {
  const [isReady, setIsReady] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [backupConnected, setBackupConnected] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date | null>(null);
  
  useEffect(() => {
    initDB();
  }, [appId]);
  
  const initDB = async () => {
    // @ts-ignore
    if (window.sparkDB) {
      // @ts-ignore
      await window.sparkDB.init();
      setIsReady(true);
      loadData();
    }
  };
  
  const loadData = async () => {
    // @ts-ignore
    const result = await window.sparkDB.query('SELECT * FROM submissions ORDER BY created_at DESC');
    setData(result.rows);
    onDataChange?.(result.rows);
  };
  
  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      // @ts-ignore
      await window.sparkSync?.sync();
      await loadData();
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      setSyncStatus('error');
    }
  };
  
  const handleConnectBackup = async () => {
    // @ts-ignore
    const success = await window.sparkBackup?.connect();
    setBackupConnected(success);
  };
  
  const handleBackup = async () => {
    // @ts-ignore
    const success = await window.sparkBackup?.save();
    if (success) {
      setLastBackup(new Date());
    }
  };
  
  const handleExport = async () => {
    // @ts-ignore
    const exportData = await window.sparkDB.exportAll();
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spark-export-${appId}-${Date.now()}.json`;
    a.click();
  };
  
  return (
    <div className="bg-slate-800 rounded-xl p-4 space-y-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <span className="text-sm text-slate-400">
            {isReady ? 'Database Ready' : 'Initializing...'}
          </span>
        </div>
        <span className="text-xs text-slate-500">{data.length} records</span>
      </div>
      
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSync}
          disabled={syncStatus === 'syncing'}
          className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <i className={`fa-solid ${syncStatus === 'syncing' ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} />
          {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
        </button>
        
        {!backupConnected ? (
          <button
            onClick={handleConnectBackup}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center gap-2"
          >
            <i className="fa-solid fa-hard-drive" />
            Connect Backup
          </button>
        ) : (
          <button
            onClick={handleBackup}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm flex items-center gap-2"
          >
            <i className="fa-solid fa-floppy-disk" />
            Save Backup
          </button>
        )}
        
        <button
          onClick={handleExport}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center gap-2"
        >
          <i className="fa-solid fa-download" />
          Export JSON
        </button>
      </div>
      
      {/* Last Backup Info */}
      {lastBackup && (
        <div className="text-xs text-slate-500">
          Last backup: {lastBackup.toLocaleString()}
        </div>
      )}
    </div>
  );
}
```

#### 3.2 创作页面集成

**修改 `app/create/page.tsx`**

需要在生成流程中检测应用类型，并根据需要注入后端模板代码。

---

### 🔐 第四阶段：安全与加密 (1-2 周)

#### 4.1 端到端加密实现

**新增文件: `lib/crypto-utils.ts`**

```typescript
// 生成密钥对
export async function generateKeyPair(): Promise<{
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );
  
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  
  return { publicKey, privateKey };
}

// 使用公钥加密
export async function encryptWithPublicKey(
  data: any,
  publicKeyJwk: JsonWebKey
): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    encoded
  );
  
  return btoa(JSON.stringify({
    data: Array.from(new Uint8Array(encrypted))
  }));
}

// 使用私钥解密
export async function decryptWithPrivateKey(
  encryptedPayload: string,
  privateKeyJwk: JsonWebKey
): Promise<any> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  
  const { data } = JSON.parse(atob(encryptedPayload));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    new Uint8Array(data)
  );
  
  return JSON.parse(new TextDecoder().decode(decrypted));
}
```

---

### 📊 第五阶段：迁移系统 (2 周)

#### 5.1 Schema 对比与迁移生成

**新增文件: `lib/schema-migration.ts`**

```typescript
interface Column {
  name: string;
  type: string;
  nullable?: boolean;
  default?: any;
}

interface Table {
  name: string;
  columns: Column[];
}

interface Schema {
  tables: Table[];
}

interface MigrationResult {
  version: number;
  sql: string;
  dangerous: boolean;
  warnings: string[];
}

export function generateMigration(
  oldSchema: Schema,
  newSchema: Schema,
  currentVersion: number
): MigrationResult {
  const migrations: string[] = [];
  const warnings: string[] = [];
  let dangerous = false;
  
  // 1. 检查新增/删除的表
  const oldTableNames = new Set(oldSchema.tables.map(t => t.name));
  const newTableNames = new Set(newSchema.tables.map(t => t.name));
  
  // 新增的表
  for (const table of newSchema.tables) {
    if (!oldTableNames.has(table.name)) {
      const columns = table.columns.map(c => 
        `${c.name} ${c.type}${c.nullable === false ? ' NOT NULL' : ''}${c.default !== undefined ? ` DEFAULT ${c.default}` : ''}`
      ).join(', ');
      migrations.push(`CREATE TABLE IF NOT EXISTS ${table.name} (${columns});`);
    }
  }
  
  // 删除的表 (危险操作)
  for (const tableName of oldTableNames) {
    if (!newTableNames.has(tableName)) {
      dangerous = true;
      warnings.push(`Table "${tableName}" will be DROPPED. All data will be lost!`);
      migrations.push(`-- DANGEROUS: DROP TABLE ${tableName};`);
    }
  }
  
  // 2. 检查列变更
  for (const newTable of newSchema.tables) {
    const oldTable = oldSchema.tables.find(t => t.name === newTable.name);
    if (!oldTable) continue;
    
    const oldColumns = new Map(oldTable.columns.map(c => [c.name, c]));
    const newColumns = new Map(newTable.columns.map(c => [c.name, c]));
    
    // 新增的列
    for (const [name, col] of newColumns) {
      if (!oldColumns.has(name)) {
        const defaultValue = col.default !== undefined ? col.default : 
          (col.type.includes('TEXT') ? "''" : 
           col.type.includes('INT') ? '0' : 'NULL');
        migrations.push(
          `ALTER TABLE ${newTable.name} ADD COLUMN IF NOT EXISTS ${name} ${col.type} DEFAULT ${defaultValue};`
        );
      }
    }
    
    // 删除的列 (危险操作)
    for (const [name] of oldColumns) {
      if (!newColumns.has(name)) {
        dangerous = true;
        warnings.push(`Column "${newTable.name}.${name}" will be DROPPED. Data will be lost!`);
        migrations.push(`-- DANGEROUS: ALTER TABLE ${newTable.name} DROP COLUMN ${name};`);
      }
    }
    
    // 类型变更检测
    for (const [name, newCol] of newColumns) {
      const oldCol = oldColumns.get(name);
      if (oldCol && oldCol.type !== newCol.type) {
        warnings.push(`Column "${newTable.name}.${name}" type changing from ${oldCol.type} to ${newCol.type}`);
        migrations.push(
          `ALTER TABLE ${newTable.name} ALTER COLUMN ${name} TYPE ${newCol.type} USING ${name}::${newCol.type};`
        );
      }
    }
  }
  
  return {
    version: currentVersion + 1,
    sql: migrations.join('\n'),
    dangerous,
    warnings
  };
}
```

---

### 🌐 第六阶段：CMS 双向数据流 (1-2 周)

> **目标**: 将 SparkVertex 从 "表单收集工具" 升级为 "无服务器 CMS 平台"

#### 6.1 Public → Local (数据收集，已在前几阶段完成)

这部分已在第一阶段的 Inbox Messages 中实现：
- ✅ 公开表单 → 加密提交 → inbox_messages
- ✅ 管理端同步 → 解密 → 本地 PGLite

#### 6.2 Local → Public (内容发布)

**核心组件**:

```
┌──────────────────────────────────────────────────────────────────┐
│                     CMS 内容发布流程                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Admin Dashboard]                                               │
│       │                                                          │
│       │ 1. 编辑内容 (PGLite cms_content 表)                      │
│       │                                                          │
│       ▼                                                          │
│  [点击发布]                                                       │
│       │                                                          │
│       │ 2. 提取 is_public=true 的记录                            │
│       │                                                          │
│       ▼                                                          │
│  [生成 content.json]                                             │
│       │                                                          │
│       │ 3. POST /api/cms/publish                                 │
│       │    - 验证 owner                                          │
│       │    - 上传到 Supabase Storage                             │
│       │    - 更新 public_content 表                              │
│       │                                                          │
│       ▼                                                          │
│  [CDN 静态文件]                                                   │
│       │                                                          │
│       │ 4. 公开 URL 可访问                                       │
│       │    https://xxx.supabase.co/storage/v1/object/public/     │
│       │    cms/{app_id}/content.json                             │
│       │                                                          │
│       ▼                                                          │
│  [Public Viewer]                                                 │
│       │                                                          │
│       └── 5. fetch() → 渲染展示                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 6.3 CMS 应用场景模板

| 场景 | 内容类型 | 展示形式 | 特殊功能 |
|------|---------|---------|---------|
| 餐厅菜单 | menu_item | 分类网格 | 价格、辣度、售罄标记 |
| 活动日程 | event | 时间线列表 | 日期过滤、倒计时 |
| 产品目录 | product | 商品卡片 | 库存、规格选择 |
| 微型博客 | post | 信息流 | 标签、时间排序 |
| 团队展示 | member | 头像网格 | 职位、联系方式 |
| FAQ 页面 | faq | 折叠面板 | 搜索、分类 |

#### 6.4 CMS Admin UI 组件

**新增文件: `components/CMSAdminPanel.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';

interface CMSItem {
  id: string;
  content_type: string;
  title: string;
  content_json: any;
  is_public: boolean;
  sort_order: number;
}

interface CMSAdminPanelProps {
  appId: string;
  contentType: string;
  onPublish?: (result: any) => void;
}

export default function CMSAdminPanel({ appId, contentType, onPublish }: CMSAdminPanelProps) {
  const [items, setItems] = useState<CMSItem[]>([]);
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'success' | 'error'>('idle');
  const [lastPublish, setLastPublish] = useState<Date | null>(null);
  
  useEffect(() => {
    loadItems();
  }, [contentType]);
  
  const loadItems = async () => {
    // @ts-ignore
    const result = await window.sparkDB.query(
      'SELECT * FROM cms_content WHERE content_type = $1 ORDER BY sort_order, created_at DESC',
      [contentType]
    );
    setItems(result.rows);
  };
  
  const handlePublish = async () => {
    setPublishStatus('publishing');
    try {
      // @ts-ignore
      const result = await window.sparkCMS.publish();
      setPublishStatus('success');
      setLastPublish(new Date());
      onPublish?.(result);
      setTimeout(() => setPublishStatus('idle'), 3000);
    } catch (e) {
      setPublishStatus('error');
      console.error('Publish failed:', e);
    }
  };
  
  const toggleVisibility = async (itemId: string, currentState: boolean) => {
    // @ts-ignore
    await window.sparkDB.query(
      'UPDATE cms_content SET is_public = $1, updated_at = NOW() WHERE id = $2',
      [!currentState, itemId]
    );
    loadItems();
  };
  
  return (
    <div className="cms-admin-panel bg-white rounded-xl shadow-lg p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">内容管理</h2>
        <button
          onClick={handlePublish}
          disabled={publishStatus === 'publishing'}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            publishStatus === 'publishing' ? 'bg-gray-400' :
            publishStatus === 'success' ? 'bg-green-500 text-white' :
            publishStatus === 'error' ? 'bg-red-500 text-white' :
            'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {publishStatus === 'publishing' ? '发布中...' :
           publishStatus === 'success' ? '✅ 已发布' :
           publishStatus === 'error' ? '❌ 失败' :
           '📤 发布到公开'}
        </button>
      </div>
      
      {/* Item List */}
      <div className="space-y-3">
        {items.map((item) => (
          <div 
            key={item.id}
            className={`p-4 border rounded-lg flex items-center justify-between ${
              item.is_public ? 'border-green-200 bg-green-50' : 'border-gray-200'
            }`}
          >
            <div>
              <h3 className="font-medium">{item.title}</h3>
              <span className="text-sm text-gray-500">{item.content_type}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleVisibility(item.id, item.is_public)}
                className={`px-3 py-1 rounded text-sm ${
                  item.is_public 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {item.is_public ? '🌐 公开' : '🔒 隐藏'}
              </button>
              <button className="text-blue-500 hover:text-blue-700">编辑</button>
              <button className="text-red-500 hover:text-red-700">删除</button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Last Publish Info */}
      {lastPublish && (
        <div className="mt-4 text-sm text-gray-500 text-right">
          上次发布: {lastPublish.toLocaleString()}
        </div>
      )}
    </div>
  );
}
```

---

## 📋 实施检查清单

### 第一阶段 ✅
- [ ] 创建 `inbox_messages` 表
- [ ] 创建 `public_content` 表
- [ ] 扩展 `items` 表 (app_manifest, schema_version, has_backend)
- [ ] 实现 `/api/mailbox/submit` 接口
- [ ] 实现 `/api/mailbox/sync` 接口
- [ ] 实现 `/api/mailbox/ack` 接口
- [ ] 添加定时清理任务

### 第一阶段 (多媒体) 🆕
- [ ] 创建 `inbox-files` Storage Bucket
- [ ] 创建 `public-assets` Storage Bucket
- [ ] 配置 Bucket RLS 策略
- [ ] 实现 `/api/mailbox/upload` 加密文件上传接口
- [ ] 实现 `/api/cms/upload` 公开资源上传接口
- [ ] 创建 `file-upload.ts` 加密上传模板
- [ ] 创建 `image-compress.ts` 图片压缩模板
- [ ] 创建 `chunked-upload.ts` 大文件分片上传模板

### 第二阶段 ✅
- [ ] 更新意图分类器 (检测后端需求)
- [ ] 创建 PGLite 模板代码
- [ ] 创建同步服务模板
- [ ] 创建备份服务模板
- [ ] 更新 AI System Prompt
- [ ] 实现迁移 Prompt

### 第三阶段 ✅
- [ ] 创建 `LocalDBManager` 组件
- [ ] 集成到创作页面
- [ ] 添加密钥管理 UI
- [ ] 添加备份文件选择 UI

### 第四阶段 ✅
- [ ] 实现 `crypto-utils.ts`
- [ ] 集成到生成的代码中
- [ ] 测试端到端加密流程

### 第五阶段 ✅
- [ ] 实现 Schema 对比算法
- [ ] 实现迁移 SQL 生成
- [ ] 危险操作警告系统
- [ ] 用户确认流程

### 第六阶段 🆕 (CMS)
- [ ] 创建 `public_content` 表
- [ ] 实现 `/api/cms/publish` 接口
- [ ] 实现 `/api/cms/content/[appId]` 接口
- [ ] 创建 CMS Publish Service 模板
- [ ] 创建 CMS Public Viewer 模板
- [ ] 更新 Intent Classifier 支持 CMS_APP
- [ ] 添加 CMS 专用 AI Prompt
- [ ] 创建 `CMSAdminPanel` 组件
- [ ] 配置 Supabase Storage 公开桶
- [ ] 实现发布历史和回滚功能

---

## 🎯 成功指标

1. **功能完整性**
   - 用户可以生成带数据收集功能的应用
   - 数据可以在本地 PGLite 中存储
   - 支持硬盘备份和恢复
   - 支持云端同步

2. **CMS 能力**
   - 用户可以创建内容管理型应用 (餐厅菜单、活动日程等)
   - 支持 Local → Public 内容发布
   - 公开内容通过 CDN 静态文件分发
   - 支持发布历史和版本回滚

3. **多媒体能力 🆕 (Secure Drop-box)**
   - 用户可以上传加密的身份证、录音、视频证据
   - 平台无法查看上传的私密文件 (端到端加密)
   - 管理员可以发布图片、视频到公开 CDN
   - 支持浏览器端图片压缩 (WebP 转换)
   - 支持大文件分片加密上传

4. **安全性**
   - 平台无法读取用户的业务数据 (端到端加密)
   - 私钥仅存储在用户本地
   - 公开内容与私密数据完全隔离
   - 加密文件上传使用一次性对称密钥 + 非对称加密

5. **用户体验**
   - 现有应用可以平滑升级 (Schema Migration)
   - 数据不会因为迭代而丢失
   - 离线也能正常使用本地功能
   - CMS 发布一键完成，无需技术背景
   - 文件上传带进度指示，支持断点续传

---

## 📚 参考资源

- [PGLite 官方文档](https://github.com/electric-sql/pglite)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Local-First Software](https://www.inkandswitch.com/local-first/)
- [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) 🆕
- [browser-image-compression](https://github.com/nicktomlin/browser-image-compression) 🆕
- [Uppy File Uploader](https://uppy.io/) 🆕

---

*文档版本: 2.2.0 (Secure Drop-box Extension)*
*最后更新: 2025-12-09*
*新增功能: 多媒体加密传输、公开资源 CDN、图片压缩、大文件分片上传*
*新增功能: CMS 双向数据流、内容发布系统、公开展示端模板*
