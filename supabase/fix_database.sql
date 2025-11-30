-- 1. Fix Profiles Table (Add Credits)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS generation_credits INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS modification_credits INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS last_check_in TIMESTAMPTZ DEFAULT NOW();

-- 2. Create Likes Table
CREATE TABLE IF NOT EXISTS likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    item_id UUID NOT NULL, -- References items(id) but we don't enforce FK strictly if items table is dynamic
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, item_id)
);

-- Enable RLS for Likes
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Likes Policies
CREATE POLICY "Users can view all likes" ON likes FOR SELECT USING (true);
CREATE POLICY "Users can insert their own likes" ON likes FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete their own likes" ON likes FOR DELETE USING ((select auth.uid()) = user_id);

-- 3. Create Daily Rewards Function
CREATE OR REPLACE FUNCTION check_daily_rewards()
RETURNS void AS $$
DECLARE
  user_last_check_in TIMESTAMPTZ;
BEGIN
  -- Get current user's last check-in time
  SELECT last_check_in INTO user_last_check_in
  FROM profiles
  WHERE id = auth.uid();

  -- If last_check_in is null or it's a new day (comparing dates)
  IF user_last_check_in IS NULL OR DATE(user_last_check_in AT TIME ZONE 'UTC') < DATE(NOW() AT TIME ZONE 'UTC') THEN
     -- Update credits and last_check_in
     UPDATE profiles
     SET 
       generation_credits = generation_credits + 1,
       modification_credits = modification_credits + 3,
       last_check_in = NOW()
     WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create Generation Tasks Table (if missing)
CREATE TABLE IF NOT EXISTS generation_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  result_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Generation Tasks
ALTER TABLE generation_tasks ENABLE ROW LEVEL SECURITY;

-- Generation Tasks Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_tasks' AND policyname = 'Users can insert their own tasks') THEN
        CREATE POLICY "Users can insert their own tasks" ON generation_tasks FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_tasks' AND policyname = 'Users can view their own tasks') THEN
        CREATE POLICY "Users can view their own tasks" ON generation_tasks FOR SELECT USING ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generation_tasks' AND policyname = 'Users can update their own tasks') THEN
        CREATE POLICY "Users can update their own tasks" ON generation_tasks FOR UPDATE USING ((select auth.uid()) = user_id);
    END IF;
END $$;

-- Enable Realtime for Generation Tasks
ALTER PUBLICATION supabase_realtime ADD TABLE generation_tasks;
