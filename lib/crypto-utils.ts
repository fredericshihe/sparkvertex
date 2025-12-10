// ============================================
// SparkVertex Server-side Crypto Utilities
// 用于后端 API 的加密工具
// ============================================

/**
 * 从 PEM 格式导入 RSA 公钥
 */
export async function importPublicKey(pem: string): Promise<CryptoKey> {
  // 移除 PEM 头尾和换行
  const pemContents = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  
  // Base64 解码
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return crypto.subtle.importKey(
    'spki',
    bytes.buffer as ArrayBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
}

/**
 * 从 JWK 格式导入 RSA 公钥
 */
export async function importPublicKeyJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
}

/**
 * 从 JWK 格式导入 RSA 私钥
 */
export async function importPrivateKeyJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );
}

/**
 * 使用 RSA 公钥加密数据
 */
export async function rsaEncrypt(data: unknown, publicKey: CryptoKey): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    encoded
  );
  
  // 返回 Base64 编码
  return arrayBufferToBase64(encrypted);
}

/**
 * 使用 RSA 私钥解密数据
 */
export async function rsaDecrypt<T = unknown>(encryptedBase64: string, privateKey: CryptoKey): Promise<T> {
  // Base64 解码
  const bytes = base64ToArrayBuffer(encryptedBase64);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    bytes
  );
  
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * AES-GCM 加密
 */
export async function aesEncrypt(data: Uint8Array | string): Promise<{
  encrypted: Uint8Array;
  key: Uint8Array;
  iv: Uint8Array;
}> {
  // 生成 AES 密钥
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // 生成 IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // 编码数据
  const encoded = typeof data === 'string' 
    ? new TextEncoder().encode(data)
    : data;
  
  // 加密
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aesKey,
    encoded.buffer as ArrayBuffer
  );
  
  // 导出密钥
  const rawKey = await crypto.subtle.exportKey('raw', aesKey);
  
  return {
    encrypted: new Uint8Array(encrypted),
    key: new Uint8Array(rawKey),
    iv
  };
}

/**
 * AES-GCM 解密
 */
export async function aesDecrypt(
  encrypted: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  // 导入 AES 密钥
  const aesKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aesKey,
    encrypted.buffer as ArrayBuffer
  );
  
  return new Uint8Array(decrypted);
}

/**
 * 混合加密：AES 加密数据，RSA 加密 AES 密钥
 */
export async function hybridEncrypt(
  data: Uint8Array | string,
  publicKey: CryptoKey
): Promise<{
  data: number[];
  key: number[];
  iv: number[];
}> {
  // 1. AES 加密数据
  const { encrypted, key, iv } = await aesEncrypt(data);
  
  // 2. RSA 加密 AES 密钥
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    key.buffer as ArrayBuffer
  );
  
  return {
    data: Array.from(encrypted),
    key: Array.from(new Uint8Array(encryptedKey)),
    iv: Array.from(iv)
  };
}

/**
 * 混合解密
 */
export async function hybridDecrypt(
  payload: { data: number[]; key: number[]; iv: number[] },
  privateKey: CryptoKey
): Promise<Uint8Array> {
  // 1. RSA 解密 AES 密钥
  const keyArray = new Uint8Array(payload.key);
  const key = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    keyArray.buffer as ArrayBuffer
  );
  
  // 2. AES 解密数据
  return aesDecrypt(
    new Uint8Array(payload.data),
    new Uint8Array(key),
    new Uint8Array(payload.iv)
  );
}

/**
 * 计算 SHA-256 哈希
 */
export async function sha256(data: string | Uint8Array): Promise<string> {
  const buffer = typeof data === 'string' 
    ? new TextEncoder().encode(data)
    : data;
    
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成随机 ID
 */
export function randomId(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(arr, x => chars[x % chars.length]).join('');
}

/**
 * 生成 RSA 密钥对
 */
export async function generateKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyPEM: string;
  publicKeyJWK: JsonWebKey;
  privateKeyJWK: JsonWebKey;
}> {
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
  
  // 导出为不同格式
  const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyJWK = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJWK = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  
  // 转换为 PEM
  const base64 = arrayBufferToBase64(publicKeySpki);
  const lines = base64.match(/.{1,64}/g) || [];
  const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyPEM,
    publicKeyJWK,
    privateKeyJWK
  };
}

/**
 * 验证密钥对是否匹配
 */
export async function verifyKeyPair(
  publicKey: CryptoKey,
  privateKey: CryptoKey
): Promise<boolean> {
  try {
    const testData = new TextEncoder().encode('test');
    
    // 用公钥加密
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      testData
    );
    
    // 用私钥解密
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encrypted
    );
    
    // 验证结果
    const result = new TextDecoder().decode(decrypted);
    return result === 'test';
  } catch {
    return false;
  }
}

/**
 * ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Base64 编码 Uint8Array
 */
export function encodeBase64(data: Uint8Array): string {
  return arrayBufferToBase64(data.buffer as ArrayBuffer);
}

/**
 * Base64 解码为 Uint8Array
 */
export function decodeBase64(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64));
}
