/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import FloodRiskSidebar from "@/components/gee/FloodRiskSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import * as turf from "@turf/turf";
import { TrendingUp, TrendingDown, MapPin, X, Download, FileText } from "lucide-react";
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
import { buildPeriodLabel, downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area,
} from "recharts";

const FloodRiskMapView = dynamic(() => import("@/components/map/FloodRiskMapView"), { ssr: false, loading: () => <MapSkeleton /> });

type MapMode = "district" | "satellite-cache" | "idw";

const WATER_CACHE_LAYERS = ["ndwi_mean", "ndwi_max", "mndwi_mean"] as const;
type WaterCacheLayer = typeof WATER_CACHE_LAYERS[number];

const WATER_LAYER_LABELS: Record<WaterCacheLayer, string> = {
  ndwi_mean:  "NDWI (mean)",
  ndwi_max:   "NDWI (max)",
  mndwi_mean: "MNDWI (mean)",
};

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
        seasonal_water_ratio: row?.seasonal_water_ratio ?? null,
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
      // Use water_ratio as the percentage-displayable value; fall back to index value only if unavailable
      return [r.district_name ?? "ไม่ระบุ", r.water_ratio ?? getLayerValue(r, selectedLayer), waterAreaRai];
    });
  const totalWaterAreaRai = waterRows.length > 0
    ? waterRows.reduce((sum: number, row: any) => {
        const districtId = Number(row.district_id);
        const areaRai = DISTRICT_AREA_RAI.get(districtId);
        return sum + (typeof row.water_ratio === "number" && areaRai ? Math.round(row.water_ratio * areaRai) : 0);
      }, 0)
    : null;

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

function lerpColor(lo: [number, number, number], hi: [number, number, number], t: number): string {
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * t);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * t);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * t);
  return `rgb(${r},${g},${b})`;
}
const BAR_LOW: [number, number, number] = [186, 230, 253];
const BAR_HIGH: [number, number, number] = [3, 105, 161];

