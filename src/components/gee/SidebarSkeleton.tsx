export default function SidebarSkeleton() {
  return (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 p-5 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto hidden md:flex">
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-slate-800/50 rounded w-3/4" />
        <div className="h-24 bg-slate-800/50 rounded" />
        <div className="h-40 bg-slate-800/50 rounded" />
        <div className="h-64 bg-slate-800/50 rounded" />
      </div>
    </div>
  );
}
