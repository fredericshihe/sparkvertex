import crypto from 'crypto';

export const AFDIAN_PUBLIC_KEY = process.env.AFDIAN_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwwdaCg1Bt+UKZKs0R54y
lYnuANma4IpgoOwNmk3a0rhg/PQuhUJ0EOZSowIC44l0K3+fqGns3Ygi4AfmEfS4
EKbdk1ahSxu7Zkp2rHMt+R9arQFQkwSS/5x1dYiHNVMiR8oIXDgjmvxuNes2Cr8f
w9dEF0xNBKdkKgG2qAawcN1nZrdyaKWtPVT9mHl0ddOO9thZmVLFOb9NVzgYfjEg
I+KWX6aY19Ka/ghv/L4t1IXmz9pctablN5S0CRWpJW3Cn0k6zSXjVdKm4uN7jRlg
SRaf/Ind46vMCm3N2sgwxu/g3bnooW+db0iLo13zzuvyn727Q3UDQ0MmZcEWMQID
AQAB
-----END PUBLIC KEY-----`;

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
    if (!data || !data.order || !data.sign) return false;

    const { order, sign } = data;
    
    // 1. 拼接被签名的数据: out_trade_no + user_id + plan_id + total_amount
    // 注意：这里的 user_id 是下单用户在爱发电的 ID，不是我们系统的 user_id
    const content = `${order.out_trade_no}${order.user_id}${order.plan_id}${order.total_amount}`;
    
    // 2. 验证签名
    const verify = crypto.createVerify('SHA256');
    verify.update(content);
    verify.end();
    
    return verify.verify(AFDIAN_PUBLIC_KEY, sign, 'base64');
  } catch (error) {
    console.error('Afdian signature verification failed:', error);
    return false;
  }
}
