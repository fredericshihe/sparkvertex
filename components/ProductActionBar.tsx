'use client';

interface ProductActionBarProps {
  isLiked: boolean;
  onLike: () => void;
  onShare: () => void;
  onLaunchApp: () => void;
  onDownload: () => void;
  t: any; // translations object
  variant?: 'default' | 'modal'; // 'default' for page, 'modal' for DetailModal
}

export default function ProductActionBar({ 
  isLiked, 
  onLike, 
  onShare, 
  onLaunchApp, 
  onDownload, 
  t,
  variant = 'default'
}: ProductActionBarProps) {
  const isModal = variant === 'modal';
  
  return (
    <div className="flex gap-3 w-full">
      {/* Like Button */}
      <button 
        onClick={onLike}
        className={`w-12 h-12 rounded-xl border flex items-center justify-center transition group flex-shrink-0 ${
          isLiked 
            ? 'bg-rose-500/10 text-rose-500 border-rose-500/50' 
            : isModal
              ? 'bg-white/5 text-slate-400 hover:text-rose-500 border-white/10 hover:bg-white/10'
              : 'bg-slate-800 text-slate-400 hover:text-rose-500 border-slate-700 hover:bg-slate-700'
        }`}
      >
        <i className={`fa-solid fa-heart text-lg group-hover:scale-110 transition-transform`}></i>
      </button>

      {/* Share Button (Mobile Only - Icon Only) */}
      <button 
        onClick={onShare}
        className={`md:hidden w-12 h-12 rounded-xl border flex items-center justify-center transition flex-shrink-0 ${
          isModal
            ? 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
            : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'
        }`}
      >
        <i className="fa-solid fa-share-nodes text-lg"></i>
      </button>

      {/* Launch App Button */}
      <button 
        onClick={onLaunchApp}
        className="flex-grow bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white h-12 rounded-xl font-bold shadow-lg shadow-brand-500/20 transition flex items-center justify-center gap-2 group min-w-0"
      >
        <i className="fa-solid fa-play group-hover:scale-110 transition-transform"></i>
        <span className="truncate">{t.detail.launch_app}</span>
      </button>

      {/* Download Button (Desktop Only) */}
      <button 
        onClick={onDownload}
        className={`hidden md:flex flex-grow h-12 rounded-xl font-bold transition items-center justify-center gap-2 group ${
          isModal
            ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
            : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
        }`}
      >
        <span>{t.detail.download_source}</span>
        <i className="fa-solid fa-download group-hover:translate-y-1 transition-transform text-slate-400 group-hover:text-white"></i>
      </button>
    </div>
  );
}
