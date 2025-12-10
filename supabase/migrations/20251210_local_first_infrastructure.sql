-- ============================================
-- SparkVertex Local-First Infrastructure Migration
-- Version: 2.2.0
-- Date: 2025-12-10
-- ============================================

-- ============================================
-- 1. 云端信箱表 (所有用户的加密数据暂存)
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,                    -- 应用唯一标识 (app_{user_id}_{item_id})
  encrypted_payload TEXT NOT NULL,         -- 加密后的数据 (平台无法解读)
  metadata JSONB DEFAULT '{}',             -- 非敏感元数据 (时间戳、来源IP等)
  processed BOOLEAN DEFAULT FALSE,         -- 是否已被本地应用拉取
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days') -- 30天后自动过期
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_inbox_app_id ON inbox_messages(app_id);
CREATE INDEX IF NOT EXISTS idx_inbox_processed ON inbox_messages(app_id, processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_inbox_expires ON inbox_messages(expires_at);

-- RLS 策略: 任何人都可以投递，但只有拥有者可以读取
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

-- 公开写入策略 (投递)
DROP POLICY IF EXISTS "Anyone can submit to inbox" ON inbox_messages;
CREATE POLICY "Anyone can submit to inbox" ON inbox_messages
  FOR INSERT WITH CHECK (TRUE);

-- 拥有者读取策略 (支持 app_ 和 draft_ 两种格式)
DROP POLICY IF EXISTS "Owner can read inbox" ON inbox_messages;
CREATE POLICY "Owner can read inbox" ON inbox_messages
  FOR SELECT USING (
    (auth.uid() IS NOT NULL AND (
      app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
      OR app_id LIKE 'draft_' || auth.uid()::TEXT || '%'
    ))
    OR
    (app_id LIKE 'draft_guest_%')
  );

-- 拥有者删除策略 (支持 app_ 和 draft_ 两种格式)
DROP POLICY IF EXISTS "Owner can delete inbox" ON inbox_messages;
CREATE POLICY "Owner can delete inbox" ON inbox_messages
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND (
      app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
      OR app_id LIKE 'draft_' || auth.uid()::TEXT || '%'
    ))
    OR
    (app_id LIKE 'draft_guest_%')
  );

-- 拥有者更新策略 (标记已处理，支持 app_ 和 draft_ 两种格式)
DROP POLICY IF EXISTS "Owner can update inbox" ON inbox_messages;
CREATE POLICY "Owner can update inbox" ON inbox_messages
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND (
      app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
      OR app_id LIKE 'draft_' || auth.uid()::TEXT || '%'
    ))
    OR
    (app_id LIKE 'draft_guest_%')
  );

-- ============================================
-- 2. 公开内容表 (CMS 发布功能)
-- ============================================
CREATE TABLE IF NOT EXISTS public_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL UNIQUE,             -- 应用唯一标识
  content JSONB NOT NULL DEFAULT '{}',     -- 公开内容 (菜单、公告、配置等)
  version INTEGER DEFAULT 1,               -- 内容版本号
  content_hash TEXT,                       -- 内容哈希 (用于检测变更)
  published_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_public_content_app_id ON public_content(app_id);

-- RLS 策略: 任何人可读，只有拥有者可写
ALTER TABLE public_content ENABLE ROW LEVEL SECURITY;

-- 公开读取
DROP POLICY IF EXISTS "Anyone can read public content" ON public_content;
CREATE POLICY "Anyone can read public content" ON public_content
  FOR SELECT USING (TRUE);

