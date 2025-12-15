/**
 * Paddle 支付配置
 * 
 * 环境变量配置 (.env.local):
 * - PADDLE_API_KEY: 服务端 API Key (pdl_live_...)
 * - NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 客户端 Token (live_...)
 * - PADDLE_WEBHOOK_SECRET: Webhook 签名密钥
 * - NEXT_PUBLIC_PADDLE_ENVIRONMENT: 'production' | 'sandbox'
 */

export const PADDLE_CONFIG = {
  API_KEY: process.env.PADDLE_API_KEY,
  CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
  WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
  ENVIRONMENT: (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || 'production') as 'production' | 'sandbox',
};

// Paddle Price IDs 映射到积分套餐
export const PADDLE_CREDIT_PACKAGES = [
  { 
    id: 'basic', 
    priceId: 'pri_01kcgzydjfrdf1eqfpym4t7hqm', // 20元
    credits: 120,
    price: 20, 
    originalPrice: 20,
    bonus: 0,
    freeCreates: 1,
    nameKey: 'basic',
    color: 'from-slate-400 to-slate-600',
    shadow: 'shadow-slate-500/20',
    footerBg: 'bg-slate-900/60',
    emoji: '🥉',
  },
  { 
    id: 'standard', 
    priceId: 'pri_01kch00w9w72wzh6tht09np39x', // 50元
    credits: 350, 
    price: 50, 
    originalPrice: 50,
    bonus: 17,
    freeCreates: 5,
    nameKey: 'standard',
    color: 'from-blue-400 to-blue-600',
    shadow: 'shadow-blue-500/20',
    footerBg: 'bg-blue-950/30',
    emoji: '🥈',
  },
  { 
    id: 'premium', 
    priceId: 'pri_01kch024613khh68yej04d7hpj', // 100元
    credits: 800, 
    price: 100, 
    originalPrice: 100,
    bonus: 33,
    freeCreates: 12,
    nameKey: 'premium',
    bestValue: true,
    color: 'from-purple-400 to-purple-600',
    shadow: 'shadow-purple-500/20',
    footerBg: 'bg-purple-950/30',
    emoji: '🥈',
  },
  { 
    id: 'ultimate', 
    priceId: 'pri_01kch02zrznhwxb2yb9as0cjtf', // 200元
    credits: 2000, 
    price: 200, 
    originalPrice: 200,
    bonus: 67,
    freeCreates: 30,
    nameKey: 'ultimate',
    color: 'from-amber-400 to-amber-600',
    shadow: 'shadow-amber-500/20',
    isNew: true,
    footerBg: 'bg-amber-950/30',
    emoji: '🥇',
  }
];

// Price ID 到积分数量的映射 (用于 Webhook)
export const PRICE_CREDITS_MAP: Record<string, number> = {
  'pri_01kcgzydjfrdf1eqfpym4t7hqm': 120,   // 20元 - 体验包
  'pri_01kch00w9w72wzh6tht09np39x': 350,   // 50元 - 创作者包
  'pri_01kch024613khh68yej04d7hpj': 800,   // 100元 - 重度包
  'pri_01kch02zrznhwxb2yb9as0cjtf': 2000,  // 200元 - 极客包
};

// 根据 Price ID 获取套餐信息
export function getPackageByPriceId(priceId: string) {
  return PADDLE_CREDIT_PACKAGES.find(pkg => pkg.priceId === priceId);
}

// 导出供 CreditPurchaseModal 使用
export const CREDIT_PACKAGES = PADDLE_CREDIT_PACKAGES;
