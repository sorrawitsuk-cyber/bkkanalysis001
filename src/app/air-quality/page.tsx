/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import AirQualitySidebar from "@/components/gee/AirQualitySidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel, downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { Activity, MapPin, X, Download, FileText } from "lucide-react";
import ViewTabs, { ViewMode } from "@/components/ui/ViewTabs";
import StatsDashboard from "@/components/stats/StatsDashboard";
import DistrictDataTable, { ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false, loading: () => <MapSkeleton /> });

type MapMode = "district" | "idw";
type AirLayer = "no2_mean" | "co_mean" | "so2_mean" | "aerosol_index_mean" | "pollution_score";

const ALL_DISTRICTS = "ทั้งหมด";
const FIRST_YEAR = 2019;
const LATEST_YEAR = 2026;

const AIR_LAYERS: Array<{ id: AirLayer; label: string; labelTh: string; unit: string }> = [
  { id: "no2_mean",           label: "NO₂",    labelTh: "ไนโตรเจนไดออกไซด์", unit: "mol/m²" },
  { id: "co_mean",            label: "CO",     labelTh: "คาร์บอนมอนอกไซด์",   unit: "mol/m²" },
  { id: "so2_mean",           label: "SO₂",    labelTh: "ซัลเฟอร์ไดออกไซด์",  unit: "mol/m²" },
  { id: "aerosol_index_mean", label: "Aerosol",labelTh: "ละอองลอยในอากาศ",    unit: "index"  },
  { id: "pollution_score",    label: "Score",  labelTh: "คะแนนมลพิษรวม",      unit: "0–10"   },
];

function formatMetric(value: number | null | undefined, layer: AirLayer): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (layer === "pollution_score")     return value.toFixed(2);
  if (layer === "co_mean")             return value.toFixed(4);
  if (layer === "aerosol_index_mean")  return value.toFixed(3);
  return value.toFixed(6);
}

