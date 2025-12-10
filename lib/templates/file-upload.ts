// ============================================
// SparkVertex Encrypted File Upload Template
// 加密文件上传到私有存储桶
// ============================================

export const FILE_UPLOAD_TEMPLATE = `
// ============================================
// SparkVertex Encrypted File Upload
// 使用混合加密上传文件到云端
// ============================================

class SparkFileUpload {
  constructor(appId, publicKeyJWK) {
    this.appId = appId;
    this.publicKeyJWK = publicKeyJWK;
    this.publicKey = null;
    this.apiBase = '{{API_BASE}}';
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
    this.uploadQueue = [];
    this.isUploading = false;
  }
  
  async init() {
    if (!this.publicKeyJWK) {
      console.warn('No public key provided');
      return false;
    }
    
    try {
      this.publicKey = await crypto.subtle.importKey(
        'jwk',
        this.publicKeyJWK,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      );
      console.log('🔑 Public key imported for file encryption');
      return true;
    } catch (e) {
      console.error('Failed to import public key:', e);
      return false;
    }
  }
  
  // 加密并上传单个文件
  async upload(file, options = {}) {
    const {
      onProgress = null,
      metadata = {}
    } = options;
    
    // 验证文件大小
    if (file.size > this.maxFileSize) {
      throw new Error(\`File too large. Max size: \${this.maxFileSize / 1024 / 1024}MB\`);
    }
    
    if (!this.publicKey) {
      throw new Error('Public key not initialized. Call init() first.');
    }
    
    onProgress?.({ stage: 'reading', progress: 0 });
    
    try {
      // 1. 读取文件
      const arrayBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(arrayBuffer);
      
      onProgress?.({ stage: 'encrypting', progress: 20 });
      
      // 2. 生成 AES 密钥并加密文件
      const aesKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        fileData
      );
      
      onProgress?.({ stage: 'encrypting', progress: 50 });
      
      // 3. 导出并用 RSA 加密 AES 密钥
      const rawKey = await crypto.subtle.exportKey('raw', aesKey);
      const encryptedKey = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        this.publicKey,
        rawKey
      );
      
      onProgress?.({ stage: 'uploading', progress: 60 });
      
      // 4. 准备上传数据
      const formData = new FormData();
      formData.append('file', new Blob([encryptedData]), 'encrypted');
      formData.append('app_id', this.appId);
      formData.append('encrypted_key', btoa(String.fromCharCode(...new Uint8Array(encryptedKey))));
      formData.append('iv', btoa(String.fromCharCode(...iv)));
      formData.append('original_name', file.name);
      formData.append('original_size', file.size.toString());
      formData.append('mime_type', file.type);
      formData.append('metadata', JSON.stringify(metadata));
      
      // 5. 上传到服务器
      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const uploadProgress = 60 + (e.loaded / e.total) * 40;
            onProgress?.({ stage: 'uploading', progress: uploadProgress });
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(\`Upload failed: \${xhr.status}\`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
      });
      
      xhr.open('POST', \`\${this.apiBase}/api/mailbox/upload\`);
      xhr.withCredentials = false; // 公开上传
      xhr.send(formData);
      
      const result = await uploadPromise;
      
      onProgress?.({ stage: 'complete', progress: 100 });
      
      console.log(\`📤 File uploaded: \${file.name}\`);
      
      return {
        path: result.path,
        encrypted_key: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
        iv: Array.from(iv),
        original_name: file.name,
        original_size: file.size,
        mime_type: file.type
      };
      
    } catch (e) {
      onProgress?.({ stage: 'error', error: e.message });
      throw e;
    }
  }
  
  // 批量上传
  async uploadMultiple(files, options = {}) {
    const {
      onProgress = null,
      onFileComplete = null,
      sequential = false
    } = options;
    
    const results = [];
    const total = files.length;
    let completed = 0;
    
    const uploadOne = async (file, index) => {
      try {
        const result = await this.upload(file, {
          onProgress: (p) => {
            const fileProgress = (completed + p.progress / 100) / total;
            onProgress?.({
              file: file.name,
              fileIndex: index,
              ...p,
              totalProgress: fileProgress * 100
            });
          }
        });
        
        completed++;
        onFileComplete?.(file, result, index);
        
        return { success: true, file: file.name, result };
      } catch (e) {
        completed++;
        return { success: false, file: file.name, error: e.message };
      }
    };
    
    if (sequential) {
      for (let i = 0; i < files.length; i++) {
        results.push(await uploadOne(files[i], i));
      }
    } else {
      const promises = files.map((file, i) => uploadOne(file, i));
      results.push(...await Promise.all(promises));
    }
    
    return results;
  }
  
  // 添加到队列
  enqueue(file, options = {}) {
    return new Promise((resolve, reject) => {
      this.uploadQueue.push({
        file,
        options,
        resolve,
        reject
      });
      
      this._processQueue();
    });
  }
  
  async _processQueue() {
    if (this.isUploading || this.uploadQueue.length === 0) return;
    
    this.isUploading = true;
    
    while (this.uploadQueue.length > 0) {
      const { file, options, resolve, reject } = this.uploadQueue.shift();
      
      try {
        const result = await this.upload(file, options);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
    
    this.isUploading = false;
  }
  
  // 创建文件输入
  createFileInput(options = {}) {
    const {
      accept = '*/*',
      multiple = false,
      onSelect = null
    } = options;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    
    input.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      onSelect?.(files);
      input.value = ''; // 重置
    });
    
    document.body.appendChild(input);
    
    return {
      open: () => input.click(),
      destroy: () => input.remove()
    };
  }
  
  // 创建拖放区域
  createDropZone(element, options = {}) {
    const {
      onDrop = null,
      onDragEnter = null,
      onDragLeave = null,
      accept = null
    } = options;
    
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    const handleDragEnter = (e) => {
      e.preventDefault();
      onDragEnter?.(e);
    };
    
    const handleDragLeave = (e) => {
      e.preventDefault();
      onDragLeave?.(e);
    };
    
    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      let files = Array.from(e.dataTransfer.files);
      
      // 过滤文件类型
      if (accept) {
        const acceptList = accept.split(',').map(s => s.trim());
        files = files.filter(f => {
          return acceptList.some(a => {
            if (a.startsWith('.')) {
              return f.name.toLowerCase().endsWith(a.toLowerCase());
            }
            if (a.endsWith('/*')) {
              return f.type.startsWith(a.replace('/*', '/'));
            }
            return f.type === a;
          });
        });
      }
      
      onDrop?.(files);
    };
    
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);
    
    return {
      destroy: () => {
        el.removeEventListener('dragover', handleDragOver);
        el.removeEventListener('dragenter', handleDragEnter);
        el.removeEventListener('dragleave', handleDragLeave);
        el.removeEventListener('drop', handleDrop);
      }
    };
  }
}

// 全局实例占位符
window.sparkFileUpload = null;
`;

export function generateFileUploadCode(appId: string, apiBase: string): string {
  return FILE_UPLOAD_TEMPLATE
    .replace(/\{\{APP_ID\}\}/g, appId)
    .replace(/\{\{API_BASE\}\}/g, apiBase);
}
