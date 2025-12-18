'use client';

import React, { useState, useEffect, useRef } from 'react';

// 工作流阶段定义
export type WorkflowStage = 
  | 'idle' 
  | 'analyzing'      // DeepSeek 分析阶段
  | 'compressing'    // RAG/压缩阶段  
  | 'generating'     // Gemini 生成阶段
  | 'completed' 
  | 'error';

// 阶段详细信息
export interface StageDetails {
  // DeepSeek 分析结果
  reasoning?: string;           // 思考推理过程
  intent?: string;              // 识别的意图
  targets?: string[];           // 识别的目标文件/组件
  
  // RAG/压缩信息
  compressionStats?: {
    originalSize: number;
    compressedSize: number;
    ratio: string;
    modulesFound: number;
  };
  
  // Gemini 生成信息
  plan?: string;                // /// PLAN /// 内容
  currentStep?: string;         // /// STEP: xxx /// 当前步骤
  completedSteps?: string[];    // 🆕 已完成的步骤列表（瀑布流）
  streamingCode?: string;       // 实时代码流
  stepsCompleted?: number;      // 已完成步骤数
  totalSteps?: number;          // 总步骤数
}

interface AIWorkflowProgressProps {
  stage: WorkflowStage;
  details: StageDetails;
  isGenerating: boolean;
  language: 'zh' | 'en';
  variant?: 'floating' | 'centered' | 'chat';
  onExpand?: () => void;
  skipCompression?: boolean; // 🆕 全量修复模式跳过压缩阶段显示
}

// 阶段图标和颜色映射
const STAGE_CONFIG = {
  analyzing: {
    icon: 'fa-brain',
    color: 'text-purple-400',
    gradient: 'from-purple-500 to-indigo-500',
    zh: '深度分析',
    en: 'Deep Analysis'
  },
  compressing: {
    icon: 'fa-compress-arrows-alt',
    color: 'text-cyan-400',
    gradient: 'from-cyan-500 to-blue-500',
    zh: '上下文优化',
    en: 'Context Optimization'
  },
  generating: {
    icon: 'fa-wand-magic-sparkles',
    color: 'text-blue-400',
    gradient: 'from-blue-500 to-violet-500',
    zh: '代码生成',
    en: 'Code Generation'
  }
};

// 意图中文映射 - 支持 DeepSeek 返回的大写格式
const INTENT_LABELS: Record<string, { zh: string; en: string }> = {
  // 小写格式 (旧版兼容)
  'add_feature': { zh: '添加新功能', en: 'Add Feature' },
  'fix_bug': { zh: '修复问题', en: 'Fix Bug' },
  'modify_style': { zh: '调整样式', en: 'Modify Style' },
  'refactor': { zh: '代码重构', en: 'Refactor' },
  'optimize': { zh: '性能优化', en: 'Optimize' },
  'general': { zh: '通用修改', en: 'General Modification' },
  // 大写格式 (DeepSeek 返回值)
  'UI_MODIFICATION': { zh: '界面修改', en: 'UI Modification' },
  'LOGIC_FIX': { zh: '逻辑修复', en: 'Logic Fix' },
  'NEW_FEATURE': { zh: '新增功能', en: 'New Feature' },
  'DATA_OPERATION': { zh: '数据操作', en: 'Data Operation' },
  'CONFIG_HELP': { zh: '配置帮助', en: 'Config Help' },
  'PERFORMANCE': { zh: '性能优化', en: 'Performance' },
  'REFACTOR': { zh: '代码重构', en: 'Refactor' },
  'QA_EXPLANATION': { zh: '问答解释', en: 'Q&A' },
  'BACKEND_SETUP': { zh: '后端配置', en: 'Backend Setup' },
  'UNKNOWN': { zh: '通用修改', en: 'General' }
};

