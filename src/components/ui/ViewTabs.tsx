"use client";

import { BookOpen, Map, BarChart2, Table2 } from "lucide-react";

export type ViewMode = "map" | "stats" | "table" | "guide";

interface ViewTabsProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
  accentColor?: string;
}

const ACCENT: Record<string, string> = {
  orange: "bg-orange-500 text-white shadow-orange-500/30",
  emerald: "bg-emerald-500 text-white shadow-emerald-500/30",
  indigo: "bg-indigo-500 text-white shadow-indigo-500/30",
  sky: "bg-sky-500 text-white shadow-sky-500/30",
  yellow: "bg-yellow-500 text-white shadow-yellow-500/30",
  cyan: "bg-cyan-500 text-white shadow-cyan-500/30",
  red: "bg-red-500 text-white shadow-red-500/30",
};

export default function ViewTabs({ view, onChange, accentColor = "cyan" }: ViewTabsProps) {
  const active = ACCENT[accentColor] ?? ACCENT.cyan;

  const tabs = [
    { id: "map" as ViewMode, label: "แผนที่", icon: Map },
    { id: "stats" as ViewMode, label: "สถิติ", icon: BarChart2 },
    { id: "table" as ViewMode, label: "ตาราง", icon: Table2 },
    { id: "guide" as ViewMode, label: "คำอธิบาย", icon: BookOpen },
  ];

  return (
    <div
      className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80 p-1"
      role="tablist"
      aria-label="เลือกมุมมองข้อมูล"
    >
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          role="tab"
          aria-selected={view === id}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-3.5 ${
            view === id
              ? `${active} shadow-md`
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
