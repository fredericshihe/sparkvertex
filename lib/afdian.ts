import crypto from 'crypto';

// 爱发电公钥 - 从环境变量读取，如果没有则使用默认公钥
// 注意：Vercel 环境变量中配置时，需要保持正确的格式（包含 -----BEGIN PUBLIC KEY----- 等）
const DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwwdaCg1Bt+UKZKs0R54y
lYnuANma4IpgoOwNmk3a0rhg/PQuhUJ0EOZSowIC44l0K3+fqGns3Ygi4AfmEfS4
EKbdk1ahSxu7Zkp2rHMt+R9arQFQkwSS/5x1dYiHNVMiR8oIXDgjmvxuNes2Cr8f
w9dEF0xNBKdkKgG2qAawcN1nZrdyaKWtPVT9mHl0ddOO9thZmVLFOb9NVzgYfjEg
I+KWX6aY19Ka/ghv/L4t1IXmz9pctablN5S0CRWpJW3Cn0k6zSXjVdKm4uN7jRlg
SRaf/Ind46vMCm3N2sgwxu/g3bnooW+db0iLo13zzuvyn727Q3UDQ0MmZcEWMQID
AQAB
-----END PUBLIC KEY-----`;

// 格式化公钥，处理环境变量中可能存在的格式问题（如换行符被转义）
function formatPublicKey(key: string): string {
  if (!key) return key;
  
  let cleanKey = key;
  
  // 1. 移除首尾可能存在的引号
  if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || 
      (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
    cleanKey = cleanKey.slice(1, -1);
  }

  // 2. 处理转义换行符 (将 \n 转换为实际换行，以便后续处理)
  cleanKey = cleanKey.replace(/\\n/g, '\n');

  // 3. 提取纯 Base64 内容
  // 移除头尾标记
  cleanKey = cleanKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '');
    
  // 移除所有空白字符（空格、换行、制表符等）
  const base64Content = cleanKey.replace(/\s+/g, '');
  
  // 4. 重新构建标准的 PEM 格式
  // 每 64 个字符插入一个换行符
  const chunked = base64Content.match(/.{1,64}/g)?.join('\n');
  
  return `-----BEGIN PUBLIC KEY-----\n${chunked}\n-----END PUBLIC KEY-----`;
}

export const AFDIAN_PUBLIC_KEY = formatPublicKey(process.env.AFDIAN_PUBLIC_KEY || DEFAULT_PUBLIC_KEY);

// 是否启用严格验签模式（环境变量控制）
const STRICT_SIGNATURE_MODE = process.env.AFDIAN_STRICT_SIGNATURE !== 'false';

export const AFDIAN_USER_ID = process.env.AFDIAN_USER_ID;

export interface AfdianOrder {
  out_trade_no: string;
  user_id: string;
  plan_id: string;
  title: string;
  month: number;
  total_amount: string;
  show_amount: string;
  status: number;
  remark: string;
  redeem_id: string;
  product_type: number;
  discount: string;
  sku_detail: any[];
}

export interface AfdianWebhookPayload {
  ec: number;
  em: string;
  data: {
    type: string;
    order: AfdianOrder;
    sign: string;
  };
}

export function verifyAfdianSignature(payload: AfdianWebhookPayload): boolean {
  try {
    const { data } = payload;
    if (!data || !data.order || !data.sign) {
      console.error('[Afdian] Missing required fields in webhook payload');
      return false;
    }

    const { order, sign } = data;
    
    // 拼接被签名的数据: out_trade_no + user_id + plan_id + total_amount
    const content = `${order.out_trade_no}${order.user_id}${order.plan_id}${order.total_amount}`;
    
    // 验证签名
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(content, 'utf8');
    verify.end();
    
    const isValid = verify.verify(AFDIAN_PUBLIC_KEY, sign, 'base64');
    
    if (!isValid) {
      console.warn('[Afdian] Signature verification failed for order:', order.out_trade_no);
      console.warn('[Afdian] Signature content:', content);
      console.warn('[Afdian] Public Key Length:', AFDIAN_PUBLIC_KEY.length);
    }
    
    return isValid;
  } catch (error) {
    console.error('[Afdian] Signature verification error:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[Afdian] Public Key Length:', AFDIAN_PUBLIC_KEY.length);
    if (error instanceof Error && error.stack) {
      console.error('[Afdian] Stack trace:', error.stack);
    }
    return false;
  }
}

// 导出验签模式供外部使用
export function isStrictSignatureMode(): boolean {
  return STRICT_SIGNATURE_MODE;
}
