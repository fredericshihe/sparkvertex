'use client';

import { useState, useEffect } from 'react';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { X, Zap, Crown, Star, Check, Sparkles, Gem } from 'lucide-react';

export default function CreditPurchaseModal() {
  const { t, language } = useLanguage();
  const { warning } = useToast();
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
      shadow: 'shadow-slate-500/20',
      emoji: '🥉'
    },
    { 
      id: 'standard', 
      credits: 350, 
      price: 49.9, 
      originalPrice: 58.0, // 15% bonus implied
      bonus: 15,
      nameKey: 'standard',
      icon: Zap,
      color: 'from-blue-400 to-blue-600',
      shadow: 'shadow-blue-500/20',
      emoji: '🥈'
    },
    { 
      id: 'premium', 
      credits: 800, 
      price: 99.9, 
      originalPrice: 133.0, // 25% bonus implied
      bonus: 25,
      nameKey: 'premium',
      bestValue: true,
      icon: Crown,
      color: 'from-purple-400 to-purple-600',
      shadow: 'shadow-purple-500/20',
      emoji: '🥈'
    },
    { 
      id: 'ultimate', 
      credits: 2000, 
      price: 198.0, 
      originalPrice: 332.0, // 40% bonus implied
      bonus: 40,
      nameKey: 'ultimate',
      icon: Gem,
      color: 'from-amber-400 to-amber-600',
      shadow: 'shadow-amber-500/20',
      isNew: true,
      emoji: '🥇'
    }
  ];

  useEffect(() => {
    if (isCreditPurchaseModalOpen) {
      setStep('select');
      setSelectedPackage(null);
    }
  }, [isCreditPurchaseModalOpen]);

  if (!isCreditPurchaseModalOpen) return null;

  const handleSelect = (pkg: any) => {
    console.log('Package selected:', pkg);
    setSelectedPackage(pkg);
    // Temporary: Show coming soon toast instead of proceeding
    if (warning) {
      warning(t.credit_purchase.coming_soon);
    } else {
      console.error('Toast warning function is not available');
      alert(t.credit_purchase.coming_soon);
    }
    // Uncomment below to enable payment flow later
    // setStep('pay');
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
              const Icon = pkg.icon;
              const pkgData = (t.credit_purchase.packages as any)[pkg.nameKey];
              
              return (
                <button
                  key={pkg.id}
                  onClick={() => handleSelect(pkg)}
                  className="group relative flex flex-col bg-slate-800/40 border border-slate-700/50 rounded-2xl p-0 hover:bg-slate-800 hover:border-slate-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl text-left overflow-hidden h-full"
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
                  <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-700/50 mt-auto min-h-[80px] flex items-center justify-center">
                    <p className="text-xs text-slate-400 text-center italic leading-relaxed">
                        "{pkgData.slogan}"
                    </p>
                  </div>
                  
                  {/* Buy Button Overlay (Visible on Hover) */}
                  <div className="absolute bottom-0 left-0 w-full p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-slate-900/90 backdrop-blur-sm border-t border-slate-700/50">
                    <div className={`w-full py-3 rounded-xl font-bold text-center transition-all duration-300 bg-gradient-to-r ${pkg.color} text-white shadow-lg`}>
                      {t.detail.buy}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}


