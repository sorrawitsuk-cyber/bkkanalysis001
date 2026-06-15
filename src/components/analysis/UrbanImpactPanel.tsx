"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Database, Users } from "lucide-react";
import type { UrbanImpactRow } from "@/lib/urban-impact";

function formatValue(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  const digits = unit === "%" || unit === "มม." ? 1 : 0;
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: digits })} ${unit}`;
}

export default function UrbanImpactPanel({
  rows,
  activeDistrict,
  onDistrictSelect,
  title = "พื้นที่ที่ควรตรวจสอบร่วม",
  description = "เรียงจากฝน สัญญาณน้ำ เหตุร้องเรียน และจำนวนประชากรที่มีข้อมูล",
  compact = false,
}: {
  rows: UrbanImpactRow[];
  activeDistrict?: string;
  onDistrictSelect?: (district: string) => void;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const displayed = rows
    .filter((row) => !activeDistrict || activeDistrict === "ทั้งหมด" || row.district === activeDistrict)
    .slice(0, compact ? 5 : 10);
  const completeCount = rows.filter((row) => row.coveragePct === 100).length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/45">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-black text-slate-100">{title}</h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-[9px] text-slate-400">
          <Database className="h-3 w-3 text-cyan-400" />
          ข้อมูลครบทุกมิติ {completeCount}/{rows.length} เขต
        </div>
      </div>

      <div className="divide-y divide-slate-800/70">
        {displayed.map((row, index) => (
          <button
            key={row.district}
            type="button"
            onClick={() => onDistrictSelect?.(row.district)}
            className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/35 md:grid-cols-[2fr_0.7fr_3fr]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-5 text-right text-[10px] font-bold text-slate-600">{index + 1}</span>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-slate-200">เขต{row.district}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-slate-500">
                  <Users className="h-3 w-3" />
                  {formatValue(row.population, "คน")}
                  <span>· ครบ {row.coveragePct}%</span>
                </div>
              </div>
            </div>
            <div>
              <div className={`text-lg font-black tabular-nums ${
                row.score === null ? "text-slate-600" : row.score >= 75 ? "text-red-300" : row.score >= 55 ? "text-orange-300" : "text-cyan-300"
              }`}>
                {row.score?.toFixed(1) ?? "–"}
              </div>
              <div className="text-[9px] text-slate-500">{row.level} · /100</div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] sm:grid-cols-3">
              {row.components.map((component) => (
                <div key={component.key} className="min-w-0">
                  <span className="block truncate text-slate-600">{component.label}</span>
                  <span className="font-bold tabular-nums text-slate-300">
                    {formatValue(component.rawValue, component.unit)}
                  </span>
                </div>
              ))}
            </div>
          </button>
        ))}
        {displayed.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-8 text-xs text-slate-500">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            ยังไม่มีข้อมูลเพียงพอสำหรับพื้นที่ที่เลือก
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-[9px] text-slate-500">
        <span>คะแนนนี้ใช้คัดกรองพื้นที่เพื่อสำรวจต่อ ไม่ใช่การพยากรณ์น้ำท่วม</span>
        <div className="flex gap-3">
          <Link href="/rainfall?view=stats" className="flex items-center gap-1 font-bold text-cyan-300 hover:text-cyan-200">
            ดูฝน <ArrowRight className="h-3 w-3" />
          </Link>
          <Link href="/population?view=stats" className="flex items-center gap-1 font-bold text-indigo-300 hover:text-indigo-200">
            ดูประชากร <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
