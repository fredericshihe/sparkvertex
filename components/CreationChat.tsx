import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AIWorkflowProgress, WorkflowStage, StageDetails } from './AIWorkflowProgress';
import { RefreshCw, Wand2 } from 'lucide-react';
import { useModal } from '@/context/ModalContext';

interface Message {
  role: 'user' | 'ai';
  content: string;
  type?: 'error' | 'normal' | 'text';
  cost?: number;
  errorDetails?: any;
  isBlankScreen?: boolean;
}

interface CreationChatProps {
  chatHistory: Message[];
  isGenerating: boolean;
  workflowStage: WorkflowStage;
  workflowDetails: StageDetails;
  chatInput: string;
  setChatInput: (value: string) => void;
  startGeneration: (isModificationArg?: boolean, overridePrompt?: string, displayPrompt?: string, forceFull?: boolean, explicitType?: any) => void;
  handleCancelGeneration: (cost: number) => void;
  handleFixError: (error: string, details: any) => void;
  handleBlankScreenFix: (errorDetails?: any) => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  t: any;
  language: 'zh' | 'en';
  credits: number;
  isCreditAnimating: boolean;
  isFromUpload: boolean;
  currentGenerationPrompt: string;
  handleExit: () => void;
  activeMobileTab: string;
  handleFullRepair: () => void;
  fullCodeMode: boolean; // 🆕 全量修改模式开关状态
  setFullCodeMode: (value: boolean) => void; // 🆕 全量修改模式设置函数
  selectedModel: string;
  setSelectedModel: (model: any) => void;
  MODEL_CONFIG: any;
  setShowHistoryModal?: (show: boolean) => void;
  handleDownload?: () => void;
  generatedCode?: string;
}

