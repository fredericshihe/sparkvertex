-- ========================================
-- 用户活跃度和积分消耗追踪系统
-- 日期: 2025-12-07
-- ========================================

-- 1. 创建用户活动日志表 (追踪每个用户的操作)
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL, -- 'create', 'modify', 'view', 'login', 'publish', 'purchase'
  action_detail jsonb DEFAULT '{}', -- 存储额外信息，如 task_id, item_id 等
  credits_consumed numeric(10, 2) DEFAULT 0, -- 本次操作消耗的积分
  created_at timestamptz DEFAULT now()
);

-- 2. 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_activity_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action_type ON user_activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user_time ON user_activity_logs(user_id, created_at DESC);

-- 3. 启用 RLS
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- 4. 用户只能查看自己的活动日志
CREATE POLICY "Users can view own activity" ON user_activity_logs
  FOR SELECT USING (auth.uid() = user_id);

-- 5. 系统可以插入活动日志 (通过 SECURITY DEFINER 函数)
CREATE POLICY "System can insert activity" ON user_activity_logs
  FOR INSERT WITH CHECK (true);

-- ========================================
-- 记录用户活动的函数
-- ========================================

CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id uuid,
  p_action_type text,
  p_action_detail jsonb DEFAULT '{}',
  p_credits_consumed numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO user_activity_logs (user_id, action_type, action_detail, credits_consumed)
  VALUES (p_user_id, p_action_type, p_action_detail, p_credits_consumed)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- ========================================
-- 分析查询函数 (管理员用)
-- ========================================

