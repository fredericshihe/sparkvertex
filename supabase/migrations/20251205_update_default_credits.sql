-- Update default credits to 46 for new users

-- 1. Update the default value on the table definition
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 46;

-- 2. Update the handle_new_user trigger function to insert 46 credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits, last_daily_bonus_at)
  VALUES (
    new.id, 
    new.email, 
    46, -- Updated to 46
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      credits = COALESCE(public.profiles.credits, EXCLUDED.credits);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
