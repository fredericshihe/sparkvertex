'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, MessageSquare, Eye, MousePointer2, Smartphone, Monitor, Tablet, Undo2, Plus, Minus, RotateCcw, QrCode, Server, Inbox, Upload, Save, Maximize2, RefreshCw } from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  position?: 'left' | 'right' | 'center';
  highlight?: string; // CSS selector or description
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

  // 引导步骤定义
  const steps: OnboardingStep[] = language === 'zh' ? [
    {
      id: 'welcome',
      title: '欢迎来到创作工作台！🎉',
      description: '这是一个快速入门指南，帮助您了解如何使用 AI 创作应用。只需几步，您就能掌握所有核心功能。',
      icon: <span className="text-4xl">✨</span>,
      position: 'center'
    },
    {
      id: 'chat-area',
      title: '对话区域',
      description: '这是您与 AI 交流的地方。在输入框中描述您想要修改的内容，例如"把背景改成蓝色"或"添加一个计分按钮"。AI 会理解您的需求并实时修改应用。',
      icon: <MessageSquare className="w-8 h-8" />,
      position: 'left',
      highlight: 'chat-area'
    },
    {
      id: 'chat-buttons',
      title: '对话框上方按钮',
      description: '• 📥 历史记录：查看之前的创作版本\n• 📊 模型选择：切换不同的 AI 模型\n• 🔄 全量模式：大改动时开启，AI 会重写整个应用',
      icon: <RefreshCw className="w-8 h-8" />,
      position: 'left',
      highlight: 'chat-header'
    },
    {
      id: 'preview-area',
      title: '预览区域',
      description: '右侧是您的应用实时预览。每次 AI 修改代码后，这里会自动更新显示效果。您可以直接在这里与应用互动，测试功能是否正常。',
      icon: <Eye className="w-8 h-8" />,
      position: 'right',
      highlight: 'preview-area'
    },
    {
      id: 'device-switch',
      title: '设备切换按钮',
      description: '• 💻 桌面模式：查看电脑端效果\n• 📱 平板模式：查看 iPad 等平板效果\n• 📲 手机模式：查看手机端效果\n\n切换后预览会自动调整尺寸和布局。',
      icon: <div className="flex gap-1"><Monitor className="w-6 h-6" /><Tablet className="w-6 h-6" /><Smartphone className="w-6 h-6" /></div>,
      position: 'right',
      highlight: 'device-buttons'
    },
    {
      id: 'zoom-controls',
      title: '缩放控制',
      description: '• ➕ 放大：让预览更大更清晰\n• ➖ 缩小：缩小预览以查看全貌\n• 百分比按钮：点击恢复默认缩放\n\n仅在手机/平板模式下可用。',
      icon: <div className="flex flex-col gap-0.5"><Plus className="w-5 h-5" /><Minus className="w-5 h-5" /></div>,
      position: 'right',
      highlight: 'zoom-controls'
    },
    {
      id: 'tool-buttons',
      title: '工具按钮组',
      description: '• 🔄 重启应用：清除缓存重新加载\n• 📱 真机预览：扫码在手机上体验\n• 🗄️ 配置后端：收集表单数据\n• 📥 查看数据：查看已收集的数据',
      icon: <RotateCcw className="w-8 h-8" />,
      position: 'right',
      highlight: 'tool-buttons'
    },
    {
      id: 'edit-mode',
      title: '点选编辑模式',
      description: '点击这个按钮进入"点选编辑"模式。开启后，直接点击预览中的任何元素（按钮、文字、图片等），即可快速修改它的颜色、文字或图片，无需输入复杂指令。',
      icon: <MousePointer2 className="w-8 h-8" />,
      position: 'right',
      highlight: 'edit-mode-button'
    },
    {
      id: 'undo-redo',
      title: '撤销/重做',
      description: '修改不满意？点击撤销按钮回退上一步。还可以重做恢复。右侧还有完整的修改历史面板，点击任意版本可直接恢复。',
      icon: <Undo2 className="w-8 h-8" />,
      position: 'right',
      highlight: 'undo-redo-buttons'
    },
    {
      id: 'header-actions',
      title: '顶部操作栏',
      description: '• ⛶ 全屏：让预览占满屏幕\n• 💾 存草稿：保存当前进度\n• 🚀 发布作品：发布到社区展示\n\n记得定期保存草稿哦！',
      icon: <div className="flex gap-1"><Maximize2 className="w-6 h-6" /><Save className="w-6 h-6" /><Upload className="w-6 h-6" /></div>,
      position: 'right',
      highlight: 'header-actions'
    },
    {
      id: 'complete',
      title: '您已准备就绪！🚀',
      description: '现在您已经了解了所有核心功能。开始创作吧！有任何问题，随时在对话框中向 AI 提问。\n\n小提示：试着输入"帮我优化一下界面设计"开始第一次对话！',
      icon: <span className="text-4xl">🎊</span>,
      position: 'center'
    }
  ] : [
    {
      id: 'welcome',
      title: 'Welcome to Creation Studio! 🎉',
      description: 'This is a quick tour to help you understand how to create apps with AI. In just a few steps, you\'ll master all the core features.',
      icon: <span className="text-4xl">✨</span>,
      position: 'center'
    },
    {
      id: 'chat-area',
      title: 'Chat Area',
      description: 'This is where you communicate with AI. Describe what you want to change in the input box, like "change background to blue" or "add a score button". AI will understand and modify the app in real-time.',
      icon: <MessageSquare className="w-8 h-8" />,
      position: 'left',
      highlight: 'chat-area'
    },
    {
      id: 'chat-buttons',
      title: 'Chat Header Buttons',
      description: '• 📥 History: View previous creation versions\n• 📊 Model Select: Switch between AI models\n• 🔄 Full Mode: Enable for major changes, AI will rewrite the entire app',
      icon: <RefreshCw className="w-8 h-8" />,
      position: 'left',
      highlight: 'chat-header'
    },
    {
      id: 'preview-area',
      title: 'Preview Area',
      description: 'The right side shows your app\'s live preview. After each AI modification, it updates automatically. You can interact with the app here to test functionality.',
      icon: <Eye className="w-8 h-8" />,
      position: 'right',
      highlight: 'preview-area'
    },
    {
      id: 'device-switch',
      title: 'Device Switch Buttons',
      description: '• 💻 Desktop Mode: View PC layout\n• 📱 Tablet Mode: View iPad layout\n• 📲 Mobile Mode: View phone layout\n\nPreview auto-adjusts size and layout when switching.',
      icon: <div className="flex gap-1"><Monitor className="w-6 h-6" /><Tablet className="w-6 h-6" /><Smartphone className="w-6 h-6" /></div>,
      position: 'right',
      highlight: 'device-buttons'
    },
    {
      id: 'zoom-controls',
      title: 'Zoom Controls',
      description: '• ➕ Zoom In: Make preview larger\n• ➖ Zoom Out: Make preview smaller\n• Percentage: Click to reset to default\n\nOnly available in mobile/tablet mode.',
      icon: <div className="flex flex-col gap-0.5"><Plus className="w-5 h-5" /><Minus className="w-5 h-5" /></div>,
      position: 'right',
      highlight: 'zoom-controls'
    },
    {
      id: 'tool-buttons',
      title: 'Tool Buttons',
      description: '• 🔄 Restart App: Clear cache and reload\n• 📱 Mobile Preview: Scan QR on phone\n• 🗄️ Configure Backend: Collect form data\n• 📥 View Data: See collected data',
      icon: <RotateCcw className="w-8 h-8" />,
      position: 'right',
      highlight: 'tool-buttons'
    },
    {
      id: 'edit-mode',
      title: 'Point & Edit Mode',
      description: 'Click this button to enter "Point & Edit" mode. When enabled, click any element in preview (buttons, text, images) to quickly modify its color, text, or image without complex commands.',
      icon: <MousePointer2 className="w-8 h-8" />,
      position: 'right',
      highlight: 'edit-mode-button'
    },
    {
      id: 'undo-redo',
      title: 'Undo/Redo',
      description: 'Not happy with changes? Click undo to go back. You can also redo. There\'s a full history panel on the right - click any version to restore directly.',
      icon: <Undo2 className="w-8 h-8" />,
      position: 'right',
      highlight: 'undo-redo-buttons'
    },
    {
      id: 'header-actions',
      title: 'Header Actions',
      description: '• ⛶ Fullscreen: Expand preview\n• 💾 Save Draft: Save current progress\n• 🚀 Publish: Share to community\n\nRemember to save drafts regularly!',
      icon: <div className="flex gap-1"><Maximize2 className="w-6 h-6" /><Save className="w-6 h-6" /><Upload className="w-6 h-6" /></div>,
      position: 'right',
      highlight: 'header-actions'
    },
    {
      id: 'complete',
      title: 'You\'re All Set! 🚀',
      description: 'You now know all the core features. Start creating! If you have questions, just ask AI in the chat.\n\nTip: Try typing "help me improve the design" to start your first conversation!',
      icon: <span className="text-4xl">🎊</span>,
      position: 'center'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setIsAnimating(false);
      }, 150);
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
      }, 150);
    }
  };

  const handleDotClick = (index: number) => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(index);
      setIsAnimating(false);
    }, 150);
  };

  if (!isVisible) return null;

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  // 根据 position 计算弹窗位置样式
  const getPositionStyles = () => {
    switch (step.position) {
      case 'left':
        return 'lg:left-[480px] lg:right-auto lg:translate-x-0 left-1/2 -translate-x-1/2 lg:top-1/2 lg:-translate-y-1/2';
      case 'right':
        return 'lg:right-[100px] lg:left-auto lg:translate-x-0 left-1/2 -translate-x-1/2 lg:top-1/2 lg:-translate-y-1/2';
      default:
        return 'left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onSkip}
      />
      
      {/* Onboarding Card */}
      <div 
        className={`absolute w-[90vw] max-w-md bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${getPositionStyles()}`}
      >
        {/* Header with gradient */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-b from-brand-600/20 to-transparent">
          {/* Skip button */}
          <button
            onClick={onSkip}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X size={16} />
          </button>

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-brand-500/30">
            {step.icon}
          </div>

          {/* Step indicator */}
          <div className="text-xs text-brand-400 font-bold mb-1">
            {language === 'zh' ? `第 ${currentStep + 1} 步，共 ${steps.length} 步` : `Step ${currentStep + 1} of ${steps.length}`}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-white">
            {step.title}
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
            {step.description}
          </p>
        </div>

        {/* Progress dots */}
        <div className="px-6 pb-4 flex items-center justify-center gap-1.5">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className={`transition-all duration-300 rounded-full ${
                index === currentStep 
                  ? 'w-6 h-2 bg-brand-500' 
                  : index < currentStep 
                    ? 'w-2 h-2 bg-brand-500/50 hover:bg-brand-500/70' 
                    : 'w-2 h-2 bg-white/20 hover:bg-white/30'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          {/* Skip / Back button */}
          {isFirstStep ? (
            <button
              onClick={onSkip}
              className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition"
            >
              {language === 'zh' ? '跳过引导' : 'Skip Tour'}
            </button>
          ) : (
            <button
              onClick={handlePrev}
              className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition flex items-center gap-1"
            >
              <ChevronLeft size={16} />
              {language === 'zh' ? '上一步' : 'Back'}
            </button>
          )}

          {/* Next / Complete button */}
          <button
            onClick={handleNext}
            className="flex-1 max-w-[180px] px-4 py-2.5 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white text-sm font-bold rounded-xl transition shadow-lg shadow-brand-500/20 flex items-center justify-center gap-1"
          >
            {isLastStep ? (
              language === 'zh' ? '开始创作' : 'Start Creating'
            ) : (
              <>
                {language === 'zh' ? '下一步' : 'Next'}
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Highlight overlays for specific elements - only show on desktop */}
      {step.highlight && step.position !== 'center' && (
        <div className="hidden lg:block">
          {step.position === 'left' && (
            <div className="absolute left-0 top-0 bottom-0 w-[450px] border-2 border-brand-500/50 rounded-r-2xl pointer-events-none animate-pulse-border" />
          )}
          {step.position === 'right' && (
            <div className="absolute right-0 top-0 bottom-0 left-[450px] border-2 border-brand-500/50 rounded-l-2xl pointer-events-none animate-pulse-border" />
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(16, 185, 129, 0.3); }
          50% { border-color: rgba(16, 185, 129, 0.6); }
        }
        .animate-pulse-border {
          animation: pulse-border 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default CreationOnboarding;
