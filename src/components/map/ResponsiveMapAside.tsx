"use client";

import { useId, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";

interface ResponsiveMapAsideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function ResponsiveMapAside({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: ResponsiveMapAsideProps) {
  const asideId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-controls={asideId}
        aria-expanded={open}
        className={`${open ? "hidden" : "flex"} fixed bottom-4 right-4 z-[1800] items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-[11px] font-bold text-slate-100 shadow-lg lg:hidden`}
        data-testid="mobile-map-controls-button"
      >
        <SlidersHorizontal className="h-4 w-4" />
        ตัวกรองแผนที่
      </button>

      {open && (
        <button
          type="button"
          aria-label="ปิดแผงตัวกรองจากพื้นหลัง"
          className="fixed inset-0 z-[1900] bg-slate-950/75 lg:hidden"
          onClick={() => onOpenChange(false)}
        />
      )}

      <aside
        id={asideId}
        className={`${
          open
            ? "fixed inset-y-0 right-0 z-[2000] block w-[min(22rem,calc(100vw-1rem))]"
            : "hidden"
        } shrink-0 overflow-y-auto border-l border-slate-800/70 bg-[#0f172a]/98 p-4 shadow-2xl lg:static lg:z-auto lg:block lg:w-80`}
        data-testid="responsive-map-aside"
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3 lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-100">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-[9px] text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white"
            aria-label="ปิดแผงตัวกรอง"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
