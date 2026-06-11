/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import BuiltUpSidebar from "@/components/gee/BuiltUpSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel, downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { MapPin, X, Download, FileText } from "lucide-react";
import ViewTabs, { ViewMode } from "@/components/ui/ViewTabs";
import StatsDashboard from "@/components/stats/StatsDashboard";
import DistrictDataTable, { ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false, loading: () => <MapSkeleton /> });

export default function UrbanExpansionPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<'district' | 'idw'>('idw');
  const [granularity, setGranularity] = useState<"district" | "subdistrict">("district");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.8);
  const [baseMap, setBaseMap] = useState<'dark' | 'light' | 'satellite' | 'streets' | 'none'>('dark');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: selectedYear.toString(), metric: 'builtup' });
    if (selectedMonth) params.append('month', String(selectedMonth));
    if (activeDistrict !== 'ทั้งหมด') params.append('district', activeDistrict);
    if (compareMode) params.append('compareYear', compareYear.toString());

    fetch(`/api/district-metrics?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoading(false); });
  }, [activeDistrict, selectedYear, selectedMonth, compareMode, compareYear]);

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด"); setSelectedYear(2026); setSelectedMonth(null);
    setCompareMode(false); setCompareYear(2018); setMapMode('idw');
    setGranularity("district"); setOpacity(0.8); setBaseMap('dark');
  };

  const highestDensityDistrict = summary?.ndbiRanking?.[0]?.[0] || "ไม่มีข้อมูล";
  const _ueNow = new Date();
  const _ueCurrentYear = _ueNow.getFullYear();
  const periodLabel = selectedMonth
    ? buildPeriodLabel(selectedYear, selectedMonth)
    : selectedYear === _ueCurrentYear
      ? `1 ม.ค. - ${_ueNow.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
      : `1 ม.ค. - 31 ธ.ค. ${selectedYear}`;

  const rankingForExport: (string | number | null)[][] = (summary?.ranking ?? []).map(
    ([name, val]: [string, number | null]) => [name, val !== null && val !== undefined ? +Number(val).toFixed(3) : null, "NDBI", selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel],
  );

  const kpiCards = [
    { label: compareMode ? "ส่วนต่าง NDBI เฉลี่ย" : "NDBI เฉลี่ย", value: compareMode ? `${(summary?.avgDelta ?? 0) >= 0 ? "+" : ""}${(summary?.avgDelta ?? 0).toFixed(3)}` : summary?.averageTemp != null ? summary.averageTemp.toFixed(3) : "--" },
    { label: compareMode ? "การเปลี่ยนแปลงสูงสุด" : "NDBI สูงสุด", value: compareMode ? `${(summary?.maxIncreaseDelta ?? 0) >= 0 ? "+" : ""}${(summary?.maxIncreaseDelta ?? 0).toFixed(3)}` : summary?.maxTemp != null ? summary.maxTemp.toFixed(3) : "--" },
    { label: "เขตที่มี NDBI สูงสุด", value: highestDensityDistrict },
    { label: "ช่วงข้อมูล", value: compareMode ? `${selectedYear} vs ${compareYear}` : periodLabel },
  ];

  const legendConfig = compareMode
    ? { title: "การขยายตัวของเมือง (Urban Expansion)", description: `ผลต่างค่า NDBI ปี ${selectedYear} ลบปีฐาน ${compareYear}`, note: "", unit: "", items: [{ color: "#16A34A", label: "ลดลงมาก", range: "< -0.1" }, { color: "#84CC16", label: "ลดลง", range: "-0.1 ถึง -0.05" }, { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: "-0.05 ถึง +0.05" }, { color: "#F59E0B", label: "เพิ่มขึ้น", range: "+0.05 ถึง +0.1" }, { color: "#EF4444", label: "เพิ่มขึ้นมาก", range: "> +0.1" }] }
    : { title: "ดัชนีพื้นที่สิ่งปลูกสร้าง (NDBI)", description: mapMode === "idw" ? "ข้อมูลความหนาแน่นสิ่งปลูกสร้างรายพิกเซลจากดาวเทียม" : "ค่าเฉลี่ยความหนาแน่นสิ่งปลูกสร้างรายเขต", note: "ยิ่งค่าสูง ยิ่งมีอาคาร/คอนกรีตหนาแน่น", unit: "", items: [{ color: "#16A34A", label: "หนาแน่นต่ำมาก", range: "< -0.2" }, { color: "#84CC16", label: "หนาแน่นต่ำ", range: "-0.2 ถึง 0.0" }, { color: "#F59E0B", label: "ปานกลาง", range: "0.0 ถึง 0.2" }, { color: "#EF4444", label: "หนาแน่นสูง", range: "0.2 ถึง 0.4" }, { color: "#7F1D1D", label: "หนาแน่นสูงมาก", range: "> 0.4" }] };

  const allDistricts = useMemo((): string[] =>
    [...new Set<string>((geojsonData?.features ?? []).map((f: any) => f.properties.name_th as string).filter((s: unknown): s is string => !!s))]
      .sort((a, b) => a.localeCompare(b, "th")),
    [geojsonData],
  );

  const csvFilename = `urban-expansion_NDBI_${selectedYear}`;
  const csvHeaders = ["เขต", "NDBI เฉลี่ย", "ดัชนี", "ช่วงเวลา"];
  const reportData = useMemo((): PDFReportData => ({
    title: "วิเคราะห์การขยายตัวเมือง",
    subtitle: "Sentinel-2 · Normalized Difference Built-up Index",
    source: summary?.sourceLabel ?? summary?.dataSource ?? "ไม่ระบุแหล่งข้อมูล",
    period: selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel,
    layer: "NDBI (Built-up Index)",
    district: activeDistrict,
    kpis: [
      { label: "NDBI เฉลี่ย", value: summary?.averageTemp != null ? summary.averageTemp.toFixed(3) : "–" },
      { label: "เขตหนาแน่นสุด", value: highestDensityDistrict },
    ],
    rankingHeaders: ["เขต", "NDBI"],
    rankingRows: rankingForExport.map(([n, v]) => [n, v]),
  }), [selectedYear, selectedMonth, periodLabel, activeDistrict, summary, highestDensityDistrict, rankingForExport]);

  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต", sortable: false },
    { key: "ndbi_mean", label: "NDBI เฉลี่ย", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#f59e0b" },
    { key: "ndbi_max", label: "NDBI สูงสุด", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#f59e0b", hideable: true },
    { key: "builtup_area_rai", label: "พื้นที่สิ่งปลูกสร้าง", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", heatmap: true, heatmapHex: "#ef4444" },
    { key: "builtup_ratio", label: "ความหนาแน่นสิ่งปลูกสร้างรายเขต", unit: "% พื้นที่เขต", format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}` : "–", heatmap: true, heatmapHex: "#f97316", hideable: true },
    { key: "ndvi_mean", label: "NDVI", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#10b981", heatmapInvert: true, hideable: true },
    { key: "green_area_ratio", label: "สัดส่วนเขียว", unit: "%", format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}` : "–", heatmap: true, heatmapHex: "#22c55e", heatmapInvert: true, hideable: true },
    { key: "district_area_rai", label: "พื้นที่เขต", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", hideable: true },
    ...(compareMode ? [{ key: "delta", label: "Δ NDBI", format: (v: any) => v != null ? `${v > 0 ? "+" : ""}${Number(v).toFixed(4)}` : "–", heatmap: true, heatmapHex: "#f59e0b" } as ColDef] : []),
  ];

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      {viewMode === "map" && (
        <BuiltUpSidebar
          onDistrictSelect={setActiveDistrict}
          activeDistrict={activeDistrict}
          summary={summary}
          loading={loading}
          compareMode={compareMode}
          granularity={granularity}
          subdistrictFeatures={granularity === "subdistrict" ? (displayGeoJson?.features ?? []) : []}
        />
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="indigo" />
          <div className="h-4 w-px bg-slate-700/60 mx-0.5 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-slate-600 shrink-0" />
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              disabled={allDistricts.length === 0}
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500/50 disabled:opacity-40 max-w-[130px]"
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
          {loading && <span className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-widest animate-pulse ml-1">กำลังโหลด…</span>}
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
                className="flex items-center gap-1.5 rounded-lg border border-indigo-700/40 bg-indigo-900/20 px-2.5 py-1.5 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-40"
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
                      analysisType="builtup"
                      dataPeriodLabel={periodLabel}
                      granularity={granularity}
                    />
                  </ErrorBoundary>
                </div>

                <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
                  {kpiCards.map((card) => (
                    <div key={card.label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
                      <div className="text-[11px] text-slate-400 font-semibold leading-tight">{card.label}</div>
                      <div className="text-sm font-black text-slate-100 mt-1 truncate">{card.value}</div>
                    </div>
                  ))}
                </div>

                <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">แหล่งข้อมูล</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    <p><span className="text-white">ชั้นแผนที่:</span> {mapMode === "idw" ? "Sentinel-2 ผ่าน GEE รายพิกเซล" : "สถิติรายเขต"}</p>
                    <p><span className="text-white">KPI/อันดับ:</span> {summary?.sourceLabel ?? "ยังไม่ระบุแหล่ง"}</p>
                    <p><span className="text-white">คุณภาพ KPI:</span> {summary?.dataQuality === "estimated" ? "ประมาณการ" : summary?.dataQuality === "modeled" ? "แบบจำลอง" : "ข้อมูลสังเกต"}</p>
                    <p><span className="text-white">ช่วงเวลา:</span> {periodLabel}</p>
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
                        <span className="font-mono text-[9px] text-slate-400">{item.range}</span>
                      </div>
                    ))}
                  </div>
                  {legendConfig.note && <p className="mt-3 border-t border-slate-800 pt-2 text-[9px] leading-snug text-slate-500">{legendConfig.note}</p>}
                </div>
              </div>

              {/* Right aside */}
              <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
                <div className="flex min-h-full flex-col gap-3">
                  <MapControlPanel
                    accent="indigo"
                    granularity={granularity}
                    onGranularityChange={setGranularity}
                    mapMode={mapMode}
                    mapModes={[
                      { value: "district", label: "สรุปรายพื้นที่", description: "ระบายสีแต่ละเขต/แขวงด้วยค่า NDBI เฉลี่ยของพื้นที่นั้น" },
                      { value: "idw", label: "ภาพรายพิกเซล", description: "แสดงดัชนีสิ่งปลูกสร้างรายพิกเซลจากดาวเทียม" },
                    ]}
                    onMapModeChange={(m) => setMapMode(m as "district" | "idw")}
                    showOpacity={mapMode === "idw"}
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                    baseMap={baseMap}
                    onBaseMapChange={setBaseMap}
                    onReset={handleReset}
                    currentLayer={compareMode ? `ผลต่าง NDBI ${selectedYear} - ${compareYear}` : "ดัชนีสิ่งปลูกสร้าง (NDBI)"}
                    currentPeriod={selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel}
                    dataSource={mapMode === "idw" ? "ดาวเทียม (รายพิกเซล)" : summary?.dataSource ?? "สถิติรายเขต"}
                    interactionHint={mapMode === "idw" ? "คลิกบนภาพเพื่ออ่านค่า NDBI ของพิกเซล ณ ตำแหน่งนั้น" : "วางเมาส์บนพื้นที่เพื่อดู NDBI และพื้นที่สิ่งปลูกสร้างโดยประมาณ"}
                  />

                  <MonthYearPicker
                    year={selectedYear} month={selectedMonth} minYear={2018} maxYear={2026}
                    onYearChange={setSelectedYear} onMonthChange={setSelectedMonth}
                    accentColor="indigo"
                    compareMode={compareMode} compareYear={compareYear}
                    onCompareModeChange={setCompareMode} onCompareYearChange={setCompareYear}
                  />

                  <ExportPanel
                    accentColor="indigo"
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
              summary={summary} metric="builtup" year={selectedYear} compareMode={compareMode}
              accentColor="indigo" activeDistrict={activeDistrict}
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
                ndbi_mean: props.ndbi_mean,
                ndbi_max: props.ndbi_max ?? null,
                builtup_area_rai: props.builtup_area_rai,
                builtup_ratio: props.builtup_ratio ?? null,
                ndvi_mean: props.ndvi_mean ?? null,
                green_area_ratio: props.green_area_ratio ?? null,
                district_area_rai: props.district_area_rai ?? null,
                delta: props.delta,
              })}
              csvFilename={`urban-expansion_${selectedYear}`}
              filterDistrict={activeDistrict}
              year={selectedYear} onYearChange={setSelectedYear}
              minYear={2018} maxYear={2026}
              enableMultiYear accentColor="indigo"
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear}
              onCompareYearChange={setCompareYear}
              onDistrictChange={setActiveDistrict}
              districts={allDistricts}
              dataSource={summary?.dataSource}
              contextNote="NDBI สูงมักสัมพันธ์กับสิ่งปลูกสร้าง ควรอ่านคู่กับ NDVI/พื้นที่สีเขียว"
              expectedRows={activeDistrict === "ทั้งหมด" ? 50 : 1}
            />
          )}

          {viewMode === "guide" && (
            <PlainLanguageGuide
              module="builtup"
              accent="indigo"
              records={displayGeoJson?.features ?? []}
              year={selectedYear}
              activeArea={activeDistrict}
              compareMode={compareMode}
              compareYear={compareYear}
              dataSource={summary?.sourceLabel ?? summary?.dataSource}
              dataQuality={summary?.dataQuality}
            />
          )}
        </div>
      </main>
    </div>
  );
}
