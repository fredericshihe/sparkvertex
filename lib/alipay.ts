import { AlipaySdk, AlipayFormData } from 'alipay-sdk';

let alipaySdkInstance: AlipaySdk | null = null;

/**
 * 格式化私钥 - 处理 .env 中的单行私钥格式
 * alipay-sdk 需要原始的 base64 私钥字符串，不需要 PEM 头
 */
function formatPrivateKey(privateKey: string): string {
  let trimmed = privateKey.trim();
  
  // 如果包含 PEM 头尾，去掉它们
  if (trimmed.includes('-----BEGIN')) {
    trimmed = trimmed
      .replace(/-----BEGIN.*?-----/g, '')
      .replace(/-----END.*?-----/g, '')
      .replace(/\s/g, '');
  }
  
  // 返回纯 base64 字符串，SDK 内部会处理格式
  return trimmed;
}

/**
 * 格式化公钥 - 处理 .env 中的单行公钥格式
 * alipay-sdk 需要原始的 base64 公钥字符串
 */
function formatPublicKey(publicKey: string): string {
  let trimmed = publicKey.trim();
  
  // 如果包含 PEM 头尾，去掉它们
  if (trimmed.includes('-----BEGIN')) {
    trimmed = trimmed
      .replace(/-----BEGIN.*?-----/g, '')
      .replace(/-----END.*?-----/g, '')
      .replace(/\s/g, '');
  }
  
  return trimmed;
}

export function getAlipaySdk() {
  if (alipaySdkInstance) return alipaySdkInstance;

  const appId = process.env.ALIPAY_APP_ID;
  if (!appId) {
    throw new Error('ALIPAY_APP_ID is missing');
  }

  const rawPrivateKey = process.env.ALIPAY_PRIVATE_KEY;
  const rawPublicKey = process.env.ALIPAY_PUBLIC_KEY;

  if (!rawPrivateKey || !rawPublicKey) {
    throw new Error('ALIPAY_PRIVATE_KEY or ALIPAY_PUBLIC_KEY is missing');
  }

  alipaySdkInstance = new AlipaySdk({
    appId,
    privateKey: formatPrivateKey(rawPrivateKey),
    alipayPublicKey: formatPublicKey(rawPublicKey),
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  });

  return alipaySdkInstance;
}

// 导出 AlipayFormData 供其他模块使用
export { AlipayFormData };

