'use client';

import { useState, useEffect } from 'react';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';
import { X, Zap, Crown, Star, Shield, Check, Sparkles, Rocket, Gem } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreditPurchaseModal() {
  const { t, language } = useLanguage();
  const { isCreditPurchaseModalOpen, closeCreditPurchaseModal } = useModal();
  const [step, setStep] = useState<'select' | 'pay' | 'success'>('select');
  const [selectedPackage, setSelectedPackage] = useState<any>(null);

  // Define packages with the new 198 tier
  const PACKAGES = [
    { 
      id: 'basic', 
      credits: 120, 
      price: 19.9, 
      originalPrice: 19.9,
      nameKey: 'basic',
      icon: Star,
      color: 'from-slate-400 to-slate-600',
      shadow: 'shadow-slate-500/20'
    },
    { 
      id: 'standard', 
      credits: 350, 
      price: 49.9, 
      originalPrice: 58.0,
      nameKey: 'standard',
      popular: true,
      icon: Zap,
      color: 'from-blue-400 to-blue-600',
      shadow: 'shadow-blue-500/20'
    },
    { 
      id: 'premium', 
      credits: 800, 
      price: 99.9, 
      originalPrice: 133.0,
      nameKey: 'premium',
      bestValue: true,
      icon: Crown,
      color: 'from-purple-400 to-purple-600',
      shadow: 'shadow-purple-500/20'
    },
    { 
      id: 'ultimate', 
      credits: 2000, 
      price: 198.0, 
      originalPrice: 333.0,
      nameKey: 'ultimate',
      icon: Gem,
      color: 'from-amber-400 to-amber-600',
      shadow: 'shadow-amber-500/20',
      isNew: true
    }
  ];

  const BENEFITS = [
    { icon: Rocket, key: 'benefit_1' },
    { icon: Sparkles, key: 'benefit_2' },
    { icon: Shield, key: 'benefit_3' },
    { icon: Crown, key: 'benefit_4' },
  ];

  useEffect(() => {
    if (isCreditPurchaseModalOpen) {
      setStep('select');
      setSelectedPackage(null);
    }
  }, [isCreditPurchaseModalOpen]);

  if (!isCreditPurchaseModalOpen) return null;

  const handleSelect = (pkg: any) => {
    setSelectedPackage(pkg);
    // Temporary: Show coming soon toast instead of proceeding
    toast(t.credit_purchase.coming_soon, {
      icon: '🚧',
      style: {
        borderRadius: '10px',
        background: '#333',
        color: '#fff',
      },
    });
    // Uncomment below to enable payment flow later
    // setStep('pay');
  };

  const calculateDiscount = (price: number, original: number) => {
    if (price >= original) return 0;
    return Math.round(((original - price) / original) * 100);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden relative max-h-[90vh]">
        
        {/* Close Button */}
        <button 
          onClick={closeCreditPurchaseModal}
          className="absolute top-6 right-6 text-slate-400 hover:text-white transition z-20 bg-slate-800/50 p-2 rounded-full hover:bg-slate-700"
        >
          <X size={20} />
        </button>

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

        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8 custom-scrollbar">
          
          {/* Packages Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 max-w-7xl mx-auto">
            {PACKAGES.map((pkg) => {
              const discount = calculateDiscount(pkg.price, pkg.originalPrice);
              const Icon = pkg.icon;
              
              return (
                <button
                  key={pkg.id}
                  onClick={() => handleSelect(pkg)}
                  className="group relative flex flex-col bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 hover:bg-slate-800 hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl text-left overflow-hidden"
                >
                  {/* Background Glow on Hover */}
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br ${pkg.color} transition-opacity duration-500`}></div>

                  {/* Badges */}
                  <div className="flex gap-2 mb-4 min-h-[24px]">
                    {pkg.popular && (
                      <span className="bg-gradient-to-r from-brand-500 to-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg shadow-brand-500/20 animate-pulse-slow">
                        {t.credit_purchase.popular}
                      </span>
                    )}
                    {pkg.bestValue && (
                      <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg shadow-purple-500/20">
                        {t.credit_purchase.best_value}
                      </span>
                    )}
                    {pkg.isNew && (
                      <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg shadow-amber-500/20">
                        NEW
                      </span>
                    )}
                    {discount > 0 && (
                      <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold px-2 py-1 rounded-full">
                        {t.credit_purchase.discount_off.replace('{n}', discount.toString())}
                      </span>
                    )}
                  </div>

                  {/* Icon & Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pkg.color} flex items-center justify-center shadow-lg ${pkg.shadow}`}>
                      <Icon size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{(t.credit_purchase.packages as any)[pkg.nameKey].name}</h3>
                      <p className="text-xs text-slate-400">{(t.credit_purchase.packages as any)[pkg.nameKey].desc}</p>
                    </div>
                  </div>

                  {/* Credits */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-white tracking-tight">{pkg.credits}</span>
                      <span className="text-sm text-slate-400">{t.credit_purchase.credits}</span>
                    </div>
                  </div>

                  {/* Price & Button */}
                  <div className="mt-auto">
                    <div className="flex items-end gap-2 mb-4">
                      <span className="text-2xl font-bold text-brand-400">¥{pkg.price}</span>
                      {pkg.originalPrice > pkg.price && (
                        <span className="text-sm text-slate-500 line-through mb-1">¥{pkg.originalPrice}</span>
                      )}
                    </div>
                    
                    <div className={`w-full py-3 rounded-xl font-bold text-center transition-all duration-300 ${
                      pkg.popular || pkg.bestValue || pkg.isNew
                        ? `bg-gradient-to-r ${pkg.color} text-white shadow-lg ${pkg.shadow} group-hover:shadow-xl group-hover:scale-[1.02]`
                        : 'bg-slate-700 text-slate-300 group-hover:bg-slate-600 group-hover:text-white'
                    }`}>
                      {t.detail.buy}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Benefits Section */}
          <div className="max-w-4xl mx-auto bg-slate-800/30 rounded-2xl p-6 border border-slate-700/50">
            <h3 className="text-center text-slate-300 font-bold mb-6 flex items-center justify-center gap-2">
              <Crown size={18} className="text-amber-400" />
              {t.credit_purchase.benefits_title}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {BENEFITS.map((benefit, index) => {
                const Icon = benefit.icon;
                return (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-brand-400" />
                    </div>
                    <span className="text-xs text-slate-300 font-medium leading-tight">
                      {(t.credit_purchase as any)[benefit.key]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
