'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';

export default function PaymentModal() {
  const { isPaymentModalOpen, closePaymentModal, paymentItem } = useModal();
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
        alert('卖家尚未设置收款码，无法购买');
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
      alert('确认支付失败，请重试');
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
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={closePaymentModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 p-8 shadow-2xl text-center animate-float-up">
        
        {status === 'loading' && (
          <div className="py-10">
            <i className="fa-solid fa-circle-notch fa-spin text-4xl text-brand-500 mb-4"></i>
            <p className="text-slate-400">正在创建订单...</p>
          </div>
        )}

        {status === 'waiting' && (
          <>
            <h2 className="text-xl font-bold mb-2 text-white">
              <i className="fa-brands fa-weixin text-green-500 mr-2"></i>
              <i className="fa-brands fa-alipay text-blue-500 mr-2"></i>
              扫码支付
            </h2>
            <p className="text-sm text-slate-400 mb-6">请扫描下方二维码支付 <span className="text-brand-400 font-bold text-lg">¥{paymentItem?.price}</span></p>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 mb-6">
              <p className="text-xs text-slate-400 mb-2">支付备注码 (必填)</p>
              <div className="text-2xl font-mono font-bold text-white tracking-widest select-all bg-slate-900 py-2 rounded border border-slate-700">
                {remarkCode}
              </div>
              <p className="text-xs text-rose-400 mt-2">
                <i className="fa-solid fa-circle-exclamation mr-1"></i>
                支付时请务必在备注中填写此6位数字，否则无法自动发货
              </p>
            </div>

            <div className="w-64 h-64 mx-auto bg-white rounded-xl p-2 mb-6">
              <img src={qrUrl} className="w-full h-full object-contain" alt="Payment QR" />
            </div>

            <button 
              onClick={handleBuyerConfirm}
              className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold shadow-lg shadow-brand-500/30 transition mb-2"
            >
              我已支付
            </button>
            <p className="text-xs text-slate-500">支付完成后请点击上方按钮</p>
          </>
        )}

        {status === 'paid_waiting' && (
          <div className="py-10">
            <div className="w-20 h-20 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <i className="fa-solid fa-hourglass-half text-4xl text-brand-500"></i>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">等待卖家确认</h2>
            <p className="text-slate-400 mb-6 px-4">
              已通知卖家，您可以暂时离开，后续到 <span className="text-brand-400 font-bold">个人中心-已购买</span> 中查看订单状态
            </p>
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mb-6">
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>正在等待卖家确认收款...</span>
            </div>
            <button onClick={closePaymentModal} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition">
              关闭窗口
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="py-6">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-check text-4xl text-green-500"></i>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">支付成功！</h2>
            <p className="text-slate-400 mb-8">感谢您的购买，现在可以下载了</p>
            
            <button 
              onClick={handleDownload}
              className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold shadow-lg shadow-brand-500/30 transition flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-download"></i>
              立即下载
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="py-10">
            <i className="fa-solid fa-circle-exclamation text-4xl text-rose-500 mb-4"></i>
            <p className="text-slate-400 mb-6">订单创建失败，请稍后重试</p>
            <button onClick={closePaymentModal} className="px-6 py-2 bg-slate-800 rounded-lg text-white">关闭</button>
          </div>
        )}

        {status !== 'completed' && (
          <button 
            onClick={closePaymentModal}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        )}
      </div>
    </div>
  );
}