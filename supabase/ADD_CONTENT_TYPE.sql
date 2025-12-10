-- 修复 public_content 表结构：添加缺失的列
-- Fix public_content table schema: add missing columns

-- 1. 添加 content_type 列 (如果不存在)
ALTER TABLE public_content 
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'text';

-- 2. 添加 slug 列 (如果不存在)
ALTER TABLE public_content 
ADD COLUMN IF NOT EXISTS slug TEXT;

-- 3. 添加 app_id 列 (如果不存在，以防万一)
ALTER TABLE public_content 
ADD COLUMN IF NOT EXISTS app_id UUID;

-- 4. 设置默认值
UPDATE public_content 
SET content_type = 'text' 
WHERE content_type IS NULL;
