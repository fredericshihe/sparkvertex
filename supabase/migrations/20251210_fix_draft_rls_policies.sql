-- ============================================
-- 修复 inbox_messages RLS 策略
-- 支持：1. item.id 作为 app_id  2. draft_{user_id} 格式
-- ============================================

-- 确保 RLS 已启用
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "Owner can read inbox" ON inbox_messages;
DROP POLICY IF EXISTS "Owner can delete inbox" ON inbox_messages;
DROP POLICY IF EXISTS "Owner can update inbox" ON inbox_messages;
DROP POLICY IF EXISTS "Anyone can submit to inbox" ON inbox_messages;

-- 任何人可以提交（公开写入）
CREATE POLICY "Anyone can submit to inbox" ON inbox_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 只有应用所有者可以读取
-- 通过 JOIN items 表来验证 app_id 对应的应用是否属于当前用户
CREATE POLICY "Owner can read inbox" ON inbox_messages
  FOR SELECT
  TO authenticated
  USING (
    -- 方式1: app_id 是 item.id（数字），检查该 item 是否属于当前用户
    EXISTS (
      SELECT 1 FROM items 
      WHERE items.id::TEXT = inbox_messages.app_id 
      AND items.author_id = auth.uid()
    )
    -- 方式2: 草稿模式 draft_{user_id} 或 draft_{user_id}_{session}
    OR app_id LIKE 'draft_' || auth.uid()::TEXT || '%'
  );

-- 只有应用所有者可以删除
CREATE POLICY "Owner can delete inbox" ON inbox_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM items 
      WHERE items.id::TEXT = inbox_messages.app_id 
      AND items.author_id = auth.uid()
    )
    OR app_id LIKE 'draft_' || auth.uid()::TEXT || '%'
  );

-- 只有应用所有者可以更新（标记已处理）
CREATE POLICY "Owner can update inbox" ON inbox_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM items 
      WHERE items.id::TEXT = inbox_messages.app_id 
      AND items.author_id = auth.uid()
    )
    OR app_id LIKE 'draft_' || auth.uid()::TEXT || '%'
  );
