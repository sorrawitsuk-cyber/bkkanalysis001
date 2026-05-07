/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Building2, Calendar, ChevronRight, Droplets, Flame, Home, MapPin, Moon, ShieldAlert, Trees } from "lucide-react";

interface NightLightsSidebarProps {
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  summary: any;
  loading: boolean;
  compareMode?: boolean;
}

const ALL_DISTRICTS = "ทั้งหมด";

function formatRadiance(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", { maximumFractionDigits: digits });
}

export default function NightLightsSidebar({ onDistrictSelect, activeDistrict, summary, loading, compareMode }: NightLightsSidebarProps) {
  const [showAll, setShowAll] = useState(false);

  if (loading || !summary) {
    return (
      <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 p-5 flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto hidden md:flex">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-slate-800/50 rounded w-3/4" />
          <div className="h-24 bg-slate-800/50 rounded" />
          <div className="h-40 bg-slate-800/50 rounded" />
          <div className="h-64 bg-slate-800/50 rounded" />
        </div>
      </div>
    );
  }

  const rankingRows: [string, number, number | null][] = summary.ranking || [];
  const yearlyTrend = (summary.yearlyTrend || []).filter((item: any) => item[1] !== null);
  const trendValues = yearlyTrend.map((item: any) => Number(item[1]) || 0);
  const maxTrend = Math.max(1, ...trendValues);
  const rankingValues = rankingRows.map((row) => Number(row[1])).filter(Number.isFinite);
  const minRank = compareMode ? Math.min(0, ...rankingValues) : 0;
  const maxRank = compareMode
    ? Math.max(1, ...rankingValues.map((value) => Math.abs(value)))
    : Math.max(1, ...rankingValues);

  return (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">
      <div className="p-5 border-b border-slate-800/60 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-yellow-400/15 text-yellow-200 flex items-center justify-center border border-yellow-300/30">
            <Moon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-100 leading-tight">Nighttime Lights</h1>
            <p className="text-[10px] text-yellow-100 mt-1 font-bold leading-snug">ความเข้มกิจกรรมเมืองกลางคืนจาก VIIRS DNB</p>
          </div>
        </div>
        <p className="mb-3 text-[10px] leading-relaxed text-slate-400">
          วิเคราะห์ค่า radiance เฉลี่ยรายปีจากแสงกลางคืน เพื่อดูศูนย์กลางกิจกรรมเมือง พื้นที่พาณิชยกรรม และการเปลี่ยนแปลงความเข้มเมืองรายเขต
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {["VIIRS DNB", "avg_rad", "500m", "2014-2025"].map((badge) => (
            <span key={badge} className="rounded-full border border-yellow-300/25 bg-yellow-300/10 px-2 py-1 text-[9px] font-bold text-yellow-100">
              {badge}
            </span>
          ))}
        </div>

        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> พื้นที่ (District)
        </label>
        <select
          value={activeDistrict}
          onChange={(event) => onDistrictSelect(event.target.value)}
          className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-md px-3 py-2 appearance-none focus:outline-none focus:border-yellow-300/50 transition-colors cursor-pointer"
        >
          <option value={ALL_DISTRICTS}>กรุงเทพมหานคร (ทั้งหมด)</option>
          {rankingRows.map(([district]) => (
            <option key={district} value={district}>{district}</option>
          ))}
        </select>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Moon className="w-3 h-3 text-yellow-200" /> ค่าเฉลี่ย
            </div>
            <div className="text-sm font-bold font-mono whitespace-nowrap text-slate-100">
              {formatRadiance(summary.averageRadiance)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Activity className="w-3 h-3 text-orange-300" /> {compareMode ? "เพิ่มสูงสุด" : "ค่าสูงสุด"}
            </div>
            <div className="text-sm font-bold font-mono whitespace-nowrap text-orange-300">
              {compareMode ? formatRadiance(summary.maxDelta) : formatRadiance(summary.maxRadiance)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Calendar className="w-3 h-3 text-sky-300" /> ปีข้อมูล
            </div>
            <div className="text-sm font-bold text-sky-300 font-mono leading-tight break-words">
              {compareMode ? `${summary.selectedYear} vs ${summary.compareYear}` : summary.selectedYear}
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-800/60" />

        <section>
          <h3 className="mb-2 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-center gap-1.5 leading-tight">
            <Activity className="w-3 h-3" /> แนวโน้มรายปี
          </h3>
          <p className="text-[9px] text-slate-500 leading-snug mb-3">
            ค่าเฉลี่ย radiance ของ{activeDistrict === ALL_DISTRICTS ? "กรุงเทพฯ ทั้งหมด" : activeDistrict} รายปี หน่วย nW/sr/cm²
          </p>
          <div className="flex items-end gap-[3px] h-20 mb-2">
            {yearlyTrend.map((item: any) => {
              const [year, value] = item;
              const pct = Math.max(4, Math.min(100, (Number(value) / maxTrend) * 100));
              return (
                <div key={year} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  <div className="w-full rounded-t-sm bg-gradient-to-t from-blue-700 via-yellow-300 to-white min-h-[4px] transition-all duration-300 brightness-95 group-hover:brightness-110" style={{ height: `${pct}%` }} />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-2 py-1 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono">
                    {year}: {formatRadiance(value, 3)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 font-mono">
            <span>{yearlyTrend?.[0]?.[0]}</span>
            <span>{yearlyTrend?.[yearlyTrend?.length - 1]?.[0]}</span>
          </div>
        </section>

        <div className="h-px bg-slate-800/60" />

        <section>
          <h3 className="mb-2 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-center gap-1.5 leading-tight">
            <Calendar className="w-3 h-3" /> คุณภาพข้อมูลรายปี
          </h3>
          <div className="rounded-xl border border-yellow-300/20 bg-yellow-300/10 p-3">
            <div className="text-[10px] font-bold text-yellow-100">Annual V2.2 · average_masked</div>
            <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
              ชุดข้อมูล annual ถูกสร้างจาก monthly cloud-free radiance และผ่านการกรองค่าผิดปกติ/พื้นหลัง จึงเหมาะกับการเปรียบเทียบรายปีรายเขตมากกว่าการเอา monthly ดิบมารวมเองในหน้าโหลดแรก
            </p>
          </div>
        </section>

        <div className="h-px bg-slate-800/60" />

        <section className="flex-1 pb-10">
          <div className="flex justify-between items-start gap-2 mb-3">
            <h3 className="min-w-0 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-start gap-1.5 leading-tight">
              <MapPin className="w-3 h-3" /> {compareMode ? "อันดับแสงกลางคืนเพิ่มขึ้นรายเขต" : "อันดับความเข้มแสงกลางคืนรายเขต"}
            </h3>
            <button
              onClick={() => setShowAll(!showAll)}
              className="shrink-0 max-w-[74px] text-right text-[9px] leading-tight text-yellow-200 hover:text-yellow-100 font-bold uppercase tracking-wide transition-colors"
            >
              {showAll ? "แสดง Top 10" : "แสดงทั้งหมด"}
            </button>
          </div>

          <div className="space-y-1.5">
            {rankingRows.slice(0, showAll ? 50 : 10).map(([district, value], index) => {
              const isSelected = activeDistrict === district;
              const pct = compareMode
                ? Math.min(100, (Math.abs(Number(value)) / maxRank) * 100)
                : Math.min(100, ((Number(value) - minRank) / Math.max(0.01, maxRank - minRank)) * 100);
              const valueClass = compareMode ? (Number(value) >= 0 ? "text-amber-300" : "text-sky-300") : "text-yellow-200";
              const barClass = compareMode
                ? Number(value) >= 0 ? "from-yellow-400 to-orange-500" : "from-sky-500 to-blue-700"
                : "from-blue-700 via-yellow-300 to-white";

              return (
                <button
                  key={district}
                  onClick={() => onDistrictSelect(isSelected ? ALL_DISTRICTS : district)}
                  className={`w-full group transition-all duration-200 ${activeDistrict !== ALL_DISTRICTS && !isSelected ? "opacity-40 grayscale-[50%]" : "opacity-100 hover:scale-[1.02]"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 w-4 text-right font-mono shrink-0">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className={`truncate pr-1 ${isSelected ? "text-yellow-200 font-bold" : "text-slate-300 group-hover:text-white"}`}>{district}</span>
                        <span className={`${valueClass} font-mono tabular-nums font-bold`}>{compareMode && Number(value) > 0 ? "+" : ""}{formatRadiance(value, 3)}</span>
                      </div>
                      <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${barClass} rounded-full transition-all duration-700`} style={{ width: `${Math.max(4, pct)}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="p-4 border-t border-slate-800/60 text-center flex flex-col items-center gap-2">
        <Link href="/" className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">
          <Home className="w-3 h-3" /> หน้า Home ศูนย์วิเคราะห์เมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/traffy" className="inline-flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors uppercase tracking-widest">
          <ShieldAlert className="w-3 h-3" /> วิเคราะห์ปัญหาเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/heat-island" className="inline-flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors uppercase tracking-widest">
          <Flame className="w-3 h-3" /> วิเคราะห์เกาะความร้อนเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/green-space" className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest">
          <Trees className="w-3 h-3" /> วิเคราะห์พื้นที่สีเขียวเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/urban-expansion" className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest">
          <Building2 className="w-3 h-3" /> วิเคราะห์การขยายตัวเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/flood-risk" className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors uppercase tracking-widest">
          <Droplets className="w-3 h-3" /> วิเคราะห์น้ำท่วม/แหล่งน้ำ <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
