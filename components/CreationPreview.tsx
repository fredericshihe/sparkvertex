import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';

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
  handleMobilePreview: () => void;
  toggleEditMode: () => void;
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
  handleMobilePreview,
  toggleEditMode,
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
  editIntent,
  setEditIntent,
  editRequest,
  setEditRequest,
  handleElementEditSubmit,
  showMobilePreview,
  setShowMobilePreview,
  mobilePreviewUrl,
  generatedCode,
  historyPanelRef
}) => {
  return (
    <div className={`flex-1 bg-slate-950 relative flex flex-col group 
        order-1 lg:order-2 
        h-full shrink-0 overflow-hidden
        ${activeMobileTab === 'preview' ? 'flex' : 'hidden lg:flex'}
    `}>
        <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={handleExit} className="lg:hidden flex w-6 h-6 items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition" title={t.common.back}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span className="text-sm font-bold text-slate-400">{t.create.preview_mode}</span>
            
            {/* Full Screen Button */}
            <button 
              onClick={toggleFullScreen}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title={language === 'zh' ? (isFullscreen ? '退出全屏' : '全屏预览') : (isFullscreen ? 'Exit Full Screen' : 'Full Screen')}
            >
              <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSaveDraft}
              disabled={isSaving}
              className={`px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
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
          className="flex-1 relative overflow-hidden flex items-center justify-center bg-[url('/grid.svg')] bg-center pb-16 lg:pb-0"
        >
          {/* Quick Edit History Panel - Right side of preview (persistent, collapsible) */}
          {quickEditHistory.length > 0 && (
            <div 
              ref={historyPanelRef}
              className={`absolute right-2 top-2 z-20 transition-all duration-300 ${isHistoryPanelOpen ? 'bottom-20 lg:bottom-2' : ''}`}
            >
              {isHistoryPanelOpen ? (
                <div className="w-48 h-full bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5">
                  {/* Header */}
                  <div className="px-3 py-2.5 border-b border-slate-700/50 flex items-center justify-between shrink-0 bg-slate-800/30">
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
                            ? 'text-slate-300 hover:bg-slate-700 hover:text-white' 
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
                            ? 'text-slate-300 hover:bg-slate-700 hover:text-white' 
                            : 'text-slate-600 cursor-not-allowed'
                        }`}
                        title={language === 'zh' ? '重做' : 'Redo'}
                      >
                        <i className="fa-solid fa-rotate-right"></i>
                      </button>
                      <div className="w-px h-3 bg-slate-700/50 mx-0.5"></div>
                      <button
                        onClick={() => setIsHistoryPanelOpen(false)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center transition text-[10px] text-slate-400 hover:bg-slate-700 hover:text-white"
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
                          className={`text-[10px] px-2.5 py-2 rounded-lg flex items-center gap-2.5 cursor-pointer transition-all group ${
                            isCurrent 
                              ? 'bg-brand-500/10 text-brand-300 border border-brand-500/30 shadow-sm' 
                              : isPast 
                                ? 'text-slate-400 bg-slate-800/40 hover:bg-slate-800/80 border border-transparent hover:border-slate-700/50' 
                                : 'text-slate-500 hover:bg-slate-800/40 border border-transparent'
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
                            isCurrent ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'
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
                  className="w-10 h-10 bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-2xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition ring-1 ring-white/5 group"
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
            className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-2xl overflow-hidden relative bg-slate-900 flex-shrink-0 origin-center
              ${(previewMode === 'mobile')
                ? 'w-[375px] h-[812px] rounded-[3rem] border-[8px] border-slate-800 ring-1 ring-slate-700/50' 
                : ''}
              ${(previewMode === 'tablet')
                ? 'w-[768px] h-[1024px] rounded-[2rem] border-[12px] border-slate-800 ring-1 ring-slate-700/50' 
                : ''}
              ${(previewMode === 'desktop')
                ? 'w-full h-full rounded-none border-0' 
                : ''}
            `}
            style={{
              transform: (previewMode !== 'desktop') ? `scale(${previewScale})` : 'none'
            }}
          >
             {(previewMode === 'mobile' && !isFullscreen) && (
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-slate-800 rounded-b-2xl z-20 pointer-events-none"></div>
             )}
             
             <iframe
               ref={iframeRef}
               srcDoc={getPreviewContent(generatedCode, { raw: true })}
               className="w-full h-full bg-slate-900"
               sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
             />
          </div>
          
          {/* Floating Preview Controls */}
          <div className="absolute bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10 w-max max-w-full px-4">
            {runtimeError && (
               <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-max max-w-[90vw] animate-bounce-in">
                 <div className="bg-red-500/90 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-2xl border border-red-400 flex items-center gap-3">
                   <i className="fa-solid fa-triangle-exclamation text-xl animate-pulse"></i>
                   <div className="flex flex-col">
                     <span className="text-xs font-bold uppercase opacity-80">{language === 'zh' ? '检测到错误' : 'Error Detected'}</span>
                     <span className="text-sm font-mono max-w-[200px] truncate" title={runtimeError}>{runtimeError}</span>
                   </div>
                   <div className="h-8 w-px bg-white/20 mx-1"></div>
                   <button 
                     onClick={() => handleFixError()}
                     className="bg-white text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 transition flex items-center gap-1 whitespace-nowrap shadow-sm"
                   >
                     <i className="fa-solid fa-wand-magic-sparkles"></i>
                     {language === 'zh' ? 'AI 修复' : 'Fix with AI'}
                   </button>
                   <button 
                     onClick={() => setRuntimeError(null)}
                     className="text-white/70 hover:text-white transition"
                   >
                     <X size={16} />
                   </button>
                 </div>
               </div>
            )}

            <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-full p-1.5 flex shadow-2xl">
              <button onClick={() => setPreviewMode('desktop')} className={`w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition ${previewMode === 'desktop' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title={t.devices.desktop}><i className="fa-solid fa-desktop text-xs lg:text-sm"></i></button>
              <button onClick={() => setPreviewMode('tablet')} className={`w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition ${previewMode === 'tablet' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title={t.devices.tablet}><i className="fa-solid fa-tablet-screen-button text-xs lg:text-sm"></i></button>
              <button onClick={() => setPreviewMode('mobile')} className={`w-9 h-9 lg:w-11 lg:h-11 rounded-full flex items-center justify-center transition ${previewMode === 'mobile' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`} title={t.devices.mobile}><i className="fa-solid fa-mobile-screen text-xs lg:text-sm"></i></button>
            </div>

            <div className="w-px h-8 bg-slate-700/50 mx-1"></div>

            <button 
                onClick={handleMobilePreview}
                className="w-11 h-11 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition hover:bg-slate-800 shadow-xl group" 
                title={t.create.mobile_preview}
            >
                <i className="fa-solid fa-qrcode text-sm group-hover:scale-110 transition"></i>
            </button>

            <button 
                onClick={toggleEditMode}
                className={`h-11 px-5 rounded-full flex items-center gap-2.5 font-bold transition-all shadow-xl border ${
                    isEditMode 
                    ? 'bg-gradient-to-r from-brand-600 to-purple-600 border-transparent text-white ring-2 ring-brand-500/30 scale-105' 
                    : 'bg-slate-900/90 backdrop-blur-md border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-600 group'
                }`}
            >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isEditMode ? 'bg-white/20' : 'bg-brand-500/20 group-hover:bg-brand-500/30'}`}>
                    <i className={`fa-solid ${isEditMode ? 'fa-check text-white' : 'fa-arrow-pointer text-brand-400'} ${isEditMode ? '' : 'animate-pulse'}`}></i>
                </div>
                <span className="text-sm whitespace-nowrap">{isEditMode ? t.create.finish_edit : t.create.edit_mode}</span>
            </button>

            {/* Quick Edit Undo/Redo Buttons - Only show when in edit mode and has history */}
            {isEditMode && quickEditHistory.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-full px-2 py-1 shadow-xl">
                <button
                  onClick={quickEditUndo}
                  disabled={!canQuickEditUndo}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                    canQuickEditUndo 
                      ? 'text-slate-300 hover:text-white hover:bg-slate-700' 
                      : 'text-slate-600 cursor-not-allowed'
                  }`}
                  title={language === 'zh' ? `撤销 (${quickEditHistoryIndex + 1})` : `Undo (${quickEditHistoryIndex + 1})`}
                >
                  <i className="fa-solid fa-rotate-left text-sm"></i>
                </button>
                <span className="text-xs text-slate-500 px-1">{quickEditHistoryIndex + 1}/{quickEditHistory.length}</span>
                <button
                  onClick={quickEditRedo}
                  disabled={!canQuickEditRedo}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
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
            <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-white animate-fade-in">
                <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-2xl flex flex-col items-center max-w-xs text-center">
                  {/* Dynamic Icon based on mode */}
                  <div className="relative mb-4">
                     <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                     <div className="absolute inset-0 flex items-center justify-center">
                        <i className={`fa-solid ${step === 'preview' ? 'fa-wand-magic-sparkles' : 'fa-robot'} text-brand-500 text-xs animate-pulse`}></i>
                     </div>
                  </div>
                  
                  <p className="font-bold text-lg text-white">
                    {step === 'preview' 
                        ? (language === 'zh' ? '正在优化应用...' : 'Refining App...') 
                        : t.create.generating_title}
                  </p>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                    {step === 'preview'
                        ? (language === 'zh' ? 'AI 正在根据您的反馈调整代码，请稍候...' : 'AI is adjusting the code based on your feedback, please wait...')
                        : t.create.generating_subtitle}
                  </p>
                </div>
            </div>
          )}

      {showEditModal && selectedElement && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 pt-12 overflow-y-auto animate-fade-in">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden my-auto ring-1 ring-white/10">
            {/* Header - More compact */}
            <div className="px-4 py-3 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30">
              <h3 className="text-sm font-bold text-white flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400 shadow-inner shadow-brand-500/10">
                    <i className="fa-solid fa-pen-to-square text-xs"></i>
                </div>
                {t.create.edit_element_title}
              </h3>
              <button onClick={() => { setShowEditModal(false); setQuickEditMode('none'); }} className="text-slate-400 hover:text-white transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700/50">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
                {/* Context Card - More compact */}
                <div className="bg-slate-950/50 rounded-xl p-3.5 border border-slate-800/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-50 group-hover:opacity-100 transition">
                     <span className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-700/50">
                        {selectedElement.tagName.toLowerCase()}
                     </span>
                  </div>
                  
                  <div className="space-y-2.5">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
                            <i className="fa-solid fa-crosshairs text-[9px]"></i> {t.create.edit_element_selected}
                        </div>
                        <div className="font-mono text-xs text-brand-300 break-all bg-brand-500/5 p-1.5 rounded border border-brand-500/10">
                            &lt;{selectedElement.tagName.toLowerCase()} className="..."&gt;
                        </div>
                      </div>
                      
                      {selectedElement.innerText && (
                          <div className="pl-2.5 border-l-2 border-slate-700/50">
                            <div className="text-[10px] text-slate-500 mb-0.5">Content</div>
                            <div className="text-xs text-slate-300 italic line-clamp-2 leading-relaxed">
                                "{selectedElement.innerText.substring(0, 100)}{selectedElement.innerText.length > 100 ? '...' : ''}"
                            </div>
                          </div>
                      )}

                      {selectedElement.parentTagName && (
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-2 border-t border-slate-800/50">
                             <i className="fa-solid fa-level-up-alt fa-rotate-90 text-[9px]"></i>
                             <span>Inside &lt;{selectedElement.parentTagName}&gt;</span>
                          </div>
                      )}
                  </div>
                </div>

                {/* Quick Edit Buttons - Show when applicable */}
                {(detectQuickEditType(selectedElement) !== 'none') && quickEditMode === 'none' && (
                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3.5 relative overflow-hidden">
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
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/20 group"
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
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-900/20 group"
                        >
                          <i className="fa-solid fa-palette text-[10px] group-hover:scale-110 transition-transform"></i>
                          {language === 'zh' ? '改颜色' : 'Color'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Edit: Color Picker */}
                {quickEditMode === 'color' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fa-solid fa-palette text-emerald-500"></i>
                        {language === 'zh' ? '选择颜色' : 'Select Color'}
                      </label>
                      <button 
                        onClick={() => setQuickEditMode('none')}
                        className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
                      >
                        <i className="fa-solid fa-arrow-left"></i>
                        {language === 'zh' ? '返回' : 'Back'}
                      </button>
                    </div>
                    
                    {/* Color Type Selector - More compact */}
                    {availableColorTypes.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-slate-500">{language === 'zh' ? '颜色类型：' : 'Type:'}</div>
                        <div className="flex gap-1 p-1 bg-slate-950/50 rounded-lg border border-slate-800/50">
                          {availableColorTypes.length > 1 && (
                            <button
                              onClick={() => setQuickEditColorType('all')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition ${quickEditColorType === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                            >
                              {language === 'zh' ? '全部' : 'All'}
                            </button>
                          )}
                          {availableColorTypes.includes('bg') && (
                            <button
                              onClick={() => setQuickEditColorType('bg')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition flex items-center justify-center gap-1 ${quickEditColorType === 'bg' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                            >
                              <i className="fa-solid fa-fill-drip text-[9px]"></i>
                              {language === 'zh' ? '背景' : 'BG'}
                            </button>
                          )}
                          {availableColorTypes.includes('text') && (
                            <button
                              onClick={() => setQuickEditColorType('text')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition flex items-center justify-center gap-1 ${quickEditColorType === 'text' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                            >
                              <i className="fa-solid fa-font text-[9px]"></i>
                              {language === 'zh' ? '文字' : 'Text'}
                            </button>
                          )}
                          {availableColorTypes.includes('border') && (
                            <button
                              onClick={() => setQuickEditColorType('border')}
                              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition flex items-center justify-center gap-1 ${quickEditColorType === 'border' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
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
                              className="w-12 h-12 rounded-xl border-2 border-slate-600 cursor-pointer bg-transparent p-0.5 hover:border-emerald-500 transition"
                            />
                            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 pointer-events-none"></div>
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono uppercase">{quickEditColor}</span>
                        </div>
                        <div className="flex-1 space-y-2">
                          {/* Quick presets - Common colors */}
                          <div>
                            <div className="text-[9px] text-slate-500 mb-1.5">{language === 'zh' ? '常用' : 'Common'}</div>
                            <div className="grid grid-cols-8 gap-1.5">
                              {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
                                '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#ffffff', '#000000'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => setQuickEditColor(color)}
                                  className={`w-5 h-5 rounded-md border transition-all ${quickEditColor === color ? 'border-white ring-2 ring-emerald-500 scale-110 z-10' : 'border-slate-700 hover:border-slate-400 hover:scale-105'}`}
                                  style={{ backgroundColor: color }}
                                  title={color}
                                />
                              ))}
                            </div>
                          </div>
                          {/* Grayscale */}
                          <div>
                            <div className="text-[9px] text-slate-500 mb-1.5">{language === 'zh' ? '灰度' : 'Gray'}</div>
                            <div className="grid grid-cols-10 gap-1.5">
                              {['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155',
                                '#1e293b', '#0f172a'].map(color => (
                                <button
                                  key={color}
                                  onClick={() => setQuickEditColor(color)}
                                  className={`w-5 h-5 rounded-md border transition-all ${quickEditColor === color ? 'border-white ring-2 ring-emerald-500 scale-110 z-10' : 'border-slate-700 hover:border-slate-400 hover:scale-105'}`}
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
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">#</div>
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
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-6 pr-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => applyQuickColorEdit(quickEditColor)}
                      disabled={!quickEditColor.match(/^#[0-9A-Fa-f]{6}$/)}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <i className="fa-solid fa-font text-emerald-500"></i>
                        {language === 'zh' ? '编辑文字' : 'Edit Text'}
                      </label>
                      <button 
                        onClick={() => setQuickEditMode('none')}
                        className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
                      >
                        <i className="fa-solid fa-arrow-left"></i>
                        {language === 'zh' ? '返回' : 'Back'}
                      </button>
                    </div>
                    <textarea
                      value={quickEditText}
                      onChange={(e) => setQuickEditText(e.target.value)}
                      placeholder={language === 'zh' ? '输入新文字...' : 'Enter new text...'}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm min-h-[100px] resize-none leading-relaxed"
                      autoFocus
                    />
                    <button
                      onClick={() => applyQuickTextEdit(quickEditText)}
                      disabled={!quickEditText.trim()}
                      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
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
                        <div className="flex-1 h-px bg-slate-800"></div>
                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                          {language === 'zh' ? '或使用 AI' : 'Or use AI'}
                        </span>
                        <div className="flex-1 h-px bg-slate-800"></div>
                      </div>
                    )}

                {/* Intent Selector */}
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
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
                                    ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-900/20 ring-1 ring-brand-400/50' 
                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 hover:border-slate-600'
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
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
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
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-h-[80px] resize-none text-xs leading-relaxed transition-all group-hover:border-slate-600"
                      />
                      <div className="absolute bottom-2 right-2.5 text-[9px] text-slate-600 font-mono bg-slate-900/80 px-1.5 py-0.5 rounded">
                        {editRequest.length} chars
                      </div>
                  </div>
                </div>
                  </>
                )}
            </div>
            
            {/* Footer - Only show for AI edit */}
            {quickEditMode === 'none' && (
              <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30 flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors border border-slate-700 hover:border-slate-600"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleElementEditSubmit}
                disabled={!editRequest.trim()}
                className="flex-[2] px-3 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-all shadow-lg shadow-brand-900/20 flex items-center justify-center gap-2 group"
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
    </div>
    </div>
  );
};