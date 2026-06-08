/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import NightLightsSidebar from "@/components/gee/NightLightsSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import { Calendar, Moon, TrendingUp, TrendingDown, MapPin, X, Download, FileText } from "lucide-react";
import ExportPanel from "@/components/ui/ExportPanel";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import bkkDistricts from "@/data/bkk_districts.json";
import {
  fetchCacheIndex,
  fetchCacheMetadata,
  getCacheLayerPreviewUrl,
  type SatelliteCacheIndex,
  type SatelliteCacheMetadata,
} from "@/lib/satellite-cache";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area, LineChart, Line,
} from "recharts";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false, loading: () => <MapSkeleton /> });

type MapMode = "district" | "satellite-cache" | "idw";
type DataProduct = "annual" | "monthly";

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

function lerpColor(lo: [number, number, number], hi: [number, number, number], t: number): string {
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * t);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * t);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * t);
  return `rgb(${r},${g},${b})`;
}
const BAR_LOW: [number, number, number] = [254, 240, 138];
const BAR_HIGH: [number, number, number] = [180, 83, 9];

export default function NighttimeLightsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [dataProduct, setDataProduct] = useState<DataProduct>("annual");
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedMonth, setSelectedMonth] = useState(3);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2014);
  const [mapMode, setMapMode] = useState<MapMode>("district");
  const [granularity, setGranularity] = useState<"district" | "subdistrict">("district");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.82);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [cacheIndex, setCacheIndex] = useState<SatelliteCacheIndex | null>(null);

  const firstYear = useMemo(() => {
    if (!cacheIndex?.yearly?.length) return 2013;
    return Math.min(...cacheIndex.yearly.map(Number));
  }, [cacheIndex]);
  const latestDataYear = useMemo(() => {
    if (!cacheIndex?.yearly?.length) return new Date().getFullYear() - 1;
    return Math.max(...cacheIndex.yearly.map(Number));
  }, [cacheIndex]);
  const [latestMonthlyYear, latestMonthlyMonth] = useMemo<[number, number]>(() => {
    if (cacheIndex?.latest_month) {
      const [y, m] = cacheIndex.latest_month.split("-").map(Number);
      if (y && m) return [y, m];
    }
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1];
  }, [cacheIndex]);

  const [cacheMeta, setCacheMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [compareMeta, setCompareMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);

  useEffect(() => {
    fetchCacheIndex("nightlights").then((index) => {
      setCacheIndex(index);
      if (index.latest_year) setSelectedYear(Number(index.latest_year));
      if (index.latest_month) {
        const [year, month] = index.latest_month.split("-").map(Number);
        if (year && month) setSelectedMonth(month);
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

        if ((meta?.district_stats?.length ?? 0) > 0) {
          const built = buildNightLightsView(meta, baselineMeta, selectedYear, selectedMonth, dataProduct);
          setGeojsonData(built.geojson);
          setSummary(built.summary);
          setLoading(false);
          return;
        }

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

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setDataProduct("annual");
    setSelectedYear(latestDataYear);
    setSelectedMonth(latestMonthlyMonth);
    setCompareMode(false);
    setCompareYear(firstYear);
    setMapMode("district");
    setGranularity("district");
    setOpacity(0.82);
    setBaseMap("dark");
  };

  const isMonthlyPreview = dataProduct === "monthly";
  const monthLabel = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1)).toLocaleDateString("th-TH", { month: "short", year: "numeric" });
  const periodLabel = isMonthlyPreview ? `Monthly preview ${monthLabel}` : `Annual composite ${selectedYear}`;
  const sourceDataset = cacheMeta?.source || (isMonthlyPreview ? "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG" : "NOAA/VIIRS/DNB/ANNUAL_V22");
  const sourceBand = (cacheMeta as any)?.band || (isMonthlyPreview ? "avg_rad + cf_cvg mask" : "average_masked");
  const cachePreviewUrl = getCacheLayerPreviewUrl(cacheMeta, "ntl_mean");

  const allDistricts = useMemo((): string[] =>
    [...new Set<string>((geojsonData?.features ?? []).map((f: any) => f.properties.name_th as string).filter((s: unknown): s is string => !!s))]
      .sort((a, b) => a.localeCompare(b, "th")),
    [geojsonData],
  );

  const csvFilename = `nighttime-lights_${isMonthlyPreview ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear}`;
  const csvHeaders = ["เขต", "ค่าแสง NTL (nW/sr/cm²)", "หน่วย", "ช่วงเวลา"];

  const rankingForExport: (string | number | null)[][] = (summary?.ranking ?? []).map(
    ([name, val]: [string, number | null]) => [
      name,
      val !== null && val !== undefined ? +Number(val).toFixed(3) : null,
      "nW/sr/cm²",
      periodLabel,
    ],
  );

  const reportData = useMemo((): PDFReportData => ({
    title: "วิเคราะห์แสงกลางคืน",
    subtitle: "VIIRS DNB Day/Night Band",
    source: sourceDataset,
    period: periodLabel,
    layer: isMonthlyPreview ? "Monthly avg_rad" : "Annual average_masked",
    district: activeDistrict,
    kpis: [
      { label: "ค่าแสงเฉลี่ย", value: formatRadiance(summary?.averageRadiance, 3) },
      { label: "เขตสว่างสุด", value: summary?.maxDistrict ?? "–" },
      { label: "ช่วงข้อมูล", value: periodLabel },
    ],
    rankingHeaders: ["เขต", "NTL (nW/sr/cm²)"],
    rankingRows: rankingForExport.map(([n, v]) => [n, v]),
  }), [sourceDataset, periodLabel, isMonthlyPreview, activeDistrict, summary, rankingForExport]);

  // Stats bar chart data — top 25 by ntl_mean
  const statsBarData = useMemo(() => {
    if (!geojsonData?.features) return [];
    return (geojsonData.features as any[])
      .map((f: any) => ({
        name: f.properties.name_th ?? "–",
        value: typeof f.properties.ntl_mean === "number" ? +f.properties.ntl_mean.toFixed(3) : null,
      }))
      .filter((d: any) => d.value !== null && d.name !== "–" && (activeDistrict === "ทั้งหมด" || d.name === activeDistrict))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 25);
  }, [geojsonData, activeDistrict]);

  const statsTrendData = useMemo(() => {
    return (summary?.yearlyTrend ?? []).map(([year, val]: any) => ({
      year: String(year),
      value: typeof val === "number" ? +val.toFixed(3) : null,
    }));
  }, [summary?.yearlyTrend]);

  const statsMonthlyData = useMemo(() => {
    if (!isMonthlyPreview) return [];
    return (summary?.monthlyTrend ?? [])
      .filter(([, v]: any) => v !== null)
      .map(([month, val]: any) => ({
        month: `เดือน ${month}`,
        value: typeof val === "number" ? +val.toFixed(3) : null,
      }));
  }, [summary?.monthlyTrend, isMonthlyPreview]);

  // Table columns
  const tableColumns: ColDef[] = [
    { key: "name", label: granularity === "subdistrict" ? "แขวง" : "เขต", sortable: false },
    ...(granularity === "subdistrict" ? [{ key: "district", label: "เขตแม่", sortable: false, hideable: true } as ColDef] : []),
    { key: "ntl_mean", label: "NTL Mean", unit: "nW/sr/cm²", format: (v) => v != null ? formatRadiance(v, 3) : "–", heatmap: true, heatmapHex: "#fbbf24" },
    { key: "ntl_max", label: "NTL Max", unit: "nW/sr/cm²", format: (v) => v != null ? formatRadiance(v, 3) : "–", heatmap: true, heatmapHex: "#f59e0b" },
    { key: "pixel_count", label: "จำนวนพิกเซล", format: (v) => v != null ? Number(v).toLocaleString() : "–", hideable: true },
    ...(compareMode && !isMonthlyPreview
      ? [{ key: "ntl_delta", label: "ส่วนต่าง", unit: "nW/sr/cm²", format: (v: any) => v != null ? `${v > 0 ? "+" : ""}${formatRadiance(v, 3)}` : "–" }]
      : []),
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
      {viewMode === "map" && (
        <NightLightsSidebar
          onDistrictSelect={setActiveDistrict}
          activeDistrict={activeDistrict}
          summary={summary}
          loading={loading}
          compareMode={compareMode && !isMonthlyPreview}
          firstYear={firstYear}
          latestDataYear={latestDataYear}
          latestMonthlyYear={latestMonthlyYear}
          latestMonthlyMonth={latestMonthlyMonth}
          granularity={granularity}
          subdistrictFeatures={granularity === "subdistrict" ? (displayGeoJson?.features ?? []) : []}
        />
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="yellow" />
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
                className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-yellow-700/50 bg-yellow-950/30 text-[11px] text-yellow-400 hover:text-yellow-200 transition-colors"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
          <div className="ml-auto text-[10px] text-slate-500">
            {loading ? "กำลังโหลด…" : periodLabel}
          </div>
        </div>

        {/* Map view */}
        {viewMode === "map" && (
          <div className="flex flex-1 min-h-0">
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-0 z-0">
                <ErrorBoundary>
                  <DistrictMetricsMapView
                    geojsonData={displayGeoJson}
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
                    granularity={granularity}
                  />
                </ErrorBoundary>
              </div>

              {/* Data source badge */}
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
                  accent="yellow"
                  granularity={granularity}
                  onGranularityChange={setGranularity}
                  mapMode={mapMode}
                  mapModes={[
                    { value: "district", label: "สรุปรายพื้นที่", description: "ระบายสีพื้นที่ด้วยค่า radiance เฉลี่ยของเขตจากชุดข้อมูลที่เลือก" },
                    { value: "idw", label: "ภาพรายพิกเซล", description: "แสดง radiance จาก VIIRS DNB ผ่าน GEE ที่ความละเอียดประมาณ 500 เมตร" },
                  ]}
                  onMapModeChange={(m) => setMapMode(m as MapMode)}
                  showOpacity={mapMode === "satellite-cache" || mapMode === "idw"}
                  opacity={opacity}
                  onOpacityChange={setOpacity}
                  baseMap={baseMap}
                  onBaseMapChange={setBaseMap}
                  onReset={handleReset}
                  currentLayer={compareMode && !isMonthlyPreview ? `ผลต่างแสงกลางคืน: ${selectedYear} - ${compareYear}` : `แสงกลางคืน ${isMonthlyPreview ? "รายเดือน" : "รายปี"} (NTL Mean)`}
                  currentPeriod={periodLabel}
                  dataSource={mapMode === "idw" ? "VIIRS DNB ผ่าน GEE" : `R2 cache - ${sourceDataset}`}
                  interactionHint={mapMode === "idw" ? "คลิกบนภาพเพื่ออ่านค่า radiance ของพิกเซล ณ ตำแหน่งนั้น" : "วางเมาส์บนพื้นที่เพื่อดูค่าเฉลี่ย ค่าสูงสุด และการเปลี่ยนแปลง"}
                  granularityNote={granularity === "subdistrict" ? "ขอบเขตแขวงสืบทอดค่าแสงกลางคืนจากเขตแม่ ไม่ใช่การคำนวณ radiance ใหม่รายแขวง" : "สรุปและเลือกพื้นที่ตาม 50 เขต"}
                />

                <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-2xl w-full">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> ชุดข้อมูล &amp; ช่วงเวลา
                  </h4>

                  <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
                    <button
                      onClick={() => { setDataProduct("annual"); setSelectedYear(latestDataYear); }}
                      className={`text-[10px] py-2 rounded-lg transition-all font-bold ${dataProduct === "annual" ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      Annual {firstYear}–{latestDataYear}
                    </button>
                    <button
                      onClick={() => { setDataProduct("monthly"); setSelectedYear(latestMonthlyYear); setSelectedMonth(latestMonthlyMonth); setCompareMode(false); }}
                      className={`text-[10px] py-2 rounded-lg transition-all font-bold ${dataProduct === "monthly" ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      {latestMonthlyYear} Preview
                    </button>
                  </div>

                  {isMonthlyPreview && (
                    <div className="mb-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3">
                      <div className="text-[10px] font-bold text-amber-100">ข้อมูลล่าสุดแบบรายเดือน</div>
                      <p className="mt-1 text-[9px] leading-snug text-slate-400">
                        ข้อมูลรายเดือนล่าสุดถึง {latestMonthlyMonth}/{latestMonthlyYear} ใช้เป็น preview ล่าสุด ไม่ใช้เปรียบเทียบแทน annual
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 font-mono">{isMonthlyPreview ? latestMonthlyYear : firstYear}</span>
                    <span className="text-lg font-bold text-yellow-200 font-mono">{selectedYear}</span>
                    <span className="text-xs text-slate-400 font-mono">{isMonthlyPreview ? latestMonthlyYear : latestDataYear}</span>
                  </div>
                  <input
                    type="range"
                    min={isMonthlyPreview ? latestMonthlyYear : firstYear}
                    max={isMonthlyPreview ? latestMonthlyYear : latestDataYear}
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(parseInt(event.target.value, 10))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300 mb-4"
                  />

                  {!isMonthlyPreview && (
                    <button
                      onClick={() => setCompareMode(!compareMode)}
                      className={`w-full text-[9px] px-3 py-1.5 rounded-lg transition-all border font-bold mb-2 ${compareMode ? "bg-yellow-300/20 text-yellow-100 border-yellow-300/50" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500 hover:text-slate-300"}`}
                    >
                      {compareMode ? "✓ โหมดเปรียบเทียบปีเปิดอยู่" : "เปรียบเทียบปี (Compare Mode)"}
                    </button>
                  )}

                  {compareMode && !isMonthlyPreview && (
                    <div className="mt-2 pt-4 border-t border-slate-800/50">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] font-bold text-yellow-100 uppercase tracking-widest">ปีฐานที่ใช้เทียบ</h4>
                        <span className="text-sm font-bold text-yellow-100 font-mono">{compareYear}</span>
                      </div>
                      <input
                        type="range" min={firstYear} max={latestDataYear}
                        value={compareYear}
                        onChange={(event) => setCompareYear(parseInt(event.target.value, 10))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300"
                      />
                    </div>
                  )}

                  {isMonthlyPreview && (
                    <div className="mt-2 pt-4 border-t border-slate-800/50">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] font-bold text-amber-100 uppercase tracking-widest">เดือน</h4>
                        <span className="text-sm font-bold text-amber-100 font-mono">{selectedMonth}/{latestMonthlyYear}</span>
                      </div>
                      <input
                        type="range" min={1} max={latestMonthlyMonth}
                        value={selectedMonth}
                        onChange={(event) => setSelectedMonth(parseInt(event.target.value, 10))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-300"
                      />
                      <div className="mt-2 flex justify-between text-[9px] text-slate-500 font-mono">
                        <span>ม.ค.</span>
                        <span>เดือน {latestMonthlyMonth}</span>
                      </div>
                    </div>
                  )}
                </div>

                <ExportPanel
                  accentColor="yellow"
                  csvFilename={csvFilename}
                  csvHeaders={csvHeaders}
                  csvRows={rankingForExport}
                  reportData={reportData}
                />

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
        )}

        {/* ── Stats view — with full inline controls ─────────────────────────── */}
        {viewMode === "stats" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">

            {/* Inline controls bar */}
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-700/60 bg-slate-900/50">

              {/* Product toggle */}
              <div className="flex items-center gap-0 rounded-lg border border-slate-700/80 overflow-hidden shrink-0">
                <button onClick={() => setDataProduct("annual")}
                  className={`px-3 py-1.5 text-[10px] font-bold transition-colors ${dataProduct === "annual" ? "bg-yellow-600 text-black" : "text-slate-500 hover:text-slate-300"}`}>
                  รายปี
                </button>
                <button onClick={() => setDataProduct("monthly")}
                  className={`px-3 py-1.5 text-[10px] font-bold transition-colors ${dataProduct === "monthly" ? "bg-yellow-500 text-black" : "text-slate-500 hover:text-slate-300"}`}>
                  รายเดือน
                </button>
              </div>

              {/* Year stepper */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setSelectedYear((y) => Math.max(firstYear, y - 1))} disabled={selectedYear <= firstYear}
                  className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">‹</button>
                <span className="text-sm font-black font-mono text-yellow-300 min-w-[3rem] text-center">{selectedYear}</span>
                <button onClick={() => setSelectedYear((y) => Math.min(dataProduct === "annual" ? latestDataYear : latestMonthlyYear, y + 1))}
                  disabled={selectedYear >= (dataProduct === "annual" ? latestDataYear : latestMonthlyYear)}
                  className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">›</button>
              </div>

              {/* Month stepper (monthly mode only) */}
              {dataProduct === "monthly" && (
                <div className="flex items-center gap-1 shrink-0">
                  <Calendar className="h-3 w-3 text-slate-600" />
                  <button onClick={() => setSelectedMonth((m) => Math.max(1, m - 1))} disabled={selectedMonth <= 1}
                    className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">‹</button>
                  <span className="text-[11px] font-bold font-mono text-amber-300 min-w-[4rem] text-center">เดือน {selectedMonth}</span>
                  <button onClick={() => setSelectedMonth((m) => Math.min(latestMonthlyMonth, m + 1))}
                    disabled={selectedMonth >= latestMonthlyMonth}
                    className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">›</button>
                </div>
              )}

              {/* District selector */}
              <div className="flex items-center gap-1.5 shrink-0">
                <MapPin className="h-3 w-3 text-yellow-400 shrink-0" />
                <select value={activeDistrict} onChange={(e) => setActiveDistrict(e.target.value)}
                  className="h-7 rounded border border-slate-700 bg-slate-900/60 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-yellow-500/50">
                  <option value="ทั้งหมด">ทุกเขต (50 เขต)</option>
                  {allDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {activeDistrict !== "ทั้งหมด" && (
                  <button onClick={() => setActiveDistrict("ทั้งหมด")} className="h-5 w-5 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Compare toggle (annual only) */}
              {dataProduct === "annual" && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setCompareMode((v) => !v)}
                    className={`h-7 px-3 rounded-lg border text-[11px] font-bold transition-colors ${compareMode ? "border-yellow-600 bg-yellow-900/40 text-yellow-300" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}>
                    {compareMode ? "เทียบปีฐาน ON" : "เทียบปีฐาน"}
                  </button>
                  {compareMode && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-slate-600 font-bold">ฐาน</span>
                      <button onClick={() => setCompareYear((y) => Math.max(firstYear, y - 1))} disabled={compareYear <= firstYear}
                        className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">‹</button>
                      <span className="text-[11px] font-bold font-mono text-sky-300 min-w-[3rem] text-center">{compareYear}</span>
                      <button onClick={() => setCompareYear((y) => Math.min(selectedYear - 1, y + 1))} disabled={compareYear >= selectedYear - 1}
                        className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">›</button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1" />
              <span className="text-[9px] text-slate-600">
                VIIRS DNB · {compareMode && !isMonthlyPreview ? `${selectedYear} vs ${compareYear}` : periodLabel}
              </span>
              {compareMode && !isMonthlyPreview && summary?.avgDelta !== null && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${(summary?.avgDelta ?? 0) > 0 ? "bg-yellow-500/10 text-yellow-400" : "bg-blue-500/10 text-blue-400"}`}>
                  {(summary?.avgDelta ?? 0) > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  เทียบ {compareYear}: {(summary?.avgDelta ?? 0) > 0 ? "+" : ""}{formatRadiance(summary?.avgDelta, 3)}
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <span className="text-slate-500 animate-pulse">กำลังโหลด…</span>
              </div>
            ) : !summary ? (
              <div className="flex flex-1 items-center justify-center">
                <span className="text-slate-600">ไม่มีข้อมูลสำหรับช่วงเวลานี้</span>
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-6 space-y-5">

                {/* KPI Cards */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {[
                    {
                      label: compareMode && !isMonthlyPreview ? "ส่วนต่างเฉลี่ย" : "ค่าแสงเฉลี่ย",
                      value: compareMode && !isMonthlyPreview
                        ? `${(summary.avgDelta ?? 0) > 0 ? "+" : ""}${formatRadiance(summary.avgDelta, 3)}`
                        : formatRadiance(summary.averageRadiance, 3),
                      sub: "nW/sr/cm²",
                      color: "text-yellow-400",
                      bg: "bg-yellow-500/10 border-yellow-500/20",
                    },
                    {
                      label: compareMode && !isMonthlyPreview ? "เขตเพิ่มขึ้นสูงสุด" : "เขตสว่างที่สุด",
                      value: compareMode && !isMonthlyPreview
                        ? summary.fastestGrowthDistrict ?? "–"
                        : summary.maxDistrict ?? "–",
                      sub: compareMode && !isMonthlyPreview
                        ? summary.maxDelta != null ? `+${formatRadiance(summary.maxDelta, 3)}` : ""
                        : summary.maxRadiance != null ? formatRadiance(summary.maxRadiance, 3) : "",
                      color: "text-amber-400",
                      bg: "bg-amber-500/10 border-amber-500/20",
                    },
                    {
                      label: compareMode && !isMonthlyPreview ? "ส่วนต่างสูงสุด" : "ค่าสูงสุดรายเขต",
                      value: compareMode && !isMonthlyPreview
                        ? `${(summary.maxDelta ?? 0) > 0 ? "+" : ""}${formatRadiance(summary.maxDelta, 3)}`
                        : formatRadiance(summary.maxRadiance, 3),
                      sub: "nW/sr/cm²",
                      color: "text-orange-400",
                      bg: "bg-orange-500/10 border-orange-500/20",
                    },
                    {
                      label: "ช่วงข้อมูล",
                      value: compareMode && !isMonthlyPreview ? `${selectedYear} vs ${compareYear}` : periodLabel,
                      sub: "VIIRS NOAA",
                      color: "text-slate-400",
                      bg: "bg-slate-500/10 border-slate-500/20",
                    },
                  ].map((kpi) => (
                    <div key={kpi.label} className={`rounded-2xl border p-4 ${kpi.bg}`}>
                      <p className="text-[12px] font-semibold text-slate-500 mb-1">{kpi.label}</p>
                      <p className={`text-2xl font-black tabular-nums truncate ${kpi.color}`}>{kpi.value}</p>
                      {kpi.sub && <p className="text-[10px] text-slate-600 mt-0.5">{kpi.sub}</p>}
                    </div>
                  ))}
                </div>

                {/* Bar Chart — Top 25 by ntl_mean */}
                {statsBarData.length > 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                    <h3 className="text-[13px] font-semibold text-slate-400 mb-4">
                      {activeDistrict !== "ทั้งหมด" ? `เขต${activeDistrict} — NTL Mean` : `Top ${statsBarData.length} เขต — NTL Mean`} (nW/sr/cm²)
                    </h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={statsBarData} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 11 }}
                          formatter={(v: any) => [v.toFixed(3), "NTL Mean"]}
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

                {/* Yearly trend (annual mode) */}
                {!isMonthlyPreview && statsTrendData.length > 1 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                    <h3 className="text-[13px] font-semibold text-slate-400 mb-1">
                      แนวโน้มรายปี — NTL Mean เฉลี่ยทุกเขต
                    </h3>
                    <p className="text-[10px] text-slate-600 mb-4">VIIRS annual average_masked composite</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={statsTrendData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                        <defs>
                          <linearGradient id="ntlGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#facc15" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 11 }}
                          formatter={(v: any) => [v.toFixed(3), "NTL Mean (nW/sr/cm²)"]}
                        />
                        <Area type="monotone" dataKey="value" stroke="#facc15" strokeWidth={2} fill="url(#ntlGrad)" dot={{ fill: "#facc15", r: 3 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Monthly sparkline */}
                {isMonthlyPreview && statsMonthlyData.length > 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                    <h3 className="text-[13px] font-semibold text-slate-400 mb-4">
                      แนวโน้มรายเดือน — {selectedYear}
                    </h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={statsMonthlyData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 11 }}
                          formatter={(v: any) => [v.toFixed(3), "NTL Mean"]}
                        />
                        <Line type="monotone" dataKey="value" stroke="#fbbf24" strokeWidth={2} dot={{ fill: "#fbbf24", r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {/* Table view */}
        {viewMode === "table" && (
          <div className="flex-1 min-h-0">
            <DistrictDataTable
              features={(granularity === "subdistrict" && activeDistrict !== "ทั้งหมด"
                ? (displayGeoJson?.features ?? []).filter((f: any) => f.properties?.district_name === activeDistrict)
                : displayGeoJson?.features) ?? []}
              columns={tableColumns}
              getRowData={(props) => ({
                name: props.name_th,
                district: props.district_name ?? null,
                ntl_mean: props.ntl_mean ?? null,
                ntl_max: props.ntl_max ?? null,
                ntl_delta: props.ntl_delta ?? null,
                pixel_count: props.pixel_count ?? null,
              })}
              csvFilename={csvFilename}
              filterDistrict={granularity === "district" && activeDistrict !== "ทั้งหมด" ? activeDistrict : undefined}
              year={selectedYear} onYearChange={setSelectedYear}
              minYear={2014} maxYear={2026}
              enableMultiYear accentColor="orange"
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear}
              onCompareYearChange={setCompareYear}
              onDistrictChange={setActiveDistrict}
              districts={allDistricts}
              dataSource={summary?.dataSource ?? (isMonthlyPreview ? "VIIRS monthly preview" : "VIIRS annual composite")}
              contextNote={granularity === "subdistrict" ? "ระดับแขวงสืบทอดค่าสถิติจากเขตแม่ ไม่ใช่การคำนวณ radiance ใหม่รายแขวง" : isMonthlyPreview ? "ข้อมูลรายเดือนเป็น preview และไม่ควรเปรียบเทียบตรงกับ annual composite" : "NTL ใช้สะท้อนความเข้มกิจกรรมยามค่ำคืน ไม่ใช่จำนวนประชากรโดยตรง"}
              expectedRows={granularity === "district" ? (activeDistrict === "ทั้งหมด" ? 50 : 1) : undefined}
            />
          </div>
        )}
      </main>
    </div>
  );
}
