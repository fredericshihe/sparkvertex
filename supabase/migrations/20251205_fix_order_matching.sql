-- 彻底解决金额匹配误匹配问题
-- 方案：增加订单元数据字段和唯一性约束

-- 1. 添加订单元数据字段（用于存储额外的匹配信息）
ALTER TABLE credit_orders 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 2. 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_credit_orders_metadata ON credit_orders USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_credit_orders_amount_status ON credit_orders(amount, status) WHERE provider = 'afdian';
CREATE INDEX IF NOT EXISTS idx_credit_orders_created_at ON credit_orders(created_at) WHERE status = 'pending';

-- 3. 添加部分唯一索引：同一用户相同金额的 pending 订单只能有一个
-- 这防止了用户短时间内创建多个相同金额的订单导致的误匹配
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_orders_user_amount_pending 
ON credit_orders(user_id, amount, provider) 
WHERE status = 'pending';

-- 4. 添加注释
COMMENT ON COLUMN credit_orders.metadata IS '订单元数据，包含匹配辅助信息（如 user_private_id, fingerprint 等）';
COMMENT ON INDEX idx_credit_orders_user_amount_pending IS '防止同一用户创建多个相同金额的待支付订单';
