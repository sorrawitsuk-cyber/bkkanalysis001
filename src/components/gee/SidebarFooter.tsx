"use client";

import Link from "next/link";
import { Building2, ChevronRight, Droplets, Flame, Gauge, Home, Moon, ShieldAlert, Trees, Wind } from "lucide-react";

export type NavKey = "home" | "decision-support" | "traffy" | "heat-island" | "green-space" | "urban-expansion" | "flood-risk" | "nighttime-lights" | "air-quality";

const NAV_ITEMS: Array<{ key: NavKey; href: string; label: string; icon: React.ReactNode; colorClass: string }> = [
  { key: "home",              href: "/",                  label: "หน้า Home ศูนย์วิเคราะห์เมือง",    icon: <Home className="w-3 h-3" />,         colorClass: "text-cyan-400 hover:text-cyan-300"    },
  { key: "decision-support",  href: "/decision-support",  label: "จัดลำดับการดำเนินงาน",             icon: <Gauge className="w-3 h-3" />,        colorClass: "text-violet-400 hover:text-violet-300"},
  { key: "traffy",            href: "/traffy",             label: "วิเคราะห์ปัญหาเมือง",               icon: <ShieldAlert className="w-3 h-3" />,   colorClass: "text-orange-400 hover:text-orange-300"},
  { key: "heat-island",       href: "/heat-island",        label: "วิเคราะห์เกาะความร้อนเมือง",        icon: <Flame className="w-3 h-3" />,         colorClass: "text-red-400 hover:text-red-300"      },
  { key: "green-space",       href: "/green-space",        label: "วิเคราะห์พื้นที่สีเขียวเมือง",      icon: <Trees className="w-3 h-3" />,         colorClass: "text-emerald-400 hover:text-emerald-300"},
  { key: "urban-expansion",   href: "/urban-expansion",    label: "วิเคราะห์การขยายตัวเมือง",          icon: <Building2 className="w-3 h-3" />,     colorClass: "text-indigo-400 hover:text-indigo-300"},
  { key: "flood-risk",        href: "/flood-risk",         label: "วิเคราะห์น้ำท่วม/แหล่งน้ำ",         icon: <Droplets className="w-3 h-3" />,      colorClass: "text-sky-400 hover:text-sky-300"      },
  { key: "nighttime-lights",  href: "/nighttime-lights",   label: "วิเคราะห์แสงกลางคืน",               icon: <Moon className="w-3 h-3" />,          colorClass: "text-yellow-400 hover:text-yellow-300"},
  { key: "air-quality",       href: "/air-quality",        label: "วิเคราะห์มลพิษอากาศ",               icon: <Wind className="w-3 h-3" />,          colorClass: "text-teal-400 hover:text-teal-300"   },
];

interface SidebarFooterProps {
  exclude?: NavKey[];
}

export default function SidebarFooter({ exclude = [] }: SidebarFooterProps) {
  const items = NAV_ITEMS.filter((item) => !exclude.includes(item.key));
  return (
    <div className="p-4 border-t border-slate-800/60 text-center flex flex-col items-center gap-2">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`inline-flex items-center gap-1 text-[10px] transition-colors uppercase tracking-widest ${item.colorClass}`}
        >
          {item.icon} {item.label} <ChevronRight className="w-3 h-3" />
        </Link>
      ))}
    </div>
  );
}
