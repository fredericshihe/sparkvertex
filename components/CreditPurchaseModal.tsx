'use client';

import { useState, useEffect, useCallback } from 'react';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { X, Check, Sparkles } from 'lucide-react';

// Define packages outside component to avoid recreation
const PACKAGES = [
  { 
    id: 'basic', 
    credits: 1, // 测试用,正式上线改回120
    price: 19.9, 
    originalPrice: 19.9,
    nameKey: 'basic',
    color: 'from-slate-400 to-slate-600',
    shadow: 'shadow-slate-500/20',
    footerBg: 'bg-slate-900/60',
    emoji: '🥉',
    afdian_item_id: '2bfce06ad1d711f0be2b5254001e7c00',
    afdian_plan_id: ''
  },
  { 
    id: 'standard', 
    credits: 350, 
    price: 49.9, 
    originalPrice: 58.0, // 15% bonus implied
    bonus: 15,
    nameKey: 'standard',
    color: 'from-blue-400 to-blue-600',
    shadow: 'shadow-blue-500/20',
    footerBg: 'bg-blue-950/30',
    emoji: '🥈',
    afdian_item_id: '08693af2d1d911f0a58152540025c377',
    afdian_plan_id: ''
  },
  { 
    id: 'premium', 
    credits: 800, 
    price: 99.9, 
    originalPrice: 133.0, // 25% bonus implied
    bonus: 25,
    nameKey: 'premium',
    bestValue: true,
    color: 'from-purple-400 to-purple-600',
    shadow: 'shadow-purple-500/20',
    footerBg: 'bg-purple-950/30',
    emoji: '🥈',
    afdian_item_id: '1e77bf3ad1d911f0aa4e52540025c377',
    afdian_plan_id: ''
  },
  { 
    id: 'ultimate', 
    credits: 2000, 
    price: 198.0, 
    originalPrice: 332.0, // 40% bonus implied
    bonus: 40,
    nameKey: 'ultimate',
    color: 'from-amber-400 to-amber-600',
    shadow: 'shadow-amber-500/20',
    isNew: true,
    footerBg: 'bg-amber-950/30',
    emoji: '🥇',
    afdian_item_id: '345e4f9ed1d911f0842f52540025c377',
    afdian_plan_id: ''
  }
];

