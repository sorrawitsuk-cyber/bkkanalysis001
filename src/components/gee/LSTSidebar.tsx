/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { ThermometerSun, MapPin, Calendar, Activity, ChevronRight, Trees, Home, ShieldAlert } from "lucide-react";
import Link from "next/link";

interface LSTSidebarProps {
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  summary: any;
  loading: boolean;
  compareMode?: boolean;
}

export default function LSTSidebar({ onDistrictSelect, activeDistrict, summary, loading, compareMode }: LSTSidebarProps) {
  const [showAll, setShowAll] = useState(false);
  const [trendMode, setTrendMode] = useState<"average" | "max">("average");
  
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
    : trendMode === "max" && summary.yearlyMaxTrend?.length
      ? summary.yearlyMaxTrend
    : (summary.yearlyTrend || []);
  const trendValues = yearlyDisplayTrend.map((item: any) => Math.abs(Number(item[1]) || 0));
  const maxAbsTrend = Math.max(1, ...trendValues);
  const maxIncreaseValue = summary.maxIncreaseDelta ?? summary.max_delta ?? 0;
  const monthlyDisplayTrend = !compareMode && trendMode === "max" && summary.monthlyMaxTrend?.length
    ? summary.monthlyMaxTrend
    : (summary.monthlyTrend || []);
  const rankingDisplayRows = !compareMode && trendMode === "max" && summary.maxRanking?.length
    ? summary.maxRanking
    : (summary.ranking || []);
  const rankingValues = rankingDisplayRows.map((row: any) => Number(row[1])).filter(Number.isFinite);
  const rankingMin = rankingValues.length ? Math.min(...rankingValues) : (summary.min_lst || 30);
  const rankingMax = rankingValues.length ? Math.max(...rankingValues) : (summary.max_lst || 40);

  return (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">
      
      {/* Header */}
      <div className="p-5 border-b border-slate-800/60 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center border border-orange-500/30">
            <ThermometerSun className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 leading-none">เกาะความร้อนเมือง</h1>
            <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest">{compareMode ? 'Temperature Anomaly' : 'Urban Heat Island (LST)'}</p>
          </div>
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
              className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-md px-3 py-2 appearance-none focus:outline-none focus:border-orange-500/50 transition-colors cursor-pointer"
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
              <ThermometerSun className="w-3 h-3 text-orange-400"/> {compareMode ? 'ส่วนต่างเฉลี่ย' : 'เฉลี่ย'}
            </div>
            <div className={`text-lg font-bold font-mono whitespace-nowrap ${compareMode ? (summary.avgDelta > 0 ? 'text-red-400' : 'text-blue-400') : 'text-slate-100'}`}>
              {compareMode ? (summary.avgDelta > 0 ? `+${summary.avgDelta.toFixed(2)}` : summary.avgDelta.toFixed(2)) : summary.averageTemp}
              <span className="text-xs ml-1 opacity-50">°C</span>
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Activity className="w-3 h-3 text-red-500"/> {compareMode ? 'พุ่งสูงสุด' : 'สูงสุดของปี'}
            </div>
            <div className={`text-lg font-bold font-mono whitespace-nowrap ${compareMode && maxIncreaseValue < 0 ? 'text-blue-400' : 'text-red-500'}`}>
              {compareMode ? `${maxIncreaseValue > 0 ? '+' : ''}${maxIncreaseValue.toFixed(1)}` : (summary.maxTemp || 0).toFixed(1)}
              <span className="text-xs ml-1 opacity-50">°C</span>
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Trees className="w-3 h-3 text-emerald-400"/> {compareMode ? 'ช่วงปี' : 'ข้อมูลปี'}
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
              <Activity className="w-3 h-3" /> แนวโน้มความร้อน (Trend)
            </h3>
            {!compareMode && (
              <div className="grid grid-cols-2 rounded-lg border border-slate-800 bg-slate-900/70 p-0.5">
                {[
                  ["average", "เฉลี่ย"],
                  ["max", "สูงสุด"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setTrendMode(mode as "average" | "max")}
                    className={`rounded-md px-2 py-1 text-[9px] font-bold transition-colors ${trendMode === mode ? "bg-orange-500 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!compareMode && (
            <p className="text-[9px] text-slate-500 leading-snug mb-3">
              {trendMode === "max" ? "แสดงค่าสูงสุดของอุณหภูมิพื้นผิวในแต่ละปี" : "แสดงค่าเฉลี่ยอุณหภูมิพื้นผิวรายปี"}
            </p>
          )}
          {compareMode && (
            <p className="text-[9px] text-slate-500 leading-snug mb-3">
              Yearly anomaly against {summary.compareYear}; red is warmer, blue is cooler.
            </p>
          )}
          <div className="flex items-end gap-[3px] h-20 mb-2">
            {yearlyDisplayTrend.map((item: any, i: number) => {
              const year = item[0];
              const temp = item[1];
              const maxMonthIdx = item[2];
              
              const minT = trendMode === "max" && !compareMode ? 34 : 30;
              const maxT = trendMode === "max" && !compareMode ? 46 : 40;
              const pct = compareMode
                ? Math.max(4, Math.min(100, (Math.abs(temp) / maxAbsTrend) * 100))
                : Math.max(0, Math.min(100, ((temp - minT) / (maxT - minT)) * 100));
              const trendColor = compareMode
                ? (temp >= 0 ? 'from-orange-600 to-red-500' : 'from-blue-300 to-blue-600')
                : 'from-orange-600 to-yellow-400';
              
              const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
              const peakText = maxMonthIdx !== undefined && maxMonthIdx >= 0 ? ` (พีกสุดเดือน ${months[maxMonthIdx]})` : '';

              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  <div
                    className={`w-full rounded-t-sm bg-gradient-to-t ${trendColor} min-h-[4px] transition-all duration-300 brightness-95 group-hover:brightness-110`}
                    style={{ height: `${pct}%` }}
                  />
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-2 py-1 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono flex flex-col items-center">
                    <span>{year}: {temp}°C</span>
                    {peakText && <span className="text-[8px] text-red-400">{peakText}</span>}
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

        {!compareMode && monthlyDisplayTrend.length > 0 && (
          <>
            <div className="h-px bg-slate-800/60" />
            
            {/* Monthly Trend Chart */}
            <section>
              <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> {trendMode === "max" ? "ค่าสูงสุดรายเดือน" : "แนวโน้มรายเดือน"} ปี {summary.selectedYear}
              </h3>
              <div className="flex items-end gap-[2px] h-16 mb-2">
                {monthlyDisplayTrend.map((temp: number, i: number) => {
                  const currentYear = new Date().getFullYear();
                  const currentMonth = new Date().getMonth();
                  const isFutureMonth = summary.selectedYear === currentYear && i > currentMonth;
                  
                  // Normalize the height between 30C and 40C
                  const minT = trendMode === "max" ? 34 : 30;
                  const maxT = trendMode === "max" ? 46 : 40;
                  const pct = Math.max(0, Math.min(100, ((temp - minT) / (maxT - minT)) * 100));
                  
                  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                  
                  // Color gradient logic
                  const isHot = temp > 36.5;
                  const isWarm = temp > 34;
                  let barColor = isHot ? 'bg-gradient-to-t from-orange-600 to-red-500' :
                                 isWarm ? 'bg-gradient-to-t from-yellow-600 to-orange-400' :
                                 'bg-gradient-to-t from-slate-600 to-slate-400';
                  
                  if (isFutureMonth) {
                    barColor = 'bg-slate-800/30 border border-dashed border-slate-700';
                  }

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                      {!isFutureMonth ? (
                        <>
                          <div
                            className={`w-full rounded-t-sm ${barColor} hover:brightness-110 transition-all duration-200 min-h-[4px]`}
                            style={{ height: `${pct}%` }}
                          />
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-1.5 py-0.5 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono">
                            {months[i]}: {temp}°C
                          </div>
                        </>
                      ) : (
                        <div className={`w-full rounded-t-sm ${barColor} h-1`} title="ยังไม่มีข้อมูล" />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[8px] text-slate-500">
                <span>ม.ค.</span>
                <span>เม.ย.</span>
                <span>ก.ค.</span>
                <span>ต.ค.</span>
                <span>ธ.ค.</span>
              </div>
            </section>
          </>
        )}

        <div className="h-px bg-slate-800/60" />

        {/* Ranking */}
        <section className="flex-1 pb-10">
          <div className="flex justify-between items-start gap-2 mb-3">
            <h3 className="min-w-0 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-start gap-1.5 leading-tight">
              <MapPin className="w-3 h-3" /> {compareMode ? 'อันดับอุณหภูมิพุ่งสูง · Top Increases' : trendMode === "max" ? "ค่าสูงสุดรายเขต · Max Ranking" : "อันดับความร้อนเฉลี่ย · Ranking"}
            </h3>
            <button 
              onClick={() => setShowAll(!showAll)}
              className="shrink-0 max-w-[74px] text-right text-[9px] leading-tight text-orange-500 hover:text-orange-400 font-bold uppercase tracking-wide transition-colors"
            >
              {showAll ? 'แสดงแค่ Top 10' : 'แสดงทั้ง 50 เขต'}
            </button>
          </div>

          <div className="space-y-1.5">
            {rankingDisplayRows.slice(0, showAll ? 50 : 10).map(([district, val]: [string, number], i: number) => {
              // Normalize for progress bar
              let pct = 0;
              const isSelected = activeDistrict === district;
              if (compareMode) {
                // For delta: max delta usually ~2C
                const maxD = Math.abs(summary.max_delta || 2);
                pct = Math.min(100, (Math.abs(val) / maxD) * 100);
              } else {
                const min = rankingMin;
                const max = rankingMax;
                pct = max > min ? ((val - min) / (max - min)) * 100 : 100;
              }

              const displayVal = compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(1);
              const colorClass = compareMode ? (val > 0 ? 'text-red-400' : 'text-blue-400') : 'text-orange-400';
              const barGradient = compareMode 
                ? (val > 0 ? 'from-orange-500 to-red-500' : 'from-blue-300 to-blue-500') 
                : 'from-yellow-500 to-red-500';
              
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
                        <span className={`truncate pr-1 ${isSelected ? 'text-orange-400 font-bold' : 'text-slate-300 group-hover:text-white'}`}>{district}</span>
                        <span className={`${colorClass} font-mono tabular-nums font-bold`}>{displayVal}°</span>
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
        <Link href="/urban-issues" className="inline-flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors uppercase tracking-widest">
          <ShieldAlert className="w-3 h-3" /> วิเคราะห์ปัญหาเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/green-space" className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest">
          <Trees className="w-3 h-3" /> วิเคราะห์พื้นที่สีเขียวเมือง <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

    </div>
  );
}
