/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileText, SlidersHorizontal, X, MapPin } from "lucide-react";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import MapControlPanel from "@/components/map/MapControlPanel";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import NdviSciencePanel from "@/components/ndvi/NdviSciencePanel";
import NdviSidebar from "@/components/ndvi/NdviSidebar";
import ExportPanel from "@/components/ui/ExportPanel";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { getNdviClassThai, getNdviColor, getNdviInterpretationReason } from "@/lib/ndvi";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const ALL_DISTRICTS = "ทั้งหมด";
const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_YEAR = CURRENT_YEAR - 1;
const MIN_YEAR = 2018;

type MapMode = "district" | "idw";
type BaseMap = "dark" | "light" | "satellite" | "streets" | "none";

function formatNdvi(value: number | null | undefined, signed = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

export default function NdviPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [compareYear, setCompareYear] = useState(Math.max(MIN_YEAR, DEFAULT_YEAR - 1));
  const [compareMode, setCompareMode] = useState(false);
  const [activeDistrict, setActiveDistrict] = useState(ALL_DISTRICTS);
  const [mapMode, setMapMode] = useState<MapMode>("idw");
  const [baseMap, setBaseMap] = useState<BaseMap>("dark");
  const [opacity, setOpacity] = useState(0.78);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tileMetadata, setTileMetadata] = useState<{
    sceneCount: number;
    lowSceneWarning: boolean;
    dataSource: string;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ year: String(year), metric: "vegetation", schema: "ndvi-range-v1" });
    if (compareMode) params.set("compareYear", String(compareYear));
    if (activeDistrict !== ALL_DISTRICTS) params.set("district", activeDistrict);
    fetch(`/api/district-metrics?${params}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "โหลดข้อมูล NDVI ไม่สำเร็จ");
        setGeojsonData(payload.geojson);
        setInvertedMask(payload.invertedMask);
        setSummary(payload.summary);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "โหลดข้อมูล NDVI ไม่สำเร็จ");
        setGeojsonData(null);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, [activeDistrict, compareMode, compareYear, year]);

  useEffect(() => {
    if (compareYear >= year) setCompareYear(Math.max(MIN_YEAR, year - 1));
  }, [compareYear, year]);

  const rows = useMemo(() => (
    (geojsonData?.features ?? []).map((feature: any) => ({
      name: feature.properties.name_th,
      ndvi_mean: feature.properties.ndvi_mean,
      ndvi_median: feature.properties.ndvi_median,
      ndvi_min: feature.properties.ndvi_min,
      ndvi_max: feature.properties.ndvi_max,
      ndvi_class: feature.properties.ndvi_class,
      delta: feature.properties.vegetation_delta,
      district_area_rai: feature.properties.district_area_rai,
      ndvi_score: feature.properties.ndvi_score,
      green_area_ratio: feature.properties.green_area_ratio,
      green_area_rai: feature.properties.green_area_rai,
      low_green_ratio: feature.properties.low_green_ratio,
      water_ratio: feature.properties.water_ratio,
      priority_score: feature.properties.priority_score,
      data_quality: summary?.dataQuality,
    }))
  ), [geojsonData, summary?.dataQuality]);

  const filteredRows = activeDistrict === ALL_DISTRICTS
    ? rows
    : rows.filter((row: any) => row.name === activeDistrict);
  const activeRow = activeDistrict === ALL_DISTRICTS ? null : filteredRows[0] ?? null;
  const validRows = rows.filter((row: any) => typeof row.ndvi_mean === "number");
  const totalArea = validRows.reduce((sum: number, row: any) => sum + (row.district_area_rai ?? 0), 0);
  const weightedMean = totalArea > 0
    ? validRows.reduce((sum: number, row: any) => sum + row.ndvi_mean * (row.district_area_rai ?? 0), 0) / totalArea
    : null;
  const rankedRows = [...validRows].sort((a: any, b: any) => b.ndvi_mean - a.ndvi_mean);
  const lowestPixelRow = [...validRows]
    .filter((row: any) => typeof row.ndvi_min === "number")
    .sort((a: any, b: any) => a.ndvi_min - b.ndvi_min)[0];
  const highestPixelRow = [...validRows]
    .filter((row: any) => typeof row.ndvi_max === "number")
    .sort((a: any, b: any) => b.ndvi_max - a.ndvi_max)[0];
  const changeRows = [...validRows]
    .filter((row: any) => typeof row.delta === "number")
    .sort((a: any, b: any) => a.delta - b.delta);
  const districts = rows.map((row: any) => row.name).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b, "th"));
  const yearlyRangeRows = (summary?.yearlyRangeTrend ?? []).map(
    ([trendYear, mean, min, max]: [string, number, number | null, number | null]) => ({
      year: trendYear,
      mean,
      min,
      max,
    }),
  );
  const currentYearRange = yearlyRangeRows.find((row: any) => Number(row.year) === year) ?? null;
  const displayMin = activeRow?.ndvi_min ?? lowestPixelRow?.ndvi_min ?? currentYearRange?.min ?? null;
  const displayMax = activeRow?.ndvi_max ?? highestPixelRow?.ndvi_max ?? currentYearRange?.max ?? null;
  const distributionRows = [
    { label: "< 0.20", count: validRows.filter((row: any) => row.ndvi_mean < 0.20).length, color: "#b45309" },
    { label: "0.20–0.35", count: validRows.filter((row: any) => row.ndvi_mean >= 0.20 && row.ndvi_mean < 0.35).length, color: "#facc15" },
    { label: "0.35–0.50", count: validRows.filter((row: any) => row.ndvi_mean >= 0.35 && row.ndvi_mean < 0.50).length, color: "#84cc16" },
    { label: "≥ 0.50", count: validRows.filter((row: any) => row.ndvi_mean >= 0.50).length, color: "#047857" },
  ];
  const periodLabel = year === CURRENT_YEAR
    ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${year} (YTD)`
    : `1 ม.ค. – 31 ธ.ค. ${year}`;

  const csvHeaders = [
    "เขต",
    "NDVI ต่ำสุด",
    "NDVI เฉลี่ย",
    "NDVI สูงสุด",
    "ช่วง NDVI",
    "คะแนน NDVI (0-10)",
    "ระดับเชิงพรรณนา",
    "พื้นที่ผ่านเกณฑ์ NDVI > 0.30 (%)",
    "พื้นที่ผ่านเกณฑ์ (ไร่)",
    "พื้นที่เขต (ไร่)",
    "เหตุผลประกอบ",
    ...(compareMode ? [`ผลต่างจาก ${compareYear}`] : []),
    "ปี",
    "สถานะข้อมูล",
  ];
  const csvRows = rankedRows.map((row: any) => [
    row.name,
    row.ndvi_min,
    row.ndvi_mean,
    row.ndvi_max,
    typeof row.ndvi_min === "number" && typeof row.ndvi_max === "number" ? row.ndvi_max - row.ndvi_min : null,
    row.ndvi_score,
    getNdviClassThai(row.ndvi_class),
    typeof row.green_area_ratio === "number" ? row.green_area_ratio * 100 : null,
    row.green_area_rai,
    row.district_area_rai,
    getNdviInterpretationReason(row),
    ...(compareMode ? [row.delta] : []),
    year,
    summary?.dataQuality ?? "unknown",
  ]);
  const reportData: PDFReportData = {
    title: "รายงานดัชนีพืชพรรณ NDVI กรุงเทพมหานคร",
    subtitle: "Vegetation condition · Area-weighted district summary",
    source: summary?.sourceLabel ?? summary?.dataSource ?? "ไม่ระบุแหล่งข้อมูล",
    period: periodLabel,
    layer: compareMode ? `ผลต่าง NDVI ${year} - ${compareYear}` : "NDVI เฉลี่ย",
    district: activeDistrict,
    kpis: [
      { label: "NDVI เฉลี่ยถ่วงพื้นที่", value: formatNdvi(weightedMean) },
      { label: "NDVI ต่ำสุด", value: `${lowestPixelRow?.name ?? "–"} · ${formatNdvi(lowestPixelRow?.ndvi_min)}` },
      { label: "NDVI สูงสุด", value: `${highestPixelRow?.name ?? "–"} · ${formatNdvi(highestPixelRow?.ndvi_max)}` },
      { label: "สถานะข้อมูล", value: summary?.dataQuality ?? "unknown" },
    ],
    rankingHeaders: ["เขต", "NDVI เฉลี่ย"],
    rankingRows: rankedRows.map((row: any) => [row.name, row.ndvi_mean]),
  };

  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต", sortable: true },
    { key: "ndvi_min", label: "NDVI ต่ำสุด", format: (value) => formatNdvi(value as number), heatmap: true, heatmapHex: "#f59e0b", hideable: true },
    { key: "ndvi_mean", label: "NDVI เฉลี่ย", format: (value) => formatNdvi(Number(value)), heatmap: true, heatmapHex: "#22c55e" },
    { key: "ndvi_max", label: "NDVI สูงสุด", format: (value) => formatNdvi(value as number), heatmap: true, heatmapHex: "#047857", hideable: true },
    {
      key: "ndvi_range",
      label: "ช่วง NDVI",
      format: (value) => formatNdvi(value as number),
      heatmap: true,
      heatmapHex: "#38bdf8",
      hideable: true,
    },
    {
      key: "ndvi_score",
      label: "คะแนน NDVI",
      unit: "/10",
      format: (value) => typeof value === "number" ? value.toFixed(1) : "–",
      heatmap: true,
      heatmapHex: "#10b981",
    },
    { key: "ndvi_class", label: "ระดับเชิงพรรณนา", format: (value) => getNdviClassThai(String(value)) },
    {
      key: "green_area_ratio",
      label: "พื้นที่ผ่านเกณฑ์",
      unit: "%",
      format: (value) => typeof value === "number" ? (value * 100).toFixed(1) : "–",
      heatmap: true,
      heatmapHex: "#84cc16",
    },
    {
      key: "green_area_rai",
      label: "พื้นที่ผ่านเกณฑ์",
      unit: "ไร่",
      format: (value) => typeof value === "number" ? Math.round(value).toLocaleString("th-TH") : "–",
      heatmap: true,
      heatmapHex: "#22c55e",
      hideable: true,
    },
    {
      key: "district_area_rai",
      label: "พื้นที่เขต",
      unit: "ไร่",
      format: (value) => typeof value === "number" ? Math.round(value).toLocaleString("th-TH") : "–",
      hideable: true,
    },
    {
      key: "priority_score",
      label: "คะแนนตรวจสอบ",
      unit: "/100",
      format: (value) => typeof value === "number" ? value.toFixed(0) : "–",
      heatmap: true,
      heatmapHex: "#f59e0b",
      hideable: true,
    },
    { key: "reason", label: "เหตุผลประกอบ", sortable: false, hideable: true },
    ...(compareMode ? [{
      key: "delta",
      label: `ผลต่างจาก ${compareYear}`,
      unit: "NDVI",
      format: (value: any) => formatNdvi(Number(value), true),
      heatmap: true,
      heatmapHex: "#84cc16",
    } as ColDef] : []),
  ];

  const legend = compareMode
    ? [
        ["#8b1e1e", "< -0.15", "ลดลงมาก"],
        ["#f59e0b", "-0.15 ถึง -0.05", "ลดลง"],
        ["#f7f7f7", "-0.05 ถึง +0.05", "ใกล้เคียงเดิม"],
        ["#86efac", "+0.05 ถึง +0.15", "เพิ่มขึ้น"],
        ["#047857", "> +0.15", "เพิ่มขึ้นมาก"],
      ]
    : [
        ["#7f1d1d", "< 0.00", "ไม่ใช่พืช/น้ำ/เงา"],
        ["#b45309", "0.00–0.20", "พืชพรรณน้อย"],
        ["#facc15", "0.20–0.40", "ต่ำถึงปานกลาง"],
        ["#84cc16", "0.40–0.60", "ค่อนข้างหนาแน่น"],
        ["#047857", "> 0.60", "หนาแน่นมาก"],
      ];

  const reset = () => {
    setYear(DEFAULT_YEAR);
    setCompareYear(Math.max(MIN_YEAR, DEFAULT_YEAR - 1));
    setCompareMode(false);
    setActiveDistrict(ALL_DISTRICTS);
    setMapMode("idw");
    setBaseMap("dark");
    setOpacity(0.78);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-50">
      <NdviSidebar
        summary={summary}
        rows={rows}
        loading={loading}
        activeDistrict={activeDistrict}
        onDistrictSelect={setActiveDistrict}
        tileMetadata={tileMetadata}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="emerald" />
          <div className="h-4 w-px bg-slate-700/60 mx-0.5 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-slate-600 shrink-0" />
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              disabled={districts.length === 0}
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500/50 disabled:opacity-40 max-w-[130px]"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {districts.map((name: string) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {activeDistrict !== "ทั้งหมด" && (
              <button
                onClick={() => setActiveDistrict("ทั้งหมด")}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                title="ล้างตัวกรอง"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {loading && (
            <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest animate-pulse ml-1">
              กำลังโหลด…
            </span>
          )}
          <div className="flex-1" />
          {!loading && summary && viewMode !== "map" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_ndvi_${year}`)}
                disabled={csvRows.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                onClick={() => printReport(reportData)}
                disabled={csvRows.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {loading && !summary ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">กำลังประมวลผล NDVI…</div>
          ) : error || !summary ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">{error ?? "ไม่มีข้อมูล NDVI"}</div>
          ) : viewMode === "map" ? (
            <div className="flex h-full">
              <div className="relative min-w-0 flex-1">
                <ErrorBoundary>
                  <DistrictMetricsMapView
                    geojsonData={geojsonData}
                    invertedMask={invertedMask}
                    activeDistrict={activeDistrict}
                    mapMode={mapMode}
                    compareMode={compareMode}
                    summary={summary}
                    opacity={opacity}
                    baseMap={baseMap}
                    analysisType="green"
                    ndviLayer="ndvi_mean"
                    ndviPresentation="index"
                    dataPeriodLabel={periodLabel}
                    onTileMetadata={setTileMetadata}
                  />
                </ErrorBoundary>

                <button
                  type="button"
                  onClick={() => setMobileControlsOpen(true)}
                  className="absolute right-3 top-3 z-[1100] flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-slate-900/95 px-3 py-2 text-[11px] font-bold text-emerald-200 shadow-lg lg:hidden"
                >
                  <SlidersHorizontal className="h-4 w-4" /> ตัวกรอง
                </button>

                <div className="pointer-events-none absolute left-4 top-4 hidden grid-cols-3 gap-2 lg:grid">
                  {[
                    ["เฉลี่ยถ่วงพื้นที่", formatNdvi(weightedMean)],
                    ["สูงสุด", `${rankedRows[0]?.name ?? "–"} · ${formatNdvi(rankedRows[0]?.ndvi_mean)}`],
                    ["ต่ำสุด", `${rankedRows[rankedRows.length - 1]?.name ?? "–"} · ${formatNdvi(rankedRows[rankedRows.length - 1]?.ndvi_mean)}`],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-[150px] rounded-lg border border-slate-800 bg-slate-950/92 p-3 shadow-lg">
                      <div className="text-[9px] text-slate-500">{label}</div>
                      <div className="mt-1 truncate text-sm font-black text-emerald-200">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="pointer-events-none absolute bottom-4 right-4 hidden w-72 rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-xl lg:block">
                  <h2 className="text-[10px] font-bold text-slate-200">{compareMode ? "ผลต่าง NDVI" : "แนวทางแปลค่า NDVI"}</h2>
                  <p className="mt-1 text-[9px] leading-5 text-slate-500">
                    {compareMode ? `${year} ลบ ${compareYear}; ผลต่างเป็นหน่วย NDVI ไม่ใช่เปอร์เซ็นต์` : "ช่วงค่าเป็นแนวทางทั่วไปและต้องอ่านร่วมกับฤดูกาล"}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {legend.map(([color, range, label]) => (
                      <div key={range} className="grid grid-cols-[12px_92px_1fr] items-center gap-2 text-[9px]">
                        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                        <span className="font-mono text-slate-300">{range}</span>
                        <span className="text-slate-500">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {mobileControlsOpen && (
                <button type="button" aria-label="ปิดตัวกรองจากพื้นหลัง" onClick={() => setMobileControlsOpen(false)} className="fixed inset-0 z-[1900] bg-slate-950/75 backdrop-blur-sm lg:hidden" />
              )}
              <aside className={`${mobileControlsOpen ? "fixed inset-y-0 right-0 z-[2000] block w-[min(22rem,calc(100vw-1rem))]" : "hidden"} shrink-0 overflow-y-auto border-l border-slate-800 bg-[#0f172a]/98 p-4 shadow-2xl lg:static lg:block lg:w-72 xl:w-80`}>
                <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3 lg:hidden">
                  <div>
                    <p className="text-xs font-bold">ตัวกรอง NDVI</p>
                    <p className="mt-0.5 text-[9px] text-slate-500">{periodLabel}</p>
                  </div>
                  <button type="button" aria-label="ปิดแผงควบคุม" onClick={() => setMobileControlsOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <MapControlPanel
                    accent="emerald"
                    granularity="district"
                    onGranularityChange={() => undefined}
                    showGranularity={false}
                    mapMode={mapMode}
                    mapModes={[
                      { value: "district", label: "เฉลี่ยรายเขต", description: "สีพื้นที่แสดง NDVI เฉลี่ยรายเขต" },
                      { value: "idw", label: "รายพิกเซล", description: "ภาพ Sentinel-2 composite ความละเอียดประมาณ 10 เมตร" },
                    ]}
                    onMapModeChange={(value) => setMapMode(value as MapMode)}
                    showOpacity={mapMode === "idw"}
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                    baseMap={baseMap}
                    onBaseMapChange={setBaseMap}
                    onReset={reset}
                    currentLayer={compareMode ? `ผลต่าง NDVI ${year} - ${compareYear}` : "NDVI"}
                    currentPeriod={periodLabel}
                    dataSource={mapMode === "idw" ? tileMetadata?.dataSource || "Sentinel-2 ผ่าน GEE" : summary?.sourceLabel ?? summary?.dataSource}
                    interactionHint={mapMode === "idw" ? "คลิกบนภาพเพื่ออ่านค่า NDVI ณ พิกเซล" : "วางเมาส์บนเขตเพื่ออ่านค่าเฉลี่ยและผลต่าง"}
                    granularityNote="สถิติในหน้านี้คำนวณและสรุประดับ 50 เขต"
                  />
                  <MonthYearPicker
                    year={year}
                    month={null}
                    minYear={MIN_YEAR}
                    maxYear={CURRENT_YEAR}
                    onYearChange={setYear}
                    onMonthChange={() => undefined}
                    accentColor="emerald"
                    compareMode={compareMode}
                    compareYear={compareYear}
                    onCompareModeChange={setCompareMode}
                    onCompareYearChange={setCompareYear}
                  />
                  <ExportPanel
                    accentColor="emerald"
                    csvFilename={`bangkok_ndvi_${year}`}
                    csvHeaders={csvHeaders}
                    csvRows={csvRows}
                    reportData={reportData}
                  />
                  <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[10px] leading-5 text-amber-100/70">
                    NDVI เป็นดัชนีพืชพรรณ ไม่ใช่ Tree Cover หรือพื้นที่สวน หากต้องการวิเคราะห์เรือนยอดไม้ให้ใช้หน้า Tree Cover
                  </section>
                </div>
              </aside>
            </div>
          ) : viewMode === "stats" ? (
            <div className="h-full overflow-y-auto p-4 sm:p-5">
              <div className="mx-auto max-w-7xl space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      activeRow ? `NDVI เฉลี่ย · ${activeRow.name}` : "NDVI เฉลี่ยถ่วงพื้นที่",
                      formatNdvi(activeRow?.ndvi_mean ?? weightedMean),
                    ],
                    [
                      activeRow ? "NDVI ต่ำสุดภายในเขต" : "ค่าต่ำสุดที่พบ",
                      activeRow
                        ? formatNdvi(displayMin)
                        : `${lowestPixelRow?.name ?? "ทั้งกรุงเทพฯ"} · ${formatNdvi(displayMin)}`,
                    ],
                    [
                      activeRow ? "NDVI สูงสุดภายในเขต" : "ค่าสูงสุดที่พบ",
                      activeRow
                        ? formatNdvi(displayMax)
                        : `${highestPixelRow?.name ?? "ทั้งกรุงเทพฯ"} · ${formatNdvi(displayMax)}`,
                    ],
                    [
                      activeRow
                        ? "ช่วงต่ำสุด–สูงสุด"
                        : compareMode ? `ลดลงมากสุดจาก ${compareYear}` : "จำนวนเขตที่มีข้อมูล",
                      activeRow && typeof displayMin === "number" && typeof displayMax === "number"
                        ? formatNdvi(displayMax - displayMin)
                        : compareMode
                          ? `${changeRows[0]?.name ?? "ไม่มีข้อมูล"} · ${formatNdvi(changeRows[0]?.delta, true)}`
                          : `${validRows.length} เขต`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-[10px] text-slate-500">{label}</div>
                      <div className="mt-1 text-lg font-black text-emerald-200">{value}</div>
                    </div>
                  ))}
                </div>

                <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <h2 className="text-sm font-black text-emerald-100">
                    เหตุผลประกอบการอ่านค่า {activeRow ? `· ${activeRow.name}` : `· ภาพรวม ${year}`}
                  </h2>
                  <p className="mt-2 text-xs leading-6 text-slate-300">
                    {activeRow
                      ? getNdviInterpretationReason(activeRow)
                      : `ค่าเฉลี่ยถ่วงพื้นที่ ${formatNdvi(weightedMean)} โดยค่าเฉลี่ยรายเขตสูงสุดคือ ${rankedRows[0]?.name ?? "ไม่มีข้อมูล"} และต่ำสุดคือ ${rankedRows[rankedRows.length - 1]?.name ?? "ไม่มีข้อมูล"} การกระจายมี ${distributionRows[0].count} เขตต่ำกว่า 0.20 และ ${distributionRows[3].count} เขตตั้งแต่ 0.50 ขึ้นไป`}
                  </p>
                  <p className="mt-2 text-[10px] leading-5 text-amber-200/70">
                    Min/max เป็นค่าปลายช่วงภายในพื้นที่ จึงไวต่อเมฆ เงา น้ำ และพิกเซลผิดปกติมากกว่าค่าเฉลี่ย
                    {summary?.dataQuality === "modeled" ? " สำหรับชุดข้อมูล modeled ช่วงค่าอาจเป็นค่าประมาณจากค่าเฉลี่ย ไม่ใช่ extrema ที่วัดจากพิกเซลจริง" : ""}
                  </p>
                </section>

                <div className="grid gap-5 xl:grid-cols-2">
                  <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                    <h2 className="text-sm font-black">NDVI เฉลี่ยรายเขต</h2>
                    <p className="mt-1 text-[10px] text-slate-500">เรียง 15 เขตที่มีค่าสูงสุด ค่านี้ไม่เท่ากับสัดส่วนพื้นที่สีเขียว</p>
                    <div className="mt-4 h-[390px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={rankedRows.slice(0, 15)} layout="vertical" margin={{ left: 10, right: 16 }}>
                          <CartesianGrid stroke="#1e293b" horizontal={false} />
                          <XAxis
                            type="number"
                            domain={["dataMin - 0.03", "dataMax + 0.03"]}
                            tickFormatter={(value) => Number(value).toFixed(2)}
                            stroke="#64748b"
                            fontSize={9}
                          />
                          <YAxis type="category" dataKey="name" width={86} stroke="#94a3b8" fontSize={9} />
                          <Tooltip formatter={(value) => [formatNdvi(Number(value)), "NDVI"]} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                          <Bar dataKey="ndvi_mean" radius={[0, 4, 4, 0]}>
                            {rankedRows.slice(0, 15).map((row: any) => <Cell key={row.name} fill={getNdviColor(row.ndvi_mean)} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                    <h2 className="text-sm font-black">
                      {compareMode
                        ? `ผลต่างจากปี ${compareYear}`
                        : activeRow ? `แนวโน้ม NDVI · ${activeRow.name}` : "แนวโน้มค่าเฉลี่ยกรุงเทพฯ แบบถ่วงพื้นที่"}
                    </h2>
                    <p className="mt-1 text-[10px] text-slate-500">{compareMode ? "ค่าบวก = เพิ่มขึ้น ค่าลบ = ลดลง ในหน่วย NDVI" : "ควรเปรียบเทียบช่วงฤดูกาลเดียวกัน"}</p>
                    <div className="mt-4 h-[390px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart
                          data={compareMode ? changeRows.slice(0, 15) : (summary?.yearlyTrend ?? []).map(([trendYear, value]: [string, number]) => ({ name: trendYear, value }))}
                          layout={compareMode ? "vertical" : "horizontal"}
                          margin={{ left: 10, right: 16 }}
                        >
                          <CartesianGrid stroke="#1e293b" />
                          {compareMode ? (
                            <>
                              <XAxis
                                type="number"
                                domain={["dataMin - 0.02", "dataMax + 0.02"]}
                                tickFormatter={(value) => Number(value).toFixed(2)}
                                stroke="#64748b"
                                fontSize={9}
                              />
                              <YAxis type="category" dataKey="name" width={86} stroke="#94a3b8" fontSize={9} />
                              <Tooltip formatter={(value) => [formatNdvi(Number(value), true), "ผลต่าง NDVI"]} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                              <Bar dataKey="delta" fill="#84cc16" radius={[0, 4, 4, 0]} />
                            </>
                          ) : (
                            <>
                              <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                              <YAxis
                                domain={["dataMin - 0.03", "dataMax + 0.03"]}
                                tickFormatter={(value) => Number(value).toFixed(2)}
                                stroke="#64748b"
                                fontSize={9}
                              />
                              <Tooltip formatter={(value) => [formatNdvi(Number(value)), "NDVI เฉลี่ย"]} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                              <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            </>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                    <h2 className="text-sm font-black">ต่ำสุด–เฉลี่ย–สูงสุด รายปี</h2>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {activeRow ? `ช่วงค่าภายในเขต${activeRow.name}` : "ค่าปลายช่วงของทุกเขตในแต่ละปี"} ใช้ดูการกระจาย ไม่ควรอ่าน min/max เพียงค่าเดียว
                    </p>
                    <div className="mt-4 h-[340px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={yearlyRangeRows}>
                          <CartesianGrid stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="year" stroke="#64748b" fontSize={9} />
                          <YAxis domain={[-0.2, 0.9]} tickFormatter={(value) => Number(value).toFixed(1)} stroke="#64748b" fontSize={9} />
                          <Tooltip formatter={(value, name) => [formatNdvi(Number(value)), name]} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="min" name="ต่ำสุด" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="mean" name="เฉลี่ย" fill="#22c55e" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="max" name="สูงสุด" fill="#047857" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                    <h2 className="text-sm font-black">การกระจายระดับ NDVI รายเขต</h2>
                    <p className="mt-1 text-[10px] text-slate-500">จำนวนเขตตามค่าเฉลี่ยในปี {year} ช่วยดูว่าภาพรวมกระจุกอยู่ในระดับใด</p>
                    <div className="mt-4 h-[340px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={distributionRows}>
                          <CartesianGrid stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="label" stroke="#64748b" fontSize={9} />
                          <YAxis allowDecimals={false} stroke="#64748b" fontSize={9} />
                          <Tooltip formatter={(value) => [`${value} เขต`, "จำนวน"]} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {distributionRows.map((row) => <Cell key={row.label} fill={row.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : viewMode === "table" ? (
            <div className="h-full p-4 sm:p-5">
              <DistrictDataTable
                features={geojsonData?.features ?? []}
                columns={tableColumns}
                getRowData={(properties) => ({
                  name: properties.name_th,
                  ndvi_min: properties.ndvi_min,
                  ndvi_mean: properties.ndvi_mean,
                  ndvi_max: properties.ndvi_max,
                  ndvi_range: typeof properties.ndvi_min === "number" && typeof properties.ndvi_max === "number"
                    ? properties.ndvi_max - properties.ndvi_min
                    : null,
                  ndvi_score: properties.ndvi_score,
                  ndvi_class: properties.ndvi_class,
                  green_area_ratio: properties.green_area_ratio,
                  green_area_rai: properties.green_area_rai,
                  district_area_rai: properties.district_area_rai,
                  priority_score: properties.priority_score,
                  reason: getNdviInterpretationReason({
                    ...properties,
                    delta: properties.vegetation_delta,
                  }),
                  delta: properties.vegetation_delta,
                })}
                csvFilename={`bangkok_ndvi_${year}`}
                filterDistrict={activeDistrict}
                onDistrictChange={setActiveDistrict}
                districts={districts}
                accentColor="emerald"
                dataSource={summary?.sourceLabel ?? summary?.dataSource}
                contextNote={`${periodLabel} · NDVI ไม่มีหน่วย · พื้นที่ผ่านเกณฑ์ใช้ NDVI > 0.30 และเป็นค่าประมาณจากภาพดาวเทียม`}
                expectedRows={activeDistrict === ALL_DISTRICTS ? 50 : 1}
                showStatsFooter={activeDistrict === ALL_DISTRICTS}
                year={year}
                onYearChange={setYear}
                minYear={MIN_YEAR}
                maxYear={CURRENT_YEAR}
                enableMultiYear
                compareMode={compareMode}
                onCompareModeChange={setCompareMode}
                compareYear={compareYear}
                onCompareYearChange={setCompareYear}
              />
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto max-w-6xl space-y-5">
                <PlainLanguageGuide
                  module="ndvi"
                  accent="emerald"
                  records={filteredRows}
                  year={year}
                  activeArea={activeDistrict}
                  compareMode={compareMode}
                  compareYear={compareYear}
                  dataSource={summary?.sourceLabel ?? summary?.dataSource}
                  dataQuality={summary?.dataQuality}
                  nameKey="name"
                  weightKey="district_area_rai"
                  extraSummary={[
                    "ค่าเฉลี่ยภาพรวมถ่วงตามพื้นที่เขต เพื่อไม่ให้เขตขนาดเล็กและขนาดใหญ่มีน้ำหนักเท่ากัน",
                    tileMetadata?.sceneCount != null && tileMetadata.sceneCount >= 0 ? `ภาพ Sentinel-2 ที่ผ่านตัวกรองเบื้องต้น: ${tileMetadata.sceneCount} ภาพ` : "จำนวนภาพรายพิกเซลจะแสดงเมื่อเปิดชั้นแผนที่ GEE",
                  ]}
                />
                <NdviSciencePanel />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
