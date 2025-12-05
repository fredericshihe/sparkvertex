import { AlipaySdk } from 'alipay-sdk';

let alipaySdkInstance: AlipaySdk | null = null;

export function getAlipaySdk() {
  if (alipaySdkInstance) return alipaySdkInstance;

  const appId = process.env.ALIPAY_APP_ID;
  if (!appId) {
    throw new Error('ALIPAY_APP_ID is missing');
  }

  alipaySdkInstance = new AlipaySdk({
    appId,
    privateKey: process.env.ALIPAY_PRIVATE_KEY!,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY!,
    // 优先使用环境变量中的网关，默认为生产环境
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do', 
  });

  return alipaySdkInstance;
}

