import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BackendConfigFlowProps {
  language: 'zh' | 'en';
  onComplete: () => void;
  startGeneration: () => void;
  isGenerating: boolean;
  generatedCode: string;
  streamingCode?: string; // Add streaming code to show progress
}

export const BackendConfigFlow: React.FC<BackendConfigFlowProps> = ({
  language,
  onComplete,
  startGeneration,
  isGenerating,
  generatedCode,
  streamingCode = ''
}) => {
  const [step, setStep] = useState<'scan' | 'analyze' | 'configure' | 'complete'>('scan');
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [hasStartedGeneration, setHasStartedGeneration] = useState(false);
  const [initialCodeLength, setInitialCodeLength] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false); // 🆕 使用 ref 避免重复初始化
  const startGenerationRef = useRef(startGeneration); // 🆕 保存 startGeneration 的引用
  
  // 🆕 更新 startGeneration 的引用
  useEffect(() => {
    startGenerationRef.current = startGeneration;
  }, [startGeneration]);

  // Store initial code length for comparison
  useEffect(() => {
    if (generatedCode && initialCodeLength === 0) {
      setInitialCodeLength(generatedCode.length);
    }
  }, [generatedCode, initialCodeLength]);

  // Steps configuration
  const steps = [
    { id: 'scan', label: language === 'zh' ? '表单扫描' : 'Form Scan', icon: 'fa-magnifying-glass-code' },
    { id: 'analyze', label: language === 'zh' ? '字段分析' : 'Field Analysis', icon: 'fa-network-wired' },
    { id: 'configure', label: language === 'zh' ? '接口配置' : 'API Provisioning', icon: 'fa-server' },
    { id: 'complete', label: language === 'zh' ? '配置完成' : 'Configuration Complete', icon: 'fa-check-circle' }
  ];

  // Simulation effect - runs once on mount
  useEffect(() => {
    // 🆕 使用 ref 确保只执行一次
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const addLog = (msg: string) => {
      setLogs(prev => [...prev.slice(-8), msg]);
    };

    const runSequence = async () => {
      // Phase 1: Scan
      setStep('scan');
      addLog(language === 'zh' ? '🔍 扫描表单 (如缺失将自动创建)...' : '🔍 Scanning forms (Auto-create if missing)...');
      await new Promise(r => setTimeout(r, 600));
      addLog(language === 'zh' ? '📄 识别或规划输入组件...' : '📄 Identifying or planning input components...');
      setProgress(10);
      await new Promise(r => setTimeout(r, 600));
      addLog(language === 'zh' ? '🧩 提取表单结构...' : '🧩 Extracting form structure...');
      setProgress(20);
      
      // Phase 2: Analyze
      await new Promise(r => setTimeout(r, 500));
      setStep('analyze');
      addLog(language === 'zh' ? '📝 分析提交逻辑...' : '📝 Analyzing submission logic...');
      await new Promise(r => setTimeout(r, 600));
      addLog(language === 'zh' ? '📊 映射数据字段...' : '📊 Mapping data fields...');
      setProgress(35);
      await new Promise(r => setTimeout(r, 600));
      addLog(language === 'zh' ? '🗂️ 生成数据模型...' : '🗂️ Generating data models...');
      setProgress(50);

      // Phase 3: Configure (Trigger actual generation)
      await new Promise(r => setTimeout(r, 500));
      setStep('configure');
      addLog(language === 'zh' ? '🤖 正在注入 API 接口...' : '🤖 Injecting API endpoints...');
      setProgress(55);
      setHasStartedGeneration(true);
      startGenerationRef.current(); // 🆕 使用 ref 调用
    };

    runSequence();
  }, [language]); // 🆕 移除 startGeneration 依赖，只依赖 language

  // Monitor generation status and streaming code
  useEffect(() => {
    if (!hasStartedGeneration) return;

    if (step === 'configure') {
      if (isGenerating) {
        // Show streaming progress
        if (streamingCode && streamingCode.length > 100) {
          const codeLines = streamingCode.split('\n').length;
          setLogs(prev => {
            const filtered = prev.filter(l => !l.includes('已生成') && !l.includes('Generated'));
            return [...filtered.slice(-6), language === 'zh' ? `⚡ 已生成 ${codeLines} 行代码...` : `⚡ Generated ${codeLines} lines of code...`];
          });
          // Progress based on streaming
          const estimatedProgress = Math.min(55 + (streamingCode.length / 5000) * 35, 90);
          setProgress(estimatedProgress);
        }
      }
    }
  }, [isGenerating, step, streamingCode, hasStartedGeneration, language]);

  // Separate effect for completion detection - only runs when generation finishes
  useEffect(() => {
    if (!hasStartedGeneration || step !== 'configure' || isGenerating) return;
    if (progress < 55) return; // Not started generating yet

    // Generation finished - add a delay to ensure code state is updated
    const checkCompletion = setTimeout(() => {
      // 🆕 P2 优化: 更精确的后端集成检测
      // 检查是否包含后端集成的关键特征
      const hasMailboxSubmit = generatedCode.includes('/api/mailbox/submit');
      const hasSparkAppId = generatedCode.includes('window.SPARK_APP_ID') || generatedCode.includes('SPARK_APP_ID');
      const hasFormSubmitHandler = generatedCode.includes('handleSubmit') && generatedCode.includes('fetch(');
      const hasIsSubmitting = generatedCode.includes('isSubmitting') || generatedCode.includes('submitting');
      
      // 至少需要满足两个条件才认为配置成功
      const backendIndicators = [hasMailboxSubmit, hasSparkAppId, hasFormSubmitHandler, hasIsSubmitting];
      const indicatorCount = backendIndicators.filter(Boolean).length;
      const hasBackendNow = indicatorCount >= 2 || hasMailboxSubmit;
      
      // 或者代码长度明显增加（至少增加 200 字符）
      const codeGrew = generatedCode.length > initialCodeLength + 200;
      
      console.log('[BackendConfigFlow] Checking completion:', { 
        hasBackendNow,
        indicatorCount,
        hasMailboxSubmit,
        hasSparkAppId,
        hasFormSubmitHandler,
        hasIsSubmitting,
        codeGrew,
        codeLength: generatedCode.length, 
        initialLength: initialCodeLength,
        isGenerating 
      });
      
      if (hasBackendNow || codeGrew) {
        setProgress(100);
        setStep('complete');
        setLogs(prev => [...prev.slice(-6), language === 'zh' ? '✅ 后端集成完成！' : '✅ Backend integration complete!']);
      } else {
        // No form detected in the app
        setLogs(prev => [...prev.slice(-6), language === 'zh' ? '⚠️ 检测到您的应用暂时没有表单收集的功能，无法完成配置' : '⚠️ No form collection feature detected in your app, cannot complete configuration']);
        setProgress(100);
        setStep('complete');
      }
    }, 3000); // Increased delay to 3 seconds to ensure state is fully updated
    
    return () => clearTimeout(checkCompletion);
  }, [isGenerating, hasStartedGeneration, step, progress, generatedCode, initialCodeLength, language]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden font-mono">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black"></div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-4xl px-6">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/50 mb-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <i className={`fa-solid ${steps.find(s => s.id === step)?.icon} text-3xl text-brand-400`}></i>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
            {language === 'zh' ? '表单收集配置中' : 'Configuring Form Collection'}
          </h1>
          <p className="text-slate-400 text-sm md:text-base">
            {language === 'zh' ? '正在连接表单到云端收件箱' : 'Connecting forms to cloud inbox'}
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex justify-between items-center mb-12 relative">
          {/* Connecting Line */}
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/10 -z-10"></div>
          <div 
            className="absolute top-1/2 left-0 h-0.5 bg-brand-500 transition-all duration-500 ease-out -z-10"
            style={{ width: `${progress}%` }}
          ></div>

          {steps.map((s, i) => {
            const isActive = s.id === step;
            const isPast = steps.findIndex(st => st.id === step) > i;
            
            return (
              <div key={s.id} className="flex flex-col items-center gap-3">
                <motion.div 
                  initial={false}
                  animate={{ 
                    scale: isActive ? 1.2 : 1,
                    backgroundColor: isActive || isPast ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                    borderColor: isActive ? '#60a5fa' : 'rgba(255, 255, 255, 0.1)'
                  }}
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center z-10 shadow-lg transition-colors duration-300 ${isActive ? 'shadow-brand-500/50' : ''}`}
                >
                  <i className={`fa-solid ${s.icon} text-xs ${isActive || isPast ? 'text-white' : 'text-slate-500'}`}></i>
                </motion.div>
                <span className={`text-xs font-medium transition-colors duration-300 ${isActive ? 'text-brand-400' : isPast ? 'text-slate-300' : 'text-slate-600'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Terminal / Logs */}
        <div className="bg-black/80 backdrop-blur border border-white/10 rounded-xl p-6 h-48 overflow-hidden relative shadow-2xl ring-1 ring-white/5">
          <div className="absolute top-0 left-0 w-full h-8 bg-white/5 border-b border-white/10 flex items-center px-4 gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
            <span className="ml-2 text-[10px] text-slate-400 font-mono">backend-config.sh</span>
          </div>
          <div ref={terminalRef} className="mt-6 space-y-2 font-mono text-sm h-28 overflow-y-auto">
            <AnimatePresence mode='popLayout'>
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-slate-300 flex items-center gap-2"
                >
                  <span className="text-brand-500">➜</span>
                  {log}
                </motion.div>
              ))}
            </AnimatePresence>
            {step !== 'complete' && (
              <motion.div 
                animate={{ opacity: [0, 1, 0] }} 
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-2 h-4 bg-brand-500 inline-block align-middle"
              />
            )}
          </div>
        </div>

        {/* Complete Action */}
        <AnimatePresence>
          {step === 'complete' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 flex justify-center"
            >
              <button
                onClick={onComplete}
                className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold shadow-lg shadow-green-500/30 transition-all hover:scale-105 flex items-center gap-2"
              >
                <i className="fa-solid fa-rocket"></i>
                {language === 'zh' ? '查看后端数据' : 'View Backend Data'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};
