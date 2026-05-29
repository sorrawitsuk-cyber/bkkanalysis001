/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState } from "react";
import { Activity, Calendar, Layers, MapPin, Wind } from "lucide-react";
import SidebarSkeleton from "@/components/gee/SidebarSkeleton";
import SidebarFooter from "@/components/gee/SidebarFooter";
import DataSourceBadge from "@/components/ui/DataSourceBadge";

type AirLayer = "no2_mean" | "co_mean" | "so2_mean" | "aerosol_index_mean" | "pollution_score";

const AIR_LAYERS: Array<{ id: AirLayer; label: string; labelTh: string; unit: string }> = [
  { id: "no2_mean",           label: "NO₂",    labelTh: "ไนโตรเจนไดออกไซด์", unit: "mol/m²" },
  { id: "co_mean",            label: "CO",     labelTh: "คาร์บอนมอนอกไซด์",   unit: "mol/m²" },
  { id: "so2_mean",           label: "SO₂",    labelTh: "ซัลเฟอร์ไดออกไซด์",  unit: "mol/m²" },
  { id: "aerosol_index_mean", label: "Aerosol",labelTh: "ละอองลอยในอากาศ",    unit: "index"  },
  { id: "pollution_score",    label: "Score",  labelTh: "คะแนนมลพิษรวม",      unit: "0–10"   },
];

function formatMetric(value: number | null | undefined, layer: AirLayer): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (layer === "pollution_score")    return value.toFixed(2);
  if (layer === "co_mean")            return value.toFixed(4);
  if (layer === "aerosol_index_mean") return value.toFixed(3);
  return value.toFixed(6);
}

const ALL_DISTRICTS = "ทั้งหมด";

interface AirQualitySidebarProps {
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  summary: any;
  geojsonData?: any;
  airLayer: AirLayer;
  onAirLayerChange: (layer: AirLayer) => void;
  loading: boolean;
  compareMode?: boolean;
  granularity?: "district" | "subdistrict";
  selectedYear?: number;
  compareYear?: number;
}

