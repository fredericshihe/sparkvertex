-- Change credits column to numeric to support fractional credits
ALTER TABLE profiles ALTER COLUMN credits TYPE numeric;

-- Update deduct_credits function to accept numeric
CREATE OR REPLACE FUNCTION deduct_credits(amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid;
  current_credits numeric;
  new_credits numeric;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  SELECT credits INTO current_credits FROM profiles WHERE id = current_user_id;
  
  IF current_credits >= amount THEN
    UPDATE profiles 
    SET credits = credits - amount 
    WHERE id = current_user_id 
    RETURNING credits INTO new_credits;
    
    RETURN json_build_object('success', true, 'credits', new_credits);
  ELSE
    RETURN json_build_object('success', false, 'credits', current_credits, 'error', 'Insufficient credits');
  END IF;
END;
$$;

-- Update check_daily_bonus to handle numeric
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
  bonus_amount numeric := 2;
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
