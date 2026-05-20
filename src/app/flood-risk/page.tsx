/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import FloodRiskSidebar from "@/components/gee/FloodRiskSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import * as turf from "@turf/turf";
import { Layers } from "lucide-react";
import bkkDistricts from "@/data/bkk_districts.json";
import {
  fetchCacheIndex,
  fetchCacheMetadata,
  getCacheLayerPreviewUrl,
  type SatelliteCacheIndex,
  type SatelliteCacheMetadata,
} from "@/lib/satellite-cache";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel } from "@/lib/export-utils";

const FloodRiskMapView = dynamic(() => import("@/components/map/FloodRiskMapView"), { ssr: false });

type MapMode = "district" | "satellite-cache" | "idw";

const WATER_CACHE_LAYERS = ["ndwi_mean", "ndwi_max", "mndwi_mean"] as const;
type WaterCacheLayer = typeof WATER_CACHE_LAYERS[number];

const WATER_LAYER_LABELS: Record<WaterCacheLayer, string> = {
  ndwi_mean:  "NDWI (mean)",
  ndwi_max:   "NDWI (max)",
  mndwi_mean: "MNDWI (mean)",
};

// Compute inverted mask (world minus Bangkok) once at module level for map clipping
let _bkk: any = (bkkDistricts.features as any[])[0];
for (let i = 1; i < (bkkDistricts.features as any[]).length; i++) {
  _bkk = turf.union(turf.featureCollection([_bkk, (bkkDistricts.features as any[])[i]]));
}
const BKK_INVERTED_MASK = turf.mask(_bkk);

const DISTRICT_AREA_RAI = new Map<number, number>(
  (bkkDistricts.features as any[]).map((feature: any) => [
    Number(feature.properties.id),
    Math.round(turf.area(feature) / 1600),
  ]),
);

function getLayerValue(row: any, layer: WaterCacheLayer): number | null {
  const value = row?.[layer];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (layer === "ndwi_max") {
    const fallback = row?.ndwi_mean;
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }
  return null;
}

function buildFloodRiskView(
  meta: SatelliteCacheMetadata | null,
  baselineMeta: SatelliteCacheMetadata | null,
  selectedYear: number,
  compareYearVal: number | null,
  selectedLayer: WaterCacheLayer,
) {
  const rows = (meta?.district_stats ?? []) as any[];
  const baselineRows = (baselineMeta?.district_stats ?? []) as any[];
  const rowById = new Map(rows.map((r: any) => [Number(r.district_id), r]));
  const baselineById = new Map(baselineRows.map((r: any) => [Number(r.district_id), r]));

  let minValue = Infinity;
  let maxValue = -Infinity;

  const features = (bkkDistricts.features as any[]).map((feature: any) => {
    const row = rowById.get(Number(feature.properties.id));
    const waterRatio: number | null = row?.water_ratio ?? null;
    const layerValue = getLayerValue(row, selectedLayer);
    const districtAreaRai = DISTRICT_AREA_RAI.get(Number(feature.properties.id)) ?? null;
    const waterAreaRai = waterRatio !== null && districtAreaRai !== null
      ? Math.round(waterRatio * districtAreaRai)
      : null;
    const baselineRow = compareYearVal !== null ? baselineById.get(Number(feature.properties.id)) : null;
    const compareRatio: number | null = baselineRow?.water_ratio ?? null;
    const delta = waterRatio !== null && compareRatio !== null
      ? +(waterRatio - compareRatio).toFixed(4) : null;

    if (waterRatio !== null) {
      minValue = Math.min(minValue, waterRatio);
      maxValue = Math.max(maxValue, waterRatio);
    }

    return {
      ...feature,
      properties: {
        ...feature.properties,
        water_ratio: waterRatio,
        water_area_rai: waterAreaRai,
        district_area_rai: districtAreaRai,
        delta,
        compare_water_ratio: compareRatio,
        ndwi_mean: row?.ndwi_mean ?? null,
        ndwi_max: row?.ndwi_max ?? null,
        mndwi_mean: row?.mndwi_mean ?? null,
        display_value: layerValue,
        display_area_rai: waterAreaRai,
        display_layer: selectedLayer,
        display_label: WATER_LAYER_LABELS[selectedLayer],
      },
    };
  });

  const validRows = rows.filter((r: any) => typeof getLayerValue(r, selectedLayer) === "number");
  const avgDisplayValue = validRows.length
    ? parseFloat((validRows.reduce((s: number, r: any) => s + (getLayerValue(r, selectedLayer) ?? 0), 0) / validRows.length).toFixed(4))
    : null;
  const waterRows = rows.filter((r: any) => typeof r.water_ratio === "number");
  const avgWaterRatio = waterRows.length
    ? parseFloat((waterRows.reduce((s: number, r: any) => s + r.water_ratio, 0) / waterRows.length).toFixed(4))
    : null;
  const baselineValidRows = baselineRows.filter((r: any) => typeof r.water_ratio === "number");
  const baselineAvg = baselineValidRows.length
    ? parseFloat((baselineValidRows.reduce((s: number, r: any) => s + r.water_ratio, 0) / baselineValidRows.length).toFixed(4))
    : null;
  const avgDelta = avgWaterRatio !== null && baselineAvg !== null
    ? parseFloat((avgWaterRatio - baselineAvg).toFixed(4)) : null;

  const ranking = [...validRows]
    .sort((a: any, b: any) => (getLayerValue(b, selectedLayer) ?? -Infinity) - (getLayerValue(a, selectedLayer) ?? -Infinity))
    .map((r: any) => {
      const districtId = Number(r.district_id);
      const areaRai = DISTRICT_AREA_RAI.get(districtId) ?? null;
      const waterAreaRai = typeof r.water_ratio === "number" && areaRai !== null ? Math.round(r.water_ratio * areaRai) : null;
      return [r.district_name ?? "ไม่ระบุ", getLayerValue(r, selectedLayer), waterAreaRai];
    });
  const totalWaterAreaRai = waterRows.reduce((sum: number, row: any) => {
    const districtId = Number(row.district_id);
    const areaRai = DISTRICT_AREA_RAI.get(districtId);
    return sum + (typeof row.water_ratio === "number" && areaRai ? Math.round(row.water_ratio * areaRai) : 0);
  }, 0);

  return {
    geojson: { type: "FeatureCollection", features },
    summary: {
      selectedYear,
      compareYear: compareYearVal,
      avgWaterRatio,
      avgDisplayValue,
      totalWaterAreaRai,
      baselineAvg,
      avgDelta,
      topWet: ranking.slice(0, 5),
      topDry: [...ranking].reverse().slice(0, 5),
      ranking,
      yearlyTrend: [],
      waterAreaTrend: [],
      min_value: minValue !== Infinity ? minValue : 0,
      max_value: maxValue !== -Infinity ? maxValue : 0.5,
      displayLayer: selectedLayer,
      displayLabel: WATER_LAYER_LABELS[selectedLayer],
      dataSource: "R2 cache (Sentinel-2)",
      cacheStatus: meta?.status ?? "pending",
    },
  };
}

