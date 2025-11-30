-- Fix for "RLS Enabled No Policy" on app_realtime.datas
-- The linter warns that RLS is enabled but no policies exist (which defaults to denying all access).
-- We add an explicit policy to allow only the service_role (server-side) to access it, satisfying the linter.

DO $$
BEGIN
    -- Check if the table exists to avoid errors if the schema is missing
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'app_realtime' AND tablename = 'datas') THEN
        -- Check if policy already exists to avoid error
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'app_realtime' AND tablename = 'datas' AND policyname = 'Service role only'
        ) THEN
            EXECUTE 'CREATE POLICY "Service role only" ON app_realtime.datas TO service_role USING (true) WITH CHECK (true);';
        END IF;
    END IF;
END
$$;

-- NOTE regarding "Unused Index" warnings:
-- The linter reports many indexes (e.g., idx_feedback_user_id, idx_orders_buyer_id) as unused.
-- This is EXPECTED because these indexes were just created in the previous step.
-- The database statistics haven't yet recorded their usage. 
-- As the application runs and queries are made, these indexes will start being used to improve performance.