export default function AirQualityPage() {
  const [viewMode, setViewMode]               = useState<ViewMode>("map");
  const [activeDistrict, setActiveDistrict]   = useState(ALL_DISTRICTS);
  const [selectedYear, setSelectedYear]       = useState(LATEST_YEAR);
  const [selectedMonth, setSelectedMonth]     = useState<number | null>(null);
  const [compareMode, setCompareMode]         = useState(false);
  const [compareYear, setCompareYear]         = useState(FIRST_YEAR);
  const [mapMode, setMapMode]                 = useState<MapMode>("district");
  const [baseMap, setBaseMap]                 = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [opacity, setOpacity]                 = useState(0.78);
  const [airLayer, setAirLayer]               = useState<AirLayer>("pollution_score");
  const [geojsonData, setGeojsonData]         = useState<any>(null);
  const [invertedMask, setInvertedMask]       = useState<any>(null);
  const [summary, setSummary]                 = useState<any>(null);
  const [loading, setLoading]                 = useState(true);
  const [granularity, setGranularity]         = useState<"district" | "subdistrict">("district");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(selectedYear), metric: "air_pollution" });
    if (selectedMonth) params.append("month", String(selectedMonth));
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
      .catch((err) => { console.error(err); setGeojsonData(null); setSummary(null); setLoading(false); });
  }, [activeDistrict, selectedYear, selectedMonth, compareMode, compareYear]);

  const features = geojsonData?.features ?? [];
  const layerMeta = AIR_LAYERS.find((l) => l.id === airLayer) ?? AIR_LAYERS[0];
  const airLegend = useMemo(() => {
    const gasVals = features
      .filter((f: any) => typeof f?.properties?.[airLayer] === "number")
      .map((f: any) => Number(f.properties[airLayer]))
      .sort((a: number, b: number) => a - b);
    const fmtQ = (v: number) => airLayer === "aerosol_index_mean" ? v.toFixed(3) : airLayer === "co_mean" ? v.toFixed(4) : v.toExponential(2);
    const q = (pct: number) => gasVals.length ? gasVals[Math.max(0, Math.floor(gasVals.length * pct) - 1)] : null;

    if (compareMode) {
      const ranges = airLayer === "pollution_score"
        ? ["> +1.0", "+0.3 ถึง +1.0", "-0.3 ถึง +0.3", "-1.0 ถึง -0.3", "< -1.0"]
        : airLayer === "aerosol_index_mean"
          ? ["> +0.30", "+0.10 ถึง +0.30", "-0.10 ถึง +0.10", "-0.30 ถึง -0.10", "< -0.30"]
          : airLayer === "co_mean"
            ? ["> +0.005", "+0.0015 ถึง +0.005", "-0.0015 ถึง +0.0015", "-0.005 ถึง -0.0015", "< -0.005"]
            : ["> +0.00008", "+0.000025 ถึง +0.00008", "-0.000025 ถึง +0.000025", "-0.00008 ถึง -0.000025", "< -0.00008"];
      return {
        title: `ผลต่าง ${layerMeta.label}: ${selectedYear} - ${compareYear}`,
        description: "สีอุ่น = ค่าสูงขึ้น สีฟ้า = ค่าลดลง เมื่อเทียบกับปีฐาน",
        items: [
          { color: "#B2182B", label: "เพิ่มขึ้นมาก", range: ranges[0] },
          { color: "#F59E0B", label: "เพิ่มขึ้น", range: ranges[1] },
          { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: ranges[2] },
          { color: "#67A9CF", label: "ลดลง", range: ranges[3] },
          { color: "#2166AC", label: "ลดลงมาก", range: ranges[4] },
        ],
      };
    }
    if (airLayer === "pollution_score") {
      return {
        title: "คะแนนมลพิษรวมจากข้อมูลดาวเทียม",
        description: "คะแนน 0-10 ที่รวม NO₂, CO, SO₂ และ Aerosol เพื่อเปรียบเทียบเชิงพื้นที่ ไม่ใช่ AQI",
        items: [
          { color: "#22C55E", label: "ต่ำมาก", range: "0-2" },
          { color: "#FACC15", label: "ต่ำ", range: "2-4" },
          { color: "#F97316", label: "ปานกลาง", range: "4-6" },
          { color: "#DC2626", label: "สูง", range: "6-8" },
          { color: "#7F1D1D", label: "สูงมาก", range: "8-10" },
        ],
      };
    }
    const [p20, p40, p60, p80] = [q(0.2), q(0.4), q(0.6), q(0.8)];
    return {
      title: `${layerMeta.label} จาก Sentinel-5P`,
      description: airLayer === "aerosol_index_mean"
        ? "ดัชนีความเข้มของละอองลอยในอากาศ ค่าสูงหมายถึงละอองลอยมาก"
        : "ใช้เปรียบเทียบเชิงพื้นที่รายเขต ไม่ใช่ AQI จากสถานีภาคพื้น",
      items: [
        { color: "#67E8F9", label: "ต่ำมาก", range: p20 != null ? `≤ ${fmtQ(p20)}` : "ค่าต่ำสุด" },
        { color: "#22C55E", label: "ต่ำ",     range: p20 != null && p40 != null ? `${fmtQ(p20)}–${fmtQ(p40)}` : "" },
        { color: "#FACC15", label: "ปานกลาง", range: p40 != null && p60 != null ? `${fmtQ(p40)}–${fmtQ(p60)}` : "" },
        { color: "#F97316", label: "สูง",     range: p60 != null && p80 != null ? `${fmtQ(p60)}–${fmtQ(p80)}` : "" },
        { color: "#7F1D1D", label: "สูงมาก",  range: p80 != null ? `≥ ${fmtQ(p80)}` : "ค่าสูงสุด" },
      ],
    };
  }, [airLayer, compareMode, compareYear, layerMeta, selectedYear, features]);

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  const rankingRows: [string, number, string?][] = useMemo(() => {
    if (granularity === "subdistrict" && displayGeoJson?.features) {
      return [...(displayGeoJson.features as any[])]
        .filter((f: any) => typeof f?.properties?.[airLayer] === "number")
        .sort((a: any, b: any) => Number(b.properties[airLayer]) - Number(a.properties[airLayer]))
        .map((f: any) => [f.properties.name_th as string, Number(f.properties[airLayer]), f.properties.district_name as string]);
    }
    return [...features]
      .filter((f: any) => typeof f?.properties?.[airLayer] === "number")
      .sort((a: any, b: any) => Number(b.properties[airLayer]) - Number(a.properties[airLayer]))
      .map((f: any) => [f.properties.name_th as string, Number(f.properties[airLayer])]);
  }, [features, displayGeoJson, airLayer, granularity]);

  const latestLabel = selectedMonth
    ? buildPeriodLabel(selectedYear, selectedMonth)
    : selectedYear === new Date().getFullYear()
      ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${selectedYear} (YTD)`
      : `1 ม.ค. – 31 ธ.ค. ${selectedYear}`;

  const rankingForExport: (string | number | null)[][] = rankingRows.map(([district, value]) => [
    district,
    value !== null && value !== undefined ? +Number(value).toFixed(6) : null,
    layerMeta.unit,
    selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear,
  ]);

  const handleReset = () => {
    setActiveDistrict(ALL_DISTRICTS); setSelectedYear(LATEST_YEAR); setSelectedMonth(null);
    setCompareMode(false); setCompareYear(FIRST_YEAR); setMapMode("district");
    setBaseMap("dark"); setOpacity(0.78); setAirLayer("pollution_score");
    setGranularity("district");
  };

  const allDistricts = useMemo((): string[] =>
    [...new Set<string>((geojsonData?.features ?? []).map((f: any) => f.properties.name_th as string).filter((s: unknown): s is string => !!s))]
      .sort((a, b) => a.localeCompare(b, "th")),
    [geojsonData],
  );

  const csvFilename = `air-quality_${layerMeta.id}_${selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear}`;
  const csvHeaders = ["เขต", `${layerMeta.label} (${layerMeta.unit})`, "หน่วย", "ช่วงเวลา"];

  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต", sortable: false },
    { key: "pollution_score", label: "คะแนนรวม", unit: "0-10", format: (v) => v != null ? Number(v).toFixed(2) : "–", heatmap: true, heatmapHex: "#ef4444" },
    { key: "no2_mean", label: "NO₂ เฉลี่ยเชิงพื้นที่รายเขต", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(6) : "–", heatmap: true, heatmapHex: "#a78bfa" },
    { key: "no2_max", label: "NO₂ สูงสุด", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(6) : "–", heatmap: true, heatmapHex: "#a78bfa", hideable: true },
    { key: "co_mean", label: "CO เฉลี่ย", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#fb923c" },
    { key: "co_max", label: "CO สูงสุด", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#fb923c", hideable: true },
    { key: "so2_mean", label: "SO₂", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(6) : "–", heatmap: true, heatmapHex: "#facc15" },
    { key: "aerosol_index_mean", label: "Aerosol", unit: "index", format: (v) => v != null ? Number(v).toFixed(3) : "–", heatmap: true, heatmapHex: "#8b5cf6", hideable: true },
    { key: "pollution_class", label: "ระดับ", format: (v) => v ? String(v).replace(/_/g, " ") : "–", sortable: false, hideable: true },
    ...(compareMode ? [{ key: "pollution_score_delta", label: "Δ คะแนน", format: (v: any) => v != null ? `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}` : "–", heatmap: true, heatmapHex: "#ef4444" } as ColDef] : []),
  ];

  const avgValue    = rankingRows.length ? rankingRows.reduce((s, [, v]) => s + v, 0) / rankingRows.length : null;
  const topDistrict = rankingRows[0]?.[0] ?? null;

  const reportData = useMemo((): PDFReportData => ({
    title: "มลพิษอากาศจากดาวเทียม",
    subtitle: "Sentinel-5P TROPOMI",
    source: "Sentinel-5P TROPOMI (OFFL L3)",
    period: latestLabel,
    layer: `${layerMeta.label} (${layerMeta.labelTh})`,
    district: activeDistrict,
    resolution: "1,000 m (ตีความระดับเขตด้วยความระมัดระวัง)",
    dataVintage: summary?.dataSource ?? undefined,
    generatedAt: new Date().toISOString(),
    kpis: [
      { label: `${layerMeta.label} เฉลี่ย`, value: avgValue !== null ? `${formatMetric(avgValue, airLayer)} ${layerMeta.unit}` : "–" },
      { label: "เขตสูงสุด", value: topDistrict ?? "–" },
    ],
    rankingHeaders: ["เขต", `${layerMeta.label} (${layerMeta.unit})`],
    rankingRows: rankingRows.map(([d, v]) => [d, v != null ? +Number(v).toFixed(6) : null]),
  }), [latestLabel, layerMeta, activeDistrict, avgValue, airLayer, topDistrict, rankingRows, summary?.dataSource]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-50">

      <AirQualitySidebar
          onDistrictSelect={setActiveDistrict}
          activeDistrict={activeDistrict}
          summary={summary}
          geojsonData={displayGeoJson}
          airLayer={airLayer}
          onAirLayerChange={(layer) => {
            setAirLayer(layer);
            if (layer === "pollution_score") setMapMode("district");
          }}
          loading={loading}
          compareMode={compareMode}
          granularity={granularity}
          selectedYear={selectedYear}
          compareYear={compareYear}
      />

      {/* ── Main: tab bar + content ── */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="cyan" />
          <div className="h-4 w-px bg-slate-700/60 mx-0.5 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-slate-600 shrink-0" />
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              disabled={allDistricts.length === 0}
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/50 disabled:opacity-40 max-w-[130px]"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {allDistricts.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {activeDistrict !== "ทั้งหมด" && (
              <button
                onClick={() => setActiveDistrict(ALL_DISTRICTS)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                title="ล้างตัวกรอง"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {loading && <span className="text-[10px] font-bold text-cyan-400/70 uppercase tracking-widest animate-pulse ml-1">กำลังโหลด…</span>}
          <div className="flex-1" />
          {!loading && summary && viewMode !== "map" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => downloadCSV(csvHeaders, rankingForExport, csvFilename)}
                disabled={rankingForExport.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                onClick={() => printReport(reportData)}
                disabled={rankingForExport.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-700/40 bg-cyan-900/20 px-2.5 py-1.5 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-40"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex">
          {viewMode === "map" && (
            <>
              <div className="relative min-w-0 flex-1">
                <ErrorBoundary>
                  <DistrictMetricsMapView
                    geojsonData={displayGeoJson}
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
                    granularity={granularity}
                  />
                </ErrorBoundary>
                <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] max-w-xs rounded-xl border border-slate-700/70 bg-slate-950/90 p-3 text-[10px] leading-5 text-slate-400 shadow-xl backdrop-blur">
                  <div className="mb-1 flex items-center gap-2 font-bold uppercase tracking-widest text-slate-300 text-[9px]">
                    <Activity className="h-3 w-3 text-cyan-300" /> ข้อมูลมลพิษจากดาวเทียม
                  </div>
                  <p>
                    {airLayer === "pollution_score"
                      ? <>คะแนนรวมมลพิษอากาศ 0–10 ใช้เปรียบเทียบรายเขต <span className="text-amber-300">ไม่ใช่ AQI</span></>
                      : <>ค่า <span className="text-cyan-300 font-bold">{layerMeta.label}</span> จากดาวเทียม ใช้เปรียบเทียบรายเขต <span className="text-amber-300">ไม่ใช่ AQI</span></>}
                  </p>
                </div>
                <div className="pointer-events-none absolute bottom-4 right-4 z-[1000] w-72 max-w-[calc(100%-2rem)] rounded-xl border border-slate-700/70 bg-slate-950/90 p-3 shadow-xl backdrop-blur">
                  <p className="text-[10px] font-bold text-slate-300">{airLegend.title}</p>
                  <p className="mt-1 text-[9px] leading-snug text-slate-500">{airLegend.description}</p>
                  <div className="mt-2 space-y-1.5">
                    {airLegend.items.map((item) => (
                      <div key={`${item.label}-${item.range}`} className="grid grid-cols-[12px_1fr_auto] items-center gap-2 text-[9px]">
                        <span className="h-3 w-3 rounded-sm border border-white/10" style={{ backgroundColor: item.color }} />
                        <span className="text-slate-400">{item.label}</span>
                        <span className="font-mono text-slate-600">{item.range}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right aside */}
              <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
                <div className="flex min-h-full flex-col gap-3">
                  <MapControlPanel
                    accent="cyan"
                    granularity={granularity}
                    onGranularityChange={setGranularity}
                    mapMode={mapMode}
                    mapModes={[
                      { value: "district", label: "สรุปรายพื้นที่", description: "ระบายสีแต่ละพื้นที่ด้วยค่าเฉลี่ยหรือคะแนนรวมจากสถิติรายเขต" },
                      { value: "idw", label: "ภาพรายพิกเซล", description: "แสดง raster ของสารมลพิษที่เลือกจาก Sentinel-5P ผ่าน GEE ความละเอียดประมาณ 1 กิโลเมตร" },
                    ]}
                    onMapModeChange={(m) => {
                      const nextMode = m as MapMode;
                      setMapMode(nextMode);
                      if (nextMode === "idw" && airLayer === "pollution_score") setAirLayer("no2_mean");
                    }}
                    showOpacity={mapMode === "idw"}
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                    baseMap={baseMap}
                    onBaseMapChange={setBaseMap}
                    onReset={handleReset}
                    currentLayer={compareMode ? `ผลต่าง ${layerMeta.label}: ${selectedYear} - ${compareYear}` : `${layerMeta.label} - ${layerMeta.labelTh}`}
                    currentPeriod={latestLabel}
                    dataSource={mapMode === "idw" ? "Sentinel-5P ผ่าน GEE" : summary?.dataSource ?? "สถิติรายเขต"}
                    interactionHint={mapMode === "idw" ? `คลิกบนภาพเพื่ออ่านค่า ${layerMeta.label} ของพิกเซล ณ ตำแหน่งนั้น` : "วางเมาส์บนพื้นที่เพื่อดูสารมลพิษทุกตัวและคะแนนรวม"}
                    granularityNote={granularity === "subdistrict" ? "ขอบเขตแขวงใช้ค่าจากเขตแม่ ไม่ใช่การคำนวณ Sentinel-5P แยกรายแขวง" : "สรุปและเลือกพื้นที่ตาม 50 เขต"}
                  />

                  <MonthYearPicker
                    year={selectedYear} month={selectedMonth} minYear={FIRST_YEAR} maxYear={LATEST_YEAR}
                    onYearChange={setSelectedYear} onMonthChange={setSelectedMonth}
                    accentColor="cyan"
                    compareMode={compareMode} compareYear={compareYear}
                    onCompareModeChange={setCompareMode} onCompareYearChange={setCompareYear}
                  />

                  <ExportPanel
                    accentColor="cyan"
                    csvFilename={csvFilename}
                    csvHeaders={csvHeaders}
                    csvRows={rankingForExport}
                    reportData={reportData}
                  />
                </div>
              </aside>
            </>
          )}

          {viewMode === "stats" && (
            <StatsDashboard
              summary={summary} metric="air_pollution" year={selectedYear} compareMode={compareMode}
              accentColor="cyan" activeDistrict={activeDistrict}
              onYearChange={setSelectedYear} onDistrictChange={setActiveDistrict}
              districts={allDistricts} minYear={2019} maxYear={LATEST_YEAR}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear} onCompareYearChange={setCompareYear}
            />
          )}

          {viewMode === "table" && (
            <DistrictDataTable
              features={displayGeoJson?.features ?? []}
              columns={tableColumns}
              getRowData={(props) => ({
                name: props.name_th,
                no2_mean: props.no2_mean,
                no2_max: props.no2_max ?? null,
                co_mean: props.co_mean,
                co_max: props.co_max ?? null,
                so2_mean: props.so2_mean,
                aerosol_index_mean: props.aerosol_index_mean,
                pollution_score: props.pollution_score,
                pollution_class: props.pollution_class,
                pollution_score_delta: props.pollution_score_delta,
              })}
              csvFilename={`air-quality_${selectedYear}`}
              filterDistrict={activeDistrict}
              year={selectedYear} onYearChange={setSelectedYear}
              minYear={2019} maxYear={LATEST_YEAR}
              enableMultiYear accentColor="cyan"
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear}
              onCompareYearChange={setCompareYear}
              onDistrictChange={setActiveDistrict}
              districts={allDistricts}
              dataSource={summary?.dataSource}
              contextNote="คะแนนรวมเป็น proxy จาก Sentinel-5P column density ไม่ใช่ AQI จากสถานีภาคพื้น"
              expectedRows={activeDistrict === ALL_DISTRICTS ? 50 : 1}
            />
          )}

          {viewMode === "guide" && (
            <PlainLanguageGuide
              module="air"
              accent="cyan"
              records={displayGeoJson?.features ?? []}
              year={selectedYear}
              activeArea={activeDistrict}
              compareMode={compareMode}
              compareYear={compareYear}
              dataSource={summary?.sourceLabel ?? summary?.dataSource}
              dataQuality={summary?.dataQuality}
              metricKey={airLayer}
              metricLabel={layerMeta.labelTh}
              unit={layerMeta.unit}
              decimals={airLayer === "pollution_score" ? 2 : airLayer === "co_mean" ? 4 : 6}
            />
          )}
        </div>
      </main>
    </div>
  );
}
