-- Fix function search paths (Security)
-- Explicitly set search_path to prevent malicious code execution
ALTER FUNCTION public.match_items(vector(768), double precision, integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.record_publish_history() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_old_inbox_messages() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_inbox() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_usage_stat(uuid, text, text, integer, bigint) SET search_path = public, pg_temp;

-- Fix duplicate and unoptimized policies on items table
-- Drop all variations of policies to ensure clean slate
DROP POLICY IF EXISTS "Users can delete their own items" ON public.items;
DROP POLICY IF EXISTS "Users can delete own items" ON public.items;
DROP POLICY IF EXISTS "Users can update their own items" ON public.items;
DROP POLICY IF EXISTS "Users can update own items" ON public.items;
DROP POLICY IF EXISTS "Users can insert their own items" ON public.items;
DROP POLICY IF EXISTS "Users can insert own items" ON public.items;
DROP POLICY IF EXISTS "Anyone can view items" ON public.items;
DROP POLICY IF EXISTS "Public items are viewable by everyone" ON public.items;
DROP POLICY IF EXISTS "Users can view own items" ON public.items;

-- Recreate items policies with performance optimization (select auth.uid())
-- Combine public and own items view into one policy to avoid multiple permissive policies warning
CREATE POLICY "Anyone can view public or own items" ON public.items
  FOR SELECT USING (
    is_public = true 
    OR 
    (select auth.uid()) = author_id
  );

CREATE POLICY "Users can insert own items" ON public.items
  FOR INSERT WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "Users can update own items" ON public.items
  FOR UPDATE USING ((select auth.uid()) = author_id);

CREATE POLICY "Users can delete own items" ON public.items
  FOR DELETE USING ((select auth.uid()) = author_id);


-- Fix duplicate and unoptimized policies on public_content table
DROP POLICY IF EXISTS "App owners can insert content" ON public.public_content;
DROP POLICY IF EXISTS "App owners can update content" ON public.public_content;
DROP POLICY IF EXISTS "App owners can delete content" ON public.public_content;
DROP POLICY IF EXISTS "Owner can insert public content" ON public.public_content;
DROP POLICY IF EXISTS "Owner can update public content" ON public.public_content;
DROP POLICY IF EXISTS "Owner can delete public content" ON public.public_content;
DROP POLICY IF EXISTS "Anyone can read public content" ON public.public_content;

-- Recreate public_content policies with performance optimization
-- Note: public_content uses app_id pattern matching for ownership as it has no user_id column
CREATE POLICY "Owner can insert public content" ON public.public_content
  FOR INSERT WITH CHECK (app_id LIKE 'app_' || (select auth.uid())::TEXT || '_%');

CREATE POLICY "Owner can update public content" ON public.public_content
  FOR UPDATE USING (app_id LIKE 'app_' || (select auth.uid())::TEXT || '_%');

CREATE POLICY "Owner can delete public content" ON public.public_content
  FOR DELETE USING (app_id LIKE 'app_' || (select auth.uid())::TEXT || '_%');

CREATE POLICY "Anyone can read public content" ON public.public_content
  FOR SELECT USING (true);


-- Fix other policies mentioned in linter (Performance: auth_rls_initplan)

-- publish_history
DROP POLICY IF EXISTS "Owner can read publish history" ON public.publish_history;
CREATE POLICY "Owner can read publish history" ON public.publish_history
  FOR SELECT USING (published_by = (select auth.uid()));

DROP POLICY IF EXISTS "Owner can insert publish history" ON public.publish_history;
CREATE POLICY "Owner can insert publish history" ON public.publish_history
  FOR INSERT WITH CHECK (published_by = (select auth.uid()));

-- user_keypairs
DROP POLICY IF EXISTS "Users can manage own keypairs" ON public.user_keypairs;
CREATE POLICY "Users can manage own keypairs" ON public.user_keypairs
  FOR ALL USING (user_id = (select auth.uid()));

-- usage_stats
DROP POLICY IF EXISTS "Users can read own usage" ON public.usage_stats;
CREATE POLICY "Users can read own usage" ON public.usage_stats
  FOR SELECT USING (user_id = (select auth.uid()));
