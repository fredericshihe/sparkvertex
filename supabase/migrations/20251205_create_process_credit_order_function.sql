-- 创建原子性的订单处理函数，解决并发重复支付问题
-- 使用 PostgreSQL 行级锁 (FOR UPDATE) + 事务确保幂等性

CREATE OR REPLACE FUNCTION process_credit_order(
  order_id uuid,
  afdian_trade_no text,
  afdian_order_info jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order record;
  target_user_id uuid;
  credits_to_add int;
  old_credits int;
  new_credits int;
BEGIN
  -- 1. 使用行级锁获取订单（防止并发修改）
  SELECT * INTO target_order
  FROM credit_orders
  WHERE id = order_id
  FOR UPDATE;  -- 关键：行级锁，其他事务必须等待

  -- 2. 检查订单状态（幂等性保证）
  IF target_order.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order already processed',
      'current_status', target_order.status
    );
  END IF;

  -- 3. 检查 trade_no 是否已被其他订单使用（防止重复处理）
  IF EXISTS (
    SELECT 1 FROM credit_orders 
    WHERE trade_no = afdian_trade_no 
    AND id != order_id 
    AND status = 'paid'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Trade number already used by another order'
    );
  END IF;

  -- 4. 更新订单状态
  UPDATE credit_orders
  SET 
    status = 'paid',
    trade_no = afdian_trade_no,
    updated_at = now(),
    payment_info = afdian_order_info
  WHERE id = order_id
  RETURNING user_id, credits INTO target_user_id, credits_to_add;

  -- 5. 原子性地更新用户积分（使用 RETURNING 确保获取最新值）
  UPDATE profiles
  SET credits = COALESCE(credits, 0) + credits_to_add
  WHERE id = target_user_id
  RETURNING credits - credits_to_add, credits INTO old_credits, new_credits;

  -- 6. 返回结果
  RETURN jsonb_build_object(
    'success', true,
    'order_id', order_id,
    'user_id', target_user_id,
    'credits_added', credits_to_add,
    'old_credits', old_credits,
    'new_credits', new_credits
  );

EXCEPTION
  WHEN OTHERS THEN
    -- 发生任何错误时回滚事务
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 添加注释
COMMENT ON FUNCTION process_credit_order IS '原子性处理订单支付和积分发放，防止并发重复支付';
