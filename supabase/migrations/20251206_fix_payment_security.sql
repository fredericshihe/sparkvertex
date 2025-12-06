-- Fix payment security issues
-- Issue #1: Add unique constraint on trade_no to prevent duplicate payments
ALTER TABLE credit_orders 
  ADD CONSTRAINT unique_trade_no UNIQUE (trade_no);

-- Add index for better query performance and concurrency
CREATE INDEX IF NOT EXISTS idx_credit_orders_trade_no ON credit_orders(trade_no);
CREATE INDEX IF NOT EXISTS idx_credit_orders_out_trade_no ON credit_orders(out_trade_no);

-- Add composite index for status checking queries (used by check-status API)
CREATE INDEX IF NOT EXISTS idx_credit_orders_user_created ON credit_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_orders_user_status_created ON credit_orders(user_id, status, created_at DESC);

-- Add payment_info column if not exists (for storing original webhook data)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'credit_orders' AND column_name = 'payment_info'
  ) THEN
    ALTER TABLE credit_orders ADD COLUMN payment_info jsonb;
  END IF;
END $$;

-- Add support for pending_credits status (for retry mechanism)
DO $$
BEGIN
  -- Check if the constraint exists and add pending_credits if not present
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'credit_orders_status_check'
  ) THEN
    ALTER TABLE credit_orders DROP CONSTRAINT credit_orders_status_check;
  END IF;
  
  ALTER TABLE credit_orders 
    ADD CONSTRAINT credit_orders_status_check 
    CHECK (status IN ('pending', 'paid', 'failed', 'pending_credits'));
END $$;

-- Add comment for clarity
COMMENT ON COLUMN credit_orders.trade_no IS 'Afdian transaction ID (out_trade_no from webhook), must be unique';
COMMENT ON COLUMN credit_orders.out_trade_no IS 'Our internal order ID (remark), must be unique';
COMMENT ON COLUMN credit_orders.payment_info IS 'Original webhook payload for audit trail';
COMMENT ON COLUMN credit_orders.status IS 'Order status: pending (unpaid), paid (completed), failed, pending_credits (paid but credits not added yet)';
