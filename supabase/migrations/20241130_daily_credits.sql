-- 1. Add credit columns and last_check_in to profiles if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS generation_credits INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS modification_credits INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS last_check_in TIMESTAMPTZ DEFAULT NOW();

-- 2. Update the handle_new_user trigger to set default credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, generation_credits, modification_credits, last_check_in)
  VALUES (
    new.id, 
    new.email, 
    10, -- Default generation credits
    20, -- Default modification credits
    NOW()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create RPC function for daily rewards
-- This function checks if the user has logged in today. 
-- If not (last_check_in was yesterday or earlier), it adds daily credits.
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