-- 1. 获取所有活动日志 (管理员视角)
CREATE OR REPLACE FUNCTION get_admin_activity_logs(
  p_limit int DEFAULT 1000,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  action_type text,
  action_detail jsonb,
  credits_consumed numeric,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, action_type, action_detail, credits_consumed, created_at
  FROM user_activity_logs
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- 2. 获取用户活跃度统计 (按时间段)
CREATE OR REPLACE FUNCTION get_user_activity_stats(
  p_start_date timestamptz DEFAULT NOW() - INTERVAL '7 days',
  p_end_date timestamptz DEFAULT NOW()
)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  total_actions bigint,
  create_count bigint,
  modify_count bigint,
  total_credits_consumed numeric,
  last_activity timestamptz,
  activity_days bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id as user_id,
    p.username,
    p.email,
    COUNT(a.id) as total_actions,
    COUNT(CASE WHEN a.action_type = 'create' THEN 1 END) as create_count,
    COUNT(CASE WHEN a.action_type = 'modify' THEN 1 END) as modify_count,
    COALESCE(SUM(a.credits_consumed), 0) as total_credits_consumed,
    MAX(a.created_at) as last_activity,
    COUNT(DISTINCT DATE(a.created_at)) as activity_days
  FROM profiles p
  LEFT JOIN user_activity_logs a ON p.id = a.user_id 
    AND a.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY p.id, p.username, p.email
  ORDER BY total_actions DESC;
$$;

-- 3. 获取小时级活跃度分布
CREATE OR REPLACE FUNCTION get_hourly_activity_distribution(
  p_start_date timestamptz DEFAULT NOW() - INTERVAL '7 days',
  p_end_date timestamptz DEFAULT NOW()
)
RETURNS TABLE (
  hour_of_day int,
  action_count bigint,
  unique_users bigint,
  credits_consumed numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    EXTRACT(HOUR FROM created_at)::int as hour_of_day,
    COUNT(*) as action_count,
    COUNT(DISTINCT user_id) as unique_users,
    COALESCE(SUM(credits_consumed), 0) as credits_consumed
  FROM user_activity_logs
  WHERE created_at BETWEEN p_start_date AND p_end_date
  GROUP BY EXTRACT(HOUR FROM created_at)
  ORDER BY hour_of_day;
$$;

-- 4. 获取每日活跃度趋势
CREATE OR REPLACE FUNCTION get_daily_activity_trend(
  p_days int DEFAULT 30
)
RETURNS TABLE (
  activity_date date,
  total_actions bigint,
  unique_users bigint,
  new_users bigint,
  credits_consumed numeric,
  create_count bigint,
  modify_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date as d
  ),
  daily_activity AS (
    SELECT 
      DATE(created_at) as activity_date,
      COUNT(*) as total_actions,
      COUNT(DISTINCT user_id) as unique_users,
      SUM(credits_consumed) as credits_consumed,
      COUNT(CASE WHEN action_type = 'create' THEN 1 END) as create_count,
      COUNT(CASE WHEN action_type = 'modify' THEN 1 END) as modify_count
    FROM user_activity_logs
    WHERE created_at >= CURRENT_DATE - (p_days - 1)
    GROUP BY DATE(created_at)
  ),
  daily_new_users AS (
    SELECT 
      DATE(created_at) as join_date,
      COUNT(*) as new_users
    FROM profiles
    WHERE created_at >= CURRENT_DATE - (p_days - 1)
    GROUP BY DATE(created_at)
  )
  SELECT 
    ds.d as activity_date,
    COALESCE(da.total_actions, 0) as total_actions,
    COALESCE(da.unique_users, 0) as unique_users,
    COALESCE(dnu.new_users, 0) as new_users,
    COALESCE(da.credits_consumed, 0) as credits_consumed,
    COALESCE(da.create_count, 0) as create_count,
    COALESCE(da.modify_count, 0) as modify_count
  FROM date_series ds
  LEFT JOIN daily_activity da ON ds.d = da.activity_date
  LEFT JOIN daily_new_users dnu ON ds.d = dnu.join_date
  ORDER BY ds.d;
$$;

-- 5. 获取积分消耗速度统计
CREATE OR REPLACE FUNCTION get_credits_consumption_stats(
  p_days int DEFAULT 7
)
RETURNS TABLE (
  stat_date date,
  total_consumed numeric,
  avg_per_user numeric,
  create_consumed numeric,
  modify_consumed numeric,
  other_consumed numeric,
  active_consumers bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date as d
  ),
  daily_consumption AS (
    SELECT 
      DATE(created_at) as stat_date,
      SUM(credits_consumed) as total_consumed,
      SUM(CASE WHEN action_type = 'create' THEN credits_consumed ELSE 0 END) as create_consumed,
      SUM(CASE WHEN action_type = 'modify' THEN credits_consumed ELSE 0 END) as modify_consumed,
      SUM(CASE WHEN action_type NOT IN ('create', 'modify') THEN credits_consumed ELSE 0 END) as other_consumed,
      COUNT(DISTINCT user_id) as active_consumers
    FROM user_activity_logs
    WHERE created_at >= CURRENT_DATE - (p_days - 1)
      AND credits_consumed > 0
    GROUP BY DATE(created_at)
  )
  SELECT 
    ds.d as stat_date,
    COALESCE(dc.total_consumed, 0) as total_consumed,
    CASE WHEN COALESCE(dc.active_consumers, 0) > 0 
      THEN ROUND(dc.total_consumed / dc.active_consumers, 2)
      ELSE 0 
    END as avg_per_user,
    COALESCE(dc.create_consumed, 0) as create_consumed,
    COALESCE(dc.modify_consumed, 0) as modify_consumed,
    COALESCE(dc.other_consumed, 0) as other_consumed,
    COALESCE(dc.active_consumers, 0) as active_consumers
  FROM date_series ds
  LEFT JOIN daily_consumption dc ON ds.d = dc.stat_date
  ORDER BY ds.d;
$$;

-- 6. 获取实时活跃用户 (最近 N 分钟内有活动)
CREATE OR REPLACE FUNCTION get_realtime_active_users(
  p_minutes int DEFAULT 30
)
RETURNS TABLE (
  user_id uuid,
  username text,
  email text,
  current_credits numeric,
  last_action text,
  last_action_time timestamptz,
  actions_in_period bigint,
  credits_consumed_in_period numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent_activity AS (
    SELECT 
      user_id,
      action_type,
      created_at,
      credits_consumed,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
    FROM user_activity_logs
    WHERE created_at >= NOW() - (p_minutes || ' minutes')::interval
  ),
  user_summary AS (
    SELECT 
      user_id,
      COUNT(*) as actions_in_period,
      SUM(credits_consumed) as credits_consumed_in_period
    FROM recent_activity
    GROUP BY user_id
  )
  SELECT 
    p.id as user_id,
    p.username,
    p.email,
    p.credits as current_credits,
    ra.action_type as last_action,
    ra.created_at as last_action_time,
    us.actions_in_period,
    us.credits_consumed_in_period
  FROM profiles p
  JOIN user_summary us ON p.id = us.user_id
  JOIN recent_activity ra ON p.id = ra.user_id AND ra.rn = 1
  ORDER BY ra.created_at DESC;
$$;

-- 7. 获取用户留存率
CREATE OR REPLACE FUNCTION get_user_retention(
  p_cohort_days int DEFAULT 7
)
RETURNS TABLE (
  cohort_date date,
  cohort_size bigint,
  day_1_retained bigint,
  day_3_retained bigint,
  day_7_retained bigint,
  day_1_rate numeric,
  day_3_rate numeric,
  day_7_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cohorts AS (
    SELECT 
      DATE(created_at) as cohort_date,
      id as user_id
    FROM profiles
    WHERE created_at >= CURRENT_DATE - (p_cohort_days + 7)
      AND created_at < CURRENT_DATE - 7
  ),
  activity AS (
    SELECT DISTINCT user_id, DATE(created_at) as activity_date
    FROM user_activity_logs
  )
  SELECT 
    c.cohort_date,
    COUNT(DISTINCT c.user_id) as cohort_size,
    COUNT(DISTINCT CASE WHEN a.activity_date = c.cohort_date + 1 THEN c.user_id END) as day_1_retained,
    COUNT(DISTINCT CASE WHEN a.activity_date = c.cohort_date + 3 THEN c.user_id END) as day_3_retained,
    COUNT(DISTINCT CASE WHEN a.activity_date = c.cohort_date + 7 THEN c.user_id END) as day_7_retained,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.activity_date = c.cohort_date + 1 THEN c.user_id END) / 
      NULLIF(COUNT(DISTINCT c.user_id), 0), 1) as day_1_rate,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.activity_date = c.cohort_date + 3 THEN c.user_id END) / 
      NULLIF(COUNT(DISTINCT c.user_id), 0), 1) as day_3_rate,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.activity_date = c.cohort_date + 7 THEN c.user_id END) / 
      NULLIF(COUNT(DISTINCT c.user_id), 0), 1) as day_7_rate
  FROM cohorts c
  LEFT JOIN activity a ON c.user_id = a.user_id
  GROUP BY c.cohort_date
  ORDER BY c.cohort_date DESC;
