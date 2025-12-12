-- =====================================================
-- 自动查找并修复所有引用 auth.users 的外键约束
-- 将所有约束改为 ON DELETE CASCADE
-- =====================================================

-- 首先，查找所有引用 auth.users 的外键约束并记录
DO $$
DECLARE
    rec RECORD;
    fk_name TEXT;
    tbl_name TEXT;
    col_name TEXT;
BEGIN
    RAISE NOTICE '开始修复所有引用 auth.users 的外键约束...';
    
    -- 遍历所有引用 auth.users(id) 的外键约束
    FOR rec IN 
        SELECT 
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name 
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu 
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_schema = 'auth'
            AND ccu.table_name = 'users'
            AND tc.table_schema = 'public'
    LOOP
        fk_name := rec.constraint_name;
        tbl_name := rec.table_name;
        col_name := rec.column_name;
        
        RAISE NOTICE '修复约束: %.% -> auth.users (约束名: %)', tbl_name, col_name, fk_name;
        
        -- 删除旧约束
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl_name, fk_name);
        
        -- 添加新约束 (带 ON DELETE CASCADE)
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE',
            tbl_name, fk_name, col_name
        );
        
        RAISE NOTICE '  -> 修复完成';
    END LOOP;
    
    RAISE NOTICE '所有外键约束修复完成！';
END;
$$;

-- =====================================================
-- 额外检查：确保常见表的外键都已正确设置
-- =====================================================

-- items 表 (author_id)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'author_id') THEN
        -- 检查是否已有外键
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public' AND tc.table_name = 'items' 
            AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'author_id'
        ) THEN
            ALTER TABLE public.items ADD CONSTRAINT items_author_id_fkey 
            FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
            RAISE NOTICE 'items.author_id 外键约束已添加';
        END IF;
    END IF;
END;
$$;

-- likes 表
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'likes' AND column_name = 'user_id') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public' AND tc.table_name = 'likes' 
            AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'user_id'
        ) THEN
            ALTER TABLE public.likes ADD CONSTRAINT likes_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
            RAISE NOTICE 'likes.user_id 外键约束已添加';
        END IF;
    END IF;
END;
$$;

-- user_activity_logs 表
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_activity_logs' AND column_name = 'user_id') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public' AND tc.table_name = 'user_activity_logs' 
            AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'user_id'
        ) THEN
            ALTER TABLE public.user_activity_logs ADD CONSTRAINT user_activity_logs_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
            RAISE NOTICE 'user_activity_logs.user_id 外键约束已添加';
        END IF;
    END IF;
END;
$$;

-- rag_logs 表
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rag_logs' AND column_name = 'user_id') THEN
        -- 先删除可能存在的旧约束
        ALTER TABLE public.rag_logs DROP CONSTRAINT IF EXISTS rag_logs_user_id_fkey;
        
        -- 添加新约束 (使用 SET NULL 而不是 CASCADE，因为日志可能需要保留)
        ALTER TABLE public.rag_logs ADD CONSTRAINT rag_logs_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
        RAISE NOTICE 'rag_logs.user_id 外键约束已修复 (ON DELETE SET NULL)';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'rag_logs 表外键修复跳过: %', SQLERRM;
END;
$$;

-- temp_previews 表
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'temp_previews' AND column_name = 'user_id') THEN
        ALTER TABLE public.temp_previews DROP CONSTRAINT IF EXISTS temp_previews_user_id_fkey;
        ALTER TABLE public.temp_previews ADD CONSTRAINT temp_previews_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'temp_previews.user_id 外键约束已修复';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'temp_previews 表外键修复跳过: %', SQLERRM;
END;
$$;

-- draft_items 表 (如果存在)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'draft_items' AND column_name = 'user_id') THEN
        ALTER TABLE public.draft_items DROP CONSTRAINT IF EXISTS draft_items_user_id_fkey;
        ALTER TABLE public.draft_items ADD CONSTRAINT draft_items_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'draft_items.user_id 外键约束已修复';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'draft_items 表外键修复跳过: %', SQLERRM;
END;
$$;
