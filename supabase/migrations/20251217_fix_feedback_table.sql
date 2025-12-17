-- 修复 feedback 表问题
-- 1. 确保表存在
-- 2. 确保所有需要的字段存在
-- 3. 确保 RLS 策略正确

-- 首先确保 profiles 表有 is_admin 列
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_admin') THEN
        ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 创建 feedback 表（如果不存在）
CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    type TEXT NOT NULL DEFAULT 'bug',
    content TEXT NOT NULL,
    screenshot TEXT,
    user_agent TEXT,
    page_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 添加缺失的列（如果表已存在但列不存在）
DO $$
BEGIN
    -- email 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'email') THEN
        ALTER TABLE public.feedback ADD COLUMN email TEXT;
    END IF;
    
    -- screenshot 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'screenshot') THEN
        ALTER TABLE public.feedback ADD COLUMN screenshot TEXT;
    END IF;
    
    -- user_agent 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'user_agent') THEN
        ALTER TABLE public.feedback ADD COLUMN user_agent TEXT;
    END IF;
    
    -- page_url 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'page_url') THEN
        ALTER TABLE public.feedback ADD COLUMN page_url TEXT;
    END IF;
    
    -- status 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'status') THEN
        ALTER TABLE public.feedback ADD COLUMN status TEXT DEFAULT 'pending';
    END IF;
    
    -- updated_at 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'updated_at') THEN
        ALTER TABLE public.feedback ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);

-- 启用 RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users can view their own feedback" ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert_policy" ON public.feedback;
DROP POLICY IF EXISTS "feedback_select_policy" ON public.feedback;
DROP POLICY IF EXISTS "feedback_admin_select_policy" ON public.feedback;

-- 创建 RLS 策略：允许已登录用户插入反馈
CREATE POLICY "feedback_insert_policy" ON public.feedback
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 创建 RLS 策略：允许用户查看自己的反馈
CREATE POLICY "feedback_select_policy" ON public.feedback
    FOR SELECT
    USING (auth.uid() = user_id);

-- 创建 RLS 策略：允许管理员查看所有反馈
-- 管理员通过 profiles 表的 is_admin 字段识别
CREATE POLICY "feedback_admin_select_policy" ON public.feedback
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.is_admin = true
        )
    );

-- 授予权限
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT SELECT ON public.feedback TO anon;

-- 添加注释
COMMENT ON TABLE public.feedback IS '用户反馈表';
COMMENT ON COLUMN public.feedback.type IS '反馈类型: bug 或 feature';
COMMENT ON COLUMN public.feedback.status IS '处理状态: pending, in_progress, resolved, closed';
