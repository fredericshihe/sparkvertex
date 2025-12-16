/**
 * 支付宝支付配置
 * 
 * 环境变量配置 (.env.local):
 * - ALIPAY_APP_ID: 应用ID
 * - ALIPAY_PRIVATE_KEY: 应用私钥
 * - ALIPAY_PUBLIC_KEY: 支付宝公钥
 * - NEXT_PUBLIC_APP_URL: 应用地址
 */

// 套餐类型定义
export interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  originalPrice: number;
  bonus: number;
  freeCreates: number;
  nameKey: string;
  color: string;
  shadow: string;
  footerBg: string;
  emoji: string;
  bestValue?: boolean;
  isNew?: boolean;
}

// 支付宝积分套餐配置
export const ALIPAY_CREDIT_PACKAGES: CreditPackage[] = [
  { 
    id: 'basic', 
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
    emoji: '🎖️',
  },
  { 
    id: 'ultimate', 
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

// 根据套餐ID获取套餐信息
export function getPackageById(packageId: string) {
  return ALIPAY_CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
}

// 导出供 CreditPurchaseModal 使用
export const CREDIT_PACKAGES = ALIPAY_CREDIT_PACKAGES;
