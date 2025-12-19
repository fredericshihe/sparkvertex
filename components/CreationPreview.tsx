import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import { useModal } from '@/context/ModalContext';
import BackendDataPanel from './BackendDataPanel';
import { detectSparkBackendCode } from '@/lib/utils';

interface CreationPreviewProps {
  activeMobileTab: string;
  handleExit: () => void;
  t: any;
  isFullscreen: boolean;
  toggleFullScreen: () => void;
  language: 'zh' | 'en';
  isSaving: boolean;
  handleSaveDraft: () => void;
  handleUpload: () => void;
  previewContainerRef: React.RefObject<HTMLDivElement>;
  quickEditHistory: any[];
  isHistoryPanelOpen: boolean;
  setIsHistoryPanelOpen: (open: boolean) => void;
  quickEditUndo: () => void;
  canQuickEditUndo: boolean;
  quickEditRedo: () => void;
  canQuickEditRedo: boolean;
  quickEditHistoryIndex: number;
  setGeneratedCode: (code: string) => void;
  setStreamingCode: (code: string) => void;
  setQuickEditHistoryIndex: (index: number) => void;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  isEditMode: boolean;
  previewMode: 'desktop' | 'tablet' | 'mobile';
  previewScale: number;
  getPreviewContent: (code: string, options?: any) => string;
  runtimeError: string | null;
  handleFixError: (error?: string, details?: any) => void;
  setRuntimeError: (error: string | null) => void;
  setPreviewMode: (mode: 'desktop' | 'tablet' | 'mobile') => void;
  handlePreviewModeChange: (mode: 'desktop' | 'tablet' | 'mobile') => void; // 🆕 Auto apply default scale
  handleMobilePreview: () => void;
  toggleEditMode: () => void;
  // 🆕 Zoom Controls
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  isManualScale: boolean;
  step: string;
  isGenerating: boolean;
  showEditModal: boolean;
  selectedElement: any;
  setShowEditModal: (show: boolean) => void;
  setQuickEditMode: (mode: any) => void;
  detectQuickEditType: (element: any) => string;
  quickEditMode: string;
  setQuickEditText: (text: string) => void;
  detectAvailableColorTypes: (className: string, element?: any) => string[];
  setAvailableColorTypes: (types: any[]) => void;
  setQuickEditColorType: (type: any) => void;
  availableColorTypes: string[];
  quickEditColorType: string;
  quickEditColor: string;
  setQuickEditColor: (color: string) => void;
  applyQuickColorEdit: (color: string) => void;
  quickEditText: string;
  applyQuickTextEdit: (text: string) => void;
  // 🆕 Image editing props
  quickEditImageUrl: string;
  setQuickEditImageUrl: (url: string) => void;
  applyQuickImageEdit: (url: string) => void;
  handleImageUpload: (file: File) => void;
  isUploadingImage: boolean;
  // 🆕 Image storage quota & management
  imageQuota: { quotaBytes: number; usedBytes: number; remainingBytes: number } | null;
  userUploadedImages: Array<{ path: string; publicUrl: string; bytes: number; createdAt: string | null }> | null;
  isLoadingUserUploadedImages: boolean;
  loadUserUploadedImages: () => void;
  deleteUserUploadedImage: (path: string) => void;
  // 🆕 AI Image Generation
  aiImagePrompt: string;
  setAiImagePrompt: (prompt: string) => void;
  isGeneratingAiImage: boolean;
  generatedAiImage: string | null;
  handleGenerateAiImage: () => void;
  handleApplyAiImage: () => void;
  credits: number;
  editIntent: string;
  setEditIntent: (intent: any) => void;
  editRequest: string;
  setEditRequest: (request: string) => void;
  handleElementEditSubmit: () => void;
  showMobilePreview: boolean;
  setShowMobilePreview: (show: boolean) => void;
  mobilePreviewUrl: string;
  generatedCode: string;
  historyPanelRef?: React.RefObject<HTMLDivElement>;
  userId?: string | null; // 新增：用户ID，用于后端数据
  appId?: string; // 新增：应用ID（发布后）
  isPublicWork?: boolean; // 新增：是否为公开作品
  handleConfigureBackend: () => void; // 新增：一键配置后端
}