export default function CreditPurchaseModal() {
  const { t } = useLanguage();
  const { warning } = useToast();
  const { isCreditPurchaseModalOpen, closeCreditPurchaseModal } = useModal();
  const [step, setStep] = useState<'select' | 'pay' | 'success'>('select');
  const [selectedPackage, setSelectedPackage] = useState<any>(null);

  useEffect(() => {
    if (isCreditPurchaseModalOpen) {
      setStep('select');
      setSelectedPackage(null);
    }
  }, [isCreditPurchaseModalOpen]);

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage) return;
    
    try {
      const res = await fetch('/api/payment/afdian/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: selectedPackage.price, 
          credits: selectedPackage.credits,
          item_id: selectedPackage.afdian_item_id,
          plan_id: selectedPackage.afdian_plan_id
        }),
      });
      
      const data = await res.json();
      
      if (data.url) {
        // 存储当前时间戳,用于返回后检查订单
        localStorage.setItem('pending_payment_time', Date.now().toString());
        
        // 直接跳转到支付页面
        window.location.href = data.url;
      } else {
        if (warning) warning(t.payment_modal?.create_fail || '创建订单失败');
        setStep('select');
      }
    } catch (error) {
      console.error('[Payment] Error:', error);
      if (warning) warning(t.payment_modal?.create_fail || '请求失败');
      setStep('select');
    }
  }, [selectedPackage, t.payment_modal, warning]);

  useEffect(() => {
    if (step === 'pay' && selectedPackage) {
      handlePurchase();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!isCreditPurchaseModalOpen) return null;
  
  // Safety check for translation
  if (!t || !t.credit_purchase || !t.credit_purchase.packages) {
    return null;
  }

  const handleSelect = (pkg: any) => {
    console.log('Package selected:', pkg);
    setSelectedPackage(pkg);
    // Proceed to payment flow
    setStep('pay');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-6xl shadow-2xl flex flex-col overflow-hidden relative max-h-[95vh]">
        
        {/* Close Button */}
        <button 
          onClick={closeCreditPurchaseModal}
          className="absolute top-6 right-6 text-slate-400 hover:text-white transition z-20 bg-slate-800/50 p-2 rounded-full hover:bg-slate-700"
        >
          <X size={20} />
        </button>

        {step === 'pay' ? (
           <div className="flex flex-col items-center justify-center h-full py-20">
              <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-bold text-white mb-2">{t.payment_modal.creating_order}</h3>
              <p className="text-slate-400">{t.payment_modal.redirecting}</p>
           </div>
        ) : (
        <>
        {/* Header Section */}
        <div className="relative pt-10 pb-6 px-8 text-center bg-gradient-to-b from-slate-900 to-[#0f172a]">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-50%] left-[20%] w-96 h-96 bg-brand-500/10 rounded-full blur-3xl"></div>
            <div className="absolute top-[-20%] right-[20%] w-72 h-72 bg-purple-500/10 rounded-full blur-3xl"></div>
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 relative z-10">
            {t.credit_purchase.title}
          </h2>
          <p className="text-slate-400 text-lg relative z-10 max-w-2xl mx-auto">
            {t.credit_purchase.subtitle}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 custom-scrollbar">
          
          {/* Packages Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 max-w-7xl mx-auto">
            {PACKAGES.map((pkg) => {
              const pkgData = (t.credit_purchase.packages as any)[pkg.nameKey];
              if (!pkgData) return null;
              
              const isDisabled = pkg.id !== 'basic';

              return (
                <button
                  key={pkg.id}
                  onClick={() => !isDisabled && handleSelect(pkg)}
                  disabled={isDisabled}
                  className={`group relative flex flex-col bg-slate-800/40 border border-slate-700/50 rounded-2xl p-0 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800 hover:border-slate-600 hover:-translate-y-1 hover:shadow-xl'} transition-all duration-300 text-left overflow-hidden h-full`}
                >
                  {/* Background Glow on Hover */}
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br ${pkg.color} transition-opacity duration-500`}></div>

                  {/* Top Banner for Badges */}
                  <div className="relative px-6 pt-6 pb-2 flex justify-between items-start">
                     <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">{pkg.emoji}</span>
                            <h3 className="text-xl font-bold text-white">{pkgData.name}</h3>
                        </div>
                        <span className="text-xs text-slate-400 font-medium px-1">{pkgData.badge}</span>
                     </div>
                     {pkg.bonus && (
                        <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap">
                          {t.credit_purchase.discount_off.replace('{n}', pkg.bonus.toString())}
                        </span>
                     )}
                  </div>

                  {/* Price Section */}
                  <div className="px-6 py-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-brand-400">¥{pkg.price}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{pkgData.unit_price}</div>
                  </div>

                  {/* Credits Highlight */}
                  <div className="px-6 py-4 bg-slate-900/30 mx-4 rounded-xl border border-slate-700/30 mb-4 text-center">
                      <div className="text-2xl font-bold text-white">{pkg.credits} {t.credit_purchase.credits}</div>
                  </div>

                  {/* Benefits List */}
                  <div className="px-6 space-y-3 mb-6 flex-1">
                    <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                            <Check size={12} className="text-brand-400" />
                        </div>
                        <span className="text-sm text-slate-300 leading-tight">{pkgData.benefit_1}</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles size={12} className="text-purple-400" />
                        </div>
                        <span className="text-sm text-slate-300 leading-tight">{pkgData.benefit_2}</span>
                    </div>
                  </div>

                  {/* Slogan Footer */}
                  <div className={`w-full px-6 py-4 ${pkg.footerBg} border-t border-slate-700/50 mt-auto min-h-[80px] flex items-center justify-center shrink-0`}>
                    <p className="text-xs text-slate-400 text-center italic leading-relaxed">
                        "{pkgData.slogan}"
                    </p>
                  </div>
                  
                  {/* Buy Button Overlay (Visible on Hover) */}
                  {!isDisabled && (
                  <div
                    className="absolute bottom-0 left-0 w-full p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-slate-900/90 backdrop-blur-sm border-t border-slate-700/50 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(pkg);
                    }}
                  >
                    <div className={`w-full py-3 rounded-xl font-bold text-center transition-all duration-300 bg-gradient-to-r ${pkg.color} text-white shadow-lg`}>
                      {t.detail.buy}
                    </div>
                  </div>
                  )}
                </button>
              );
            })}
          </div>

        </div>
        </>
        )}
      </div>
    </div>
  );
}


