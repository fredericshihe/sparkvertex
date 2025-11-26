'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';

export default function FeedbackModal() {
  const { isFeedbackModalOpen, closeFeedbackModal, openLoginModal } = useModal();
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
      alert('请填写反馈内容');
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

      alert('感谢您的反馈！我们会尽快处理。');
      closeFeedbackModal();
      setContent('');
      setContact('');
      setScreenshot(null);
    } catch (error: any) {
      console.error('Feedback error:', error);
      alert('提交失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm touch-none" onClick={closeFeedbackModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl animate-float-up overscroll-contain max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-comment-dots text-brand-500"></i>
            问题反馈
          </h2>
          <button onClick={closeFeedbackModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="space-y-4">
          {/* Type Selection */}
          <div className="flex gap-4">
            <button 
              onClick={() => setType('bug')}
              className={`flex-1 py-2 rounded-lg border transition text-sm ${type === 'bug' ? 'bg-rose-500/20 border-rose-500 text-rose-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
            >
              <i className="fa-solid fa-bug mr-2"></i>Bug 反馈
            </button>
            <button 
              onClick={() => setType('feature')}
              className={`flex-1 py-2 rounded-lg border transition text-sm ${type === 'feature' ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
            >
              <i className="fa-solid fa-lightbulb mr-2"></i>功能建议
            </button>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">反馈详情</label>
            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none resize-none text-sm"
              placeholder="请详细描述您遇到的问题或建议..."
            ></textarea>
          </div>

          {/* Screenshot */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">截图 (可选)</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 bg-slate-800 border border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-brand-500 transition overflow-hidden relative"
            >
              {screenshot ? (
                <img src={screenshot} className="w-full h-full object-contain" alt="Screenshot" />
              ) : (
                <>
                  <i className="fa-solid fa-image text-2xl text-slate-500 mb-2"></i>
                  <span className="text-xs text-slate-500">点击上传截图</span>
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
            <label className="block text-sm font-medium text-slate-400 mb-1">联系方式 (可选)</label>
            <input 
              type="text" 
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none text-sm"
              placeholder="邮箱或微信号，方便我们联系您"
            />
          </div>

          {/* Submit */}
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-bold transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>}
            提交反馈
          </button>
        </div>
      </div>
    </div>
  );
}
