'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';

export default function PaymentModal() {
  const { t } = useLanguage();
  const { isPaymentModalOpen, closePaymentModal, paymentItem } = useModal();
  const { info, error: toastError } = useToast();
  const [qrUrl, setQrUrl] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [remarkCode, setRemarkCode] = useState<string>('');
  const [status, setStatus] = useState<'loading' | 'waiting' | 'paid_waiting' | 'completed' | 'error'>('loading');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isPaymentModalOpen && paymentItem) {
      initializePayment();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isPaymentModalOpen, paymentItem]);

  useEffect(() => {
    if (qrUrl && isPaymentModalOpen && status === 'waiting') {
      if (window.innerWidth < 768) {
        info(t.payment_modal.long_press_save, 2000);
      }
    }
  }, [qrUrl, isPaymentModalOpen, status]);

  const cleanup = () => {
    if (pollingInterval) clearInterval(pollingInterval);
    setOrderId(null);
    setRemarkCode('');
    setStatus('loading');
    setQrUrl('');
  };

  const initializePayment = async () => {
    try {
      setStatus('loading');
      
      // Generate 6-digit random code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setRemarkCode(code);
      
      // 1. Fetch Seller QR
      const { data: sellerProfile } = await supabase
        .from('profiles')
        .select('payment_qr')
        .eq('id', paymentItem.author_id)
        .single();

      if (!sellerProfile?.payment_qr) {
        toastError(t.payment_modal.no_qr_code);
        closePaymentModal();
        return;
      }
      setQrUrl(sellerProfile.payment_qr);

      // 2. Check for existing order or Create new one
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Check for existing pending/paid order
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', session.user.id)
        .eq('item_id', paymentItem.id)
        .in('status', ['pending', 'paid'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let currentOrder;

      if (existingOrder) {
        currentOrder = existingOrder;
        setRemarkCode(existingOrder.remark || code); // Use existing remark if available
        if (existingOrder.status === 'paid') {
          setStatus('paid_waiting');
        } else {
          setStatus('waiting');
        }
      } else {
        // Create new order
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            buyer_id: session.user.id,
            seller_id: paymentItem.author_id,
            item_id: paymentItem.id,
            amount: paymentItem.price,
            status: 'pending',
            remark: code
          })
          .select()
          .single();

        if (orderError) throw orderError;
        currentOrder = order;
        setStatus('waiting');
      }
      
      setOrderId(currentOrder.id);

      // 3. Start Polling
      const interval = setInterval(async () => {
        const { data: updatedOrder } = await supabase
          .from('orders')
          .select('status')
          .eq('id', currentOrder.id)
          .single();

        if (updatedOrder?.status === 'completed') {
          setStatus('completed');
          clearInterval(interval);
        }
      }, 2000);

      setPollingInterval(interval);

    } catch (error) {
      console.error('Payment initialization failed:', error);
      setStatus('error');
    }
  };

  const handleBuyerConfirm = async () => {
    if (!orderId) return;
    
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', orderId);

      if (error) throw error;
      
      setStatus('paid_waiting');
    } catch (error) {
      console.error('Failed to confirm payment:', error);
      toastError(t.payment_modal.confirm_fail);
    }
  };

  const handleDownload = () => {
    if (!paymentItem) return;
    
    const blob = new Blob([paymentItem.content || ''], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${paymentItem.title}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    closePaymentModal();
  };

  if (!isPaymentModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePaymentModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-black/60 backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] text-center animate-in zoom-in fade-in duration-300 ring-1 ring-white/5">
        
        {status === 'loading' && (
          <div className="py-10">
            <i className="fa-solid fa-circle-notch fa-spin text-4xl text-brand-500 mb-4"></i>
            <p className="text-slate-400">{t.payment_modal.creating_order}</p>
          </div>
        )}

        {status === 'waiting' && (
          <>
            <h2 className="text-xl font-bold mb-2 text-white">
              <i className="fa-brands fa-weixin text-green-500 mr-2"></i>
              <i className="fa-brands fa-alipay text-blue-500 mr-2"></i>
              {t.payment_modal.scan_pay}
            </h2>
            <p className="text-sm text-slate-400 mb-6">{t.payment_modal.scan_hint} <span className="text-brand-400 font-bold text-lg">¥{paymentItem?.price}</span></p>
            
            <div className="bg-black/20 border border-white/10 rounded-xl p-4 mb-6">
              <p className="text-xs text-slate-400 mb-2">{t.payment_modal.remark_code}</p>
              <div className="text-2xl font-mono font-bold text-white tracking-widest select-all bg-black/40 py-2 rounded-lg border border-white/10">
                {remarkCode}
              </div>
              <p className="text-xs text-rose-400 mt-2">
                <i className="fa-solid fa-circle-exclamation mr-1"></i>
                {t.payment_modal.remark_hint}
              </p>
            </div>

            <div className="w-64 h-64 mx-auto bg-white rounded-xl p-2 mb-6">
              <img 
                src={qrUrl} 
                className="w-full h-full object-contain" 
                alt="Payment QR" 
                style={{ 
                    WebkitTouchCallout: 'default', 
                    userSelect: 'auto',
                    WebkitUserSelect: 'auto'
                }}
              />
            </div>

            {/* Mobile Hint */}
            <p className="text-xs text-slate-500 text-center -mt-4 mb-6 md:hidden animate-pulse">
                <i className="fa-regular fa-hand-point-up mr-1"></i>
                {t.payment_modal.mobile_hint}
            </p>

            <button 
              onClick={handleBuyerConfirm}
              className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition mb-2"
            >
              {t.payment_modal.paid_btn}
            </button>
            <p className="text-xs text-slate-500">{t.payment_modal.paid_hint}</p>
          </>
        )}

        {status === 'paid_waiting' && (
          <div className="py-10">
            <div className="w-20 h-20 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <i className="fa-solid fa-hourglass-half text-4xl text-brand-500"></i>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{t.payment_modal.waiting_confirm}</h2>
            <p className="text-slate-400 mb-6 px-4" dangerouslySetInnerHTML={{ __html: t.payment_modal.waiting_desc }}>
            </p>
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mb-6">
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>{t.payment_modal.waiting_status}</span>
            </div>
            <button onClick={closePaymentModal} className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition border border-white/10">
              {t.payment_modal.close_window}
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="py-6">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-check text-4xl text-green-500"></i>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{t.payment_modal.success_title}</h2>
            <p className="text-slate-400 mb-8">{t.payment_modal.success_desc}</p>
            
            <button 
              onClick={handleDownload}
              className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-download"></i>
              {t.payment_modal.download_now}
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="py-10">
            <i className="fa-solid fa-circle-exclamation text-4xl text-rose-500 mb-4"></i>
            <p className="text-slate-400 mb-6">{t.payment_modal.create_fail}</p>
            <button onClick={closePaymentModal} className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white border border-white/10">{t.payment_modal.close}</button>
          </div>
        )}

        {status !== 'completed' && (
          <button 
            onClick={closePaymentModal}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        )}
      </div>
    </div>
  );
}