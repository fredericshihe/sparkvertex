/**
 * RAG 日志记录工具
 * 用于追踪用户意图分布、系统性能和优化效果
 */

import { createClient } from '@supabase/supabase-js';
import { UserIntent } from './intent-classifier';

export interface RAGLogEntry {
  // 用户信息
  userId?: string;
  
  // 请求信息
  userQuery: string;
  queryLanguage?: 'zh' | 'en';
  
  // 意图分类结果
  detectedIntent: UserIntent;
  intentConfidence: number;
  intentSource: 'local' | 'deepseek' | 'gemini_fallback' | 'timeout_fallback';
  
  // 性能指标
  intentLatencyMs: number;
  ragLatencyMs?: number;
  compressionLatencyMs?: number;
  totalLatencyMs?: number;
  
  // 代码上下文
  codeLength?: number;
  compressedLength?: number;
  compressionRatio?: number;
  chunksTotal?: number;
  chunksSelected?: number;
  
  // 模型信息
  model?: string;
  
  // 客户端信息
  clientInfo?: Record<string, any>;
}

export interface RAGLogResult {
  logId: string | null;
  success: boolean;
  error?: string;
}

/**
 * 记录 RAG 日志到 Supabase
 * 
 * 注意：这是一个"fire-and-forget"操作，不应该阻塞主流程
 */
export async function logRAGRequest(entry: RAGLogEntry): Promise<RAGLogResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('[RAG Logger] Missing Supabase config, skipping log');
      return { logId: null, success: false, error: 'Missing Supabase config' };
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase.rpc('insert_rag_log', {
      p_user_id: entry.userId || null,
      p_user_query: entry.userQuery.substring(0, 1000), // 限制长度
      p_query_language: entry.queryLanguage || 'zh',
      p_detected_intent: entry.detectedIntent,
      p_intent_confidence: entry.intentConfidence,
      p_intent_source: entry.intentSource,
      p_intent_latency_ms: entry.intentLatencyMs,
      p_rag_latency_ms: entry.ragLatencyMs || 0,
      p_compression_latency_ms: entry.compressionLatencyMs || 0,
      p_total_latency_ms: entry.totalLatencyMs || 0,
      p_code_length: entry.codeLength || 0,
      p_compressed_length: entry.compressedLength || 0,
      p_compression_ratio: entry.compressionRatio || 0,
      p_chunks_total: entry.chunksTotal || 0,
      p_chunks_selected: entry.chunksSelected || 0,
      p_model: entry.model || null,
      p_client_info: entry.clientInfo || {}
    });

    if (error) {
      console.error('[RAG Logger] Insert error:', error);
      return { logId: null, success: false, error: error.message };
    }

    return { logId: data, success: true };
  } catch (error: any) {
    console.error('[RAG Logger] Exception:', error);
    return { logId: null, success: false, error: error.message };
  }
}

/**
 * 更新 RAG 日志的生成结果（生成完成后调用）
 */
export async function updateRAGLogResult(
  logId: string,
  generationSuccess: boolean,
  generationTaskId?: string
): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || !logId) {
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { error } = await supabase.rpc('update_rag_log_result', {
      p_log_id: logId,
      p_generation_success: generationSuccess,
      p_generation_task_id: generationTaskId || null
    });

    if (error) {
      console.error('[RAG Logger] Update error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[RAG Logger] Update exception:', error);
    return false;
  }
}

/**
 * 获取意图统计数据（用于仪表板展示）
 */
export async function getIntentStats(): Promise<any[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from('rag_intent_stats')
      .select('*');

    if (error) {
      console.error('[RAG Logger] Stats query error:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[RAG Logger] Stats exception:', error);
    return [];
  }
}

/**
 * 获取每日统计数据
 */
export async function getDailyStats(): Promise<any[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from('rag_daily_stats')
      .select('*')
      .limit(30);

    if (error) {
      console.error('[RAG Logger] Daily stats query error:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[RAG Logger] Daily stats exception:', error);
    return [];
  }
}

/**
 * 检测查询语言（简单实现）
 */
export function detectQueryLanguage(query: string): 'zh' | 'en' {
  // 检测是否包含中文字符
  const chineseRegex = /[\u4e00-\u9fa5]/;
  return chineseRegex.test(query) ? 'zh' : 'en';
}
