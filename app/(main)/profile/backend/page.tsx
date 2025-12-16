'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AppItem {
  id: string;
  title: string;
  description: string;
  icon_url?: string;
  created_at: string;
}

interface InboxMessage {
  id: string;
  app_id: string;
  encrypted_payload: string;
  metadata: any;
  created_at: string;
  processed: boolean;
  is_archived: boolean;
  decrypted?: unknown; // 解密后的数据
}

interface PublicContent {
  id: string;
  app_id: string;
  slug: string;
  content: string;
  content_type: string;
  created_at: string;
  updated_at: string;
}

interface AppStats {
  inboxCount: number;
  unreadCount: number;
  contentCount: number;
}

export default function BackendDashboard() {
  const router = useRouter();
  const { openLoginModal } = useModal();
  const { error: toastError, success: toastSuccess } = useToast();
  const { t, language } = useLanguage();
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'cms' | 'stats'>('inbox');
  const [appStats, setAppStats] = useState<Record<string, AppStats>>({});
  
  // Inbox state
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  
  // CMS state
  const [cmsContent, setCmsContent] = useState<PublicContent[]>([]);
  const [cmsLoading, setCmsLoading] = useState(false);
  
  // CMS Create state
  const [showCreateContentModal, setShowCreateContentModal] = useState(false);
  const [creatingContent, setCreatingContent] = useState(false);
  const [newContent, setNewContent] = useState({
    slug: '',
    content: '',
    content_type: 'text'
  });
  
  // Filter state
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Expanded messages state
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const toggleExpand = (messageId: string) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  // Parse messages - simply parse JSON payload
  const parseMessages = useCallback((messages: InboxMessage[]) => {
    return messages.map(msg => {
      try {
        return { ...msg, decrypted: JSON.parse(msg.encrypted_payload) };
      } catch {
        return msg;
      }
    });
  }, []);

  // Check auth
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUser(session.user);
      fetchApps(session.user.id);
    } else {
      openLoginModal();
      router.push('/profile');
    }
  };

  // Fetch user's apps (including a "Test/Draft" virtual app)
  const fetchApps = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, title, description, icon_url, created_at, has_backend')
        .eq('author_id', userId)
        .neq('is_draft', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // 只显示启用了后端功能的应用
      const appsWithBackend = (data || []).filter(app => app.has_backend === true);
      
      // Add a virtual "Test/Draft" app for draft submissions
      const draftApp: AppItem = {
        id: `draft_${userId}`,
        title: language === 'zh' ? '📝 测试/草稿数据' : '📝 Test/Draft Data',
        description: language === 'zh' ? '预览和测试阶段收集的数据' : 'Data collected during preview and testing',
        created_at: new Date().toISOString()
      };
      
      setApps([draftApp, ...appsWithBackend]);
      
      // Fetch stats for all apps including draft
      const allAppIds = [`draft_${userId}`, ...appsWithBackend.map(app => app.id)];
      fetchAllAppStats(allAppIds);
    } catch (error) {
      console.error('Error fetching apps:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats for all apps
  const fetchAllAppStats = async (appIds: string[]) => {
    try {
      const stats: Record<string, AppStats> = {};
      
      // Try to fetch inbox stats
      for (const appId of appIds) {
        stats[appId] = { inboxCount: 0, unreadCount: 0, contentCount: 0 };
        
        // Fetch inbox count
        try {
          const appIdStr = String(appId);
          
          // 对于草稿应用，使用 LIKE 查询匹配所有草稿数据
          if (appIdStr.startsWith('draft_')) {
            // 查询所有 draft_ 开头的数据（包括 draft_demo_xxx）
            const { count: inboxCount } = await supabase
              .from('inbox_messages')
              .select('id', { count: 'exact', head: true })
              .like('app_id', 'draft_%');
            
            const { count: unreadCount } = await supabase
              .from('inbox_messages')
              .select('id', { count: 'exact', head: true })
              .like('app_id', 'draft_%')
              .eq('processed', false);
            
            stats[appId].inboxCount = inboxCount || 0;
            stats[appId].unreadCount = unreadCount || 0;
          } else {
            // 对于已发布应用，精确匹配
            const { count: inboxCount } = await supabase
              .from('inbox_messages')
              .select('id', { count: 'exact', head: true })
              .eq('app_id', appIdStr);
            
            const { count: unreadCount } = await supabase
              .from('inbox_messages')
              .select('id', { count: 'exact', head: true })
              .eq('app_id', appIdStr)
              .eq('processed', false);
            
            stats[appId].inboxCount = inboxCount || 0;
            stats[appId].unreadCount = unreadCount || 0;
          }
        } catch (e) {
          // Table might not exist yet
        }

        // Fetch CMS content count
        try {
          const appIdStr = String(appId);
          
          if (appIdStr.startsWith('draft_')) {
            const { count: contentCount } = await supabase
              .from('public_content')
              .select('id', { count: 'exact', head: true })
              .like('app_id', 'draft_%');
            
            stats[appId].contentCount = contentCount || 0;
          } else {
            const { count: contentCount } = await supabase
              .from('public_content')
              .select('id', { count: 'exact', head: true })
              .eq('app_id', appIdStr);
            
            stats[appId].contentCount = contentCount || 0;
          }
        } catch (e) {
          // Table might not exist yet
        }
      }
      
      setAppStats(stats);
    } catch (error) {
      console.error('Error fetching app stats:', error);
    }
  };

  // Fetch inbox messages for selected app
  const fetchInboxMessages = useCallback(async (appId: string) => {
    setInboxLoading(true);
    try {
      // 强制转换为字符串，避免 Supabase 客户端误判类型
      const appIdStr = String(appId);
      
      let query = supabase
        .from('inbox_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      // 对于草稿应用，查询所有 draft_ 开头的数据
      if (appIdStr.startsWith('draft_')) {
        query = query.like('app_id', 'draft_%');
      } else {
        query = query.eq('app_id', appIdStr);
      }
      
      const { data, error } = await query;

      if (error) throw error;
      
      // 解析消息
      const parsedMessages = parseMessages(data || []);
      setInboxMessages(parsedMessages);
    } catch (error: any) {
      console.error('Error fetching inbox:', error);
      if (error.code === '42P01') {
        // Table doesn't exist
        setInboxMessages([]);
      }
    } finally {
      setInboxLoading(false);
    }
  }, [parseMessages]);

  // Fetch CMS content for selected app
  const fetchCmsContent = useCallback(async (appId: string) => {
    setCmsLoading(true);
    try {
      const appIdStr = String(appId);
      
      let query = supabase
        .from('public_content')
        .select('*')
        .order('updated_at', { ascending: false });
      
      // 对于草稿应用，查询所有 draft_ 开头的数据
      if (appIdStr.startsWith('draft_')) {
        query = query.like('app_id', 'draft_%');
      } else {
        query = query.eq('app_id', appIdStr);
      }
      
      const { data, error } = await query;

      if (error) throw error;
      setCmsContent(data || []);
    } catch (error: any) {
      console.error('Error fetching CMS content:', error);
      if (error.code === '42P01') {
        // Table doesn't exist
        setCmsContent([]);
      }
    } finally {
      setCmsLoading(false);
    }
  }, []);

  // When app is selected, fetch its data
  useEffect(() => {
    if (selectedApp) {
      if (activeTab === 'inbox') {
        fetchInboxMessages(selectedApp.id);
      } else if (activeTab === 'cms') {
        fetchCmsContent(selectedApp.id);
      }
    }
  }, [selectedApp, activeTab, fetchInboxMessages, fetchCmsContent]);

  // Mark message as read
  const markAsRead = async (messageId: string) => {
    try {
      await supabase
        .from('inbox_messages')
        .update({ processed: true })
        .eq('id', messageId);
      
      setInboxMessages(prev => 
        prev.map(m => m.id === messageId ? { ...m, processed: true } : m)
      );
      
      if (selectedApp) {
        setAppStats(prev => ({
          ...prev,
          [selectedApp.id]: {
            ...prev[selectedApp.id],
            unreadCount: Math.max(0, (prev[selectedApp.id]?.unreadCount || 1) - 1)
          }
        }));
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  // Delete message
  const deleteMessage = async (messageId: string) => {
    if (!confirm(language === 'zh' ? '确定要删除这条消息吗？' : 'Delete this message?')) return;
    
    try {
      await supabase
        .from('inbox_messages')
        .delete()
        .eq('id', messageId);
      
      setInboxMessages(prev => prev.filter(m => m.id !== messageId));
      toastSuccess(language === 'zh' ? '已删除' : 'Deleted');
    } catch (error) {
      toastError(language === 'zh' ? '删除失败' : 'Delete failed');
    }
  };

  // Delete CMS content
  const deleteCmsContent = async (contentId: string) => {
    if (!confirm(language === 'zh' ? '确定要删除这条内容吗？' : 'Delete this content?')) return;
    
    try {
      await supabase
        .from('public_content')
        .delete()
        .eq('id', contentId);
      
      setCmsContent(prev => prev.filter(c => c.id !== contentId));
      toastSuccess(language === 'zh' ? '已删除' : 'Deleted');
    } catch (error) {
      toastError(language === 'zh' ? '删除失败' : 'Delete failed');
    }
  };

  // Create CMS content
  const createCmsContent = async () => {
    if (!selectedApp || !newContent.slug || !newContent.content) return;
    
    setCreatingContent(true);
    try {
      const { data, error } = await supabase
        .from('public_content')
        .insert({
          app_id: selectedApp.id,
          slug: newContent.slug,
          content: newContent.content,
          content_type: newContent.content_type
        })
        .select()
        .single();

      if (error) throw error;
      
      setCmsContent(prev => [data, ...prev]);
      setShowCreateContentModal(false);
      setNewContent({ slug: '', content: '', content_type: 'text' });
      toastSuccess(language === 'zh' ? '内容已创建' : 'Content created');
      
      // Update stats
      setAppStats(prev => ({
        ...prev,
        [selectedApp.id]: {
          ...prev[selectedApp.id],
          contentCount: (prev[selectedApp.id]?.contentCount || 0) + 1
        }
      }));
    } catch (error) {
      console.error('Error creating content:', error);
      toastError(language === 'zh' ? '创建失败' : 'Create failed');
    } finally {
      setCreatingContent(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format field name to be more readable
  const formatFieldName = (key: string) => {
    // Common field name translations
    const translations: Record<string, string> = {
      name: language === 'zh' ? '姓名' : 'Name',
      email: language === 'zh' ? '邮箱' : 'Email',
      phone: language === 'zh' ? '电话' : 'Phone',
      message: language === 'zh' ? '留言' : 'Message',
      subject: language === 'zh' ? '主题' : 'Subject',
      address: language === 'zh' ? '地址' : 'Address',
      company: language === 'zh' ? '公司' : 'Company',
      date: language === 'zh' ? '日期' : 'Date',
      time: language === 'zh' ? '时间' : 'Time',
      petName: language === 'zh' ? '宠物名' : 'Pet Name',
      serviceType: language === 'zh' ? '服务类型' : 'Service Type',
      appointmentDate: language === 'zh' ? '预约日期' : 'Appointment Date',
      appointmentTime: language === 'zh' ? '预约时间' : 'Appointment Time',
    };
    
    if (translations[key]) return translations[key];
    
    // Convert camelCase/snake_case to readable format
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  };

  // Render summary for collapsed view
  const renderSummary = (payload: string, decrypted?: unknown) => {
    try {
      let data: unknown;
      
      if (decrypted) {
        data = decrypted;
      } else {
        data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      }
      
      if (typeof data !== 'object' || data === null) {
        return <span className="text-slate-400 text-xs">{String(data).substring(0, 50)}...</span>;
      }

      const entries = Object.entries(data);
      // Get first 2 non-internal fields
      const previewFields = entries
        .filter(([key]) => !key.startsWith('_') && key !== 'timestamp')
        .slice(0, 2);
        
      return (
        <div className="flex items-center gap-2 sm:gap-4 text-xs text-slate-400 overflow-hidden">
          {previewFields.map(([key, value]) => (
            <span key={key} className="truncate max-w-[100px] sm:max-w-[150px]">
              <span className="text-slate-500 mr-1 hidden sm:inline">{formatFieldName(key)}:</span>
              <span className="text-slate-300 sm:text-slate-400">{typeof value === 'object' ? '...' : String(value)}</span>
            </span>
          ))}
          {entries.length > 2 && <span>...</span>}
        </div>
      );
    } catch {
      return <span className="text-slate-400 text-xs">...</span>;
    }
  };

  // Render form payload in a readable format
  const renderPayload = (payload: string, decrypted?: unknown) => {
    try {
      // 优先使用解析后的数据
      let data: unknown;
      
      if (decrypted) {
        data = decrypted;
      } else {
        data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      }
      
      if (typeof data !== 'object' || data === null) {
        return <span className="text-slate-400">{String(data)}</span>;
      }

      const entries = Object.entries(data);
      
      return (
        <>
          {entries.map(([key, value]) => {
            // Skip internal fields
            if (key.startsWith('_') || key === 'timestamp') return null;
            
            const displayValue = typeof value === 'object' 
              ? JSON.stringify(value, null, 2)
              : String(value);
            
            // Check if it's a long text (message/notes)
            const isLongText = displayValue.length > 100 || key.toLowerCase().includes('message') || key.toLowerCase().includes('note');
            
            return (
              <div key={key} className={`${isLongText ? 'col-span-1 md:col-span-2' : ''}`}>
                <div className="text-xs text-slate-500 mb-0.5 font-medium">
                  {formatFieldName(key)}
                </div>
                <div className={`text-sm text-white ${isLongText ? 'whitespace-pre-wrap' : 'truncate'}`}>
                  {displayValue || <span className="text-slate-600 italic">{language === 'zh' ? '(空)' : '(empty)'}</span>}
                </div>
              </div>
            );
          })}
        </>
      );
    } catch {
      // If not valid JSON, show as plain text
      return (
        <div className="text-sm text-slate-400 break-all">
          {payload.substring(0, 500)}{payload.length > 500 && '...'}
        </div>
      );
    }
  };

  // Try to parse and display metadata
  const renderMetadata = (metadata: any) => {
    if (!metadata) return null;
    
    try {
      const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      return (
        <div className="mt-2 text-xs text-slate-500">
          {Object.entries(data).map(([key, value]) => (
            <span key={key} className="mr-3">
              <span className="text-slate-600">{key}:</span>{' '}
              <span className="text-slate-400">{String(value)}</span>
            </span>
          ))}
        </div>
      );
    } catch {
      return null;
    }
  };

  // Filtered messages
  const filteredMessages = inboxMessages.filter(msg => {
    // Status filter
    if (filterStatus === 'unread' && msg.processed) return false;
    if (filterStatus === 'read' && !msg.processed) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const payloadStr = JSON.stringify(msg.decrypted || msg.encrypted_payload).toLowerCase();
      const metadataStr = JSON.stringify(msg.metadata || {}).toLowerCase();
      return payloadStr.includes(query) || metadataStr.includes(query);
    }
    
    return true;
  });

  // Calculate daily stats from messages
  const getDailyStats = () => {
    const stats: Record<string, number> = {};
    // Initialize last 7 days with 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
      stats[dateStr] = 0;
    }

    inboxMessages.forEach(msg => {
      const date = new Date(msg.created_at);
      const dateStr = date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
      if (stats[dateStr] !== undefined) {
        stats[dateStr] = (stats[dateStr] || 0) + 1;
      }
    });
    
    return Object.entries(stats);
  };

  // Export data
  const exportData = () => {
    if (!filteredMessages.length) return;
    
    const dataToExport = filteredMessages.map(msg => ({
      id: msg.id,
      app_id: msg.app_id,
      created_at: msg.created_at,
      status: msg.processed ? 'read' : 'unread',
      data: msg.decrypted || msg.encrypted_payload,
      metadata: msg.metadata
    }));
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${selectedApp?.id}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-section relative z-10 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link 
              href="/profile"
              className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition"
            >
              <i className="fa-solid fa-arrow-left text-slate-400"></i>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {language === 'zh' ? '应用后端数据' : 'App Backend Data'}
              </h1>
              <p className="text-slate-400 text-sm">
                {language === 'zh' ? '管理你的应用收到的表单数据和 CMS 内容' : 'Manage inbox submissions and CMS content for your apps'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* App List Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass-panel rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="p-4 border-b border-slate-700/50">
                <h2 className="font-bold text-white">
                  {language === 'zh' ? '我的应用' : 'My Apps'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {apps.length} {language === 'zh' ? '个应用' : 'apps'}
                </p>
              </div>
              
              <div className="max-h-[600px] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center">
                    <i className="fa-solid fa-circle-notch fa-spin text-brand-500"></i>
                  </div>
                ) : apps.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <i className="fa-solid fa-box-open text-2xl mb-2"></i>
                    <p className="text-sm">{language === 'zh' ? '暂无应用' : 'No apps yet'}</p>
                  </div>
                ) : (
                  apps.map(app => (
                    <button
                      key={app.id}
                      onClick={() => setSelectedApp(app)}
                      className={`w-full p-4 text-left hover:bg-slate-800/50 transition border-b border-slate-700/30 last:border-b-0 ${
                        selectedApp?.id === app.id ? 'bg-brand-500/10 border-l-2 border-l-brand-500' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <img 
                          src={app.icon_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${app.id}`}
                          alt={app.title}
                          className="w-10 h-10 rounded-lg bg-slate-700 object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-white truncate">{app.title}</h3>
                          <p className="text-xs text-slate-500 truncate">{app.description}</p>
                          
                          {/* Stats badges */}
                          <div className="flex gap-2 mt-2">
                            {appStats[app.id]?.unreadCount > 0 && (
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                                {appStats[app.id].unreadCount} {language === 'zh' ? '未读' : 'unread'}
                              </span>
                            )}
                            {appStats[app.id]?.contentCount > 0 && (
                              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                                {appStats[app.id].contentCount} {language === 'zh' ? '内容' : 'content'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {!selectedApp ? (
              <div className="glass-panel rounded-xl border border-slate-700/50 p-12 text-center">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fa-solid fa-hand-pointer text-3xl text-slate-600"></i>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  {language === 'zh' ? '选择一个应用' : 'Select an App'}
                </h3>
                <p className="text-slate-500">
                  {language === 'zh' ? '从左侧选择一个应用来查看其后端数据' : 'Choose an app from the left to view its backend data'}
                </p>
              </div>
            ) : (
              <div className="glass-panel rounded-xl border border-slate-700/50 overflow-hidden">
                {/* App Header */}
                <div className="p-4 border-b border-slate-700/50 flex items-center gap-4">
                  <img 
                    src={selectedApp.icon_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${selectedApp.id}`}
                    alt={selectedApp.title}
                    className="w-12 h-12 rounded-xl bg-slate-700 object-cover"
                  />
                  <div className="flex-1">
                    <h2 className="font-bold text-white">{selectedApp.title}</h2>
                    <p className="text-xs text-slate-500">{selectedApp.description}</p>
                  </div>
                  <Link
                    href={`/p/${selectedApp.id}`}
                    target="_blank"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-400 hover:text-white transition"
                  >
                    <i className="fa-solid fa-external-link mr-2"></i>
                    {language === 'zh' ? '查看应用' : 'View App'}
                  </Link>
                </div>

                {/* Tabs */}
                <div className="border-b border-slate-700/50 flex">
                  <button
                    onClick={() => setActiveTab('inbox')}
                    className={`px-6 py-3 font-medium text-sm transition border-b-2 ${
                      activeTab === 'inbox' 
                        ? 'text-brand-400 border-brand-500' 
                        : 'text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    <i className="fa-solid fa-inbox mr-2"></i>
                    {language === 'zh' ? '收件箱' : 'Inbox'}
                    {appStats[selectedApp.id]?.unreadCount > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                        {appStats[selectedApp.id].unreadCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('cms')}
                    className={`px-6 py-3 font-medium text-sm transition border-b-2 ${
                      activeTab === 'cms' 
                        ? 'text-brand-400 border-brand-500' 
                        : 'text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    <i className="fa-solid fa-file-lines mr-2"></i>
                    {language === 'zh' ? 'CMS 内容' : 'CMS Content'}
                    {appStats[selectedApp.id]?.contentCount > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-blue-500/30 text-blue-400 text-xs rounded-full">
                        {appStats[selectedApp.id].contentCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('stats')}
                    className={`px-6 py-3 font-medium text-sm transition border-b-2 ${
                      activeTab === 'stats' 
                        ? 'text-brand-400 border-brand-500' 
                        : 'text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    <i className="fa-solid fa-chart-simple mr-2"></i>
                    {language === 'zh' ? '统计' : 'Stats'}
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-4 min-h-[400px]">
                  {/* Inbox Tab */}
                  {activeTab === 'inbox' && (
                    <div className="space-y-4">
                      {/* Toolbar */}
                      <div className="flex flex-col sm:flex-row gap-4 justify-between">
                        <div className="flex items-center bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 self-start">
                          <button
                            onClick={() => setFilterStatus('all')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                              filterStatus === 'all' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            {language === 'zh' ? '全部' : 'All'}
                          </button>
                          <button
                            onClick={() => setFilterStatus('unread')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                              filterStatus === 'unread' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            {language === 'zh' ? '未读' : 'Unread'}
                          </button>
                          <button
                            onClick={() => setFilterStatus('read')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                              filterStatus === 'read' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            {language === 'zh' ? '已读' : 'Read'}
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder={language === 'zh' ? '搜索内容...' : 'Search content...'}
                              className="w-full sm:w-64 bg-slate-800/50 border border-slate-700/50 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50 transition"
                            />
                          </div>

                          <button
                            onClick={exportData}
                            disabled={!filteredMessages.length}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={language === 'zh' ? '导出 JSON' : 'Export JSON'}
                          >
                            <i className="fa-solid fa-download"></i>
                            <span className="hidden sm:inline">{language === 'zh' ? '导出' : 'Export'}</span>
                          </button>
                        </div>
                      </div>

                      {inboxLoading ? (
                        <div className="text-center py-12">
                          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-brand-500"></i>
                        </div>
                      ) : filteredMessages.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fa-solid fa-inbox text-2xl text-slate-600"></i>
                          </div>
                          <h3 className="font-medium text-white mb-1">
                            {inboxMessages.length === 0 
                              ? (language === 'zh' ? '收件箱为空' : 'Inbox Empty')
                              : (language === 'zh' ? '没有找到匹配的消息' : 'No matching messages found')}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {inboxMessages.length === 0
                              ? (language === 'zh' ? '当用户在你的应用中提交表单时，数据会出现在这里' : 'Form submissions from your app will appear here')
                              : (language === 'zh' ? '尝试调整筛选条件或搜索关键词' : 'Try adjusting filters or search keywords')}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredMessages.map(message => (
                            <div
                              key={message.id}
                              className={`rounded-xl border overflow-hidden transition ${
                                message.processed 
                                  ? 'bg-slate-800/30 border-slate-700/50' 
                                  : 'bg-gradient-to-br from-brand-500/5 to-transparent border-brand-500/30'
                              }`}
                            >
                              {/* Header */}
                              <div 
                                className="flex items-center justify-between px-3 sm:px-4 py-3 bg-slate-800/30 border-b border-slate-700/30 cursor-pointer hover:bg-slate-800/50 transition"
                                onClick={() => toggleExpand(message.id)}
                              >
                                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center mt-0.5 sm:mt-0">
                                    <i className={`fa-solid fa-chevron-right text-slate-500 transition-transform duration-200 ${expandedMessages.has(message.id) ? 'rotate-90' : ''}`}></i>
                                    {!message.processed && (
                                      <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-brand-500 rounded-full animate-pulse"></span>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4 flex-1 min-w-0">
                                    {/* Summary (Mobile: Top, Desktop: Right) */}
                                    {!expandedMessages.has(message.id) && (
                                      <div className="order-1 sm:order-2 flex-1 min-w-0">
                                        {renderSummary(message.encrypted_payload, message.decrypted)}
                                      </div>
                                    )}

                                    {/* Meta (Mobile: Bottom, Desktop: Left) */}
                                    <div className="order-2 sm:order-1 flex items-center gap-2 text-[10px] sm:text-sm text-slate-500 sm:text-slate-300 shrink-0">
                                      <span>{formatDate(message.created_at)}</span>
                                      {message.app_id && (
                                        <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] sm:text-xs text-slate-400">
                                          #{message.app_id}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-0 sm:gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                                  {!message.processed && (
                                    <button
                                      onClick={() => markAsRead(message.id)}
                                      className="p-1.5 sm:p-2 hover:bg-slate-700 rounded-lg transition"
                                      title={language === 'zh' ? '标记已读' : 'Mark as read'}
                                    >
                                      <i className="fa-solid fa-check text-slate-400 hover:text-green-400 text-sm sm:text-base"></i>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteMessage(message.id)}
                                    className="p-1.5 sm:p-2 hover:bg-red-500/20 rounded-lg transition"
                                    title={language === 'zh' ? '删除' : 'Delete'}
                                  >
                                    <i className="fa-solid fa-trash text-slate-400 hover:text-red-400 text-sm sm:text-base"></i>
                                  </button>
                                </div>
                              </div>
                              
                              {/* Content */}
                              {expandedMessages.has(message.id) && (
                                <>
                                  <div className="p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {renderPayload(message.encrypted_payload, message.decrypted)}
                                    </div>
                                  </div>
                                  
                                  {/* Metadata Footer */}
                                  {message.metadata && (
                                    <div className="px-4 py-2 bg-slate-900/30 border-t border-slate-700/30">
                                      {renderMetadata(message.metadata)}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* CMS Tab */}
                  {activeTab === 'cms' && (
                    <div className="space-y-4">
                      <div className="flex justify-end">
                        <button
                          onClick={() => setShowCreateContentModal(true)}
                          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
                        >
                          <i className="fa-solid fa-plus"></i>
                          {language === 'zh' ? '新建内容' : 'Create Content'}
                        </button>
                      </div>

                      {cmsLoading ? (
                        <div className="text-center py-12">
                          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-brand-500"></i>
                        </div>
                      ) : cmsContent.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fa-solid fa-file-lines text-2xl text-slate-600"></i>
                          </div>
                          <h3 className="font-medium text-white mb-1">
                            {language === 'zh' ? '暂无 CMS 内容' : 'No CMS Content'}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {language === 'zh' 
                              ? '当你的应用发布内容时，会出现在这里'
                              : 'Published content from your app will appear here'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {cmsContent.map(content => (
                            <div
                              key={content.id}
                              className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/50"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                                      {content.content_type}
                                    </span>
                                    <span className="text-sm font-medium text-white">
                                      /{content.slug}
                                    </span>
                                  </div>
                                  
                                  <div className="bg-slate-900/50 rounded p-3 text-xs text-slate-400 max-h-32 overflow-hidden">
                                    {content.content.substring(0, 300)}
                                    {content.content.length > 300 && '...'}
                                  </div>
                                  
                                  <div className="mt-2 text-xs text-slate-500">
                                    {language === 'zh' ? '更新于' : 'Updated'} {formatDate(content.updated_at)}
                                  </div>
                                </div>
                                
                                <button
                                  onClick={() => deleteCmsContent(content.id)}
                                  className="p-2 hover:bg-red-500/20 rounded transition shrink-0"
                                  title={language === 'zh' ? '删除' : 'Delete'}
                                >
                                  <i className="fa-solid fa-trash text-slate-400 hover:text-red-400"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats Tab */}
                  {activeTab === 'stats' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                            <i className="fa-solid fa-envelope text-red-400"></i>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-white">
                              {appStats[selectedApp.id]?.inboxCount || 0}
                            </div>
                            <div className="text-xs text-slate-500">
                              {language === 'zh' ? '收件总数' : 'Total Inbox'}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {appStats[selectedApp.id]?.unreadCount || 0} {language === 'zh' ? '未读' : 'unread'}
                        </div>
                      </div>
                      
                      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <i className="fa-solid fa-file-lines text-blue-400"></i>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-white">
                              {appStats[selectedApp.id]?.contentCount || 0}
                            </div>
                            <div className="text-xs text-slate-500">
                              {language === 'zh' ? 'CMS 内容' : 'CMS Content'}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                            <i className="fa-solid fa-database text-green-400"></i>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-white">
                              {language === 'zh' ? '在线' : 'Online'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {language === 'zh' ? '后端状态' : 'Backend Status'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-green-400">
                          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                          {language === 'zh' ? '运行中' : 'Running'}
                        </div>
                      </div>
                    </div>

                    {/* Activity Chart */}
                    <div className="mt-6 bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
                      <h3 className="font-bold text-white mb-6">
                        {language === 'zh' ? '最近7天提交趋势' : 'Submission Trend (Last 7 Days)'}
                      </h3>
                      
                      <div className="h-48 flex items-end justify-between gap-2">
                        {getDailyStats().map(([date, count]) => {
                          // Find max count for scaling
                          const maxCount = Math.max(...getDailyStats().map(([, c]) => c), 1);
                          const heightPercent = Math.max((count / maxCount) * 100, 5); // Min 5% height
                          
                          return (
                            <div key={date} className="flex-1 flex flex-col items-center gap-2 group">
                              <div className="relative w-full flex justify-center items-end h-full">
                                <div 
                                  className="w-full max-w-[40px] bg-brand-500/20 border border-brand-500/50 rounded-t-md transition-all group-hover:bg-brand-500/40 relative"
                                  style={{ height: `${heightPercent}%` }}
                                >
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap border border-slate-700 z-10">
                                    {count} {language === 'zh' ? '条' : 'items'}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 truncate w-full text-center">
                                {date}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                  )}
                </div>


              </div>
            )}
          </div>
        </div>
      </div>
      {/* Create Content Modal */}
      {showCreateContentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
              <h3 className="font-bold text-white">
                {language === 'zh' ? '新建 CMS 内容' : 'Create CMS Content'}
              </h3>
              <button 
                onClick={() => setShowCreateContentModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {language === 'zh' ? '内容标识符 (Key)' : 'Content Key (ID)'}
                </label>
                <input
                  type="text"
                  value={newContent.slug}
                  onChange={e => setNewContent({...newContent, slug: e.target.value})}
                  placeholder={language === 'zh' ? '例如：about-us, pricing-table' : 'e.g., about-us, pricing-table'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500 transition"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {language === 'zh' 
                    ? '给这段内容起个名字，前端代码将通过这个名字来获取并显示它。' 
                    : 'Give this content a name. Your frontend code will use this name to fetch and display it.'}
                </p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {language === 'zh' ? '内容格式' : 'Content Format'}
                </label>
                <select
                  value={newContent.content_type}
                  onChange={e => setNewContent({...newContent, content_type: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500 transition"
                >
                  <option value="text">{language === 'zh' ? '纯文本 (Text)' : 'Plain Text'}</option>
                  <option value="html">{language === 'zh' ? 'HTML 代码' : 'HTML Code'}</option>
                  <option value="json">{language === 'zh' ? 'JSON 数据' : 'JSON Data'}</option>
                  <option value="markdown">{language === 'zh' ? 'Markdown 文档' : 'Markdown Document'}</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {language === 'zh' 
                    ? '选择内容的格式，以便前端正确渲染。' 
                    : 'Choose the format so the frontend can render it correctly.'}
                </p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {language === 'zh' ? '内容数据' : 'Content Data'}
                </label>
                <textarea
                  value={newContent.content}
                  onChange={e => setNewContent({...newContent, content: e.target.value})}
                  rows={6}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500 transition font-mono text-sm"
                  placeholder={language === 'zh' ? '在此输入具体的内容...' : 'Enter the actual content here...'}
                ></textarea>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateContentModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white text-sm font-medium transition"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={createCmsContent}
                disabled={creatingContent || !newContent.slug || !newContent.content}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                {creatingContent && <i className="fa-solid fa-circle-notch fa-spin"></i>}
                {language === 'zh' ? '创建' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
