-- P0: Security Fixes - Atomic Transaction for Credit Orders
-- This migration adds a stored procedure to handle order processing atomically

-- 创建原子性订单处理函数
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

-- P0: 创建重试失败订单的函数
CREATE OR REPLACE FUNCTION retry_pending_credit_orders()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

-- P1: 添加订单过期时间字段和索引
ALTER TABLE credit_orders 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours');

-- 为过期订单创建索引
CREATE INDEX IF NOT EXISTS idx_credit_orders_expires_at 
ON credit_orders(expires_at) 
WHERE status = 'pending';

-- P1: 创建清理过期订单的函数
CREATE OR REPLACE FUNCTION cleanup_expired_orders()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 添加注释
COMMENT ON FUNCTION process_credit_order IS 'Atomically process credit order with concurrency protection';
COMMENT ON FUNCTION retry_pending_credit_orders IS 'Retry failed credit additions for pending_credits orders';
COMMENT ON FUNCTION cleanup_expired_orders IS 'Clean up expired unpaid orders (older than 24 hours)';

-- P2: 创建订单异常监控视图
CREATE OR REPLACE VIEW payment_health_monitor AS
SELECT 
  COUNT(*) FILTER (WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour') as stale_pending_orders,
  COUNT(*) FILTER (WHERE status = 'pending_credits') as pending_credit_orders,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_orders,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as recent_orders,
  COUNT(*) FILTER (WHERE status = 'paid' AND created_at > NOW() - INTERVAL '1 hour') as recent_paid_orders,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'paid' AND created_at > NOW() - INTERVAL '1 hour')::NUMERIC / 
    NULLIF(COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour'), 0) * 100,
    2
  ) as success_rate_last_hour
FROM credit_orders;

COMMENT ON VIEW payment_health_monitor IS 'Monitor payment system health and detect anomalies';
