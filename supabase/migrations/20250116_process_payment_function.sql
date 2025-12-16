-- 支付宝支付处理函数
-- 用于在异步通知中处理支付成功的订单
CREATE OR REPLACE FUNCTION process_payment(
  p_order_id UUID,
  p_user_id UUID,
  p_credits INT,
  p_trade_no TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 开始事务
  -- 1. 更新订单状态
  UPDATE orders
  SET 
    status = 'completed',
    trade_no = p_trade_no,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'pending'; -- 只处理待支付订单

  -- 2. 更新用户积分
  UPDATE profiles
  SET 
    credits = credits + p_credits,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- 提交事务（自动由PostgreSQL处理）
END;
$$;

-- 添加函数注释
COMMENT ON FUNCTION process_payment IS '处理支付宝支付成功的订单，更新订单状态和用户积分';
