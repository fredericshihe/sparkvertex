-- Improve check_daily_rewards function stability
CREATE OR REPLACE FUNCTION check_daily_rewards()
RETURNS void AS $$
DECLARE
  user_last_check_in TIMESTAMPTZ;
  current_user_id UUID;
BEGIN
  -- Get current user ID safely
  current_user_id := auth.uid();
  
  -- If no user is logged in, exit gracefully
  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get current user's last check-in time
  SELECT last_check_in INTO user_last_check_in
  FROM profiles
  WHERE id = current_user_id;

  -- If last_check_in is null or it's a new day (comparing dates)
  IF user_last_check_in IS NULL OR DATE(user_last_check_in AT TIME ZONE 'UTC') < DATE(NOW() AT TIME ZONE 'UTC') THEN
     -- Update credits and last_check_in
     UPDATE profiles
     SET 
       generation_credits = COALESCE(generation_credits, 0) + 1,
       modification_credits = COALESCE(modification_credits, 0) + 3,
       last_check_in = NOW()
     WHERE id = current_user_id;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the transaction if possible, or just let it fail but frontend handles it
  RAISE WARNING 'Error in check_daily_rewards: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;
