import React from 'react';
import Link from 'next/link';
import ProjectCard from '@/components/ProjectCard';

interface ShowcaseProps {
  items: any[];
}

export default function Showcase({ items }: ShowcaseProps) {
  if (!items || items.length === 0) return null;

  return (
    <section className="py-24 bg-transparent relative">
      <div className="container mx-auto px-4 relative z-10">
        <div className="backdrop-blur-md bg-slate-900/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
          <div className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
              发现无限可能
            </h2>
            <p className="text-slate-400">
              看看社区里的创作者们都构建了什么
            </p>
          </div>
          <Link href="/explore" className="hidden md:flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
            <span>查看更多</span>
            <i className="fa-solid fa-arrow-right"></i>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <ProjectCard 
              key={item.id} 
              item={item} 
              isLiked={false}
              onLike={() => {}}
              onClick={() => {}}
            />
          ))}
        </div>

        <div className="mt-12 text-center md:hidden">
          <Link href="/explore" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
            <span>查看更多</span>
            <i className="fa-solid fa-arrow-right"></i>
          </Link>
        </div>
        </div>
      </div>
    </section>
  );
}
