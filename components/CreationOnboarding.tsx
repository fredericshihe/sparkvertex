'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, MessageSquare, Eye, MousePointer2, Smartphone, Monitor, Tablet, Undo2, Plus, Minus, RotateCcw, QrCode, Server, Inbox, Upload, Save, Maximize2, RefreshCw } from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  target?: string; // data-tour attribute value
  position?: 'left' | 'right' | 'top' | 'bottom' | 'center';
}

interface CreationOnboardingProps {
  language: 'zh' | 'en';
  onComplete: () => void;
  onSkip: () => void;
  isVisible: boolean;
}

export const CreationOnboarding: React.FC<CreationOnboardingProps> = ({
  language,
  onComplete,
  onSkip,
  isVisible
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // 引导步骤定义 - 精简文字，聚焦核心价值
  const steps: OnboardingStep[] = language === 'zh' ? [
    {
      id: 'welcome',
      title: '欢迎来到创作工作台',
      description: '这里是您的 AI 创意工坊。让我们花 1 分钟了解如何高效使用它。',
      icon: <span className="text-3xl">✨</span>,
      position: 'center'
    },
    {
      id: 'chat-input',
      title: '与 AI 对话',
      description: '在这里输入您的想法，例如"把背景改成星空"或"添加一个排行榜"。AI 会实时理解并修改代码。',
      icon: <MessageSquare className="w-6 h-6" />,
      target: 'chat-input',
      position: 'top'
    },
    {
      id: 'full-mode-switch',
      title: '全量修改模式',
      description: '需要大改动时开启此模式，AI 将获得完整代码上下文，修改更精准。',
      icon: <span className="text-xl">⚡</span>,
      target: 'full-mode-switch',
      position: 'top'
    },
    {
      id: 'chat-header-actions',
      title: '辅助工具',
      description: '查看历史版本、下载源码，或重置当前生成。',
      icon: <RefreshCw className="w-6 h-6" />,
      target: 'chat-header-actions',
      position: 'bottom'
    },
    {
      id: 'preview-area',
      title: '实时预览',
      description: '您的应用会在这里实时运行。您可以直接点击交互，测试功能是否符合预期。',
      icon: <Eye className="w-6 h-6" />,
      target: 'preview-area',
      position: 'left'
    },
    {
      id: 'device-switch',
      title: '多端适配',
      description: '一键切换桌面、平板、手机视图，确保您的应用在任何设备上都完美呈现。',
      icon: <div className="flex gap-1"><Monitor className="w-5 h-5" /><Smartphone className="w-5 h-5" /></div>,
      target: 'device-switch',
      position: 'left'
    },
    {
      id: 'zoom-controls',
      title: '缩放查看',
      description: '看不清细节？使用缩放工具放大预览，或点击百分比快速恢复默认视图。',
      icon: <Plus className="w-6 h-6" />,
      target: 'zoom-controls',
      position: 'left'
    },
    {
      id: 'tool-buttons',
      title: '常用工具',
      description: '重启应用、扫码真机预览、配置后端数据库，都在这里。',
      icon: <RotateCcw className="w-6 h-6" />,
      target: 'tool-group',
      position: 'left'
    },
    {
      id: 'edit-mode',
      title: '点选修改',
      description: '不想打字？开启此模式，直接点击预览中的元素即可修改颜色、文字或图片。',
      icon: <MousePointer2 className="w-6 h-6" />,
      target: 'edit-mode-btn',
      position: 'left'
    },
    {
      id: 'header-actions',
      title: '保存与发布',
      description: '记得常存草稿。完成后点击发布，您的作品将展示给全世界。',
      icon: <Upload className="w-6 h-6" />,
      target: 'header-actions',
      position: 'bottom'
    },
    {
      id: 'complete',
      title: '准备出发！',
      description: '您已掌握所有技能。现在，试着对 AI 说："帮我优化一下界面设计" 吧！',
      icon: <span className="text-3xl">🚀</span>,
      position: 'center'
    }
  ] : [
    {
      id: 'welcome',
      title: 'Welcome to Studio',
      description: 'Your AI creative workshop. Let\'s take 1 minute to tour the essentials.',
      icon: <span className="text-3xl">✨</span>,
      position: 'center'
    },
    {
      id: 'chat-input',
      title: 'Chat with AI',
      description: 'Type your ideas here, like "change background to stars" or "add a leaderboard". AI codes it in real-time.',
      icon: <MessageSquare className="w-6 h-6" />,
      target: 'chat-input',
      position: 'top'
    },
    {
      id: 'full-mode-switch',
      title: 'Full Code Mode',
      description: 'Enable for major changes. AI gets full context for precise edits.',
      icon: <span className="text-xl">⚡</span>,
      target: 'full-mode-switch',
      position: 'top'
    },
    {
      id: 'chat-header-actions',
      title: 'Helper Tools',
      description: 'Access history, download code, or reset generation.',
      icon: <RefreshCw className="w-6 h-6" />,
      target: 'chat-header-actions',
      position: 'bottom'
    },
    {
      id: 'preview-area',
      title: 'Live Preview',
      description: 'Your app runs here live. Interact with it directly to test functionality.',
      icon: <Eye className="w-6 h-6" />,
      target: 'preview-area',
      position: 'left'
    },
    {
      id: 'device-switch',
      title: 'Responsive View',
      description: 'Switch between Desktop, Tablet, and Mobile views to ensure perfect layout everywhere.',
      icon: <div className="flex gap-1"><Monitor className="w-5 h-5" /><Smartphone className="w-5 h-5" /></div>,
      target: 'device-switch',
      position: 'left'
    },
    {
      id: 'zoom-controls',
      title: 'Zoom Controls',
      description: 'Need a closer look? Zoom in/out or reset to default view instantly.',
      icon: <Plus className="w-6 h-6" />,
      target: 'zoom-controls',
      position: 'left'
    },
    {
      id: 'tool-buttons',
      title: 'Utility Belt',
      description: 'Restart app, scan QR for mobile preview, or configure backend database.',
      icon: <RotateCcw className="w-6 h-6" />,
      target: 'tool-group',
      position: 'left'
    },
    {
      id: 'edit-mode',
      title: 'Point & Edit',
      description: 'Don\'t want to type? Enable this to click any element and change color, text, or image.',
      icon: <MousePointer2 className="w-6 h-6" />,
      target: 'edit-mode-btn',
      position: 'left'
    },
    {
      id: 'header-actions',
      title: 'Save & Publish',
      description: 'Save drafts often. When ready, publish to share your creation with the world.',
      icon: <Upload className="w-6 h-6" />,
      target: 'header-actions',
      position: 'bottom'
    },
    {
      id: 'complete',
      title: 'Ready to Launch!',
      description: 'You\'re all set. Try asking AI: "Help me improve the UI design" to start!',
      icon: <span className="text-3xl">🚀</span>,
      position: 'center'
    }
  ];

  const step = steps[currentStep];

  // Calculate position based on target element
  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      if (step.position === 'center' || !step.target) {
        setTargetRect(null);
        setPopoverStyle({
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        });
        return;
      }

      const element = document.querySelector(`[data-tour="${step.target}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);

        // Calculate popover position
        const gap = 16; // Distance from target
        let style: React.CSSProperties = {};

        switch (step.position) {
          case 'left':
            style = {
              top: rect.top + rect.height / 2,
              left: rect.left - gap,
              transform: 'translate(-100%, -50%)'
            };
            break;
          case 'right':
            style = {
              top: rect.top + rect.height / 2,
              left: rect.right + gap,
              transform: 'translate(0, -50%)'
            };
            break;
          case 'top':
            style = {
              top: rect.top - gap,
              left: rect.left + rect.width / 2,
              transform: 'translate(-50%, -100%)'
            };
            break;
          case 'bottom':
            // Check if element is too far right (like header actions)
            if (rect.left > window.innerWidth * 0.7) {
               style = {
                top: rect.bottom + gap,
                right: window.innerWidth - rect.right, // Align with right edge
                transform: 'translate(0, 0)'
              };
            } else {
              style = {
                top: rect.bottom + gap,
                left: rect.left + rect.width / 2,
                transform: 'translate(-50%, 0)'
              };
            }
            break;
        }
        setPopoverStyle(style);
      } else {
        // Fallback to center if target not found
        setTargetRect(null);
        setPopoverStyle({
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        });
      }
    };

    // Initial calculation
    // Small delay to ensure DOM is ready
    setTimeout(updatePosition, 100);

    // Update on resize
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [currentStep, isVisible, step.target, step.position]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setIsAnimating(false);
      }, 200);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        setIsAnimating(false);
      }, 200);
    }
  };

  const handleDotClick = (index: number) => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(index);
      setIsAnimating(false);
    }, 200);
  };

  if (!isVisible) return null;

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden pointer-events-none">
      {/* Backdrop - Darken everything except target */}
      <div className="absolute inset-0 bg-black/60 transition-opacity duration-500 pointer-events-auto" onClick={onSkip}>
        {/* Cutout for target element using clip-path if target exists */}
        {targetRect && (
          <div 
            className="absolute bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] rounded-lg transition-all duration-300 ease-in-out border-2 border-brand-500/50 animate-pulse-border"
            style={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
            }}
          />
        )}
      </div>
      
      {/* Popover Card */}
      <div 
        className={`absolute w-[420px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 pointer-events-auto ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        style={popoverStyle}
      >
        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-5 mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-brand-500/20 to-purple-600/20 flex items-center justify-center text-brand-400 shrink-0 border border-brand-500/20">
              {step.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white mb-2 leading-tight">
                {step.title}
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          </div>

          {/* Footer: Dots & Buttons */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
            {/* Progress Dots */}
            <div className="flex gap-1">
              {steps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleDotClick(index)}
                  className={`transition-all duration-300 rounded-full h-1.5 ${
                    index === currentStep 
                      ? 'w-4 bg-brand-500' 
                      : 'w-1.5 bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={onSkip}
                className="text-xs font-medium text-slate-500 hover:text-slate-300 transition px-2 py-1"
              >
                {language === 'zh' ? '跳过' : 'Skip'}
              </button>
              
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-slate-200 transition flex items-center gap-1"
              >
                {isLastStep ? (
                  language === 'zh' ? '开始' : 'Start'
                ) : (
                  <>
                    {language === 'zh' ? '下一步' : 'Next'}
                    <ChevronRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(16, 185, 129, 0.3); box-shadow: 0 0 0 9999px rgba(0,0,0,0.7), 0 0 15px rgba(16, 185, 129, 0.2); }
          50% { border-color: rgba(16, 185, 129, 0.8); box-shadow: 0 0 0 9999px rgba(0,0,0,0.7), 0 0 25px rgba(16, 185, 129, 0.4); }
        }
        .animate-pulse-border {
          animation: pulse-border 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default CreationOnboarding;
