import React from 'react';

export default function FeatureLocalFirst() {
  const features = [
    {
      icon: "fa-wifi",
      title: "离线可用",
      desc: "没有网络也能用。应用加载速度极快，体验如原生软件般流畅。Local-First 架构确保了随时随地的访问能力。",
      color: "text-blue-400",
      bg: "bg-blue-500/10"
    },
    {
      icon: "fa-shield-halved",
      title: "隐私安全",
      desc: "所有内容优先存储在本地浏览器，不会上传云端。没有您的允许，任何人都无法窥探您的数据。您的数据完全属于您。",
      color: "text-green-400",
      bg: "bg-green-500/10"
    },
    {
      icon: "fa-download",
      title: "自由部署",
      desc: "生成完就是你的。您可以一键下载完整源码进行私有化部署，或者直接离线打开使用，不受平台锁定。",
      color: "text-orange-400",
      bg: "bg-orange-500/10"
    }
  ];

  return (
    <section className="py-24 bg-slate-900 relative">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            极致性能，数据自主
          </h2>
          <p className="text-slate-400 text-lg">
            SparkVertex 采用先进的 Local-First 架构，为您提供超越传统 Web 应用的体验。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 hover:bg-slate-800 transition-colors group">
              <div className={`w-14 h-14 rounded-xl ${feature.bg} ${feature.color} flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform`}>
                <i className={`fa-solid ${feature.icon}`}></i>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">{feature.title}</h3>
              <p className="text-slate-400 leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
