-- Restore missing columns and RLS policies for items table

-- 1. Add missing columns if they don't exist
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category text DEFAULT 'tool';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Sync user_id with author_id if needed
UPDATE public.items SET user_id = author_id WHERE user_id IS NULL;

-- 3. Enable RLS
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public items are viewable by everyone" ON public.items;
DROP POLICY IF EXISTS "Users can view own items" ON public.items;
DROP POLICY IF EXISTS "Users can insert their own items" ON public.items;
DROP POLICY IF EXISTS "Users can update own items" ON public.items;
DROP POLICY IF EXISTS "Users can delete own items" ON public.items;

-- 5. Recreate Policies

-- Allow read access to everyone for public items
CREATE POLICY "Public items are viewable by everyone" ON public.items
  FOR SELECT USING (is_public = true);

-- Allow read access to owners for their own items (including drafts)
CREATE POLICY "Users can view own items" ON public.items
  FOR SELECT USING (auth.uid() = author_id);

-- Allow insert for authenticated users
CREATE POLICY "Users can insert their own items" ON public.items
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Allow update for owners
CREATE POLICY "Users can update own items" ON public.items
  FOR UPDATE USING (auth.uid() = author_id);

-- Allow delete for owners
CREATE POLICY "Users can delete own items" ON public.items
  FOR DELETE USING (auth.uid() = author_id);

-- 6. Grant permissions
GRANT ALL ON TABLE public.items TO authenticated;
GRANT SELECT ON TABLE public.items TO anon;
GRANT ALL ON TABLE public.items TO service_role;