export default function FloodRiskPage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<MapMode>("district");
  const [granularity, setGranularity] = useState<"district" | "subdistrict">("district");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");

  // Satellite cache state
  const [cacheIndex, setCacheIndex] = useState<SatelliteCacheIndex | null>(null);
  const [yearlyMeta, setYearlyMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [cacheLayer, setCacheLayer] = useState<WaterCacheLayer>("ndwi_mean");

  // Fetch district data — try R2 cache first, fall back to Supabase API
  useEffect(() => {
    setLoading(true);
    const cacheType   = selectedMonth ? "monthly" : "yearly";
    const cachePeriod = selectedMonth
      ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
      : selectedYear.toString();
    const compareYearStr = compareYear.toString();

    Promise.all([
      fetchCacheMetadata(cacheType, cachePeriod),
      compareMode ? fetchCacheMetadata("yearly", compareYearStr) : Promise.resolve(null),
    ])
      .then(async ([meta, baselineMeta]) => {
        setYearlyMeta(meta);
        const stats = (meta?.district_stats ?? []) as any[];
        const hasWaterCache = stats.some((r: any) => typeof r.water_ratio === "number");

        if (hasWaterCache) {
          const built = buildFloodRiskView(meta, baselineMeta, selectedYear, compareMode ? compareYear : null, cacheLayer);
          setGeojsonData(built.geojson);
          setSummary(built.summary);
          setLoading(false);
          return;
        }

        // Cache empty — fall back to Supabase API
        const params = new URLSearchParams({ year: selectedYear.toString() });
        if (activeDistrict !== "ทั้งหมด") params.append("district", activeDistrict);
        if (compareMode) params.append("compareYear", compareYearStr);

        const res = await fetch(`/api/flood-risk?${params}`);
        if (res.ok) {
          const data = await res.json();
          setGeojsonData(data.geojson);
          setSummary({ ...data.summary, cacheStatus: meta?.status ?? "pending" });
        } else {
          // API unavailable — show empty district outlines with no fill
          const built = buildFloodRiskView(null, null, selectedYear, null, cacheLayer);
          setGeojsonData(built.geojson);
          setSummary({ ...built.summary, dataSource: "ไม่มีข้อมูลปีนี้ ระบบกำลังประมวลผล", cacheStatus: "pending" });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        // Show empty district outlines instead of blank map
        const built = buildFloodRiskView(null, null, selectedYear, null, cacheLayer);
        setGeojsonData(built.geojson);
        setSummary({ ...built.summary, dataSource: "ไม่มีข้อมูลปีนี้ ระบบกำลังประมวลผล", cacheStatus: "pending" });
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDistrict, selectedYear, selectedMonth, compareMode, compareYear, cacheLayer]);

  // Load satellite cache index on mount (Sentinel-2, no product param)
  useEffect(() => { fetchCacheIndex().then(setCacheIndex); }, []);

  // Build full yearly trend from all R2 cache years (parallel fetch, post-render injection)
  useEffect(() => {
    if (!cacheIndex?.yearly?.length) return;
    Promise.all(
      (cacheIndex.yearly as string[]).map((yr) =>
        fetchCacheMetadata("yearly", yr).then((m) => {
          const stats = (m?.district_stats ?? []) as any[];
          const vals  = stats
            .map((r: any) => getLayerValue(r, cacheLayer))
            .filter((v: any): v is number => typeof v === "number" && Number.isFinite(v));
          const avg = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          return [yr, avg !== null ? +avg.toFixed(4) : null] as [string, number | null];
        })
      )
    )
      .then((rows) => {
        const trend = rows
          .filter((r): r is [string, number] => r[1] !== null)
          .sort((a, b) => Number(a[0]) - Number(b[0]));
        if (trend.length > 1) {
          setSummary((prev: any) => (prev ? { ...prev, yearlyTrend: trend } : prev));
        }
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheIndex, cacheLayer]);

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setSelectedMonth(null);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode("district");
    setGranularity("district");
    setOpacity(0.78);
    setBaseMap("dark");
    setCacheLayer("ndwi_mean");
  };

  const cachePreviewUrl = getCacheLayerPreviewUrl(yearlyMeta, cacheLayer);

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  // Legend config
  let legendConfig: { title: string; description: string; unit: string; items: { color: string; label: string; range: string }[] };
  if (compareMode) {
    legendConfig = {
      title: "การเปลี่ยนแปลงพื้นที่น้ำ",
      description: `ค่าน้ำปี ${selectedYear} ลบปีฐาน ${compareYear} (บวก = น้ำเพิ่ม)`,
      unit: "",
      items: [
        { color: "#1e3a5f", label: "น้ำเพิ่มมาก", range: "> +10%" },
        { color: "#0369a1", label: "น้ำเพิ่ม", range: "+3% ถึง +10%" },
        { color: "#94a3b8", label: "ใกล้เคียงเดิม", range: "-3% ถึง +3%" },
        { color: "#b45309", label: "น้ำลด", range: "-10% ถึง -3%" },
        { color: "#78350f", label: "น้ำลดมาก", range: "< -10%" },
      ],
    };
  } else if (mapMode === "satellite-cache" && (cacheLayer === "ndwi_mean" || cacheLayer === "ndwi_max")) {
    legendConfig = {
      title: `NDWI — ดัชนีน้ำผิวดิน (${WATER_LAYER_LABELS[cacheLayer]})`,
      description: "ค่าสูง = น้ำ/ความชื้นสูง  ค่าต่ำ = ดินแห้ง พืช หรือสิ่งปลูกสร้าง",
      unit: "",
      items: [
        { color: "#92400E", label: "ดินแห้ง/พืช",   range: "< -0.30" },
        { color: "#C4974A", label: "กึ่งแห้ง",      range: "-0.30 ถึง -0.10" },
        { color: "#F7F7F7", label: "กลาง",           range: "-0.10 ถึง 0.10" },
        { color: "#7EC8E3", label: "ชื้น/น้ำตื้น",  range: "0.10 ถึง 0.30" },
        { color: "#0369A1", label: "น้ำผิวดิน",     range: "> 0.30" },
      ],
    };
  } else if (mapMode === "satellite-cache") {
    legendConfig = {
      title: "MNDWI — ดัชนีน้ำในเมือง (mean)",
      description: "แม่นกว่า NDWI ในพื้นที่เมือง ลดการรบกวนจากสิ่งปลูกสร้าง",
      unit: "",
      items: [
        { color: "#92400E", label: "ดิน/พืช",       range: "< -0.30" },
        { color: "#C4974A", label: "กึ่งแห้ง",      range: "-0.30 ถึง -0.10" },
        { color: "#F7F7F7", label: "กลาง",           range: "-0.10 ถึง 0.10" },
        { color: "#60ACD8", label: "น้ำตื้น/ชื้น",  range: "0.10 ถึง 0.30" },
        { color: "#0284C7", label: "น้ำ/คลอง",      range: "> 0.30" },
      ],
    };
  } else {
    legendConfig = {
      title: "สัดส่วนพื้นที่น้ำรายเขต",
      description: "สัดส่วนพิกเซลที่เป็นน้ำต่อพื้นที่เขต จาก Sentinel-2",
      unit: "%",
      items: [
        { color: "#e0f2fe", label: "พื้นที่แห้ง",            range: "< 5%" },
        { color: "#7dd3fc", label: "มีน้ำน้อย",              range: "5% – 15%" },
        { color: "#38bdf8", label: "พื้นที่ชื้น",            range: "15% – 25%" },
        { color: "#0284c7", label: "แหล่งน้ำ / เสี่ยงท่วม", range: "25% – 40%" },
        { color: "#075985", label: "พื้นที่น้ำถาวร",         range: "> 40%" },
      ],
    };
  }

  const periodLabel = selectedMonth
    ? buildPeriodLabel(selectedYear, selectedMonth)
    : selectedYear === new Date().getFullYear()
      ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
      : `1 ม.ค. – 31 ธ.ค. ${selectedYear}`;

  const rankingForExport: (string | number | null)[][] = (summary?.ranking ?? []).map(
    ([name, val, areaRai]: [string, number | null, number | null]) => [
      name,
      val !== null ? +val.toFixed(4) : null,
      areaRai ?? null,
      WATER_LAYER_LABELS[cacheLayer] ?? cacheLayer,
      selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear,
    ],
  );

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <FloodRiskSidebar
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        summary={summary}
        geojsonData={displayGeoJson}
        loading={loading}
        compareMode={compareMode}
        mapMode={mapMode}
        granularity={granularity}
      />

      <main className="flex-1 min-w-0 relative">
        <div className="absolute inset-0 z-0">
          <FloodRiskMapView
            geojsonData={displayGeoJson}
            invertedMask={BKK_INVERTED_MASK}
            activeDistrict={activeDistrict}
            mapMode={mapMode}
            compareMode={compareMode}
            summary={summary}
            opacity={opacity}
            baseMap={baseMap}
            satelliteCachePreviewUrl={cachePreviewUrl}
            satelliteCacheBounds={yearlyMeta?.bounds}
            granularity={granularity}
            ndwiMetric={cacheLayer === "mndwi_mean" ? "mndwi" : "ndwi"}
          />
        </div>

        {/* Data source info (bottom-left) */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${mapMode === "satellite-cache" ? "bg-sky-400" : "bg-cyan-500"}`} />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            {mapMode === "idw" ? (
              <>
                <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
                <p><span className="text-white">Period:</span> {periodLabel}</p>
                <p><span className="text-white">Layer:</span> {WATER_LAYER_LABELS[cacheLayer] ?? cacheLayer} (GEE Live)</p>
                <p><span className="text-white">Resolution:</span> 10m per pixel (real-time)</p>
              </>
            ) : (
              <>
                <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
                <p><span className="text-white">Period:</span> {periodLabel}</p>
                <p><span className="text-white">Index:</span> water_ratio (NDWI-based)</p>
                <p><span className="text-white">Resolution:</span> district-level</p>
              </>
            )}
          </div>
        </div>

        {/* Legend (bottom-right) */}
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

      {/* Right control panel */}
      <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
        <div className="flex min-h-full flex-col gap-3">

          {/* Main controls */}
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

            {/* Granularity Toggle */}
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">ขอบเขต</p>
            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => setGranularity("district")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${granularity === "district" && mapMode === "district" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                เขต (50)
              </button>
              <button
                onClick={() => setGranularity("subdistrict")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${granularity === "subdistrict" && mapMode === "district" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                แขวง (180)
              </button>
            </div>

            {/* Map mode toggle */}
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">รูปแบบ</p>
            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => setMapMode("district")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "district" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                สถิติ
              </button>
              <button
                onClick={() => setMapMode("idw")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "idw" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                ดาวเทียม (GEE)
              </button>
            </div>

            {/* Live GEE layer picker */}
            {mapMode === "idw" && (
              <div className="mt-1 rounded-lg border border-sky-800/50 bg-sky-950/30 p-3 space-y-2">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">ชั้นข้อมูล (WATER)</p>
                <div className="flex flex-col gap-1">
                  {WATER_CACHE_LAYERS.map((key) => (
                    <button
                      key={key}
                      onClick={() => setCacheLayer(key)}
                      className={`text-[9px] px-2 py-1.5 rounded-lg border transition-all font-bold text-left ${cacheLayer === key ? "bg-sky-500/20 border-sky-500/60 text-sky-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}
                    >
                      {WATER_LAYER_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Opacity slider (raster modes) */}
          {mapMode === "idw" && (
            <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความโปร่งใส</h4>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full text-sky-400 bg-sky-500/10">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
              />
            </div>
          )}

          {/* Base map */}
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> แผนที่ฐาน (Base Map)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "dark",      label: "Dark" },
                { id: "light",     label: "Light" },
                { id: "satellite", label: "Satellite" },
                { id: "streets",   label: "Street" },
                { id: "none",      label: "None" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setBaseMap(m.id as any)}
                  className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${baseMap === m.id ? "bg-sky-500 border-sky-500 text-white shadow-md shadow-sky-500/20" : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <MonthYearPicker
            year={selectedYear}
            month={selectedMonth}
            minYear={cacheIndex?.yearly?.length ? Math.min(...cacheIndex.yearly.map(Number)) : 2018}
            maxYear={cacheIndex?.yearly?.length ? Math.max(...cacheIndex.yearly.map(Number)) : 2026}
            availableMonths={cacheIndex?.monthly ?? []}
            onYearChange={setSelectedYear}
            onMonthChange={setSelectedMonth}
            accentColor="sky"
            compareMode={compareMode}
            compareYear={compareYear}
            onCompareModeChange={setCompareMode}
            onCompareYearChange={setCompareYear}
          />

          <ExportPanel
            accentColor="sky"
            csvFilename={`flood-risk_${selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear}`}
            csvHeaders={["เขต", WATER_LAYER_LABELS[cacheLayer], "พื้นที่น้ำ (ไร่)", "Layer", "ช่วงเวลา"]}
            csvRows={rankingForExport}
            reportData={{
              title: "วิเคราะห์น้ำท่วม / แหล่งน้ำ",
              subtitle: "Sentinel-2 SR Harmonized",
              source: "Sentinel-2 (R2 Cache)",
              period: periodLabel,
              layer: WATER_LAYER_LABELS[cacheLayer],
              district: activeDistrict,
              kpis: [
                { label: "Water Ratio เฉลี่ย", value: summary?.avgWaterRatio !== null ? `${(+(summary?.avgWaterRatio ?? 0) * 100).toFixed(2)}%` : "–" },
                { label: "พื้นที่น้ำรวม", value: summary?.totalWaterAreaRai != null ? `${summary.totalWaterAreaRai.toLocaleString()} ไร่` : "–" },
                { label: "ปีที่เลือก", value: String(selectedYear) },
              ],
              rankingHeaders: ["เขต", WATER_LAYER_LABELS[cacheLayer], "พื้นที่น้ำ (ไร่)"],
              rankingRows: rankingForExport.map(([name, val, area]) => [name, val, area]),
            }}
          />

          {/* Info card */}
          <div className="mt-auto bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-sky-500/20 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-sky-300 uppercase tracking-widest mb-2">หลักวิชาการที่ใช้</h4>
            <div className="text-[10px] text-slate-400 leading-relaxed space-y-2">
              <p>
                <span className="text-slate-100 font-bold">NDWI</span> = (Green - NIR) / (Green + NIR) เป็นดัชนีตรวจสัญญาณน้ำผิวดินหรือความชื้นจากภาพดาวเทียม ไม่ใช่แบบจำลองน้ำท่วมโดยตรง
              </p>
              <p>
                <span className="text-slate-100 font-bold">MNDWI</span> = (Green - SWIR) / (Green + SWIR) มักเหมาะกับเมืองมากขึ้น เพราะลดการรบกวนจาก built-up surface เมื่อเทียบกับ NDWI
              </p>
              <p>
                <span className="text-sky-300 font-bold">Water ratio</span> คือสัดส่วนพิกเซลที่มีค่า NDWI มากกว่า 0 ใช้ประมาณปริมาณพื้นที่น้ำรวมและรายเขต/แขวง
              </p>
              <p className="text-slate-500">
                ค่า NDWI/MNDWI เป็นดัชนีดาวเทียม ควรอ่านร่วมกับฤดูกาล เมฆ และจำนวนภาพที่นำมาทำ composite
              </p>
            </div>
          </div>

        </div>
      </aside>
    </div>
  );
}
