-- Fix for View and Download Counters
-- The frontend was failing to update counts because:
-- 1. It was validating IDs as UUIDs, but the table uses BIGINT.
-- 2. The RPC functions might be missing or expecting UUIDs.

-- We recreate the functions to accept BIGINT (which matches the 'items' table schema provided).

-- Function to increment page_views (View Count)
-- Drop first to avoid parameter name conflict errors
DROP FUNCTION IF EXISTS increment_views(bigint);
DROP FUNCTION IF EXISTS increment_views(uuid); -- Drop old UUID version if exists

CREATE OR REPLACE FUNCTION increment_views(item_id BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE items
  SET page_views = COALESCE(page_views, 0) + 1
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment downloads (Download Count)
-- Drop first to avoid parameter name conflict errors
DROP FUNCTION IF EXISTS increment_downloads(bigint);
DROP FUNCTION IF EXISTS increment_downloads(uuid); -- Drop old UUID version if exists

CREATE OR REPLACE FUNCTION increment_downloads(item_id BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE items
  SET 
    views = COALESCE(views, 0) + 1,
    downloads = COALESCE(downloads, 0) + 1
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
