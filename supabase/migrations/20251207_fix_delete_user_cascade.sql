-- Fix "Database error deleting user" by adding ON DELETE CASCADE to foreign keys
-- This ensures that when a user is deleted from auth.users, all related data is also deleted.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- 1. profiles.id -> auth.users.id
    -- Find constraint for profiles.id
    SELECT con.conname INTO r
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'profiles' AND con.contype = 'f'
    AND EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'id'
    );
    
    IF FOUND THEN
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || r.conname;
    END IF;
    
    ALTER TABLE public.profiles 
    ADD CONSTRAINT profiles_id_fkey 
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


    -- 2. credit_orders.user_id -> auth.users.id
    SELECT con.conname INTO r
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'credit_orders' AND con.contype = 'f'
    AND EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'user_id'
    );

    IF FOUND THEN
        EXECUTE 'ALTER TABLE public.credit_orders DROP CONSTRAINT ' || r.conname;
    END IF;

    ALTER TABLE public.credit_orders
    ADD CONSTRAINT credit_orders_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


    -- 3. generation_tasks.user_id -> auth.users.id
    SELECT con.conname INTO r
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND rel.relname = 'generation_tasks' AND con.contype = 'f'
    AND EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'user_id'
    );

    IF FOUND THEN
        EXECUTE 'ALTER TABLE public.generation_tasks DROP CONSTRAINT ' || r.conname;
    END IF;

    ALTER TABLE public.generation_tasks
    ADD CONSTRAINT generation_tasks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


    -- 4. items.user_id -> auth.users.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'user_id') THEN
        SELECT con.conname INTO r
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'items' AND con.contype = 'f'
        AND EXISTS (
            SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'user_id'
        );

        IF FOUND THEN
            EXECUTE 'ALTER TABLE public.items DROP CONSTRAINT ' || r.conname;
        END IF;

        ALTER TABLE public.items
        ADD CONSTRAINT items_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;


    -- 5. orders.buyer_id -> auth.users.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_id') THEN
        SELECT con.conname INTO r
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'orders' AND con.contype = 'f'
        AND EXISTS (
            SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'buyer_id'
        );

        IF FOUND THEN
            EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || r.conname;
        END IF;

        ALTER TABLE public.orders
        ADD CONSTRAINT orders_buyer_id_fkey
        FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;


    -- 6. orders.seller_id -> auth.users.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'seller_id') THEN
        SELECT con.conname INTO r
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'orders' AND con.contype = 'f'
        AND EXISTS (
            SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'seller_id'
        );

        IF FOUND THEN
            EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || r.conname;
        END IF;

        ALTER TABLE public.orders
        ADD CONSTRAINT orders_seller_id_fkey
        FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;


    -- 7. feedback.user_id -> auth.users.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'user_id') THEN
        SELECT con.conname INTO r
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'feedback' AND con.contype = 'f'
        AND EXISTS (
            SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'user_id'
        );

        IF FOUND THEN
            EXECUTE 'ALTER TABLE public.feedback DROP CONSTRAINT ' || r.conname;
        END IF;

        ALTER TABLE public.feedback
        ADD CONSTRAINT feedback_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    -- 8. analytics_events.user_id -> auth.users.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'user_id') THEN
        SELECT con.conname INTO r
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' AND rel.relname = 'analytics_events' AND con.contype = 'f'
        AND EXISTS (
            SELECT 1 FROM pg_attribute a WHERE a.attrelid = rel.oid AND a.attnum = ANY(con.conkey) AND a.attname = 'user_id'
        );

        IF FOUND THEN
            EXECUTE 'ALTER TABLE public.analytics_events DROP CONSTRAINT ' || r.conname;
        END IF;

        ALTER TABLE public.analytics_events
        ADD CONSTRAINT analytics_events_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

END $$;
