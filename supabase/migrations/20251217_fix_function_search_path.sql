-- 修复 process_payment 和 handle_new_user 的 search_path 安全警告
-- 这些函数可能被后续迁移脚本覆盖，需要重新设置 search_path

-- 1. 修复 process_payment
CREATE OR REPLACE FUNCTION public.process_payment(
  p_order_id UUID,
  p_user_id UUID,
  p_credits INT,
  p_trade_no TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. 更新订单状态
  UPDATE orders
  SET 
    status = 'completed',
    trade_no = p_trade_no,
    updated_at = NOW()
  WHERE id = p_order_id
    AND status = 'pending';

  -- 2. 更新用户积分
  UPDATE profiles
  SET 
    credits = credits + p_credits,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- 2. 修复 handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
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
    10,
    20,
    NOW()
  );
  RETURN new;
END;
$$;

-- 添加注释
COMMENT ON FUNCTION public.process_payment IS '处理支付成功的订单 (search_path secured)';
COMMENT ON FUNCTION public.handle_new_user IS '初始化新用户 profile (search_path secured)';
