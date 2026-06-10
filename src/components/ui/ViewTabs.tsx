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
    <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1 backdrop-blur-sm">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-bold transition-all duration-200 ${
            view === id
              ? `${active} shadow-md`
              : "text-slate-500 hover:text-slate-200"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
