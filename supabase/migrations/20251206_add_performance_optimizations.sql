-- Performance optimization: Add stored procedure for profile page counts
-- This reduces multiple round-trips to a single database call

CREATE OR REPLACE FUNCTION get_user_counts(p_user_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'works', (SELECT COUNT(*) FROM items WHERE author_id = p_user_id),
    'purchased', (SELECT COUNT(*) FROM orders WHERE buyer_id = p_user_id),
    'favorites', (SELECT COUNT(*) FROM likes WHERE user_id = p_user_id),
    'pending_orders', (SELECT COUNT(*) FROM orders WHERE seller_id = p_user_id AND status = 'paid')
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_counts(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_user_counts(uuid) IS 'Returns all profile page counts in a single call to reduce latency';
