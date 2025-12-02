-- Create a table for temporary mobile previews
CREATE TABLE IF NOT EXISTS temp_previews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour') -- Auto expire in 1 hour
);

-- Enable RLS
ALTER TABLE temp_previews ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for creating previews)
-- In a stricter env, we might want to limit this to authenticated users, 
-- but for a "try it out" feature, anonymous is fine, or we can rely on the API to handle auth if needed.
-- Since we are calling this from our own API route (which can bypass RLS with service key if needed, or we can just allow public insert for now)
CREATE POLICY "Allow public insert" ON temp_previews FOR INSERT WITH CHECK (true);

-- Allow anyone to read (for viewing previews on mobile)
CREATE POLICY "Allow public read" ON temp_previews FOR SELECT USING (true);

-- Setup a cron or trigger to clean up old previews? 
-- For now, we can just rely on the application to ignore expired ones, 
-- or let Supabase's pg_cron handle it if available. 
-- A simple index on expires_at helps.
CREATE INDEX IF NOT EXISTS idx_temp_previews_expires_at ON temp_previews(expires_at);
