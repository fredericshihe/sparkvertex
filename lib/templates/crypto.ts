// ============================================
// SparkVertex Crypto Utilities Template
// Web Crypto API 加密/解密工具
// ============================================

export const CRYPTO_TEMPLATE = `
// ============================================
// SparkVertex Crypto Utilities
// RSA-OAEP + AES-GCM 混合加密
// ============================================

class SparkCrypto {
  constructor() {
    this.keyPair = null;
    this.publicKeyPEM = null;
  }
  
  // 初始化或恢复密钥对
  async init() {
    // 尝试从 IndexedDB 恢复
    const stored = await this._loadKeyPair();
    if (stored) {
      this.keyPair = stored;
      this.publicKeyPEM = await this.exportPublicKey();
      console.log('🔑 Key pair restored');
      return true;
    }
    
    // 生成新密钥对
    return await this.generateKeyPair();
  }
  
  // 生成 RSA 密钥对
  async generateKeyPair() {
    try {
      this.keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256'
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
      
      this.publicKeyPEM = await this.exportPublicKey();
      
      // 保存到 IndexedDB
      await this._saveKeyPair();
      
      console.log('🔐 New key pair generated');
      return true;
    } catch (e) {
      console.error('Key generation failed:', e);
      return false;
    }
  }
  
  // 导出公钥（PEM 格式）
  async exportPublicKey() {
    if (!this.keyPair) throw new Error('No key pair');
    
    const exported = await crypto.subtle.exportKey('spki', this.keyPair.publicKey);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
    
    // 格式化为 PEM
    const lines = base64.match(/.{1,64}/g) || [];
    return \`-----BEGIN PUBLIC KEY-----\\n\${lines.join('\\n')}\\n-----END PUBLIC KEY-----\`;
  }
  
  // 导出公钥（JWK 格式，用于 API）
  async exportPublicKeyJWK() {
    if (!this.keyPair) throw new Error('No key pair');
    return await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
  }
  
  // RSA 加密（用于加密 AES 密钥）
  async rsaEncrypt(data, publicKey = this.keyPair.publicKey) {
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      encoded
    );
    return new Uint8Array(encrypted);
  }
  
  // RSA 解密
  async rsaDecrypt(encryptedData) {
    if (!this.keyPair) throw new Error('No key pair');
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      this.keyPair.privateKey,
      encryptedData
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  }
  
  // AES-GCM 加密（用于大数据/文件）
  async aesEncrypt(data) {
    // 生成 AES 密钥
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // 生成 IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 加密数据
    const encoded = typeof data === 'string' 
      ? new TextEncoder().encode(data)
      : data;
      
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoded
    );
    
    // 导出 AES 密钥
    const rawKey = await crypto.subtle.exportKey('raw', aesKey);
    
    return {
      encrypted: new Uint8Array(encrypted),
      key: new Uint8Array(rawKey),
      iv: iv
    };
  }
  
  // AES-GCM 解密
  async aesDecrypt(encrypted, key, iv) {
    // 导入 AES 密钥
    const aesKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encrypted
    );
    
    return new Uint8Array(decrypted);
  }
  
  // 混合加密（大数据）: AES 加密数据，RSA 加密 AES 密钥
  async hybridEncrypt(data, publicKey = this.keyPair?.publicKey) {
    // 1. AES 加密数据
    const { encrypted, key, iv } = await this.aesEncrypt(data);
    
    // 2. RSA 加密 AES 密钥
    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      key
    );
    
    return {
      data: Array.from(encrypted),
      key: Array.from(new Uint8Array(encryptedKey)),
      iv: Array.from(iv)
    };
  }
  
  // 混合解密
  async hybridDecrypt(payload) {
    if (!this.keyPair) throw new Error('No key pair');
    
    const { data, key: encryptedKey, iv } = payload;
    
    // 1. RSA 解密 AES 密钥
    const key = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      this.keyPair.privateKey,
      new Uint8Array(encryptedKey)
    );
    
    // 2. AES 解密数据
    const decrypted = await this.aesDecrypt(
      new Uint8Array(data),
      new Uint8Array(key),
      new Uint8Array(iv)
    );
    
    return decrypted;
  }
  
  // 加密文件
  async encryptFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const encrypted = await this.hybridEncrypt(new Uint8Array(arrayBuffer));
    
    return {
      ...encrypted,
      original_name: file.name,
      original_size: file.size,
      mime_type: file.type
    };
  }
  
  // 解密文件
  async decryptFile(encrypted, filename, mimeType) {
    const decrypted = await this.hybridDecrypt(encrypted);
    return new File([decrypted], filename, { type: mimeType });
  }
  
  // 保存密钥对到 IndexedDB
  async _saveKeyPair() {
    if (!this.keyPair) return;
    
    const publicJWK = await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
    const privateJWK = await crypto.subtle.exportKey('jwk', this.keyPair.privateKey);
    
    return new Promise((resolve) => {
      const req = indexedDB.open('spark_crypto', 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('keys');
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('keys', 'readwrite');
        const store = tx.objectStore('keys');
        store.put({ public: publicJWK, private: privateJWK }, 'keyPair');
        tx.oncomplete = () => resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  }
  
  // 从 IndexedDB 加载密钥对
  async _loadKeyPair() {
    return new Promise((resolve) => {
      const req = indexedDB.open('spark_crypto', 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('keys');
      };
      req.onsuccess = async (e) => {
        const db = e.target.result;
        const tx = db.transaction('keys', 'readonly');
        const getReq = tx.objectStore('keys').get('keyPair');
        
        getReq.onsuccess = async () => {
          if (!getReq.result) {
            resolve(null);
            return;
          }
          
          try {
            const publicKey = await crypto.subtle.importKey(
              'jwk',
              getReq.result.public,
              { name: 'RSA-OAEP', hash: 'SHA-256' },
              true,
              ['encrypt']
            );
            
            const privateKey = await crypto.subtle.importKey(
              'jwk',
              getReq.result.private,
              { name: 'RSA-OAEP', hash: 'SHA-256' },
              true,
              ['decrypt']
            );
            
            resolve({ publicKey, privateKey });
          } catch {
            resolve(null);
          }
        };
        
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  }
  
  // 计算文件哈希
  async hash(data) {
    const buffer = typeof data === 'string' 
      ? new TextEncoder().encode(data)
      : data;
      
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // 生成随机 ID
  randomId(length = 16) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const arr = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(arr, x => chars[x % chars.length]).join('');
  }
}

// 全局实例占位符
window.sparkCrypto = null;
`;

export function generateCryptoCode(): string {
  return CRYPTO_TEMPLATE;
}
