-- Fix payment security issues
-- Issue #1: Add unique constraint on trade_no to prevent duplicate payments
ALTER TABLE credit_orders 
  ADD CONSTRAINT unique_trade_no UNIQUE (trade_no);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_credit_orders_trade_no ON credit_orders(trade_no);
CREATE INDEX IF NOT EXISTS idx_credit_orders_out_trade_no ON credit_orders(out_trade_no);

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

-- Add comment for clarity
COMMENT ON COLUMN credit_orders.trade_no IS 'Afdian transaction ID (out_trade_no from webhook), must be unique';
COMMENT ON COLUMN credit_orders.out_trade_no IS 'Our internal order ID (remark), must be unique';
COMMENT ON COLUMN credit_orders.payment_info IS 'Original webhook payload for audit trail';