export const CreationChat: React.FC<CreationChatProps> = ({
  chatHistory,
  isGenerating,
  workflowStage,
  workflowDetails,
  chatInput,
  setChatInput,
  startGeneration,
  handleCancelGeneration,
  handleFixError,
  handleBlankScreenFix,
  chatEndRef,
  t,
  language,
  credits,
  isCreditAnimating,
  isFromUpload,
  currentGenerationPrompt,
  handleExit,
  activeMobileTab,
  handleFullRepair,
  fullCodeMode,
  setFullCodeMode,
  selectedModel,
  setSelectedModel,
  MODEL_CONFIG,
  setShowHistoryModal,
  handleDownload,
  generatedCode
}) => {
  const { openConfirmModal } = useModal();

  // Resize logic
  const [sidebarWidth, setSidebarWidth] = useState(450);
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    // Initial check
    if (typeof window !== 'undefined') {
        checkDesktop();
        window.addEventListener('resize', checkDesktop);
    }
    return () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', checkDesktop);
        }
    };
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = e.clientX;
        if (newWidth >= 400 && newWidth <= 800) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  // 🆕 Auto-scroll when AI bubble appears or updates
  useEffect(() => {
    if ((isGenerating || workflowStage === 'completed') && chatEndRef.current) {
      // Immediate scroll to ensure visibility when it pops up
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
      
      // Scroll again after a short delay to account for animation/layout shifts
      const timer = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [isGenerating, workflowStage]);
  
  return (
    <div 
      className={`w-full border-r border-white/5 bg-slate-950 flex flex-col 
        order-2 lg:order-1 
        h-full shrink-0 z-10 relative shadow-[0_-4px_20px_rgba(0,0,0,0.3)] lg:shadow-none
        ${activeMobileTab === 'chat' ? 'flex pb-[80px] lg:pb-0' : 'hidden lg:flex'}
      `}
      style={{ width: isDesktop ? sidebarWidth : '100%' }}
    >
      {/* Resize Handle */}
      <div
        className="hidden lg:block absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-50 active:bg-blue-500 group"
        onMouseDown={startResizing}
      >
        {/* Visual Indicator Line */}
        <div className={`absolute right-0 top-0 bottom-0 w-[1px] bg-white/10 group-hover:bg-blue-500/50 transition-colors ${isResizing ? 'bg-blue-500' : ''}`} />
      </div>
      
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-950/80 backdrop-blur-md shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExit} 
            className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition border border-slate-700 group" 
            title={t.common.back}
          >
            <i className="fa-solid fa-chevron-left text-xs group-hover:-translate-x-0.5 transition-transform"></i>
            <span className="text-sm font-medium">{t.common.back || (language === 'zh' ? '返回' : 'Back')}</span>
          </button>
          <h3 className="font-bold text-white text-sm lg:text-base bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            {t.create.preview_title}
          </h3>
        </div>
        
        {/* Credits & Regenerate */}
        <div className="flex items-center gap-2">
           {/* History Button */}
           {setShowHistoryModal && (
             <button 
                onClick={() => setShowHistoryModal(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white"
                title={language === 'zh' ? '历史记录' : 'History'}
             >
                <i className="fa-solid fa-clock-rotate-left text-xs"></i>
             </button>
           )}

           {/* Download Button */}
           {handleDownload && (
             <button 
                onClick={handleDownload}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition border bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white"
                title={language === 'zh' ? '下载源码' : 'Download Code'}
             >
                <i className="fa-solid fa-download text-xs"></i>
             </button>
           )}

           <div className="relative group">
             <button 
                onClick={() => {
                  if (isFromUpload) return;
                  openConfirmModal({
                    title: language === 'zh' ? '确认重新生成' : 'Confirm Regenerate',
                    message: language === 'zh' ? '确定要重新生成吗？这将消耗积分并覆盖当前代码。' : 'Are you sure you want to regenerate? This will consume credits and overwrite current code.',
                    confirmText: language === 'zh' ? '确认' : 'Confirm',
                    onConfirm: () => startGeneration(false, currentGenerationPrompt, '', false, 'regenerate')
                  });
                }}
                disabled={isFromUpload || isGenerating}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition border ${
                  isFromUpload 
                    ? 'bg-slate-800/50 text-slate-500 border-slate-800 cursor-not-allowed' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
                }`}
             >
                <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
             </button>
           </div>
           
           <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 transition-all duration-300 ${isCreditAnimating ? 'scale-110 border-red-500/50 bg-red-500/10' : ''}`}>
             <i className={`fa-solid fa-coins text-xs transition-colors duration-300 ${isCreditAnimating ? 'text-red-500' : 'text-yellow-500'}`}></i>
             <span className={`text-xs font-bold tabular-nums transition-colors duration-300 ${isCreditAnimating ? 'text-red-500' : 'text-slate-200'}`}>
               {Number.isInteger(credits) ? credits : credits.toFixed(2)}
             </span>
           </div>
        </div>
      </div>
      
      {/* Chat History */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 bg-slate-950/50 scroll-smooth custom-scrollbar">
        {/* Initial Message */}
        <div className="flex gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500/20 to-blue-600/20 flex items-center justify-center text-brand-400 flex-shrink-0 border border-brand-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <i className="fa-solid fa-robot text-lg"></i>
          </div>
          <div className="bg-slate-900/60 border border-white/5 p-4 rounded-2xl rounded-tl-none text-sm text-slate-300 shadow-lg backdrop-blur-sm break-words">
            {t.create.app_generated}
          </div>
        </div>

        {chatHistory.map((msg, i) => {
          const isLastMessage = i === chatHistory.length - 1;
          const isSummaryMessage = msg.role === 'ai' && workflowStage === 'completed' && !isGenerating;
          const shouldHide = isLastMessage && isSummaryMessage;

          return (
          <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} transition-all duration-500 ${shouldHide ? 'opacity-0 max-h-0 overflow-hidden' : 'animate-in slide-in-from-bottom-2 fade-in duration-500 opacity-100'}`}>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg transition-transform hover:scale-105 ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-brand-500 to-blue-600 text-white shadow-brand-500/20' 
                  : (msg.type === 'error' ? 'bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-red-500/20' : 'bg-slate-800 border border-slate-700 text-brand-400')
            }`}>
              <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : (msg.type === 'error' ? 'fa-triangle-exclamation' : 'fa-robot')}`}></i>
            </div>
            
            <div className={`p-4 rounded-2xl text-sm max-w-[85%] select-text shadow-lg backdrop-blur-md border transition-all duration-300 break-words overflow-hidden ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-brand-500/10 to-blue-600/10 text-slate-100 rounded-tr-none border-brand-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]' 
                  : (msg.type === 'error' 
                      ? 'bg-gradient-to-br from-red-950/40 to-orange-950/40 border-red-500/30 text-red-100 rounded-tl-none shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
                      : 'bg-slate-900/60 border-white/5 text-slate-300 rounded-tl-none shadow-black/20')
            }`}>
              {msg.type === 'error' ? (
                  <div className="flex flex-col gap-3">
                      <div className="font-bold text-xs uppercase tracking-wider opacity-90 flex items-center gap-2 text-red-300">
                          {msg.isBlankScreen 
                              ? (language === 'zh' ? '白屏检测' : 'Blank Screen Detected')
                              : (language === 'zh' ? '运行时错误' : 'Runtime Error')
                          }
                      </div>
                      <div className="font-mono text-xs break-all bg-black/30 p-3 rounded-lg border border-red-500/10 text-red-200/90 overflow-hidden">
                          {msg.content}
                      </div>
                      <button 
                          onClick={() => msg.isBlankScreen ? handleBlankScreenFix(msg.errorDetails) : handleFixError(msg.content, msg.errorDetails)}
                          className="mt-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all hover:shadow-lg hover:shadow-red-500/20 flex items-center justify-center gap-2 group"
                      >
                          <i className="fa-solid fa-wand-magic-sparkles group-hover:animate-pulse"></i>
                          {language === 'zh' ? 'AI 自动修复' : 'Fix with AI'}
                      </button>
                  </div>
              ) : (
                  <>
                      <div className="whitespace-pre-wrap leading-relaxed break-words">{msg.content}</div>
                      {msg.cost && (
                          <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                              <span className="text-[10px] font-medium text-amber-500/80 flex items-center gap-1.5 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/10">
                                  <i className="fa-solid fa-bolt text-amber-500 text-[9px]"></i>
                                  {language === 'zh' ? `消耗 ${msg.cost} 积分` : `Cost: ${msg.cost} credits`}
                              </span>
                          </div>
                      )}
                  </>
              )}
            </div>
          </div>
          );
        })}
        
        {/* AI Workflow Progress */}
        {(isGenerating || workflowStage === 'completed') && (
          <div className={`flex gap-4 transition-all duration-500 ease-in-out ${workflowStage === 'completed' && !isGenerating ? 'opacity-0 max-h-0 overflow-hidden translate-y-4' : 'animate-in slide-in-from-bottom-4 fade-in duration-700 max-h-[800px] opacity-100'}`}>
            <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-lg">
              <i className="fa-solid fa-robot fa-bounce"></i>
            </div>
            <div className="flex-1 min-w-0">
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-1 shadow-xl backdrop-blur-sm">
                  <AIWorkflowProgress 
                      stage={workflowStage}
                      details={workflowDetails}
                      isGenerating={isGenerating}
                      language={language}
                      variant="chat"
                      skipCompression={fullCodeMode}
                  />
                </div>
                {isGenerating && (
                  <button
                      onClick={() => handleCancelGeneration(0)}
                      className="mt-3 px-4 py-2 bg-slate-800/50 hover:bg-red-900/20 border border-slate-700 hover:border-red-500/30 rounded-xl text-xs text-slate-400 hover:text-red-400 transition-all flex items-center gap-2 group ml-1"
                  >
                      <div className="w-5 h-5 rounded-full bg-slate-700 group-hover:bg-red-500/20 flex items-center justify-center transition-colors">
                          <i className="fa-solid fa-xmark text-[10px]"></i>
                      </div>
                      <span>{language === 'zh' ? '取消生成' : 'Cancel Generation'}</span>
                  </button>
                )}
            </div>
          </div>
        )}
        
        <div ref={chatEndRef}></div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5 bg-slate-950/80 backdrop-blur-md shrink-0 lg:mb-0 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-20">
        {/* Model Selector & Tools */}
        <div className="flex justify-between items-center mb-3 gap-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <div className="flex bg-slate-900/50 p-1 rounded-lg border border-white/5">
              {(Object.entries(MODEL_CONFIG) as [string, any][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setSelectedModel(key)}
                  disabled={isGenerating}
                  className={`text-[10px] px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    selectedModel === key
                      ? 'bg-gradient-to-r from-brand-600 to-blue-600 text-white shadow-lg shadow-brand-500/20 font-medium'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  } disabled:opacity-50`}
                >
                  <span>{config.icon}</span>
                  <span className="hidden sm:inline">{config.description}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* 🆕 全量修改模式开关 */}
          <button
              onClick={() => {
                if (!fullCodeMode) {
                  // 开启时显示确认提示
                  const confirmMsg = language === 'zh' 
                    ? `开启「全量修改」模式？\n\n✅ 优点：\n• AI 获得完整代码上下文，修改更精准\n• 避免因代码压缩导致的补丁失败\n• 适合复杂的结构性修改\n\n⚠️ 注意：\n• 积分消耗会增加 1.5 倍左右\n• 建议在普通模式失败后再开启`
                    : `Enable "Full Code" mode?\n\n✅ Benefits:\n• AI gets complete code context for precise edits\n• Avoids patch failures from code compression\n• Better for complex structural changes\n\n⚠️ Note:\n• Credit cost increases ~1.5x\n• Recommended when normal mode fails`;
                  
                  openConfirmModal({
                    title: language === 'zh' ? '开启全量模式' : 'Enable Full Code Mode',
                    message: confirmMsg,
                    confirmText: language === 'zh' ? '确认开启' : 'Enable',
                    onConfirm: () => setFullCodeMode(true)
                  });
                } else {
                  setFullCodeMode(false);
                }
              }}
              disabled={isGenerating}
              className={`text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border whitespace-nowrap group ${
                fullCodeMode 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/10' 
                  : 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-slate-300 border-white/5 hover:border-white/10'
              } disabled:opacity-50`}
              title={language === 'zh' 
                ? (fullCodeMode ? '点击关闭全量修改模式' : '开启后AI获得完整代码，修改更精准但消耗更多积分') 
                : (fullCodeMode ? 'Click to disable Full Code mode' : 'Enable for complete code context, uses more credits')}
          >
              {/* 开关图标 */}
              <div className={`w-6 h-3.5 rounded-full relative transition-colors ${fullCodeMode ? 'bg-amber-500' : 'bg-slate-600'}`}>
                <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${fullCodeMode ? 'left-3' : 'left-0.5'}`}></div>
              </div>
              <span className="hidden sm:inline">{language === 'zh' ? '全量模式' : 'Full Code'}</span>
              {fullCodeMode && <i className="fa-solid fa-bolt text-amber-400 text-[8px]"></i>}
          </button>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/20 to-blue-500/20 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur"></div>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isGenerating && chatInput.trim()) {
                startGeneration(true, '', '', false, 'chat');
              }
            }}
            placeholder={t.create.chat_placeholder}
            disabled={isGenerating}
            className="relative w-full bg-slate-900/80 border border-white/10 rounded-xl pl-4 pr-12 py-3.5 text-sm text-slate-200 focus:border-brand-500/50 focus:bg-slate-900 focus:text-white outline-none disabled:opacity-50 transition-all placeholder-slate-600 shadow-inner"
          />
          <button 
            onClick={() => {
              if (!chatInput.trim() || isGenerating) return;
              startGeneration(true, '', '', false, 'chat');
            }}
            disabled={isGenerating || !chatInput.trim()}
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                !chatInput.trim() || isGenerating 
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-brand-500 to-blue-600 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-105'
            }`}
          >
            {isGenerating ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane text-xs"></i>}
          </button>
        </div>
      </div>
    </div>
  );
};
