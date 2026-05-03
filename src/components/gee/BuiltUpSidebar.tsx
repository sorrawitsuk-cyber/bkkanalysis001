/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Building2, MapPin, Calendar, Activity, ChevronRight, Trees, Home, ShieldAlert } from "lucide-react";
import Link from "next/link";

interface BuiltUpSidebarProps {
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  summary: any;
  loading: boolean;
  compareMode?: boolean;
}

export default function BuiltUpSidebar({ onDistrictSelect, activeDistrict, summary, loading, compareMode }: BuiltUpSidebarProps) {
  const [showAll, setShowAll] = useState(false);
  
  // Skeleton Loader
  if (loading || !summary) {
    return (
      <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 p-5 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto hidden md:flex">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-slate-800/50 rounded w-3/4"></div>
          <div className="h-24 bg-slate-800/50 rounded"></div>
          <div className="h-40 bg-slate-800/50 rounded"></div>
          <div className="h-64 bg-slate-800/50 rounded"></div>
        </div>
      </div>
    );
  }

  const yearlyDisplayTrend = compareMode && summary.yearlyDeltaTrend?.length
    ? summary.yearlyDeltaTrend
    : (summary.yearlyTrend || []);
  const trendValues = yearlyDisplayTrend.map((item: any) => Math.abs(Number(item[1]) || 0));
  const maxAbsTrend = Math.max(0.1, ...trendValues);
  const maxIncreaseValue = summary.maxIncreaseDelta ?? summary.max_delta ?? 0;
  
  const rankingDisplayRows = summary.ranking || [];
  const rankingValues = rankingDisplayRows.map((row: any) => Number(row[1])).filter(Number.isFinite);
  const rankingMin = rankingValues.length ? Math.min(...rankingValues) : (summary.min_lst || -0.2);
  const rankingMax = rankingValues.length ? Math.max(...rankingValues) : (summary.max_lst || 0.4);

  return (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">
      
      {/* Header */}
      <div className="p-5 border-b border-slate-800/60 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-100 leading-tight">Built-up Area (NDBI)</h1>
            <p className="text-[10px] text-indigo-200 mt-1 font-bold leading-snug">ดัชนีพื้นที่สิ่งปลูกสร้างและการขยายตัวเมือง</p>
          </div>
        </div>
        <p className="mb-3 text-[10px] leading-relaxed text-slate-400">
          แสดงความหนาแน่นของสิ่งปลูกสร้าง อาคาร และคอนกรีต จากข้อมูลดาวเทียม Sentinel-2 (ความละเอียด 10 เมตร) เพื่อวิเคราะห์การขยายตัวของเมือง
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {["Sentinel-2 10m", "Urban Expansion", "NDBI Index"].map((badge) => (
            <span key={badge} className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[9px] font-bold text-indigo-200">
              {badge}
            </span>
          ))}
        </div>

        {/* District Filter */}
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> พื้นที่ (DISTRICT)
          </label>
          <div className="relative">
            <select
              value={activeDistrict}
              onChange={(e) => onDistrictSelect(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-md px-3 py-2 appearance-none focus:outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
            >
              <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
              {rankingDisplayRows?.map(([d]: any) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-6">
        
        {/* Main KPI */}
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Building2 className="w-3 h-3 text-indigo-400"/> {compareMode ? 'ส่วนต่าง NDBI' : 'NDBI เฉลี่ย'}
            </div>
            <div className={`text-lg font-bold font-mono whitespace-nowrap ${compareMode ? (summary.avgDelta > 0 ? 'text-indigo-400' : 'text-slate-400') : 'text-slate-100'}`}>
              {compareMode ? (summary.avgDelta > 0 ? `+${summary.avgDelta.toFixed(3)}` : summary.avgDelta.toFixed(3)) : summary.averageTemp?.toFixed(3)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Activity className="w-3 h-3 text-red-400"/> {compareMode ? 'เพิ่มขึ้นสูงสุด' : 'สิ่งปลูกสร้างหนาแน่นสุด'}
            </div>
            <div className={`text-lg font-bold font-mono whitespace-nowrap ${compareMode && maxIncreaseValue <= 0 ? 'text-slate-400' : 'text-red-400'}`}>
              {compareMode ? `${maxIncreaseValue > 0 ? '+' : ''}${maxIncreaseValue.toFixed(3)}` : (summary.maxTemp || 0).toFixed(3)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Calendar className="w-3 h-3 text-emerald-400"/> {compareMode ? 'ช่วงปี' : 'ข้อมูลปี'}
            </div>
            <div className="text-sm font-bold text-emerald-400 font-mono leading-tight break-words">
              {compareMode ? `${summary.selectedYear} vs ${summary.compareYear}` : summary.selectedYear}
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-800/60" />

        {/* Historical Trend Chart */}
        <section>
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-center gap-1.5 leading-tight">
              <Activity className="w-3 h-3" /> แนวโน้มการขยายตัว (Trend)
            </h3>
          </div>
          {!compareMode && (
            <p className="text-[9px] text-slate-500 leading-snug mb-3">
              แสดงค่า NDBI เฉลี่ยรายปี ค่าที่สูงขึ้นหมายถึงสิ่งปลูกสร้างหนาแน่นขึ้น
            </p>
          )}
          {compareMode && (
            <p className="text-[9px] text-slate-500 leading-snug mb-3">
              ผลต่าง NDBI เทียบกับปี {summary.compareYear}; สีม่วง/แดงคือเมืองขยายตัว สีเขียวคือเมืองลดลงหรือพื้นที่สีเขียวเพิ่ม
            </p>
          )}
          <div className="flex items-end gap-[3px] h-20 mb-2">
            {yearlyDisplayTrend.map((item: any, i: number) => {
              const year = item[0];
              const temp = item[1];
              
              const minT = -0.1;
              const maxT = 0.3;
              const pct = compareMode
                ? Math.max(4, Math.min(100, (Math.abs(temp) / maxAbsTrend) * 100))
                : Math.max(0, Math.min(100, ((temp - minT) / (maxT - minT)) * 100));
              const trendColor = compareMode
                ? (temp >= 0 ? 'from-indigo-600 to-red-500' : 'from-emerald-300 to-emerald-600')
                : 'from-slate-600 to-indigo-400';

              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  <div
                    className={`w-full rounded-t-sm bg-gradient-to-t ${trendColor} min-h-[4px] transition-all duration-300 brightness-95 group-hover:brightness-110`}
                    style={{ height: `${pct}%` }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-2 py-1 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono flex flex-col items-center">
                    <span>{year}: {temp.toFixed(3)}</span>
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

        {/* Encroachment Insight */}
        {compareMode && summary.encroachmentRanking && summary.encroachmentRanking.length > 0 && (
          <>
            <section className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 p-3 opacity-20"><Trees className="w-12 h-12 text-rose-500" /></div>
              <h3 className="text-[10px] font-bold text-rose-400 uppercase tracking-[0.1em] flex items-center gap-1.5 mb-2 relative z-10">
                <ShieldAlert className="w-3.5 h-3.5" /> การรุกล้ำพื้นที่สีเขียว
              </h3>
              <p className="text-[9px] text-slate-300 mb-3 relative z-10 leading-relaxed">
                เขตที่เมืองขยายตัว (NDBI+) สัมพันธ์กับพื้นที่สีเขียวที่ลดลง (NDVI-) รวดเร็วที่สุด:
              </p>
              <div className="space-y-2 relative z-10">
                {summary.encroachmentRanking.map((item: any, i: number) => (
                  <div key={item.district_name} className="flex flex-col bg-slate-900/50 rounded p-2 border border-rose-500/10">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-200">{i + 1}. {item.district_name}</span>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono">
                      <span className="text-rose-400">สิ่งปลูกสร้าง +{item.ndbiDelta.toFixed(3)}</span>
                      <span className="text-emerald-400">สีเขียว {item.ndviDelta.toFixed(3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <div className="h-px bg-slate-800/60" />
          </>
        )}

        {/* Ranking */}
        <section className="flex-1 pb-10">
          <div className="flex justify-between items-start gap-2 mb-3">
            <h3 className="min-w-0 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-start gap-1.5 leading-tight">
              <MapPin className="w-3 h-3" /> {compareMode ? 'อันดับ NDBI เพิ่มขึ้น · Urban Growth' : "NDBI เฉลี่ยรายเขต · Density"}
            </h3>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button 
                onClick={() => setShowAll(!showAll)}
                className="max-w-[74px] text-right text-[9px] leading-tight text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wide transition-colors"
              >
                {showAll ? 'แสดงแค่ Top 10' : 'แสดงทั้ง 50 เขต'}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {rankingDisplayRows.slice(0, showAll ? 50 : 10).map(([district, val]: [string, number], i: number) => {
              let pct = 0;
              const isSelected = activeDistrict === district;
              if (compareMode) {
                const maxD = Math.abs(summary.max_delta || 0.1);
                pct = Math.min(100, (Math.abs(val) / maxD) * 100);
              } else {
                const min = rankingMin;
                const max = rankingMax;
                pct = max > min ? ((val - min) / (max - min)) * 100 : 100;
              }

              const displayVal = compareMode ? (val > 0 ? `+${val.toFixed(3)}` : val.toFixed(3)) : val.toFixed(3);
              const colorClass = compareMode ? (val > 0 ? 'text-red-400' : 'text-emerald-400') : 'text-indigo-400';
              const barGradient = compareMode 
                ? (val > 0 ? 'from-indigo-500 to-red-500' : 'from-emerald-300 to-emerald-500') 
                : 'from-slate-500 to-indigo-500';
              
              return (
                <button 
                  key={district}
                  onClick={() => onDistrictSelect(isSelected ? 'ทั้งหมด' : district)}
                  className={`w-full group transition-all duration-200 ${
                    activeDistrict !== 'ทั้งหมด' && !isSelected 
                      ? 'opacity-40 grayscale-[50%]' 
                      : 'opacity-100 hover:scale-[1.02]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className={`truncate pr-1 ${isSelected ? 'text-indigo-400 font-bold' : 'text-slate-300 group-hover:text-white'}`}>{district}</span>
                        <span className={`${colorClass} font-mono tabular-nums font-bold`}>{displayVal}</span>
                      </div>
                      <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                        <div 
                          className={`h-full bg-gradient-to-r ${barGradient} rounded-full transition-all duration-700`} 
                          style={{ width: `${pct}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Footer Navigation */}
      <div className="p-4 border-t border-slate-800/60 text-center flex flex-col items-center gap-2">
        <Link href="/" className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">
          <Home className="w-3 h-3" /> หน้า Home ศูนย์วิเคราะห์เมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/earth-engine" className="inline-flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors uppercase tracking-widest">
          <ThermometerSun className="w-3 h-3" /> วิเคราะห์ความร้อนเมือง <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

    </div>
  );
}
