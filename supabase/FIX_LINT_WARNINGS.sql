-- ========================================
-- 修复 Security Linter 警告 (Function Search Path Mutable)
-- 目的：为 SECURITY DEFINER 函数设置固定的 search_path，防止 SQL 注入
-- 执行方式：在 Supabase Dashboard > SQL Editor 中运行
-- ========================================

-- 1. 修复 get_admin_orders (Analytics Dashboard)
CREATE OR REPLACE FUNCTION get_admin_orders()
RETURNS SETOF credit_orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM credit_orders ORDER BY created_at DESC;
$$;

-- 2. 修复 get_admin_profiles (Analytics Dashboard)
CREATE OR REPLACE FUNCTION get_admin_profiles()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM profiles ORDER BY created_at DESC;
$$;

-- 3. 修复 get_admin_health (Analytics Dashboard)
CREATE OR REPLACE FUNCTION get_admin_health()
RETURNS SETOF payment_health_monitor
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM payment_health_monitor;
$$;

-- 4. 修复 handle_new_user (User Signup Trigger)
-- 保留了最新的逻辑（处理 metadata, credits, conflict）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  username text;
  full_name text;
  avatar_url text;
BEGIN
  -- Extract metadata from raw_user_meta_data
  username := new.raw_user_meta_data->>'username';
  full_name := new.raw_user_meta_data->>'full_name';
  avatar_url := new.raw_user_meta_data->>'avatar_url';

  -- Fallback if username is null (use email prefix)
  IF username IS NULL THEN
    username := split_part(new.email, '@', 1);
  END IF;
  
  -- Fallback if full_name is null
  IF full_name IS NULL THEN
    full_name := username;
  END IF;

  INSERT INTO public.profiles (
    id, 
    email, 
    username, 
    full_name, 
    avatar_url, 
    credits, 
    last_daily_bonus_at
  )
  VALUES (
    new.id, 
    new.email, 
    username, 
    full_name, 
    avatar_url, 
    46, -- Default credits for new users
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      username = COALESCE(EXCLUDED.username, public.profiles.username),
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      credits = COALESCE(public.profiles.credits, EXCLUDED.credits);
  
  RETURN new;
END;
$$;

-- 5. 修复 get_user_counts (Profile Page Performance)
CREATE OR REPLACE FUNCTION get_user_counts(p_user_id uuid)
RETURNS json 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 重新授权（以防万一）
GRANT EXECUTE ON FUNCTION get_admin_orders() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_profiles() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_health() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_counts(uuid) TO authenticated;

-- 添加注释
COMMENT ON FUNCTION get_admin_orders() IS 'Exposes all orders for analytics dashboard (Bypasses RLS, search_path secured)';
COMMENT ON FUNCTION get_admin_profiles() IS 'Exposes all profiles for analytics dashboard (Bypasses RLS, search_path secured)';
COMMENT ON FUNCTION get_admin_health() IS 'Exposes health metrics for analytics dashboard (Bypasses RLS, search_path secured)';
COMMENT ON FUNCTION handle_new_user() IS 'Initialize new user profile with default credits (search_path secured)';
COMMENT ON FUNCTION get_user_counts(uuid) IS 'Returns all profile page counts in a single call (search_path secured)';
