-- Add provider column to credit_orders table
ALTER TABLE credit_orders 
ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'alipay',
ADD COLUMN IF NOT EXISTS payment_info JSONB;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_credit_orders_provider ON credit_orders(provider);
CREATE INDEX IF NOT EXISTS idx_credit_orders_user_status ON credit_orders(user_id, status);
