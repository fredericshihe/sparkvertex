-- 添加 compiled_content 字段用于存储预编译的 JSX
-- 这样可以避免浏览器端加载 1.4MB 的 Babel standalone

-- 为 items 表添加 compiled_content 字段
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS compiled_content TEXT;

-- 添加注释说明
COMMENT ON COLUMN items.compiled_content IS 'Pre-compiled content with JSX transformed to regular JavaScript. Used to eliminate the need for Babel standalone in browser.';

-- 为 public_content 表也添加（CMS 发布用）
ALTER TABLE public_content 
ADD COLUMN IF NOT EXISTS compiled_content TEXT;

COMMENT ON COLUMN public_content.compiled_content IS 'Pre-compiled content with JSX transformed to regular JavaScript.';
