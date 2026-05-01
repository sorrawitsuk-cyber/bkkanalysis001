/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Activity, Calendar, ChevronRight, Leaf, MapPin, Trees } from "lucide-react";
import Link from "next/link";

interface GreenSpaceSidebarProps {
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  summary: any;
  loading: boolean;
  compareMode?: boolean;
}

export default function GreenSpaceSidebar({ onDistrictSelect, activeDistrict, summary, loading, compareMode }: GreenSpaceSidebarProps) {
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

  const yearlyDisplayTrend = compareMode && summary.yearlyDeltaTrend?.length
    ? summary.yearlyDeltaTrend
    : (summary.yearlyTrend || []);
  const trendValues = yearlyDisplayTrend.map((item: any) => Math.abs(Number(item[1]) || 0));
  const maxAbsTrend = Math.max(0.05, ...trendValues);
  const maxIncreaseValue = summary.maxIncreaseDelta ?? summary.max_delta ?? 0;
  const avgValue = summary.averageTemp || 0;
  const maxValue = summary.maxTemp || 0;

  return (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">
      <div className="p-5 border-b border-slate-800/60 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Trees className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 leading-none">พื้นที่สีเขียวเมือง</h1>
            <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest">{compareMode ? "Vegetation Anomaly" : "Bangkok Green Space (NDVI)"}</p>
          </div>
        </div>

        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> พื้นที่ (DISTRICT)
        </label>
        <select
          value={activeDistrict}
          onChange={(e) => onDistrictSelect(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-md px-3 py-2 appearance-none focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
        >
          <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
          {summary.ranking?.map(([d]: any) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Leaf className="w-3 h-3 text-emerald-400" /> {compareMode ? "ส่วนต่างเฉลี่ย" : "NDVI เฉลี่ย"}
            </div>
            <div className={`text-lg font-bold font-mono whitespace-nowrap ${compareMode ? (summary.avgDelta >= 0 ? "text-emerald-400" : "text-amber-400") : "text-slate-100"}`}>
              {compareMode ? (summary.avgDelta >= 0 ? `+${summary.avgDelta.toFixed(3)}` : summary.avgDelta.toFixed(3)) : avgValue.toFixed(3)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Trees className="w-3 h-3 text-green-500" /> {compareMode ? "เพิ่มสูงสุด" : "เขียวสูงสุด"}
            </div>
            <div className={`text-lg font-bold font-mono whitespace-nowrap ${compareMode && maxIncreaseValue < 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {compareMode ? `${maxIncreaseValue > 0 ? "+" : ""}${maxIncreaseValue.toFixed(3)}` : maxValue.toFixed(3)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Calendar className="w-3 h-3 text-cyan-400" /> {compareMode ? "ช่วงปี" : "ข้อมูลปี"}
            </div>
            <div className="text-sm font-bold text-cyan-400 font-mono leading-tight break-words">
              {compareMode ? `${summary.selectedYear} vs ${summary.compareYear}` : summary.selectedYear}
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-800/60" />

        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5 leading-tight">
            <Activity className="w-3 h-3" /> แนวโน้มพื้นที่สีเขียว (Trend)
          </h3>
          {compareMode && (
            <p className="text-[9px] text-slate-500 leading-snug mb-3">
              Yearly anomaly against {summary.compareYear}; green is increasing, amber is decreasing.
            </p>
          )}
          <div className="flex items-end gap-[3px] h-20 mb-2">
            {yearlyDisplayTrend.map((item: any, i: number) => {
              const year = item[0];
              const val = Number(item[1]) || 0;
              const pct = compareMode
                ? Math.max(4, Math.min(100, (Math.abs(val) / maxAbsTrend) * 100))
                : Math.max(4, Math.min(100, ((val - 0.2) / 0.5) * 100));
              const trendColor = compareMode
                ? (val >= 0 ? "from-lime-500 to-emerald-500" : "from-amber-500 to-red-600")
                : "from-lime-500 to-emerald-600";

              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  <div className={`w-full rounded-t-sm bg-gradient-to-t ${trendColor} min-h-[4px] transition-all duration-300 brightness-95 group-hover:brightness-110`} style={{ height: `${pct}%` }} />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-2 py-1 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono">
                    {year}: {val.toFixed(3)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 font-mono">
            <span>{yearlyDisplayTrend?.[0]?.[0]}</span>
            <span>{yearlyDisplayTrend?.[yearlyDisplayTrend?.length - 1]?.[0]}</span>
          </div>
        </section>

        <div className="h-px bg-slate-800/60" />

        <section className="flex-1 pb-10">
          <div className="flex justify-between items-start gap-2 mb-3">
            <h3 className="min-w-0 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-start gap-1.5 leading-tight">
              <MapPin className="w-3 h-3" /> {compareMode ? "อันดับพื้นที่เขียวเพิ่ม · Top Gains" : "อันดับพื้นที่สีเขียว · Ranking"}
            </h3>
            <button
              onClick={() => setShowAll(!showAll)}
              className="shrink-0 max-w-[74px] text-right text-[9px] leading-tight text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wide transition-colors"
            >
              {showAll ? "แสดงแค่ Top 10" : "แสดงทั้ง 50 เขต"}
            </button>
          </div>

          <div className="space-y-1.5">
            {(summary.ranking || []).slice(0, showAll ? 50 : 10).map(([district, val]: [string, number], i: number) => {
              const isSelected = activeDistrict === district;
              const min = summary.min_lst || 0.2;
              const max = summary.max_lst || 0.8;
              const pct = compareMode
                ? Math.min(100, (Math.abs(val) / Math.max(0.05, Math.abs(summary.max_delta || 0.2))) * 100)
                : ((val - min) / Math.max(0.01, max - min)) * 100;
              const displayVal = compareMode ? (val > 0 ? `+${val.toFixed(3)}` : val.toFixed(3)) : val.toFixed(3);
              const colorClass = compareMode ? (val >= 0 ? "text-emerald-400" : "text-amber-400") : "text-emerald-400";
              const barGradient = compareMode
                ? (val >= 0 ? "from-lime-500 to-emerald-500" : "from-amber-500 to-red-600")
                : "from-lime-500 to-emerald-500";

              return (
                <button
                  key={district}
                  onClick={() => onDistrictSelect(isSelected ? "ทั้งหมด" : district)}
                  className={`w-full group transition-all duration-200 ${activeDistrict !== "ทั้งหมด" && !isSelected ? "opacity-40 grayscale-[50%]" : "opacity-100 hover:scale-[1.02]"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className={`truncate pr-1 ${isSelected ? "text-emerald-400 font-bold" : "text-slate-300 group-hover:text-white"}`}>{district}</span>
                        <span className={`${colorClass} font-mono tabular-nums font-bold`}>{displayVal}</span>
                      </div>
                      <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${barGradient} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="p-4 border-t border-slate-800/60 text-center">
        <Link href="/earth-engine" className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest">
          กลับไปหน้าเกาะความร้อน <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
