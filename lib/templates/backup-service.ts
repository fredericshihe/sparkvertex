// ============================================
// SparkVertex Backup Service Template
// File System Access API 本地备份
// ============================================

export const BACKUP_SERVICE_TEMPLATE = `
// ============================================
// SparkVertex Backup Service
// 使用 File System Access API 进行本地硬盘备份
// ============================================

class SparkBackup {
  constructor(appName = 'SparkVertex App') {
    this.appName = appName;
    this.dirHandle = null;
    this.fileHandle = null;
    this.lastBackup = null;
    this.autoBackupInterval = null;
  }
  
  // 检查 File System API 是否可用
  isSupported() {
    return 'showSaveFilePicker' in window && 'showDirectoryPicker' in window;
  }
  
  // 选择备份文件夹（一次性）
  async selectFolder() {
    if (!this.isSupported()) {
      console.warn('File System API not supported');
      return false;
    }
    
    try {
      this.dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });
      
      // 创建或获取备份文件
      const fileName = \`\${this.appName.replace(/[^a-z0-9]/gi, '_')}_backup.json\`;
      this.fileHandle = await this.dirHandle.getFileHandle(fileName, { create: true });
      
      // 存储权限以便下次使用
      await this._persistHandle();
      
      console.log(\`📁 Backup folder selected: \${this.dirHandle.name}\`);
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Failed to select folder:', e);
      }
      return false;
    }
  }
  
  // 尝试恢复之前的权限
  async tryRestoreAccess() {
    if (!this.isSupported()) return false;
    
    const stored = localStorage.getItem('spark_backup_handle');
    if (!stored) return false;
    
    try {
      // 检查是否还有权限
      const perm = await this.dirHandle?.queryPermission?.({ mode: 'readwrite' });
      if (perm === 'granted') {
        console.log('📁 Backup access restored');
        return true;
      }
      
      // 需要重新授权
      const newPerm = await this.dirHandle?.requestPermission?.({ mode: 'readwrite' });
      return newPerm === 'granted';
    } catch {
      return false;
    }
  }
  
  async _persistHandle() {
    // IndexedDB 存储 handle（跨会话）
    if (!('indexedDB' in window)) return;
    
    return new Promise((resolve) => {
      const req = indexedDB.open('spark_backup', 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('handles');
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(this.dirHandle, 'dir');
        tx.oncomplete = resolve;
      };
      req.onerror = resolve;
    });
  }
  
  async _restoreHandle() {
    if (!('indexedDB' in window)) return false;
    
    return new Promise((resolve) => {
      const req = indexedDB.open('spark_backup', 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('handles');
      };
      req.onsuccess = async (e) => {
        const db = e.target.result;
        const tx = db.transaction('handles', 'readonly');
        const getReq = tx.objectStore('handles').get('dir');
        getReq.onsuccess = async () => {
          if (getReq.result) {
            this.dirHandle = getReq.result;
            // 验证权限
            const perm = await this.dirHandle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
              const fileName = \`\${this.appName.replace(/[^a-z0-9]/gi, '_')}_backup.json\`;
              this.fileHandle = await this.dirHandle.getFileHandle(fileName, { create: true });
              resolve(true);
            } else {
              resolve(false);
            }
          } else {
            resolve(false);
          }
        };
        getReq.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    });
  }
  
  async init() {
    // 尝试恢复之前的权限
    return await this._restoreHandle();
  }
  
  // 执行备份
  async save() {
    if (!this.fileHandle) {
      console.warn('No backup file selected');
      return false;
    }
    
    if (!window.sparkDB || !window.sparkDB.ready) {
      console.warn('Database not ready');
      return false;
    }
    
    try {
      // 导出数据库
      const data = await window.sparkDB.export();
      
      // 创建备份数据包
      const backup = {
        app: this.appName,
        version: data.version || '1.0.0',
        timestamp: new Date().toISOString(),
        data: data
      };
      
      // 写入文件
      const writable = await this.fileHandle.createWritable();
      await writable.write(JSON.stringify(backup, null, 2));
      await writable.close();
      
      this.lastBackup = new Date();
      
      console.log(\`💾 Backup saved at \${this.lastBackup.toLocaleTimeString()}\`);
      
      // 触发事件
      window.dispatchEvent(new CustomEvent('spark:backup:saved', {
        detail: { timestamp: this.lastBackup }
      }));
      
      return true;
    } catch (e) {
      console.error('Backup failed:', e);
      return false;
    }
  }
  
  // 从备份恢复
  async restore() {
    if (!this.fileHandle) {
      // 让用户选择文件
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'JSON Backup',
            accept: { 'application/json': ['.json'] }
          }]
        });
        this.fileHandle = handle;
      } catch (e) {
        if (e.name !== 'AbortError') console.error(e);
        return false;
      }
    }
    
    try {
      const file = await this.fileHandle.getFile();
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!backup.data) {
        throw new Error('Invalid backup format');
      }
      
      // 确认恢复
      const timeStr = new Date(backup.timestamp).toLocaleString();
      const message = "即将恢复备份:\n\n" +
        "应用: " + backup.app + "\n" +
        "时间: " + timeStr + "\n\n" +
        "当前数据将被覆盖，确认恢复？";
      const confirmed = confirm(message);
      
      if (!confirmed) return false;
      
      // 导入数据
      await window.sparkDB.import(backup.data);
      
      console.log(\`📦 Backup restored from \${backup.timestamp}\`);
      
      window.dispatchEvent(new CustomEvent('spark:backup:restored', {
        detail: { timestamp: backup.timestamp }
      }));
      
      return true;
    } catch (e) {
      console.error('Restore failed:', e);
      return false;
    }
  }
  
  // 开启自动备份
  startAutoBackup(intervalMs = 60000) {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
    }
    
    this.autoBackupInterval = setInterval(() => {
      this.save().catch(console.error);
    }, intervalMs);
    
    console.log(\`🔄 Auto-backup started (every \${intervalMs / 1000}s)\`);
  }
  
  stopAutoBackup() {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
      this.autoBackupInterval = null;
      console.log('⏹️ Auto-backup stopped');
    }
  }
  
  // 下载备份（fallback）
  async download() {
    if (!window.sparkDB || !window.sparkDB.ready) {
      console.warn('Database not ready');
      return false;
    }
    
    try {
      const data = await window.sparkDB.export();
      
      const backup = {
        app: this.appName,
        timestamp: new Date().toISOString(),
        data: data
      };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = \`\${this.appName.replace(/[^a-z0-9]/gi, '_')}_backup_\${Date.now()}.json\`;
      a.click();
      
      URL.revokeObjectURL(url);
      
      console.log('📥 Backup downloaded');
      return true;
    } catch (e) {
      console.error('Download failed:', e);
      return false;
    }
  }
  
  // 从文件上传恢复（fallback）
  async uploadRestore() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
          resolve(false);
          return;
        }
        
        try {
          const text = await file.text();
          const backup = JSON.parse(text);
          
          if (!backup.data) {
            throw new Error('Invalid backup format');
          }
          
          const confirmed = confirm(
            \`即将恢复备份:\\n\\n\` +
            \`应用: \${backup.app}\\n\` +
            \`时间: \${new Date(backup.timestamp).toLocaleString()}\\n\\n\` +
            \`当前数据将被覆盖，确认恢复？\`
          );
          
          if (!confirmed) {
            resolve(false);
            return;
          }
          
          await window.sparkDB.import(backup.data);
          
          console.log(\`📦 Backup restored from \${backup.timestamp}\`);
          resolve(true);
        } catch (e) {
          console.error('Restore failed:', e);
          resolve(false);
        }
      };
      
      input.click();
    });
  }
  
  getStatus() {
    return {
      isSupported: this.isSupported(),
      hasFolder: !!this.dirHandle,
      lastBackup: this.lastBackup,
      isAutoBackup: !!this.autoBackupInterval
    };
  }
}

// 全局实例占位符
window.sparkBackup = null;
`;

export function generateBackupServiceCode(appName: string): string {
  return BACKUP_SERVICE_TEMPLATE.replace(/SparkVertex App/g, appName);
}
