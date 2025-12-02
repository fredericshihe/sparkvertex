-- Revert check_daily_bonus to give 1 credit daily
CREATE OR REPLACE FUNCTION check_daily_bonus()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  user_credits numeric;
  last_bonus timestamptz;
  bonus_amount numeric := 1; -- Reverted to 1
  now_time timestamptz := now();
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  SELECT credits, last_daily_bonus_at INTO user_credits, last_bonus
  FROM profiles
  WHERE id = current_user_id;

  -- Check if it's a new day (comparing dates)
  IF last_bonus IS NULL OR date(last_bonus AT TIME ZONE 'UTC') < date(now_time AT TIME ZONE 'UTC') THEN
    UPDATE profiles
    SET credits = COALESCE(credits, 0) + bonus_amount,
        last_daily_bonus_at = now_time
    WHERE id = current_user_id
    RETURNING credits INTO user_credits;
    
    RETURN json_build_object('awarded', true, 'credits', user_credits, 'message', 'Daily bonus awarded!');
  ELSE
    RETURN json_build_object('awarded', false, 'credits', user_credits, 'message', 'Already claimed today.');
  END IF;
END;
$$;
