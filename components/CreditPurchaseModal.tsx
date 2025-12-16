'use client';

import { useState, useEffect, useCallback } from 'react';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { X, Check, Sparkles } from 'lucide-react';
import { CREDIT_PACKAGES } from '@/lib/alipay-config';
import { supabase } from '@/lib/supabase';

// Define packages outside component to avoid recreation
const PACKAGES = CREDIT_PACKAGES;

export default function CreditPurchaseModal() {
  const { t } = useLanguage();
  const { warning, success } = useToast();
  const { isCreditPurchaseModalOpen, closeCreditPurchaseModal } = useModal();
  const [step, setStep] = useState<'select' | 'pay' | 'success'>('select');
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isMobile, setIsMobile] = useState(false);


  useEffect(() => {
    if (isCreditPurchaseModalOpen) {
      setStep('select');
      setSelectedPackage(null);
      setIsProcessing(false);
      setShowConfirm(false);
      setIsMobile(window.innerWidth < 768);
    }
  }, [isCreditPurchaseModalOpen]);

  const handlePurchase = useCallback(async () => {
    if (!selectedPackage || isProcessing) return;
    
    setIsProcessing(true);

    // PC端：先同步打开空白窗口，避免被浏览器拦截
    let paymentWindow: Window | null = null;
    if (!isMobile) {
      paymentWindow = window.open('about:blank', '_blank');
      if (paymentWindow) {
        paymentWindow.document.write(`
          <html>
            <head><title>正在跳转支付...</title></head>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#fff;font-family:system-ui;">
              <div style="text-align:center;">
                <div style="width:40px;height:40px;border:3px solid #3b82f6;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
                <p>正在跳转到支付宝...</p>
              </div>
              <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
            </body>
          </html>
        `);
      }
    }

    try {
      // 1. 获取当前用户信息
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        if (warning) warning('请先登录');
        setIsProcessing(false);
        if (paymentWindow) paymentWindow.close();
        return;
      }

      // 2. 调用支付宝支付接口
      const response = await fetch('/api/payment/alipay/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selectedPackage.id,
        }),
      });

      const data = await response.json();

      if (!data.success || !data.paymentUrl) {
        if (warning) warning(data.error || '创建支付订单失败');
        setIsProcessing(false);
        if (paymentWindow) paymentWindow.close();
        return;
      }

      console.log('[Alipay] Redirecting to payment:', data.paymentUrl);

      // 3. 跳转到支付宝支付页面
      if (isMobile) {
        // 移动端：当前页跳转
        window.location.href = data.paymentUrl;
      } else {
        // PC端：更新已打开窗口的URL
        if (paymentWindow) {
          paymentWindow.location.href = data.paymentUrl;
        } else {
          // 如果窗口被拦截，直接当前页跳转
          window.location.href = data.paymentUrl;
        }
        setStep('pay');
        
        // 保存支付时间用于后续查询
        localStorage.setItem('pending_payment_time', Date.now().toString());
        localStorage.setItem('pending_order_id', data.orderId);
      }
      
    } catch (error) {
      console.error('[Payment] Error:', error);
      if (warning) warning('支付请求失败');
      setIsProcessing(false);
      if (paymentWindow) paymentWindow.close();
    }
  }, [selectedPackage, warning, isProcessing, isMobile]);

  // 自动轮询检测支付状态
  useEffect(() => {
    if (step !== 'pay') return;

    let isActive = true;
    const paymentTime = localStorage.getItem('pending_payment_time');
    if (!paymentTime) return;

    const checkPaymentStatus = async () => {
      try {
        const res = await fetch(`/api/payment/check-status?timestamp=${paymentTime}&limit=5`);
        const data = await res.json();
        
        if (!isActive) return;
        
        if (data.statusCount?.paid > 0) {
          setStep('success');
          if (success) success('支付成功！积分已到账');
          localStorage.removeItem('pending_payment_time');
          localStorage.removeItem('pending_order_id');
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (error) {
        console.error('[Payment] Check status error:', error);
      }
    };

    // 首次检查
    checkPaymentStatus();
    
    // 每3秒轮询一次
    const interval = setInterval(checkPaymentStatus, 3000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [step, success]);
  
  if (!isCreditPurchaseModalOpen) return null;
  
  // Safety check for translation
  if (!t || !t.credit_purchase || !t.credit_purchase.packages) {
    return null;
  }

  const handleSelect = (pkg: any) => {
    if (isProcessing) return; // 防止重复点击
    console.log('Package selected:', pkg);
    setSelectedPackage(pkg);
    setShowConfirm(true); // 显示确认弹窗
  };
  
  const handleConfirmPurchase = () => {
    setShowConfirm(false);
    // 立即调用支付函数（在点击事件的同步调用栈中）
    // 这样 window.open 才不会被浏览器拦截
    handlePurchase();
  };
  
  const handleCancelPurchase = () => {
    setShowConfirm(false);
    setSelectedPackage(null);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      {/* Confirmation Modal */}
      {showConfirm && selectedPackage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 max-w-md mx-4 shadow-2xl ring-1 ring-white/5">
            <h3 className="text-xl font-bold text-white mb-3">确认购买</h3>
            <p className="text-slate-300 mb-4">
              {isMobile ? (
                  <>将在当前页面跳转到支付页面，完成 <span className="text-brand-400 font-bold">¥{selectedPackage.price}</span> 的支付。</>
              ) : (
                  <>将在<strong>新标签页</strong>打开支付页面，完成 <span className="text-brand-400 font-bold">¥{selectedPackage.price}</span> 的支付。</>
              )}
            </p>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-5">
              <p className="text-blue-400 text-sm flex items-start gap-2">
                <span className="text-lg">✨</span>
                <span>支付完成后，积分将自动到账。</span>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCancelPurchase}
                className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium transition border border-white/10"
              >
                取消
              </button>
              <button
                onClick={handleConfirmPurchase}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-bold transition shadow-lg"
              >
                {isMobile ? '确认支付' : '确认跳转'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl w-full max-w-6xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden relative max-h-[95vh] ring-1 ring-white/5 animate-in zoom-in duration-300">
        
        {/* Close Button */}
        <button 
          onClick={closeCreditPurchaseModal}
          className="absolute top-6 right-6 text-slate-400 hover:text-white transition z-20 bg-white/5 p-2 rounded-full hover:bg-white/10"
        >
          <X size={20} />
        </button>

        {step === 'pay' ? (
           <div className="flex flex-col items-center justify-center h-full py-20 px-6">
              <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8"></div>
              <h3 className="text-2xl font-bold text-white mb-3">支付正在进行中...</h3>
              <p className="text-slate-400 mb-6 text-center max-w-md">
                已在新标签页打开支付页面，完成支付后将自动检测
              </p>
              <div className="bg-black/20 border border-white/10 rounded-xl p-4 max-w-md mb-6">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-blue-400 text-sm">1</span>
                  </div>
                  <p className="text-sm text-slate-300">在新标签页完成支付</p>
                </div>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-blue-400 text-sm">2</span>
                  </div>
                  <p className="text-sm text-slate-300">返回本页面等待检测</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-blue-400 text-sm">3</span>
                  </div>
                  <p className="text-sm text-slate-300">积分自动到账</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    const paymentTime = localStorage.getItem('pending_payment_time');
                    if (paymentTime) {
                      const res = await fetch(`/api/payment/check-status?timestamp=${paymentTime}&limit=5`);
                      const data = await res.json();
                      if (data.statusCount?.paid > 0) {
                        setStep('success');
                        if (success) success('支付成功！积分已到账');
                        setTimeout(() => window.location.reload(), 2000);
                      } else {
                        if (warning) warning('暂未检测到支付，请稍等片刻');
                      }
                    }
                  }}
                  className="px-6 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition"
                >
                  手动检查状态
                </button>
                <button
                  onClick={() => {
                    setStep('select');
                    setIsProcessing(false);
                    localStorage.removeItem('pending_payment_time');
                  }}
                  className="px-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm transition border border-white/10"
                >
                  取消支付
                </button>
              </div>
           </div>
        ) : step === 'success' ? (
           <div className="flex flex-col items-center justify-center h-full py-20 px-6">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
                <Check size={48} className="text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">支付成功！</h3>
              <p className="text-slate-400 mb-4">积分已到账，页面即将刷新...</p>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
                <span>正在刷新页面</span>
              </div>
           </div>
        ) : (
        <>
        {/* Header Section */}
        <div className="relative pt-10 pb-6 px-8 text-center bg-transparent">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-50%] left-[20%] w-96 h-96 bg-brand-500/10 rounded-full blur-3xl"></div>
            <div className="absolute top-[-20%] right-[20%] w-72 h-72 bg-purple-500/10 rounded-full blur-3xl"></div>
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 relative z-10">
            {t.credit_purchase.title}
          </h2>
          
          <div className="relative z-10 mb-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            支付通道已开通，即刻生效
          </div>

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
              
              const isDisabled = false;

              return (
                <button
                  key={pkg.id}
                  onClick={() => !isDisabled && handleSelect(pkg)}
                  disabled={isDisabled}
                  className={`group relative flex flex-col bg-black/20 border border-white/10 rounded-2xl p-0 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5 hover:border-white/20 hover:-translate-y-1 hover:shadow-xl'} transition-all duration-300 text-left overflow-hidden h-full`}
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
                     {pkg.bonus > 0 && (
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
                  <div className="px-6 py-4 bg-black/20 mx-4 rounded-xl border border-white/5 mb-4 text-center">
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
                  <div className={`w-full px-6 py-4 ${pkg.footerBg} border-t border-white/5 mt-auto min-h-[80px] flex items-center justify-center shrink-0`}>
                    <p className="text-xs text-slate-400 text-center italic leading-relaxed">
                        "{pkgData.slogan}"
                    </p>
                  </div>
                  
                  {/* Buy Button */}
                  {!isDisabled && (
                  <div className="absolute bottom-0 left-0 w-full p-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto bg-black/80 backdrop-blur-md">
                    <div
                      className={`w-full py-3 rounded-xl font-bold text-center transition-all duration-300 bg-gradient-to-r ${pkg.color} text-white shadow-lg hover:shadow-xl hover:scale-105 cursor-pointer`}
                    >
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


