/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity, Building2, Calendar, ChevronRight,
  Droplets, Flame, Home, Layers, MapPin,
  RefreshCw, ShieldAlert, Trees, Wind,
} from "lucide-react";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false });

type MapMode = "district" | "idw";
type AirLayer = "no2_mean" | "co_mean" | "so2_mean" | "aerosol_index_mean" | "pollution_score";

const ALL_DISTRICTS = "ทั้งหมด";
const FIRST_YEAR = 2019;
const LATEST_YEAR = 2026;

const AIR_LAYERS: Array<{ id: AirLayer; label: string; labelTh: string; unit: string }> = [
  { id: "no2_mean",            label: "NO₂",    labelTh: "ไนโตรเจนไดออกไซด์",  unit: "mol/m²" },
  { id: "co_mean",             label: "CO",     labelTh: "คาร์บอนมอนอกไซด์",    unit: "mol/m²" },
  { id: "so2_mean",            label: "SO₂",    labelTh: "ซัลเฟอร์ไดออกไซด์",   unit: "mol/m²" },
  { id: "aerosol_index_mean",  label: "Aerosol",labelTh: "ละอองลอยในอากาศ",     unit: "index"  },
  { id: "pollution_score",     label: "Score",  labelTh: "คะแนนมลพิษรวม",       unit: "0–10"   },
];

function formatMetric(value: number | null | undefined, layer: AirLayer): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (layer === "pollution_score")       return value.toFixed(2);
  if (layer === "co_mean")              return value.toFixed(4);
  if (layer === "aerosol_index_mean")   return value.toFixed(3);
  return value.toFixed(6);
}

