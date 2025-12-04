-- Add English analysis reason field
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS analysis_reason_en TEXT;

-- Add comment for clarity
COMMENT ON COLUMN items.analysis_reason IS '中文分析原因';
COMMENT ON COLUMN items.analysis_reason_en IS 'English analysis reason';
