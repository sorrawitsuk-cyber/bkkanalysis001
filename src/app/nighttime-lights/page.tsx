/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import NightLightsSidebar from "@/components/gee/NightLightsSidebar";
import { Calendar, FileDown, Layers, Moon, RefreshCw } from "lucide-react";
import bkkDistricts from "@/data/bkk_districts.json";
import {
  fetchCacheIndex,
  fetchCacheMetadata,
  getCacheLayerPreviewUrl,
  type SatelliteCacheIndex,
  type SatelliteCacheMetadata,
} from "@/lib/satellite-cache";

const LSTMapView = dynamic(() => import("@/components/gee/LSTMapView"), { ssr: false });

type MapMode = "district" | "satellite-cache";
type DataProduct = "annual" | "monthly";
const FIRST_YEAR = 2014;
const LATEST_DATA_YEAR = 2024;
const LATEST_MONTHLY_YEAR = 2025;
const LATEST_MONTHLY_MONTH = 3;

function formatRadiance(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", { maximumFractionDigits: digits });
}

function normalizeRows(meta: SatelliteCacheMetadata | null) {
  return ((meta?.district_stats || []) as any[])
    .filter((row) => row?.district_id !== null && row?.district_id !== undefined)
    .map((row) => ({
      district_id: Number(row.district_id),
      district_name: String(row.district_name || ""),
      ntl_mean: typeof row.ntl_mean === "number" ? row.ntl_mean : null,
      ntl_max: typeof row.ntl_max === "number" ? row.ntl_max : null,
      pixel_count: typeof row.pixel_count === "number" ? row.pixel_count : null,
    }));
}

function buildNightLightsView(
  meta: SatelliteCacheMetadata | null,
  baselineMeta: SatelliteCacheMetadata | null,
  selectedYear: number,
  selectedMonth: number,
  dataProduct: DataProduct,
) {
  const rows = normalizeRows(meta);
  const baselineById = new Map(normalizeRows(baselineMeta).map((row) => [row.district_id, row]));
  const rowById = new Map(rows.map((row) => [row.district_id, row]));
  const rankingRows = rows.filter((row) => row.ntl_mean !== null);
  const hasBaseline = baselineById.size > 0;
  const values = rankingRows.map((row) => Number(row.ntl_mean)).filter(Number.isFinite);
  const deltas = rankingRows
    .map((row) => {
      const baseline = baselineById.get(row.district_id)?.ntl_mean;
      return row.ntl_mean !== null && typeof baseline === "number" ? row.ntl_mean - baseline : null;
    })
    .filter((value): value is number => value !== null);

  const features = (bkkDistricts.features as any[]).map((feature) => {
    const row = rowById.get(Number(feature.properties.id));
    const baseline = baselineById.get(Number(feature.properties.id));
    const delta = row?.ntl_mean !== null && row?.ntl_mean !== undefined && baseline?.ntl_mean !== null && baseline?.ntl_mean !== undefined
      ? row.ntl_mean - baseline.ntl_mean
      : null;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        ntl_mean: row?.ntl_mean ?? null,
        ntl_max: row?.ntl_max ?? null,
        ntl_delta: delta,
        pixel_count: row?.pixel_count ?? null,
      },
    };
  });

  const ranking = hasBaseline
    ? [...rankingRows]
        .map((row) => {
          const baseline = baselineById.get(row.district_id)?.ntl_mean;
          const delta = row.ntl_mean !== null && typeof baseline === "number" ? row.ntl_mean - baseline : null;
          const pct = delta !== null && baseline ? (delta / baseline) * 100 : null;
          return [row.district_name, delta, pct];
        })
        .filter((row) => row[1] !== null)
        .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
    : [...rankingRows]
        .sort((a, b) => Number(b.ntl_mean ?? -Infinity) - Number(a.ntl_mean ?? -Infinity))
        .map((row) => [row.district_name, row.ntl_mean, row.ntl_max]);

  const maxRow = rankingRows.length
    ? [...rankingRows].sort((a, b) => Number(b.ntl_mean ?? -Infinity) - Number(a.ntl_mean ?? -Infinity))[0]
    : null;
  const fastestGrowthRow = hasBaseline && ranking.length ? ranking[0]?.[0] : null;
  const monthlyTrend = dataProduct === "monthly"
    ? Array.from({ length: Math.max(3, selectedMonth) }, (_, index) => [
        index + 1,
        index + 1 === selectedMonth && values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : null,
        index + 1 === selectedMonth ? "selected" : "available",
      ])
    : [];

  return {
    geojson: { type: "FeatureCollection", features },
    summary: {
      product: dataProduct,
      selectedYear,
      selectedMonth: dataProduct === "monthly" ? selectedMonth : null,
      compareYear: hasBaseline ? baselineMeta?.period : null,
      averageRadiance: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : null,
      maxRadiance: values.length ? Number(Math.max(...values).toFixed(3)) : null,
      minRadiance: values.length ? Number(Math.min(...values).toFixed(3)) : null,
      maxDistrict: maxRow?.district_name ?? null,
      fastestGrowthDistrict: fastestGrowthRow,
      avgDelta: deltas.length ? Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(3)) : null,
      maxDelta: deltas.length ? Number(Math.max(...deltas).toFixed(3)) : null,
      minDelta: deltas.length ? Number(Math.min(...deltas).toFixed(3)) : null,
      ranking,
      yearlyTrend: dataProduct === "annual" && values.length
        ? [[selectedYear, Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)), null]]
        : [],
      monthlyTrend,
      dataSource: meta?.source ?? "R2 cache",
      units: "nW/sr/cm²",
      cacheStatus: meta?.status ?? "pending",
    },
  };
}