$$;

-- ========================================
-- 授权
-- ========================================

GRANT EXECUTE ON FUNCTION log_user_activity(uuid, text, jsonb, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_activity_logs(int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_activity_stats(timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_hourly_activity_distribution(timestamptz, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_daily_activity_trend(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_credits_consumption_stats(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_realtime_active_users(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_retention(int) TO anon, authenticated;

-- ========================================
-- 注释
-- ========================================

COMMENT ON TABLE user_activity_logs IS '用户活动日志，追踪每个用户的操作和积分消耗';
COMMENT ON FUNCTION log_user_activity IS '记录用户活动，供后端调用';
COMMENT ON FUNCTION get_admin_activity_logs IS '获取所有活动日志（分页）';
COMMENT ON FUNCTION get_user_activity_stats IS '获取指定时间段内的用户活跃度统计';
COMMENT ON FUNCTION get_hourly_activity_distribution IS '获取按小时分布的活跃度统计';
COMMENT ON FUNCTION get_daily_activity_trend IS '获取每日活跃度趋势';
COMMENT ON FUNCTION get_credits_consumption_stats IS '获取积分消耗速度统计';
COMMENT ON FUNCTION get_realtime_active_users IS '获取实时活跃用户列表';
COMMENT ON FUNCTION get_user_retention IS '获取用户留存率分析';
