-- 1. Enable pgcrypto extension if not already enabled (required for digest function)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Update all existing items that don't have a hash yet
-- Logic: 
-- 1. regexp_replace(content, '\s+', '', 'g'): Remove all whitespace (spaces, tabs, newlines) globally
-- 2. lower(...): Convert to lowercase
-- 3. digest(..., 'sha256'): Calculate SHA-256 hash (returns bytea)
-- 4. encode(..., 'hex'): Convert bytea to hex string
UPDATE items
SET content_hash = encode(digest(lower(regexp_replace(content, '\s+', '', 'g')), 'sha256'), 'hex')
WHERE content_hash IS NULL;

-- 3. Verify the update (Optional: Select a few to check)
-- SELECT id, title, content_hash FROM items LIMIT 5;