export default function NighttimeLightsPage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [dataProduct, setDataProduct] = useState<DataProduct>("annual");
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedMonth, setSelectedMonth] = useState(3);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2014);
  const [mapMode, setMapMode] = useState<MapMode>("satellite-cache");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.82);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [isExporting, setIsExporting] = useState(false);
  const [cacheIndex, setCacheIndex] = useState<SatelliteCacheIndex | null>(null);
  const [cacheMeta, setCacheMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [compareMeta, setCompareMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);

  useEffect(() => {
    fetchCacheIndex("nightlights").then((index) => {
      setCacheIndex(index);
      if (index.latest_year) setSelectedYear(Number(index.latest_year));
      if (index.latest_month) {
        const [year, month] = index.latest_month.split("-").map(Number);
        if (year && month) {
          setSelectedMonth(month);
        }
      }
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const type = dataProduct === "monthly" ? "monthly" : "yearly";
    const period = dataProduct === "monthly"
      ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
      : String(selectedYear);

    Promise.all([
      fetchCacheMetadata(type, period, "nightlights"),
      compareMode && dataProduct === "annual"
        ? fetchCacheMetadata("yearly", String(compareYear), "nightlights")
        : Promise.resolve(null),
    ])
      .then(async ([meta, baselineMeta]) => {
        setCacheMeta(meta);
        setCompareMeta(baselineMeta);

        // R2 cache has district stats — use them directly (fast path)
        if ((meta?.district_stats?.length ?? 0) > 0) {
          const built = buildNightLightsView(meta, baselineMeta, selectedYear, selectedMonth, dataProduct);
          setGeojsonData(built.geojson);
          setSummary(built.summary);
          setLoading(false);
          return;
        }

        // Cache empty — fall back to GEE API (slow but complete)
        const params = new URLSearchParams({ product: dataProduct, year: String(selectedYear) });
        if (dataProduct === "monthly") params.set("month", String(selectedMonth));
        if (compareMode && dataProduct === "annual") params.set("compareYear", String(compareYear));
        const res = await fetch(`/api/nighttime-lights?${params}`);
        if (!res.ok) throw new Error(`Nighttime Lights API error ${res.status}`);
        const data = await res.json();
        setInvertedMask(data.invertedMask ?? null);
        setGeojsonData(data.geojson);
        setSummary({ ...data.summary, cacheStatus: meta?.status ?? "pending" });
        setLoading(false);
      })
      .catch((error) => {
        console.error("Nighttime lights load failed:", error);
        setCacheMeta(null);
        setCompareMeta(null);
        setGeojsonData(null);
        setSummary(null);
        setLoading(false);
      });
  }, [dataProduct, selectedYear, selectedMonth, compareMode, compareYear]);

  // Load full yearly trend from all R2 cache years (parallel fetch, post-render update)
  useEffect(() => {
    if (!cacheIndex?.yearly?.length || dataProduct !== "annual") return;
    Promise.all(
      (cacheIndex.yearly as string[]).map((yr) =>
        fetchCacheMetadata("yearly", yr, "nightlights").then((m) => {
          const stats = (m?.district_stats ?? []) as any[];
          const vals = stats
            .map((r: any) => r.ntl_mean)
            .filter((v: any): v is number => typeof v === "number" && Number.isFinite(v));
          const avg = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          return [yr, avg !== null ? +avg.toFixed(3) : null, null] as [string, number | null, null];
        })
      )
    )
      .then((rows) => {
        const trend = rows
          .filter((r): r is [string, number, null] => r[1] !== null)
          .sort((a, b) => Number(a[0]) - Number(b[0]));
        if (trend.length > 1) {
          setSummary((prev: any) => (prev ? { ...prev, yearlyTrend: trend } : prev));
        }
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheIndex, dataProduct]);

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setDataProduct("annual");
    setSelectedYear(2024);
    setSelectedMonth(3);
    setCompareMode(false);
    setCompareYear(2014);
    setMapMode("satellite-cache");
    setOpacity(0.82);
    setBaseMap("dark");
  };

  const handleExportPlaceholder = async () => {
    setIsExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setIsExporting(false);
    alert("Nighttime Lights report export จะต่อกับ A4 report template ในรอบถัดไป");
  };

  const isMonthlyPreview = dataProduct === "monthly";
  const monthLabel = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1)).toLocaleDateString("th-TH", { month: "short", year: "numeric" });
  const periodLabel = isMonthlyPreview ? `Monthly preview ${monthLabel}` : `Annual composite ${selectedYear}`;
  const sourceDataset = cacheMeta?.source || (isMonthlyPreview ? "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG" : "NOAA/VIIRS/DNB/ANNUAL_V22");
  const sourceBand = (cacheMeta as any)?.band || (isMonthlyPreview ? "avg_rad + cf_cvg mask" : "average_masked");
  const cachePreviewUrl = getCacheLayerPreviewUrl(cacheMeta, "ntl_mean");

  const kpiCards = [
    {
      label: compareMode && !isMonthlyPreview ? "ส่วนต่างแสงเฉลี่ย" : "ค่าแสงกลางคืนเฉลี่ย",
      value: compareMode && !isMonthlyPreview ? `${(summary?.avgDelta ?? 0) > 0 ? "+" : ""}${formatRadiance(summary?.avgDelta, 3)}` : formatRadiance(summary?.averageRadiance, 3),
    },
    {
      label: compareMode && !isMonthlyPreview ? "เขตเพิ่มขึ้นสูงสุด" : "เขตสว่างที่สุด",
      value: compareMode && !isMonthlyPreview ? summary?.fastestGrowthDistrict || "ไม่มีข้อมูล" : summary?.maxDistrict || "ไม่มีข้อมูล",
    },
    {
      label: compareMode && !isMonthlyPreview ? "ส่วนต่างสูงสุด" : "ค่าสูงสุดรายเขต",
      value: compareMode && !isMonthlyPreview ? `${(summary?.maxDelta ?? 0) > 0 ? "+" : ""}${formatRadiance(summary?.maxDelta, 3)}` : formatRadiance(summary?.maxRadiance, 3),
    },
    {
      label: "ช่วงข้อมูลดาวเทียม",
      value: compareMode && !isMonthlyPreview ? `${selectedYear} vs ${compareYear}` : periodLabel,
    },
  ];

  const legendConfig = compareMode && !isMonthlyPreview
    ? {
        title: "การเปลี่ยนแปลงแสงกลางคืน",
        description: `ค่า avg_rad ปี ${selectedYear} ลบปีฐาน ${compareYear}; สีส้มคือเข้มขึ้น สีฟ้าคืออ่อนลง`,
        unit: "nW/sr/cm²",
        items: [
          { color: "#08306B", label: "ลดลงมาก", range: "< -8" },
          { color: "#4292C6", label: "ลดลง", range: "-8 ถึง -3" },
          { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: "-3 ถึง +3" },
          { color: "#F59E0B", label: "เพิ่มขึ้น", range: "+3 ถึง +8" },
          { color: "#B45309", label: "เพิ่มขึ้นมาก", range: "> +8" },
        ],
      }
    : {
        title: "ระดับความเข้มแสงกลางคืน",
        description: isMonthlyPreview
          ? "ค่า radiance รายเดือนจาก VIIRS DNB ใช้ดูภาพล่าสุดแบบ preview ยังไม่ใช่สถิติ annual"
          : "ค่าเฉลี่ย radiance รายปีจาก VIIRS DNB annual average_masked",
        unit: "nW/sr/cm²",
        items: [
          { color: "#172554", label: "ต่ำมาก", range: "< 5" },
          { color: "#2563EB", label: "ต่ำ", range: "5 - 15" },
          { color: "#FACC15", label: "ปานกลาง", range: "15 - 35" },
          { color: "#F97316", label: "สูง", range: "35 - 60" },
          { color: "#FFFFFF", label: "สูงมาก", range: "> 60" },
        ],
      };

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <NightLightsSidebar
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        summary={summary}
        loading={loading}
        compareMode={compareMode && !isMonthlyPreview}
      />

      <main className="flex-1 min-w-0 relative">
        <div className="absolute inset-0 z-0">
          <LSTMapView
            geojsonData={geojsonData}
            invertedMask={invertedMask}
            activeDistrict={activeDistrict}
            mapMode={mapMode}
            compareMode={compareMode && !isMonthlyPreview}
            summary={summary}
            opacity={opacity}
            baseMap={baseMap}
            analysisType="nightlights"
            dataPeriodLabel={periodLabel}
            nightLightsProduct={dataProduct}
            nightLightsMonth={selectedMonth}
            satelliteCachePreviewUrl={cachePreviewUrl}
            satelliteCacheBounds={cacheMeta?.bounds}
          />
        </div>

        <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
          {kpiCards.map((card) => (
            <div key={card.label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
              <div className="text-[9px] text-slate-500 font-bold tracking-wide leading-tight">{card.label}</div>
              <div className="text-sm font-black text-slate-100 mt-1 truncate">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-yellow-300 rounded-full" />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source Information</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <p><span className="text-white">Satellite:</span> Suomi NPP VIIRS Day/Night Band</p>
            <p><span className="text-white">Source:</span> R2 cache · {sourceDataset}</p>
            <p><span className="text-white">Period:</span> {periodLabel}</p>
            <p><span className="text-white">Band:</span> {sourceBand} · nW/sr/cm²</p>
            <p><span className="text-white">Resolution:</span> ~500m per pixel</p>
            <p><span className="text-white">Cache:</span> {cacheMeta?.status === "ok" ? "พร้อมใช้งาน" : "ยังไม่มี cache สำหรับช่วงนี้"}</p>
            {isMonthlyPreview && <p><span className="text-amber-300">Note:</span> monthly preview ไม่ใช่ annual trend</p>}
          </div>
        </div>

        <div className="absolute bottom-4 right-4 z-[1000] w-80 max-w-[calc(100%-2rem)] rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-3">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">สัญลักษณ์แผนที่</h4>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">{legendConfig.title}</p>
            <p className="mt-1 text-[9px] leading-snug text-slate-500">{legendConfig.description}</p>
          </div>
          <div className="space-y-2">
            {legendConfig.items.map((item) => (
              <div key={`${item.color}-${item.range}`} className="grid grid-cols-[14px_1fr_auto] items-center gap-2 text-[10px]">
                <span className="h-3.5 w-3.5 rounded-sm border border-white/10" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 truncate text-slate-300">{item.label}</span>
                <span className="font-mono text-[9px] text-slate-400">{item.range} {legendConfig.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
        <div className="flex min-h-full flex-col gap-3">
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> แผงควบคุมหลัก
              </h4>
              <button
                onClick={handleReset}
                className="text-[9px] px-2.5 py-1 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 transition-all font-bold"
              >
                RESET
              </button>
            </div>

            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => setMapMode("district")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "district" ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                รายเขต
              </button>
              <button
                onClick={() => setMapMode("satellite-cache")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "satellite-cache" ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                R2 Cache
              </button>
            </div>

            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => {
                  setDataProduct("annual");
                  setSelectedYear(Number(cacheIndex?.latest_year || 2024));
                }}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${dataProduct === "annual" ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                Annual 2014-2024
              </button>
              <button
                onClick={() => {
                  setDataProduct("monthly");
                  const [latestYear, latestMonth] = (cacheIndex?.latest_month || `${LATEST_MONTHLY_YEAR}-${String(LATEST_MONTHLY_MONTH).padStart(2, "0")}`).split("-").map(Number);
                  setSelectedYear(latestYear || LATEST_MONTHLY_YEAR);
                  setSelectedMonth(latestMonth || LATEST_MONTHLY_MONTH);
                  setCompareMode(false);
                }}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${dataProduct === "monthly" ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                2025 Preview
              </button>
            </div>

            {isMonthlyPreview && (
              <div className="mb-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
                <div className="text-[10px] font-bold text-amber-100">ข้อมูลล่าสุดแบบรายเดือน</div>
                <p className="mt-1 text-[9px] leading-snug text-slate-400">
                  มีข้อมูลใน GEE ถึง มี.ค. 2025 เท่านั้น จึงใช้เป็น preview ล่าสุด ไม่ใช้เปรียบเทียบแทน annual 2024
                </p>
              </div>
            )}

            <button
              onClick={handleExportPlaceholder}
              disabled={isExporting}
              className={`w-full py-2.5 rounded-xl text-[10px] font-bold tracking-widest transition-all border flex items-center justify-center gap-2
                ${isExporting
                  ? "bg-slate-800 border-slate-700 text-slate-500 cursor-wait"
                  : "bg-yellow-400/10 text-yellow-200 border-yellow-300/30 hover:bg-yellow-400 hover:text-slate-950 shadow-lg shadow-yellow-400/5"
                }`}
            >
              {isExporting ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> กำลังเตรียมรายงาน...</>
              ) : (
                <><FileDown className="w-3.5 h-3.5" /> เตรียมรายงานสถิติ</>
              )}
            </button>
          </div>

          {mapMode === "satellite-cache" && (
            <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความโปร่งใส (Opacity)</h4>
                <span className="text-xs font-mono text-yellow-200 font-bold bg-yellow-300/10 px-2 py-0.5 rounded-full">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(event) => setOpacity(parseFloat(event.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300"
              />
            </div>
          )}

          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> แผนที่ฐาน (Base Map)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "dark", label: "Dark" },
                { id: "light", label: "Light" },
                { id: "satellite", label: "Satellite" },
                { id: "streets", label: "Street" },
                { id: "none", label: "None" },
              ].map((map) => (
                <button
                  key={map.id}
                  onClick={() => setBaseMap(map.id as any)}
                  className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${baseMap === map.id ? "bg-yellow-400 border-yellow-400 text-slate-950 shadow-md shadow-yellow-400/20" : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}
                >
                  {map.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> เลือกปี (Year)
              </h4>
              <button
                onClick={() => dataProduct === "annual" && setCompareMode(!compareMode)}
                disabled={isMonthlyPreview}
                className={`text-[9px] px-3 py-1.5 rounded-lg transition-all border font-bold ${isMonthlyPreview ? "bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed" : compareMode ? "bg-yellow-300/20 text-yellow-100 border-yellow-300/50" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500"}`}
              >
                {isMonthlyPreview ? "Preview เท่านั้น" : "เปรียบเทียบปี"}
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-mono">{isMonthlyPreview ? LATEST_MONTHLY_YEAR : FIRST_YEAR}</span>
              <span className="text-lg font-bold text-yellow-200 font-mono">{selectedYear}</span>
              <span className="text-xs text-slate-400 font-mono">{isMonthlyPreview ? LATEST_MONTHLY_YEAR : LATEST_DATA_YEAR}</span>
            </div>
            <input
              type="range"
              min={isMonthlyPreview ? LATEST_MONTHLY_YEAR : FIRST_YEAR}
              max={isMonthlyPreview ? LATEST_MONTHLY_YEAR : LATEST_DATA_YEAR}
              value={selectedYear}
              onChange={(event) => setSelectedYear(parseInt(event.target.value, 10))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300 mb-2"
            />

            {isMonthlyPreview && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-bold text-amber-100 uppercase tracking-widest">เดือนข้อมูลล่าสุด</h4>
                  <span className="text-sm font-bold text-amber-100 font-mono">{selectedMonth}/2025</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={LATEST_MONTHLY_MONTH}
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(parseInt(event.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-300"
                />
                <div className="mt-2 flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>ม.ค.</span>
                  <span>มี.ค.</span>
                </div>
              </div>
            )}

            {compareMode && !isMonthlyPreview && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-bold text-yellow-100 uppercase tracking-widest">ปีฐานที่ใช้เทียบ (Baseline)</h4>
                  <span className="text-sm font-bold text-yellow-100 font-mono">{compareYear}</span>
                </div>
                <input
                  type="range"
                  min={FIRST_YEAR}
                  max={LATEST_DATA_YEAR}
                  value={compareYear}
                  onChange={(event) => setCompareYear(parseInt(event.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300"
                />
              </div>
            )}
          </div>

          <div className="mt-auto bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-yellow-300/20 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-yellow-100 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Moon className="w-3.5 h-3.5" /> Nighttime Lights คืออะไร
            </h4>
            <div className="text-[10px] text-slate-400 leading-relaxed space-y-2">
          <p>VIIRS DNB วัดความสว่างกลางคืนของพื้นผิวโลก ค่า radiance สูงมักสัมพันธ์กับกิจกรรมเมือง ถนน อาคาร พาณิชยกรรม และพื้นที่ที่เปิดไฟต่อเนื่อง</p>
              <p>ข้อมูลนี้เหมาะสำหรับดูแนวโน้มความเข้มเมืองเชิงพื้นที่ แต่ไม่ควรตีความเป็นจำนวนประชากรหรือมูลค่าเศรษฐกิจโดยตรง เพราะแสงไฟถนน ท่าเรือ สนามบิน งานก่อสร้าง หรือแสงสะท้อนมีผลต่อค่าได้</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
