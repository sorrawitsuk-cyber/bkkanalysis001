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
  const [mapMode, setMapMode]                 = useState<MapMode>("idw");
  const [baseMap, setBaseMap]                 = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [opacity, setOpacity]                 = useState(0.78);
  const [airLayer, setAirLayer]               = useState<AirLayer>("no2_mean");
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
    setCompareMode(false); setCompareYear(FIRST_YEAR); setMapMode("idw");
    setBaseMap("dark"); setOpacity(0.78); setAirLayer("no2_mean");
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
    { key: "no2_mean", label: "NO₂", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(6) : "–", heatmap: true, heatmapHex: "#a78bfa" },
    { key: "co_mean", label: "CO", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#fb923c" },
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

      {viewMode === "map" && (
        <AirQualitySidebar
          onDistrictSelect={setActiveDistrict}
          activeDistrict={activeDistrict}
          summary={summary}
          geojsonData={displayGeoJson}
          airLayer={airLayer}
          onAirLayerChange={setAirLayer}
          loading={loading}
          compareMode={compareMode}
          granularity={granularity}
          selectedYear={selectedYear}
          compareYear={compareYear}
        />
      )}

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
                    <Activity className="h-3 w-3 text-cyan-300" /> ข้อมูลดาวเทียม (Satellite Proxy)
                  </div>
                  <p>ค่า <span className="text-cyan-300 font-bold">{layerMeta.label}</span> column density จาก Sentinel-5P <span className="text-amber-300">ไม่ใช่ AQI</span> จากสถานีตรวจวัดภาคพื้น</p>
                </div>
              </div>

              {/* Right aside */}
              <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
                <div className="flex min-h-full flex-col gap-3">
                  <MapControlPanel
                    accent="cyan"
                    granularity={granularity}
                    onGranularityChange={setGranularity}
                    granularityAlwaysActive
                    mapMode={mapMode}
                    mapModes={[{ value: "district", label: "สถิติ" }, { value: "idw", label: "ดาวเทียม (GEE)" }]}
                    onMapModeChange={(m) => setMapMode(m as MapMode)}
                    showOpacity={mapMode === "idw"}
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                    baseMap={baseMap}
                    onBaseMapChange={setBaseMap}
                    onReset={handleReset}
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
                co_mean: props.co_mean,
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
        </div>
      </main>
    </div>
  );
}
