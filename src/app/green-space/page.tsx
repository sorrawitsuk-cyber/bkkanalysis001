/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import GreenSpaceSidebar from "@/components/gee/GreenSpaceSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import { Layers } from "lucide-react";
import { formatRai } from "@/lib/ndvi";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel, downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { MapPin, X, Download, FileText } from "lucide-react";
import ViewTabs, { ViewMode } from "@/components/ui/ViewTabs";
import StatsDashboard from "@/components/stats/StatsDashboard";
import DistrictDataTable, { ColDef } from "@/components/stats/DistrictDataTable";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false, loading: () => <MapSkeleton /> });

type NdviLayer = "green_area_rai" | "green_area_ratio" | "ndvi_mean";
type MapMode = "district" | "idw";

export default function GreenSpacePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<MapMode>("idw");
  const [granularity, setGranularity] = useState<"district" | "subdistrict">("district");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [ndviLayer, setNdviLayer] = useState<NdviLayer>("ndvi_mean");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: selectedYear.toString(), metric: "vegetation" });
    if (activeDistrict !== "ทั้งหมด") params.append("district", activeDistrict);
    if (compareMode) params.append("compareYear", compareYear.toString());

    fetch(`/api/district-metrics?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
  }, [activeDistrict, selectedYear, compareMode, compareYear]);

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode("idw");
    setGranularity("district");
    setOpacity(0.78);
    setBaseMap("dark");
    setSelectedMonth(null);
    setNdviLayer("ndvi_mean");
  };

  const ndviLayerLabel = ndviLayer === "green_area_rai" ? "ขนาดพื้นที่สีเขียว (ไร่)"
    : ndviLayer === "green_area_ratio" ? "สัดส่วนพื้นที่สีเขียว (%)"
    : "ค่า NDVI เฉลี่ย";

  const _gsNow = new Date();
  const periodLabel = selectedYear === _gsNow.getFullYear()
    ? `1 ม.ค. - ${_gsNow.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
    : `1 ม.ค. - 31 ธ.ค. ${selectedYear}`;

  const rankingForExport: (string | number | null)[][] = ((geojsonData?.features ?? []) as any[])
    .filter((f: any) => typeof f?.properties?.[ndviLayer] === "number")
    .sort((a: any, b: any) => Number(b.properties[ndviLayer]) - Number(a.properties[ndviLayer]))
    .map((f: any) => [
      f.properties.name_th as string,
      +Number(f.properties[ndviLayer]).toFixed(3),
      ndviLayer === "green_area_rai" ? "ไร่" : ndviLayer === "green_area_ratio" ? "%" : "NDVI",
      selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel,
    ]);

  const ndviSummary = summary?.ndviSummary;
  const districtCount = geojsonData?.features?.length || 50;
  const avgGreenAreaRai = ndviSummary?.total_green_area_rai && districtCount
    ? ndviSummary.total_green_area_rai / districtCount : null;

  const kpiCards = [
    { label: "ค่า NDVI เฉลี่ย กทม.", value: ndviSummary?.avg_ndvi_mean !== null && ndviSummary?.avg_ndvi_mean !== undefined ? ndviSummary.avg_ndvi_mean.toFixed(3) : "ไม่มีข้อมูล" },
    { label: "ขนาดพื้นที่สีเขียวเฉลี่ย", value: formatRai(avgGreenAreaRai) },
    { label: "พื้นที่สีเขียวโดยประมาณ", value: formatRai(ndviSummary?.total_green_area_rai) },
    { label: "เขตสีเขียวสูงสุด", value: ndviSummary?.best_district?.district_name || ndviSummary?.best_district?.name_th || "ไม่มีข้อมูล" },
    { label: "เขตเร่งด่วน", value: ndviSummary?.worst_district?.district_name || ndviSummary?.worst_district?.name_th || "ไม่มีข้อมูล" },
  ];

  let legendConfig: { title: string; description: string; unit: string; items: { color: string; label: string; range: string }[] };
  if (compareMode) {
    legendConfig = { title: "การเปลี่ยนแปลง NDVI รายปี", description: `ค่า NDVI ปี ${selectedYear} ลบปีฐาน ${compareYear}`, unit: "NDVI", items: [{ color: "#8B1E1E", label: "ลดลงมาก", range: "< -0.15" }, { color: "#F59E0B", label: "ลดลง", range: "-0.15 ถึง -0.05" }, { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: "-0.05 ถึง +0.05" }, { color: "#86EFAC", label: "เพิ่มขึ้น", range: "+0.05 ถึง +0.15" }, { color: "#047857", label: "เพิ่มขึ้นมาก", range: "> +0.15" }] };
  } else if (mapMode === "idw") {
    legendConfig = { title: "NDVI จากดาวเทียม Sentinel-2", description: "ค่า NDVI raster จากภาพ Sentinel-2 แบบ median รายปี หลังคัดกรองเมฆ", unit: "NDVI", items: [{ color: "#7F1D1D", label: "เขียวน้อยมาก", range: "0.10 - 0.24" }, { color: "#B45309", label: "เขียวน้อย", range: "0.24 - 0.38" }, { color: "#FACC15", label: "ปานกลาง", range: "0.38 - 0.52" }, { color: "#84CC16", label: "ดี", range: "0.52 - 0.66" }, { color: "#16A34A", label: "ดีมาก", range: "0.66 - 0.80" }, { color: "#065F46", label: "หนาแน่นมาก", range: "> 0.80" }] };
  } else if (ndviLayer === "green_area_rai") {
    legendConfig = { title: "ขนาดพื้นที่สีเขียวรายเขต", description: "ประมาณพื้นที่ที่มี NDVI มากกว่า 0.30 แสดงเป็นไร่ต่อเขต", unit: "ไร่", items: [{ color: "#8c2d04", label: "น้อยมาก", range: "< 4,000" }, { color: "#d94801", label: "น้อย", range: "4,000 - 8,000" }, { color: "#f6e05e", label: "ปานกลาง", range: "8,000 - 12,000" }, { color: "#68d391", label: "มาก", range: "12,000 - 16,000" }, { color: "#238b45", label: "มากที่สุด", range: "> 16,000" }] };
  } else if (ndviLayer === "green_area_ratio") {
    legendConfig = { title: "สัดส่วนพื้นที่สีเขียวรายเขต", description: "สัดส่วนพื้นที่ที่มี NDVI มากกว่า 0.30 เมื่อเทียบกับพื้นที่เขต", unit: "%", items: [{ color: "#8c2d04", label: "น้อยมาก", range: "< 14%" }, { color: "#d94801", label: "น้อย", range: "14% - 28%" }, { color: "#f6e05e", label: "ปานกลาง", range: "28% - 42%" }, { color: "#68d391", label: "ดี", range: "42% - 56%" }, { color: "#238b45", label: "ดีมาก", range: "> 56%" }] };
  } else {
    legendConfig = { title: "ค่า NDVI เฉลี่ยรายเขต", description: "ค่า NDVI เฉลี่ยของแต่ละเขต ใช้แปลความหนาแน่นพืชพรรณในเมือง", unit: "NDVI", items: [{ color: "#8c2d04", label: "เขียวน้อยมาก", range: "< 0.20" }, { color: "#d94801", label: "เขียวน้อย", range: "0.20 - 0.30" }, { color: "#f6e05e", label: "ปานกลาง", range: "0.30 - 0.40" }, { color: "#68d391", label: "ดี", range: "0.40 - 0.50" }, { color: "#238b45", label: "ดีมาก", range: "> 0.50" }] };
  }

  const allDistricts = useMemo((): string[] =>
    [...new Set<string>((geojsonData?.features ?? []).map((f: any) => f.properties.name_th as string).filter((s: unknown): s is string => !!s))]
      .sort((a, b) => a.localeCompare(b, "th")),
    [geojsonData],
  );

  const csvFilename = `green-space_${ndviLayer}_${selectedYear}`;
  const csvHeaders = ["เขต", ndviLayerLabel, "หน่วย", "ช่วงเวลา"];
  const reportData = useMemo((): PDFReportData => ({
    title: "วิเคราะห์พื้นที่สีเขียวเมือง",
    subtitle: "Sentinel-2 SR Harmonized · NDVI",
    source: "Sentinel-2",
    period: selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel,
    layer: ndviLayerLabel,
    district: activeDistrict,
    kpis: [
      { label: "NDVI เฉลี่ย กทม.", value: ndviSummary?.avg_ndvi_mean != null ? ndviSummary.avg_ndvi_mean.toFixed(3) : "–" },
      { label: "พื้นที่สีเขียวรวม", value: formatRai(ndviSummary?.total_green_area_rai) },
      { label: "เขตสีเขียวสูงสุด", value: ndviSummary?.best_district?.district_name ?? "–" },
    ],
    rankingHeaders: ["เขต", ndviLayerLabel],
    rankingRows: rankingForExport.map(([n, v]) => [n, v]),
  }), [selectedYear, selectedMonth, periodLabel, ndviLayerLabel, activeDistrict, ndviSummary, rankingForExport]);

  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต", sortable: false },
    { key: "ndvi_mean", label: "NDVI เฉลี่ย", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#10b981" },
    { key: "green_area_rai", label: "พื้นที่สีเขียว", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", heatmap: true, heatmapHex: "#10b981" },
    { key: "green_area_ratio", label: "สัดส่วน", unit: "%", format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}` : "–", heatmap: true, heatmapHex: "#34d399" },
    { key: "priority_score", label: "Priority Score", format: (v) => v != null ? Number(v).toFixed(2) : "–", heatmap: true, heatmapHex: "#f97316", heatmapInvert: true },
    ...(compareMode ? [{ key: "delta", label: "Δ NDVI", format: (v: any) => v != null ? `${v > 0 ? "+" : ""}${Number(v).toFixed(4)}` : "–" } as ColDef] : []),
  ];

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      {viewMode === "map" && (
        <GreenSpaceSidebar
          onDistrictSelect={setActiveDistrict}
          activeDistrict={activeDistrict}
          summary={summary}
          geojsonData={displayGeoJson}
          ndviLayer={ndviLayer}
          loading={loading}
          compareMode={compareMode}
          granularity={granularity}
        />
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="emerald" />
          <div className="h-4 w-px bg-slate-700/60 mx-0.5 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-slate-600 shrink-0" />
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              disabled={allDistricts.length === 0}
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500/50 disabled:opacity-40 max-w-[130px]"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {allDistricts.map((name) => (
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
          {loading && <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest animate-pulse ml-1">กำลังโหลด…</span>}
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
                className="flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex">
          {viewMode === "map" && (
            <>
              <div className="relative flex-1 min-w-0">
                <div className="absolute inset-0 z-0">
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
                      analysisType="green"
                      ndviLayer={ndviLayer}
                      granularity={granularity}
                    />
                  </ErrorBoundary>
                </div>

                {/* Floating KPI cards */}
                <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-5 gap-2 max-w-5xl mx-auto">
                  {kpiCards.map((card) => (
                    <div key={card.label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
                      <div className="text-[9px] text-slate-500 font-bold tracking-wide leading-tight">{card.label}</div>
                      <div className="text-sm font-black text-slate-100 mt-1 truncate">{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* Data source badge */}
                <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
                    <p><span className="text-white">Period:</span> {periodLabel}</p>
                    <p><span className="text-white">Resolution:</span> {mapMode === "idw" ? "10m per pixel (GEE Live)" : "district-level"}</p>
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

              {/* Right aside — map mode only */}
              <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
                <div className="flex min-h-full flex-col gap-3">
                  <MapControlPanel
                    accent="emerald"
                    granularity={granularity}
                    onGranularityChange={setGranularity}
                    mapMode={mapMode}
                    mapModes={[{ value: "district", label: "สถิติ" }, { value: "idw", label: "GEE Live" }]}
                    onMapModeChange={(m) => { setMapMode(m as MapMode); if (m === "idw") setNdviLayer("ndvi_mean"); }}
                    showOpacity={mapMode === "idw"}
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                    baseMap={baseMap}
                    onBaseMapChange={setBaseMap}
                    onReset={handleReset}
                    extraControls={mapMode === "district" ? (
                      <div className="mt-2 grid grid-cols-1 gap-1.5">
                        {([["green_area_rai", "ขนาดพื้นที่สีเขียว"], ["green_area_ratio", "สัดส่วนพื้นที่สีเขียว"], ["ndvi_mean", "ค่า NDVI เฉลี่ย"]] as const).map(([id, label]) => (
                          <button key={id} onClick={() => setNdviLayer(id as NdviLayer)} className={`text-left text-[10px] px-3 py-2 rounded-lg border transition-all font-bold ${ndviLayer === id ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}>{label}</button>
                        ))}
                      </div>
                    ) : undefined}
                  />

                  <MonthYearPicker
                    year={selectedYear} month={selectedMonth} minYear={2018} maxYear={2026}
                    onYearChange={setSelectedYear} onMonthChange={setSelectedMonth}
                    accentColor="emerald"
                    compareMode={compareMode} compareYear={compareYear}
                    onCompareModeChange={setCompareMode} onCompareYearChange={setCompareYear}
                  />

                  <ExportPanel
                    accentColor="emerald"
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
              summary={summary} metric="vegetation" year={selectedYear} compareMode={compareMode}
              accentColor="emerald" activeDistrict={activeDistrict}
              onYearChange={setSelectedYear} onDistrictChange={setActiveDistrict}
              districts={allDistricts} minYear={2018} maxYear={2026}
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
                ndvi_mean: props.ndvi_mean,
                green_area_rai: props.green_area_rai,
                green_area_ratio: props.green_area_ratio,
                priority_score: props.priority_score,
                delta: props.vegetation_delta ?? props.delta,
              })}
              csvFilename={`green-space_${selectedYear}`}
              filterDistrict={activeDistrict}
              year={selectedYear} onYearChange={setSelectedYear}
              minYear={2018} maxYear={2026}
              enableMultiYear accentColor="emerald"
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear}
              onCompareYearChange={setCompareYear}
              onDistrictChange={setActiveDistrict}
              districts={allDistricts}
            />
          )}
        </div>
      </main>
    </div>
  );
}
