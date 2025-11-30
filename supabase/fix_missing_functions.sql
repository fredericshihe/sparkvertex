-- 1. Fix Missing 'check_daily_rewards' Function (Solves 404 Error)
CREATE OR REPLACE FUNCTION check_daily_rewards()
RETURNS void AS $$
DECLARE
  user_last_check_in TIMESTAMPTZ;
BEGIN
  -- Check if profiles table has the necessary columns, if not, we assume they exist or this might fail.
  -- Ideally we should ensure columns exist, but user said "backend has this".
  -- We'll just try to update.
  
  SELECT last_check_in INTO user_last_check_in
  FROM profiles
  WHERE id = auth.uid();

  IF user_last_check_in IS NULL OR DATE(user_last_check_in AT TIME ZONE 'UTC') < DATE(NOW() AT TIME ZONE 'UTC') THEN
     UPDATE profiles
     SET 
       generation_credits = COALESCE(generation_credits, 0) + 1,
       modification_credits = COALESCE(modification_credits, 0) + 3,
       last_check_in = NOW()
     WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix Missing 'update_likes_count' Function (Required by your trigger)
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE items
    SET likes = likes + 1
    WHERE id = NEW.item_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE items
    SET likes = GREATEST(likes - 1, 0)
    WHERE id = OLD.item_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure RLS Policies exist for 'likes' (Solves 406 Error)
-- We use a DO block to avoid errors if policies already exist
DO $$ 
BEGIN
    -- Policy: View all likes
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'likes' AND policyname = 'Users can view all likes') THEN
        CREATE POLICY "Users can view all likes" ON likes FOR SELECT USING (true);
    END IF;

    -- Policy: Insert own likes
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'likes' AND policyname = 'Users can insert their own likes') THEN
        CREATE POLICY "Users can insert their own likes" ON likes FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
    END IF;

    -- Policy: Delete own likes
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'likes' AND policyname = 'Users can delete their own likes') THEN
        CREATE POLICY "Users can delete their own likes" ON likes FOR DELETE USING ((select auth.uid()) = user_id);
    END IF;
END $$;

-- 4. Ensure 'likes' column exists in 'items' table (Required for the trigger to work)
ALTER TABLE items ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
