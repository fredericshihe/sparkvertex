// ============================================
// SparkVertex Cloud Sync Service Template
// ============================================

export const SYNC_SERVICE_TEMPLATE = `
// ============================================
// SparkVertex Cloud Sync Service
// 从云端信箱同步加密数据到本地
// ============================================

class SparkSync {
  constructor(appId, privateKey) {
    this.appId = appId;
    this.privateKey = privateKey;
    this.apiBase = '{{API_BASE}}';
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSync = null;
    this.listeners = new Set();
  }
  
  // 添加同步事件监听
  onSync(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  _emit(event, data) {
    this.listeners.forEach(cb => cb(event, data));
    window.dispatchEvent(new CustomEvent(\`spark:sync:\${event}\`, { detail: data }));
  }
  
  async start(intervalMs = 30000) {
    // 立即执行一次
    await this.sync();
    
    // 定时执行
    this.syncInterval = setInterval(() => this.sync(), intervalMs);
    console.log(\`🔄 Sync started (every \${intervalMs / 1000}s)\`);
  }
  
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Sync stopped');
    }
  }
  
  async sync() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress');
      return { skipped: true };
    }
    
    this.isSyncing = true;
    this._emit('start', { timestamp: new Date() });
    
    try {
      // 1. 从云端拉取新消息
      const res = await fetch(
        \`\${this.apiBase}/api/mailbox/sync?app_id=\${this.appId}\`,
        { credentials: 'include' }
      );
      
      if (!res.ok) {
        throw new Error(\`Sync failed: \${res.status}\`);
      }
      
      const { messages, total_pending } = await res.json();
      
      if (messages.length === 0) {
        console.log('📭 No new messages');
        this._emit('complete', { processed: 0, pending: total_pending });
        return { processed: 0, pending: total_pending };
      }
      
      console.log(\`📬 Received \${messages.length} new messages (\${total_pending} total pending)\`);
      
      // 2. 处理每条消息
      const processedIds = [];
      const errors = [];
      
      for (const msg of messages) {
        try {
          // 解密
          const decrypted = await this.decrypt(msg.encrypted_payload);
          
          // 写入本地数据库
          await this.saveToLocal(decrypted, msg.metadata);
          
          processedIds.push(msg.id);
          
        } catch (e) {
          console.error('Message processing failed:', e);
          errors.push({ id: msg.id, error: e.message });
        }
      }
      
      // 3. 批量确认收到
      if (processedIds.length > 0) {
        await fetch(\`\${this.apiBase}/api/mailbox/ack\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            message_ids: processedIds,
            app_id: this.appId
          })
        });
      }
      
      // 4. 触发硬盘备份
      if (window.sparkBackup && processedIds.length > 0) {
        await window.sparkBackup.save().catch(console.error);
      }
      
      this.lastSync = new Date();
      
      const result = {
        processed: processedIds.length,
        errors: errors.length,
        pending: total_pending - processedIds.length
      };
      
      this._emit('complete', result);
      console.log(\`✅ Sync complete: \${processedIds.length} processed\`);
      
      return result;
      
    } catch (e) {
      console.error('Sync error:', e);
      this._emit('error', { error: e.message });
      throw e;
    } finally {
      this.isSyncing = false;
    }
  }
  
  async decrypt(encryptedPayload) {
    try {
      const { iv, data } = JSON.parse(atob(encryptedPayload));
      
      const key = await crypto.subtle.importKey(
        'jwk',
        this.privateKey,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        key,
        new Uint8Array(data)
      );
      
      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      console.error('Decryption failed:', e);
      throw new Error('Failed to decrypt message');
    }
  }
  
  // 保存到本地数据库 - 需要根据具体 Schema 实现
  async saveToLocal(data, metadata) {
    if (!window.sparkDB || !window.sparkDB.ready) {
      throw new Error('Local database not ready');
    }
    
    // 检查数据类型并路由到相应处理器
    const type = data._type || data.type || 'submission';
    
    switch (type) {
      case 'submission':
      case 'form':
        return this.saveSubmission(data, metadata);
      case 'encrypted_file':
        return this.saveFileReference(data, metadata);
      default:
        return this.saveGeneric(data, metadata);
    }
  }
  
  async saveSubmission(data, metadata) {
    // 默认实现 - 保存到 submissions 表
    const { _type, ...fields } = data;
    
    const columns = Object.keys(fields);
    const values = Object.values(fields);
    const placeholders = columns.map((_, i) => \`$\${i + 1}\`);
    
    // 添加元数据
    columns.push('_metadata', '_synced_at');
    values.push(JSON.stringify(metadata), new Date().toISOString());
    placeholders.push(\`$\${columns.length - 1}\`, \`$\${columns.length}\`);
    
    await window.sparkDB.query(\`
      INSERT INTO submissions (\${columns.join(', ')})
      VALUES (\${placeholders.join(', ')})
    \`, values);
  }
  
  async saveFileReference(data, metadata) {
    // 保存加密文件引用
    await window.sparkDB.query(\`
      INSERT INTO _spark_files (
        path, encrypted_key, iv, original_name, original_size, mime_type, 
        _metadata, _synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    \`, [
      data.path,
      data.key,
      JSON.stringify(data.iv),
      data.original_name,
      data.original_size,
      data.mime_type,
      JSON.stringify(metadata),
      new Date().toISOString()
    ]);
  }
  
  async saveGeneric(data, metadata) {
    // 保存到通用表
    await window.sparkDB.query(\`
      INSERT INTO _spark_inbox (data, metadata, synced_at)
      VALUES ($1, $2, $3)
    \`, [
      JSON.stringify(data),
      JSON.stringify(metadata),
      new Date().toISOString()
    ]);
  }
  
  getStatus() {
    return {
      isRunning: !!this.syncInterval,
      isSyncing: this.isSyncing,
      lastSync: this.lastSync
    };
  }
}

// 全局实例占位符
window.sparkSync = null;
`;

// 生成带有具体配置的模板
export function generateSyncServiceCode(appId: string, apiBase: string): string {
  return SYNC_SERVICE_TEMPLATE
    .replace(/\{\{APP_ID\}\}/g, appId)
    .replace(/\{\{API_BASE\}\}/g, apiBase);
}
