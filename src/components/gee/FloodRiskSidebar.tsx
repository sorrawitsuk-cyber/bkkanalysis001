/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState } from "react";
import { Activity, Droplets, MapPin } from "lucide-react";
import SidebarSkeleton from "@/components/gee/SidebarSkeleton";
import SidebarFooter from "@/components/gee/SidebarFooter";
import DataSourceBadge from "@/components/ui/DataSourceBadge";

interface FloodRiskSidebarProps {
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  summary: any;
  geojsonData?: any;
  loading: boolean;
  compareMode?: boolean;
  mapMode?: "district" | "satellite-cache" | "idw";
  granularity?: "district" | "subdistrict";
}

const ALL_DISTRICTS = "ทั้งหมด";
const RANKING_MODE_COPY = {
  index: {
    label: "ดัชนี",
    title: "ดัชนีน้ำจากภาพถ่าย",
    help: "เรียงจากค่า NDWI/MNDWI สูงสุด ใช้ดูสัญญาณน้ำหรือความชื้นในภาพดาวเทียม",
  },
  density: {
    label: "หนาแน่น",
    title: "ความหนาแน่นพื้นที่น้ำ",
    help: "เรียงจากร้อยละของพื้นที่น้ำเทียบกับขนาดเขต ช่วยเทียบเขตใหญ่และเล็กอย่างยุติธรรม",
  },
  area: {
    label: "พื้นที่",
    title: "พื้นที่ที่ตรวจพบสัญญาณน้ำ",
    help: "เรียงจากจำนวนไร่ที่ดัชนีดาวเทียมตรวจพบสัญญาณน้ำหรือความชื้น ไม่ใช่ขอบเขตน้ำท่วมที่สำรวจภาคสนาม",
  },
} as const;

