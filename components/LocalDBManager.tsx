'use client';

import { useState, useEffect, useCallback } from 'react';

interface DBStats {
  tables: number;
  totalRows: number;
  sizeBytes: number;
}

interface SyncStatus {
  isRunning: boolean;
  isSyncing: boolean;
  lastSync: string | null;
  pending: number;
}

interface BackupStatus {
  isSupported: boolean;
  hasFolder: boolean;
  lastBackup: string | null;
  isAutoBackup: boolean;
}

interface LocalDBManagerProps {
  appName?: string;
  showSync?: boolean;
  showBackup?: boolean;
  className?: string;
}

export default function LocalDBManager({
  appName = 'SparkVertex App',
  showSync = true,
  showBackup = true,
  className = ''
}: LocalDBManagerProps) {
  const [isReady, setIsReady] = useState(false);
  const [dbStats, setDbStats] = useState<DBStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // 检查数据库状态
  const checkDBStatus = useCallback(async () => {
    try {
      // @ts-expect-error - window.sparkDB 在运行时注入
      if (window.sparkDB?.ready) {
        // @ts-expect-error
        const stats = await window.sparkDB.getStats();
        setDbStats(stats);
        setIsReady(true);
      }
    } catch (e) {
      console.error('Failed to check DB status:', e);
    }
  }, []);

  // 检查同步状态
  const checkSyncStatus = useCallback(() => {
    // @ts-expect-error
    if (window.sparkSync) {
      // @ts-expect-error
      const status = window.sparkSync.getStatus();
      setSyncStatus({
        ...status,
        pending: 0 // Will be updated on sync
      });
    }
  }, []);

  // 检查备份状态
  const checkBackupStatus = useCallback(() => {
    // @ts-expect-error
    if (window.sparkBackup) {
      // @ts-expect-error
      const status = window.sparkBackup.getStatus();
      setBackupStatus({
        ...status,
        lastBackup: status.lastBackup?.toISOString() || null
      });
    }
  }, []);

  // 初始化
  useEffect(() => {
    const handleReady = () => {
      checkDBStatus();
      checkSyncStatus();
      checkBackupStatus();
    };

    // 监听初始化完成事件
    window.addEventListener('spark:ready', handleReady);
    
    // 检查是否已经初始化
    // @ts-expect-error
    if (window.sparkDB?.ready) {
      handleReady();
    }

    return () => {
      window.removeEventListener('spark:ready', handleReady);
    };
  }, [checkDBStatus, checkSyncStatus, checkBackupStatus]);

  // 监听同步事件
  useEffect(() => {
    const handleSyncComplete = (e: CustomEvent) => {
      const { pending } = e.detail;
      setSyncStatus(prev => prev ? { ...prev, pending, isSyncing: false } : null);
      checkDBStatus(); // 刷新数据库统计
    };

    const handleSyncStart = () => {
      setSyncStatus(prev => prev ? { ...prev, isSyncing: true } : null);
    };

    window.addEventListener('spark:sync:complete', handleSyncComplete as EventListener);
    window.addEventListener('spark:sync:start', handleSyncStart);

    return () => {
      window.removeEventListener('spark:sync:complete', handleSyncComplete as EventListener);
      window.removeEventListener('spark:sync:start', handleSyncStart);
    };
  }, [checkDBStatus]);

  // 手动同步
  const handleSync = async () => {
    setLoading('sync');
    setError(null);
    try {
      // @ts-expect-error
      await window.sparkSync?.sync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
      checkSyncStatus();
    }
  };

  // 开始/停止自动同步
  const toggleAutoSync = () => {
    // @ts-expect-error
    const sync = window.sparkSync;
    if (!sync) return;

    if (syncStatus?.isRunning) {
      sync.stop();
    } else {
      sync.start(30000); // 30秒间隔
    }
    checkSyncStatus();
  };

  // 选择备份文件夹
  const handleSelectBackupFolder = async () => {
    setLoading('backup-folder');
    setError(null);
    try {
      // @ts-expect-error
      const success = await window.sparkBackup?.selectFolder();
      if (success) {
        checkBackupStatus();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  // 手动备份
  const handleBackup = async () => {
    setLoading('backup');
    setError(null);
    try {
      // @ts-expect-error
      await window.sparkBackup?.save();
      checkBackupStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  // 从备份恢复
  const handleRestore = async () => {
    if (!confirm('确定要从备份恢复吗？当前数据将被覆盖。')) return;
    
    setLoading('restore');
    setError(null);
    try {
      // @ts-expect-error
      await window.sparkBackup?.uploadRestore();
      checkDBStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  // 下载备份
  const handleDownload = async () => {
    setLoading('download');
    try {
      // @ts-expect-error
      await window.sparkBackup?.download();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  // 导出数据库
  const handleExport = async () => {
    setLoading('export');
    try {
      // @ts-expect-error
      const data = await window.sparkDB?.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appName.replace(/[^a-z0-9]/gi, '_')}_export_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  // 格式化大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 格式化时间
  const formatTime = (iso: string | null) => {
    if (!iso) return '从未';
    return new Date(iso).toLocaleString();
  };

  if (!isReady) {
    return (
      <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>正在初始化本地数据库...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          📊 本地数据管理
        </h3>
      </div>

      {/* 数据库统计 */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {dbStats?.tables || 0}
            </div>
            <div className="text-xs text-gray-500">数据表</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {dbStats?.totalRows || 0}
            </div>
            <div className="text-xs text-gray-500">数据行</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {formatSize(dbStats?.sizeBytes || 0)}
            </div>
            <div className="text-xs text-gray-500">存储大小</div>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 云端同步 */}
      {showSync && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-700 dark:text-gray-300">☁️ 云端同步</h4>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${syncStatus?.isRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="text-xs text-gray-500">
                {syncStatus?.isRunning ? '自动同步中' : '已暂停'}
              </span>
            </div>
          </div>
          
          <div className="text-sm text-gray-500 mb-3">
            上次同步：{formatTime(syncStatus?.lastSync || null)}
            {syncStatus?.pending !== undefined && syncStatus.pending > 0 && (
              <span className="ml-2 text-orange-500">
                ({syncStatus.pending} 条待同步)
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={loading === 'sync' || syncStatus?.isSyncing}
              className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === 'sync' || syncStatus?.isSyncing ? '同步中...' : '立即同步'}
            </button>
            <button
              onClick={toggleAutoSync}
              className={`px-3 py-2 rounded-lg text-sm ${
                syncStatus?.isRunning
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {syncStatus?.isRunning ? '停止' : '开启自动'}
            </button>
          </div>
        </div>
      )}

      {/* 本地备份 */}
      {showBackup && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-700 dark:text-gray-300">💾 本地备份</h4>
            <span className={`text-xs px-2 py-1 rounded ${
              backupStatus?.isSupported 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800'
            }`}>
              {backupStatus?.isSupported ? '支持文件系统' : '仅支持下载'}
            </span>
          </div>

          <div className="text-sm text-gray-500 mb-3">
            上次备份：{formatTime(backupStatus?.lastBackup || null)}
          </div>

          <div className="flex flex-wrap gap-2">
            {backupStatus?.isSupported && !backupStatus.hasFolder && (
              <button
                onClick={handleSelectBackupFolder}
                disabled={loading === 'backup-folder'}
                className="px-3 py-2 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 disabled:opacity-50"
              >
                {loading === 'backup-folder' ? '选择中...' : '选择备份文件夹'}
              </button>
            )}
            
            {backupStatus?.hasFolder && (
              <button
                onClick={handleBackup}
                disabled={loading === 'backup'}
                className="px-3 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
              >
                {loading === 'backup' ? '备份中...' : '备份到硬盘'}
              </button>
            )}

            <button
              onClick={handleDownload}
              disabled={loading === 'download'}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              {loading === 'download' ? '下载中...' : '下载备份'}
            </button>

            <button
              onClick={handleRestore}
              disabled={loading === 'restore'}
              className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {loading === 'restore' ? '恢复中...' : '从文件恢复'}
            </button>

            <button
              onClick={handleExport}
              disabled={loading === 'export'}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {loading === 'export' ? '导出中...' : '导出 JSON'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
