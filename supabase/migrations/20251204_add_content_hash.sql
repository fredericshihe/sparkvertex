-- Add content_hash column to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create a unique index on content_hash to speed up lookups and ensure uniqueness (optional, but recommended for strict enforcement)
-- Note: We use a partial index or just a regular index. Since we handle the check in application logic, a regular index is fine for performance.
CREATE INDEX IF NOT EXISTS idx_items_content_hash ON items(content_hash);
