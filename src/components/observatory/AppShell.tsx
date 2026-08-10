"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Map, MapPinned, Satellite } from "lucide-react";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "วิเคราะห์เมือง", shortLabel: "วิเคราะห์", icon: Map },
  { href: "/areas", label: "พื้นที่ศึกษา", shortLabel: "พื้นที่", icon: MapPinned },
  { href: "/evidence", label: "หลักฐานข้อมูล", shortLabel: "ข้อมูล", icon: Database },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="oe-dark-shell min-h-screen bg-[var(--oe-bg)] text-[var(--oe-ink)]">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--oe-line)] bg-[color:var(--oe-surface-strong)]">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="flex min-h-11 min-w-0 items-center gap-3 rounded-[var(--radius-control)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] focus-visible:ring-offset-2"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--oe-primary)] text-white">
              <Satellite aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-5">Bangkok City Observatory</span>
              <span className="hidden truncate text-xs text-[var(--oe-muted)] sm:block">อ่านสัญญาณเมืองจากแผนที่และข้อมูลที่ตรวจสอบได้</span>
            </span>
          </Link>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-[var(--oe-info-soft)] px-3 text-xs font-semibold text-[var(--oe-info-ink)]">
              <span className="h-2 w-2 rounded-full bg-[var(--oe-info)]" aria-hidden="true" />
              แสดงเฉพาะข้อมูลที่พร้อมใช้งาน
            </span>
          </div>
        </div>

        <nav aria-label="เมนูหลัก" className="border-t border-[var(--oe-line-soft)]">
          <div className="mx-auto grid max-w-[1600px] grid-cols-3 px-1 sm:flex sm:gap-1 sm:px-5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-center gap-1.5 border-b-2 px-1 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--oe-primary)] sm:shrink-0 sm:gap-2 sm:px-3 sm:text-sm ${
                    isActive
                      ? "border-[var(--oe-primary)] text-[var(--oe-primary-ink)]"
                      : "border-transparent text-[var(--oe-muted)] hover:text-[var(--oe-ink)]"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}
