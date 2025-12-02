-- 1. Ensure profiles table exists and has required columns
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  credits NUMERIC DEFAULT 30,
  last_daily_bonus_at TIMESTAMPTZ
);

-- 2. Add columns if they are missing (idempotent)
DO $$
BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits NUMERIC DEFAULT 30;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_daily_bonus_at TIMESTAMPTZ;
EXCEPTION
    WHEN duplicate_column THEN RAISE NOTICE 'Column already exists';
END $$;

-- 3. Fix the handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits, last_daily_bonus_at)
  VALUES (
    new.id, 
    new.email, 
    30, 
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      credits = COALESCE(public.profiles.credits, EXCLUDED.credits);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
