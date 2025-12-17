-- 修复 feedback 表的 RLS 策略 linter 警告
-- 1. 使用 (select auth.uid()) 代替 auth.uid() 提升性能
-- 2. 清理重复的策略

-- 首先删除所有旧策略
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;
DROP POLICY IF EXISTS "Public can view feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can view their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert_policy" ON public.feedback;
DROP POLICY IF EXISTS "feedback_select_policy" ON public.feedback;
DROP POLICY IF EXISTS "feedback_admin_select_policy" ON public.feedback;
DROP POLICY IF EXISTS "feedback_admin_update_policy" ON public.feedback;

-- 启用 RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- ========== 优化后的策略 ==========

-- 1. INSERT 策略：已登录用户可以提交反馈
-- 使用 (select auth.uid()) 优化性能
CREATE POLICY "feedback_insert_authenticated" ON public.feedback
    FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

-- 2. SELECT 策略：用户可以查看自己的反馈，管理员可以查看所有
-- 合并为一个策略，减少重复检查
CREATE POLICY "feedback_select_own_or_admin" ON public.feedback
    FOR SELECT TO authenticated
    USING (
        (select auth.uid()) = user_id
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = (select auth.uid()) 
            AND profiles.is_admin = true
        )
    );

-- 3. UPDATE 策略：只有管理员可以更新反馈状态
CREATE POLICY "feedback_update_admin_only" ON public.feedback
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = (select auth.uid()) 
            AND profiles.is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = (select auth.uid()) 
            AND profiles.is_admin = true
        )
    );

-- 授予权限
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT UPDATE (status, updated_at) ON public.feedback TO authenticated;

-- 添加注释
COMMENT ON POLICY "feedback_insert_authenticated" ON public.feedback IS '已登录用户可以提交自己的反馈';
COMMENT ON POLICY "feedback_select_own_or_admin" ON public.feedback IS '用户查看自己的反馈，管理员查看所有';
COMMENT ON POLICY "feedback_update_admin_only" ON public.feedback IS '只有管理员可以更新反馈状态';
