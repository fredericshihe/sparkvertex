'use client';

import React, { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    info: 'fa-circle-info',
    warning: 'fa-triangle-exclamation'
  };

  const colors = {
    success: 'border-green-500 bg-green-900 text-white',
    error: 'border-red-500 bg-red-900 text-white',
    info: 'border-blue-500 bg-blue-900 text-white',
    warning: 'border-yellow-500 bg-yellow-900 text-white'
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl animate-slide-in-right mb-3 min-w-[300px] max-w-md transition-all duration-300 ${colors[toast.type]}`}>
      <i className={`fa-solid ${icons[toast.type]} text-xl`}></i>
      <div className="flex-grow text-sm font-medium">{toast.message}</div>
      <button onClick={() => onClose(toast.id)} className="opacity-70 hover:opacity-100 transition">
        <i className="fa-solid fa-xmark"></i>
      </button>
    </div>
  );
};

export default Toast;
