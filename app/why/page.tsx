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
              <div className="inline-block px-4 py-1 rounded-full bg-brand-500/10 text-brand-400 text-sm font-bold mb-4 border border-brand-500/20">The Future of Software</div>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">去中心化的微软件时代</h3>
              <p className="text-xl text-slate-300 mb-4 font-medium">
                软件不应是庞大的黑盒，而应是轻量、透明、触手可及的工具。
              </p>
              <p className="text-lg text-slate-400 leading-relaxed">
                <span className="text-white font-bold">Single File, Local First.</span> 我们相信，最好的应用应该像一张图片、一段文档一样易于分享和存储。没有复杂的构建流程，没有云端锁定，<span className="text-brand-400">你拥有代码的绝对所有权</span>。
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Feature 1: AI Enhanced */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-brand-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-brand-500/20"></div>
            <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-brand-500/20">
              <i className="fa-solid fa-wand-magic-sparkles text-3xl text-brand-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">AI 智能增强</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              不仅仅是托管，更是进化。
              <br /><br />
              当你上传代码时，SparkVertex 的 <span className="text-white font-medium">AI 引擎</span> 会自动介入：<span className="text-brand-400">安全审计</span>排除恶意代码，<span className="text-brand-400">移动端优化</span>注入触摸适配逻辑，甚至自动为你生成精美的<span className="text-brand-400">应用图标</span>。你只管写核心逻辑，剩下的脏活累活交给 AI。
            </p>
          </div>

          {/* Feature 2: Instant Monetization */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-green-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-green-500/20"></div>
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-green-500/20">
              <i className="fa-solid fa-hand-holding-dollar text-3xl text-green-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">极速变现</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              从灵感到收入，只需几分钟。
              <br /><br />
              无需注册公司，无需接入支付网关。SparkVertex 内置了<span className="text-white font-medium">打赏与付费查看体系</span>。你可以为你的微应用源码设置价格，或者开启打赏功能。无论是<span className="text-green-400">实用工具、创意游戏还是教育课件</span>，你的每一次智力产出都值得被认可与付费。
            </p>
          </div>

          {/* Feature 3: Open Source Learning */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-purple-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-purple-500/20"></div>
            <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-purple-500/20">
              <i className="fa-solid fa-code-branch text-3xl text-purple-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Prompt 逆向工程</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              授人以鱼，不如授人以渔。
              <br /><br />
              在 SparkVertex，我们不仅分享代码，更分享<span className="text-purple-400">“咒语”</span>。平台具备强大的 <span className="text-white font-medium">Prompt 逆向分析能力</span>，能从现有代码中反推生成它的 Prompt。你可以一键复制这些 Prompt，在自己的 AI 对话中复现、修改、迭代，迅速掌握 AI 编程的精髓。
            </p>
          </div>

          {/* Feature 4: No Install */}
          <div className="bg-slate-800/30 p-8 rounded-3xl border border-slate-700/50 hover:border-cyan-500/50 transition group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition group-hover:bg-cyan-500/20"></div>
            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition duration-300 border border-cyan-500/20">
              <i className="fa-solid fa-bolt text-3xl text-cyan-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">即用即走</h3>
            <p className="text-slate-400 leading-relaxed flex-grow">
              打破应用商店的围墙。
              <br /><br />
              没有下载，没有安装，没有更新。基于 Web 标准，你的应用可以在<span className="text-white font-medium">任何设备、任何浏览器</span>上运行。通过 PWA 技术，它们能像原生 App 一样全屏运行，甚至离线使用。这是最纯粹的软件分发方式——<span className="text-cyan-400">一个链接，就是一切。</span>
            </p>
          </div>
        </div>

        <div className="mt-20 max-w-3xl mx-auto bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl py-10 px-8 border border-slate-700 relative overflow-hidden text-center shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          <div className="relative z-10">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-8">准备好释放你的创造力了吗？</h3>
            <Link href="/create" className="px-8 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-full font-bold text-base shadow-lg shadow-brand-500/30 transition transform hover:scale-105 inline-block">
              开始 AI 创作
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
