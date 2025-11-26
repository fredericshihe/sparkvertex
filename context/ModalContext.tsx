'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

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
  isPaymentQRModalOpen: boolean;
  openPaymentQRModal: () => void;
  closePaymentQRModal: () => void;
  isPaymentModalOpen: boolean;
  openPaymentModal: (item: any) => void;
  closePaymentModal: () => void;
  paymentItem: any | null;
  isManageOrdersModalOpen: boolean;
  openManageOrdersModal: () => void;
  closeManageOrdersModal: () => void;
  isRewardModalOpen: boolean;
  openRewardModal: (authorId: string) => void;
  closeRewardModal: () => void;
  rewardAuthorId: string | null;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailItemData, setDetailItemData] = useState<any | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isPaymentQRModalOpen, setIsPaymentQRModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentItem, setPaymentItem] = useState<any | null>(null);
  const [isManageOrdersModalOpen, setIsManageOrdersModalOpen] = useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [rewardAuthorId, setRewardAuthorId] = useState<string | null>(null);

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
  };
  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setDetailItemId(null);
  };

  const openFeedbackModal = () => setIsFeedbackModalOpen(true);
  const closeFeedbackModal = () => setIsFeedbackModalOpen(false);

  const openEditProfileModal = () => setIsEditProfileModalOpen(true);
  const closeEditProfileModal = () => setIsEditProfileModalOpen(false);

  const openPaymentQRModal = () => setIsPaymentQRModalOpen(true);
  const closePaymentQRModal = () => setIsPaymentQRModalOpen(false);

  const openPaymentModal = (item: any) => {
    setPaymentItem(item);
    setIsPaymentModalOpen(true);
  };
  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPaymentItem(null);
  };

  const openManageOrdersModal = () => setIsManageOrdersModalOpen(true);
  const closeManageOrdersModal = () => setIsManageOrdersModalOpen(false);

  const openRewardModal = (authorId: string) => {
    setRewardAuthorId(authorId);
    setIsRewardModalOpen(true);
  };
  const closeRewardModal = () => {
    setIsRewardModalOpen(false);
    setRewardAuthorId(null);
  };

  // Scroll Locking Effect
  useEffect(() => {
    const anyModalOpen = 
      isLoginModalOpen || 
      isDetailModalOpen || 
      isFeedbackModalOpen || 
      isEditProfileModalOpen || 
      isPaymentQRModalOpen || 
      isPaymentModalOpen || 
      isManageOrdersModalOpen ||
      isRewardModalOpen;

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
    isPaymentQRModalOpen, 
    isPaymentModalOpen, 
    isManageOrdersModalOpen,
    isRewardModalOpen
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
      isPaymentQRModalOpen,
      openPaymentQRModal,
      closePaymentQRModal,
      isPaymentModalOpen,
      openPaymentModal,
      closePaymentModal,
      paymentItem,
      isManageOrdersModalOpen,
      openManageOrdersModal,
      closeManageOrdersModal,
      isRewardModalOpen,
      openRewardModal,
      closeRewardModal,
      rewardAuthorId
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