export default function AirQualityPage() {
  const [activeDistrict, setActiveDistrict]   = useState(ALL_DISTRICTS);
  const [selectedYear,   setSelectedYear]     = useState(LATEST_YEAR);
  const [compareMode,    setCompareMode]       = useState(false);
  const [compareYear,    setCompareYear]       = useState(FIRST_YEAR);
  const [mapMode,        setMapMode]           = useState<MapMode>("idw");
  const [baseMap,        setBaseMap]           = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [opacity,        setOpacity]           = useState(0.78);
  const [airLayer,       setAirLayer]          = useState<AirLayer>("no2_mean");
  const [geojsonData,    setGeojsonData]       = useState<any>(null);
  const [invertedMask,   setInvertedMask]      = useState<any>(null);
  const [summary,        setSummary]           = useState<any>(null);
  const [loading,        setLoading]           = useState(true);
  const [showAll,        setShowAll]           = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(selectedYear), metric: "air_pollution" });
    if (activeDistrict !== ALL_DISTRICTS) params.append("district", activeDistrict);
    if (compareMode) params.append("compareYear", String(compareYear));

    fetch(`/api/district-metrics?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setGeojsonData(null);
        setSummary(null);
        setLoading(false);
      });
  }, [activeDistrict, selectedYear, compareMode, compareYear]);

  const features = geojsonData?.features ?? [];

  const rankingRows: [string, number][] = useMemo(() => {
    return [...features]
      .filter((f: any) => typeof f?.properties?.[airLayer] === "number")
      .sort((a: any, b: any) => Number(b.properties[airLayer]) - Number(a.properties[airLayer]))
      .map((f: any) => [f.properties.name_th as string, Number(f.properties[airLayer])]);
  }, [features, airLayer]);

  const values = rankingRows.map(([, v]) => v);
  const avgValue   = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  const maxValue   = values.length ? Math.max(...values) : null;
  const topDistrict = rankingRows[0]?.[0] ?? null;

  const latestLabel = selectedYear === new Date().getFullYear()
    ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${selectedYear} (YTD)`
    : `1 ม.ค. – 31 ธ.ค. ${selectedYear}`;

  const layerMeta = AIR_LAYERS.find((l) => l.id === airLayer) ?? AIR_LAYERS[0];

  const handleReset = () => {
    setActiveDistrict(ALL_DISTRICTS);
    setSelectedYear(LATEST_YEAR);
    setCompareMode(false);
    setCompareYear(FIRST_YEAR);
    setMapMode("idw");
    setBaseMap("dark");
    setOpacity(0.78);
    setAirLayer("no2_mean");
    setShowAll(false);
  };

  const skeletonLoader = (
    <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 p-5 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto hidden md:flex">
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-slate-800/50 rounded w-3/4" />
        <div className="h-24 bg-slate-800/50 rounded" />
        <div className="h-40 bg-slate-800/50 rounded" />
        <div className="h-64 bg-slate-800/50 rounded" />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-50">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      {loading && !summary ? skeletonLoader : (
        <div className="w-80 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-full z-10 relative shadow-2xl shrink-0 overflow-y-auto custom-scrollbar hidden md:flex">

          {/* Sticky header */}
          <div className="p-5 border-b border-slate-800/60 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-20">
            <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-400 hover:text-cyan-300 transition-colors">
              <Home className="h-3 w-3" /> Bangkok Analytics
            </Link>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-500/30 shrink-0">
                <Wind className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-slate-100 leading-tight">มลพิษอากาศจากดาวเทียม</h1>
                <p className="text-[10px] text-cyan-200 mt-0.5 font-bold leading-snug">ดัชนีมลพิษจาก Sentinel-5P</p>
              </div>
            </div>
            <p className="mb-3 text-[10px] leading-relaxed text-slate-400">
              วิเคราะห์ความเข้มข้นของมลพิษทางอากาศ (NO₂ CO SO₂ Aerosol) จากข้อมูลดาวเทียม Sentinel-5P TROPOMI เพื่อประเมินคุณภาพอากาศรายเขตในกรุงเทพฯ
            </p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {["Sentinel-5P", layerMeta.label, "1113km orbit", `${FIRST_YEAR}–${LATEST_YEAR}`].map((badge) => (
                <span key={badge} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[9px] font-bold text-cyan-200">
                  {badge}
                </span>
              ))}
            </div>

            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> พื้นที่ (District)
            </label>
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-xs rounded-md px-3 py-2 appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors cursor-pointer"
            >
              <option value={ALL_DISTRICTS}>กรุงเทพมหานคร (ทั้งหมด)</option>
              {rankingRows.map(([d]) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Scrollable body */}
          <div className="p-5 flex-1 flex flex-col gap-6">

            {/* KPI cards */}
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
                  <Calendar className="w-3 h-3 text-emerald-400 shrink-0" /> ปีข้อมูล
                </div>
                <div className="text-sm font-bold text-emerald-400 font-mono leading-tight">
                  {compareMode ? `${selectedYear} vs ${compareYear}` : selectedYear}
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-800/60" />

            {/* Layer selector */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <Layers className="h-3 w-3" /> ตัวชี้วัด (Layer)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {AIR_LAYERS.map((layer) => (
                  <button
                    key={layer.id}
                    onClick={() => setAirLayer(layer.id)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      airLayer === layer.id
                        ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                    }`}
                  >
                    <span className="text-xs font-bold">{layer.label}</span>
                    <span className="mt-0.5 block text-[9px] font-medium text-slate-500 leading-tight">{layer.labelTh}</span>
                    <span className="block text-[8px] text-slate-600">{layer.unit}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="h-px bg-slate-800/60" />

            {/* Year & compare */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <Calendar className="h-3 w-3" /> ช่วงปีข้อมูล
              </h3>
              <input
                type="range"
                min={FIRST_YEAR}
                max={LATEST_YEAR}
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span className="leading-tight">{latestLabel}</span>
                <span className="font-mono font-bold text-cyan-300">{selectedYear}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMapMode(mapMode === "idw" ? "district" : "idw")}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:border-cyan-400/50 transition-colors"
                >
                  {mapMode === "idw" ? "แผนที่ GEE (live)" : "สีรายเขต"}
                </button>
                <button
                  onClick={() => setCompareMode(!compareMode)}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                    compareMode
                      ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400/50"
                  }`}
                >
                  เปรียบเทียบปี
                </button>
              </div>

              {compareMode && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>ปีฐาน (Baseline)</span>
                    <span className="font-mono font-bold text-cyan-300">{compareYear}</span>
                  </div>
                  <input
                    type="range"
                    min={FIRST_YEAR}
                    max={selectedYear - 1}
                    value={compareYear}
                    onChange={(e) => setCompareYear(Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>
              )}
            </section>

            <div className="h-px bg-slate-800/60" />

            {/* Data quality note */}
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <Activity className="h-3 w-3" /> คุณภาพข้อมูล
              </h3>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                <div className="text-[10px] font-bold text-cyan-200">Sentinel-5P TROPOMI · {layerMeta.labelTh}</div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-400">
                  ค่า column density จากดาวเทียม <span className="text-cyan-300 font-bold">ไม่ใช่ AQI</span> จากสถานีตรวจวัดภาคพื้น ใช้เปรียบเทียบแนวโน้มมลพิษรายพื้นที่เท่านั้น ความละเอียด ~3.5×5.5 กม./pixel
                </p>
              </div>
            </section>

            <div className="h-px bg-slate-800/60" />

            {/* Ranking */}
            <section className="flex-1 pb-10">
              <div className="flex justify-between items-start gap-2 mb-3">
                <h3 className="min-w-0 flex-1 text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em] flex items-start gap-1.5 leading-tight">
                  <MapPin className="w-3 h-3" />
                  {compareMode ? "อันดับเปลี่ยนแปลงรายเขต" : `อันดับ ${layerMeta.label} รายเขต`}
                </h3>
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="shrink-0 max-w-[74px] text-right text-[9px] leading-tight text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wide transition-colors"
                >
                  {showAll ? "แสดง Top 10" : "แสดงทั้ง 50 เขต"}
                </button>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 bg-slate-800/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : rankingRows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800 p-4 flex flex-col items-center gap-2">
                  <Wind className="w-6 h-6 text-slate-700" />
                  <span className="text-[10px] text-slate-600 text-center leading-relaxed">
                    ยังไม่มีข้อมูลรายเขตใน layer นี้<br/>GEE live raster ยังดูได้บนแผนที่
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {rankingRows.slice(0, showAll ? 50 : 10).map(([district, value], i) => {
                    const isSelected = activeDistrict === district;
                    const pct = maxValue && maxValue > 0 ? (value / maxValue) * 100 : 0;
                    return (
                      <button
                        key={district}
                        onClick={() => setActiveDistrict(isSelected ? ALL_DISTRICTS : district)}
                        className={`w-full group transition-all duration-200 ${
                          activeDistrict !== ALL_DISTRICTS && !isSelected
                            ? "opacity-40 grayscale-[50%]"
                            : "opacity-100 hover:scale-[1.02]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 w-4 text-right font-mono shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-[11px] mb-0.5">
                              <span className={`truncate pr-1 ${isSelected ? "text-cyan-400 font-bold" : "text-slate-300 group-hover:text-white"}`}>
                                {district}
                              </span>
                              <span className="text-cyan-300 font-mono tabular-nums font-bold">
                                {formatMetric(value, airLayer)}
                              </span>
                            </div>
                            <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-700 to-cyan-400 rounded-full transition-all duration-700"
                                style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800/60 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest shrink-0">ความโปร่งใส</span>
              <input
                type="range" min="0.2" max="1" step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="flex-1 accent-cyan-400"
              />
              <span className="text-[10px] font-mono text-cyan-300 shrink-0">{Math.round(opacity * 100)}%</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={baseMap}
                onChange={(e) => setBaseMap(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="satellite">Satellite</option>
                <option value="streets">Streets</option>
                <option value="none">None</option>
              </select>
              <button
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-cyan-400/50 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" /> รีเซ็ต
              </button>
            </div>
            <div className="flex flex-col items-center gap-2 pt-1 text-center">
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
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────────────────────── */}
      <main className="relative min-w-0 flex-1">
        <DistrictMetricsMapView
          geojsonData={geojsonData}
          invertedMask={invertedMask}
          activeDistrict={activeDistrict}
          mapMode={mapMode}
          compareMode={compareMode}
          summary={summary}
          opacity={opacity}
          baseMap={baseMap}
          analysisType="air"
          airPollutionLayer={airLayer}
          dataPeriodLabel={latestLabel}
        />

        <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] max-w-xs rounded-xl border border-slate-700/70 bg-slate-950/90 p-3 text-[10px] leading-5 text-slate-400 shadow-xl backdrop-blur">
          <div className="mb-1 flex items-center gap-2 font-bold uppercase tracking-widest text-slate-300 text-[9px]">
            <Activity className="h-3 w-3 text-cyan-300" /> ข้อมูลดาวเทียม (Satellite Proxy)
          </div>
          <p>
            ค่า <span className="text-cyan-300 font-bold">{layerMeta.label}</span> column density จาก Sentinel-5P{" "}
            <span className="text-amber-300">ไม่ใช่ AQI</span> จากสถานีตรวจวัดภาคพื้น — ใช้ประเมินแนวโน้มเชิงพื้นที่เท่านั้น
          </p>
        </div>
      </main>
    </div>
  );
}
