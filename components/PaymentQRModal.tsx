'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

export default function PaymentQRModal() {
  const { isPaymentQRModalOpen, closePaymentQRModal, openLoginModal } = useModal();
  const { t } = useLanguage();
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPaymentQRModalOpen) {
      fetchQR();
    }
  }, [isPaymentQRModalOpen]);

  const fetchQR = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from('profiles')
      .select('payment_qr')
      .eq('id', session.user.id)
      .single();

    if (data) {
      setQrUrl(data.payment_qr || '');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `qr-${session.user.id}-${Math.random()}.${fileExt}`;
      const filePath = `payment-qrs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public')
        .getPublicUrl(filePath);

      setQrUrl(publicUrl);
      
      // Update profile immediately
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ payment_qr: publicUrl })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

    } catch (error: any) {
      console.error('Error uploading QR:', error);
      alert(t.payment_qr_modal.upload_fail + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isPaymentQRModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closePaymentQRModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 p-8 shadow-2xl text-center">
        <h2 className="text-xl font-bold mb-2 text-white">
          <i className="fa-solid fa-qrcode text-brand-500 mr-2"></i>
          {t.payment_qr_modal.title}
        </h2>
        <div className="text-sm text-slate-400 mb-6 space-y-1">
            <p>{t.payment_qr_modal.desc_1}</p>
            <p className="text-slate-300">{t.payment_qr_modal.desc_2}</p>
            <p className="text-slate-300">{t.payment_qr_modal.desc_3}</p>
        </div>
        
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-full aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center cursor-pointer border-4 border-slate-800 hover:border-brand-500 transition group relative"
        >
          {qrUrl ? (
            <img src={qrUrl} className="w-full h-full object-contain" alt="Payment QR" />
          ) : (
            <div className="text-slate-400 flex flex-col items-center">
              <i className="fa-solid fa-plus text-4xl mb-2"></i>
              <span>{t.payment_qr_modal.upload}</span>
            </div>
          )}
          
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <span className="text-white font-bold">{t.payment_qr_modal.change}</span>
          </div>
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*"
          onChange={handleUpload}
        />

        <button 
          onClick={closePaymentQRModal}
          className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition"
        >
          {t.payment_qr_modal.close}
        </button>
      </div>
    </div>
  );
}
