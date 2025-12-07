-- RAG 日志表：用于分析用户意图分布和系统性能
-- 运行时间: 约 1 秒
-- 用途: 产品洞察、性能监控、优化决策

-- 创建 rag_logs 表
CREATE TABLE IF NOT EXISTS rag_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 用户信息（可选，匿名分析时可为空）
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- 请求信息
    user_query TEXT NOT NULL,                    -- 用户的原始请求
    query_language VARCHAR(10) DEFAULT 'zh',     -- 请求语言 (zh/en)
    
    -- 意图分类结果
    detected_intent VARCHAR(50) NOT NULL,        -- 识别出的意图类型
    intent_confidence FLOAT DEFAULT 0,           -- 分类置信度 (0-1)
    intent_source VARCHAR(20) DEFAULT 'local',   -- 分类来源 (local/deepseek/timeout_fallback)
    
    -- 性能指标
    intent_latency_ms INT DEFAULT 0,             -- 意图分类耗时（毫秒）
    rag_latency_ms INT DEFAULT 0,                -- RAG 检索耗时（毫秒）
    compression_latency_ms INT DEFAULT 0,        -- 压缩耗时（毫秒）
    total_latency_ms INT DEFAULT 0,              -- 总耗时（毫秒）
    
    -- 代码上下文
    code_length INT DEFAULT 0,                   -- 原始代码长度
    compressed_length INT DEFAULT 0,             -- 压缩后长度
    compression_ratio FLOAT DEFAULT 0,           -- 压缩率 (0-1, 越小越好)
    chunks_total INT DEFAULT 0,                  -- 代码块总数
    chunks_selected INT DEFAULT 0,               -- 选中的相关块数
    
    -- 生成结果（可选，需要后续回填）
    generation_success BOOLEAN,                  -- 生成是否成功
    generation_task_id UUID,                     -- 关联的生成任务 ID
    
    -- 元数据
    model VARCHAR(50),                           -- 使用的模型
    client_info JSONB DEFAULT '{}'::jsonb        -- 客户端信息（浏览器、设备等）
);

-- 创建索引以支持常见查询
CREATE INDEX IF NOT EXISTS idx_rag_logs_created_at ON rag_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_logs_user_id ON rag_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_logs_detected_intent ON rag_logs(detected_intent);
CREATE INDEX IF NOT EXISTS idx_rag_logs_intent_source ON rag_logs(intent_source);

-- 创建意图分布统计视图
CREATE OR REPLACE VIEW rag_intent_stats AS
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
FROM rag_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY detected_intent
ORDER BY total_count DESC;

-- 创建每日统计视图
CREATE OR REPLACE VIEW rag_daily_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_requests,
    COUNT(DISTINCT user_id) as unique_users,
    ROUND(AVG(total_latency_ms)::numeric, 0) as avg_latency_ms,
    ROUND(AVG(compression_ratio)::numeric, 3) as avg_compression_ratio,
    ROUND(AVG(CASE WHEN generation_success = true THEN 1 ELSE 0 END)::numeric * 100, 1) as success_rate
FROM rag_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 创建插入日志的函数（供 Edge Function 调用）
CREATE OR REPLACE FUNCTION insert_rag_log(
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

-- 创建更新生成结果的函数（生成完成后回填）
CREATE OR REPLACE FUNCTION update_rag_log_result(
    p_log_id UUID,
    p_generation_success BOOLEAN,
    p_generation_task_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 授予必要的权限
GRANT SELECT, INSERT ON rag_logs TO authenticated;
GRANT SELECT ON rag_intent_stats TO authenticated;
GRANT SELECT ON rag_daily_stats TO authenticated;
GRANT EXECUTE ON FUNCTION insert_rag_log TO authenticated;
GRANT EXECUTE ON FUNCTION update_rag_log_result TO authenticated;

-- 添加 RLS 策略
ALTER TABLE rag_logs ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的日志
CREATE POLICY "Users can view own logs" ON rag_logs
    FOR SELECT USING (auth.uid() = user_id);

-- 允许插入日志（用户可以插入自己的，匿名用户可以插入 null user_id）
CREATE POLICY "Users can insert logs" ON rag_logs
    FOR INSERT WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- 允许更新自己的日志
CREATE POLICY "Users can update own logs" ON rag_logs
    FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE rag_logs IS 'RAG 系统日志，用于分析用户意图分布和系统性能';
COMMENT ON COLUMN rag_logs.detected_intent IS '意图类型: UI_MODIFICATION, LOGIC_FIX, CONFIG_HELP, NEW_FEATURE, QA_EXPLANATION, PERFORMANCE, REFACTOR, DATA_OPERATION, UNKNOWN';
COMMENT ON COLUMN rag_logs.intent_source IS '分类来源: local(本地规则), deepseek(AI分类), timeout_fallback(超时降级)';
