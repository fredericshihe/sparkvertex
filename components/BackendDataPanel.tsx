'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, Download, RefreshCw, Trash2, Eye, ChevronRight, Database, Table as TableIcon, LayoutList, CheckCircle, Circle, BarChart3, Filter } from 'lucide-react';
import { detectSparkPlatformFeatures } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';

interface InboxMessage {
  id: string;
  app_id: string;
  encrypted_payload: string;
  metadata: any;
  created_at: string;
  processed: boolean;
}

interface AppItem {
  id: string;
  title: string;
  icon_url?: string;
  content?: string;
}

interface BackendDataPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  appId?: string;
  language: 'zh' | 'en';
  mode?: 'test' | 'production';
  code?: string;
  onCodeUpdate?: (newCode: string) => void;
}

const TRANSLATIONS = {
  zh: {
    title: '表单收集箱',
    subtitle: '查看用户提交的表单数据',
    syncing: '正在同步...',
    connected: '实时连接就绪',
    refresh: '刷新',
    close: '关闭',
    retry: '重试',
    myApps: '我的应用',
    loading: '加载中...',
    noApps: '暂无配置后端的应用',
    noData: '暂无表单数据',
    noDataDesc: '当用户在您的应用中提交表单（如联系我们、报名表）时，数据会显示在这里。',
    howToCollect: '如何收集数据？',
    howToCollectDesc: '在创建应用时，告诉 AI 您需要一个表单。例如：',
    howToCollectExample: '"创建一个活动报名表单，包含姓名、手机号和备注，提交到后台"',
    records: '条记录',
    exportJson: '导出 JSON',
    exportExcel: '导出 Excel',
    time: '提交时间',
    details: '数据详情',
    formData: '表单内容',
    deleteRecord: '删除此记录',
    deleteConfirm: '确定要删除这条记录吗？',
    searchPlaceholder: '搜索数据...',
    statusAll: '全部状态',
    statusProcessed: '已处理',
    statusUnprocessed: '未处理',
    markProcessed: '标记为已处理',
    markUnprocessed: '标记为未处理',
    analysis: '数据分析',
    totalSubmissions: '总提交数',
    processedRate: '处理率',
    todaySubmissions: '今日新增',
    dailyTrend: '近7日趋势',
    viewTable: '表格视图',
    viewJson: 'JSON视图',
    viewAnalysis: '分析视图',
    storagePolicy: '数据存储策略',
    storagePolicyDesc: '默认存储30天。升级永久存储，数据永不过期。',
    upgradeStorage: '升级永久存储 (60积分)',
    permanentStorage: '永久存储已激活',
    confirmUpgradeTitle: '确认升级永久存储？',
    confirmUpgradeDesc: '将消耗 60 积分开启永久数据存储功能。',
    upgradeSuccess: '升级成功！您的数据将永久保存。',
    upgradeFail: '升级失败，请检查积分是否充足。'
  },
  en: {
    title: 'Form Collection Box',
    subtitle: 'View user form submissions',
    syncing: 'Syncing...',
    connected: 'Real-time Connected',
    refresh: 'Refresh',
    close: 'Close',
    retry: 'Retry',
    myApps: 'My Apps',
    loading: 'Loading...',
    noApps: 'No backend-enabled apps found',
    noData: 'No Form Data Yet',
    noDataDesc: 'Data will appear here when users submit forms (like contact forms) in your app.',
    howToCollect: 'How to collect data?',
    howToCollectDesc: 'When creating an app, tell AI you need a form. Example:',
    howToCollectExample: '"Create an event registration form with name, phone, and notes, submitting to backend"',
    records: 'records',
    exportJson: 'Export JSON',
    exportExcel: 'Export Excel',
    time: 'Time',
    details: 'Submission Details',
    formData: 'Form Data',
    deleteRecord: 'Delete Record',
    deleteConfirm: 'Are you sure you want to delete this record?',
    searchPlaceholder: 'Search data...',
    statusAll: 'All Status',
    statusProcessed: 'Processed',
    statusUnprocessed: 'Unprocessed',
    markProcessed: 'Mark as Processed',
    markUnprocessed: 'Mark as Unprocessed',
    analysis: 'Data Analysis',
    totalSubmissions: 'Total Submissions',
    processedRate: 'Processed Rate',
    todaySubmissions: 'New Today',
    dailyTrend: '7-Day Trend',
    viewTable: 'Table View',
    viewJson: 'JSON View',
    viewAnalysis: 'Analysis View',
    storagePolicy: 'Data Storage Policy',
    storagePolicyDesc: 'Default 30-day retention. Upgrade for permanent storage.',
    upgradeStorage: 'Upgrade to Permanent (60 Credits)',
    permanentStorage: 'Permanent Storage Active',
    confirmUpgradeTitle: 'Confirm Upgrade?',
    confirmUpgradeDesc: 'This will cost 60 credits to enable permanent storage.',
    upgradeSuccess: 'Upgrade successful! Your data is now safe forever.',
    upgradeFail: 'Upgrade failed. Please check your credits.'
  }
};

