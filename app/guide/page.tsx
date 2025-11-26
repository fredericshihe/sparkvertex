'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Guide() {
  const [currentPromptMode, setCurrentPromptMode] = useState<'vanilla' | 'react'>('vanilla');

  const copyCurrentPrompt = () => {
    const id = currentPromptMode === 'vanilla' ? 'guide-prompt-code-vanilla' : 'guide-prompt-code-react';
    const element = document.getElementById(id);
    if (element) {
      navigator.clipboard.writeText(element.innerText).then(() => {
        alert('Prompt 协议已复制！');
      });
    }
  };

  return (
    <div className="page-section relative z-10 pt-20">
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
              无需懂开发，无需懂编程。在这里，纯小白也能立刻将点子变为现实，并与大家分享这份喜悦。
            </p>
          </div>
        </div>

        {/* Philosophy Cards (Compact) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-24">
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400"><i className="fa-solid fa-cube"></i></div>
            <div><h3 className="font-bold text-white">单文件即应用</h3></div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400"><i className="fa-solid fa-shield-halved"></i></div>
            <div><h3 className="font-bold text-white">本地运行零依赖</h3></div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400"><i className="fa-solid fa-bolt"></i></div>
            <div><h3 className="font-bold text-white">自然语言编程</h3></div>
          </div>
        </div>

        {/* THE CREATIVE PIPELINE */}
        <div className="relative">
          {/* Connecting Line */}
          <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-brand-500 via-purple-500 to-blue-500 hidden md:block -translate-x-1/2"></div>
          
          {/* Step 1: Define (Prompt) */}
          <div className="relative z-10 mb-24 md:w-1/2 md:pr-12 md:ml-auto">
            <div className="absolute left-[-53px] top-0 w-6 h-6 rounded-full bg-brand-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-brand-500/50 transition duration-500">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-brand-500/30">1</div>
              <h3 className="text-2xl font-bold text-white mb-4 mt-2">定义灵感 (Prompt)</h3>
              <p className="text-slate-400 mb-4">
                好的 Prompt 是代码的蓝图。选择开发模式，复制 <span className="text-brand-400 font-bold">Spark Protocol</span> 模板，让 AI 精准实现你的想法。
              </p>
              
              {/* Mode Switcher */}
              <div className="flex gap-2 mb-4">
                <button 
                  onClick={() => setCurrentPromptMode('vanilla')} 
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition border ${currentPromptMode === 'vanilla' ? 'bg-brand-600 text-white border-transparent' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-blue-400'}`}
                >
                  <i className="fa-brands fa-js"></i> 原生 JS
                </button>
                <button 
                  onClick={() => setCurrentPromptMode('react')} 
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition border ${currentPromptMode === 'react' ? 'bg-brand-600 text-white border-transparent' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-blue-400'}`}
                >
                  <i className="fa-brands fa-react"></i> React 单文件
                </button>
              </div>

              <div className="bg-black/50 rounded-xl border border-slate-700/50 p-4 font-mono text-xs text-slate-300 relative">
                <button className="absolute top-3 right-3 text-brand-400 hover:text-white transition flex items-center gap-1" onClick={copyCurrentPrompt}>
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
            <div className="absolute right-[-53px] top-0 w-6 h-6 rounded-full bg-purple-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-purple-500/50 transition duration-500">
              <div className="absolute -top-4 -right-4 w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-purple-500/30">2</div>
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
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400 animate-pulse">Waiting for code generation...</p>
              </div>
            </div>
          </div>

          {/* Step 3: Materialize (Save) - DETAILED */}
          <div className="relative z-10 mb-24 md:w-1/2 md:pr-12 md:ml-auto">
            <div className="absolute left-[-53px] top-0 w-6 h-6 rounded-full bg-blue-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-blue-500/50 transition duration-500">
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/30">3</div>
              <h3 className="text-2xl font-bold text-white mb-4 mt-2">实体化 (Save)</h3>
              <p className="text-slate-400 mb-6">
                这是最关键的一步。将代码保存为 <code className="text-brand-400">.html</code> 文件，它就变成了真正的应用。
              </p>

              {/* OS Switcher */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                {/* Simplified OS Switcher for React implementation */}
                <div className="p-6">
                  <h4 className="text-white font-bold text-sm mb-4">保存指南</h4>
                  <ol className="space-y-4 relative border-l border-slate-800 ml-2">
                    <li className="pl-6 relative">
                      <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <h4 className="text-white font-bold text-sm mb-1">1. 新建文档</h4>
                      <p className="text-xs text-slate-400">新建一个文本文档 (.txt)</p>
                    </li>
                    <li className="pl-6 relative">
                      <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <h4 className="text-white font-bold text-sm mb-1">2. 粘贴代码</h4>
                      <p className="text-xs text-slate-400">将 AI 生成的代码完整粘贴进去。</p>
                    </li>
                    <li className="pl-6 relative">
                      <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      <h4 className="text-white font-bold text-sm mb-1">3. 另存为 HTML</h4>
                      <p className="text-xs text-slate-400 mb-2">将文件后缀改为 <span className="text-green-400">.html</span></p>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Launch (Run) */}
          <div className="relative z-10 mb-12 md:w-1/2 md:pl-12 md:mr-auto">
            <div className="absolute right-[-53px] top-0 w-6 h-6 rounded-full bg-green-500 border-4 border-slate-900 hidden md:block"></div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative group hover:border-green-500/50 transition duration-500">
              <div className="absolute -top-4 -right-4 w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-green-500/30">4</div>
              <h3 className="text-2xl font-bold text-white mb-4 mt-2">启动与分享 (Launch)</h3>
              <p className="text-slate-400 mb-6">
                双击你的 <code className="text-green-400">.html</code> 文件，它会立即在浏览器中运行。
              </p>
              <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 flex flex-col items-center justify-center gap-4 group-hover:bg-slate-900 transition">
                <div className="w-16 h-16 bg-slate-800 rounded-lg flex items-center justify-center text-3xl text-orange-500 shadow-lg group-hover:scale-110 transition">
                  <i className="fa-brands fa-html5"></i>
                </div>
                <div className="text-center">
                  <p className="text-white font-bold text-sm">app.html</p>
                  <p className="text-xs text-slate-500">24KB • Local File</p>
                </div>
                <Link href="/upload" className="mt-2 px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-full text-xs font-bold transition flex items-center gap-2">
                  <i className="fa-solid fa-cloud-arrow-up"></i> 收录到灵感广场
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center mt-20">
          <h2 className="text-3xl font-bold text-white mb-6">准备好开始了吗？</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={copyCurrentPrompt} className="px-8 py-4 bg-white text-slate-900 hover:bg-slate-200 rounded-full font-bold text-lg transition shadow-lg shadow-white/10 flex items-center gap-2">
              <i className="fa-solid fa-copy"></i> 复制 Prompt
            </button>
            <Link href="/upload" className="px-8 py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-full font-bold text-lg transition shadow-lg shadow-brand-500/30 flex items-center gap-2">
              <i className="fa-solid fa-cloud-arrow-up"></i> 开发完成了？收录到灵感广场
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
