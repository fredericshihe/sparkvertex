-- ========================================
-- 修复 inbox_messages 表的 RLS 安全策略
-- 目的：确保只有应用所有者才能查看自己的收件消息
-- ========================================

-- 1. 启用 RLS（如果尚未启用）
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

-- 2. 删除所有旧策略（清理重复）
DROP POLICY IF EXISTS "Anyone can submit to inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "Anyone can insert inbox messages" ON public.inbox_messages;
DROP POLICY IF EXISTS "Owner can read inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "Owner can delete inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "Owner can update inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "App owners can read inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "App owners can delete inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "App owners can update inbox" ON public.inbox_messages;
DROP POLICY IF EXISTS "Service role full access" ON public.inbox_messages;

-- ========================================
-- 3. 创建新的 RLS 策略
-- ========================================

-- 3.1 公开写入策略 - 任何人都可以投递消息到信箱
-- 这是必需的，因为表单提交来自匿名用户
CREATE POLICY "Anyone can submit to inbox" ON public.inbox_messages
  FOR INSERT 
  WITH CHECK (TRUE);

-- 3.2 所有者读取策略 - 只有应用所有者可以读取
-- app_id 格式: 
--   1. app_{user_id}_{item_id} (旧格式)
--   2. draft_{user_id}_{session_id} (创作页面草稿)
--   3. {item_id} (已发布应用的数字ID)
-- 使用子查询 (select auth.uid()) 以获得更好的性能
CREATE POLICY "Owner can read inbox" ON public.inbox_messages
  FOR SELECT 
  USING (
    -- 方式1: app_id 以 'app_{user_id}_' 开头 (旧格式)
    app_id LIKE 'app_' || (select auth.uid())::TEXT || '_%'
    OR
    -- 方式2: app_id 以 'draft_{user_id}_' 开头 (创作页面草稿)
    app_id LIKE 'draft_' || (select auth.uid())::TEXT || '_%'
    OR
    -- 方式3: 检查 items 表中该 app_id 对应的 author_id (已发布应用)
    EXISTS (
      SELECT 1 FROM public.items 
      WHERE items.id::TEXT = inbox_messages.app_id 
        AND items.author_id = (select auth.uid())
    )
  );

-- 3.3 所有者删除策略 - 只有应用所有者可以删除
CREATE POLICY "Owner can delete inbox" ON public.inbox_messages
  FOR DELETE 
  USING (
    app_id LIKE 'app_' || (select auth.uid())::TEXT || '_%'
    OR
    app_id LIKE 'draft_' || (select auth.uid())::TEXT || '_%'
    OR
    EXISTS (
      SELECT 1 FROM public.items 
      WHERE items.id::TEXT = inbox_messages.app_id 
        AND items.author_id = (select auth.uid())
    )
  );

-- 3.4 所有者更新策略 - 只有应用所有者可以更新（标记为已处理等）
CREATE POLICY "Owner can update inbox" ON public.inbox_messages
  FOR UPDATE 
  USING (
    app_id LIKE 'app_' || (select auth.uid())::TEXT || '_%'
    OR
    app_id LIKE 'draft_' || (select auth.uid())::TEXT || '_%'
    OR
    EXISTS (
      SELECT 1 FROM public.items 
      WHERE items.id::TEXT = inbox_messages.app_id 
        AND items.author_id = (select auth.uid())
    )
  );

-- ========================================
-- 4. 验证策略
-- ========================================

-- 查看当前的 RLS 策略
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'inbox_messages';

-- ========================================
-- 5. 注意事项
-- ========================================
-- 
-- 如果你使用 Service Role Key 访问数据库（如管理后台），
-- Service Role 会自动绕过 RLS。
-- 
-- 如果你需要在服务端代码中以普通用户身份查询，
-- 请使用 supabase.auth.getUser() 后的用户 session。
--
-- 建议：
-- - 管理后台使用 Service Role Key
-- - 用户端 API 使用用户的 access_token
-- ========================================
