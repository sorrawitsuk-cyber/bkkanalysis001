"use client";

import { useId, type ReactNode } from "react";
import { PanelLeftOpen, X } from "lucide-react";
import { useMobileDrawerFocus } from "@/components/map/useMobileDrawerFocus";

interface ResponsivePageSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export default function ResponsivePageSidebar({ open, onOpenChange, children }: ResponsivePageSidebarProps) {
  const sidebarId = useId();
  const { isMobile, panelRef, triggerRef } = useMobileDrawerFocus(open, onOpenChange);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(true)}
        aria-controls={sidebarId}
        aria-expanded={open}
        className={`${open ? "hidden" : "flex"} fixed bottom-4 left-4 z-[1800] items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-[11px] font-bold text-slate-100 shadow-lg lg:hidden`}
        data-testid="mobile-page-sidebar-button"
      >
        <PanelLeftOpen className="h-4 w-4" />
        ข้อมูลและอันดับ
      </button>

      {open && (
        <button
          type="button"
          aria-label="ปิดข้อมูลและอันดับจากพื้นหลัง"
          className="fixed inset-0 z-[1900] bg-slate-950/75 lg:hidden"
          onClick={() => onOpenChange(false)}
        />
      )}

      <aside
        ref={panelRef}
        id={sidebarId}
        className={`${
          open
            ? "fixed inset-y-0 left-0 z-[2000] flex w-[min(22rem,calc(100vw-1rem))]"
            : "hidden"
        } relative h-full shrink-0 flex-col overflow-hidden border-r border-slate-800/70 bg-[#0f172a]/98 text-slate-200 shadow-2xl lg:static lg:z-auto lg:flex lg:w-80`}
        data-testid="responsive-page-sidebar"
        role={open && isMobile ? "dialog" : "complementary"}
        aria-modal={open && isMobile ? true : undefined}
        aria-label="ข้อมูลและอันดับพื้นที่"
      >
        <button
          data-drawer-close
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white lg:hidden"
          aria-label="ปิดข้อมูลและอันดับ"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </aside>
    </>
  );
}
