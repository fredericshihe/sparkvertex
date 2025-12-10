'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Lock, Unlock, Key, Download, AlertTriangle } from 'lucide-react';
import { detectSparkBackendCode } from '@/lib/utils';
import { decryptData, isEncrypted, importPrivateKey, importPrivateKeyFromBackup, generateKeyPair, isWebCryptoAvailable } from '@/lib/client-crypto';

// E2E 密钥存储 Key 前缀
const E2E_KEY_PREFIX = 'spark_e2e_app_';

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
  public_key?: string;
}

// 解密结果缓存
interface DecryptedPayload {
  data: unknown;
  isDecrypted: boolean;
  error?: string;
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

export default function BackendDataPanel({ 
  isOpen, 
  onClose, 
  userId, 
  appId,
  language,
  mode = 'test',
}: BackendDataPanelProps) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 应用列表（生产模式）
  const [apps, setApps] = useState<AppItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(appId || null);
  const [appsLoading, setAppsLoading] = useState(false);
  
  // 🔐 E2EE 解密相关状态
  const [hasPrivateKey, setHasPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, DecryptedPayload>>({});
  const [showKeyImport, setShowKeyImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  
  // 🔐 应用公钥状态（用于检测旧应用是否需要生成密钥）
  const [appHasPublicKey, setAppHasPublicKey] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  
  // 计算实际使用的 app_id
  const effectiveAppId = mode === 'production' 
    ? selectedAppId 
    : (appId || (userId ? `draft_${userId}` : null));
  
  // 获取用户已发布的应用列表（生产模式）
  const fetchApps = useCallback(async () => {
    if (!userId || mode !== 'production') return;
    
    setAppsLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, title, icon_url, content, public_key')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // 过滤出包含后端代码的应用
      const backendApps = (data || []).filter(app => detectSparkBackendCode(app.content));
      setApps(backendApps);
      
      // 如果没有选中的应用，默认选第一个
      if (backendApps.length > 0 && !selectedAppId) {
        setSelectedAppId(backendApps[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching apps:', err);
    } finally {
      setAppsLoading(false);
    }
  }, [userId, mode, selectedAppId]);

  const fetchMessages = useCallback(async () => {
    if (!effectiveAppId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const appIdStr = String(effectiveAppId);
      
      const { data, error: fetchError } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('app_id', appIdStr)
        .order('created_at', { ascending: false })
        .limit(50);

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
            event: 'INSERT',
            schema: 'public',
            table: 'inbox_messages',
            filter: `app_id=eq.${filterValue}`
          },
          (payload) => {
            setMessages(prev => [payload.new as InboxMessage, ...prev]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isOpen, effectiveAppId, fetchMessages]);

  // 🔐 检查应用是否有公钥（仅生产模式）
  useEffect(() => {
    if (mode !== 'production' || !selectedAppId) {
      setAppHasPublicKey(true); // 测试模式默认为 true
      return;
    }
    
    const selectedApp = apps.find(app => app.id === selectedAppId);
    setAppHasPublicKey(!!selectedApp?.public_key);
  }, [mode, selectedAppId, apps]);

  // 🔐 加载私钥（当选择应用时）
  useEffect(() => {
    if (!effectiveAppId) {
      setHasPrivateKey(false);
      setPrivateKey(null);
      return;
    }

    const loadPrivateKey = async () => {
      // 从 localStorage 加载私钥
      const storedKey = localStorage.getItem(`${E2E_KEY_PREFIX}${effectiveAppId}_private`);
      if (storedKey) {
        try {
          const keyJWK = JSON.parse(storedKey);
          const cryptoKey = await importPrivateKey(keyJWK);
          setPrivateKey(cryptoKey);
          setHasPrivateKey(true);
          console.log('[E2E] Loaded private key for app:', effectiveAppId);
        } catch (e) {
          console.error('[E2E] Failed to load private key:', e);
          setHasPrivateKey(false);
          setPrivateKey(null);
        }
      } else {
        setHasPrivateKey(false);
        setPrivateKey(null);
      }
    };

    loadPrivateKey();
  }, [effectiveAppId]);
  
  // 🔐 为旧应用生成密钥对
  const handleGenerateKeyPair = async () => {
    if (!selectedAppId || mode !== 'production') return;
    
    setGeneratingKey(true);
    try {
      // 1. 生成密钥对
      const { publicKey: publicKeyJWK, privateKey: privateKeyJWK } = await generateKeyPair();
      console.log('[E2E] Generated new key pair for legacy app');
      
      // 2. 保存公钥到数据库
      const { error } = await supabase
        .from('items')
        .update({ public_key: JSON.stringify(publicKeyJWK) })
        .eq('id', selectedAppId);
      
      if (error) throw error;
      
      // 3. 保存私钥到本地存储
      localStorage.setItem(`${E2E_KEY_PREFIX}${selectedAppId}_private`, JSON.stringify(privateKeyJWK));
      localStorage.setItem(`${E2E_KEY_PREFIX}${selectedAppId}_public`, JSON.stringify(publicKeyJWK));
      
      // 4. 更新状态
      const cryptoKey = await importPrivateKey(privateKeyJWK);
      setPrivateKey(cryptoKey);
      setHasPrivateKey(true);
      setAppHasPublicKey(true);
      
      // 5. 更新 apps 列表中的数据
      setApps(prev => prev.map(app => 
        app.id === selectedAppId 
          ? { ...app, public_key: JSON.stringify(publicKeyJWK) }
          : app
      ));
      
      console.log('[E2E] Successfully enabled E2E encryption for app:', selectedAppId);
      
      // 6. 自动触发导出私钥（重要提示用户备份）
      setTimeout(() => {
        handleExportKey();
      }, 500);
      
    } catch (e: any) {
      console.error('[E2E] Failed to generate key pair:', e);
      setImportError(e.message);
    } finally {
      setGeneratingKey(false);
    }
  };

  // 🔐 解密消息
  const decryptMessage = useCallback(async (messageId: string, payload: string): Promise<DecryptedPayload> => {
    // 检查缓存
    if (decryptedCache[messageId]) {
      return decryptedCache[messageId];
    }

    // 检查是否加密
    if (!isEncrypted(payload)) {
      const result = {
        data: JSON.parse(payload),
        isDecrypted: false
      };
      setDecryptedCache(prev => ({ ...prev, [messageId]: result }));
      return result;
    }

    // 需要私钥才能解密
    if (!privateKey) {
      return {
        data: null,
        isDecrypted: false,
        error: language === 'zh' ? '需要私钥才能解密' : 'Private key required for decryption'
      };
    }

    try {
      const decrypted = await decryptData(payload, privateKey);
      const result = {
        data: decrypted,
        isDecrypted: true
      };
      setDecryptedCache(prev => ({ ...prev, [messageId]: result }));
      return result;
    } catch (e: any) {
      console.error('[E2E] Decryption failed:', e);
      return {
        data: null,
        isDecrypted: false,
        error: language === 'zh' ? '解密失败: ' + e.message : 'Decryption failed: ' + e.message
      };
    }
  }, [privateKey, decryptedCache, language]);

  // 🔐 导入私钥
  const handleImportKey = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const keyJWK = importPrivateKeyFromBackup(text);
      const cryptoKey = await importPrivateKey(keyJWK);
      
      // 保存到 localStorage
      if (effectiveAppId) {
        localStorage.setItem(`${E2E_KEY_PREFIX}${effectiveAppId}_private`, JSON.stringify(keyJWK));
      }
      
      setPrivateKey(cryptoKey);
      setHasPrivateKey(true);
      setShowKeyImport(false);
      setImportError(null);
      setDecryptedCache({}); // 清空缓存，强制重新解密
      
      console.log('[E2E] Successfully imported private key');
    } catch (e: any) {
      console.error('[E2E] Failed to import key:', e);
      setImportError(e.message);
    }
  };

  // 🔐 导出私钥
  const handleExportKey = () => {
    if (!effectiveAppId) return;
    
    const storedKey = localStorage.getItem(`${E2E_KEY_PREFIX}${effectiveAppId}_private`);
    if (!storedKey) return;

    const backup = JSON.stringify({
      version: 1,
      type: 'spark-e2e-private-key',
      appId: effectiveAppId,
      key: JSON.parse(storedKey),
      created: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spark-key-${effectiveAppId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await supabase
        .from('inbox_messages')
        .delete()
        .eq('id', messageId);
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      // 同时清除解密缓存
      setDecryptedCache(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return language === 'zh' ? '刚刚' : 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${language === 'zh' ? '分钟前' : 'min ago'}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${language === 'zh' ? '小时前' : 'hr ago'}`;
    
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const parsePayload = (payload: string) => {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  };

  if (!isOpen) return null;

  // 渲染表单提交数据列表
  const renderInboxContent = () => {
    if (loading && messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-brand-500 mb-3"></i>
          <p className="text-slate-500">{language === 'zh' ? '加载中...' : 'Loading...'}</p>
        </div>
      );
    }
    
    if (messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <i className="fa-solid fa-inbox text-2xl text-slate-600"></i>
          </div>
          <h3 className="font-medium text-white mb-2">
            {language === 'zh' ? '暂无表单数据' : 'No Form Data Yet'}
          </h3>
          <p className="text-sm text-slate-500 text-center max-w-xs">
            {language === 'zh' 
              ? '当用户在您的应用中提交表单（如联系我们、报名表）时，数据会显示在这里。'
              : 'Data will appear here when users submit forms (like contact forms) in your app.'}
          </p>
          <div className="mt-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 w-full max-w-sm">
            <p className="text-xs text-slate-500 mb-2">
              <i className="fa-solid fa-lightbulb text-yellow-400 mr-2"></i>
              {language === 'zh' ? '如何创建表单：' : 'How to create a form:'}
            </p>
            <div className="text-xs text-brand-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
              {language === 'zh' 
                ? '"帮我创建一个联系表单，提交到我的收件箱"' 
                : '"Create a contact form that submits to my inbox"'}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {/* 🔴 E2EE 未启用警告（旧应用没有公钥） */}
        {mode === 'production' && !appHasPublicKey && (
          <div className="p-4 rounded-lg mb-4 bg-red-500/10 border border-red-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-red-400 mb-1">
                  {language === 'zh' ? '⚠️ 端到端加密未启用' : '⚠️ E2E Encryption Not Enabled'}
                </h4>
                <p className="text-xs text-red-300/70 mb-3">
                  {language === 'zh' 
                    ? '此应用的表单数据以明文存储。启用加密后，只有您能解密查看数据，平台管理员也无法访问。'
                    : 'Form data for this app is stored in plain text. Enable encryption so only you can decrypt and view the data.'}
                </p>
                {isWebCryptoAvailable() ? (
                  <>
                    <button
                      onClick={handleGenerateKeyPair}
                      disabled={generatingKey}
                      className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 rounded-lg text-sm font-medium text-white transition"
                    >
                      {generatingKey ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i>
                          {language === 'zh' ? '生成中...' : 'Generating...'}
                        </>
                      ) : (
                        <>
                          <Key size={14} />
                          {language === 'zh' ? '启用端到端加密' : 'Enable E2E Encryption'}
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-slate-500 mt-2">
                      {language === 'zh' 
                        ? '⚠️ 启用后将自动下载私钥备份，请妥善保管！丢失私钥将无法解密数据。'
                        : '⚠️ A private key backup will be downloaded. Keep it safe! Lost keys cannot be recovered.'}
                    </p>
                  </>
                ) : (
                  <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-xs text-yellow-400">
                      {language === 'zh' 
                        ? '🔒 需要 HTTPS 才能启用加密。请使用 https:// 或 localhost 访问。'
                        : '🔒 HTTPS required to enable encryption. Please access via https:// or localhost.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i className="fa-solid fa-envelope text-green-400 text-sm"></i>
            </div>
            <div>
              <div className="text-lg font-bold text-white">{messages.length}</div>
              <div className="text-xs text-slate-500">{language === 'zh' ? '条记录' : 'Records'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <i className="fa-solid fa-clock text-blue-400 text-sm"></i>
            </div>
            <div>
              <div className="text-sm font-medium text-white">
                {messages[0] ? formatDate(messages[0].created_at) : '-'}
              </div>
              <div className="text-xs text-slate-500">{language === 'zh' ? '最近提交' : 'Latest'}</div>
            </div>
          </div>
        </div>

        {/* 🔐 加密状态提示 */}
        {messages.some(m => isEncrypted(m.encrypted_payload)) && (
          <div className={`p-3 rounded-lg mb-4 flex items-center gap-3 ${
            hasPrivateKey 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-yellow-500/10 border border-yellow-500/30'
          }`}>
            {hasPrivateKey ? (
              <>
                <Unlock size={16} className="text-green-400" />
                <span className="text-sm text-green-400">
                  {language === 'zh' ? '已加载解密密钥，数据已解密' : 'Decryption key loaded, data decrypted'}
                </span>
                <button
                  onClick={handleExportKey}
                  className="ml-auto flex items-center gap-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 rounded text-xs text-green-400 transition"
                >
                  <Download size={12} />
                  {language === 'zh' ? '备份密钥' : 'Backup Key'}
                </button>
              </>
            ) : (
              <>
                <Lock size={16} className="text-yellow-400" />
                <span className="text-sm text-yellow-400">
                  {language === 'zh' ? '部分数据已加密，需要导入私钥才能查看' : 'Some data is encrypted, import private key to view'}
                </span>
                <button
                  onClick={() => setShowKeyImport(true)}
                  className="ml-auto flex items-center gap-1 px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 rounded text-xs text-yellow-400 transition"
                >
                  <Key size={12} />
                  {language === 'zh' ? '导入密钥' : 'Import Key'}
                </button>
              </>
            )}
          </div>
        )}

        {/* 密钥导入弹窗 */}
        {showKeyImport && (
          <div className="mb-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
            <h4 className="font-medium text-white mb-2 flex items-center gap-2">
              <Key size={16} className="text-brand-400" />
              {language === 'zh' ? '导入解密密钥' : 'Import Decryption Key'}
            </h4>
            <p className="text-xs text-slate-400 mb-3">
              {language === 'zh' 
                ? '请选择您在发布应用时备份的私钥文件 (.json)' 
                : 'Select the private key file (.json) you backed up when publishing the app'}
            </p>
            <input
              type="file"
              accept=".json"
              onChange={handleImportKey}
              className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brand-500 file:text-white hover:file:bg-brand-600 cursor-pointer"
            />
            {importError && (
              <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle size={12} />
                {importError}
              </p>
            )}
            <button
              onClick={() => setShowKeyImport(false)}
              className="mt-2 text-xs text-slate-500 hover:text-slate-400"
            >
              {language === 'zh' ? '取消' : 'Cancel'}
            </button>
          </div>
        )}

        {/* Messages List */}
        {messages.map((message, index) => {
          const payloadIsEncrypted = isEncrypted(message.encrypted_payload);
          const cached = decryptedCache[message.id];
          
          // 尝试解密或使用缓存
          let displayData: any = null;
          let decryptionError: string | null = null;
          let showEncrypted = false;

          if (cached) {
            displayData = cached.data;
            decryptionError = cached.error || null;
          } else if (payloadIsEncrypted) {
            if (hasPrivateKey) {
              // 触发异步解密
              decryptMessage(message.id, message.encrypted_payload);
              displayData = null; // 显示加载中
            } else {
              showEncrypted = true;
            }
          } else {
            displayData = parsePayload(message.encrypted_payload);
          }

          const isObject = typeof displayData === 'object' && displayData !== null;
          
          return (
            <div
              key={message.id}
              className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden hover:border-slate-600 transition group"
            >
              <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700/30">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">#{messages.length - index}</span>
                  <span className="text-xs text-slate-400">{formatDate(message.created_at)}</span>
                  {payloadIsEncrypted && (
                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                      cached?.isDecrypted 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {cached?.isDecrypted ? <Unlock size={10} /> : <Lock size={10} />}
                      {cached?.isDecrypted 
                        ? (language === 'zh' ? '已解密' : 'Decrypted') 
                        : (language === 'zh' ? '已加密' : 'Encrypted')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteMessage(message.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded transition"
                >
                  <i className="fa-solid fa-trash text-xs text-slate-400 hover:text-red-400"></i>
                </button>
              </div>
              
              <div className="p-4">
                {showEncrypted ? (
                  <div className="flex flex-col items-center justify-center py-4 text-slate-500">
                    <Lock size={24} className="mb-2 text-yellow-400" />
                    <p className="text-sm text-yellow-400">
                      {language === 'zh' ? '数据已加密' : 'Data is encrypted'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {language === 'zh' ? '请导入私钥以查看内容' : 'Import private key to view content'}
                    </p>
                  </div>
                ) : decryptionError ? (
                  <div className="flex flex-col items-center justify-center py-4 text-red-400">
                    <AlertTriangle size={24} className="mb-2" />
                    <p className="text-sm">{decryptionError}</p>
                  </div>
                ) : displayData === null ? (
                  <div className="flex items-center justify-center py-4">
                    <i className="fa-solid fa-circle-notch fa-spin text-brand-400 mr-2"></i>
                    <span className="text-slate-400 text-sm">
                      {language === 'zh' ? '解密中...' : 'Decrypting...'}
                    </span>
                  </div>
                ) : isObject ? (
                  <div className="space-y-2">
                    {Object.entries(displayData).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-3">
                        <span className="text-xs text-slate-500 min-w-[80px] pt-0.5">{key}</span>
                        <span className="text-sm text-white break-all">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap break-all font-mono bg-slate-900/50 p-3 rounded-lg">
                    {String(displayData)}
                  </pre>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className={`bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full ${mode === 'production' ? 'max-w-4xl h-[70vh]' : 'max-w-2xl max-h-[70vh]'} flex overflow-hidden animate-scale-in`}>
        
        {/* Sidebar (App List) - Only in production mode */}
        {mode === 'production' && (
          <div className="w-64 border-r border-slate-700 flex flex-col bg-slate-900/50">
            <div className="p-4 border-b border-slate-700">
              <h3 className="font-medium text-white text-sm">
                {language === 'zh' ? '我的应用' : 'My Apps'}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {appsLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                  <i className="fa-solid fa-spinner fa-spin mb-2"></i>
                  <span className="text-xs">{language === 'zh' ? '加载中...' : 'Loading...'}</span>
                </div>
              ) : apps.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-xs text-slate-500">
                    {language === 'zh' ? '暂无配置后端的应用' : 'No backend-enabled apps found'}
                  </p>
                </div>
              ) : (
                apps.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => setSelectedAppId(app.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition text-left ${
                      selectedAppId === app.id
                        ? 'bg-brand-500/10 border border-brand-500/50'
                        : 'hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                      {app.icon_url ? (
                        <img src={app.icon_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <i className="fa-solid fa-cube text-slate-600 text-xs"></i>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${selectedAppId === app.id ? 'text-brand-400' : 'text-slate-300'}`}>
                        {app.title || `App #${app.id}`}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">ID: {app.id}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
                <i className="fa-solid fa-inbox text-brand-400"></i>
              </div>
              <div>
                <h2 className="font-bold text-white">
                  {language === 'zh' ? '应用收件箱' : 'App Inbox'}
                </h2>
                <p className="text-xs text-slate-500">
                  {language === 'zh' ? '查看用户提交的表单数据' : 'View user form submissions'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchMessages}
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
                title={language === 'zh' ? '刷新' : 'Refresh'}
              >
                <i className={`fa-solid fa-refresh ${loading ? 'animate-spin' : ''}`}></i>
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* App ID Info */}
          <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700/50">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">{language === 'zh' ? '应用 ID' : 'App ID'}:</span>
              <code className="px-2 py-0.5 bg-slate-700 rounded text-slate-300 font-mono">
                {effectiveAppId || 'N/A'}
              </code>
              {mode === 'test' && effectiveAppId && String(effectiveAppId).startsWith('draft_') && (
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                  {language === 'zh' ? '测试模式' : 'Test Mode'}
                </span>
              )}
              {mode === 'production' && (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                  {language === 'zh' ? '已发布' : 'Published'}
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {error ? (
              <div className="flex flex-col items-center justify-center py-12 text-red-400">
                <i className="fa-solid fa-triangle-exclamation text-2xl mb-3"></i>
                <p>{error}</p>
              </div>
            ) : (
              renderInboxContent()
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700 bg-slate-800/30">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <i className="fa-solid fa-info-circle mr-1"></i>
                {language === 'zh' ? '表单数据实时同步' : 'Form data syncs in real-time'}
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white transition"
              >
                {language === 'zh' ? '关闭' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
