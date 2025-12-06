-- ========================================
-- Analytics Dashboard 专用 RPC 函数
-- 目的：绕过 RLS 权限，允许 Dashboard 获取统计数据
-- 警告：这些函数会向匿名用户暴露数据，请确保仅在受控环境使用
-- ========================================

-- 1. 获取所有订单（管理员视角）
CREATE OR REPLACE FUNCTION get_admin_orders()
RETURNS SETOF credit_orders
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM credit_orders ORDER BY created_at DESC;
$$;

-- 2. 获取所有用户（管理员视角）
CREATE OR REPLACE FUNCTION get_admin_profiles()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM profiles ORDER BY created_at DESC;
$$;

-- 3. 获取健康监控数据（管理员视角）
CREATE OR REPLACE FUNCTION get_admin_health()
RETURNS SETOF payment_health_monitor
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM payment_health_monitor;
$$;

-- 4. 授权给匿名用户（Dashboard 使用 anon key）
GRANT EXECUTE ON FUNCTION get_admin_orders() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_profiles() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_health() TO anon, authenticated;

-- 添加注释
COMMENT ON FUNCTION get_admin_orders() IS 'Exposes all orders for analytics dashboard (Bypasses RLS)';
COMMENT ON FUNCTION get_admin_profiles() IS 'Exposes all profiles for analytics dashboard (Bypasses RLS)';
COMMENT ON FUNCTION get_admin_health() IS 'Exposes health metrics for analytics dashboard (Bypasses RLS)';
