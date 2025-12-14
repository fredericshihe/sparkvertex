-- Migration: 20251215_add_compiled_content.sql
-- Purpose: 恢复从 `items` 表中被删除的 `compiled_content` 列（用于存储已编译的 HTML/iframe 内容）
-- Run with: psql -h <host> -U <user> -d <db> -f 20251215_add_compiled_content.sql

BEGIN;

-- 1) 在 items 表中添加 compiled_content 列（可为空，类型为 text）
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS compiled_content text;

-- 2) 如果需要，可以在此处添加对该列的注释或默认值
COMMENT ON COLUMN public.items.compiled_content IS '预渲染/已编译的 HTML 内容；为空表示使用原始 content 字段';

COMMIT;
