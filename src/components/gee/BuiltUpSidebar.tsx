/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo } from "react";
import { Building2, MapPin, Calendar, Activity, ChevronRight, Trees, Home, ShieldAlert, ThermometerSun, Droplets } from "lucide-react";
import Link from "next/link";

interface BuiltUpSidebarProps {
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  summary: any;
  loading: boolean;
  compareMode?: boolean;
  granularity?: "district" | "subdistrict";
  subdistrictFeatures?: any[];
}

export default function BuiltUpSidebar({ onDistrictSelect, activeDistrict, summary, loading, compareMode, granularity = "district", subdistrictFeatures }: BuiltUpSidebarProps) {
  const [showAll, setShowAll] = useState(false);
  const [displayMode, setDisplayMode] = useState<'area' | 'ndbi' | 'density'>('area');

  const subRows = useMemo(() => {
    if (granularity !== "subdistrict" || !subdistrictFeatures?.length) return null;
    const metric = compareMode ? "delta" : "ndbi_mean";
    return subdistrictFeatures
      .filter((f: any) => f.properties?.[metric] != null && Number.isFinite(Number(f.properties[metric])))
      .map((f: any) => [f.properties.name_th as string, Number(f.properties[metric]), f.properties.district_name as string] as [string, number, string])
      .sort((a, b) => compareMode ? Math.abs(b[1]) - Math.abs(a[1]) : b[1] - a[1]);
  }, [granularity, subdistrictFeatures, compareMode]);

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

  const hasNdbiData = (summary.yearlyTrend?.length ?? 0) > 0 || (summary.ranking?.length ?? 0) > 0;

  const builtupAreaTrend: [string, number][] = summary.builtupAreaTrend || [];
  const isAreaMode = displayMode === 'area' && builtupAreaTrend.length > 0;

  const yearlyDisplayTrend = isAreaMode
    ? builtupAreaTrend
    : compareMode && summary.yearlyDeltaTrend?.length
      ? summary.yearlyDeltaTrend
      : (summary.yearlyTrend || []);
  const trendValues = yearlyDisplayTrend.map((item: any) => Math.abs(Number(item[1]) || 0));
  const maxAbsTrend = Math.max(1, ...trendValues);
  const maxIncreaseValue = summary.maxIncreaseDelta ?? summary.max_delta ?? 0;

  const ndbiRankingRows: [string, number][] = summary.ndbiRanking || [];
  const areaRankingRows: [string, number][] = summary.areaRanking || [];
  const densityRankingRows: [string, number][] = summary.densityRanking || [];
  const rankingDisplayRows = compareMode
    ? (isAreaMode && areaRankingRows.length ? areaRankingRows : (summary.ranking || []))
    : (displayMode === 'ndbi' && ndbiRankingRows.length ? ndbiRankingRows
      : displayMode === 'density' && densityRankingRows.length ? densityRankingRows
      : (summary.ranking || []));
  const rankingValues = rankingDisplayRows.map((row: any) => Number(row[1])).filter(Number.isFinite);
  const rankingMin = 0;
  const rankingMaxAbs = rankingValues.length ? Math.max(...rankingValues.map((v: number) => Math.abs(v))) : 1;
  const rankingMax = rankingValues.length ? Math.max(...rankingValues) : 1;
  const activeRows = subRows ?? rankingDisplayRows.map((r: any[]) => [r[0], r[1], undefined] as [string, number, undefined]);
  const activeRankMax = subRows?.length ? Math.max(...subRows.map(r => Math.abs(r[1]))) : rankingMax;
  const rankTotalCount = subRows ? 180 : 50;
  const levelLabel = subRows ? "รายแขวง" : "รายเขต";

  const formatRai = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k ไร่` : `${v} ไร่`;

  // Chart axis values — computed in component body to avoid IIFE inside JSX
  const fmtTrendVal = (v: number) => compareMode ? (v > 0 ? `+${v.toFixed(3)}` : v.toFixed(3))
    : isAreaMode ? formatRai(Math.round(v)) : v.toFixed(3);
  const chartBNums = yearlyDisplayTrend.map((it: any) => Number(it[1])).filter((v: number) => Number.isFinite(v));
  const chartBMax = chartBNums.length ? Math.max(...chartBNums) : maxAbsTrend;
  const chartBMin = chartBNums.length ? Math.min(...chartBNums) : 0;

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
              <Building2 className="w-3 h-3 text-indigo-400"/> {compareMode ? 'ส่วนต่าง NDBI' : 'พื้นที่เฉลี่ย/เขต'}
            </div>
            <div className={`text-sm font-bold font-mono whitespace-nowrap ${compareMode ? (summary.avgDelta > 0 ? 'text-indigo-400' : 'text-slate-400') : 'text-slate-100'}`}>
              {!hasNdbiData ? <span className="text-slate-600 text-sm">--</span>
                : compareMode ? (summary.avgDelta > 0 ? `+${summary.avgDelta.toFixed(3)}` : summary.avgDelta.toFixed(3))
                : rankingValues.length
                  ? (displayMode === 'ndbi'
                    ? (rankingValues.reduce((a: number, b: number) => a + b, 0) / rankingValues.length).toFixed(3)
                    : displayMode === 'density'
                      ? `${(rankingValues.reduce((a: number, b: number) => a + b, 0) / rankingValues.length).toFixed(1)}%`
                      : formatRai(Math.round(rankingValues.reduce((a: number, b: number) => a + b, 0) / rankingValues.length)))
                  : '--'}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Activity className="w-3 h-3 text-red-400"/> {compareMode ? 'เพิ่มขึ้นสูงสุด' : 'เขตหนาแน่นสูงสุด'}
            </div>
            <div className={`text-sm font-bold font-mono whitespace-nowrap ${compareMode && maxIncreaseValue <= 0 ? 'text-slate-400' : 'text-red-400'}`}>
              {!hasNdbiData ? <span className="text-slate-600 text-sm">--</span>
                : compareMode ? `${maxIncreaseValue > 0 ? '+' : ''}${maxIncreaseValue.toFixed(3)}`
                : rankingValues.length
                  ? (displayMode === 'ndbi'
                    ? Math.max(...rankingValues).toFixed(3)
                    : displayMode === 'density'
                      ? `${Math.max(...rankingValues).toFixed(1)}%`
                      : formatRai(Math.max(...rankingValues)))
                  : '--'}
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
            {builtupAreaTrend.length > 0 && (
              <div className="flex shrink-0 bg-slate-900/60 border border-slate-700/60 rounded-md overflow-hidden text-[9px] font-bold">
                <button
                  onClick={() => setDisplayMode('area')}
                  className={`px-2 py-1 transition-colors ${displayMode === 'area' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  พื้นที่
                </button>
                <button
                  onClick={() => setDisplayMode('density')}
                  className={`px-2 py-1 transition-colors ${displayMode === 'density' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  หนาแน่น
                </button>
                <button
                  onClick={() => setDisplayMode('ndbi')}
                  className={`px-2 py-1 transition-colors ${displayMode === 'ndbi' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  NDBI
                </button>
              </div>
            )}
          </div>
          <p className="text-[9px] text-slate-500 leading-snug mb-3">
            {isAreaMode
              ? (compareMode
                ? `รวมพื้นที่สิ่งปลูกสร้างทั้งกรุงเทพฯ (ไร่) แต่ละปี`
                : 'รวมพื้นที่สิ่งปลูกสร้างทั้งกรุงเทพฯ (ไร่) ประมาณการจาก NDBI รายปี')
              : (compareMode
                ? `ผลต่าง NDBI เทียบกับปี ${summary.compareYear}; สีม่วง/แดงคือเมืองขยายตัว สีเขียวคือพื้นที่ลดลง`
                : 'ค่า NDBI เฉลี่ยรายปีของกรุงเทพฯ')}
          </p>
          {!hasNdbiData ? (
            <div className="h-20 flex items-center justify-center border border-dashed border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-600">กำลังประมวลผลข้อมูลดาวเทียม…</span>
            </div>
          ) : (
            <>
              <div className="flex gap-1">
                <div className="flex flex-col justify-between text-right pb-4" style={{ minWidth: 36 }}>
                  <span className="text-[8px] font-mono text-slate-500 leading-tight">{fmtTrendVal(chartBMax)}</span>
                  <span className="text-[8px] font-mono text-slate-500 leading-tight">{fmtTrendVal(chartBMin)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-end gap-[3px] h-20 mb-1">
                    {yearlyDisplayTrend.map((item: any, i: number) => {
                      const barYear = item[0];
                      const barVal = item[1];
                      let pct: number;
                      if (compareMode) {
                        pct = Math.max(4, Math.min(100, (Math.abs(barVal) / (maxAbsTrend || 1)) * 100));
                      } else if (isAreaMode) {
                        pct = Math.max(4, Math.min(100, (barVal / (maxAbsTrend || 1)) * 100));
                      } else {
                        pct = Math.max(4, Math.min(100, ((barVal - (-0.1)) / (0.3 - (-0.1))) * 100));
                      }
                      const trendColor = compareMode
                        ? (barVal >= 0 ? 'from-indigo-600 to-red-500' : 'from-emerald-300 to-emerald-600')
                        : isAreaMode ? 'from-slate-600 to-violet-400' : 'from-slate-600 to-indigo-400';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                          <div
                            className={`w-full rounded-t-sm bg-gradient-to-t ${trendColor} min-h-[4px] transition-all duration-300 brightness-95 group-hover:brightness-110`}
                            style={{ height: `${pct}%` }}
                          />
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-[9px] px-2 py-1 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono flex flex-col items-center gap-0.5">
                            <span className="font-bold">{barYear}</span>
                            <span className="text-violet-300">{fmtTrendVal(barVal)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                    <span>{yearlyDisplayTrend?.[0]?.[0]}</span>
                    <span>{yearlyDisplayTrend?.[yearlyDisplayTrend?.length - 1]?.[0]}</span>
                  </div>
                </div>
              </div>
            </>
          )}
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
              <MapPin className="w-3 h-3" /> {
                compareMode
                  ? (isAreaMode ? `พื้นที่เปลี่ยนแปลง${levelLabel} (ไร่)` : `อันดับ NDBI เพิ่มขึ้น · Urban Growth`)
                  : displayMode === 'ndbi' ? `อันดับค่าดัชนี NDBI ${levelLabel}`
                  : displayMode === 'density' ? `ความหนาแน่นสิ่งปลูกสร้าง${levelLabel} (%)`
                  : `พื้นที่สิ่งปลูกสร้าง${levelLabel} (ไร่)`
              }
            </h3>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button 
                onClick={() => setShowAll(!showAll)}
                className="max-w-[74px] text-right text-[9px] leading-tight text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wide transition-colors"
              >
                {showAll ? 'แสดงแค่ Top 10' : `แสดงทั้ง ${rankTotalCount} ${subRows ? 'แขวง' : 'เขต'}`}
              </button>
            </div>
          </div>

          {!hasNdbiData && (
            <div className="py-6 flex flex-col items-center gap-2 border border-dashed border-slate-800 rounded-lg">
              <Building2 className="w-6 h-6 text-slate-700" />
              <span className="text-[10px] text-slate-600 text-center leading-relaxed">ยังไม่มีข้อมูล NDBI<br/>กำลังประมวลผลข้อมูลดาวเทียม</span>
            </div>
          )}
          <div className="space-y-1.5">
            {activeRows.slice(0, showAll ? rankTotalCount : 10).map(([district, val, parentDistrict]: [string, number, string | undefined], i: number) => {
              let pct = 0;
              const isSelected = activeDistrict === district;
              if (compareMode) {
                const maxD = subRows ? (activeRankMax || 0.1) : isAreaMode ? (rankingMaxAbs || 1) : Math.abs(summary.max_delta || 0.1);
                pct = Math.min(100, (Math.abs(val) / maxD) * 100);
              } else {
                pct = activeRankMax > rankingMin ? ((val - rankingMin) / (activeRankMax - rankingMin)) * 100 : 100;
              }

              const displayVal = subRows
                ? val.toFixed(3)
                : compareMode
                  ? (isAreaMode
                    ? (val > 0 ? `+${formatRai(val)}` : val < 0 ? `-${formatRai(Math.abs(val))}` : `0 ไร่`)
                    : (val > 0 ? `+${val.toFixed(3)}` : val.toFixed(3)))
                  : displayMode === 'ndbi' ? val.toFixed(3)
                  : displayMode === 'density' ? `${val.toFixed(1)}%`
                  : formatRai(Math.round(val));
              const colorClass = compareMode ? (val > 0 ? 'text-red-400' : 'text-emerald-400') : 'text-indigo-400';
              const barGradient = compareMode
                ? (val > 0 ? 'from-indigo-500 to-red-500' : 'from-emerald-300 to-emerald-500')
                : 'from-slate-500 to-indigo-500';

              return (
                <button
                  key={`${district}-${i}`}
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
                      {parentDistrict && (
                        <p className="text-[8px] text-slate-600 leading-none -mt-0.5 mb-0.5 truncate">{parentDistrict}</p>
                      )}
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
        <Link href="/traffy" className="inline-flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors uppercase tracking-widest">
          <ShieldAlert className="w-3 h-3" /> วิเคราะห์ปัญหาเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/heat-island" className="inline-flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors uppercase tracking-widest">
          <ThermometerSun className="w-3 h-3" /> วิเคราะห์ความร้อนเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/green-space" className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest">
          <Trees className="w-3 h-3" /> วิเคราะห์พื้นที่สีเขียวเมือง <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href="/flood-risk" className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors uppercase tracking-widest">
          <Droplets className="w-3 h-3" /> วิเคราะห์น้ำท่วม/แหล่งน้ำ <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

    </div>
  );
}