export default function BackendDataPanel({ 
  isOpen, 
  onClose, 
  userId, 
  appId,
  language,
  mode = 'test',
}: BackendDataPanelProps) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const { openConfirmModal } = useModal();
  const { success: toastSuccess, error: toastError } = useToast();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'json' | 'analysis'>('table');
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);

  // Auto-switch to JSON view on mobile
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('json');
    }
  }, []);
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'processed' | 'unprocessed'>('all');
  const [hasPermanentStorage, setHasPermanentStorage] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  // 应用列表（生产模式）
  const [apps, setApps] = useState<AppItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(appId || null);
  const [appsLoading, setAppsLoading] = useState(false);
  
  // 计算实际使用的 app_id
  const effectiveAppId = mode === 'production' 
    ? selectedAppId 
    : (appId || (userId ? `draft_${userId}` : null));
  
  // 🔍 调试日志：排查 app_id 不匹配问题
  useEffect(() => {
    console.log('[BackendDataPanel] Debug:', {
      mode,
      appId,
      userId,
      effectiveAppId,
      selectedAppId
    });
  }, [mode, appId, userId, effectiveAppId, selectedAppId]);
  
  // 获取用户已发布的应用列表（生产模式）
  const fetchApps = useCallback(async () => {
    if (!userId || mode !== 'production') return;
    
    setAppsLoading(true);
    try {
      // Check permanent storage status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('has_permanent_storage')
        .eq('id', userId)
        .single();
      
      if (profileData) {
        setHasPermanentStorage(profileData.has_permanent_storage || false);
      }

      // Fetch published apps
      const { data, error } = await supabase
        .from('items')
        .select('id, title, icon_url, content, is_public')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // 过滤出包含平台后端代码的应用 (仅显示使用了平台表单/CMS功能的应用)
      // 且必须是私密应用 (is_public === false)
      const backendApps = (data || []).filter(app => {
        // Only show PRIVATE apps
        if (app.is_public !== false) return false;
        
        return detectSparkPlatformFeatures(app.content);
      });

      setApps(backendApps);
      
      // 如果没有选中的应用，默认选第一个 (仅在桌面端自动选择，移动端保持在列表页)
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      if (backendApps.length > 0 && !selectedAppId && !isMobile) {
        setSelectedAppId(backendApps[0].id);
      }

    } catch (err: any) {
      console.error('Error fetching apps:', err);
    } finally {
      setAppsLoading(false);
    }
  }, [userId, mode, selectedAppId, language]);

  const handleUpgradeStorage = async () => {
    if (!userId) return;
    
    openConfirmModal({
      title: t.confirmUpgradeTitle,
      message: t.confirmUpgradeDesc,
      confirmText: language === 'zh' ? '确认升级' : 'Confirm Upgrade',
      onConfirm: async () => {
        setUpgrading(true);
        try {
          const { data, error } = await supabase.rpc('purchase_permanent_storage', {
            p_user_id: userId
          });

          if (error) throw error;

          if (data && data.success) {
            setHasPermanentStorage(true);
            toastSuccess(t.upgradeSuccess);
          } else {
            toastError(data?.message || t.upgradeFail);
          }
        } catch (err: any) {
          console.error('Upgrade failed:', err);
          toastError(t.upgradeFail);
        } finally {
          setUpgrading(false);
        }
      }
    });
  };

  const fetchMessages = useCallback(async () => {
    if (!effectiveAppId) return;
    
    setLoading(true);
    setError(null);
    setSelectedMessage(null);
    
    try {
      const appIdStr = String(effectiveAppId);
      
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[BackendDataPanel] Current user:', user?.id);
      console.log('[BackendDataPanel] Fetching messages for app_id:', appIdStr);
      
      const { data, error: fetchError } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('app_id', appIdStr)
        .order('created_at', { ascending: false })
        .limit(100); // Increased limit for table view
      
      console.log('[BackendDataPanel] Query result:', { 
        data, 
        error: fetchError,
        count: data?.length || 0 
      });

      if (fetchError) {
        if (fetchError.code === '42P01') {
          setMessages([]);
        } else {
          throw fetchError;
        }
      } else {
        setMessages(data || []);
      }
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [effectiveAppId]);

  // 加载应用列表（生产模式）
  useEffect(() => {
    if (isOpen && mode === 'production') {
      fetchApps();
    }
  }, [isOpen, mode, fetchApps]);

  useEffect(() => {
    if (isOpen && effectiveAppId) {
      fetchMessages();
      
      // 设置实时订阅
      const filterValue = typeof effectiveAppId === 'string' ? effectiveAppId : String(effectiveAppId);
      
      const channel = supabase
        .channel(`inbox-${filterValue}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'inbox_messages',
            filter: `app_id=eq.${filterValue}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setMessages(prev => [payload.new as InboxMessage, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setMessages(prev => prev.map(m => 
                m.id === payload.new.id ? { ...m, ...payload.new } : m
              ));
            } else if (payload.eventType === 'DELETE') {
              setMessages(prev => prev.filter(m => m.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isOpen, effectiveAppId, fetchMessages]);

  const deleteMessage = async (messageId: string) => {
    openConfirmModal({
      title: language === 'zh' ? '删除记录' : 'Delete Record',
      message: t.deleteConfirm,
      confirmText: language === 'zh' ? '删除' : 'Delete',
      onConfirm: async () => {
        try {
          await supabase
            .from('inbox_messages')
            .delete()
            .eq('id', messageId);
          
          setMessages(prev => prev.filter(m => m.id !== messageId));
          if (selectedMessage?.id === messageId) setSelectedMessage(null);
          toastSuccess(language === 'zh' ? '记录已删除' : 'Record deleted');
        } catch (err) {
          console.error('Delete failed:', err);
          toastError(language === 'zh' ? '删除失败' : 'Delete failed');
        }
      }
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const parsePayload = (payload: string) => {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  };

  // Filter messages
  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      // Status filter
      if (statusFilter === 'processed' && !msg.processed) return false;
      if (statusFilter === 'unprocessed' && msg.processed) return false;

      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const payloadStr = msg.encrypted_payload.toLowerCase();
        const idStr = msg.id.toLowerCase();
        return payloadStr.includes(searchLower) || idStr.includes(searchLower);
      }

      return true;
    });
  }, [messages, statusFilter, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = messages.length;
    const processed = messages.filter(m => m.processed).length;
    const processedRate = total > 0 ? Math.round((processed / total) * 100) : 0;
    
    const today = new Date().toDateString();
    const todayCount = messages.filter(m => new Date(m.created_at).toDateString() === today).length;
    
    // Daily trend (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toDateString();
    }).reverse();
    
    const trend = last7Days.map(dateStr => ({
      date: dateStr,
      count: messages.filter(m => new Date(m.created_at).toDateString() === dateStr).length
    }));

    return { total, processed, processedRate, todayCount, trend };
  }, [messages]);

  const toggleProcessed = async (messageId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('inbox_messages')
        .update({ processed: !currentStatus })
        .eq('id', messageId);

      if (error) throw error;

      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, processed: !currentStatus } : m
      ));
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const exportToExcel = () => {
    const data = filteredMessages.map(msg => {
      const payload = parsePayload(msg.encrypted_payload);
      return {
        ID: msg.id,
        [t.time]: new Date(msg.created_at).toLocaleString(),
        Status: msg.processed ? 'Processed' : 'Unprocessed',
        ...payload
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Submissions");
    XLSX.writeFile(wb, `submissions_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportData = () => {
    const dataStr = JSON.stringify(messages, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inbox-data-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Extract table columns from the first few messages
  const tableColumns = useMemo(() => {
    const columns = new Set<string>();
    // Check first 5 messages to find common keys
    filteredMessages.slice(0, 5).forEach(msg => {
      const data = parsePayload(msg.encrypted_payload);
      if (typeof data === 'object' && data !== null) {
        Object.keys(data).forEach(key => columns.add(key));
      }
    });
    // Convert to array and limit to 5 columns for display
    return Array.from(columns).slice(0, 5);
  }, [filteredMessages]);

  if (!isOpen) return null;

  // 渲染表单提交数据列表
  const renderInboxContent = () => {
    if (loading && messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 h-full">
          <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-500 mb-4"></i>
          <p className="text-slate-400 font-medium">{t.loading}</p>
        </div>
      );
    }
    
    if (messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 h-full text-center">
          <div className="w-20 h-20 bg-zinc-800/50 rounded-full flex items-center justify-center mb-6 border border-zinc-700">
            <Database className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {t.noData}
          </h3>
          <p className="text-slate-400 max-w-md mx-auto mb-8 leading-relaxed">
            {t.noDataDesc}
          </p>
          
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 max-w-md w-full text-left">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <i className="fa-solid fa-code"></i>
              </div>
              <h4 className="font-bold text-white text-sm">{t.howToCollect}</h4>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              {t.howToCollectDesc}
            </p>
            <div className="bg-black rounded-lg p-3 border border-zinc-800 text-xs font-mono text-indigo-300">
              {t.howToCollectExample}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 min-h-0 relative">
        {/* Main Data View (Table/List) */}
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedMessage ? 'w-full md:flex-1 border-r border-zinc-800' : 'w-full'}`}>
          
          {/* Toolbar */}
          <div className="px-4 md:px-6 py-3 border-b border-zinc-800 flex flex-col gap-3 bg-zinc-900/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <button 
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-lg transition shrink-0 ${viewMode === 'table' ? 'bg-zinc-800 text-white' : 'text-slate-400 hover:text-white hover:bg-zinc-800/50'}`}
                  title={t.viewTable}
                >
                  <TableIcon size={16} />
                </button>
                <button 
                  onClick={() => setViewMode('json')}
                  className={`p-2 rounded-lg transition shrink-0 ${viewMode === 'json' ? 'bg-zinc-800 text-white' : 'text-slate-400 hover:text-white hover:bg-zinc-800/50'}`}
                  title={t.viewJson}
                >
                  <LayoutList size={16} />
                </button>
                <button 
                  onClick={() => setViewMode('analysis')}
                  className={`p-2 rounded-lg transition shrink-0 ${viewMode === 'analysis' ? 'bg-zinc-800 text-white' : 'text-slate-400 hover:text-white hover:bg-zinc-800/50'}`}
                  title={t.viewAnalysis}
                >
                  <BarChart3 size={16} />
                </button>
                <div className="h-4 w-px bg-zinc-800 mx-2 shrink-0"></div>
                <span className="text-xs text-slate-500 shrink-0">
                  {filteredMessages.length} {t.records}
                </span>
              </div>
              
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button 
                  onClick={exportData}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition border border-zinc-700 whitespace-nowrap"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">{t.exportJson}</span>
                  <span className="sm:hidden">JSON</span>
                </button>
                <button 
                  onClick={exportToExcel}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-300 rounded-lg text-xs font-medium transition border border-emerald-900/50 whitespace-nowrap"
                >
                  <TableIcon size={14} />
                  <span className="hidden sm:inline">{t.exportExcel}</span>
                  <span className="sm:hidden">Excel</span>
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${statusFilter === 'all' ? 'bg-zinc-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t.statusAll}
                </button>
                <button
                  onClick={() => setStatusFilter('unprocessed')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${statusFilter === 'unprocessed' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t.statusUnprocessed}
                </button>
                <button
                  onClick={() => setStatusFilter('processed')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${statusFilter === 'processed' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t.statusProcessed}
                </button>
              </div>
            </div>
          </div>

          {/* Analysis View */}
          {viewMode === 'analysis' && (
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="text-slate-500 text-xs font-medium mb-1">{t.totalSubmissions}</div>
                  <div className="text-2xl font-bold text-white">{stats.total}</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="text-slate-500 text-xs font-medium mb-1">{t.processedRate}</div>
                  <div className="text-2xl font-bold text-emerald-400">{stats.processedRate}%</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="text-slate-500 text-xs font-medium mb-1">{t.todaySubmissions}</div>
                  <div className="text-2xl font-bold text-indigo-400">{stats.todayCount}</div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h4 className="text-sm font-bold text-white mb-4">{t.dailyTrend}</h4>
                <div className="h-40 flex items-end gap-2">
                  {stats.trend.map((item, i) => {
                    const max = Math.max(...stats.trend.map(t => t.count), 1);
                    const height = (item.count / max) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                        <div className="w-full bg-zinc-800 rounded-t-sm relative h-full flex items-end">
                          <div 
                            className="w-full bg-indigo-500/50 group-hover:bg-indigo-500 transition-all rounded-t-sm"
                            style={{ height: `${height}%` }}
                          ></div>
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap border border-zinc-800">
                            {item.count}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 rotate-45 origin-left translate-y-2">
                          {item.date.split(' ').slice(1, 3).join(' ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-zinc-800 w-16">#</th>
                    {tableColumns.map(col => (
                      <th key={col} className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-zinc-800">
                        {col}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-zinc-800 w-32">
                      Status
                    </th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-zinc-800 text-right">
                      {t.time}
                    </th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-zinc-800 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredMessages.map((msg, idx) => {
                    const data = parsePayload(msg.encrypted_payload);
                    const isSelected = selectedMessage?.id === msg.id;
                    
                    return (
                      <tr 
                        key={msg.id} 
                        onClick={() => setSelectedMessage(msg)}
                        className={`group cursor-pointer transition-colors ${isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/20' : 'hover:bg-zinc-800/30'}`}
                      >
                        <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                          {filteredMessages.length - idx}
                        </td>
                        {tableColumns.map(col => (
                          <td key={col} className="px-6 py-4 text-sm text-slate-300 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
                            {typeof data === 'object' && data !== null ? String((data as any)[col] || '-') : '-'}
                          </td>
                        ))}
                        <td className="px-6 py-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProcessed(msg.id, msg.processed);
                            }}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                              msg.processed 
                                ? 'text-emerald-400 hover:bg-emerald-500/10' 
                                : 'text-amber-400 hover:bg-amber-500/10'
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full ${msg.processed ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                            {msg.processed ? t.statusProcessed : t.statusUnprocessed}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 text-right whitespace-nowrap font-mono">
                          {formatDate(msg.created_at)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <ChevronRight size={16} className={`text-slate-600 transition-transform ${isSelected ? 'text-indigo-400' : 'group-hover:text-slate-400'}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* JSON List View (Fallback) */}
          {viewMode === 'json' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredMessages.map((message, index) => {
                const displayData = parsePayload(message.encrypted_payload);
                const isSelected = selectedMessage?.id === message.id;
                
                return (
                  <div
                    key={message.id}
                    onClick={() => setSelectedMessage(message)}
                    className={`rounded-xl border p-4 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                        : 'bg-zinc-900/30 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-zinc-800 text-slate-500'}`}>
                          #{filteredMessages.length - index}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleProcessed(message.id, message.processed);
                          }}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium transition ${
                            message.processed 
                              ? 'text-emerald-400 hover:bg-emerald-500/10' 
                              : 'text-amber-400 hover:bg-amber-500/10'
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${message.processed ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                          {message.processed ? t.statusProcessed : t.statusUnprocessed}
                        </button>
                        <span className="text-xs text-slate-400">{formatDate(message.created_at)}</span>
                      </div>
                    </div>
                    <pre className="text-xs text-slate-300 font-mono overflow-hidden text-ellipsis line-clamp-3 opacity-80">
                      {JSON.stringify(displayData, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel (Right Side) */}
        {selectedMessage && (
          <div className="fixed inset-0 md:static md:inset-auto w-full md:w-[400px] bg-zinc-900 border-l border-zinc-800 flex flex-col animate-slide-in-right shadow-2xl z-50 md:z-20">
            <div className="p-4 md:p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <h3 className="font-bold text-white text-lg">
                {language === 'zh' ? '数据详情' : 'Submission Details'}
              </h3>
              <button 
                onClick={() => setSelectedMessage(null)}
                className="p-2 hover:bg-zinc-800 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="space-y-6">
                {/* Metadata Card */}
                <div className="bg-black/30 rounded-xl p-4 border border-zinc-800">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">ID</div>
                      <div className="text-xs text-slate-300 font-mono truncate" title={selectedMessage.id}>{selectedMessage.id}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{language === 'zh' ? '时间' : 'Time'}</div>
                      <div className="text-xs text-slate-300 font-mono">{formatDate(selectedMessage.created_at)}</div>
                    </div>
                  </div>
                </div>

                {/* Data Content */}
                <div>
                  <div className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Database size={12} />
                    {language === 'zh' ? '表单内容' : 'Form Data'}
                  </div>
                  <div className="bg-zinc-800/30 rounded-xl border border-zinc-800 overflow-hidden">
                    {(() => {
                      const data = parsePayload(selectedMessage.encrypted_payload);
                      if (typeof data === 'object' && data !== null) {
                        return (
                          <div className="divide-y divide-zinc-800">
                            {Object.entries(data).map(([key, value]) => (
                              <div key={key} className="p-4 hover:bg-zinc-800/50 transition">
                                <div className="text-xs text-slate-500 mb-1.5 font-medium">{key}</div>
                                <div className="text-sm text-white break-words font-mono">
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <div className="p-4">
                          <pre className="text-sm text-slate-300 whitespace-pre-wrap break-all font-mono">
                            {String(data)}
                          </pre>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Raw JSON */}
                <div>
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3">Raw JSON</div>
                  <div className="bg-black rounded-xl p-4 border border-zinc-800 relative group">
                    <pre className="text-xs text-green-400/80 font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(parsePayload(selectedMessage.encrypted_payload), null, 2)}
                    </pre>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(parsePayload(selectedMessage.encrypted_payload), null, 2));
                      }}
                      className="absolute top-2 right-2 p-2 bg-zinc-800 rounded-lg text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition"
                      title="Copy JSON"
                    >
                      <i className="fa-regular fa-copy"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900">
              <button
                onClick={() => deleteMessage(selectedMessage.id)}
                className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold transition border border-red-500/20 flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                {language === 'zh' ? '删除此记录' : 'Delete Record'}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4 md:p-8">
      <div className={`bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl w-full ${mode === 'production' ? 'max-w-[90vw] h-[85vh]' : 'max-w-5xl h-[80vh]'} flex overflow-hidden animate-scale-in ring-1 ring-white/5`}>
        
        {/* Sidebar (App List) - Only in production mode */}
        {mode === 'production' && (
          <div className={`
            border-r border-zinc-800 flex flex-col bg-zinc-900/50 transition-all duration-300
            ${selectedAppId ? 'hidden md:flex w-72' : 'w-full md:w-72'}
          `}>
            <div className="p-4 md:p-6 border-b border-zinc-800">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <i className="fa-solid fa-layer-group text-indigo-500"></i>
                {t.myApps}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
              {appsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <i className="fa-solid fa-spinner fa-spin mb-3"></i>
                  <span className="text-xs">{t.loading}</span>
                </div>
              ) : apps.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <p className="text-sm text-slate-500">
                    {t.noApps}
                  </p>
                </div>
              ) : (
                apps.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => setSelectedAppId(app.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition text-left group ${
                      selectedAppId === app.id
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'hover:bg-zinc-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border ${selectedAppId === app.id ? 'border-white/20 bg-white/10' : 'border-zinc-700 bg-zinc-800'}`}>
                      {app.icon_url ? (
                        <img src={app.icon_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <i className="fa-solid fa-cube text-xs"></i>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate mb-0.5">
                        {app.title || `App #${app.id}`}
                      </div>
                      <div className={`text-[10px] truncate font-mono ${selectedAppId === app.id ? 'text-indigo-200' : 'text-slate-600'}`}>
                        {String(app.id).substring(0, 8)}...
                      </div>
                    </div>
                    {selectedAppId === app.id && <ChevronRight size={14} className="opacity-50" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className={`
          flex-1 flex flex-col min-w-0 bg-zinc-950 relative transition-all duration-300
          ${mode === 'production' && !selectedAppId ? 'hidden md:flex' : 'flex'}
        `}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b border-zinc-800 bg-zinc-900/30 backdrop-blur-sm">
            <div className="flex items-center gap-3 md:gap-4">
              {/* Back button for mobile */}
              {mode === 'production' && (
                <button 
                  onClick={() => setSelectedAppId(null)}
                  className="md:hidden w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-slate-400"
                >
                  <i className="fa-solid fa-arrow-left"></i>
                </button>
              )}
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                <Database className="text-white w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg md:text-2xl font-bold text-white tracking-tight truncate">
                  {t.title}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5 shrink-0">
                    <span className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                    <span className="hidden sm:inline">{loading ? t.syncing : t.connected}</span>
                  </span>
                  <span className="text-zinc-700 text-xs hidden sm:inline">|</span>
                  <code className="text-xs text-slate-500 font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 hidden sm:inline">
                    ID: {effectiveAppId || 'N/A'}
                  </code>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={fetchMessages}
                className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-slate-400 hover:text-white transition border border-zinc-700"
                title={t.refresh}
              >
                <RefreshCw size={16} className={`md:w-[18px] md:h-[18px] ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-zinc-800 hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-400 transition border border-zinc-700 hover:border-red-500/30"
              >
                <X size={18} className="md:w-5 md:h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden relative">
            {error ? (
              <div className="flex flex-col items-center justify-center h-full text-red-400">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                  <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
                </div>
                <p className="font-bold">{error}</p>
                <button onClick={fetchMessages} className="mt-4 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-sm transition">
                  {t.retry}
                </button>
              </div>
            ) : (
              renderInboxContent()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
