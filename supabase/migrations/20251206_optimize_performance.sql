-- Add missing indexes for Profile and Explore page performance
CREATE INDEX IF NOT EXISTS idx_items_author_id ON items(author_id);
CREATE INDEX IF NOT EXISTS idx_items_is_public ON items(is_public);
CREATE INDEX IF NOT EXISTS idx_items_daily_rank ON items(daily_rank);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

-- Function to get tag counts efficiently
CREATE OR REPLACE FUNCTION get_tag_counts()
RETURNS TABLE (tag text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT t.tag, count(*) as count
  FROM items, unnest(tags) as t(tag)
  WHERE is_public = true
  GROUP BY t.tag;
$$;
