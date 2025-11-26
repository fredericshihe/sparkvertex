import Link from 'next/link';

export default function Why() {
  return (
    <div className="page-section relative z-10 pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-10">SparkVertex 核心理念</h2>
          
          {/* Era Background Description */}
          <div className="max-w-4xl mx-auto relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/20 to-purple-500/20 rounded-2xl blur-xl opacity-50"></div>
            <div className="relative bg-slate-900/50 border border-slate-700/50 rounded-2xl p-8 md:p-10 backdrop-blur-sm">
              <div className="inline-block px-4 py-1 rounded-full bg-brand-500/10 text-brand-400 text-sm font-bold mb-4 border border-brand-500/20">时代背景</div>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">自然语言编程</h3>
              <p className="text-xl text-slate-300 mb-4 font-medium">
                编程不再是门槛。自然语言就是新的语法。
              </p>
              <p className="text-lg text-slate-400 leading-relaxed">
                <span className="text-white font-bold">你负责想象，AI 负责实现。</span> 无论是复杂的物理模拟还是精美的 UI 设计，只需一句话，即可将脑海中的火花转化为现实。
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Feature 1: Share & Earn */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-brand-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-brand-500/20"></div>
            <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-brand-500/20">
              <i className="fa-solid fa-hand-holding-dollar text-3xl text-brand-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">灵感变现</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              你的灵感不应止步于此。
              <br /><br />
              <span className="text-white font-medium">让创意产生价值。</span> 微应用是<span className="text-brand-400">轻量级、场景化</span>的解决方案。它们不像传统软件那样臃肿，而是专注于解决单一痛点。无论是<span className="text-white">效率工具、教育互动、还是创意娱乐</span>，你都可以用极低的成本替代昂贵的 SaaS 服务。在这里，你的每一个微小灵感都能找到它的受众，并转化为实实在在的收益。
            </p>
          </div>

          {/* Feature 2: Instant Experience (New) */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-cyan-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-cyan-500/20"></div>
            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-cyan-500/20">
              <i className="fa-solid fa-qrcode text-3xl text-cyan-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">即刻体验</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              打破应用商店的壁垒。
              <br /><br />
              <span className="text-white font-medium">扫码即用，原生体验。</span> 你的创意不再需要繁琐的打包、审核和下载。通过 SparkVertex，只需生成一个二维码，身边的人即可<span className="text-cyan-400">秒开体验</span>。得益于先进的 PWA 技术和针对性的移动端优化，这些微应用拥有<span className="text-white">接近原生 APP</span> 的流畅度与交互感。从灵感诞生到用户手中的全流程，从未如此简单快捷。
            </p>
          </div>

          {/* Feature 3: Learn from Others */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-purple-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-purple-500/20"></div>
            <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-purple-500/20">
              <i className="fa-solid fa-code-branch text-3xl text-purple-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">透明化学习</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              拒绝黑盒，拥抱开源。
              <br /><br />
              <span className="text-white font-medium">查看源码与 Prompt。</span> 在 AI 时代，<span className="text-purple-400">Prompt Engineering (提示词工程)</span> 是核心竞争力。我们打破代码的黑盒，让你直接看到应用背后的“咒语”。小白可以通过<span className="text-white">“阅读源码 -&gt; 分析 Prompt -&gt; 模仿修改”</span>的路径快速成长。理解高手如何与 AI 沟通，你将迅速从“使用者”进化为“创造者”，掌握驾驭 AI 的终极奥秘。
            </p>
          </div>

          {/* Feature 4: Remix & Innovate */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-green-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-green-500/20"></div>
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-green-500/20">
              <i className="fa-solid fa-layer-group text-3xl text-green-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">混合创新</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              复制不是终点，而是起点。
              <br /><br />
              <span className="text-white font-medium">站在巨人的肩膀上。</span> <span className="text-green-400">借鉴不等于抄袭，创新源于重组。</span> 伟大的发明往往是现有思想的碰撞。Spark 鼓励你“Fork”他人的智慧，将 A 应用的功能与 B 应用的界面融合，瞬间催生出 C 创意。在这个<span className="text-white">开源共创</span>的生态里，每一次引用都是对原作者的致敬，每一次改进都是文明的进步。立刻开始你的“乐高式”开发之旅吧！
            </p>
          </div>
        </div>

        <div className="mt-20 max-w-3xl mx-auto bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl py-10 px-8 border border-slate-700 relative overflow-hidden text-center shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          <div className="relative z-10">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-8">准备好释放你的创造力了吗？</h3>
            <Link href="/explore" className="px-8 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-full font-bold text-base shadow-lg shadow-brand-500/30 transition transform hover:scale-105 inline-block">
              立即进入灵感广场
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
