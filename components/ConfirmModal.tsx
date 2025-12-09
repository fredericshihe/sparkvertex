'use client';

import { useEffect, useState } from 'react';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

export default function ConfirmModal() {
  const { isConfirmModalOpen, closeConfirmModal, confirmModalConfig } = useModal();
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isConfirmModalOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isConfirmModalOpen]);

  if (!isVisible && !isConfirmModalOpen) return null;

  const handleConfirm = () => {
    if (confirmModalConfig?.onConfirm) {
      confirmModalConfig.onConfirm();
    }
    closeConfirmModal();
  };

  const handleCancel = () => {
    if (confirmModalConfig?.onCancel) {
      confirmModalConfig.onCancel();
    }
    closeConfirmModal();
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
      isConfirmModalOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
    }`}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      ></div>

      {/* Modal Content */}
      <div className={`relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all duration-300 ${
        isConfirmModalOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
      }`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <h3 className="text-lg font-semibold text-white">
            {confirmModalConfig?.title || t.common.confirm}
          </h3>
          <button 
            onClick={handleCancel}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <i className="fa-solid fa-times"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-slate-300 whitespace-pre-wrap leading-relaxed">
          {confirmModalConfig?.message}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-800 flex justify-end gap-3">
          {confirmModalConfig?.cancelText !== null && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              {confirmModalConfig?.cancelText || t.common.cancel}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition-all"
          >
            {confirmModalConfig?.confirmText || t.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
