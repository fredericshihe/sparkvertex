import React from 'react';

interface GenerationProgressProps {
  plan: string | null;
  currentStep: string | null;
  isGenerating: boolean;
  language: 'zh' | 'en';
  variant?: 'floating' | 'centered' | 'chat';
  loadingTip?: string;
  streamingCode?: string;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({ 
  plan, 
  currentStep, 
  isGenerating, 
  language, 
  variant = 'floating',
  loadingTip,
  streamingCode
}) => {
  if (!isGenerating && !plan) return null;

  let containerClasses = "";
  let title = language === 'zh' ? 'AI 正在构建您的应用...' : 'AI is building your app...';
  
  switch (variant) {
      case 'floating':
          containerClasses = "fixed bottom-24 right-6 z-50 w-96 bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-5 shadow-2xl text-white transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in";
          break;
      case 'centered':
          containerClasses = "w-full max-w-2xl bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl text-white transition-all duration-300 animate-in fade-in";
          break;
      case 'chat':
          containerClasses = "w-full bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-white transition-all duration-300 animate-in fade-in";
          title = language === 'zh' ? 'AI 正在应用修改...' : 'AI is applying changes...';
          break;
  }

  return (
    <div className={containerClasses}>
      {(!currentStep && !streamingCode) && (
      <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-3">
        <div className="relative">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-ping absolute opacity-75"></div>
            <div className="w-3 h-3 rounded-full bg-blue-500 relative"></div>
        </div>
        <h3 className="font-bold text-sm bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          {title}
        </h3>
      </div>
      )}

      {/* AI Thinking Indicator - Always show if generating AND no plan/step yet */}
      {isGenerating && !plan && !currentStep && !streamingCode && (
        <div className="mb-6 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-blue-500/5 animate-pulse"></div>
             
             <div className="flex items-center gap-3 relative z-10">
                <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce"></div>
                </div>
                <p className="text-sm text-slate-300 font-medium">
                    {loadingTip || (language === 'zh' ? '正在连接 AI 模型...' : 'Connecting to AI model...')}
                </p>
             </div>
        </div>
      )}

      {plan && (
        <div className="mb-4 animate-in fade-in duration-500">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 uppercase tracking-wider font-semibold">
            <i className="fa-solid fa-brain text-purple-400"></i>
            {language === 'zh' ? '需求分析与规划' : 'Analysis & Plan'}
          </div>
          <div className="text-xs text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar bg-black/30 p-3 rounded-lg border border-white/5 font-mono leading-relaxed">
            {plan}
          </div>
        </div>
      )}

      {(currentStep || streamingCode) && (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 uppercase tracking-wider font-semibold">
            <i className="fa-solid fa-code text-blue-400"></i>
            {language === 'zh' ? '当前步骤' : 'Current Step'}
          </div>
          <div className="bg-blue-500/10 rounded-lg border border-blue-500/20 overflow-hidden">
            <div className="flex items-center gap-3 p-3">
                <i className="fa-solid fa-circle-notch fa-spin text-blue-400"></i>
                <span className="text-sm font-medium text-blue-100">
                    {currentStep || (language === 'zh' ? '正在生成代码...' : 'Generating code...')}
                </span>
            </div>
            {streamingCode && (
                <div className="bg-black/20 border-t border-blue-500/10 p-2 h-12 overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/10 via-transparent to-transparent pointer-events-none"></div>
                    <pre className="font-mono text-[9px] text-blue-300/50 whitespace-pre-wrap break-all leading-tight opacity-70">
                        {streamingCode.slice(-200)}
                    </pre>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
