-- Function to clean up old inbox messages
-- This should be scheduled to run daily (e.g., via pg_cron or Supabase Scheduled Functions)

CREATE OR REPLACE FUNCTION cleanup_old_inbox_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete messages older than 30 days for users who DO NOT have permanent storage
    DELETE FROM inbox_messages
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND app_id IN (
        -- Find app_ids belonging to users without permanent storage
        -- Note: This assumes app_id in inbox_messages can be linked to a user.
        -- If app_id is just a string (like 'draft_USERID' or an item ID), we need to resolve it.
        
        -- Case 1: app_id is an Item ID
        SELECT id::text FROM items 
        WHERE author_id IN (
            SELECT id FROM profiles WHERE has_permanent_storage = FALSE
        )
        
        UNION
        
        -- Case 2: app_id is 'draft_USERID'
        SELECT 'draft_' || id::text FROM profiles 
        WHERE has_permanent_storage = FALSE
    );
END;
$$;
