-- Update check_daily_rewards to give 2 credits daily
CREATE OR REPLACE FUNCTION check_daily_rewards()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id uuid;
  last_bonus timestamptz;
  user_credits numeric;
  bonus_amount numeric := 2; -- Updated to 2 credits
  now_time timestamptz := now();
  result json;
BEGIN
  -- Get current user ID
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not logged in');
  END IF;

  -- Get user's current credits and last bonus time
  SELECT credits, last_daily_bonus_at INTO user_credits, last_bonus
  FROM profiles
  WHERE id = user_id;

  -- Handle case where profile doesn't exist (shouldn't happen if triggers work)
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  -- Check if bonus is available (if last_bonus is null or not from today)
  -- We compare the DATE part of the timestamp in the user's timezone (assuming UTC for simplicity or server time)
  IF last_bonus IS NULL OR date(last_bonus) < date(now_time) THEN
    -- Award bonus
    UPDATE profiles
    SET 
      credits = COALESCE(credits, 0) + bonus_amount,
      last_daily_bonus_at = now_time
    WHERE id = user_id;

    RETURN json_build_object(
      'success', true, 
      'rewarded', true, 
      'credits', bonus_amount, 
      'new_balance', COALESCE(user_credits, 0) + bonus_amount
    );
  ELSE
    -- No bonus today
    RETURN json_build_object(
      'success', true, 
      'rewarded', false, 
      'message', 'Already claimed today'
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Log error (in a real system) and return failure
  RAISE WARNING 'Error in check_daily_rewards: %', SQLERRM;
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
