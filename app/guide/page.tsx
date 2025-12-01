'use client';

import { useState } from 'react';
import Link from 'next/link';
import { copyToClipboard } from '@/lib/utils';

export default function Guide() {
  const [currentPromptMode, setCurrentPromptMode] = useState<'vanilla' | 'react'>('vanilla');

  const copyCurrentPrompt = async () => {
    const id = currentPromptMode === 'vanilla' ? 'guide-prompt-code-vanilla' : 'guide-prompt-code-react';
    const element = document.getElementById(id);
    if (element) {
      const success = await copyToClipboard(element.innerText);
      if (success) {
        alert('Prompt 协议已复制！');
      } else {
        alert('复制失败，请手动复制');
      }
    }
  };

  return (
    <div className="page-section relative z-10 pt-20 overflow-x-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        
        {/* Hero Header */}
        <div className="text-center mb-20 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-brand-500/20 blur-[100px] rounded-full pointer-events-none"></div>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 backdrop-blur-sm text-brand-400 text-xs font-bold mb-6 shadow-lg shadow-brand-500/10">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
              SPARK WORKFLOW
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-8 text-white tracking-tight">
              从灵感到现实<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-purple-400 to-blue-400">只需 5 分钟</span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              无论你是编程小白还是资深极客，这里都有适合你的创作路径。
            </p>
          </div>
        </div>

        {/* Two Paths Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-24">
          {/* Path 1: Instant Create */}
          <div className="bg-gradient-to-b from-brand-900/40 to-slate-900 border border-brand-500/30 rounded-3xl p-8 relative overflow-hidden group hover:border-brand-500/60 transition">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-xl font-bold mb-6 shadow-lg shadow-brand-500/20">
                <i className="fa-solid fa-bolt"></i>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">路径一：极速创作</h3>
              <p className="text-brand-200 text-sm font-bold mb-4 uppercase tracking-wider">推荐新手使用</p>
              <p className="text-slate-400 mb-8 h-20">
                无需离开网站，直接使用 Spark 内置的 AI 引擎。输入一句话，立刻生成可交互的应用预览。所见即所得。
              </p>
              <Link href="/create" className="inline-flex items-center justify-center w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition shadow-lg shadow-brand-500/20">
                进入创作向导 <i className="fa-solid fa-arrow-right ml-2"></i>
              </Link>
            </div>
          </div>

          {/* Path 2: Manual Hacker */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group hover:border-purple-500/50 transition">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-purple-400 text-xl font-bold mb-6">
                <i className="fa-solid fa-terminal"></i>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">路径二：极客模式</h3>
              <p className="text-slate-500 text-sm font-bold mb-4 uppercase tracking-wider">适合高阶玩家</p>
              <p className="text-slate-400 mb-8 h-20">
                使用 ChatGPT、Claude 或 DeepSeek 等外部强力模型。配合 Spark 标准协议 Prompt，获得最极致的代码控制权。
              </p>
              <button onClick={() => document.getElementById('manual-guide')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center justify-center w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition border border-slate-700">
                查看详细教程 <i className="fa-solid fa-arrow-down ml-2"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Manual Guide Section */}
        <div id="manual-guide" className="relative pt-12">
          <div className="flex items-center gap-4 mb-12">
            <div className="h-px bg-slate-800 flex-grow"></div>
            <h2 className="text-2xl font-bold text-slate-300">极客模式详细流程</h2>
            <div className="h-px bg-slate-800 flex-grow"></div>
          </div>

          {/* Step 1: Define (Prompt) */}
          <div className="relative z-10 mb-24 md:w-1/2 md:pr-12 md:ml-auto">
            <div className="absolute left-[-53px] top-0 w-6 h-6 rounded-full bg-purple-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-purple-500/50 transition duration-500">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-purple-500/30">1</div>
              <h3 className="text-2xl font-bold text-white mb-4 mt-2">获取 Spark 协议 Prompt</h3>
              <p className="text-slate-400 mb-4">
                为了确保生成的代码能完美适配 Spark 平台（移动端优化、单文件结构），请务必使用以下标准 Prompt 模板。
              </p>
              
              {/* Mode Switcher */}
              <div className="flex gap-2 mb-4">
                <button 
                  onClick={() => setCurrentPromptMode('vanilla')} 
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition border ${currentPromptMode === 'vanilla' ? 'bg-purple-600 text-white border-transparent' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-purple-400'}`}
                >
                  <i className="fa-brands fa-js"></i> 原生 JS (推荐)
                </button>
                <button 
                  onClick={() => setCurrentPromptMode('react')} 
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition border ${currentPromptMode === 'react' ? 'bg-purple-600 text-white border-transparent' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-purple-400'}`}
                >
                  <i className="fa-brands fa-react"></i> React 单文件
                </button>
              </div>

              <div className="bg-black/50 rounded-xl border border-slate-700/50 p-4 font-mono text-xs text-slate-300 relative">
                <button className="absolute top-3 right-3 text-purple-400 hover:text-white transition flex items-center gap-1" onClick={copyCurrentPrompt}>
                  <i className="fa-regular fa-copy"></i> 一键复制
                </button>
                
                {/* Vanilla Prompt */}
                <div id="guide-prompt-code-vanilla" className={`h-48 overflow-y-auto custom-scrollbar pr-2 ${currentPromptMode === 'vanilla' ? '' : 'hidden'}`}>
                  <p><span className="text-purple-400"># Role</span><br />Full Stack Developer Expert.</p>
                  <br />
                  <p><span className="text-purple-400"># Task</span><br />Create a <span className="text-yellow-400">[Tool Name: 你的工具名称]</span>.</p>
                  <br />
                  <p><span className="text-purple-400"># Description</span><br /><span className="text-slate-500">[在此处详细描述你的功能需求、交互逻辑和视觉风格。例如："一个倒计时器，背景是动态的星空，倒计时结束时播放音效..."]</span></p>
                  <br />
                  <p><span className="text-purple-400"># Mobile Adaptation (Native-Like Experience)</span></p>
                  <p>1. <span className="text-blue-400">Viewport</span>: &lt;meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"&gt;</p>
                  <p>2. <span className="text-blue-400">No Select</span>: body {`{ -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }`}</p>
                  <p>3. <span className="text-blue-400">No Scrollbar</span>: Hide scrollbars but allow scrolling.</p>
                  <p>4. <span className="text-blue-400">Layout</span>: Use Flexbox/Grid, avoid fixed width.</p>
                  <br />
                  <p><span className="text-purple-400"># Constraints (Spark Standard)</span></p>
                  <p>1. <span className="text-red-400">Single HTML File</span>: All CSS/JS inside.</p>
                  <p>2. <span className="text-red-400">No External Deps</span>: Use Tailwind CDN.</p>
                  <p>3. <span className="text-red-400">Dark Mode</span>: Default bg-slate-900.</p>
                  <p>4. <span className="text-red-400">Responsive</span>: Mobile friendly.</p>
                  <br />
                  <p><span className="text-purple-400"># Output</span><br />Return ONLY the full HTML code.</p>
                </div>

                {/* React Prompt */}
                <div id="guide-prompt-code-react" className={`h-48 overflow-y-auto custom-scrollbar pr-2 ${currentPromptMode === 'react' ? '' : 'hidden'}`}>
                  <p><span className="text-purple-400"># Role</span><br />React Expert (Single File).</p>
                  <br />
                  <p><span className="text-purple-400"># Task</span><br />Create a <span className="text-yellow-400">[Tool Name: 你的工具名称]</span> using React.</p>
                  <br />
                  <p><span className="text-purple-400"># Description</span><br /><span className="text-slate-500">[在此处详细描述你的功能需求...]</span></p>
                  <br />
                  <p><span className="text-purple-400"># Tech Stack</span></p>
                  <p>- React 18 (CDN)</p>
                  <p>- ReactDOM 18 (CDN)</p>
                  <p>- Babel Standalone (CDN)</p>
                  <p>- Tailwind CSS (CDN)</p>
                  <br />
                  <p><span className="text-purple-400"># Mobile Adaptation (Native-Like Experience)</span></p>
                  <p>1. <span className="text-blue-400">Viewport</span>: &lt;meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"&gt;</p>
                  <p>2. <span className="text-blue-400">No Select</span>: body {`{ -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }`}</p>
                  <p>3. <span className="text-blue-400">No Scrollbar</span>: Hide scrollbars but allow scrolling.</p>
                  <p>4. <span className="text-blue-400">Layout</span>: Use Flexbox/Grid, avoid fixed width.</p>
                  <br />
                  <p><span className="text-purple-400"># Constraints</span></p>
                  <p>1. <span className="text-red-400">Single HTML File</span>: All code in one file.</p>
                  <p>2. <span className="text-red-400">React Component</span>: Use functional components and hooks.</p>
                  <p>3. <span className="text-red-400">Babel</span>: Use &lt;script type="text/babel"&gt;.</p>
                  <p>4. <span className="text-red-400">Dark Mode</span>: Default bg-slate-900.</p>
                  <br />
                  <p><span className="text-purple-400"># Output</span><br />Return ONLY the full HTML code.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Generate (AI) */}
          <div className="relative z-10 mb-24 md:w-1/2 md:pl-12 md:mr-auto">
            <div className="absolute right-[-53px] top-0 w-6 h-6 rounded-full bg-blue-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-blue-500/50 transition duration-500">
              <div className="absolute -top-4 -right-4 w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/30">2</div>
              <h3 className="text-2xl font-bold text-white mb-4 mt-2">AI 铸造 (Generate)</h3>
              <p className="text-slate-400 mb-6">
                将复制的 Prompt 发送给任意主流 AI 模型。等待它吐出完整的 HTML 代码。
              </p>
              <div className="flex gap-4 justify-center mb-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-black text-xl font-bold">D</div>
                  <span className="text-xs text-slate-500">DeepSeek</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white text-xl"><i className="fa-solid fa-robot"></i></div>
                  <span className="text-xs text-slate-500">ChatGPT</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-orange-400 flex items-center justify-center text-white text-xl font-serif">C</div>
                  <span className="text-xs text-slate-500">Claude</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Materialize (Save) */}
          <div className="relative z-10 mb-24 md:w-1/2 md:pr-12 md:ml-auto">
            <div className="absolute left-[-53px] top-0 w-6 h-6 rounded-full bg-green-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-green-500/50 transition duration-500">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-green-500/30">3</div>
              <h3 className="text-2xl font-bold text-white mb-4 mt-2">本地保存 (Save)</h3>
              <p className="text-slate-400 mb-6">
                将代码保存为 <code className="text-green-400">.html</code> 文件，它就变成了真正的应用。
              </p>
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                <ol className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">1</span>
                    新建文本文档 (.txt)
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">2</span>
                    粘贴 AI 生成的代码
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">3</span>
                    重命名为 <span className="text-green-400 font-mono">app.html</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>

          {/* Step 4: Upload & Enhance */}
          <div className="relative z-10 mb-12 md:w-1/2 md:pl-12 md:mr-auto">
            <div className="absolute right-[-53px] top-0 w-6 h-6 rounded-full bg-brand-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-brand-500/50 transition duration-500">
              <div className="absolute -top-4 -right-4 w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-brand-500/30">4</div>
              <h3 className="text-2xl font-bold text-white mb-4 mt-2">上传增强 (Enhance)</h3>
              <p className="text-slate-400 mb-6">
                为什么要把本地文件上传回 SparkVertex？因为我们会为你的代码注入灵魂。
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <i className="fa-solid fa-shield-halved text-green-400"></i> 安全审计 (排除恶意代码)
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <i className="fa-solid fa-mobile-screen text-blue-400"></i> 移动端触摸优化注入
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <i className="fa-solid fa-icons text-purple-400"></i> AI 自动生成应用图标
                </li>
                <li className="flex items-center gap-3 text-sm text-slate-300">
                  <i className="fa-solid fa-sack-dollar text-yellow-400"></i> 开启付费下载功能
                </li>
              </ul>
              <Link href="/upload" className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition flex items-center justify-center gap-2">
                <i className="fa-solid fa-cloud-arrow-up"></i> 立即上传增强
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}