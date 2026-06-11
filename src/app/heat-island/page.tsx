/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import LSTSidebar from "@/components/gee/LSTSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import { formatLST, getLSTLegendItems } from "@/lib/lst";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel, downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { MapPin, X, Download, FileText } from "lucide-react";
import ViewTabs, { ViewMode } from "@/components/ui/ViewTabs";
import StatsDashboard from "@/components/stats/StatsDashboard";
import DistrictDataTable, { ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false, loading: () => <MapSkeleton /> });

export default function HeatIslandPage() {
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
    const params = new URLSearchParams({ year: selectedYear.toString() });
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
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setSelectedMonth(null);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode('idw');
    setGranularity("district");
    setOpacity(0.8);
    setBaseMap('dark');
  };

  const hottestDistrict = summary?.ranking?.[0]?.[0] || "ไม่มีข้อมูล";
  const _now = new Date();
  const _currentYear = _now.getFullYear();
  const periodLabel = selectedMonth
    ? buildPeriodLabel(selectedYear, selectedMonth)
    : selectedYear === _currentYear
      ? `1 ม.ค. - ${_now.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
      : `1 ม.ค. - 31 ธ.ค. ${selectedYear}`;

  const rankingForExport: (string | number | null)[][] = (summary?.ranking ?? []).map(
    ([name, val]: [string, number | null]) => [
      name,
      val !== null && val !== undefined ? +Number(val).toFixed(2) : null,
      "°C",
      selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel,
    ],
  );
  const highLstDistrictCount = (geojsonData?.features || []).filter((feature: any) => {
    const value = feature?.properties?.mean_lst;
    return typeof value === "number" && value >= 36;
  }).length;
  const kpiCards = [
    {
      label: compareMode ? "ส่วนต่าง LST เฉลี่ย" : "LST เฉลี่ย",
      value: compareMode
        ? `${summary?.avgDelta > 0 ? "+" : ""}${(summary?.avgDelta ?? 0).toFixed(2)}°C`
        : summary?.averageTemp !== null && summary?.averageTemp !== undefined
          ? formatLST(Number(summary.averageTemp))
          : "ไม่มีข้อมูล",
    },
    {
      label: compareMode ? "ส่วนต่าง LST สูงสุด" : "LST สูงสุด",
      value: compareMode
        ? `${(summary?.maxIncreaseDelta ?? summary?.max_delta ?? 0) >= 0 ? "+" : ""}${(summary?.maxIncreaseDelta ?? summary?.max_delta ?? 0).toFixed(2)}°C`
        : summary?.maxTemp !== null && summary?.maxTemp !== undefined
          ? formatLST(Number(summary.maxTemp))
          : "ไม่มีข้อมูล",
    },
    {
      label: "เขตร้อน (LST ≥ 36°C)",
      value: highLstDistrictCount > 0 ? `${highLstDistrictCount} / 50 เขต` : "ไม่มีข้อมูล",
    },
    {
      label: "เขตที่มี LST เฉลี่ยสูงสุด",
      value: hottestDistrict,
    },
  ];
  const legendConfig = compareMode
    ? {
        title: "การเปลี่ยนแปลงอุณหภูมิพื้นผิว (LST)",
        description: `ค่า LST ปี ${selectedYear} ลบปีฐาน ${compareYear}`,
        note: "การเปรียบเทียบนี้เป็นผลต่าง LST ระหว่างปี ยังไม่ใช่ SUHI Intensity อย่างเป็นทางการ",
        unit: "°C",
        items: [
          { color: "#2166AC", label: "เย็นลงมาก", range: "< -1.5" },
          { color: "#67A9CF", label: "เย็นลง", range: "-1.5 ถึง -0.5" },
          { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: "-0.5 ถึง +0.5" },
          { color: "#EF8A62", label: "ร้อนขึ้น", range: "+0.5 ถึง +1.5" },
          { color: "#B2182B", label: "ร้อนขึ้นมาก", range: "> +1.5" },
        ],
      }
    : {
        title: "ระดับอุณหภูมิพื้นผิว (LST)",
        description: mapMode === "idw"
          ? "ข้อมูลอุณหภูมิพื้นผิวรายพิกเซลจากดาวเทียม"
          : "ค่าอุณหภูมิพื้นผิวเฉลี่ยรายเขตในปีที่เลือก",
        note: "LST = อุณหภูมิพื้นผิว (ถนน/อาคาร/พื้นดิน) ไม่ใช่อุณหภูมิอากาศ",
        unit: "°C",
        items: getLSTLegendItems(),
      };

  const allDistricts = useMemo((): string[] =>
    [...new Set<string>((geojsonData?.features ?? []).map((f: any) => f.properties.name_th as string).filter((s: unknown): s is string => !!s))]
      .sort((a, b) => a.localeCompare(b, "th")),
    [geojsonData],
  );

  const csvFilename = `heat-island_LST_${selectedYear}`;
  const csvHeaders = ["เขต", "LST เฉลี่ย (°C)", "หน่วย", "ช่วงเวลา"];
  const reportData = useMemo((): PDFReportData => ({
    title: "วิเคราะห์เกาะความร้อนเมือง",
    subtitle: "Landsat 8/9 Land Surface Temperature",
    source: "Landsat 8/9 Collection 2",
    period: selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel,
    layer: "LST (Land Surface Temperature)",
    district: activeDistrict,
    kpis: [
      { label: "LST เฉลี่ย", value: summary?.averageTemp != null ? formatLST(Number(summary.averageTemp)) : "–" },
      { label: "LST สูงสุด", value: summary?.maxTemp != null ? formatLST(Number(summary.maxTemp)) : "–" },
      { label: "เขตร้อนสุด", value: summary?.ranking?.[0]?.[0] ?? "–" },
      { label: "ปีที่เลือก", value: String(selectedYear) },
    ],
    rankingHeaders: ["เขต", "LST (°C)"],
    rankingRows: rankingForExport.map(([n, v]) => [n, v]),
  }), [selectedYear, selectedMonth, periodLabel, activeDistrict, summary, rankingForExport]);

  // Table columns
  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต", sortable: false },
    { key: "mean_lst", label: "LST เฉลี่ย", unit: "°C", format: (v) => v != null ? `${Number(v).toFixed(2)}` : "–", heatmap: true, heatmapHex: "#f97316" },
    { key: "max_lst", label: "LST สูงสุด", unit: "°C", format: (v) => v != null ? `${Number(v).toFixed(2)}` : "–", heatmap: true, heatmapHex: "#ef4444" },
    { key: "green_area_rai", label: "พื้นที่สีเขียว", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", heatmap: true, heatmapHex: "#10b981", hideable: true },
    { key: "green_area_ratio", label: "ความหนาแน่นพื้นที่เขียว", unit: "% พื้นที่เขต", format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}` : "–", heatmap: true, heatmapHex: "#34d399", hideable: true },
    { key: "builtup_ratio", label: "ความหนาแน่นสิ่งปลูกสร้าง", unit: "% พื้นที่เขต", format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}` : "–", heatmap: true, heatmapHex: "#ef4444", hideable: true },
    { key: "district_area_rai", label: "พื้นที่เขต", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", hideable: true },
    ...(compareMode
      ? [{ key: "delta", label: "Δ LST", unit: "°C", format: (v: any) => v != null ? `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}` : "–", heatmap: true, heatmapHex: "#f97316" } as ColDef]
      : []
    ),
  ];

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      {viewMode === "map" && (
        <LSTSidebar
          onDistrictSelect={setActiveDistrict}
          activeDistrict={activeDistrict}
          summary={summary}
          loading={loading}
          compareMode={compareMode}
          granularity={granularity}
          subdistrictFeatures={granularity === "subdistrict" ? (displayGeoJson?.features ?? []) : []}
        />
      )}

      {/* Main content area */}
      <main className="flex-1 min-w-0 flex flex-col">

        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="orange" />
          <div className="h-4 w-px bg-slate-700/60 mx-0.5 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-slate-600 shrink-0" />
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              disabled={allDistricts.length === 0}
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-orange-500/50 disabled:opacity-40 max-w-[130px]"
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
          {loading && (
            <span className="text-[10px] font-bold text-orange-400/70 uppercase tracking-widest animate-pulse ml-1">
              กำลังโหลด…
            </span>
          )}
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
                className="flex items-center gap-1.5 rounded-lg border border-orange-700/40 bg-orange-900/20 px-2.5 py-1.5 text-[10px] font-bold text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-40"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </div>

        {/* Content */}
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
                      dataPeriodLabel={periodLabel}
                      granularity={granularity}
                    />
                  </ErrorBoundary>
                </div>

                {/* Floating KPI cards */}
                <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
                  {kpiCards.map((card) => (
                    <div key={card.label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
                      <div className="text-[11px] text-slate-400 font-semibold leading-tight">{card.label}</div>
                      <div className="text-sm font-black text-slate-100 mt-1 truncate">{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* Data Source Badge */}
                <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">แหล่งข้อมูล</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    <p>ดาวเทียมสำรวจอุณหภูมิพื้นผิว</p>
                    {compareMode ? (
                      <p>เปรียบเทียบ ปี {compareYear} → ปี {selectedYear}</p>
                    ) : (
                      <p>ช่วงเวลา: {periodLabel}</p>
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
                  <p className="mt-3 border-t border-slate-800 pt-2 text-[9px] leading-snug text-slate-500">{legendConfig.note}</p>
                </div>
              </div>

              {/* Right aside (controls) — map mode only */}
              <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
                <div className="flex min-h-full flex-col gap-3">
                  <MapControlPanel
                    accent="orange"
                    granularity={granularity}
                    onGranularityChange={setGranularity}
                    mapMode={mapMode}
                    mapModes={[
                      { value: "district", label: "สรุปรายพื้นที่", description: "ระบายสีแต่ละเขต/แขวงด้วยค่า LST เฉลี่ยของพื้นที่นั้น" },
                      { value: "idw", label: "ภาพรายพิกเซล", description: "แสดงพื้นผิวอุณหภูมิรายพิกเซลจากดาวเทียม" },
                    ]}
                    onMapModeChange={(m) => setMapMode(m as "district" | "idw")}
                    showOpacity={mapMode === "idw"}
                    opacity={opacity}
                    onOpacityChange={setOpacity}
                    baseMap={baseMap}
                    onBaseMapChange={setBaseMap}
                    onReset={handleReset}
                    currentLayer={compareMode ? `ผลต่าง LST ${selectedYear} - ${compareYear}` : "อุณหภูมิพื้นผิว (LST)"}
                    currentPeriod={periodLabel}
                    dataSource={mapMode === "idw" ? "ดาวเทียม (รายพิกเซล)" : summary?.dataSource ?? "สถิติรายเขต"}
                    interactionHint={mapMode === "idw" ? "คลิกบนภาพเพื่ออ่านค่า LST ของพิกเซล ณ ตำแหน่งนั้น" : "วางเมาส์บนพื้นที่เพื่อดูค่าเฉลี่ยและรายละเอียด"}
                  />

                  <MonthYearPicker
                    year={selectedYear} month={selectedMonth}
                    minYear={2018} maxYear={2026}
                    onYearChange={setSelectedYear} onMonthChange={setSelectedMonth}
                    accentColor="orange"
                    compareMode={compareMode} compareYear={compareYear}
                    onCompareModeChange={setCompareMode} onCompareYearChange={setCompareYear}
                  />

                  <ExportPanel
                    accentColor="orange"
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
              summary={summary}
              metric="lst"
              year={selectedYear}
              compareMode={compareMode}
              accentColor="orange"
              activeDistrict={activeDistrict}
              onYearChange={setSelectedYear}
              onDistrictChange={setActiveDistrict}
              districts={allDistricts}
              minYear={2018}
              maxYear={2026}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear}
              onCompareYearChange={setCompareYear}
            />
          )}

          {viewMode === "table" && (
            <DistrictDataTable
              features={displayGeoJson?.features ?? []}
              columns={tableColumns}
              getRowData={(props) => ({
                name: props.name_th,
                mean_lst: props.mean_lst,
                max_lst: props.max_lst,
                green_area_rai: props.green_area_rai ?? null,
                green_area_ratio: props.green_area_ratio ?? null,
                builtup_ratio: props.builtup_ratio ?? null,
                district_area_rai: props.district_area_rai ?? null,
                delta: props.delta,
              })}
              csvFilename={`heat-island_${selectedYear}`}
              filterDistrict={activeDistrict}
              year={selectedYear}
              onYearChange={setSelectedYear}
              minYear={2018}
              maxYear={2026}
              enableMultiYear
              accentColor="orange"
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear}
              onCompareYearChange={setCompareYear}
              onDistrictChange={setActiveDistrict}
              districts={allDistricts}
              dataSource={summary?.dataSource}
              contextNote="LST คืออุณหภูมิพื้นผิวจากดาวเทียม ไม่ใช่อุณหภูมิอากาศที่สถานีตรวจวัด"
              expectedRows={activeDistrict === "ทั้งหมด" ? 50 : 1}
            />
          )}

          {viewMode === "guide" && (
            <PlainLanguageGuide
              module="heat"
              accent="orange"
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