export default function AirQualitySidebar({
  onDistrictSelect,
  activeDistrict,
  summary,
  geojsonData,
  airLayer,
  onAirLayerChange,
  loading,
  compareMode,
  granularity = "district",
  selectedYear,
  compareYear,
}: AirQualitySidebarProps) {
  const [showAll, setShowAll] = useState(false);

  const layerMeta = AIR_LAYERS.find((l) => l.id === airLayer) ?? AIR_LAYERS[0];

  const rankingRows: [string, number, string?][] = useMemo(() => {
    const features = geojsonData?.features ?? [];
    if (granularity === "subdistrict") {
      return [...features]
        .filter((f: any) => typeof f?.properties?.[airLayer] === "number")
        .sort((a: any, b: any) => Number(b.properties[airLayer]) - Number(a.properties[airLayer]))
        .map((f: any) => [f.properties.name_th as string, Number(f.properties[airLayer]), f.properties.district_name as string]);
    }
    return [...features]
      .filter((f: any) => typeof f?.properties?.[airLayer] === "number")
      .sort((a: any, b: any) => Number(b.properties[airLayer]) - Number(a.properties[airLayer]))
      .map((f: any) => [f.properties.name_th as string, Number(f.properties[airLayer])]);
  }, [geojsonData, airLayer, granularity]);

  const values = rankingRows.map(([, v]) => v);
  const avgValue  = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const maxValue  = values.length ? Math.max(...values) : null;
  const topDistrict = rankingRows[0]?.[0] ?? null;

  const hasData = rankingRows.length > 0;

  const yearlyTrend: [string, number][] = (summary?.yearlyTrend ?? []).filter(
    (item: any) => item[1] !== null && typeof item[1] === "number"
  );
  const trendValues = yearlyTrend.map(([, v]) => v);
  const maxTrendValue = trendValues.length ? Math.max(...trendValues) : 1;
  const minTrendValue = trendValues.length ? Math.min(...trendValues) : 0;

  const districtOptions = rankingRows.map(([d]) => d);

  if (loading || !summary) return <SidebarSkeleton />;

  return (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">

      {/* Header */}
      <div className="p-5 border-b border-slate-800/60 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shrink-0">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 leading-none">มลพิษอากาศจากดาวเทียม</h1>
            <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest">Sentinel-5P TROPOMI</p>
          </div>
        </div>
        <DataSourceBadge dataSource={summary?.dataSource} className="mb-2" />

        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> พื้นที่ (District)
        </label>
        <select
          value={activeDistrict}
          onChange={(e) => onDistrictSelect(e.target.value)}
          className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-md px-3 py-2 appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors cursor-pointer"
        >
          <option value={ALL_DISTRICTS}>กรุงเทพมหานคร (ทั้งหมด)</option>
          {districtOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Wind className="w-3 h-3 text-cyan-400 shrink-0" /> ค่าเฉลี่ย
            </div>
            <div className="text-sm font-bold font-mono whitespace-nowrap text-slate-100">
              {formatMetric(avgValue, airLayer)}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Activity className="w-3 h-3 text-red-400 shrink-0" /> เขตสูงสุด
            </div>
            <div className="text-[11px] font-bold text-red-300 leading-tight truncate">
              {topDistrict ?? "--"}
            </div>
          </div>
          <div className="min-w-0 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[8px] text-slate-500 uppercase tracking-wide mb-1 flex items-start gap-1 leading-tight min-h-[22px]">
              <Calendar className="w-3 h-3 text-cyan-400 shrink-0" /> ปีข้อมูล
            </div>
            <div className="text-sm font-bold text-cyan-400 font-mono leading-tight">
              {compareMode ? `${selectedYear} vs ${compareYear}` : (selectedYear ?? "–")}
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-800/60" />

        {/* Layer Selector */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <Layers className="h-3 w-3" /> ตัวชี้วัด (Layer)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {AIR_LAYERS.map((layer) => (
              <button
                key={layer.id}
                onClick={() => onAirLayerChange(layer.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${airLayer === layer.id ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-300"}`}
              >
                <span className="text-xs font-bold">{layer.label}</span>
                <span className="mt-0.5 block text-[9px] font-medium text-slate-500 leading-tight">{layer.labelTh}</span>
                <span className="block text-[8px] text-slate-600">{layer.unit}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="h-px bg-slate-800/60" />

        {/* Trend chart */}
        {yearlyTrend.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-center gap-1.5 leading-tight">
                <Activity className="w-3 h-3" /> Trend {layerMeta.label} รายปี
              </h3>
            </div>
            <div className="flex gap-1">
              <div className="flex flex-col justify-between text-right pb-4" style={{ minWidth: 44 }}>
                <span className="text-[8px] font-mono text-slate-500 leading-tight">{maxTrendValue.toFixed(6)}</span>
                <span className="text-[8px] font-mono text-slate-500 leading-tight">{minTrendValue.toFixed(6)}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-end gap-[3px] h-16 mb-1">
                  {yearlyTrend.map(([yr, val], i) => {
                    const range = maxTrendValue - minTrendValue || 1;
                    const pct = Math.max(4, Math.min(100, ((val - minTrendValue) / range) * 100));
                    return (
                      <div key={`${yr}-${i}`} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                        <div className="w-full rounded-t-sm bg-gradient-to-t from-cyan-700 to-cyan-400 min-h-[4px] transition-all duration-300 brightness-95 group-hover:brightness-110" style={{ height: `${pct}%` }} />
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-[9px] px-2 py-1 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg font-mono flex flex-col items-center gap-0.5">
                          <span className="font-bold">{yr}</span>
                          <span className="text-cyan-300">{formatMetric(val, airLayer)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                  <span>{yearlyTrend[0]?.[0]}</span>
                  <span>{yearlyTrend[yearlyTrend.length - 1]?.[0]}</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[9px] text-slate-500 leading-snug">ค่า {layerMeta.label} เฉลี่ยทั้งกรุงเทพฯ รายปี</p>
          </section>
        )}

        {!hasData && (
          <div className="rounded-xl border border-dashed border-cyan-800/50 bg-cyan-950/20 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-cyan-600 shrink-0" />
              <p className="text-[10px] font-bold text-cyan-400">ข้อมูลสถิติรายเขตยังไม่พร้อม</p>
            </div>
            <p className="text-[9px] text-slate-400 leading-snug">
              ข้อมูลสถิติมลพิษรายเขตจาก Sentinel-5P อยู่ระหว่างการประมวลผล
              กรุณาใช้โหมด <span className="text-cyan-300 font-bold">ดาวเทียม (GEE)</span> เพื่อดูข้อมูลจริงบนแผนที่
            </p>
          </div>
        )}

        {hasData && (
          <>
            <div className="h-px bg-slate-800/60" />

            {/* Ranking */}
            <section className="flex-1 pb-10">
              <div className="flex justify-between items-start gap-2 mb-3">
                <h3 className="min-w-0 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-start gap-1.5 leading-tight">
                  <MapPin className="w-3 h-3" /> {`อันดับ ${layerMeta.label} ${granularity === "subdistrict" ? "รายแขวง" : "รายเขต"}`}
                </h3>
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="shrink-0 text-[9px] leading-tight text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wide transition-colors"
                >
                  {showAll ? "Top 10" : `ทั้ง ${granularity === "subdistrict" ? "180" : "50"}`}
                </button>
              </div>

              <div className="space-y-1.5">
                {rankingRows.slice(0, showAll ? (granularity === "subdistrict" ? 180 : 50) : 10).map(([district, value, parentDistrict], i) => {
                  const isSelected = activeDistrict === district;
                  const pct = maxValue && maxValue > 0 ? (value / maxValue) * 100 : 0;
                  return (
                    <button
                      key={`${district}-${i}`}
                      onClick={() => onDistrictSelect(isSelected ? ALL_DISTRICTS : district)}
                      className={`w-full group transition-all duration-200 ${activeDistrict !== ALL_DISTRICTS && !isSelected ? "opacity-40 grayscale-[50%]" : "opacity-100 hover:scale-[1.02]"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className={`truncate pr-1 ${isSelected ? "text-cyan-400 font-bold" : "text-slate-300 group-hover:text-white"}`}>{district}</span>
                            <span className="text-cyan-300 font-mono tabular-nums font-bold">{formatMetric(value, airLayer)}</span>
                          </div>
                          {parentDistrict && (
                            <p className="text-[8px] text-slate-600 leading-none -mt-0.5 mb-0.5 truncate">{parentDistrict}</p>
                          )}
                          <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-700 to-cyan-400 rounded-full transition-all duration-700" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      <SidebarFooter exclude={["air-quality"]} />
    </div>
  );
}
