-- Update handle_new_user to set default credits to 30 for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits, last_daily_bonus_at)
  VALUES (
    new.id, 
    new.email, 
    30, -- Default credits for new users (Updated to 30)
    NOW()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update check_daily_bonus to give 0.5 credits daily
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
  bonus_amount numeric := 0.5; -- Updated to 0.5
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
