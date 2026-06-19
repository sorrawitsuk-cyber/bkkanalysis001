"use client";

import { useEffect, useId, useRef } from "react";
import { BookOpen, Map, BarChart2, Table2 } from "lucide-react";

export type ViewMode = "map" | "stats" | "table" | "guide";

interface ViewTabsProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
  accentColor?: string;
}

const ACCENT: Record<string, string> = {
  orange: "bg-orange-500 text-slate-950",
  emerald: "bg-emerald-500 text-slate-950",
  indigo: "bg-indigo-500 text-white",
  sky: "bg-sky-500 text-slate-950",
  yellow: "bg-yellow-400 text-slate-950",
  cyan: "bg-cyan-400 text-slate-950",
  red: "bg-red-500 text-white",
};

const TABS = [
  { id: "map" as ViewMode, label: "แผนที่", description: "สำรวจตำแหน่งและเลือกพื้นที่", icon: Map },
  { id: "stats" as ViewMode, label: "สถิติ", description: "ดูภาพรวม แนวโน้ม และอันดับ", icon: BarChart2 },
  { id: "table" as ViewMode, label: "ตาราง", description: "ค้นหา เรียง และส่งออกข้อมูล", icon: Table2 },
  { id: "guide" as ViewMode, label: "วิธีอ่านผล", description: "ดูวิธีตีความตัวเลข สี และข้อจำกัดของข้อมูล", icon: BookOpen },
];

export default function ViewTabs({ view, onChange, accentColor = "cyan" }: ViewTabsProps) {
  const active = ACCENT[accentColor] ?? ACCENT.cyan;
  const tablistId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasReadInitialUrl = useRef(false);
  const initialRequestedView = useRef<ViewMode | null | undefined>(undefined);

  useEffect(() => {
    if (hasReadInitialUrl.current) return;
    hasReadInitialUrl.current = true;
    const requestedView = new URLSearchParams(window.location.search).get("view");
    const validView = TABS.some((tab) => tab.id === requestedView)
      ? (requestedView as ViewMode)
      : null;
    initialRequestedView.current = validView;
    if (validView && validView !== view) {
      onChange(validView);
    }
    // Read the initial URL once. Later changes are controlled by the page state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialRequestedView.current === undefined) return;
    if (initialRequestedView.current && initialRequestedView.current !== view) return;
    initialRequestedView.current = null;
    const url = new URL(window.location.href);
    if (view === "map") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    window.history.replaceState(window.history.state, "", url);
  }, [view]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index >= TABS.length) return;
      event.preventDefault();
      onChange(TABS[index].id);
      tabRefs.current[index]?.focus();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onChange]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TABS.findIndex((tab) => tab.id === view);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TABS.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    onChange(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="min-w-0">
      <div
        id={tablistId}
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80 p-1"
        role="tablist"
        aria-label="เลือกมุมมองข้อมูล"
        onKeyDown={handleKeyDown}
      >
        {TABS.map(({ id, label, description, icon: Icon }, index) => (
          <button
            key={id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            onClick={() => onChange(id)}
            role="tab"
            tabIndex={view === id ? 0 : -1}
            aria-selected={view === id}
            aria-label={`${label}: ${description}`}
            title={`${description} (Alt+${index + 1})`}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-3.5 ${
              view === id
                ? active
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1 hidden px-1 text-[9px] text-slate-500 xl:block" aria-live="polite">
        {TABS.find((tab) => tab.id === view)?.description}
        <span className="ml-2 text-slate-700">Alt+1 ถึง Alt+4 เพื่อสลับมุมมอง</span>
      </p>
    </div>
  );
}
