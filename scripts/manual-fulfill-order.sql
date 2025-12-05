-- 手动补单脚本
-- 适用于支付成功但因为 Webhook 问题导致积分未增加的订单

-- 第一步：查看所有待处理的订单
SELECT 
  id,
  user_id,
  out_trade_no,
  amount,
  credits,
  status,
  created_at,
  provider
FROM credit_orders 
WHERE status = 'pending' 
  AND provider = 'afdian'
ORDER BY created_at DESC;

-- 第二步：确认要处理的订单后，执行补单
-- 替换下面的参数：
-- - <out_trade_no>: 订单号（从上面查询结果中获取）
-- - <user_id>: 用户ID
-- - <credits>: 要增加的积分数

BEGIN;

-- 更新订单状态为已支付
UPDATE credit_orders 
SET 
  status = 'paid',
  trade_no = 'manual_fulfill',
  updated_at = NOW(),
  payment_info = jsonb_build_object(
    'fulfilled_by', 'manual_script',
    'fulfilled_at', NOW(),
    'reason', '手动补单 - Webhook 未触发或处理失败'
  )
WHERE out_trade_no = '1764943799973_100ie6y89';  -- 替换为实际订单号

-- 给用户增加积分
UPDATE profiles 
SET credits = credits + 1  -- 替换为实际积分数
WHERE id = '67f1ff20-1334-468a-8bab-1dbcca75dfe9';  -- 替换为实际用户ID

COMMIT;

-- 第三步：验证结果
SELECT 
  id,
  out_trade_no,
  status,
  credits,
  updated_at
FROM credit_orders 
WHERE out_trade_no = '1764943799973_100ie6y89';  -- 替换为实际订单号

SELECT 
  id,
  credits
FROM profiles 
WHERE id = '67f1ff20-1334-468a-8bab-1dbcca75dfe9';  -- 替换为实际用户ID
