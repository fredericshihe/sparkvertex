-- 修复 RAG Logs 相关的 Lint 警告
-- 1. Security Definer View - 视图安全性问题
-- 2. Function Search Path Mutable - 函数搜索路径问题
-- 3. Auth RLS Initplan - RLS 策略性能问题

-- ============================================
-- 1. 修复视图安全性问题 (SECURITY DEFINER → SECURITY INVOKER)
-- ============================================

-- 删除旧视图并重建为 SECURITY INVOKER
DROP VIEW IF EXISTS public.rag_intent_stats;
DROP VIEW IF EXISTS public.rag_daily_stats;

-- 重建 rag_intent_stats 视图 (使用 SECURITY INVOKER)
CREATE VIEW public.rag_intent_stats 
WITH (security_invoker = true)
AS
SELECT 
    detected_intent,
    COUNT(*) as total_count,
    ROUND(AVG(intent_confidence)::numeric, 2) as avg_confidence,
    ROUND(AVG(intent_latency_ms)::numeric, 0) as avg_latency_ms,
    COUNT(CASE WHEN generation_success = true THEN 1 END) as success_count,
    ROUND(
        COUNT(CASE WHEN generation_success = true THEN 1 END)::numeric / 
        NULLIF(COUNT(CASE WHEN generation_success IS NOT NULL THEN 1 END), 0) * 100, 
        1
    ) as success_rate
FROM public.rag_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY detected_intent
ORDER BY total_count DESC;

-- 重建 rag_daily_stats 视图 (使用 SECURITY INVOKER)
CREATE VIEW public.rag_daily_stats
WITH (security_invoker = true)
AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_requests,
    COUNT(DISTINCT user_id) as unique_users,
    ROUND(AVG(total_latency_ms)::numeric, 0) as avg_latency_ms,
    ROUND(AVG(compression_ratio)::numeric, 3) as avg_compression_ratio,
    ROUND(AVG(CASE WHEN generation_success = true THEN 1 ELSE 0 END)::numeric * 100, 1) as success_rate
FROM public.rag_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 授予视图权限
GRANT SELECT ON public.rag_intent_stats TO authenticated;
GRANT SELECT ON public.rag_daily_stats TO authenticated;

-- ============================================
-- 2. 修复函数搜索路径问题 (添加 search_path)
-- ============================================

-- 删除并重建 insert_rag_log 函数（添加 search_path）
DROP FUNCTION IF EXISTS public.insert_rag_log;

CREATE OR REPLACE FUNCTION public.insert_rag_log(
    p_user_id UUID DEFAULT NULL,
    p_user_query TEXT DEFAULT '',
    p_query_language VARCHAR(10) DEFAULT 'zh',
    p_detected_intent VARCHAR(50) DEFAULT 'UNKNOWN',
    p_intent_confidence FLOAT DEFAULT 0,
    p_intent_source VARCHAR(20) DEFAULT 'local',
    p_intent_latency_ms INT DEFAULT 0,
    p_rag_latency_ms INT DEFAULT 0,
    p_compression_latency_ms INT DEFAULT 0,
    p_total_latency_ms INT DEFAULT 0,
    p_code_length INT DEFAULT 0,
    p_compressed_length INT DEFAULT 0,
    p_compression_ratio FLOAT DEFAULT 0,
    p_chunks_total INT DEFAULT 0,
    p_chunks_selected INT DEFAULT 0,
    p_model VARCHAR(50) DEFAULT NULL,
    p_client_info JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO rag_logs (
        user_id, user_query, query_language,
        detected_intent, intent_confidence, intent_source,
        intent_latency_ms, rag_latency_ms, compression_latency_ms, total_latency_ms,
        code_length, compressed_length, compression_ratio,
        chunks_total, chunks_selected,
        model, client_info
    ) VALUES (
        p_user_id, p_user_query, p_query_language,
        p_detected_intent, p_intent_confidence, p_intent_source,
        p_intent_latency_ms, p_rag_latency_ms, p_compression_latency_ms, p_total_latency_ms,
        p_code_length, p_compressed_length, p_compression_ratio,
        p_chunks_total, p_chunks_selected,
        p_model, p_client_info
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- 删除并重建 update_rag_log_result 函数（添加 search_path）
DROP FUNCTION IF EXISTS public.update_rag_log_result;

CREATE OR REPLACE FUNCTION public.update_rag_log_result(
    p_log_id UUID,
    p_generation_success BOOLEAN,
    p_generation_task_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE rag_logs
    SET 
        generation_success = p_generation_success,
        generation_task_id = p_generation_task_id
    WHERE id = p_log_id;
    
    RETURN FOUND;
END;
$$;

-- 授予函数权限
GRANT EXECUTE ON FUNCTION public.insert_rag_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_rag_log_result TO authenticated;

-- ============================================
-- 3. 修复 RLS 策略性能问题 (auth.uid() → (select auth.uid()))
-- ============================================

-- 删除旧的 RLS 策略
DROP POLICY IF EXISTS "Users can view own logs" ON public.rag_logs;
DROP POLICY IF EXISTS "Users can insert logs" ON public.rag_logs;
DROP POLICY IF EXISTS "Users can update own logs" ON public.rag_logs;

-- 重建 RLS 策略（使用子查询优化性能）
CREATE POLICY "Users can view own logs" ON public.rag_logs
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert logs" ON public.rag_logs
    FOR INSERT WITH CHECK (user_id IS NULL OR (select auth.uid()) = user_id);

CREATE POLICY "Users can update own logs" ON public.rag_logs
    FOR UPDATE USING ((select auth.uid()) = user_id);

-- ============================================
-- 4. 修复 user_activity_logs 的 RLS 策略（如果存在）
-- ============================================

DO $$
BEGIN
    -- 检查表是否存在
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_activity_logs') THEN
        -- 删除旧策略
        DROP POLICY IF EXISTS "Users can view own activity" ON public.user_activity_logs;
        
        -- 重建策略（使用子查询优化性能）
        CREATE POLICY "Users can view own activity" ON public.user_activity_logs
            FOR SELECT USING ((select auth.uid()) = user_id);
    END IF;
END;
$$;

-- ============================================
-- 验证修复
-- ============================================

-- 检查视图是否使用 security_invoker
SELECT 
    schemaname, 
    viewname,
    CASE 
        WHEN definition LIKE '%security_invoker%' THEN 'SECURITY INVOKER ✓'
        ELSE 'Needs check'
    END as security_status
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname IN ('rag_intent_stats', 'rag_daily_stats');

-- 检查函数是否设置了 search_path
SELECT 
    proname as function_name,
    proconfig as config
FROM pg_proc 
WHERE proname IN ('insert_rag_log', 'update_rag_log_result')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

COMMENT ON VIEW public.rag_intent_stats IS 'RAG 意图分布统计视图 (SECURITY INVOKER)';
COMMENT ON VIEW public.rag_daily_stats IS 'RAG 每日统计视图 (SECURITY INVOKER)';
