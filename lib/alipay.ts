import AlipaySdk from 'alipay-sdk';

const alipaySdk = new AlipaySdk({
  appId: process.env.ALIPAY_APP_ID!,
  privateKey: process.env.ALIPAY_PRIVATE_KEY!,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY!,
  // 支付宝网关，沙箱环境用 'https://openapi.alipaydev.com/gateway.do'
  gateway: 'https://openapi.alipay.com/gateway.do', 
});

export default alipaySdk;
