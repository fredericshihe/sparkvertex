-- Migration: 20251215_drop_compiled_content.sql
-- Purpose: 删除 `items` 表中的 `compiled_content` 列
-- Run with: psql -h <host> -U <user> -d <db> -f 20251215_drop_compiled_content.sql

BEGIN;

ALTER TABLE public.items
  DROP COLUMN IF EXISTS compiled_content;

COMMIT;
