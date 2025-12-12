'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';

export default function FeedbackModal() {
  const { t } = useLanguage();
  const { isFeedbackModalOpen, closeFeedbackModal, openLoginModal } = useModal();
  const { success: toastSuccess, error: toastError } = useToast();
  const [type, setType] = useState('bug');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isFeedbackModalOpen) return null;

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setScreenshot(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!content) {
      toastError(t.feedback_modal.fill_content);
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        openLoginModal();
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('feedback').insert({
        user_id: session.user.id,
        email: session.user.email || contact, // Use session email or contact input
        type,
        content: `${content}\n\nContact: ${contact}`, // Append contact info to content since table doesn't have contact column
        screenshot,
        user_agent: navigator.userAgent,
        page_url: window.location.href,
        status: 'pending'
      });

      if (error) throw error;

      toastSuccess(t.feedback_modal.submit_success);
      closeFeedbackModal();
      setContent('');
      setContact('');
      setScreenshot(null);
    } catch (error: any) {
      console.error('Feedback error:', error);
      toastError(t.feedback_modal.submit_fail + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm touch-none" onClick={closeFeedbackModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in zoom-in fade-in duration-300 ring-1 ring-white/5 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-comment-dots text-brand-500"></i>
            {t.feedback_modal.title}
          </h2>
          <button onClick={closeFeedbackModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="space-y-4">
          {/* Type Selection */}
          <div className="flex gap-4">
            <button 
              onClick={() => setType('bug')}
              className={`flex-1 py-2 rounded-xl border transition text-sm ${type === 'bug' ? 'bg-rose-500/20 border-rose-500 text-rose-400' : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'}`}
            >
              <i className="fa-solid fa-bug mr-2"></i>{t.feedback_modal.bug_report}
            </button>
            <button 
              onClick={() => setType('feature')}
              className={`flex-1 py-2 rounded-xl border transition text-sm ${type === 'feature' ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'}`}
            >
              <i className="fa-solid fa-lightbulb mr-2"></i>{t.feedback_modal.feature_request}
            </button>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">{t.feedback_modal.details_label}</label>
            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-500/50 focus:bg-black/40 outline-none resize-none text-sm transition-all placeholder-slate-500"
              placeholder={t.feedback_modal.details_placeholder}
            ></textarea>
          </div>

          {/* Screenshot */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">{t.feedback_modal.screenshot_label}</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 bg-black/20 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-brand-500/50 hover:bg-black/40 transition overflow-hidden relative"
            >
              {screenshot ? (
                <img src={screenshot} className="w-full h-full object-contain" alt="Screenshot" />
              ) : (
                <>
                  <i className="fa-solid fa-image text-2xl text-slate-500 mb-2"></i>
                  <span className="text-xs text-slate-500">{t.feedback_modal.upload_screenshot}</span>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleScreenshotUpload}
              />
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">{t.feedback_modal.contact_label}</label>
            <input 
              type="text" 
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-500/50 focus:bg-black/40 outline-none text-sm transition-all placeholder-slate-500"
              placeholder={t.feedback_modal.contact_placeholder}
            />
          </div>

          {/* Submit */}
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>}
            {t.feedback_modal.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
