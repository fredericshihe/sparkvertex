'use client';

import { useState, useEffect, useCallback } from 'react';

interface PublishedContent {
  id: string;
  slug: string | null;
  content_type: string;
  version: number;
  published_at: string;
  url: string;
}

interface HistoryItem {
  id: string;
  version: number;
  content_hash: string;
  created_at: string;
}

interface CMSAdminPanelProps {
  appId: string;
  apiBase?: string;
  className?: string;
}

export default function CMSAdminPanel({
  appId,
  apiBase = '',
  className = ''
}: CMSAdminPanelProps) {
  const [contents, setContents] = useState<PublishedContent[]>([]);
  const [selectedContent, setSelectedContent] = useState<PublishedContent | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishModal, setPublishModal] = useState(false);
  const [publishForm, setPublishForm] = useState({
    slug: '',
    contentType: 'text/html',
    content: ''
  });

  // 加载已发布内容列表
  const loadContents = useCallback(async () => {
    try {
      // 直接通过 CMS API 获取
      const res = await fetch(`${apiBase}/api/cms/content/${appId}/list`, {
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setContents(data.contents || []);
      }
    } catch (e) {
      console.error('Failed to load contents:', e);
    }
  }, [appId, apiBase]);

  // 加载版本历史
  const loadHistory = useCallback(async (slug?: string) => {
    try {
      const params = new URLSearchParams({ app_id: appId });
      if (slug) params.append('slug', slug);
      
      const res = await fetch(`${apiBase}/api/cms/history?${params}`, {
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, [appId, apiBase]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  useEffect(() => {
    if (selectedContent) {
      loadHistory(selectedContent.slug || undefined);
    }
  }, [selectedContent, loadHistory]);

  // 发布内容
  const handlePublish = async () => {
    if (!publishForm.content.trim()) {
      setError('请输入内容');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/cms/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          app_id: appId,
          content: publishForm.content,
          content_type: publishForm.contentType,
          slug: publishForm.slug || null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to publish');
      }

      const result = await res.json();
      
      // 刷新列表
      await loadContents();
      
      // 关闭弹窗
      setPublishModal(false);
      setPublishForm({ slug: '', contentType: 'text/html', content: '' });
      
      // 提示成功
      alert(`发布成功！\nURL: ${result.url}`);
      
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 回滚到指定版本
  const handleRollback = async (historyId: string, version: number) => {
    if (!confirm(`确定要回滚到版本 ${version} 吗？`)) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/cms/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          history_id: historyId,
          app_id: appId
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Rollback failed');
      }

      // 刷新数据
      await loadContents();
      if (selectedContent) {
        await loadHistory(selectedContent.slug || undefined);
      }
      
      alert('回滚成功！');
      
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 复制链接
  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('链接已复制');
  };

  // 格式化时间
  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          📝 CMS 内容管理
        </h3>
        <button
          onClick={() => setPublishModal(true)}
          className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
        >
          + 发布内容
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 内容列表 */}
      <div className="p-4">
        {contents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>还没有发布任何内容</p>
            <button
              onClick={() => setPublishModal(true)}
              className="mt-2 text-blue-500 hover:underline"
            >
              发布第一个内容
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {contents.map((content) => (
              <div
                key={content.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedContent?.id === content.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => setSelectedContent(content)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {content.slug || '(默认)'}
                    </span>
                    <span className="ml-2 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                      {content.content_type}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    v{content.version}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  发布于 {formatTime(content.published_at)}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); window.open(content.url, '_blank'); }}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    查看
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyLink(content.url); }}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    复制链接
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 版本历史 */}
      {selectedContent && history.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">
            📜 版本历史 - {selectedContent.slug || '默认'}
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded"
              >
                <div>
                  <span className="font-medium text-sm">v{item.version}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {formatTime(item.created_at)}
                  </span>
                </div>
                {item.version !== selectedContent.version && (
                  <button
                    onClick={() => handleRollback(item.id, item.version)}
                    disabled={loading}
                    className="text-xs px-2 py-1 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded disabled:opacity-50"
                  >
                    回滚到此版本
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 发布弹窗 */}
      {publishModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium">发布内容</h3>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slug（可选）
                </label>
                <input
                  type="text"
                  value={publishForm.slug}
                  onChange={(e) => setPublishForm(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="例如：about, blog/post-1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  内容类型
                </label>
                <select
                  value={publishForm.contentType}
                  onChange={(e) => setPublishForm(prev => ({ ...prev, contentType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="text/html">HTML</option>
                  <option value="application/json">JSON</option>
                  <option value="text/plain">纯文本</option>
                  <option value="text/markdown">Markdown</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  内容
                </label>
                <textarea
                  value={publishForm.content}
                  onChange={(e) => setPublishForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder={publishForm.contentType === 'application/json' ? '{"key": "value"}' : '<h1>Hello World</h1>'}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-mono text-sm"
                />
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setPublishModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handlePublish}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '发布中...' : '发布'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
