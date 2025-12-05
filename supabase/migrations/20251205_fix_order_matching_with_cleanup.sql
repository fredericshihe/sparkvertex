-- 步骤 1: 查看当前重复的 pending 订单
SELECT 
  user_id, 
  amount, 
  provider, 
  COUNT(*) as count,
  STRING_AGG(out_trade_no, ', ') as order_numbers,
  STRING_AGG(id::text, ', ') as order_ids
FROM credit_orders 
WHERE status = 'pending' AND provider = 'afdian'
GROUP BY user_id, amount, provider
HAVING COUNT(*) > 1;

-- 步骤 2: 对于重复的订单，保留最新的一个，将其他的标记为 expired
-- 这个查询会显示哪些订单将被标记为 expired
WITH duplicates AS (
  SELECT 
    id,
    user_id,
    amount,
    out_trade_no,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, amount, provider 
      ORDER BY created_at DESC
    ) as rn
  FROM credit_orders
  WHERE status = 'pending' AND provider = 'afdian'
)
SELECT 
  id,
  user_id,
  amount,
  out_trade_no,
  created_at,
  'Will be marked as expired' as action
FROM duplicates
WHERE rn > 1
ORDER BY user_id, amount, created_at DESC;

-- 步骤 3: 执行清理（将重复订单标记为 expired）
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, amount, provider 
      ORDER BY created_at DESC
    ) as rn
  FROM credit_orders
  WHERE status = 'pending' AND provider = 'afdian'
)
UPDATE credit_orders
SET 
  status = 'expired',
  updated_at = now()
FROM duplicates
WHERE credit_orders.id = duplicates.id 
  AND duplicates.rn > 1
RETURNING 
  credit_orders.id,
  credit_orders.out_trade_no,
  credit_orders.user_id,
  credit_orders.amount,
  credit_orders.created_at;

-- 步骤 4: 验证清理结果（应该没有重复了）
SELECT 
  user_id, 
  amount, 
  provider, 
  COUNT(*) as count
FROM credit_orders 
WHERE status = 'pending' AND provider = 'afdian'
GROUP BY user_id, amount, provider
HAVING COUNT(*) > 1;

-- 步骤 5: 现在可以安全地创建唯一性约束
-- 先添加元数据字段
ALTER TABLE credit_orders 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_credit_orders_metadata 
ON credit_orders USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_credit_orders_amount_status 
ON credit_orders(amount, status) WHERE provider = 'afdian';

CREATE INDEX IF NOT EXISTS idx_credit_orders_created_at 
ON credit_orders(created_at) WHERE status = 'pending';

-- 创建唯一性约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_orders_user_amount_pending 
ON credit_orders(user_id, amount, provider) 
WHERE status = 'pending';

-- 添加注释
COMMENT ON COLUMN credit_orders.metadata IS '订单元数据，包含匹配辅助信息（如 user_private_id, fingerprint 等）';
COMMENT ON INDEX idx_credit_orders_user_amount_pending IS '防止同一用户创建多个相同金额的待支付订单';
