export const LEMON_SQUEEZY_CONFIG = {
  STORE_ID: process.env.LEMONSQUEEZY_STORE_ID,
  WEBHOOK_SECRET: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
};

export const CREDIT_PACKAGES = [
  { 
    id: 'basic', 
    variantId: '9737a581-e010-4d2b-ae07-c4de42189a29',
    credits: 120,
    price: 19.9, 
    originalPrice: 19.9,
    bonus: 20,
    freeCreates: 1,
    nameKey: 'basic',
    color: 'from-slate-400 to-slate-600',
    shadow: 'shadow-slate-500/20',
    footerBg: 'bg-slate-900/60',
    emoji: '🥉',
    buyUrl: 'https://sparkvertex.lemonsqueezy.com/buy/9737a581-e010-4d2b-ae07-c4de42189a29'
  },
  { 
    id: 'standard', 
    variantId: 'da329156-46d2-4483-bb11-3dfe99db04ea',
    credits: 350, 
    price: 49.9, 
    originalPrice: 58.0,
    bonus: 75,
    freeCreates: 5,
    nameKey: 'standard',
    color: 'from-blue-400 to-blue-600',
    shadow: 'shadow-blue-500/20',
    footerBg: 'bg-blue-950/30',
    emoji: '🥈',
    buyUrl: 'https://sparkvertex.lemonsqueezy.com/buy/da329156-46d2-4483-bb11-3dfe99db04ea'
  },
  { 
    id: 'premium', 
    variantId: '174a1ff4-b8f5-44a7-99fe-8d75a7a91a34',
    credits: 800, 
    price: 99.9, 
    originalPrice: 133.0,
    bonus: 180,
    freeCreates: 12,
    nameKey: 'premium',
    bestValue: true,
    color: 'from-purple-400 to-purple-600',
    shadow: 'shadow-purple-500/20',
    footerBg: 'bg-purple-950/30',
    emoji: '🥈',
    buyUrl: 'https://sparkvertex.lemonsqueezy.com/buy/174a1ff4-b8f5-44a7-99fe-8d75a7a91a34'
  },
  { 
    id: 'ultimate', 
    variantId: '0fd02f34-2a55-4e12-beda-0a50d1693501',
    credits: 2000, 
    price: 198.0, 
    originalPrice: 332.0,
    bonus: 450,
    freeCreates: 30,
    nameKey: 'ultimate',
    color: 'from-amber-400 to-amber-600',
    shadow: 'shadow-amber-500/20',
    isNew: true,
    footerBg: 'bg-amber-950/30',
    emoji: '🥇',
    buyUrl: 'https://sparkvertex.lemonsqueezy.com/buy/0fd02f34-2a55-4e12-beda-0a50d1693501'
  }
];

// Lemon Squeezy Webhook 返回的 variant_id (数字)
// 从实际 Webhook payload 中获取的真实 ID
export const VARIANT_CREDITS_MAP: Record<string, number> = {
  '1147295': 120,   // 体验包 (Basic)
  '1147321': 350,   // 创作者包 (Standard)
  '1147330': 800,   // 重度包 (Premium)
  // TODO: 购买极客包后补充以下 ID
  // '??????': 2000,  // 极客包 (Ultimate)
};
