'use client';

import { useState, useEffect } from 'react';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';
import { X } from 'lucide-react';

export default function CreditPurchaseModal() {
  const { t, language } = useLanguage();
  const { isCreditPurchaseModalOpen, closeCreditPurchaseModal } = useModal();
  const [step, setStep] = useState<'select' | 'pay' | 'success'>('select');
  const [selectedPackage, setSelectedPackage] = useState<any>(null);

  const PACKAGES = [
    { id: 'basic', credits: 120, price: 19.9, label: language === 'zh' ? '基础包' : 'Basic' },
    { id: 'pro', credits: 350, price: 49.9, label: language === 'zh' ? '超值包' : 'Pro', popular: true },
    { id: 'max', credits: 800, price: 99.9, label: language === 'zh' ? '豪华包' : 'Max' }
  ];

  useEffect(() => {
    if (isCreditPurchaseModalOpen) {
      setStep('select');
      setSelectedPackage(PACKAGES[1]); // Default to Pro
    }
  }, [isCreditPurchaseModalOpen]);

  if (!isCreditPurchaseModalOpen) return null;

  const handleSelect = (pkg: any) => {
    setSelectedPackage(pkg);
  };

  const handleNext = () => {
    setStep('pay');
  };

  const handlePaid = () => {
    // Mock success for now, or show contact info
    // In a real app, this would check payment status
    setStep('success');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden relative">
        <button 
          onClick={closeCreditPurchaseModal}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition z-10"
        >
          <X size={20} />
        </button>

        {step === 'select' && (
          <div className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">{language === 'zh' ? '充值积分' : 'Top Up Credits'}</h2>
              <p className="text-slate-400 text-sm">{language === 'zh' ? '选择适合您的套餐' : 'Choose a package that fits you'}</p>
            </div>

            <div className="space-y-3 mb-6">
              {PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => handleSelect(pkg)}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between relative ${
                    selectedPackage?.id === pkg.id 
                      ? 'bg-brand-900/20 border-brand-500 shadow-lg shadow-brand-500/10' 
                      : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {pkg.popular && (
                    <div className="absolute -top-3 left-4 bg-gradient-to-r from-brand-500 to-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                      POPULAR
                    </div>
                  )}
                  <div className="text-left">
                    <div className="font-bold text-white text-lg">{pkg.credits} {language === 'zh' ? '积分' : 'Credits'}</div>
                    <div className="text-xs text-slate-400">{pkg.label}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-brand-400 text-xl">¥{pkg.price}</div>
                    <div className="text-[10px] text-slate-500">≈ ¥{(pkg.price / pkg.credits).toFixed(2)} / credit</div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleNext}
              className="w-full py-3 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition"
            >
              {language === 'zh' ? '下一步' : 'Next'}
            </button>
          </div>
        )}

        {step === 'pay' && (
          <div className="p-6 text-center">
            <h2 className="text-xl font-bold text-white mb-6">{language === 'zh' ? '扫码支付' : 'Scan to Pay'}</h2>
            
            <div className="bg-white p-4 rounded-xl w-48 h-48 mx-auto mb-6 flex items-center justify-center">
               {/* Placeholder QR - Replace with actual platform QR */}
               <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400 text-xs text-center p-2">
                 {language === 'zh' ? '请配置收款码' : 'Please Configure Payment QR'}
               </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs text-slate-400 mb-1">{language === 'zh' ? '支付金额' : 'Amount'}</p>
              <p className="text-2xl font-bold text-brand-400">¥{selectedPackage?.price}</p>
              <div className="h-px bg-slate-700 my-3"></div>
              <p className="text-xs text-slate-400 mb-1">{language === 'zh' ? '备注码 (必填)' : 'Remark Code (Required)'}</p>
              <p className="text-lg font-mono font-bold text-white tracking-widest">
                {/* Mock Remark Code */}
                {Math.floor(100000 + Math.random() * 900000)}
              </p>
              <p className="text-[10px] text-rose-400 mt-1">
                <i className="fa-solid fa-circle-exclamation mr-1"></i>
                {language === 'zh' ? '请在支付备注中填写此码，否则无法自动到账' : 'Please enter this code in payment remark for auto-credit'}
              </p>
            </div>

            <button
              onClick={handlePaid}
              className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition mb-3"
            >
              {language === 'zh' ? '我已支付' : 'I Have Paid'}
            </button>
            <button
              onClick={() => setStep('select')}
              className="text-sm text-slate-400 hover:text-white transition"
            >
              {language === 'zh' ? '返回选择' : 'Back'}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
              <i className="fa-solid fa-check text-4xl text-green-500"></i>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{language === 'zh' ? '提交成功' : 'Submitted'}</h2>
            <p className="text-slate-400 mb-8">
              {language === 'zh' 
                ? '我们会尽快核实您的支付并为您充值积分。请留意账户余额变化。' 
                : 'We will verify your payment and credit your account shortly. Please check your balance later.'}
            </p>
            <button
              onClick={closeCreditPurchaseModal}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition"
            >
              {language === 'zh' ? '关闭' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
