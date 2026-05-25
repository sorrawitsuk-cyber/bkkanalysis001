/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import AirQualitySidebar from "@/components/gee/AirQualitySidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import { Activity } from "lucide-react";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel } from "@/lib/export-utils";
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

  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต", sortable: false },
    { key: "no2_mean", label: "NO₂", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(6) : "–", heatmap: true, heatmapHex: "#a78bfa" },
    { key: "co_mean", label: "CO", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#fb923c" },
    { key: "so2_mean", label: "SO₂", unit: "mol/m²", format: (v) => v != null ? Number(v).toFixed(6) : "–", heatmap: true, heatmapHex: "#facc15" },
    { key: "pollution_score", label: "Score", unit: "0–10", format: (v) => v != null ? Number(v).toFixed(2) : "–", heatmap: true, heatmapHex: "#ef4444" },
  ];

  const avgValue    = rankingRows.length ? rankingRows.reduce((s, [, v]) => s + v, 0) / rankingRows.length : null;
  const topDistrict = rankingRows[0]?.[0] ?? null;

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
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="cyan" />
          {loading && <span className="text-[10px] font-bold text-cyan-400/70 uppercase tracking-widest animate-pulse">กำลังโหลด…</span>}
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
                    csvFilename={`air-quality_${layerMeta.id}_${selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear}`}
                    csvHeaders={["เขต", `${layerMeta.label} (${layerMeta.unit})`, "หน่วย", "ช่วงเวลา"]}
                    csvRows={rankingForExport}
                    reportData={{
                      title: "มลพิษอากาศจากดาวเทียม", subtitle: "Sentinel-5P TROPOMI",
                      source: "Sentinel-5P", period: latestLabel, layer: `${layerMeta.label} (${layerMeta.labelTh})`,
                      district: activeDistrict,
                      kpis: [
                        { label: `${layerMeta.label} เฉลี่ย`, value: avgValue !== null ? `${formatMetric(avgValue, airLayer)} ${layerMeta.unit}` : "–" },
                        { label: "เขตสูงสุด", value: topDistrict ?? "–" },
                      ],
                      rankingHeaders: ["เขต", `${layerMeta.label} (${layerMeta.unit})`],
                      rankingRows: rankingRows.map(([d, v]) => [d, v != null ? +Number(v).toFixed(6) : null]),
                    }}
                  />
                </div>
              </aside>
            </>
          )}

          {viewMode === "stats" && (
            <StatsDashboard summary={summary} metric="air_pollution" year={selectedYear} compareMode={compareMode} accentColor="cyan" />
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
                pollution_score: props.pollution_score,
              })}
              csvFilename={`air-quality_${selectedYear}`}
            />
          )}
        </div>
      </main>
    </div>
  );
}