-- 拥有者写入
DROP POLICY IF EXISTS "Owner can insert public content" ON public_content;
CREATE POLICY "Owner can insert public content" ON public_content
  FOR INSERT WITH CHECK (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

DROP POLICY IF EXISTS "Owner can update public content" ON public_content;
CREATE POLICY "Owner can update public content" ON public_content
  FOR UPDATE USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

-- ============================================
-- 3. 发布历史表 (版本回滚支持)
-- ============================================
CREATE TABLE IF NOT EXISTS publish_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL,
  content JSONB NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  published_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_publish_history_app_id ON publish_history(app_id);
CREATE INDEX IF NOT EXISTS idx_publish_history_version ON publish_history(app_id, version DESC);

ALTER TABLE publish_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read publish history" ON publish_history;
CREATE POLICY "Owner can read publish history" ON publish_history
  FOR SELECT USING (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

DROP POLICY IF EXISTS "Owner can insert publish history" ON publish_history;
CREATE POLICY "Owner can insert publish history" ON publish_history
  FOR INSERT WITH CHECK (
    app_id LIKE 'app_' || auth.uid()::TEXT || '_%'
  );

-- ============================================
-- 4. 应用清单表 (扩展 items 表)
-- ============================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS app_manifest JSONB DEFAULT '{}';
ALTER TABLE items ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS has_backend BOOLEAN DEFAULT FALSE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS has_cms BOOLEAN DEFAULT FALSE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS public_key TEXT;

-- ============================================
-- 5. 密钥对存储表
-- ============================================
CREATE TABLE IF NOT EXISTS user_keypairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_user_keypairs_user_id ON user_keypairs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_keypairs_app_id ON user_keypairs(app_id);

ALTER TABLE user_keypairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own keypairs" ON user_keypairs;
CREATE POLICY "Users can manage own keypairs" ON user_keypairs
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 6. 用量统计表 (用于计费)
-- ============================================
CREATE TABLE IF NOT EXISTS usage_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  stat_type TEXT NOT NULL,  -- 'inbox_message', 'file_upload', 'cms_publish', 'storage_bytes'
  count INTEGER DEFAULT 0,
  bytes_used BIGINT DEFAULT 0,
  period_start DATE NOT NULL,  -- 统计周期开始日期
  period_end DATE NOT NULL,    -- 统计周期结束日期
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, app_id, stat_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_stats_user ON usage_stats(user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_stats_app ON usage_stats(app_id, stat_type);

ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own usage" ON usage_stats;
CREATE POLICY "Users can read own usage" ON usage_stats
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 7. 定时清理过期信箱数据
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_inbox()
RETURNS void AS $$
BEGIN
  DELETE FROM inbox_messages WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. 更新用量统计函数
-- ============================================
CREATE OR REPLACE FUNCTION increment_usage_stat(
  p_user_id UUID,
  p_app_id TEXT,
  p_stat_type TEXT,
  p_count INTEGER DEFAULT 1,
  p_bytes BIGINT DEFAULT 0
)
RETURNS void AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- 获取当月的开始和结束日期
  v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
  v_period_end := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  
  INSERT INTO usage_stats (user_id, app_id, stat_type, count, bytes_used, period_start, period_end)
  VALUES (p_user_id, p_app_id, p_stat_type, p_count, p_bytes, v_period_start, v_period_end)
  ON CONFLICT (user_id, app_id, stat_type, period_start)
  DO UPDATE SET
    count = usage_stats.count + p_count,
    bytes_used = usage_stats.bytes_used + p_bytes,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. Storage Buckets 配置说明
-- ============================================
-- 注意: Storage Buckets 需要在 Supabase Dashboard 中创建
-- 或使用 Supabase CLI 执行以下命令:
--
-- 加密收件箱 (用户上传的私密文件):
-- supabase storage create inbox-files --public false --file-size-limit 52428800
--
-- 公开资源库 (管理员发布的资源):
-- supabase storage create public-assets --public true --file-size-limit 104857600

-- ============================================
-- 10. 触发器: 自动记录发布历史
-- ============================================
CREATE OR REPLACE FUNCTION record_publish_history()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO publish_history (app_id, content, version, content_hash, published_by)
  VALUES (NEW.app_id, NEW.content, NEW.version, NEW.content_hash, auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_record_publish_history ON public_content;
CREATE TRIGGER trigger_record_publish_history
  AFTER INSERT OR UPDATE ON public_content
  FOR EACH ROW
  EXECUTE FUNCTION record_publish_history();
