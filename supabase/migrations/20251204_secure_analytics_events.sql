-- Enable RLS on analytics_events table
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Since this table is only accessed via SECURITY DEFINER functions (increment_views, increment_downloads),
-- we do NOT need to add any policies allowing public access.
-- By default, enabling RLS with no policies denies all direct access via the API.
-- This secures the table so only our trusted functions can write to it.
