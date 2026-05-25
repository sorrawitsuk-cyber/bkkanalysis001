export default function MapSkeleton() {
  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 animate-pulse">
        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900" />
        {/* Fake district polygon hints */}
        <div className="absolute top-[20%] left-[25%] w-[50%] h-[60%] border border-slate-800/40 rounded-lg" />
        <div className="absolute top-[30%] left-[35%] w-[30%] h-[40%] border border-slate-800/30 rounded-md" />
        <div className="absolute top-[25%] left-[20%] w-[20%] h-[25%] bg-slate-800/20 rounded" />
        <div className="absolute top-[45%] left-[40%] w-[25%] h-[20%] bg-slate-800/20 rounded" />
        <div className="absolute top-[35%] left-[55%] w-[15%] h-[30%] bg-slate-800/15 rounded" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
        <span className="text-slate-500 text-[11px] font-medium tracking-widest uppercase">กำลังโหลดแผนที่…</span>
      </div>
    </div>
  );
}
