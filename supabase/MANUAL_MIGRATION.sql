-- ========================================
-- 性能优化迁移 - 手动执行版本
-- 执行方式：在 Supabase Dashboard > SQL Editor 中运行
-- ========================================

-- ========================================
-- 第一部分：索引优化和 RLS 优化
-- ========================================

-- 1. Fix RLS policies for credit_orders
DROP POLICY IF EXISTS "Users can view own credit orders" ON credit_orders;
DROP POLICY IF EXISTS "Users can create own credit orders" ON credit_orders;

CREATE POLICY "Users can view own credit orders" ON credit_orders
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can create own credit orders" ON credit_orders
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- 2. Profile Page Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_items_author_id ON items(author_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

-- 3. Explore Page Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_items_public_rank ON items(is_public, daily_rank);
CREATE INDEX IF NOT EXISTS idx_items_tags ON items USING gin(tags);

-- 4. Other Foreign Keys
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_item_id ON likes(item_id);

-- 5. 其他表的索引（如果表存在）
DO $$ 
BEGIN
  -- 只在表存在时创建索引
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scheme_dimensions') THEN
    CREATE INDEX IF NOT EXISTS idx_scheme_dimensions_dimension_id ON scheme_dimensions(dimension_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scoring_dimensions') THEN
    CREATE INDEX IF NOT EXISTS idx_scoring_dimensions_exam_group_id ON scoring_dimensions(exam_group_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scoring_schemes') THEN
    CREATE INDEX IF NOT EXISTS idx_scoring_schemes_exam_group_id ON scoring_schemes(exam_group_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'students') THEN
    CREATE INDEX IF NOT EXISTS idx_students_scoring_scheme_id ON students(scoring_scheme_id);
  END IF;
END $$;

-- ========================================
-- 第二部分：存储过程
-- ========================================

-- 创建用户计数存储过程（Profile 页面优化）
CREATE OR REPLACE FUNCTION get_user_counts(p_user_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'works', (SELECT COUNT(*) FROM items WHERE author_id = p_user_id),
    'purchased', (SELECT COUNT(*) FROM orders WHERE buyer_id = p_user_id),
    'favorites', (SELECT COUNT(*) FROM likes WHERE user_id = p_user_id),
    'pending_orders', (SELECT COUNT(*) FROM orders WHERE seller_id = p_user_id AND status = 'paid')
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 授权
GRANT EXECUTE ON FUNCTION get_user_counts(uuid) TO authenticated;

-- 添加注释
COMMENT ON POLICY "Users can view own credit orders" ON credit_orders IS 'Optimized RLS policy with SELECT-wrapped auth.uid() for better performance';
COMMENT ON POLICY "Users can create own credit orders" ON credit_orders IS 'Optimized RLS policy with SELECT-wrapped auth.uid() for better performance';
COMMENT ON FUNCTION get_user_counts(uuid) IS 'Returns all profile page counts in a single call to reduce latency';

-- ========================================
-- 验证迁移
-- ========================================

-- 检查索引是否创建成功
SELECT 
  schemaname,
  tablename, 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN ('items', 'orders', 'likes', 'profiles', 'feedback')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 检查存储过程是否存在
SELECT 
  routine_name, 
  routine_type,
  specific_name
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'get_user_counts';

-- 测试存储过程（替换为实际的 user_id）
-- SELECT get_user_counts('your-user-id-here'::uuid);