export default function FloodRiskPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
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

  const [cacheIndex, setCacheIndex] = useState<SatelliteCacheIndex | null>(null);
  const [yearlyMeta, setYearlyMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [cacheLayer, setCacheLayer] = useState<WaterCacheLayer>("ndwi_mean");
  const [cacheDataMissing, setCacheDataMissing] = useState(false);

  useEffect(() => {
    setLoading(true);
    const cacheType   = selectedMonth ? "monthly" : "yearly";
    const cachePeriod = selectedMonth
      ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
      : selectedYear.toString();
    const compareYearStr = compareYear.toString();

    setCacheDataMissing(false);
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

        // No cache data for this period — flag it so the UI can warn the user
        if (selectedMonth) setCacheDataMissing(true);

        const params = new URLSearchParams({ year: selectedYear.toString() });
        if (activeDistrict !== "ทั้งหมด") params.append("district", activeDistrict);
        if (compareMode) params.append("compareYear", compareYearStr);

        const res = await fetch(`/api/flood-risk?${params}`);
        if (res.ok) {
          const data = await res.json();
          setGeojsonData(data.geojson);
          setSummary({ ...data.summary, cacheStatus: meta?.status ?? "pending" });
        } else {
          const built = buildFloodRiskView(null, null, selectedYear, null, cacheLayer);
          setGeojsonData(built.geojson);
          setSummary({ ...built.summary, dataSource: "ไม่มีข้อมูลปีนี้ ระบบกำลังประมวลผล", cacheStatus: "pending" });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (selectedMonth) setCacheDataMissing(true);
        const built = buildFloodRiskView(null, null, selectedYear, null, cacheLayer);
        setGeojsonData(built.geojson);
        setSummary({ ...built.summary, dataSource: "ไม่มีข้อมูลปีนี้ ระบบกำลังประมวลผล", cacheStatus: "pending" });
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDistrict, selectedYear, selectedMonth, compareMode, compareYear, cacheLayer]);

  useEffect(() => { fetchCacheIndex().then(setCacheIndex); }, []);

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
    setCacheDataMissing(false);
  };

  const cachePreviewUrl = getCacheLayerPreviewUrl(yearlyMeta, cacheLayer);

  const allDistricts = useMemo((): string[] =>
    [...new Set<string>((geojsonData?.features ?? []).map((f: any) => f.properties.name_th as string).filter((s: unknown): s is string => !!s))]
      .sort((a, b) => a.localeCompare(b, "th")),
    [geojsonData],
  );

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  const periodLabel = selectedMonth
    ? buildPeriodLabel(selectedYear, selectedMonth)
    : selectedYear === new Date().getFullYear()
      ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
      : `1 ม.ค. – 31 ธ.ค. ${selectedYear}`;

  const csvFilename = `flood-risk_${selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear}`;
  const csvHeaders = ["เขต", WATER_LAYER_LABELS[cacheLayer], "พื้นที่น้ำ (ไร่)", "Layer", "ช่วงเวลา"];

  const rankingForExport: (string | number | null)[][] = (summary?.ranking ?? []).map(
    ([name, val, areaRai]: [string, number | null, number | null]) => [
      name,
      val !== null ? +val.toFixed(4) : null,
      areaRai ?? null,
      WATER_LAYER_LABELS[cacheLayer] ?? cacheLayer,
      selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear,
    ],
  );

  const reportData = useMemo((): PDFReportData => ({
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
  }), [periodLabel, cacheLayer, activeDistrict, summary, selectedYear, rankingForExport]);

  // Stats bar chart data — top 25 districts by water_ratio
  const statsBarData = useMemo(() => {
    if (!geojsonData?.features) return [];
    return (geojsonData.features as any[])
      .map((f: any) => ({
        name: f.properties.name_th ?? "–",
        value: typeof f.properties.water_ratio === "number"
          ? +(f.properties.water_ratio * 100).toFixed(2)
          : null,
      }))
      .filter((d: any) => d.value !== null && d.name !== "–" && (activeDistrict === "ทั้งหมด" || d.name === activeDistrict))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 25);
  }, [geojsonData, activeDistrict]);

  const statsTrendData = useMemo(() => {
    return (summary?.yearlyTrend ?? []).map(([year, val]: any) => ({
      year: String(year),
      value: typeof val === "number" ? +val.toFixed(4) : null,
    }));
  }, [summary?.yearlyTrend]);

  // Table columns
  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต" },
    { key: "water_ratio", label: "สัดส่วนน้ำ", unit: "%", format: (v) => v != null ? (v * 100).toFixed(2) : "–", heatmap: true, heatmapHex: "#3b82f6" },
    { key: "water_area_rai", label: "พื้นที่น้ำ", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", heatmap: true, heatmapHex: "#60a5fa" },
    { key: "ndwi_mean", label: "NDWI mean", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#06b6d4" },
    ...(compareMode ? [{ key: "delta", label: "เปลี่ยนแปลง", format: (v: any) => v != null ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)}%` : "–" }] : []),
  ];

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
      title: "สัดส่วนพื้นที่น้ำรายเขต (ไม่รวมแม่น้ำถาวร)",
      description: "สัดส่วนพิกเซล NDWI > 0.05 ต่อพื้นที่เขต ยกเว้นแม่น้ำเจ้าพระยา (JRC ≥ 70%)",
      unit: "%",
      items: [
        { color: "#bae6fd", label: "แห้งมาก",       range: "< 1.5%" },
        { color: "#7dd3fc", label: "มีน้ำน้อย",     range: "1.5% – 4%" },
        { color: "#0ea5e9", label: "มีน้ำปานกลาง", range: "4% – 8%" },
        { color: "#0369a1", label: "มีน้ำมาก",      range: "8% – 15%" },
        { color: "#075985", label: "แหล่งน้ำ/แม่น้ำ", range: "> 15%" },
      ],
    };
  }

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      {viewMode === "map" && (
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
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="sky" />
          <div className="flex items-center gap-1.5">
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              className="h-7 rounded-lg border border-slate-700 bg-slate-900/80 px-2 text-[11px] text-slate-300 focus:border-slate-500 focus:outline-none"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {allDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {activeDistrict !== "ทั้งหมด" && (
              <button
                onClick={() => setActiveDistrict("ทั้งหมด")}
                className="flex items-center justify-center h-7 w-7 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {viewMode !== "map" && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => downloadCSV(csvHeaders, rankingForExport, csvFilename)}
                className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-700 bg-slate-900/80 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                onClick={() => printReport(reportData)}
                className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-sky-700/50 bg-sky-950/30 text-[11px] text-sky-400 hover:text-sky-200 transition-colors"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
          <div className="ml-auto text-[10px] text-slate-500">
            {loading ? "กำลังโหลด…" : `${selectedYear}${selectedMonth ? `-${String(selectedMonth).padStart(2, "0")}` : ""} • ${WATER_LAYER_LABELS[cacheLayer]}`}
          </div>
        </div>

        {/* Map view */}
        {viewMode === "map" && (
          <div className="flex flex-1 min-h-0">
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-0 z-0">
                <ErrorBoundary>
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
                </ErrorBoundary>
              </div>

              {/* Data source info */}
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

              {/* Legend */}
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
            </div>

            {/* Right control panel */}
            <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
              <div className="flex min-h-full flex-col gap-3">

                <MapControlPanel
                  accent="sky"
                  granularity={granularity}
                  onGranularityChange={setGranularity}
                  mapMode={mapMode}
                  mapModes={[{ value: "district", label: "สถิติ" }, { value: "idw", label: "ดาวเทียม (GEE)" }]}
                  onMapModeChange={(m) => setMapMode(m as MapMode)}
                  showOpacity={mapMode === "idw"}
                  opacity={opacity}
                  onOpacityChange={setOpacity}
                  baseMap={baseMap}
                  onBaseMapChange={setBaseMap}
                  onReset={handleReset}
                  extraControls={
                    <div className="mt-1 rounded-lg border border-sky-800/50 bg-sky-950/30 p-3 space-y-2">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">ชั้นข้อมูล (WATER)</p>
                      <div className="flex flex-col gap-1">
                        {WATER_CACHE_LAYERS.map((key) => (
                          <button key={key} onClick={() => setCacheLayer(key)} className={`text-[9px] px-2 py-1.5 rounded-lg border transition-all font-bold text-left ${cacheLayer === key ? "bg-sky-500/20 border-sky-500/60 text-sky-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}>
                            {WATER_LAYER_LABELS[key]}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                />

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

                {cacheDataMissing && selectedMonth !== null && !loading && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3">
                    <p className="text-[10px] font-bold text-amber-300 mb-1">ไม่มีข้อมูลรายเดือน</p>
                    <p className="text-[9px] text-slate-400 leading-snug">
                      ยังไม่มีข้อมูลแคชสำหรับ {buildPeriodLabel(selectedYear, selectedMonth)} กำลังแสดงข้อมูลรายปี {selectedYear} แทน หรือเลือกเดือนที่มีไฮไลต์ในปฏิทิน
                    </p>
                    <button
                      onClick={() => setSelectedMonth(null)}
                      className="mt-2 text-[9px] px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold hover:bg-amber-500/30 transition-colors"
                    >
                      ดูข้อมูลรายปี {selectedYear}
                    </button>
                  </div>
                )}

                <ExportPanel
                  accentColor="sky"
                  csvFilename={csvFilename}
                  csvHeaders={csvHeaders}
                  csvRows={rankingForExport}
                  reportData={reportData}
                />

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
        )}

        {/* Stats view */}
        {viewMode === "stats" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeDistrict !== "ทั้งหมด" && (
              <div className="shrink-0 flex items-center gap-2 px-5 py-2 bg-sky-950/40 border-b border-sky-900/30">
                <MapPin className="h-3 w-3 text-sky-300 shrink-0" />
                <span className="text-[11px] font-bold text-sky-300">กรองเฉพาะเขต: {activeDistrict}</span>
                <span className="text-[10px] text-slate-500">· แนวโน้มและสถิติแสดงเฉพาะเขตนี้</span>
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <span className="text-slate-500 text-sm animate-pulse">กำลังโหลดข้อมูล…</span>
              </div>
            ) : !summary ? (
              <div className="flex items-center justify-center h-64">
                <span className="text-slate-600 text-sm">ไม่มีข้อมูลสำหรับช่วงเวลานี้</span>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-100">สถิติน้ำท่วม / แหล่งน้ำ</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">{summary.displayLabel} — {periodLabel}</p>
                  </div>
                  {compareMode && summary.avgDelta !== null && (
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 ${summary.avgDelta > 0 ? "bg-sky-500/10 text-sky-400" : "bg-amber-500/10 text-amber-400"}`}>
                      {summary.avgDelta > 0
                        ? <TrendingUp className="w-3.5 h-3.5" />
                        : <TrendingDown className="w-3.5 h-3.5" />}
                      เทียบ {compareYear}: {summary.avgDelta > 0 ? "+" : ""}{(summary.avgDelta * 100).toFixed(2)}%
                    </div>
                  )}
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Water Ratio เฉลี่ย",
                      value: summary.avgWaterRatio != null ? `${(summary.avgWaterRatio * 100).toFixed(2)}%` : "–",
                      sub: "สัดส่วนพื้นที่น้ำเฉลี่ยทุกเขต",
                      color: "text-sky-400",
                      bg: "bg-sky-500/10 border-sky-500/20",
                    },
                    {
                      label: "พื้นที่น้ำรวม",
                      value: summary.totalWaterAreaRai != null ? `${summary.totalWaterAreaRai.toLocaleString()}` : "–",
                      sub: "ไร่ (ทั่วกรุงเทพฯ)",
                      color: "text-blue-400",
                      bg: "bg-blue-500/10 border-blue-500/20",
                    },
                    {
                      label: "เขตน้ำมากที่สุด",
                      value: summary.topWet?.[0]?.[0] ?? "–",
                      sub: summary.topWet?.[0]?.[1] != null ? `${(summary.topWet[0][1] * 100).toFixed(2)}%` : "",
                      color: "text-cyan-400",
                      bg: "bg-cyan-500/10 border-cyan-500/20",
                    },
                    {
                      label: "เขตน้ำน้อยที่สุด",
                      value: summary.topDry?.[0]?.[0] ?? "–",
                      sub: summary.topDry?.[0]?.[1] != null ? `${(summary.topDry[0][1] * 100).toFixed(2)}%` : "",
                      color: "text-slate-400",
                      bg: "bg-slate-500/10 border-slate-500/20",
                    },
                  ].map((kpi) => (
                    <div key={kpi.label} className={`rounded-2xl border p-4 ${kpi.bg}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{kpi.label}</p>
                      <p className={`text-2xl font-black tabular-nums ${kpi.color}`}>{kpi.value}</p>
                      {kpi.sub && <p className="text-[10px] text-slate-600 mt-0.5">{kpi.sub}</p>}
                    </div>
                  ))}
                </div>

                {/* Bar Chart — Top 25 districts */}
                {statsBarData.length > 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                      {activeDistrict !== "ทั้งหมด" ? `เขต${activeDistrict} — สัดส่วนน้ำ (%)` : `Top ${statsBarData.length} เขต — สัดส่วนน้ำ (%)`}
                    </h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={statsBarData} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 11 }}
                          formatter={(v: any) => [`${v}%`, "Water Ratio"]}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={14}>
                          {statsBarData.map((_, i) => (
                            <Cell key={i} fill={lerpColor(BAR_LOW, BAR_HIGH, i / Math.max(statsBarData.length - 1, 1))} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Yearly trend */}
                {statsTrendData.length > 1 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                      แนวโน้มรายปี — {WATER_LAYER_LABELS[cacheLayer]} (เฉลี่ยทุกเขต)
                    </h3>
                    <p className="text-[10px] text-slate-600 mb-4">ค่าดัชนีเฉลี่ย คำนวณจาก Sentinel-2 composite รายปี</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={statsTrendData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                        <defs>
                          <linearGradient id="floodGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 11 }}
                          formatter={(v: any) => [v.toFixed(4), WATER_LAYER_LABELS[cacheLayer]]}
                        />
                        <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} fill="url(#floodGrad)" dot={{ fill: "#38bdf8", r: 3 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top 5 wet / dry */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { title: "เขตน้ำมากที่สุด 5 อันดับ", data: summary.topWet ?? [], color: "text-sky-400", bg: "border-sky-500/20" },
                    { title: "เขตน้ำน้อยที่สุด 5 อันดับ", data: summary.topDry ?? [], color: "text-slate-400", bg: "border-slate-500/20" },
                  ].map(({ title, data, color, bg }) => (
                    <div key={title} className={`rounded-2xl border ${bg} bg-slate-900/50 p-4`}>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">{title}</h4>
                      <ol className="space-y-2">
                        {(data as any[]).map(([name, val, areaRai]: any, i: number) => (
                          <li key={name} className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0">{i + 1}</span>
                            <span className="flex-1 text-[12px] text-slate-300 truncate">{name}</span>
                            <span className={`text-[11px] font-mono font-bold ${color}`}>
                              {val != null ? `${(val * 100).toFixed(2)}%` : "–"}
                            </span>
                            {areaRai != null && (
                              <span className="text-[10px] text-slate-600 font-mono w-20 text-right shrink-0">
                                {Number(areaRai).toLocaleString()} ไร่
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table view */}
        {viewMode === "table" && (
          <div className="flex-1 min-h-0">
            <DistrictDataTable
              features={geojsonData?.features ?? []}
              columns={tableColumns}
              getRowData={(props) => ({
                name: props.name_th,
                water_ratio: props.water_ratio ?? null,
                water_area_rai: props.water_area_rai ?? null,
                ndwi_mean: props.ndwi_mean ?? null,
                delta: props.delta ?? null,
              })}
              csvFilename={csvFilename}
              filterDistrict={activeDistrict !== "ทั้งหมด" ? activeDistrict : undefined}
            />
          </div>
        )}
      </main>
    </div>
  );
}
