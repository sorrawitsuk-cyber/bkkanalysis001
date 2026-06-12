/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileText, Leaf, SlidersHorizontal, X } from "lucide-react";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import MapControlPanel from "@/components/map/MapControlPanel";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import NdviSciencePanel from "@/components/ndvi/NdviSciencePanel";
import NdviSidebar from "@/components/ndvi/NdviSidebar";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { getNdviClassThai, getNdviColor } from "@/lib/ndvi";

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
    const params = new URLSearchParams({ year: String(year), metric: "vegetation" });
    if (compareMode) params.set("compareYear", String(compareYear));
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
  }, [compareMode, compareYear, year]);

  useEffect(() => {
    if (compareYear >= year) setCompareYear(Math.max(MIN_YEAR, year - 1));
  }, [compareYear, year]);

  const rows = useMemo(() => (
    (geojsonData?.features ?? []).map((feature: any) => ({
      name: feature.properties.name_th,
      ndvi_mean: feature.properties.ndvi_mean,
      ndvi_class: feature.properties.ndvi_class,
      delta: feature.properties.vegetation_delta,
      district_area_rai: feature.properties.district_area_rai,
      data_quality: summary?.dataQuality,
    }))
  ), [geojsonData, summary?.dataQuality]);

  const filteredRows = activeDistrict === ALL_DISTRICTS
    ? rows
    : rows.filter((row: any) => row.name === activeDistrict);
  const validRows = rows.filter((row: any) => typeof row.ndvi_mean === "number");
  const totalArea = validRows.reduce((sum: number, row: any) => sum + (row.district_area_rai ?? 0), 0);
  const weightedMean = totalArea > 0
    ? validRows.reduce((sum: number, row: any) => sum + row.ndvi_mean * (row.district_area_rai ?? 0), 0) / totalArea
    : null;
  const rankedRows = [...validRows].sort((a: any, b: any) => b.ndvi_mean - a.ndvi_mean);
  const changeRows = [...validRows]
    .filter((row: any) => typeof row.delta === "number")
    .sort((a: any, b: any) => a.delta - b.delta);
  const districts = rows.map((row: any) => row.name).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b, "th"));
  const periodLabel = year === CURRENT_YEAR
    ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${year} (YTD)`
    : `1 ม.ค. – 31 ธ.ค. ${year}`;

  const csvHeaders = ["เขต", "NDVI เฉลี่ย", "ระดับเชิงพรรณนา", ...(compareMode ? [`ผลต่างจาก ${compareYear}`] : []), "ปี", "สถานะข้อมูล"];
  const csvRows = rankedRows.map((row: any) => [
    row.name,
    row.ndvi_mean,
    getNdviClassThai(row.ndvi_class),
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
      { label: "เขตค่าสูงสุด", value: rankedRows[0]?.name ?? "ไม่มีข้อมูล" },
      { label: "เขตค่าต่ำสุด", value: rankedRows[rankedRows.length - 1]?.name ?? "ไม่มีข้อมูล" },
      { label: "สถานะข้อมูล", value: summary?.dataQuality ?? "unknown" },
    ],
    rankingHeaders: ["เขต", "NDVI เฉลี่ย"],
    rankingRows: rankedRows.map((row: any) => [row.name, row.ndvi_mean]),
  };

  const tableColumns: ColDef[] = [
    { key: "name", label: "เขต", sortable: true },
    { key: "ndvi_mean", label: "NDVI เฉลี่ย", format: (value) => formatNdvi(Number(value)), heatmap: true, heatmapHex: "#22c55e" },
    { key: "ndvi_class", label: "ระดับเชิงพรรณนา", format: (value) => getNdviClassThai(String(value)) },
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
        <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800/70 bg-slate-950/95 px-3 py-2.5">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="emerald" />
          <select
            value={activeDistrict}
            onChange={(event) => setActiveDistrict(event.target.value)}
            className="h-8 max-w-[140px] shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-300"
          >
            <option value={ALL_DISTRICTS}>ทุกเขต</option>
            {districts.map((district: string) => <option key={district} value={district}>{district}</option>)}
          </select>
          <div className="flex-1" />
          <span className="hidden shrink-0 text-[10px] text-slate-500 md:block">{periodLabel}</span>
          <button type="button" onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_ndvi_${year}`)} className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 text-[10px] text-slate-400 hover:text-white">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button type="button" onClick={() => printReport(reportData)} className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-emerald-700/50 bg-emerald-950/30 px-2 text-[10px] text-emerald-300 hover:text-white">
            <FileText className="h-3 w-3" /> PDF
          </button>
        </header>

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
                    ["NDVI เฉลี่ยถ่วงพื้นที่", formatNdvi(weightedMean)],
                    ["เขต NDVI สูงสุด", rankedRows[0]?.name ?? "ไม่มีข้อมูล"],
                    ["เขต NDVI ต่ำสุด", rankedRows[rankedRows.length - 1]?.name ?? "ไม่มีข้อมูล"],
                    [compareMode ? `ลดลงมากสุดจาก ${compareYear}` : "จำนวนเขตที่มีข้อมูล", compareMode ? `${changeRows[0]?.name ?? "ไม่มีข้อมูล"} · ${formatNdvi(changeRows[0]?.delta, true)}` : `${validRows.length} เขต`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-[10px] text-slate-500">{label}</div>
                      <div className="mt-1 text-lg font-black text-emerald-200">{value}</div>
                    </div>
                  ))}
                </div>

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
                    <h2 className="text-sm font-black">{compareMode ? `ผลต่างจากปี ${compareYear}` : "แนวโน้มค่าเฉลี่ยกรุงเทพฯ แบบถ่วงพื้นที่"}</h2>
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
                <NdviSciencePanel />
              </div>
            </div>
          ) : viewMode === "table" ? (
            <div className="h-full p-4 sm:p-5">
              <DistrictDataTable
                features={geojsonData?.features ?? []}
                columns={tableColumns}
                getRowData={(properties) => ({
                  name: properties.name_th,
                  ndvi_mean: properties.ndvi_mean,
                  ndvi_class: properties.ndvi_class,
                  delta: properties.vegetation_delta,
                })}
                csvFilename={`bangkok_ndvi_${year}`}
                filterDistrict={activeDistrict}
                onDistrictChange={setActiveDistrict}
                districts={districts}
                accentColor="emerald"
                dataSource={summary?.sourceLabel ?? summary?.dataSource}
                contextNote={`${periodLabel} · NDVI ไม่มีหน่วย · ไม่ใช่ Tree Cover หรือทะเบียนสวน`}
                expectedRows={activeDistrict === ALL_DISTRICTS ? 50 : 1}
              />
            </div>
          ) : (
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
          )}
        </div>
      </main>
    </div>
  );
}
