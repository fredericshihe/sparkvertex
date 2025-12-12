-- 1. Enable pgcrypto extension if not already enabled (required for digest function)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Update all existing items that don't have a hash yet
-- Logic: 
-- 1. Strip out SparkVertex watermark content (random IDs, dates, comments)
-- 2. regexp_replace(content, '\s+', '', 'g'): Remove all whitespace (spaces, tabs, newlines) globally
-- 3. lower(...): Convert to lowercase
-- 4. digest(..., 'sha256'): Calculate SHA-256 hash (returns bytea)
-- 5. encode(..., 'hex'): Convert bytea to hex string

-- Step 1: Create a function to strip watermarks for consistent hashing
CREATE OR REPLACE FUNCTION strip_spark_watermark(content TEXT) RETURNS TEXT AS $$
DECLARE
    stripped TEXT;
BEGIN
    stripped := content;
    
    -- Remove SparkVertex header comment block (contains random ID and date)
    stripped := regexp_replace(stripped, '<!--\s*={50,}[\s\S]*?SparkVertex[\s\S]*?={50,}\s*-->', '', 'gi');
    
    -- Remove spark-vertex-id meta tag
    stripped := regexp_replace(stripped, '<meta\s+name=[''"]spark-vertex-id[''"][^>]*>', '', 'gi');
    stripped := regexp_replace(stripped, '<meta\s+name=[''"]generator[''"][^>]*SparkVertex[^>]*>', '', 'gi');
    
    -- Remove SPARK_VERTEX_ID protection script
    stripped := regexp_replace(stripped, '<script>\s*\(function\(\)\{[\s\S]*?SPARK_VERTEX_ID[\s\S]*?\}\)\(\);\s*</script>', '', 'gi');
    
    -- Remove PUBLIC VERSION comment
    stripped := regexp_replace(stripped, '<!--\s*PUBLIC VERSION[\s\S]*?-->', '', 'gi');

    -- Remove charset meta tag (injectWatermark enforces UTF-8, causing mismatch with original)
    stripped := regexp_replace(stripped, '<meta[^>]*charset=[^>]*>', '', 'gi');
    
    RETURN stripped;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Step 2: Update all items with the correct hash (stripping watermarks first)
UPDATE items
SET content_hash = encode(
    digest(
        lower(regexp_replace(strip_spark_watermark(content), '\s+', '', 'g')), 
        'sha256'
    ), 
    'hex'
)
WHERE content IS NOT NULL;

-- 3. Verify the update (Optional: Select a few to check)
-- SELECT id, title, content_hash FROM items LIMIT 5;
