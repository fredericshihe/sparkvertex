'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';

interface ModalContextType {
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  isDetailModalOpen: boolean;
  openDetailModal: (itemId: string, initialData?: any) => void;
  closeDetailModal: () => void;
  detailItemId: string | null;
  detailItemData: any | null;
  isFeedbackModalOpen: boolean;
  openFeedbackModal: () => void;
  closeFeedbackModal: () => void;
  isEditProfileModalOpen: boolean;
  openEditProfileModal: () => void;
  closeEditProfileModal: () => void;
  isPaymentModalOpen: boolean;
  openPaymentModal: (item: any) => void;
  closePaymentModal: () => void;
  paymentItem: any | null;
  isRewardModalOpen: boolean;
  openRewardModal: (authorId: string) => void;
  closeRewardModal: () => void;
  rewardAuthorId: string | null;
  isCreditPurchaseModalOpen: boolean;
  openCreditPurchaseModal: () => void;
  closeCreditPurchaseModal: () => void;
  isConfirmModalOpen: boolean;
  confirmModalConfig: ConfirmModalConfig | null;
  openConfirmModal: (config: ConfirmModalConfig) => void;
  closeConfirmModal: () => void;
}

export interface ConfirmModalConfig {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailItemData, setDetailItemData] = useState<any | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentItem, setPaymentItem] = useState<any | null>(null);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [rewardAuthorId, setRewardAuthorId] = useState<string | null>(null);
  const [isCreditPurchaseModalOpen, setIsCreditPurchaseModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<ConfirmModalConfig | null>(null);

  // History Management Refs
  const historyStatePushed = useRef(false);
  const isPoppingState = useRef(false);

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  const openDetailModal = (itemId: string, initialData?: any) => {
    setDetailItemId(itemId);
    if (initialData) {
      setDetailItemData(initialData);
    } else {
      setDetailItemData(null);
    }
    setIsDetailModalOpen(true);

    // Push history state for mobile back button support
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'detail' }, '', window.location.href);
      historyStatePushed.current = true;
    }
  };
  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setDetailItemId(null);

    // Only go back if we pushed a state and this isn't a popstate event
    if (historyStatePushed.current && !isPoppingState.current && typeof window !== 'undefined') {
      window.history.back();
      historyStatePushed.current = false;
    }
  };

  // Handle browser back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (isDetailModalOpen) {
        // User pressed back button
        isPoppingState.current = true;
        closeDetailModal();
        isPoppingState.current = false;
        historyStatePushed.current = false; // State is already popped by browser
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDetailModalOpen]);

  const openFeedbackModal = () => setIsFeedbackModalOpen(true);
  const closeFeedbackModal = () => setIsFeedbackModalOpen(false);

  const openEditProfileModal = () => setIsEditProfileModalOpen(true);
  const closeEditProfileModal = () => setIsEditProfileModalOpen(false);

  const openPaymentModal = (item: any) => {
    setPaymentItem(item);
    setIsPaymentModalOpen(true);
  };
  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPaymentItem(null);
  };

  const openRewardModal = (authorId: string) => {
    setRewardAuthorId(authorId);
    setIsRewardModalOpen(true);
  };
  const closeRewardModal = () => {
    setIsRewardModalOpen(false);
    setRewardAuthorId(null);
  };

  const openCreditPurchaseModal = () => setIsCreditPurchaseModalOpen(true);
  const closeCreditPurchaseModal = () => setIsCreditPurchaseModalOpen(false);

  const openConfirmModal = (config: ConfirmModalConfig) => {
    setConfirmModalConfig(config);
    setIsConfirmModalOpen(true);
  };
  const closeConfirmModal = () => {
    setIsConfirmModalOpen(false);
    // Don't clear config immediately to allow animation to finish
    setTimeout(() => setConfirmModalConfig(null), 300);
  };

  // Scroll Locking Effect
  useEffect(() => {
    const anyModalOpen = 
      isLoginModalOpen || 
      isDetailModalOpen || 
      isFeedbackModalOpen || 
      isEditProfileModalOpen || 
      isPaymentModalOpen || 
      isRewardModalOpen ||
      isCreditPurchaseModalOpen ||
      isConfirmModalOpen;

    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [
    isLoginModalOpen, 
    isDetailModalOpen, 
    isFeedbackModalOpen, 
    isEditProfileModalOpen, 
    isPaymentModalOpen, 
    isRewardModalOpen,
    isCreditPurchaseModalOpen,
    isConfirmModalOpen
  ]);

  return (
    <ModalContext.Provider value={{ 
      isLoginModalOpen, 
      openLoginModal, 
      closeLoginModal,
      isDetailModalOpen,
      openDetailModal,
      closeDetailModal,
      detailItemId,
      detailItemData,
      isFeedbackModalOpen,
      openFeedbackModal,
      closeFeedbackModal,
      isEditProfileModalOpen,
      openEditProfileModal,
      closeEditProfileModal,
      isPaymentModalOpen,
      openPaymentModal,
      closePaymentModal,
      paymentItem,
      isRewardModalOpen,
      openRewardModal,
      closeRewardModal,
      rewardAuthorId,
      isCreditPurchaseModalOpen,
      openCreditPurchaseModal,
      closeCreditPurchaseModal,
      isConfirmModalOpen,
      confirmModalConfig,
      openConfirmModal,
      closeConfirmModal
    }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
