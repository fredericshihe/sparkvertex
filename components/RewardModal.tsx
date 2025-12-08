'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';

export default function RewardModal() {
  const { isRewardModalOpen, closeRewardModal, rewardAuthorId } = useModal();
  const { info } = useToast();
  const { t } = useLanguage();
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [authorName, setAuthorName] = useState('');

  useEffect(() => {
    if (isRewardModalOpen && rewardAuthorId) {
      fetchAuthorQR(rewardAuthorId);
    }
  }, [isRewardModalOpen, rewardAuthorId]);

  useEffect(() => {
    if (qrUrl && isRewardModalOpen) {
      // Simple check for mobile to show toast
      if (window.innerWidth < 768) {
        info(t.reward_modal.long_press_save, 2000);
      }
    }
  }, [qrUrl, isRewardModalOpen]);

  const fetchAuthorQR = async (authorId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('payment_qr, username')
        .eq('id', authorId)
        .single();

      if (error) throw error;

      if (data) {
        setQrUrl(data.payment_qr || '');
        setAuthorName(data.username || t.reward_modal.author_default);
      }
    } catch (error) {
      console.error('Error fetching author QR:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isRewardModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeRewardModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-black/60 backdrop-blur-2xl rounded-3xl border border-white/10 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in zoom-in fade-in duration-300 ring-1 ring-white/5">
        <div className="mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-gift text-rose-500"></i>
                <span>{t.reward_modal.title}</span>
            </h2>
        </div>
        
        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
            {t.reward_modal.scan_hint_prefix} <span className="text-brand-400 font-bold">{authorName}</span> {t.reward_modal.scan_hint_suffix}
            <br/>
            {t.reward_modal.remark_hint}
        </p>
        
        <div className="w-full aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center border-4 border-white/10 mb-6">
          {loading ? (
            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-slate-400"></i>
          ) : qrUrl ? (
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
          ) : (
            <div className="text-slate-500 flex flex-col items-center p-4">
              <i className="fa-solid fa-image-slash text-4xl mb-2 opacity-50"></i>
              <span>{t.reward_modal.no_qr}</span>
            </div>
          )}
        </div>

        {/* Mobile Hint */}
        {qrUrl && (
            <p className="text-xs text-slate-500 text-center -mt-4 mb-6 md:hidden animate-pulse">
                <i className="fa-regular fa-hand-point-up mr-1"></i>
                {t.reward_modal.mobile_hint}
            </p>
        )}

        <button 
            onClick={closeRewardModal}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition border border-slate-700"
        >
            {t.reward_modal.close}
        </button>
      </div>
    </div>
  );
}
