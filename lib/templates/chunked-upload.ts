// ============================================
// SparkVertex Chunked Upload Template
// 大文件分片上传
// ============================================

export const CHUNKED_UPLOAD_TEMPLATE = `
// ============================================
// SparkVertex Chunked Upload
// 支持断点续传的大文件分片上传
// ============================================

class SparkChunkedUpload {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 5 * 1024 * 1024; // 5MB per chunk
    this.maxRetries = options.maxRetries || 3;
    this.concurrent = options.concurrent || 3;
    this.apiBase = options.apiBase || '{{API_BASE}}';
    
    this.uploads = new Map(); // uploadId -> state
  }
  
  // 开始上传
  async upload(file, options = {}) {
    const {
      appId,
      encrypt = true,
      publicKeyJWK = null,
      metadata = {},
      onProgress = null,
      onChunkComplete = null
    } = options;
    
    // 生成上传 ID
    const uploadId = this._generateId();
    
    // 计算分片
    const totalChunks = Math.ceil(file.size / this.chunkSize);
    
    // 初始化上传状态
    const state = {
      uploadId,
      file,
      appId,
      encrypt,
      publicKeyJWK,
      metadata,
      totalChunks,
      completedChunks: new Set(),
      failedChunks: new Map(),
      status: 'pending',
      startTime: Date.now(),
      encryptedChunks: new Map() // 缓存加密后的分片
    };
    
    this.uploads.set(uploadId, state);
    
    try {
      state.status = 'uploading';
      
      // 1. 初始化上传会话
      const initRes = await fetch(\`\${this.apiBase}/api/mailbox/upload/init\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          file_name: file.name,
          file_size: file.size,
          total_chunks: totalChunks,
          mime_type: file.type,
          encrypted: encrypt,
          metadata
        })
      });
      
      if (!initRes.ok) {
        throw new Error('Failed to initialize upload');
      }
      
      const { session_id } = await initRes.json();
      state.sessionId = session_id;
      
      // 2. 上传分片（并发）
      const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
      
      // 使用并发池
      await this._concurrentUpload(state, chunkIndices, {
        onProgress: (completed, total) => {
          onProgress?.({
            uploadId,
            progress: (completed / total) * 100,
            completedChunks: completed,
            totalChunks: total
          });
        },
        onChunkComplete
      });
      
      // 3. 完成上传
      const completeRes = await fetch(\`\${this.apiBase}/api/mailbox/upload/complete\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id,
          app_id: appId
        })
      });
      
      if (!completeRes.ok) {
        throw new Error('Failed to complete upload');
      }
      
      const result = await completeRes.json();
      
      state.status = 'completed';
      state.result = result;
      
      console.log(\`✅ Upload complete: \${file.name}\`);
      
      return {
        uploadId,
        path: result.path,
        ...result
      };
      
    } catch (e) {
      state.status = 'failed';
      state.error = e.message;
      throw e;
    }
  }
  
  // 并发上传分片
  async _concurrentUpload(state, chunkIndices, callbacks) {
    const { concurrent } = this;
    let completed = 0;
    
    const uploadChunk = async (index) => {
      const chunk = await this._readChunk(state.file, index);
      
      let data = chunk;
      let encryptionInfo = null;
      
      // 加密分片
      if (state.encrypt && state.publicKeyJWK) {
        const encrypted = await this._encryptChunk(chunk, state.publicKeyJWK);
        data = encrypted.data;
        encryptionInfo = {
          key: encrypted.key,
          iv: encrypted.iv
        };
      }
      
      // 上传
      for (let retry = 0; retry < this.maxRetries; retry++) {
        try {
          const formData = new FormData();
          formData.append('chunk', new Blob([data]));
          formData.append('session_id', state.sessionId);
          formData.append('chunk_index', index.toString());
          formData.append('app_id', state.appId);
          
          if (encryptionInfo) {
            formData.append('encryption_info', JSON.stringify(encryptionInfo));
          }
          
          const res = await fetch(\`\${this.apiBase}/api/mailbox/upload/chunk\`, {
            method: 'POST',
            body: formData
          });
          
          if (!res.ok) {
            throw new Error(\`Chunk \${index} failed: \${res.status}\`);
          }
          
          state.completedChunks.add(index);
          completed++;
          
          callbacks.onProgress?.(completed, state.totalChunks);
          callbacks.onChunkComplete?.(index, state.totalChunks);
          
          return;
          
        } catch (e) {
          if (retry === this.maxRetries - 1) {
            state.failedChunks.set(index, e.message);
            throw e;
          }
          // 指数退避
          await this._sleep(Math.pow(2, retry) * 1000);
        }
      }
    };
    
    // 并发池
    const pool = [];
    
    for (const index of chunkIndices) {
      if (state.completedChunks.has(index)) continue;
      
      const promise = uploadChunk(index).finally(() => {
        pool.splice(pool.indexOf(promise), 1);
      });
      
      pool.push(promise);
      
      if (pool.length >= concurrent) {
        await Promise.race(pool);
      }
    }
    
    await Promise.all(pool);
    
    // 检查是否有失败的分片
    if (state.failedChunks.size > 0) {
      throw new Error(\`\${state.failedChunks.size} chunks failed to upload\`);
    }
  }
  
  // 读取文件分片
  async _readChunk(file, index) {
    const start = index * this.chunkSize;
    const end = Math.min(start + this.chunkSize, file.size);
    const blob = file.slice(start, end);
    return new Uint8Array(await blob.arrayBuffer());
  }
  
  // 加密分片
  async _encryptChunk(data, publicKeyJWK) {
    // 生成 AES 密钥
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    );
    
    // 生成 IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 加密数据
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      data
    );
    
    // 导出 AES 密钥
    const rawKey = await crypto.subtle.exportKey('raw', aesKey);
    
    // RSA 加密 AES 密钥
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJWK,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );
    
    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      rawKey
    );
    
    return {
      data: new Uint8Array(encrypted),
      key: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
      iv: Array.from(iv)
    };
  }
  
  // 恢复上传
  async resume(uploadId) {
    const state = this.uploads.get(uploadId);
    if (!state) {
      throw new Error('Upload not found');
    }
    
    if (state.status === 'completed') {
      return state.result;
    }
    
    // 获取未完成的分片
    const pending = [];
    for (let i = 0; i < state.totalChunks; i++) {
      if (!state.completedChunks.has(i)) {
        pending.push(i);
      }
    }
    
    if (pending.length === 0) {
      // 所有分片已完成，尝试完成上传
      const completeRes = await fetch(\`\${this.apiBase}/api/mailbox/upload/complete\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: state.sessionId,
          app_id: state.appId
        })
      });
      
      if (!completeRes.ok) {
        throw new Error('Failed to complete upload');
      }
      
      return completeRes.json();
    }
    
    // 继续上传
    state.status = 'uploading';
    state.failedChunks.clear();
    
    await this._concurrentUpload(state, pending, {
      onProgress: (completed, total) => {
        console.log(\`Resume progress: \${completed}/\${total}\`);
      }
    });
    
    // 完成
    const completeRes = await fetch(\`\${this.apiBase}/api/mailbox/upload/complete\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: state.sessionId,
        app_id: state.appId
      })
    });
    
    return completeRes.json();
  }
  
  // 取消上传
  async cancel(uploadId) {
    const state = this.uploads.get(uploadId);
    if (!state) return;
    
    state.status = 'cancelled';
    
    // 通知服务器取消
    try {
      await fetch(\`\${this.apiBase}/api/mailbox/upload/cancel\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: state.sessionId,
          app_id: state.appId
        })
      });
    } catch {
      // 忽略错误
    }
    
    this.uploads.delete(uploadId);
  }
  
  // 获取上传状态
  getStatus(uploadId) {
    const state = this.uploads.get(uploadId);
    if (!state) return null;
    
    return {
      uploadId,
      fileName: state.file.name,
      fileSize: state.file.size,
      status: state.status,
      progress: (state.completedChunks.size / state.totalChunks) * 100,
      completedChunks: state.completedChunks.size,
      totalChunks: state.totalChunks,
      failedChunks: state.failedChunks.size,
      duration: Date.now() - state.startTime
    };
  }
  
  // 获取所有进行中的上传
  getActiveUploads() {
    const active = [];
    
    for (const [uploadId, state] of this.uploads) {
      if (state.status === 'uploading' || state.status === 'pending') {
        active.push(this.getStatus(uploadId));
      }
    }
    
    return active;
  }
  
  _generateId() {
    return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 全局实例
window.sparkChunkedUpload = new SparkChunkedUpload();
`;

export function generateChunkedUploadCode(apiBase: string, options?: {
  chunkSize?: number;
  maxRetries?: number;
  concurrent?: number;
}): string {
  let code = CHUNKED_UPLOAD_TEMPLATE.replace(/\{\{API_BASE\}\}/g, apiBase);
  
  if (options) {
    if (options.chunkSize) {
      code = code.replace('5 * 1024 * 1024', options.chunkSize.toString());
    }
    if (options.maxRetries) {
      code = code.replace('maxRetries || 3', `maxRetries || ${options.maxRetries}`);
    }
    if (options.concurrent) {
      code = code.replace('concurrent || 3', `concurrent || ${options.concurrent}`);
    }
  }
  
  return code;
}
