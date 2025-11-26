-- 修复 items 表结构和策略的脚本

-- 1. 确保 items 表存在
CREATE TABLE IF NOT EXISTS public.items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    price NUMERIC DEFAULT 0,
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tags TEXT[],
    prompt TEXT,
    color TEXT DEFAULT 'from-blue-500 to-cyan-500',
    likes INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    icon_url TEXT
);

-- 2. 启用 RLS
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- 3. 检查并移除可能导致 409 错误的唯一约束 (除了主键)
-- 有时候 title 被错误地设置为了唯一
DO $$
BEGIN
    -- 尝试移除 title 的唯一约束（如果存在）
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'items_title_key'
    ) THEN
        ALTER TABLE public.items DROP CONSTRAINT items_title_key;
    END IF;
    
    -- 移除其他可能的非主键唯一约束，防止意外的 409
    -- 注意：这里假设除了主键外，不应该有其他强唯一约束阻碍发布
    -- 如果有特定业务需求（如每个用户不能有同名项目），可以保留，但通常全局唯一是不合理的
END $$;

-- 4. 确保 RLS 策略允许用户发布和管理自己的项目

-- 删除旧策略以防冲突
DROP POLICY IF EXISTS "Anyone can view items" ON public.items;
DROP POLICY IF EXISTS "Users can insert their own items" ON public.items;
DROP POLICY IF EXISTS "Users can update their own items" ON public.items;
DROP POLICY IF EXISTS "Users can delete their own items" ON public.items;

-- 重新创建策略

-- 允许所有人查看项目
CREATE POLICY "Anyone can view items" 
ON public.items FOR SELECT 
USING (true);

-- 允许认证用户插入项目 (关键：必须检查 author_id 是否匹配当前用户)
CREATE POLICY "Users can insert their own items" 
ON public.items FOR INSERT 
WITH CHECK (auth.uid() = author_id);

-- 允许用户更新自己的项目
CREATE POLICY "Users can update their own items" 
ON public.items FOR UPDATE 
USING (auth.uid() = author_id);

-- 允许用户删除自己的项目
CREATE POLICY "Users can delete their own items" 
ON public.items FOR DELETE 
USING (auth.uid() = author_id);

-- 5. 确保存储桶存在且公开 (用于图标上传)
INSERT INTO storage.buckets (id, name, public)
VALUES ('icons', 'icons', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 允许公开读取图标
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'icons' );

-- 允许认证用户上传图标
DROP POLICY IF EXISTS "Authenticated users can upload icons" ON storage.objects;
CREATE POLICY "Authenticated users can upload icons"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'icons' AND auth.role() = 'authenticated' );

-- 允许用户更新/删除自己的图标 (可选，简化起见先允许上传)
