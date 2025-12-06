-- Fix function_search_path_mutable warnings by adding SET search_path to all functions
-- This prevents SQL injection attacks by fixing the schema search path

-- 1. Fix process_credit_order
CREATE OR REPLACE FUNCTION process_credit_order(
  p_user_id UUID,
  p_out_trade_no TEXT,
  p_trade_no TEXT,
  p_amount NUMERIC,
  p_credits INTEGER,
  p_provider TEXT,
  p_payment_info JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_old_credits NUMERIC;
  v_new_credits NUMERIC;
  v_existing_order RECORD;
BEGIN
  -- 1. 开始事务并锁定相关行（防止并发竞争）
  -- 检查是否已存在订单（使用 FOR UPDATE 锁定）
  SELECT * INTO v_existing_order
  FROM credit_orders
  WHERE trade_no = p_trade_no OR out_trade_no = p_out_trade_no
  FOR UPDATE;
  
  -- 如果订单已存在且已支付，直接返回
  IF FOUND AND v_existing_order.status = 'paid' THEN
    RAISE EXCEPTION 'Order already exists and paid: %', p_trade_no;
  END IF;
  
  -- 2. 验证用户存在并锁定用户行
  SELECT credits INTO v_old_credits
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
  
  -- 3. 创建或更新订单
  IF FOUND AND v_existing_order.id IS NOT NULL THEN
    -- 更新现有订单
    UPDATE credit_orders
    SET 
      status = 'paid',
      trade_no = p_trade_no,
      amount = p_amount,
      credits = p_credits,
      payment_info = p_payment_info,
      updated_at = NOW()
    WHERE id = v_existing_order.id
    RETURNING id INTO v_order_id;
  ELSE
    -- 创建新订单
    INSERT INTO credit_orders (
      user_id,
      out_trade_no,
      trade_no,
      amount,
      credits,
      status,
      provider,
      payment_info
    )
    VALUES (
      p_user_id,
      p_out_trade_no,
      p_trade_no,
      p_amount,
      p_credits,
      'paid',
      p_provider,
      p_payment_info
    )
    RETURNING id INTO v_order_id;
  END IF;
  
  -- 4. 更新用户积分
  v_new_credits := v_old_credits + p_credits;
  
  UPDATE profiles
  SET credits = v_new_credits
  WHERE id = p_user_id;
  
  -- 5. 返回结果
  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'old_credits', v_old_credits,
    'new_credits', v_new_credits
  );
  
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Order already exists: %', p_trade_no;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to process order: %', SQLERRM;
END;
$$;

-- 2. Fix retry_pending_credit_orders
CREATE OR REPLACE FUNCTION retry_pending_credit_orders()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_order RECORD;
  v_old_credits NUMERIC;
  v_new_credits NUMERIC;
BEGIN
  -- 查找所有 pending_credits 状态的订单
  FOR v_order IN 
    SELECT * FROM credit_orders
    WHERE status = 'pending_credits'
    ORDER BY created_at ASC
    LIMIT 100
  LOOP
    BEGIN
      -- 获取用户当前积分并锁定
      SELECT credits INTO v_old_credits
      FROM profiles
      WHERE id = v_order.user_id
      FOR UPDATE;
      
      IF NOT FOUND THEN
        -- 用户不存在，标记订单为失败
        UPDATE credit_orders
        SET status = 'failed', updated_at = NOW()
        WHERE id = v_order.id;
        
        v_failed_count := v_failed_count + 1;
        CONTINUE;
      END IF;
      
      -- 更新积分
      v_new_credits := v_old_credits + v_order.credits;
      
      UPDATE profiles
      SET credits = v_new_credits
      WHERE id = v_order.user_id;
      
      -- 更新订单状态为已支付
      UPDATE credit_orders
      SET status = 'paid', updated_at = NOW()
      WHERE id = v_order.id;
      
      v_processed_count := v_processed_count + 1;
      
    EXCEPTION
      WHEN OTHERS THEN
        v_failed_count := v_failed_count + 1;
        -- 记录错误但继续处理下一个订单
        RAISE NOTICE 'Failed to process order %: %', v_order.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN json_build_object(
    'processed', v_processed_count,
    'failed', v_failed_count
  );
END;
$$;

-- 3. Fix cleanup_expired_orders
CREATE OR REPLACE FUNCTION cleanup_expired_orders()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- 删除24小时前创建的未支付订单
  WITH deleted AS (
    DELETE FROM credit_orders
    WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;
  
  RETURN json_build_object(
    'deleted_count', v_deleted_count,
    'timestamp', NOW()
  );
END;
$$;

-- 4. Fix check_daily_rewards
-- Drop and recreate to change return type
DROP FUNCTION IF EXISTS check_daily_rewards();

CREATE FUNCTION check_daily_rewards()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_last_check_in TIMESTAMPTZ;
BEGIN
  -- Get current user's last check-in time
  SELECT last_check_in INTO user_last_check_in
  FROM profiles
  WHERE id = auth.uid();

  -- If last_check_in is null or it's a new day (comparing dates)
  IF user_last_check_in IS NULL OR DATE(user_last_check_in AT TIME ZONE 'UTC') < DATE(NOW() AT TIME ZONE 'UTC') THEN
     -- Update credits and last_check_in
     UPDATE profiles
     SET 
       generation_credits = generation_credits + 1,
       modification_credits = modification_credits + 3,
       last_check_in = NOW()
     WHERE id = auth.uid();
  END IF;
END;
$$;

-- 5. Fix handle_new_user
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, generation_credits, modification_credits, last_check_in)
  VALUES (
    new.id, 
    new.email, 
    10, -- Default generation credits
    20, -- Default modification credits
    NOW()
  );
  RETURN new;
END;
$$;

-- 6. Fix match_items (vector similarity search)
-- Drop and recreate to ensure clean state
DROP FUNCTION IF EXISTS match_items(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_items(vector, float, int);

CREATE FUNCTION match_items(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.title,
    items.description,
    1 - (items.embedding <=> query_embedding) as similarity
  FROM items
  WHERE 1 - (items.embedding <=> query_embedding) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comments
COMMENT ON FUNCTION process_credit_order IS 'Atomically process credit order with concurrency protection (search_path secured)';
COMMENT ON FUNCTION retry_pending_credit_orders IS 'Retry failed credit additions for pending_credits orders (search_path secured)';
COMMENT ON FUNCTION cleanup_expired_orders IS 'Clean up expired unpaid orders older than 24 hours (search_path secured)';
COMMENT ON FUNCTION check_daily_rewards IS 'Award daily credits to users (search_path secured)';
COMMENT ON FUNCTION handle_new_user IS 'Initialize new user profile with default credits (search_path secured)';
COMMENT ON FUNCTION match_items IS 'Vector similarity search for items (search_path secured)';
