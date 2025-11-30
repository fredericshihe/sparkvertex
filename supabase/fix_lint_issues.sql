-- 1. Fix Security Issue: Function Search Path Mutable
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
ALTER FUNCTION public.update_likes_count() SET search_path = public;

-- 2. Fix Performance Issue: Multiple Permissive Policies on 'likes' table
-- We are removing duplicate policies to ensure only one policy exists per action/role.
-- Keeping the more descriptive ones or the ones recently added.

-- Drop potential duplicates for DELETE
DROP POLICY IF EXISTS "Users can delete own likes" ON public.likes;
-- Keep: "Users can delete their own likes"

-- Drop potential duplicates for INSERT
DROP POLICY IF EXISTS "Users can insert own likes" ON public.likes;
-- Keep: "Users can insert their own likes"

-- Drop potential duplicates for SELECT
DROP POLICY IF EXISTS "Public can view likes" ON public.likes;
-- Keep: "Users can view all likes"


-- 3. Fix Performance Issue: Unindexed Foreign Keys
-- Adding indexes to foreign keys to improve join performance.

-- public.feedback(user_id)
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);

-- public.generation_tasks(user_id)
CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_id ON public.generation_tasks(user_id);

-- public.items(author_id)
CREATE INDEX IF NOT EXISTS idx_items_author_id ON public.items(author_id);

-- public.likes(item_id)
CREATE INDEX IF NOT EXISTS idx_likes_item_id ON public.likes(item_id);

-- public.orders(buyer_id)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);

-- public.orders(item_id)
CREATE INDEX IF NOT EXISTS idx_orders_item_id ON public.orders(item_id);

-- public.orders(seller_id)
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);

-- public.scheme_dimensions(dimension_id)
CREATE INDEX IF NOT EXISTS idx_scheme_dimensions_dimension_id ON public.scheme_dimensions(dimension_id);

-- public.scoring_schemes(exam_group_id)
CREATE INDEX IF NOT EXISTS idx_scoring_schemes_exam_group_id ON public.scoring_schemes(exam_group_id);

-- public.students(scoring_scheme_id)
CREATE INDEX IF NOT EXISTS idx_students_scoring_scheme_id ON public.students(scoring_scheme_id);
