-- Fix function search paths to address security linter warnings
-- Setting search_path prevents malicious code from executing with the privileges of the function creator

-- 1. Fix increment_downloads
ALTER FUNCTION public.increment_downloads(bigint, text) SET search_path = public, pg_temp;

-- 2. Fix increment_views
ALTER FUNCTION public.increment_views(bigint, text) SET search_path = public, pg_temp;

-- 3. Fix update_daily_ranks
ALTER FUNCTION public.update_daily_ranks() SET search_path = public, pg_temp;

-- 4. Fix calculate_item_total_score
ALTER FUNCTION public.calculate_item_total_score() SET search_path = public, pg_temp;

-- 5. Drop unused/legacy functions that might be causing linter warnings
DROP FUNCTION IF EXISTS public.increment_page_views(bigint);
DROP FUNCTION IF EXISTS public.increment_page_views(bigint, text);
DROP FUNCTION IF EXISTS public.increment_downloads(bigint);
DROP FUNCTION IF EXISTS public.increment_views(bigint);
