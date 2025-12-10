// ============================================
// SparkVertex 客户端端到端加密工具
// 用于 iframe 内的表单数据加密
// ============================================

/**
 * 检查 Web Crypto API 是否可用
 * crypto.subtle 只在安全上下文 (HTTPS 或 localhost) 中可用
 */
export function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.subtle.generateKey === 'function';
}

/**
 * 生成 RSA 密钥对
 * @throws 如果不在安全上下文中会抛出错误
 */
export async function generateKeyPair(): Promise<{
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}> {
  // 检查 Web Crypto API 是否可用
  if (!isWebCryptoAvailable()) {
    throw new Error(
      'Web Crypto API 不可用。请使用 HTTPS 或 localhost 访问。' +
      '（当前页面不在安全上下文中）'
    );
  }
  
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );
  
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  
  return { publicKey, privateKey };
}

/**
 * 从 JWK 导入公钥
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
}

/**
 * 从 JWK 导入私钥
 */
export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );
}

/**
 * ArrayBuffer 转 Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 转 ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * AES-GCM 加密
 */
async function aesEncrypt(data: string): Promise<{
  encrypted: string;  // Base64
  key: ArrayBuffer;
  iv: Uint8Array;
}> {
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  
  const rawKey = await crypto.subtle.exportKey('raw', aesKey);
  
  return {
    encrypted: arrayBufferToBase64(encrypted),
    key: rawKey,
    iv
  };
}

/**
 * AES-GCM 解密
 */
async function aesDecrypt(
  encryptedBase64: string,
  key: ArrayBuffer,
  iv: Uint8Array
): Promise<string> {
  const aesKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const encrypted = base64ToArrayBuffer(encryptedBase64);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    aesKey,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

/**
 * 混合加密：用 AES 加密数据，用 RSA 加密 AES 密钥
 * 这样可以加密任意大小的数据
 */
export async function encryptData(
  data: unknown,
  publicKey: CryptoKey
): Promise<string> {
  const jsonData = JSON.stringify(data);
  
  // 1. AES 加密数据
  const { encrypted, key, iv } = await aesEncrypt(jsonData);
  
  // 2. RSA 加密 AES 密钥
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    key
  );
  
  // 3. 打包成一个 JSON 对象
  const payload = {
    v: 1, // 版本号，方便以后升级加密方案
    d: encrypted,  // 加密的数据 (Base64)
    k: arrayBufferToBase64(encryptedKey),  // 加密的 AES 密钥 (Base64)
    i: arrayBufferToBase64(iv.buffer as ArrayBuffer)  // IV (Base64)
  };
  
  return JSON.stringify(payload);
}

/**
 * 解密数据
 */
export async function decryptData<T = unknown>(
  encryptedPayload: string,
  privateKey: CryptoKey
): Promise<T> {
  const payload = JSON.parse(encryptedPayload);
  
  if (payload.v !== 1) {
    throw new Error('Unsupported encryption version');
  }
  
  // 1. RSA 解密 AES 密钥
  const encryptedKey = base64ToArrayBuffer(payload.k);
  const key = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedKey
  );
  
  // 2. AES 解密数据
  const iv = new Uint8Array(base64ToArrayBuffer(payload.i));
  const decrypted = await aesDecrypt(payload.d, key, iv);
  
  return JSON.parse(decrypted);
}

/**
 * 检查数据是否已加密（检查 payload 格式）
 */
export function isEncrypted(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return parsed.v === 1 && parsed.d && parsed.k && parsed.i;
  } catch {
    return false;
  }
}

/**
 * 密钥存储 Key
 */
const STORAGE_KEY_PUBLIC = 'spark_e2e_public_key';
const STORAGE_KEY_PRIVATE = 'spark_e2e_private_key';

/**
 * 保存密钥到 localStorage
 */
export function saveKeys(publicKey: JsonWebKey, privateKey: JsonWebKey): void {
  localStorage.setItem(STORAGE_KEY_PUBLIC, JSON.stringify(publicKey));
  localStorage.setItem(STORAGE_KEY_PRIVATE, JSON.stringify(privateKey));
}

/**
 * 从 localStorage 加载密钥
 */
export function loadKeys(): { publicKey: JsonWebKey; privateKey: JsonWebKey } | null {
  const pub = localStorage.getItem(STORAGE_KEY_PUBLIC);
  const priv = localStorage.getItem(STORAGE_KEY_PRIVATE);
  
  if (!pub || !priv) return null;
  
  try {
    return {
      publicKey: JSON.parse(pub),
      privateKey: JSON.parse(priv)
    };
  } catch {
    return null;
  }
}

/**
 * 检查是否有密钥
 */
export function hasKeys(): boolean {
  return !!localStorage.getItem(STORAGE_KEY_PUBLIC) && !!localStorage.getItem(STORAGE_KEY_PRIVATE);
}

/**
 * 删除密钥
 */
export function clearKeys(): void {
  localStorage.removeItem(STORAGE_KEY_PUBLIC);
  localStorage.removeItem(STORAGE_KEY_PRIVATE);
}

/**
 * 导出私钥为可下载的文件格式
 */
export function exportPrivateKeyForBackup(privateKey: JsonWebKey): string {
  return JSON.stringify({
    version: 1,
    type: 'spark-e2e-private-key',
    key: privateKey,
    created: new Date().toISOString()
  }, null, 2);
}

/**
 * 从备份文件导入私钥
 */
export function importPrivateKeyFromBackup(backupJson: string): JsonWebKey {
  const backup = JSON.parse(backupJson);
  if (backup.type !== 'spark-e2e-private-key') {
    throw new Error('Invalid backup file format');
  }
  return backup.key;
}
