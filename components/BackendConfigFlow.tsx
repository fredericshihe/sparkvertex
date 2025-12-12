import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BackendConfigFlowProps {
  language: 'zh' | 'en';
  onComplete: () => void;
  startGeneration: () => void;
  isGenerating: boolean;
  generatedCode: string;
  streamingCode?: string;
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
  const [logs, setLogs] = useState<{id: number, text: string, type: 'info' | 'success' | 'warning'}[]>([]);
  const [progress, setProgress] = useState(0);
  const [hasStartedGeneration, setHasStartedGeneration] = useState(false);
  const [initialCodeLength, setInitialCodeLength] = useState(0);
  const hasInitializedRef = useRef(false);
  const startGenerationRef = useRef(startGeneration);
  
  // System Check Items
  const [systemChecks, setSystemChecks] = useState([
    { id: 'db', label: 'Database Connection', status: 'pending' },
    { id: 'auth', label: 'Auth Protocol', status: 'pending' },
    { id: 'api', label: 'API Gateway', status: 'pending' },
    { id: 'storage', label: 'Storage Bucket', status: 'pending' },
    { id: 'edge', label: 'Edge Functions', status: 'pending' }
  ]);

  useEffect(() => {
    startGenerationRef.current = startGeneration;
  }, [startGeneration]);

  useEffect(() => {
    if (generatedCode && initialCodeLength === 0) {
      setInitialCodeLength(generatedCode.length);
    }
  }, [generatedCode, initialCodeLength]);

  // Simulation effect
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const addLog = (text: string, type: 'info' | 'success' | 'warning' = 'info') => {
      setLogs(prev => [...prev.slice(-4), { id: Date.now(), text, type }]);
    };

    const updateCheck = (id: string, status: 'running' | 'done') => {
      setSystemChecks(prev => prev.map(item => item.id === id ? { ...item, status } : item));
    };

    const runSequence = async () => {
      // Phase 1: Scan
      setStep('scan');
      addLog(language === 'zh' ? '初始化神经连接...' : 'Initializing Neural Link...', 'info');
      await new Promise(r => setTimeout(r, 600));
      
      updateCheck('db', 'running');
      addLog(language === 'zh' ? '正在扫描组件结构...' : 'Scanning component structure...', 'info');
      setProgress(10);
      await new Promise(r => setTimeout(r, 800));
      updateCheck('db', 'done');
      
      // Phase 2: Analyze
      setStep('analyze');
      updateCheck('auth', 'running');
      addLog(language === 'zh' ? '解析数据模型...' : 'Parsing data models...', 'info');
      setProgress(30);
      await new Promise(r => setTimeout(r, 800));
      updateCheck('auth', 'done');
      updateCheck('api', 'running');
      
      // Phase 3: Configure
      setStep('configure');
      addLog(language === 'zh' ? '注入后端逻辑...' : 'Injecting backend logic...', 'info');
      setProgress(45);
      setHasStartedGeneration(true);
      startGenerationRef.current();
      
      // Simulate remaining checks completing over time
      setTimeout(() => updateCheck('api', 'done'), 1500);
      setTimeout(() => { updateCheck('storage', 'running'); }, 2000);
      setTimeout(() => { updateCheck('storage', 'done'); updateCheck('edge', 'running'); }, 3500);
    };

    runSequence();
  }, [language]);

  // Monitor generation
  useEffect(() => {
    if (!hasStartedGeneration) return;

    if (step === 'configure') {
      if (isGenerating) {
        if (streamingCode && streamingCode.length > 100) {
          const estimatedProgress = Math.min(50 + (streamingCode.length / 5000) * 40, 95);
          setProgress(estimatedProgress);
        }
      }
    }
  }, [isGenerating, step, streamingCode, hasStartedGeneration]);

  // Completion detection
  useEffect(() => {
    if (!hasStartedGeneration || step !== 'configure' || isGenerating) return;
    if (progress < 40) return; // Wait for at least some progress

    const checkCompletion = setTimeout(() => {
      const hasMailboxSubmit = generatedCode.includes('/api/mailbox/submit');
      const hasBackendNow = hasMailboxSubmit || generatedCode.length > initialCodeLength + 200;
      
      if (hasBackendNow) {
        setProgress(100);
        setStep('complete');
        setSystemChecks(prev => prev.map(item => ({ ...item, status: 'done' })));
        setLogs(prev => [...prev, { id: Date.now(), text: language === 'zh' ? '系统集成完成' : 'System Integration Complete', type: 'success' }]);
      } else {
        setProgress(100);
        setStep('complete');
        setSystemChecks(prev => prev.map(item => ({ ...item, status: 'done' })));
      }
    }, 1500);
    
    return () => clearTimeout(checkCompletion);
  }, [isGenerating, hasStartedGeneration, step, progress, generatedCode, initialCodeLength, language]);

  // --- Visual Components ---

  const Hexagon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor">
      <polygon points="50 0, 93.3 25, 93.3 75, 50 100, 6.7 75, 6.7 25" />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center overflow-hidden font-sans text-slate-200">
      {/* Ambient Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.05),_transparent_70%)]"></div>
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] bg-[length:40px_40px]"></div>
      
      {/* Central HUD */}
      <div className="relative z-10 w-full max-w-4xl flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 px-8">
        
        {/* Left: System Status List */}
        <div className="w-full md:w-64 space-y-4 hidden md:block">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-800 pb-2">
            {language === 'zh' ? '系统模块' : 'SYSTEM MODULES'}
          </h3>
          {systemChecks.map((check, i) => (
            <div key={check.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
                  check.status === 'done' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 
                  check.status === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-slate-700'
                }`}></div>
                <span className={`text-sm font-medium transition-colors duration-300 ${
                  check.status === 'pending' ? 'text-slate-600' : 'text-slate-300'
                }`}>{check.label}</span>
              </div>
              {check.status === 'done' && (
                <motion.i 
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="fa-solid fa-check text-emerald-500 text-xs"
                ></motion.i>
              )}
            </div>
          ))}
        </div>

        {/* Center: The Reactor */}
        <div className="relative flex flex-col items-center">
          <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
            {/* Rotating Rings */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-slate-800 border-t-slate-600 border-l-slate-600 opacity-50"
            ></motion.div>
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute inset-4 rounded-full border border-slate-800 border-b-slate-500 opacity-50"
            ></motion.div>
            
            {/* Progress Circle */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <circle cx="50%" cy="50%" r="46%" fill="none" stroke="#1e293b" strokeWidth="2" />
              <motion.circle
                cx="50%"
                cy="50%"
                r="46%"
                fill="none"
                stroke="#10b981"
                strokeWidth="3"
                strokeDasharray="300"
                strokeDashoffset={300 - (progress / 100) * 300}
                strokeLinecap="round"
                initial={{ strokeDashoffset: 300 }}
                animate={{ strokeDashoffset: 300 - (progress / 100) * 300 }}
                transition={{ duration: 0.5 }}
              />
            </svg>

            {/* Core Hexagon */}
            <div className="relative z-10 w-32 h-32 flex items-center justify-center">
              <motion.div
                animate={{ scale: isGenerating ? [1, 1.05, 1] : 1 }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-emerald-500/10 blur-2xl rounded-full"
              ></motion.div>
              
              <div className="relative w-24 h-24 bg-slate-900 flex items-center justify-center clip-hexagon border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                <Hexagon className="absolute inset-0 text-slate-900" />
                <div className="absolute inset-[1px] bg-slate-900 clip-hexagon flex items-center justify-center">
                   <AnimatePresence mode="wait">
                      {step === 'complete' ? (
                        <motion.i 
                          key="check"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="fa-solid fa-check text-4xl text-emerald-400"
                        ></motion.i>
                      ) : (
                        <motion.div
                          key="icon"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <i className="fa-solid fa-microchip text-4xl text-emerald-500"></i>
                        </motion.div>
                      )}
                   </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Floating Particles */}
            {isGenerating && (
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1 h-1 bg-emerald-400 rounded-full"
                    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                    animate={{ 
                      opacity: [0, 1, 0],
                      scale: [0, 1.5, 0],
                      x: (Math.random() - 0.5) * 100,
                      y: (Math.random() - 0.5) * 100
                    }}
                    transition={{ 
                      duration: 2, 
                      repeat: Infinity, 
                      delay: i * 0.3,
                      ease: "easeOut"
                    }}
                    style={{ left: '50%', top: '50%' }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Status Text */}
          <div className="mt-8 text-center">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-bold text-white tracking-tight mb-2"
            >
              {step === 'scan' && (language === 'zh' ? '正在扫描应用结构...' : 'Scanning Architecture...')}
              {step === 'analyze' && (language === 'zh' ? '分析数据模型...' : 'Analyzing Data Models...')}
              {step === 'configure' && (language === 'zh' ? '正在构建后端服务...' : 'Building Backend Services...')}
              {step === 'complete' && (language === 'zh' ? '配置完成' : 'Configuration Complete')}
            </motion.div>
            <div className="h-6 flex items-center justify-center gap-2">
              <AnimatePresence mode="popLayout">
                {logs.slice(-1).map(log => (
                  <motion.span
                    key={log.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`text-sm font-mono ${
                      log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {log.text}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right: Code Preview (Abstract) */}
        <div className="w-full md:w-64 hidden md:block">
           <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 h-64 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/90 z-10"></div>
              <div className="space-y-2 opacity-50">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="w-4 h-2 bg-slate-700 rounded"></div>
                    <div className="w-12 h-2 bg-slate-700 rounded"></div>
                    <div className="w-24 h-2 bg-slate-800 rounded"></div>
                  </div>
                ))}
                <motion.div 
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 0.1 }}
                  className="w-2 h-4 bg-emerald-500"
                ></motion.div>
              </div>
           </div>
        </div>

      </div>

      {/* Complete Action */}
      <AnimatePresence>
        {step === 'complete' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-12 md:bottom-24"
          >
            <button
              onClick={onComplete}
              className="group relative px-8 py-4 bg-white text-black rounded-full font-bold text-lg shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] hover:scale-105 transition-all duration-300 flex items-center gap-3"
            >
              <span>{language === 'zh' ? '进入控制台' : 'Enter Console'}</span>
              <i className="fa-solid fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
