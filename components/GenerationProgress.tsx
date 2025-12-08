import React, { useState, useEffect, useRef } from 'react';

interface GenerationProgressProps {
  plan: string | null;
  currentStep: string | null;
  isGenerating: boolean;
  language: 'zh' | 'en';
  variant?: 'floating' | 'centered' | 'chat';
  loadingTip?: string;
  streamingCode?: string;
}

const SYSTEM_LOGS = [
  { zh: "正在分析修改需求...", en: "Analyzing modification requirements..." },
  { zh: "识别意图：通用修改", en: "Identified intent: General modification" },
  { zh: "正在扫描工作区文件...", en: "Scanning workspace files..." },
  { zh: "分析结果：已定位 14 个核心模块", en: "Analysis result: Located 14 core modules" },
  { zh: "上下文优化：36%", en: "Context optimization: 36%" },
  { zh: "正在构建生成计划...", en: "Building generation plan..." },
  { zh: "正在发送给 AI 大模型进行修改...", en: "Sending to AI model for modification..." },
  { zh: "等待 AI 大模型返回生成结果...", en: "Waiting for AI model response..." }
];

export const GenerationProgress: React.FC<GenerationProgressProps> = ({ 
  plan, 
  currentStep, 
  isGenerating, 
  language, 
  variant = 'floating',
  loadingTip,
  streamingCode
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Reset logs when generation starts
  useEffect(() => {
    if (isGenerating && !plan) {
      setLogs([]);
      let index = 0;
      const interval = setInterval(() => {
        if (index < SYSTEM_LOGS.length) {
          const logEntry = SYSTEM_LOGS[index];
          const message = language === 'zh' ? logEntry.zh : logEntry.en;
          setLogs(prev => [...prev, message]);
          index++;
        } else {
          clearInterval(interval);
        }
      }, 800); // Slower pace for readability
      return () => clearInterval(interval);
    }
  }, [isGenerating, plan, language]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isGenerating && !plan) return null;

  let containerClasses = "";
  let title = language === 'zh' ? 'AI 正在构建您的应用...' : 'AI is building your app...';
  
  switch (variant) {
      case 'floating':
          containerClasses = "fixed bottom-24 right-6 z-50 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-xl p-5 shadow-2xl text-white transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in";
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

      {/* AI Thinking Indicator / System Logs */}
      {isGenerating && !plan && !currentStep && !streamingCode && (
        <div className="mb-6 bg-slate-950/30 rounded-xl p-4 border border-white/5 relative overflow-hidden">
             <div className="flex gap-3">
                {/* Left: Dots */}
                <div className="flex gap-1 pt-1.5 shrink-0 h-fit">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce"></div>
                </div>

                {/* Right: Scrolling Text */}
                <div ref={logContainerRef} className="flex-1 h-[4.5rem] overflow-hidden relative flex flex-col justify-end">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-900/0 via-slate-900/0 to-slate-900/10 pointer-events-none z-10"></div>
                    <div className="space-y-1.5">
                        {logs.map((log, i) => (
                            <div key={i} className="text-xs text-slate-300/90 animate-in slide-in-from-bottom-4 fade-in duration-500 leading-relaxed">
                                {log}
                            </div>
                        ))}
                        {logs.length === 0 && (
                           <div className="text-xs text-slate-500 animate-pulse">
                             {language === 'zh' ? '正在连接...' : 'Connecting...'}
                           </div>
                        )}
                    </div>
                </div>
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
