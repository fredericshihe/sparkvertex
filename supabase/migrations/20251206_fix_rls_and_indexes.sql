-- Fix RLS performance warnings and add missing indexes
-- This migration optimizes auth.uid() calls in RLS policies and adds indexes for foreign keys

-- 1. Fix RLS policies for credit_orders to prevent re-evaluation of auth.uid() for each row
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own credit orders" ON credit_orders;
DROP POLICY IF EXISTS "Users can create own credit orders" ON credit_orders;

-- Recreate with optimized auth.uid() calls (wrapped in SELECT)
CREATE POLICY "Users can view own credit orders" ON credit_orders
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can create own credit orders" ON credit_orders
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- 2. Add missing indexes for foreign keys to improve query performance

-- Index for feedback.user_id foreign key
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

-- Index for likes.item_id foreign key
CREATE INDEX IF NOT EXISTS idx_likes_item_id ON likes(item_id);

-- Index for scheme_dimensions.dimension_id foreign key
CREATE INDEX IF NOT EXISTS idx_scheme_dimensions_dimension_id ON scheme_dimensions(dimension_id);

-- Index for scoring_dimensions.exam_group_id foreign key
CREATE INDEX IF NOT EXISTS idx_scoring_dimensions_exam_group_id ON scoring_dimensions(exam_group_id);

-- Index for scoring_schemes.exam_group_id foreign key
CREATE INDEX IF NOT EXISTS idx_scoring_schemes_exam_group_id ON scoring_schemes(exam_group_id);

-- Index for students.scoring_scheme_id foreign key
CREATE INDEX IF NOT EXISTS idx_students_scoring_scheme_id ON students(scoring_scheme_id);

-- Add comments
COMMENT ON POLICY "Users can view own credit orders" ON credit_orders IS 'Optimized RLS policy with SELECT-wrapped auth.uid() for better performance';
COMMENT ON POLICY "Users can create own credit orders" ON credit_orders IS 'Optimized RLS policy with SELECT-wrapped auth.uid() for better performance';