export const AIWorkflowProgress: React.FC<AIWorkflowProgressProps> = ({
  stage,
  details,
  isGenerating,
  language,
  variant = 'floating',
  skipCompression = false // 🆕 默认不跳过
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevStageRef = useRef(stage);
  
  // 🆕 代码预览窗口的滚动控制
  const codeViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleCodeScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // 如果距离底部小于 50px，则允许自动滚动
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    shouldAutoScrollRef.current = isNearBottom;
  };

  // 代码自动滚动逻辑
  useEffect(() => {
    if (shouldAutoScrollRef.current && codeViewportRef.current) {
      codeViewportRef.current.scrollTop = codeViewportRef.current.scrollHeight;
    }
  }, [details.streamingCode]);

  // 自动滚动到最新内容 (Smart Auto-scroll)
  useEffect(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      // 如果用户接近底部（100px以内），或者阶段发生变化，则自动滚动
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      const isStageChanged = prevStageRef.current !== stage;

      if (isNearBottom || isStageChanged) {
        // 使用平滑滚动
        containerRef.current.scrollTo({ top: scrollHeight, behavior: 'smooth' });
      }
      
      prevStageRef.current = stage;
    }
  }, [details.reasoning, details.streamingCode, details.currentStep, details.completedSteps?.length, stage]);

  if (stage === 'idle' && !isGenerating) return null;

  // 容器样式 - 更高级的玻璃拟态
  let containerClasses = "";
  switch (variant) {
    case 'floating':
      containerClasses = "fixed bottom-8 right-8 z-50 w-[400px] max-h-[75vh] bg-black/70 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-white transition-all duration-500 animate-in slide-in-from-bottom-10 fade-in overflow-hidden";
      break;
    case 'centered':
      containerClasses = "w-full max-w-2xl bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-white transition-all duration-500 animate-in fade-in overflow-hidden";
      break;
    case 'chat':
      containerClasses = "w-full bg-black/50 backdrop-blur-xl rounded-2xl border border-white/10 text-white transition-all duration-300 animate-in fade-in overflow-hidden";
      break;
  }

  // 获取当前阶段配置
  // 如果有代码流，强制显示为生成阶段
  const effectiveStage = details.streamingCode ? 'generating' : stage;
  const currentConfig = STAGE_CONFIG[effectiveStage as keyof typeof STAGE_CONFIG];

  // 计算整体进度
  const getOverallProgress = () => {
    switch (effectiveStage) {
      case 'analyzing': return 15;
      case 'compressing': return 35;
      case 'generating': 
        if (details.stepsCompleted && details.totalSteps) {
          return 35 + (details.stepsCompleted / details.totalSteps) * 60;
        }
        return details.streamingCode ? 60 : 40;
      case 'completed': return 100;
      default: return 0;
    }
  };

  // 计算是否已有生成内容（计划、步骤或代码）
  const hasGeneratingContent = !!details.plan || !!details.currentStep || !!details.streamingCode || !!(details.completedSteps && details.completedSteps.length > 0);

  return (
    <div className={containerClasses}>
      {/* 顶部进度条 - 更细致的光效 */}
      <div className="h-[2px] bg-white/5 w-full relative overflow-hidden">
        <div 
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-blue-400 to-purple-500 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          style={{ width: `${getOverallProgress()}%` }}
        />
      </div>

      {/* 头部 - 极简设计 */}
      <div 
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 transition-colors group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${currentConfig?.gradient || 'from-slate-700 to-slate-800'} shadow-lg`}>
              {currentConfig ? (
                <i className={`fa-solid ${currentConfig.icon} text-white text-sm`}></i>
              ) : (
                stage === 'completed' ? <i className="fa-solid fa-check text-white text-sm"></i> : <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              )}
            </div>
            {/* 呼吸灯效果 */}
            {stage !== 'completed' && stage !== 'idle' && (
              <div className="absolute -inset-1 bg-inherit rounded-xl blur opacity-20 animate-pulse"></div>
            )}
          </div>
          
          <div className="flex flex-col">
            <h3 className="font-medium text-sm text-white tracking-wide">
              {currentConfig 
                ? (language === 'zh' ? currentConfig.zh : currentConfig.en)
                : (stage === 'completed' 
                  ? (language === 'zh' ? '生成完成' : 'Generation Complete')
                  : (language === 'zh' ? 'AI 思考中...' : 'AI Thinking...')
                )
              }
            </h3>
            <p className="text-[11px] text-slate-400 font-light tracking-wider uppercase mt-0.5">
              {stage === 'analyzing' && (language === 'zh' ? '正在处理请求' : 'Processing Request')}
              {stage === 'compressing' && (language === 'zh' ? '正在优化上下文' : 'Optimizing Context')}
              {stage === 'generating' && (language === 'zh' ? '正在编写代码' : 'Writing Code')}
              {stage === 'completed' && (language === 'zh' ? '准备预览' : 'Ready to Preview')}
            </p>
          </div>
        </div>
        
        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-all duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
          <i className="fa-solid fa-chevron-down text-slate-400 text-xs"></i>
        </div>
      </div>

      {/* 展开内容 - 时间轴风格 */}
      {isExpanded && (
        <div ref={containerRef} className="px-5 pb-5 pt-5 space-y-6 max-h-[50vh] overflow-y-auto custom-scrollbar scroll-smooth">
          
          {/* 阶段 1: DeepSeek 分析 */}
          {stage !== 'idle' && (
            <TimelineItem
              active={stage === 'analyzing' && !hasGeneratingContent}
              completed={stage !== 'analyzing' || hasGeneratingContent}
              icon="fa-brain"
              color="purple"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    {language === 'zh' 
                      ? (stage === 'analyzing' ? '需求分析进行中...' : '需求分析') 
                      : (stage === 'analyzing' ? 'Analysis in progress...' : 'Analysis')}
                  </span>
                  {details.intent && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {INTENT_LABELS[details.intent]?.[language] || details.intent}
                    </span>
                  )}
                </div>

                {details.reasoning ? (
                  <div className="relative group">
                    <div className="absolute -inset-2 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="relative bg-white/5 rounded-lg p-3 border border-white/5 hover:border-white/10 transition-colors">
                      <p className="text-[11px] text-slate-300 leading-relaxed font-light">
                        {details.reasoning}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ThinkingDots text={language === 'zh' ? '正在深度思考...' : 'Deep thinking...'} />
                )}
              </div>
            </TimelineItem>
          )}

          {/* 阶段 2: RAG/压缩 (全量修复时跳过) */}
          {!skipCompression && (stage === 'compressing' || details.compressionStats || stage === 'generating' || stage === 'completed') && (
            <TimelineItem
              active={stage === 'compressing'}
              completed={stage !== 'compressing' && (!!details.compressionStats || stage === 'generating' || stage === 'completed')}
              icon="fa-compress-arrows-alt"
              color="cyan"
            >
              <div className="space-y-3">
                <span className="text-xs font-medium text-slate-300">
                   {language === 'zh' 
                      ? (stage === 'compressing' ? '上下文优化进行中...' : '上下文优化') 
                      : (stage === 'compressing' ? 'Context Optimization in progress...' : 'Context Optimization')}
                </span>
                
                {details.compressionStats ? (
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat 
                      label={language === 'zh' ? '原始大小' : 'Original'} 
                      value={`${(details.compressionStats.originalSize / 1024).toFixed(0)}KB`} 
                    />
                    <MiniStat 
                      label={language === 'zh' ? '优化后' : 'Optimized'} 
                      value={`${(details.compressionStats.compressedSize / 1024).toFixed(0)}KB`} 
                      highlight
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <div className="w-3 h-3 border border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    {language === 'zh' ? '正在扫描工作区...' : 'Scanning workspace...'}
                  </div>
                )}
              </div>
            </TimelineItem>
          )}

          {/* 阶段 3: Gemini 生成 */}
          {(stage === 'generating' || hasGeneratingContent || stage === 'completed') && (
            <TimelineItem
              active={stage === 'generating' || hasGeneratingContent}
              completed={stage === 'completed'}
              icon="fa-code"
              color="blue"
              isLast
            >
              <div className="space-y-3">
                <span className="text-xs font-medium text-slate-300">
                   {language === 'zh' 
                      ? (stage === 'generating' ? '构建应用进行中...' : '构建应用') 
                      : (stage === 'generating' ? 'Building App in progress...' : 'Building App')}
                </span>

                {/* AI 思考/计划展示 */}
                {details.plan && (
                  <div className="bg-blue-500/5 rounded-lg border border-blue-500/10 max-h-32 overflow-y-auto custom-scrollbar relative overscroll-contain">
                    <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-[#0f1115] z-10 border-b border-blue-500/10">
                      <i className="fa-solid fa-lightbulb text-yellow-400 text-[10px]"></i>
                      <span className="text-[10px] font-medium text-blue-300 uppercase tracking-wider">
                        {language === 'zh' ? 'AI 思考' : 'AI Thinking'}
                      </span>
                    </div>
                    <div className="p-3 pt-2">
                      <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap font-light">
                        {cleanPlanContent(details.plan)}
                      </p>
                    </div>
                  </div>
                )}

                {/* 步骤执行 */}
                {(details.completedSteps?.length || details.currentStep) && (() => {
                  // 预处理步骤数据：去重、清理空白
                  const normalizeStep = (s: string) => s.trim();
                  const completedSteps = Array.from(new Set((details.completedSteps || []).map(normalizeStep)));
                  const currentStep = details.currentStep ? normalizeStep(details.currentStep) : null;
                  // 只有当当前步骤不在已完成列表中时才显示，避免重复
                  const showCurrentStep = currentStep && !completedSteps.includes(currentStep);

                  return (
                    <div className="space-y-3 mt-4 pl-1">
                      {completedSteps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3 text-[11px] text-slate-400 animate-in slide-in-from-left-2 fade-in duration-300">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500/50 mt-1.5 shrink-0"></div>
                          <span className="line-through opacity-50 leading-relaxed">{step}</span>
                        </div>
                      ))}
                      {showCurrentStep && (
                        <div className="flex items-start gap-3 text-[11px] text-blue-200 animate-pulse">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] mt-1.5 shrink-0"></div>
                          <span className="font-medium leading-relaxed">{currentStep}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 代码预览 */}
                {details.streamingCode && (
                  <div className="mt-3 relative group rounded-lg border border-white/5 bg-black/40">
                    <div className="absolute top-0 right-0 px-2 py-1 bg-white/5 rounded-bl-lg text-[9px] text-slate-400 font-mono z-10 backdrop-blur-sm">
                      {language === 'zh' ? '代码预览' : 'TSX'}
                    </div>
                    <div 
                        ref={codeViewportRef}
                        onScroll={handleCodeScroll}
                        className="p-3 h-32 overflow-y-auto custom-scrollbar scroll-smooth overscroll-contain"
                    >
                      <pre className="font-mono text-[10px] text-slate-300/90 leading-relaxed break-all whitespace-pre-wrap">
                        {cleanCode(details.streamingCode)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </TimelineItem>
          )}
        </div>
      )}
    </div>
  );
};

// 时间轴项组件
const TimelineItem: React.FC<{
  active: boolean;
  completed: boolean;
  icon: string;
  color: 'purple' | 'cyan' | 'blue';
  isLast?: boolean;
  children: React.ReactNode;
}> = ({ active, completed, icon, color, isLast, children }) => {
  
  const styleMap = {
    purple: {
      active: 'border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]',
      completed: 'border-purple-500/50 text-purple-400 bg-purple-500/10',
      inactive: 'border-white/10 text-slate-600 bg-white/5'
    },
    cyan: {
      active: 'border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]',
      completed: 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10',
      inactive: 'border-white/10 text-slate-600 bg-white/5'
    },
    blue: {
      active: 'border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]',
      completed: 'border-blue-500/50 text-blue-400 bg-blue-500/10',
      inactive: 'border-white/10 text-slate-600 bg-white/5'
    }
  };

  const currentStyle = styleMap[color];

  return (
    <div className="relative pl-8">
      {/* 连接线 */}
      {!isLast && (
        <div className={`absolute left-[11px] top-6 bottom-[-24px] w-[2px] ${completed ? 'bg-white/10' : 'bg-white/5'}`}></div>
      )}
      
      {/* 节点图标 */}
      <div className={`absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 ${
        active 
          ? `${currentStyle.active} bg-black scale-110` 
          : completed
            ? `${currentStyle.completed}`
            : `${currentStyle.inactive} opacity-50`
      }`}>
        {completed ? (
          <i className="fa-solid fa-check text-[10px]"></i>
        ) : (
          <i className={`fa-solid ${icon} text-[10px]`}></i>
        )}
      </div>

      {/* 内容区域 */}
      <div className={`transition-all duration-500 ${active || completed ? 'opacity-100 translate-x-0' : 'opacity-60'}`}>
        {children}
      </div>
    </div>
  );
};

// 迷你统计组件
const MiniStat: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5 flex flex-col">
    <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
    <span className={`text-xs font-mono font-medium ${highlight ? 'text-cyan-300' : 'text-slate-300'}`}>{value}</span>
  </div>
);

// 思考动画
const ThinkingDots: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center gap-2 text-[11px] text-slate-400 italic">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
    </span>
    {text}
  </div>
);

// 辅助函数：清理 AI 思考/计划内容（移除 /// 标记）
const cleanPlanContent = (content: string) => {
  if (!content) return '';
  return content
    .replace(/\/\/\/\s*$/gm, '')  // 移除行尾的 ///
    .replace(/^\s*\/\/\/\s*/gm, '') // 移除行首的 ///
    .replace(/\s*\/\/\/\s*/g, ' ') // 将中间的 /// 替换为空格
    .trim();
};

// 辅助函数：清理代码显示
const cleanCode = (code: string) => {
  if (!code) return '';
  return code
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('<<<<') && 
             !trimmed.startsWith('====') && 
             !trimmed.startsWith('>>>>') &&
             !trimmed.startsWith('STEP:') &&
             !trimmed.startsWith('///');
    })
    .join('\n');
};

export default AIWorkflowProgress;
