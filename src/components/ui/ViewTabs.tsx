"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Map, BarChart2, Table2 } from "lucide-react";

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
  { id: "map" as ViewMode, label: "แผนที่", description: "เลือกพื้นที่และดูรูปแบบเชิงพื้นที่", icon: Map },
  { id: "stats" as ViewMode, label: "สถิติโต้ตอบ", description: "เทียบอันดับ แนวโน้ม และกราฟของข้อมูลชุดนี้", icon: BarChart2 },
  { id: "table" as ViewMode, label: "ตาราง", description: "ค้นหา เรียง และส่งออกข้อมูลรายพื้นที่", icon: Table2 },
  { id: "guide" as ViewMode, label: "วิธีอ่านผล", description: "อ่านวิธีตีความ สถานะข้อมูล และข้อจำกัด", icon: BookOpen },
];

const WORKFLOW_COPY: Record<ViewMode, { title: string; detail: string; action: string; target: ViewMode }> = {
  map: {
    title: "เลือกพื้นที่แล้วไปต่อที่สถิติ",
    detail: "หลังคลิกเขตหรือปรับช่วงเวลา เปิดสถิติโต้ตอบเพื่อดูอันดับ กราฟ และค่าที่เปลี่ยนตามตัวกรองเดียวกัน",
    action: "ดูสถิติโต้ตอบ",
    target: "stats",
  },
  stats: {
    title: "กำลังดูสถิติโต้ตอบของข้อมูลชุดนี้",
    detail: "กราฟและอันดับใช้ตัวกรองเดียวกับแผนที่ หากต้องเลือกพื้นที่ใหม่ให้กลับไปที่แผนที่",
    action: "กลับไปเลือกพื้นที่",
    target: "map",
  },
  table: {
    title: "ตารางนี้เชื่อมกับสถิติชุดเดียวกัน",
    detail: "เมื่อเจอพื้นที่ที่สนใจจากตาราง ให้เปิดสถิติโต้ตอบเพื่อดูอันดับและแนวโน้มของข้อมูลเดียวกัน",
    action: "ดูสถิติโต้ตอบ",
    target: "stats",
  },
  guide: {
    title: "อ่านข้อจำกัดแล้วตรวจตัวเลขต่อ",
    detail: "ใช้กรอบหลักฐานในหน้านี้ประกอบการอ่านกราฟและอันดับในมุมมองสถิติโต้ตอบ",
    action: "เปิดสถิติโต้ตอบ",
    target: "stats",
  },
};

export default function ViewTabs({ view, onChange, accentColor = "cyan" }: ViewTabsProps) {
  const active = ACCENT[accentColor] ?? ACCENT.cyan;
  const tablistId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasReadInitialUrl = useRef(false);
  const initialRequestedView = useRef<ViewMode | null | undefined>(undefined);
  const activeCopy = WORKFLOW_COPY[view];

  const changeView = useCallback((nextView: ViewMode) => {
    onChange(nextView);
    const url = new URL(window.location.href);
    if (nextView === "map") url.searchParams.delete("view");
    else url.searchParams.set("view", nextView);
    window.history.replaceState(window.history.state, "", url);
  }, [onChange]);

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
      changeView(TABS[index].id);
      tabRefs.current[index]?.focus();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [changeView]);

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
    changeView(TABS[nextIndex].id);
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
            onClick={() => changeView(id)}
            role="tab"
            tabIndex={view === id ? 0 : -1}
            aria-selected={view === id}
            data-view-tab={id}
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
      <div className="mt-2 hidden max-w-[620px] items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px] text-slate-400 xl:flex">
        <div className="min-w-0">
          <div className="font-bold text-slate-200">{activeCopy.title}</div>
          <div className="mt-0.5 leading-4">{activeCopy.detail}</div>
        </div>
        <button
          type="button"
          onClick={() => changeView(activeCopy.target)}
          className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          data-testid="view-tabs-stats-link"
        >
          {activeCopy.target === "stats" ? <ArrowRight className="h-3 w-3" /> : <ArrowLeft className="h-3 w-3" />}
          {activeCopy.action}
        </button>
      </div>
    </div>
  );
}