export const CreationPreview: React.FC<CreationPreviewProps> = ({
  activeMobileTab,
  handleExit,
  t,
  isFullscreen,
  toggleFullScreen,
  language,
  isSaving,
  handleSaveDraft,
  handleUpload,
  previewContainerRef,
  quickEditHistory,
  isHistoryPanelOpen,
  setIsHistoryPanelOpen,
  quickEditUndo,
  canQuickEditUndo,
  quickEditRedo,
  canQuickEditRedo,
  quickEditHistoryIndex,
  setGeneratedCode,
  setStreamingCode,
  setQuickEditHistoryIndex,
  iframeRef,
  isEditMode,
  previewMode,
  previewScale,
  getPreviewContent,
  runtimeError,
  handleFixError,
  setRuntimeError,
  setPreviewMode,
  handlePreviewModeChange,
  handleMobilePreview,
  toggleEditMode,
  handleZoomIn,
  handleZoomOut,
  handleResetZoom,
  isManualScale,
  step,
  isGenerating,
  showEditModal,
  selectedElement,
  setShowEditModal,
  setQuickEditMode,
  detectQuickEditType,
  quickEditMode,
  setQuickEditText,
  detectAvailableColorTypes,
  setAvailableColorTypes,
  setQuickEditColorType,
  availableColorTypes,
  quickEditColorType,
  quickEditColor,
  setQuickEditColor,
  applyQuickColorEdit,
  quickEditText,
  applyQuickTextEdit,
  quickEditImageUrl,
  setQuickEditImageUrl,
  applyQuickImageEdit,
  handleImageUpload,
  isUploadingImage,
  imageQuota,
  userUploadedImages,
  isLoadingUserUploadedImages,
  loadUserUploadedImages,
  deleteUserUploadedImage,
  aiImagePrompt,
  setAiImagePrompt,
  isGeneratingAiImage,
  generatedAiImage,
  handleGenerateAiImage,
  handleApplyAiImage,
  credits,
  editIntent,
  setEditIntent,
  editRequest,
  setEditRequest,
  handleElementEditSubmit,
  showMobilePreview,
  setShowMobilePreview,
  mobilePreviewUrl,
  generatedCode,
  historyPanelRef,
  userId,
  appId,
  isPublicWork,
  handleConfigureBackend
}) => {
  const { openConfirmModal } = useModal();
  const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  
  // 本地 ref 用于点击外部检测（如果外部未传入）
  const localHistoryPanelRef = useRef<HTMLDivElement>(null);
  const effectiveHistoryPanelRef = historyPanelRef || localHistoryPanelRef;
  
  // 点击外部关闭历史面板
  useEffect(() => {
    if (!isHistoryPanelOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const panel = effectiveHistoryPanelRef.current;
      if (panel && !panel.contains(event.target as Node)) {
        setIsHistoryPanelOpen(false);
      }
    };
    
    // 使用 setTimeout 避免立即触发（点击展开按钮时）
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isHistoryPanelOpen, setIsHistoryPanelOpen]);
  
  // 后端数据面板状态
  const [showBackendPanel, setShowBackendPanel] = useState(false);
  // 解释弹窗状态
  const [showBackendExplanation, setShowBackendExplanation] = useState(false);
  // iframe 刷新 Key
  const [iframeKey, setIframeKey] = useState(0);

  // 监听来自 iframe 的 Mock 拦截消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SPARK_BACKEND_MOCKED_ACTION') {
        openConfirmModal({
          title: language === 'zh' ? '后端未配置' : 'Backend Not Configured',
          message: language === 'zh' 
            ? '检测到您正在尝试提交数据，但当前应用尚未配置有效的后端连接。是否立即配置？' 
            : 'You are trying to submit data, but the backend is not configured. Configure now?',
          confirmText: language === 'zh' ? '立即配置' : 'Configure Now',
          onConfirm: () => {
            setShowBackendExplanation(true);
          }
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [language]);

  // 检测是否已配置后端（使用统一的检测函数，支持多种模式）
  const hasBackend = detectSparkBackendCode(generatedCode);

  // 提取清除缓存逻辑
  const clearAppCache = () => {
    if (iframeRef.current?.contentWindow) {
      try {
        const win = iframeRef.current.contentWindow;
        // 1. 清除 LocalStorage (保留系统关键 Key)
        const keysToRemove: string[] = [];
        for (let i = 0; i < win.localStorage.length; i++) {
          const key = win.localStorage.key(i);
          // 保护 Supabase Auth 和 i18n
          if (key && !key.startsWith('sb-') && key !== 'i18nextLng') {
             keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => win.localStorage.removeItem(k));
        
        // 2. 清除 SessionStorage
        win.sessionStorage.clear();
      } catch (e) {
        console.error('Cache clear failed:', e);
      }
    }
  };

  // 重置应用并清除缓存
  const handleResetApp = () => {
    openConfirmModal({
      title: language === 'zh' ? '清除缓存并重启' : 'Clear Cache & Restart',
      message: language === 'zh' 
        ? '确定要清除该应用的所有本地数据（如游戏进度、设置等）并重新启动吗？此操作无法撤销。' 
        : 'Are you sure you want to clear all local data (game progress, settings, etc.) and restart? This cannot be undone.',
      confirmText: language === 'zh' ? '清除并重启' : 'Clear & Restart',
      onConfirm: () => {
        clearAppCache();
        setRuntimeError(null);
        // 3. 强制刷新 iframe
        setIframeKey(prev => prev + 1);
      }
    });
  };

  return (
    <div className={`flex-1 bg-slate-950 relative flex flex-col group 
        order-1 lg:order-2 
        h-full shrink-0 overflow-hidden
        ${activeMobileTab === 'preview' ? 'flex' : 'hidden lg:flex'}
    `}>
        {/* Backend Data Panel */}
        <BackendDataPanel
          isOpen={showBackendPanel}
          onClose={() => setShowBackendPanel(false)}
          userId={userId || null}
          appId={appId}
          language={language}
          mode="test"
          code={generatedCode}
          onCodeUpdate={setGeneratedCode}
        />

        <div className="h-12 bg-black border-b border-white/10 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={handleExit} className="lg:hidden flex w-10 h-10 items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition" title={t.common.back}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span className="text-sm font-bold text-slate-400">{t.create.preview_mode}</span>
            
            {/* Full Screen Button */}
            <button 
              onClick={toggleFullScreen}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              title={language === 'zh' ? (isFullscreen ? '退出全屏' : '全屏预览') : (isFullscreen ? 'Exit Full Screen' : 'Full Screen')}
            >
              <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            </button>
          </div>
          
          <div className="flex items-center gap-2" data-tour="header-actions">
            <button 
              onClick={handleSaveDraft}
              disabled={isSaving}
              className={`px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isSaving ? (
                <i className="fa-solid fa-circle-notch fa-spin"></i>
              ) : (
                <i className="fa-solid fa-floppy-disk"></i>
              )}
              <span>{isSaving ? (language === 'zh' ? '保存中...' : 'Saving...') : (language === 'zh' ? '存草稿' : 'Save Draft')}</span>
            </button>
            
            <button 
              onClick={handleUpload}
              className="px-3 py-1.5 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold transition shadow-lg flex items-center gap-1.5"
            >
              <i className="fa-solid fa-rocket"></i> 
              <span>{t.create.publish}</span>
            </button>
          </div>
        </div>
        
        {/* Preview Container */}
        <div 
          ref={previewContainerRef}
          className="flex-1 relative overflow-hidden flex items-center justify-center bg-[url('/grid.svg')] bg-center pb-28 lg:pb-0"
          data-tour="preview-area"
        >
          {/* Quick Edit History Panel - Right side of preview (persistent, collapsible) */}
          {quickEditHistory.length > 0 && (
            <div 
              ref={effectiveHistoryPanelRef}
              className={`absolute right-2 top-2 z-20 transition-all duration-300 ${isHistoryPanelOpen ? 'bottom-20 lg:bottom-2' : ''}`}
              data-tour="undo-redo-panel"
            >
              {isHistoryPanelOpen ? (
                <div className="w-48 h-full bg-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5">
                  {/* Header */}
                  <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/5">
                    <div className="text-[11px] text-slate-200 font-bold flex items-center gap-2">
                      <i className="fa-solid fa-clock-rotate-left text-brand-400"></i>
                      {language === 'zh' ? `修改历史` : `History`}
                      <span className="text-slate-500 font-mono">({quickEditHistory.length})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={quickEditUndo}
                        disabled={!canQuickEditUndo}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition text-[10px] ${
                          canQuickEditUndo 
                            ? 'text-slate-300 hover:bg-white/10 hover:text-white' 
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                        title={language === 'zh' ? '撤销' : 'Undo'}
                      >
                        <i className="fa-solid fa-rotate-left"></i>
                      </button>
                      <button
                        onClick={quickEditRedo}
                        disabled={!canQuickEditRedo}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition text-[10px] ${
                          canQuickEditRedo 
                            ? 'text-slate-300 hover:bg-white/10 hover:text-white' 
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                        title={language === 'zh' ? '重做' : 'Redo'}
                      >
                        <i className="fa-solid fa-rotate-right"></i>
                      </button>
                      <div className="w-px h-3 bg-white/10 mx-0.5"></div>
                      <button
                        onClick={() => setIsHistoryPanelOpen(false)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center transition text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
                        title={language === 'zh' ? '收起' : 'Collapse'}
                      >
                        <i className="fa-solid fa-chevron-right"></i>
                      </button>
                    </div>
                  </div>
                  {/* History List - Vertical */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                    {quickEditHistory.map((item, idx) => {
                      const isCurrent = idx === quickEditHistoryIndex;
                      const isPast = idx < quickEditHistoryIndex;
                      return (
                        <div 
                          key={idx}
                          className={`text-xs px-3 py-2.5 rounded-lg flex items-center gap-2.5 cursor-pointer transition-all group ${
                            isCurrent 
                              ? 'bg-brand-500/10 text-brand-300 border border-brand-500/30 shadow-sm' 
                              : isPast 
                                ? 'text-slate-400 bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10' 
                                : 'text-slate-500 hover:bg-white/5 border border-transparent'
                          }`}
                          onClick={() => {
                            // Jump to this history state
                            if (idx !== quickEditHistoryIndex) {
                              setGeneratedCode(item.code);
                              setStreamingCode(item.code);
                              setQuickEditHistoryIndex(idx);
                              
                              // Update iframe
                              if (iframeRef.current?.contentWindow) {
                                iframeRef.current.contentWindow.postMessage({ 
                                  type: 'spark-update-content', 
                                  html: item.code 
                                }, '*');
                                
                                // Re-enable edit mode after content update
                                setTimeout(() => {
                                  if (isEditMode && iframeRef.current?.contentWindow) {
                                    iframeRef.current.contentWindow.postMessage({ type: 'toggle-edit-mode', enabled: true }, '*');
                                  }
                                }, 100);
                              }
                            }
                          }}
                          title={item.description}
                        >
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono shrink-0 transition-colors ${
                            isCurrent ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-white/10 text-slate-500 group-hover:bg-white/20 group-hover:text-slate-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="truncate flex-1 font-medium">{item.description}</span>
                          {isCurrent && (
                            <div className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-500"></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Collapsed state - small button to expand */
                <button
                  onClick={() => setIsHistoryPanelOpen(true)}
                  className="w-10 h-10 bg-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition ring-1 ring-white/5 group"
                  title={language === 'zh' ? `展开历史 (${quickEditHistory.length})` : `Expand History (${quickEditHistory.length})`}
                >
                  <div className="relative">
                    <i className="fa-solid fa-clock-rotate-left text-sm group-hover:scale-110 transition-transform"></i>
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold shadow-lg shadow-brand-500/30">
                      {quickEditHistory.length}
                    </span>
                  </div>
                </button>
              )}
            </div>
          )}
          <div 
            className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-black flex-shrink-0 origin-center
              ${(previewMode === 'mobile')
                ? 'w-[375px] h-[812px] rounded-[3rem] border-[8px] border-white/10 ring-1 ring-white/5' 
                : ''}
              ${(previewMode === 'tablet')
                ? 'w-[768px] h-[1024px] rounded-[2rem] border-[12px] border-white/10 ring-1 ring-white/5' 
                : ''}
              ${(previewMode === 'desktop')
                ? 'w-full h-full rounded-none border-0' 
                : ''}
            `}
            style={{
              // 🔧 Ensure scale is always valid (between 0.2 and 1.5) to prevent visual glitches
              transform: (previewMode !== 'desktop') ? `scale(${Math.max(0.2, Math.min(previewScale || 1, 1.5))})` : 'none'
            }}
          >
             {(previewMode === 'mobile' && !isFullscreen) && (
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-2xl z-20 pointer-events-none border-b border-x border-white/10"></div>
             )}
             
             <iframe
               key={iframeKey}
               ref={iframeRef}
               srcDoc={getPreviewContent(generatedCode, { raw: true, userId: userId || undefined, appId: appId, apiBaseUrl: typeof window !== 'undefined' ? window.location.origin : '' })}
               className="w-full h-full bg-black"
               sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-same-origin"
               allow="autoplay; fullscreen"
             />
          </div>
          
          {/* Floating Preview Controls - Left Side Vertical Layout */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 z-10">
            {/* 错误提示已移至聊天对话框，避免重复显示 */}

            {/* Device Mode Buttons - Vertical */}
            <div className="bg-black/90 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 flex flex-col shadow-2xl ring-1 ring-white/5" data-tour="device-switch">
              <button onClick={() => handlePreviewModeChange('desktop')} className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-white/20 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title={t.devices.desktop}><i className="fa-solid fa-desktop text-xs lg:text-sm"></i></button>
              <button onClick={() => handlePreviewModeChange('tablet')} className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-white/20 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title={t.devices.tablet}><i className="fa-solid fa-tablet-screen-button text-xs lg:text-sm"></i></button>
              <button onClick={() => handlePreviewModeChange('mobile')} className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-white/20 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title={t.devices.mobile}><i className="fa-solid fa-mobile-screen text-xs lg:text-sm"></i></button>
            </div>

            {/* 🆕 Zoom Controls - only show for mobile/tablet modes */}
            {previewMode !== 'desktop' && (
              <div className="bg-black/90 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 flex flex-col items-center shadow-2xl ring-1 ring-white/5" data-tour="zoom-controls">
                <button 
                  onClick={handleZoomIn} 
                  className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center transition text-slate-400 hover:text-white hover:bg-white/10"
                  title={language === 'zh' ? '放大' : 'Zoom In'}
                >
                  <i className="fa-solid fa-plus text-xs"></i>
                </button>
                <button
                  onClick={handleResetZoom}
                  className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center transition text-xs font-mono ${
                    isManualScale 
                      ? 'text-brand-400 hover:text-brand-300 hover:bg-white/10' 
                      : 'text-slate-500'
                  }`}
                  title={language === 'zh' ? '恢复默认' : 'Reset Zoom'}
                >
                  {Math.round(previewScale * 100)}%
                </button>
                <button 
                  onClick={handleZoomOut} 
                  className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center transition text-slate-400 hover:text-white hover:bg-white/10"
                  title={language === 'zh' ? '缩小' : 'Zoom Out'}
                >
                  <i className="fa-solid fa-minus text-xs"></i>
                </button>
              </div>
            )}

            <div className="h-px w-8 bg-white/10 my-1"></div>

            {/* Tool Group - Wrapped for Onboarding */}
            <div className="flex flex-col items-center gap-3" data-tour="tool-group">
              {/* Reset App Button */}
              <button 
                  onClick={handleResetApp}
                  className="w-10 h-10 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition hover:bg-white/10 shadow-xl group ring-1 ring-white/5" 
                  title={language === 'zh' ? '清除缓存并重启' : 'Clear Cache & Restart'}
                  data-tour="reset-btn"
              >
                  <i className="fa-solid fa-rotate text-sm group-hover:rotate-180 transition duration-500"></i>
              </button>

              <button 
                  onClick={handleMobilePreview}
                  className="w-10 h-10 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition hover:bg-white/10 shadow-xl group ring-1 ring-white/5" 
                  title={t.create.mobile_preview}
                  data-tour="mobile-preview-btn"
              >
                  <i className="fa-solid fa-qrcode text-sm group-hover:scale-110 transition"></i>
              </button>

              {/* Configure Backend Button */}
              <button 
                  onClick={() => setShowBackendExplanation(true)}
                  className="w-10 h-10 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition hover:bg-white/10 shadow-xl group relative ring-1 ring-white/5" 
                  title={language === 'zh' ? '一键配置表单' : 'Configure Form Collection'}
                  data-tour="backend-btn"
              >
                  <i className="fa-solid fa-server text-sm group-hover:scale-110 transition"></i>
                  {!hasBackend && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-yellow-500 rounded-full border-2 border-black"></span>}
              </button>

              {/* Backend Data Button - Always show if backend is enabled, even for public works (for testing) */}
              {hasBackend && (
                <button 
                    onClick={() => setShowBackendPanel(true)}
                    className="w-10 h-10 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition hover:bg-white/10 shadow-xl group relative ring-1 ring-white/5" 
                    title={language === 'zh' ? '查看表单数据' : 'View Form Data'}
                    data-tour="data-btn"
                >
                    <i className="fa-solid fa-inbox text-sm group-hover:scale-110 transition"></i>
                    {/* Pulse indicator */}
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-black animate-pulse"></span>
                </button>
              )}
            </div>

            <div className="h-px w-8 bg-white/10 my-1"></div>

            {/* Edit Mode Button - Vertical Style */}
            <button 
                onClick={toggleEditMode}
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-all shadow-xl border ${
                    isEditMode 
                    ? 'bg-gradient-to-r from-brand-600 to-purple-600 border-transparent text-white ring-2 ring-brand-500/30 scale-105' 
                    : 'bg-black/90 backdrop-blur-md border-white/10 text-slate-300 hover:text-white hover:bg-white/10 hover:border-white/20 group ring-1 ring-white/5'
                }`}
                title={isEditMode ? t.create.finish_edit : t.create.edit_mode}
                data-tour="edit-mode-btn"
            >
                <i className={`fa-solid ${isEditMode ? 'fa-check' : 'fa-arrow-pointer'} text-sm ${isEditMode ? '' : 'animate-pulse'}`}></i>
            </button>

            {/* Quick Edit Undo/Redo Buttons - Only show when in edit mode and has history */}
            {isEditMode && quickEditHistory.length > 0 && (
              <div className="flex flex-col items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl px-1.5 py-2 shadow-xl">
                <button
                  onClick={quickEditUndo}
                  disabled={!canQuickEditUndo}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    canQuickEditUndo 
                      ? 'text-slate-300 hover:text-white hover:bg-slate-700' 
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                  title={language === 'zh' ? `撤销 (${quickEditHistoryIndex + 1})` : `Undo (${quickEditHistoryIndex + 1})`}
                >
                  <i className="fa-solid fa-rotate-left text-sm"></i>
                </button>
                <span className="text-xs text-slate-500 py-1">{quickEditHistoryIndex + 1}/{quickEditHistory.length}</span>
                <button
                  onClick={quickEditRedo}
                  disabled={!canQuickEditRedo}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    canQuickEditRedo 
                      ? 'text-slate-300 hover:text-white hover:bg-slate-700' 
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                  title={language === 'zh' ? '重做' : 'Redo'}
                >
                  <i className="fa-solid fa-rotate-right text-sm"></i>
                </button>
              </div>
            )}
          </div>

          {isGenerating && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white animate-fade-in">
                <div className="bg-zinc-950/90 backdrop-blur-xl p-8 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center max-w-sm text-center ring-1 ring-white/5 relative overflow-hidden">
                  {/* Background Glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-brand-500/20 rounded-full blur-[60px] pointer-events-none"></div>
                  
                  {/* Dynamic Icon based on mode */}
                  <div className="relative mb-6 z-10">
                     {/* Outer ring */}
                     <div className="absolute inset-0 rounded-full border-4 border-white/5"></div>
                     {/* Spinning ring */}
                     <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(16,185,129,0.3)]"></div>
                     {/* Center Icon */}
                     <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center backdrop-blur-sm">
                            <i className={`fa-solid ${step === 'preview' ? 'fa-wand-magic-sparkles' : 'fa-robot'} text-brand-400 text-lg animate-pulse`}></i>
                        </div>
                     </div>
                  </div>
                  
                  <div className="z-10 space-y-2">
                      <p className="font-bold text-xl text-white tracking-tight">
                        {step === 'preview' 
                            ? (language === 'zh' ? '正在优化应用...' : 'Refining App...') 
                            : t.create.generating_title}
                      </p>
                      <p className="text-sm text-zinc-400 leading-relaxed max-w-[260px] mx-auto">
                        {step === 'preview'
                            ? (language === 'zh' ? 'AI 正在根据您的反馈调整代码，请稍候...' : 'AI is adjusting the code based on your feedback, please wait...')
                            : t.create.generating_subtitle}
                      </p>
                  </div>
                </div>
            </div>
          )}

      {showEditModal && selectedElement && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 pt-12 overflow-y-auto animate-fade-in">
          <div className="bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden my-auto ring-1 ring-white/5">
            {/* Header - More compact */}
            <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <i className="fa-solid fa-pen-to-square text-xs"></i>
                </div>
                {t.create.edit_element_title}
              </h3>
              <button onClick={() => { setShowEditModal(false); setQuickEditMode('none'); }} className="text-zinc-400 hover:text-white transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
                {/* Context Card - More compact */}
                <div className="bg-black/40 rounded-xl p-3.5 border border-white/5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition">
                     <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900/80 px-2 py-1 rounded-md border border-white/10">
                        {selectedElement.tagName.toLowerCase()}
                     </span>
                  </div>
                  
                  <div className="space-y-2.5">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
                            <i className="fa-solid fa-crosshairs text-[9px]"></i> {t.create.edit_element_selected}
                        </div>
                        <div className="font-mono text-xs text-indigo-300 break-all bg-indigo-500/10 p-1.5 rounded border border-indigo-500/20">
                            &lt;{selectedElement.tagName.toLowerCase()} className="..."&gt;
                        </div>
                      </div>
                      
                      {selectedElement.innerText && (
                          <div className="pl-2.5 border-l-2 border-white/10">
                            <div className="text-[10px] text-zinc-500 mb-0.5">Content</div>
                            <div className="text-xs text-zinc-300 italic line-clamp-2 leading-relaxed">
                                "{selectedElement.innerText.substring(0, 100)}{selectedElement.innerText.length > 100 ? '...' : ''}"
                            </div>
                          </div>
                      )}

                      {selectedElement.parentTagName && (
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 pt-2 border-t border-white/5">
                             <i className="fa-solid fa-level-up-alt fa-rotate-90 text-[9px]"></i>
                             <span>Inside &lt;{selectedElement.parentTagName}&gt;</span>
                          </div>
                      )}
                  </div>
                </div>

                {/* Quick Edit Buttons - Show when applicable */}
                {(detectQuickEditType(selectedElement) !== 'none') && quickEditMode === 'none' && (
                  <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3.5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none"></div>
                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5 relative z-10">
                      <i className="fa-solid fa-bolt text-[9px]"></i>
                      {language === 'zh' ? '快速编辑' : 'Quick Edit'}
                    </div>
                    <div className="flex gap-2.5 relative z-10">
                      {(detectQuickEditType(selectedElement) === 'text' || detectQuickEditType(selectedElement) === 'both') && (
                        <button
                          onClick={() => {
                            setQuickEditMode('text');
                            setQuickEditText(selectedElement.innerText || '');
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/20 group border border-emerald-500/50"
                        >
                          <i className="fa-solid fa-font text-[10px] group-hover:scale-110 transition-transform"></i>
                          {language === 'zh' ? '改文字' : 'Text'}
                        </button>
                      )}
                      {(detectQuickEditType(selectedElement) === 'color' || detectQuickEditType(selectedElement) === 'both') && (
                        <button
                          onClick={() => {
                            const types = detectAvailableColorTypes(selectedElement.className, selectedElement);
                            setAvailableColorTypes(types);
                            setQuickEditColorType(types.length === 1 ? types[0] : 'all');
                            setQuickEditMode('color');
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/20 group border border-emerald-500/50"
                        >
                          <i className="fa-solid fa-palette text-[10px] group-hover:scale-110 transition-transform"></i>
                          {language === 'zh' ? '改颜色' : 'Color'}
                        </button>
                      )}
                      {/* 🆕 Image Edit Button */}
                      {detectQuickEditType(selectedElement) === 'image' && (
                        <button
                          onClick={() => {
                            setQuickEditMode('image');
                            setQuickEditImageUrl(selectedElement.imageSrc || selectedElement.backgroundImage || '');
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-lg shadow-purple-900/20 group border border-purple-500/50"
                        >
                          <i className="fa-solid fa-image text-[10px] group-hover:scale-110 transition-transform"></i>
                          {language === 'zh' ? '换图片' : 'Image'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 🆕 Quick Edit: Image Upload/URL */}
                {quickEditMode === 'image' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fa-solid fa-image text-purple-500"></i>
                        {language === 'zh' ? '更换图片' : 'Replace Image'}
                      </label>
                      <button 
                        onClick={() => setQuickEditMode('none')}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition"
                      >
                        <i className="fa-solid fa-arrow-left"></i>
                        {language === 'zh' ? '返回' : 'Back'}
                      </button>
                    </div>

                    {/* Storage Quota */}
                    {imageQuota && (
                      <div className="bg-black/30 border border-white/5 rounded-lg p-2 flex items-center justify-between">
                        <div className="text-[10px] text-zinc-500">
                          {language === 'zh'
                            ? `存储：已用 ${formatMB(imageQuota.usedBytes)} / ${formatMB(imageQuota.quotaBytes)}，剩余 ${formatMB(imageQuota.remainingBytes)}`
                            : `Storage: ${formatMB(imageQuota.usedBytes)} / ${formatMB(imageQuota.quotaBytes)} used, ${formatMB(imageQuota.remainingBytes)} left`}
                        </div>
                        <button
                          onClick={loadUserUploadedImages}
                          disabled={isLoadingUserUploadedImages}
                          className="px-2 py-1 bg-white/5 hover:bg-white/10 disabled:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed rounded-md text-[10px] text-zinc-300 transition"
                        >
                          {isLoadingUserUploadedImages
                            ? (language === 'zh' ? '加载中...' : 'Loading...')
                            : (language === 'zh' ? '管理' : 'Manage')}
                        </button>
                      </div>
                    )}
                    
                    {/* Current Image Preview */}
                    {(selectedElement.imageSrc || selectedElement.backgroundImage) && (
                      <div className="bg-black/40 rounded-lg p-2 border border-white/5">
                        <div className="text-[10px] text-zinc-500 mb-1.5">{language === 'zh' ? '当前图片：' : 'Current:'}</div>
                        <div className="relative aspect-video rounded overflow-hidden bg-zinc-900">
                          <img 
                            src={selectedElement.imageSrc || selectedElement.backgroundImage} 
                            alt="Current" 
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="text-[9px] text-zinc-600 mt-1 truncate font-mono">
                          {(selectedElement.imageSrc || selectedElement.backgroundImage || '').slice(0, 50)}...
                        </div>
                      </div>
                    )}
                    
                    {/* Upload Option */}
                    <label className={`block p-4 border-2 border-dashed rounded-xl cursor-pointer transition text-center ${
                      isUploadingImage 
                        ? 'border-purple-500/50 bg-purple-500/10' 
                        : 'border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5'
                    }`}>
                      {isUploadingImage ? (
                        <>
                          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-purple-400 mb-2"></i>
                          <p className="text-xs text-purple-400">{language === 'zh' ? '上传中...' : 'Uploading...'}</p>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-cloud-arrow-up text-2xl text-purple-400 mb-2"></i>
                          <p className="text-xs text-zinc-400">{language === 'zh' ? '点击上传新图片' : 'Click to upload'}</p>
                          <p className="text-[10px] text-zinc-600 mt-1">JPG, PNG, WebP (max 5MB)</p>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden"
                        disabled={isUploadingImage}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                      />
                    </label>

                    {/* 🆕 AI Image Generation */}
                    <div className="bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fa-solid fa-wand-magic-sparkles text-cyan-400"></i>
                        <span className="text-[11px] font-bold text-cyan-300">
                          {language === 'zh' ? 'AI 生成图片' : 'AI Generate Image'}
                        </span>
                        <span className="text-[9px] text-zinc-500 ml-auto">
                          {language === 'zh' ? `消耗 5 积分 (剩余 ${Number.isInteger(credits) ? credits : credits.toFixed(1)})` : `Cost 5 credits (${Number.isInteger(credits) ? credits : credits.toFixed(1)} left)`}
                        </span>
                      </div>
                      
                      <div className="text-[9px] text-zinc-500 mb-2">
                        {language === 'zh' 
                          ? 'AI 智能生成，最大 1024×1024 像素' 
                          : 'AI powered, max 1024×1024 pixels'}
                      </div>
                      
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          placeholder={language === 'zh' ? '描述你想要的图片...' : 'Describe the image you want...'}
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none"
                          value={aiImagePrompt}
                          onChange={(e) => setAiImagePrompt(e.target.value)}
                          disabled={isGeneratingAiImage}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && aiImagePrompt.trim()) {
                              e.preventDefault();
                              handleGenerateAiImage();
                            }
                          }}
                        />
                        <button
                          onClick={handleGenerateAiImage}
                          disabled={!aiImagePrompt.trim() || isGeneratingAiImage || credits < 10}
                          className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed rounded-lg text-xs text-white font-bold transition flex items-center gap-1.5"
                        >
                          {isGeneratingAiImage ? (
                            <>
                              <i className="fa-solid fa-circle-notch fa-spin"></i>
                              <span>{language === 'zh' ? '生成中' : 'Generating'}</span>
                            </>
                          ) : (
                            <>
                              <i className="fa-solid fa-sparkles"></i>
                              <span>{language === 'zh' ? '生成' : 'Generate'}</span>
                            </>
                          )}
                        </button>
                      </div>
                      
                      {/* Generated Image Preview */}
                      {generatedAiImage && (
                        <div className="mt-3 space-y-2">
                          <div className="text-[10px] text-zinc-400 mb-1">
                            {language === 'zh' ? '生成结果：' : 'Generated:'}
                          </div>
                          <div className="relative aspect-square max-w-[200px] mx-auto rounded-lg overflow-hidden border border-cyan-500/30 bg-zinc-900">
                            <img 
                              src={generatedAiImage} 
                              alt="AI Generated" 
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={handleGenerateAiImage}
                              disabled={isGeneratingAiImage || credits < 10}
                              className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-lg text-[10px] text-white transition flex items-center gap-1"
                            >
                              <i className="fa-solid fa-rotate"></i>
                              {language === 'zh' ? '重新生成' : 'Regenerate'}
                            </button>
                            <button
                              onClick={handleApplyAiImage}
                              disabled={isUploadingImage}
                              className="px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed rounded-lg text-[10px] text-white font-bold transition flex items-center gap-1"
                            >
                              {isUploadingImage ? (
                                <>
                                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                                  {language === 'zh' ? '应用中' : 'Applying'}
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-check"></i>
                                  {language === 'zh' ? '应用替换' : 'Apply'}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Uploaded Images List */}
                    {userUploadedImages && (
                      <div className="bg-black/30 border border-white/5 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] text-zinc-500">
                            {language === 'zh'
                              ? `我上传的图片（${userUploadedImages.length}）`
                              : `My uploaded images (${userUploadedImages.length})`}
                          </div>
                          <button
                            onClick={loadUserUploadedImages}
                            disabled={isLoadingUserUploadedImages}
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition"
                          >
                            {language === 'zh' ? '刷新' : 'Refresh'}
                          </button>
                        </div>

                        {userUploadedImages.length === 0 ? (
                          <div className="text-[10px] text-zinc-600 py-2 text-center">
                            {language === 'zh' ? '暂无已上传图片' : 'No uploaded images'}
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                            {userUploadedImages.map((img) => (
                              <div
                                key={img.path}
                                className="relative rounded-lg overflow-hidden border border-white/5 bg-zinc-900 group"
                              >
                                <img
                                  src={`${img.publicUrl}?t=${encodeURIComponent(img.path)}`}
                                  alt="Uploaded"
                                  className="w-full h-16 object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <button
                                  onClick={() => deleteUserUploadedImage(img.path)}
                                  className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                  title={language === 'zh' ? '删除' : 'Delete'}
                                >
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1">
                                  <div className="text-[9px] text-zinc-300 truncate font-mono">
                                    {img.bytes ? formatMB(img.bytes) : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Or use URL */}
                    <div className="relative">
                      <div className="text-[10px] text-zinc-500 mb-1.5">{language === 'zh' ? '或输入图片URL：' : 'Or enter URL:'}</div>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="https://..."
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none"
                          value={quickEditImageUrl}
                          onChange={(e) => setQuickEditImageUrl(e.target.value)}
                        />
                        <button
                          onClick={() => {
                            if (quickEditImageUrl.trim()) {
                              applyQuickImageEdit(quickEditImageUrl.trim());
                            }
                          }}
                          disabled={!quickEditImageUrl.trim() || isUploadingImage}
                          className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg text-xs text-white font-bold transition"
                        >
                          {language === 'zh' ? '应用' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Edit: Color Picker */}
                {quickEditMode === 'color' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fa-solid fa-palette text-emerald-500"></i>
                        {language === 'zh' ? '选择颜色' : 'Select Color'}
                      </label>
                      <button 
                        onClick={() => setQuickEditMode('none')}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition"
                      >
                        <i className="fa-solid fa-arrow-left"></i>
                        {language === 'zh' ? '返回' : 'Back'}
                      </button>
                    </div>
                    
                    {/* Color Type Selector - More compact */}
                    {availableColorTypes.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-zinc-500">{language === 'zh' ? '颜色类型：' : 'Type:'}</div>
                        <div className="flex gap-1 p-1 bg-black/40 rounded-lg border border-white/5">
                          {availableColorTypes.length > 1 && (
                            <button
                              onClick={() => setQuickEditColorType('all')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition ${quickEditColorType === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            >
                              {language === 'zh' ? '全部' : 'All'}
                            </button>
                          )}
                          {availableColorTypes.includes('bg') && (
                            <button
                              onClick={() => setQuickEditColorType('bg')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition flex items-center justify-center gap-1 ${quickEditColorType === 'bg' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            >
                              <i className="fa-solid fa-fill-drip text-[9px]"></i>
                              {language === 'zh' ? '背景' : 'BG'}
                            </button>
                          )}
                          {availableColorTypes.includes('text') && (
                            <button
                              onClick={() => setQuickEditColorType('text')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition flex items-center justify-center gap-1 ${quickEditColorType === 'text' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            >
                              <i className="fa-solid fa-font text-[9px]"></i>
                              {language === 'zh' ? '文字' : 'Text'}
                            </button>
                          )}
                          {availableColorTypes.includes('border') && (
                            <button
                              onClick={() => setQuickEditColorType('border')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition flex items-center justify-center gap-1 ${quickEditColorType === 'border' ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            >
                              <i className="fa-solid fa-border-all text-[9px]"></i>
                              {language === 'zh' ? '边框' : 'Border'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2.5">
                      {/* Color picker - More compact */}
                      <div className="flex gap-3 items-start">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="relative group">
                            <input
                              type="color"
                              value={quickEditColor}
                              onChange={(e) => setQuickEditColor(e.target.value)}
                              className="w-12 h-12 rounded-xl border-2 border-zinc-600 cursor-pointer bg-transparent p-0.5 hover:border-emerald-500 transition"
                            />
                            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 pointer-events-none"></div>
                          </div>
                          <span className="text-[9px] text-zinc-400 font-mono uppercase">{quickEditColor}</span>
                        </div>
                        <div className="flex-1 space-y-2">
                          {/* Quick presets - Common colors */}
                          <div>
                            <div className="text-[9px] text-zinc-500 mb-1.5">{language === 'zh' ? '常用' : 'Common'}</div>
                            <div className="grid grid-cols-8 gap-1.5">
                              {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
                                '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#ffffff', '#000000'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => setQuickEditColor(color)}
                                  className={`w-5 h-5 rounded-md border transition-all ${quickEditColor === color ? 'border-white ring-2 ring-emerald-500 scale-110 z-10' : 'border-zinc-700 hover:border-zinc-400 hover:scale-105'}`}
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ))}
                            </div>
                          </div>
                          {/* Grayscale */}
                          <div>
                            <div className="text-[9px] text-zinc-500 mb-1.5">{language === 'zh' ? '灰度' : 'Gray'}</div>
                            <div className="grid grid-cols-10 gap-1.5">
                              {['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155',
                                '#1e293b', '#0f172a'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => setQuickEditColor(color)}
                                  className={`w-5 h-5 rounded-md border transition-all ${quickEditColor === color ? 'border-white ring-2 ring-emerald-500 scale-110 z-10' : 'border-zinc-700 hover:border-zinc-400 hover:scale-105'}`}
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Custom hex input */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">#</div>
                          <input
                            type="text"
                            value={quickEditColor.replace('#', '')}
                            onChange={(e) => {
                              const val = '#' + e.target.value.replace('#', '');
                              if (val.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                                setQuickEditColor(val);
                              }
                            }}
                            placeholder="3b82f6"
                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-6 pr-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        clearAppCache();
                        applyQuickColorEdit(quickEditColor);
                      }}
                      disabled={!quickEditColor.match(/^#[0-9A-Fa-f]{6}$/)}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 border border-emerald-500/50"
                    >
                      <i className="fa-solid fa-check text-[10px]"></i>
                      {language === 'zh' ? '应用更改' : 'Apply Changes'}
                    </button>
                  </div>
                )}

                {/* Quick Edit: Text Input */}
                {quickEditMode === 'text' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fa-solid fa-font text-emerald-500"></i>
                        {language === 'zh' ? '编辑文字' : 'Edit Text'}
                      </label>
                      <button 
                        onClick={() => setQuickEditMode('none')}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition"
                      >
                        <i className="fa-solid fa-arrow-left"></i>
                        {language === 'zh' ? '返回' : 'Back'}
                      </button>
                    </div>
                    <textarea
                      value={quickEditText}
                      onChange={(e) => setQuickEditText(e.target.value)}
                      placeholder={language === 'zh' ? '输入新文字...' : 'Enter new text...'}
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm min-h-[100px] resize-none leading-relaxed"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        clearAppCache();
                        applyQuickTextEdit(quickEditText);
                      }}
                      disabled={!quickEditText.trim()}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 border border-emerald-500/50"
                    >
                      <i className="fa-solid fa-check text-[10px]"></i>
                      {language === 'zh' ? '应用更改' : 'Apply Changes'}
                    </button>
                  </div>
                )}

                {/* AI Edit Section - Only show when not in quick edit mode */}
                {quickEditMode === 'none' && (
                  <>
                    {/* Divider if quick edit was available */}
                    {detectQuickEditType(selectedElement) !== 'none' && (
                      <div className="flex items-center gap-3 py-1">
                        <div className="flex-1 h-px bg-white/5"></div>
                        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                          {language === 'zh' ? '或使用 AI' : 'Or use AI'}
                        </span>
                        <div className="flex-1 h-px bg-white/5"></div>
                      </div>
                    )}

                {/* Intent Selector */}
                <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2.5">
                        {language === 'zh' ? '修改类型' : 'Modification Type'}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'auto', icon: 'fa-wand-magic-sparkles', label: language === 'zh' ? '自动' : 'Auto' },
                            { id: 'style', icon: 'fa-palette', label: language === 'zh' ? '样式' : 'Style' },
                            { id: 'content', icon: 'fa-font', label: language === 'zh' ? '内容' : 'Content' },
                            { id: 'logic', icon: 'fa-code', label: language === 'zh' ? '逻辑' : 'Logic' }
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setEditIntent(type.id as any)}
                                className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                                    editIntent === type.id 
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20 ring-1 ring-indigo-400/50' 
                                    : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 hover:border-white/10'
                                }`}
                            >
                                <i className={`fa-solid ${type.icon} text-xs ${editIntent === type.id ? 'animate-pulse' : ''}`}></i>
                                <span className="text-[9px] font-bold">{type.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                
                {/* Input */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2.5">
                    {t.create.edit_element_label}
                  </label>
                  <div className="relative group">
                      <textarea
                        value={editRequest}
                        onChange={(e) => setEditRequest(e.target.value)}
                        placeholder={
                            editIntent === 'style' ? (language === 'zh' ? '例如：改为圆角按钮，背景色用蓝色...' : 'E.g. Make it rounded with blue background...') :
                            editIntent === 'content' ? (language === 'zh' ? '例如：把文字改为“提交订单”...' : 'E.g. Change text to "Submit Order"...') :
                            editIntent === 'logic' ? (language === 'zh' ? '例如：点击后弹出一个提示框...' : 'E.g. Show an alert on click...') :
                            t.create.edit_element_placeholder
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-h-[80px] resize-none text-xs leading-relaxed transition-all group-hover:border-white/20"
                      />
                      <div className="absolute bottom-2 right-2.5 text-[9px] text-zinc-600 font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                        {editRequest.length} chars
                      </div>
                  </div>
                </div>
                  </>
                )}
            </div>
            
            {/* Footer - Only show for AI edit */}
            {quickEditMode === 'none' && (
              <div className="px-4 py-3 border-t border-white/10 bg-white/5 flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-xs transition-colors border border-white/5 hover:border-white/10"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => {
                  clearAppCache();
                  handleElementEditSubmit();
                }}
                disabled={!editRequest.trim()}
                className="flex-[2] px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group border border-indigo-500/50"
              >
                <i className="fa-solid fa-wand-magic-sparkles text-[10px] group-hover:animate-pulse"></i>
                {t.create.btn_generate_edit}
              </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showMobilePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center relative">
            <button 
              onClick={() => setShowMobilePreview(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={24} />
            </button>
            
            <h3 className="text-xl font-bold text-slate-900 mb-2">{t.create.mobile_preview_title}</h3>
            <p className="text-sm text-slate-500 mb-6 text-center">
              {t.create.mobile_preview_desc}
            </p>
            
            <div className="bg-white p-2 rounded-xl border-2 border-slate-100 shadow-inner mb-6">
              <QRCodeSVG 
                value={mobilePreviewUrl} 
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full">
              <i className="fa-solid fa-clock"></i> {t.create.link_validity}
            </div>
          </div>
        </div>
      )}

      {/* Backend Explanation Modal */}
      {showBackendExplanation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl p-0 max-w-md w-full shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-white/5">
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-white/5">
                <button 
                  onClick={() => setShowBackendExplanation(false)}
                  className="absolute top-4 right-4 text-zinc-400 hover:text-white transition"
                >
                  <X size={20} />
                </button>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-900/20 ring-1 ring-white/10">
                    <i className="fa-solid fa-server text-xl text-white"></i>
                </div>
                <h3 className="text-xl font-bold text-white mb-1">
                    {language === 'zh' ? '一键配置表单' : 'One-click Form Config'}
                </h3>
                <p className="text-sm text-zinc-400">
                    {language === 'zh' ? '为你的应用注入灵魂，让它“活”起来' : 'Inject soul into your app, make it alive'}
                </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
                {/* Feature 1 */}
                <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                        <i className="fa-solid fa-database text-blue-400 text-sm"></i>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-zinc-200 mb-1">
                            {language === 'zh' ? '自动数据存储' : 'Auto Data Storage'}
                        </h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            {language === 'zh' 
                                ? '无需编写后端代码，自动创建数据库表，保存用户提交的表单、留言、投票等数据。' 
                                : 'No backend code needed. Automatically creates database tables to save forms, comments, votes, etc.'}
                        </p>
                    </div>
                </div>

                {/* Feature 2 */}
                <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/20">
                        <i className="fa-solid fa-bolt text-purple-400 text-sm"></i>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-zinc-200 mb-1">
                            {language === 'zh' ? '用户交互收集' : 'User Interaction'}
                        </h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            {language === 'zh' 
                                ? '连接你与用户。轻松收集用户反馈、预约申请，在后台统一管理。' 
                                : 'Connect with users. Collect feedback and reservations, managed in one place.'}
                        </p>
                    </div>
                </div>

                {/* Use Cases */}
                <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 block">
                        {language === 'zh' ? '适用场景' : 'USE CASES'}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { icon: 'fa-clipboard-list', label: language === 'zh' ? '问卷/报名' : 'Surveys/Sign-ups' },
                            { icon: 'fa-paper-plane', label: language === 'zh' ? '意见/反馈' : 'Feedback/Suggestions' },
                            { icon: 'fa-calendar-check', label: language === 'zh' ? '预约/登记' : 'Reservations' }
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
                                <i className={`fa-solid ${item.icon} text-zinc-500`}></i>
                                {item.label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Important Notice */}
                <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                    <div className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                            <i className="fa-solid fa-triangle-exclamation text-amber-400 text-xs"></i>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-amber-300 mb-1">
                                {language === 'zh' ? '配置前提' : 'Prerequisite'}
                            </h4>
                            <p className="text-xs text-amber-200/70 leading-relaxed">
                                {language === 'zh' 
                                    ? '请确保你的应用中已设计明确的「提交」「预约」「登记」「反馈」等按钮，否则配置可能失败。' 
                                    : 'Ensure your app has clear "Submit", "Reserve", "Register", or "Feedback" buttons, otherwise configuration may fail.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 pt-0 flex gap-3">
                <button
                    onClick={() => setShowBackendExplanation(false)}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-bold text-sm transition border border-white/5 hover:border-white/10"
                >
                    {language === 'zh' ? '我再想想' : 'Cancel'}
                </button>
                <button
                    onClick={() => {
                        setShowBackendExplanation(false);
                        handleConfigureBackend();
                    }}
                    className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm transition shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 border border-emerald-500/20"
                >
                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                    {language === 'zh' ? '开始配置' : 'Start Configuration'}
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};