function formatRai(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${Math.round(value).toLocaleString("th-TH")} ไร่`;
}

function formatIndex(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toFixed(3);
}

function ringAreaSquareMeters(ring: number[][]) {
  if (!ring?.length) return 0;
  const radius = 6378137;
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    area += ((lon2 - lon1) * Math.PI / 180) * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return Math.abs((area * radius * radius) / 2);
}

function geometryAreaRai(geometry: any): number | null {
  if (!geometry?.coordinates) return null;
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  const sqm = polygons.reduce((sum: number, polygon: number[][][]) => {
    const [outer, ...holes] = polygon;
    return sum + Math.max(0, ringAreaSquareMeters(outer) - holes.reduce((h, ring) => h + ringAreaSquareMeters(ring), 0));
  }, 0);
  return sqm > 0 ? sqm / 1600 : null;
}

export default function FloodRiskSidebar({
  onDistrictSelect,
  activeDistrict,
  summary,
  geojsonData,
  loading,
  compareMode,
  granularity = "district",
}: FloodRiskSidebarProps) {
  const [showAll, setShowAll] = useState(false);
  const [displayMode, setDisplayMode] = useState<"index" | "density" | "area">("index");

  // Build ranking rows from GeoJSON features (most accurate for current year)
  const rankingRows = useMemo(() => {
    const features = geojsonData?.features || [];
    if (features.length > 0) {
      const rows = features
        .map((f: any) => {
          const waterAreaRai = f.properties?.water_area_rai as number | null;
          const districtAreaRai = geometryAreaRai(f.geometry);
          const densityPct = waterAreaRai !== null && districtAreaRai && districtAreaRai > 0
            ? parseFloat(((waterAreaRai / districtAreaRai) * 100).toFixed(1))
            : null;
          return {
            district: f.properties?.name_th,
            districtName: (f.properties?.district_name as string) ?? null,
            waterRatio: (f.properties?.seasonal_water_ratio ?? f.properties?.water_ratio) as number | null,
            waterAreaRai,
            displayValue: f.properties?.display_value as number | null,
            displayAreaRai: f.properties?.display_area_rai as number | null,
            displayLabel: f.properties?.display_label as string | null,
            delta: f.properties?.delta as number | null,
            densityPct,
          };
        })
        .filter((r: any) => r.district);
      if (displayMode === "area") {
        return [...rows].sort((a: any, b: any) => ((b.displayAreaRai ?? b.waterAreaRai) ?? -1) - ((a.displayAreaRai ?? a.waterAreaRai) ?? -1));
      }
      return displayMode === "density"
        ? [...rows].sort((a: any, b: any) => (b.densityPct ?? -1) - (a.densityPct ?? -1))
        : rows.sort((a: any, b: any) => (b.displayValue ?? b.waterRatio ?? -1) - (a.displayValue ?? a.waterRatio ?? -1));
    }
    // Fallback to API summary ranking
    return (summary?.ranking || []).map(([district, waterRatio, waterAreaRai]: any) => ({
      district,
      displayValue: waterRatio,
      waterRatio,
      displayAreaRai: waterAreaRai,
      waterAreaRai,
      delta: null,
      densityPct: null,
    }));
  }, [geojsonData, summary?.ranking, displayMode]);

  const districtOptions = rankingRows.map((r: any) => r.district).filter(Boolean);
  const maxRankingValue = rankingRows.length
    ? Math.max(...rankingRows.map((row: any) => Math.abs(row.displayValue ?? row.waterRatio ?? 0)), 0.5)
    : 0.5;
  const maxAreaRai = rankingRows.length
    ? Math.max(...rankingRows.map((row: any) => Number((row.displayAreaRai ?? row.waterAreaRai) ?? 0)), 1)
    : 1;
  const displayLabel = summary?.displayLabel || rankingRows[0]?.displayLabel || "NDWI";
  const rankingModeCopy = RANKING_MODE_COPY[displayMode];

  // Trend data follows the selected NDWI/MNDWI layer.
  const trendData: [string, number][] = useMemo(() => {
    return (summary?.yearlyTrend || []).map(([y, v]: [string, number]) => [y, +v.toFixed(4)]);
  }, [summary?.yearlyTrend]);
  const trendMin = Math.min(0, ...trendData.map((d) => d[1]));
  const maxTrend = Math.max(1, ...trendData.map((d) => d[1]));

  if (loading || !summary) return <SidebarSkeleton />;

  return (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">
      {/* Header */}
      <div className="p-5 border-b border-slate-800/60 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 leading-none">พื้นที่ตรวจพบสัญญาณน้ำ</h1>
            <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest">NDWI/MNDWI · ไม่ใช่แบบจำลองน้ำท่วม</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-sky-500/20 bg-sky-950/20 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-sky-300">
            อ่านหน้านี้แบบเร็ว
          </p>
          <p className="mt-1 text-[10px] leading-snug text-slate-400">
            ค่าที่แสดงคือสัญญาณน้ำผิวดินหรือความชื้นจากดาวเทียม หลังตัดแหล่งน้ำถาวรออก ใช้คัดกรองพื้นที่เพื่อตรวจสอบต่อ ไม่ใช่หลักฐานยืนยันน้ำท่วม
          </p>
        </div>

        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> เลือกเขต
        </label>
        <select
          value={activeDistrict}
          onChange={(e) => onDistrictSelect(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-md px-3 py-2 appearance-none focus:outline-none focus:border-sky-500/50 transition-colors cursor-pointer"
        >
          <option value={ALL_DISTRICTS}>กรุงเทพมหานคร (ทั้งหมด)</option>
          {districtOptions.map((d: string) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-6">
        <DataSourceBadge
          dataSource={summary?.dataSource}
          dataQuality={summary?.dataQuality}
          sourceLabel={summary?.sourceLabel}
          sourceNote={summary?.sourceNote}
          className="mb-2"
        />

        {/* KPI Cards — 2×3 grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* Row 1 */}
          <div className="col-span-3 min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Droplets className="w-3 h-3 text-sky-400 shrink-0" /> พื้นที่ตรวจพบสัญญาณน้ำ (ไม่รวมแหล่งน้ำถาวร)
            </div>
            <div className="text-base font-bold font-mono text-slate-100">
              {formatRai(summary.totalWaterAreaRai)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 leading-tight">ค่าเฉลี่ย</div>
            <div className="text-sm font-bold font-mono text-sky-400">
              {formatIndex(summary.avgDisplayValue ?? summary.avgWaterRatio)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 leading-tight">ค่าสูงสุด</div>
            <div className="text-sm font-bold font-mono text-sky-300 truncate">
              {compareMode && summary.avgDelta !== null
                ? `${summary.avgDelta >= 0 ? "+" : ""}${(summary.avgDelta * 100).toFixed(1)}%`
                : formatIndex(rankingRows[0]?.displayValue ?? rankingRows[0]?.waterRatio)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 leading-tight">
              {compareMode ? "เปลี่ยนแปลง" : "ต่ำสุด"}
            </div>
            <div className="text-sm font-bold font-mono text-slate-400 truncate">
              {compareMode
                ? (summary.avgDelta !== null ? `${summary.avgDelta >= 0 ? "+" : ""}${(summary.avgDelta * 100).toFixed(2)}pp` : "–")
                : formatIndex(rankingRows[rankingRows.length - 1]?.displayValue ?? rankingRows[rankingRows.length - 1]?.waterRatio)}
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-800/60" />

        {/* Yearly Trend Chart */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-center gap-1.5 mb-2">
            <Activity className="w-3 h-3" />
            {`Trend ${displayLabel}`}
          </h3>
          <div className="flex items-end gap-[3px] h-20 mb-2">
            {trendData.map(([yr, val], idx) => {
              const pct = Math.max(4, Math.min(100, ((val - trendMin) / (maxTrend - trendMin || 1)) * 100));
              return (
                <div key={`${yr}-${idx}`} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  <div
                    className="w-full rounded-t-sm bg-gradient-to-t from-sky-600 to-cyan-400 min-h-[4px] transition-all duration-300 brightness-95 group-hover:brightness-110"
                    style={{ height: `${pct}%` }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-2 py-1 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono">
                    {yr}: {formatIndex(val)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 font-mono">
            <span>{trendData[0]?.[0]}</span>
            <span>{trendData[trendData.length - 1]?.[0]}</span>
          </div>
          <p className="mt-2 text-[9px] text-slate-500 leading-snug">
            ค่าเฉลี่ย {displayLabel} ทั้งกรุงเทพฯ รายปี
          </p>
        </section>

        <div className="h-px bg-slate-800/60" />

        {/* District Ranking */}
        <section className="flex-1 pb-10">
          <div className="flex justify-between items-start gap-2 mb-3">
            <h3 className="min-w-0 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-start gap-1.5 leading-tight">
              <MapPin className="w-3 h-3 shrink-0" />
              {compareMode ? "การเปลี่ยนแปลงพื้นที่น้ำ"
                : `${rankingModeCopy.title}${granularity === "subdistrict" ? "รายแขวง" : "รายเขต"}`}
            </h3>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {!compareMode && (
                <div className="flex bg-slate-900/60 border border-slate-700/60 rounded-md overflow-hidden text-[9px] font-bold">
                  <button
                    onClick={() => setDisplayMode("index")}
                    className={`px-2 py-1 transition-colors ${displayMode === "index" ? "bg-sky-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    {RANKING_MODE_COPY.index.label}
                  </button>
                  <button
                    onClick={() => setDisplayMode("density")}
                    className={`px-2 py-1 transition-colors ${displayMode === "density" ? "bg-sky-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    {RANKING_MODE_COPY.density.label}
                  </button>
                  <button
                    onClick={() => setDisplayMode("area")}
                    className={`px-2 py-1 transition-colors ${displayMode === "area" ? "bg-sky-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    {RANKING_MODE_COPY.area.label}
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowAll(!showAll)}
                className="max-w-[74px] text-right text-[9px] leading-tight text-sky-400 hover:text-sky-300 font-bold uppercase tracking-wide transition-colors"
              >
                {showAll ? "แสดงแค่ Top 10" : `แสดงทั้ง ${granularity === "subdistrict" ? "180 แขวง" : "50 เขต"}`}
              </button>
            </div>
          </div>

          {!compareMode && (
            <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/45 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-300">{rankingModeCopy.title}</span>
                <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                  {displayMode === "area" ? "ไร่" : displayMode === "density" ? "%" : displayLabel}
                </span>
              </div>
              <p className="mt-1 text-[9px] leading-snug text-slate-500">{rankingModeCopy.help}</p>
            </div>
          )}

          <div className="space-y-1.5">
            {rankingRows.slice(0, showAll ? 50 : 10).map((row: any, idx: number) => {
              const isSelected = activeDistrict === row.district;
              const displayVal = compareMode && row.delta !== null
                    ? `${row.delta >= 0 ? "+" : ""}${(row.delta * 100).toFixed(1)}%`
                    : displayMode === "density"
                      ? (row.densityPct !== null ? `${row.densityPct}%` : "ไม่มีข้อมูล")
                      : displayMode === "area"
                        ? formatRai(row.displayAreaRai ?? row.waterAreaRai)
                      : formatIndex(row.displayValue ?? row.waterRatio);
              const areaVal = row.displayAreaRai ?? row.waterAreaRai;
              const barPct = compareMode && row.delta !== null
                    ? Math.min(100, Math.abs(row.delta) / 0.1 * 100)
                    : displayMode === "density"
                      ? Math.min(100, (row.densityPct ?? 0))
                      : displayMode === "area"
                        ? (Number(areaVal ?? 0) / maxAreaRai) * 100
                      : (Math.abs(row.displayValue ?? row.waterRatio ?? 0) / maxRankingValue) * 100;
              const barColor = compareMode
                    ? (row.delta ?? 0) >= 0 ? "from-sky-600 to-sky-400" : "from-amber-600 to-amber-400"
                    : "from-sky-600 to-cyan-400";

              return (
                <button
                  key={row.district}
                  onClick={() => onDistrictSelect(isSelected ? ALL_DISTRICTS : row.district)}
                  className={`w-full group transition-all duration-200 ${activeDistrict !== ALL_DISTRICTS && !isSelected ? "opacity-40 grayscale-[50%]" : "opacity-100 hover:scale-[1.02]"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 w-4 text-right font-mono shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className={`truncate pr-1 ${isSelected ? "text-sky-400 font-bold" : "text-slate-300 group-hover:text-white"}`}>{row.district}</span>
                        <span className="text-sky-400 font-mono tabular-nums font-bold">{displayVal}</span>
                      </div>
                      {(row.districtName || areaVal !== null) && (
                        <p className="text-[8px] text-slate-600 leading-none -mt-0.5 mb-0.5 truncate">
                          {row.districtName ? `${row.districtName} · ` : ""}{formatRai(areaVal)}
                        </p>
                      )}
                      <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700`} style={{ width: `${Math.max(4, Math.min(100, barPct))}%` }} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <SidebarFooter exclude={["traffy", "flood-risk"]} />
    </div>
  );
}
