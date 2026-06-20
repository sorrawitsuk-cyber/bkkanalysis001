/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CalendarRange, Download, FileText, Layers3, RefreshCw, MapPin, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import UrbanExpansionSidebar from "@/components/gee/UrbanExpansionSidebar";
import MapControlPanel from "@/components/map/MapControlPanel";
import InteractiveDistrictPanel from "@/components/map/InteractiveDistrictPanel";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { buildProvenance, getPolicySafeInsight } from "@/lib/data-provenance";
import {
  URBAN_EXPANSION_MIN_YEAR,
  builtCoverColor,
  formatUrbanChange,
  formatUrbanPercent,
  formatUrbanRai,
  type UrbanExpansionResponse,
} from "@/lib/urban-expansion";

const UrbanExpansionMap = dynamic(() => import("@/components/map/UrbanExpansionMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const ALL_DISTRICTS = "ทั้งหมด";
const CURRENT_YEAR = new Date().getUTCFullYear();

const TABLE_COLUMNS: ColDef[] = [
  { key: "name", label: "เขต", sortable: true },
  { key: "built_cover_pct", label: "Built-up cover", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#f97316" },
  { key: "built_area_rai", label: "พื้นที่สิ่งปลูกสร้าง", unit: "ไร่", format: (value) => Math.round(Number(value)).toLocaleString("th-TH"), heatmap: true, heatmapHex: "#ef4444" },
  { key: "built_change_pp", label: "เปลี่ยนจากปีฐาน", unit: "จุด%", format: (value) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}`, heatmap: true, heatmapHex: "#fb923c" },
  { key: "built_gain_pct", label: "สิ่งปลูกสร้างเพิ่ม", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#f97316" },
  { key: "built_loss_pct", label: "สิ่งปลูกสร้างลด", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#22c55e", hideable: true },
  { key: "green_to_built_pct", label: "สีเขียว → สิ่งปลูกสร้าง", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#ef4444" },
  { key: "bare_to_built_pct", label: "พื้นที่โล่ง → สิ่งปลูกสร้าง", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#facc15", hideable: true },
  { key: "stable_built_pct", label: "สิ่งปลูกสร้างคงเดิม", unit: "%", format: (value) => Number(value).toFixed(2), hideable: true },
  { key: "confidence_pct", label: "ความเชื่อมั่นเฉลี่ย", unit: "%", format: (value) => Number(value).toFixed(1), hideable: true },
  { key: "coverage_pct", label: "พื้นที่ที่มีข้อมูล", unit: "%", format: (value) => Number(value).toFixed(1), hideable: true },
];

export default function UrbanExpansionPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [baselineYear, setBaselineYear] = useState(2020);
  const [activeDistrict, setActiveDistrict] = useState(ALL_DISTRICTS);
  const [mode, setMode] = useState<"cover" | "change">("cover");
  const [data, setData] = useState<UrbanExpansionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rasterVisible, setRasterVisible] = useState(true);
  const [opacity, setOpacity] = useState(0.72);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/urban-expansion?year=${year}&baseline=${baselineYear}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดข้อมูลพื้นที่สิ่งปลูกสร้างได้");
      setData(payload);
      setActiveDistrict(ALL_DISTRICTS);
    } catch (loadError: any) {
      setError(loadError?.message ?? "ไม่สามารถโหลดข้อมูลพื้นที่สิ่งปลูกสร้างได้");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [baselineYear, year]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (baselineYear >= year) setBaselineYear(Math.max(URBAN_EXPANSION_MIN_YEAR, year - 1));
  }, [baselineYear, year]);

  const activeRow = activeDistrict === ALL_DISTRICTS ? null : data?.rows.find((row) => row.district_name === activeDistrict) ?? null;
  const panelProvenance = buildProvenance({
    summary: data?.summary,
    source: data?.summary.source,
    period: data?.period.currentLabel ?? `ปี ${year}`,
    methodologyId: "urban-expansion-district-v1",
    qualityFlags: [`Dynamic World built class · confidence ≥ 45%`, `เทียบปีฐาน ${baselineYear}`],
  });
  const panelInsight = getPolicySafeInsight({
    selected: activeDistrict !== ALL_DISTRICTS,
    title: activeDistrict,
    metricLabel: mode === "cover" ? "Built-up cover" : "Built-up gain",
    primaryValue: mode === "cover" ? activeRow?.built_cover_pct : activeRow?.built_gain_pct,
    averageValue: mode === "cover" ? data?.summary.builtCoverPct : data?.summary.builtGainPct,
    higherIsConcern: true,
    provenance: panelProvenance,
  });
  const displayedRows = activeRow ? [activeRow] : data?.rows ?? [];
  const coverRanking = useMemo(() => [...(data?.rows ?? [])].sort((a, b) => (b.built_cover_pct ?? -1) - (a.built_cover_pct ?? -1)).slice(0, 15), [data?.rows]);
  const expansionRanking = useMemo(() => [...(data?.rows ?? [])].sort((a, b) => (b.built_gain_pct ?? -1) - (a.built_gain_pct ?? -1)).slice(0, 15), [data?.rows]);
  const conversionRows = useMemo(() => [...(data?.rows ?? [])]
    .sort((a, b) => (b.green_to_built_pct ?? -1) - (a.green_to_built_pct ?? -1))
    .slice(0, 12)
    .map((row) => ({ district: row.district_name, "สีเขียว → built": row.green_to_built_pct ?? 0, "พื้นที่โล่ง → built": row.bare_to_built_pct ?? 0 })),
  [data?.rows]);

  const csvRows = (data?.rows ?? []).map((row) => [
    row.district_name, row.built_cover_pct, row.built_area_rai, row.built_change_pp,
    row.built_gain_pct, row.built_loss_pct, row.green_to_built_pct, row.bare_to_built_pct,
    row.confidence_pct, row.coverage_pct,
  ]);
  const csvHeaders = ["เขต", "Built-up cover (%)", "พื้นที่สิ่งปลูกสร้าง (ไร่)", "เปลี่ยนจากปีฐาน (จุด%)", "สิ่งปลูกสร้างเพิ่ม (%)", "สิ่งปลูกสร้างลด (%)", "สีเขียวเป็นสิ่งปลูกสร้าง (%)", "พื้นที่โล่งเป็นสิ่งปลูกสร้าง (%)", "ความเชื่อมั่น (%)", "พื้นที่มีข้อมูล (%)"];
  const reportData: PDFReportData = {
    title: "รายงานพื้นที่สิ่งปลูกสร้างและการขยายตัวของเมือง",
    subtitle: "Google Dynamic World V1 · Built class",
    source: data?.summary.source ?? "Google Dynamic World V1",
    period: data?.period.currentLabel ?? `ปี ${year}`,
    layer: mode === "cover" ? "Built-up Cover" : "Urban Expansion",
    district: activeDistrict,
    kpis: [
      { label: "Built-up cover", value: formatUrbanPercent(activeRow?.built_cover_pct ?? data?.summary.builtCoverPct) },
      { label: "พื้นที่สิ่งปลูกสร้าง", value: formatUrbanRai(activeRow?.built_area_rai ?? data?.summary.builtAreaRai) },
      { label: `เปลี่ยนจากปี ${baselineYear}`, value: formatUrbanChange(activeRow?.built_change_pp ?? data?.summary.builtChangePp) },
      { label: "เขตที่ built-up cover สูงสุด", value: data?.summary.highestBuiltCoverDistrict ?? "ไม่มีข้อมูล" },
    ],
    rankingHeaders: ["เขต", "Built-up cover (%)"],
    rankingRows: coverRanking.map((row) => [row.district_name, row.built_cover_pct]),
  };

  const legend = mode === "cover"
    ? [["#fef3c7", "< 30%", "ต่ำ"], ["#fdba74", "30-50%", "ค่อนข้างต่ำ"], ["#f97316", "50-70%", "ปานกลาง"], ["#dc2626", "70-85%", "สูง"], ["#7f1d1d", "> 85%", "สูงมาก"]]
    : [["#166534", "< -3 จุด%", "ลดลงมาก"], ["#4ade80", "-3 ถึง -1", "ลดลง"], ["#cbd5e1", "-1 ถึง +1", "ใกล้เคียงเดิม"], ["#fb923c", "+1 ถึง +3", "เพิ่มขึ้น"], ["#b91c1c", "> +3 จุด%", "เพิ่มขึ้นมาก"]];

  const districts = useMemo(() =>
    [...(data?.rows ?? [])]
      .map((row) => row.district_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "th")),
    [data?.rows]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-50">
      <UrbanExpansionSidebar data={data} loading={loading} activeDistrict={activeDistrict} mode={mode} onDistrictSelect={setActiveDistrict} onModeChange={setMode} />
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="orange" />
          <div className="h-4 w-px bg-slate-700/60 mx-0.5 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-slate-600 shrink-0" />
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              disabled={districts.length === 0}
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-orange-500/50 disabled:opacity-40 max-w-[130px]"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {districts.map((name) => (
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
          {!loading && data && viewMode !== "map" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_built_up_${baselineYear}_${year}`)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                type="button"
                onClick={() => printReport(reportData)}
                className="flex items-center gap-1.5 rounded-lg border border-orange-700/40 bg-orange-900/20 px-2.5 py-1.5 text-[10px] font-bold text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-40"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />กำลังจำแนกพื้นที่สิ่งปลูกสร้างจาก Dynamic World</div>
          ) : error || !data ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">{error ?? "ไม่มีข้อมูลพื้นที่สิ่งปลูกสร้าง"}</div>
          ) : <>
            {viewMode === "map" && (
              <div className="flex h-full">
                <div className="relative min-w-0 flex-1">
                  <UrbanExpansionMap geojsonData={data.geojson} rasterUrl={mode === "cover" ? data.rasters.current.urlFormat : data.rasters.change.urlFormat} rasterVisible={rasterVisible} mode={mode} activeDistrict={activeDistrict} opacity={opacity} baseMap={baseMap} onDistrictSelect={setActiveDistrict} />
                  
                  {/* Floating KPI cards */}
                  <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
                    {[
                      ["Built-up cover", formatUrbanPercent(activeRow?.built_cover_pct ?? data.summary.builtCoverPct)],
                      ["พื้นที่สิ่งปลูกสร้าง", formatUrbanRai(activeRow?.built_area_rai ?? data.summary.builtAreaRai)],
                      [`เปลี่ยนจาก ${baselineYear}`, formatUrbanChange(activeRow?.built_change_pp ?? data.summary.builtChangePp)],
                      ["สีเขียว → built", formatUrbanPercent(activeRow?.green_to_built_pct ?? data.summary.greenToBuiltPct)],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
                        <div className="text-[11px] text-slate-400 font-semibold leading-tight">{label}</div>
                        <div className="text-sm font-black text-slate-100 mt-1 truncate">{value}</div>
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
                      <p>{data?.summary.source ?? "Google Dynamic World V1"}</p>
                      <p>ช่วงเวลาเปรียบเทียบ: {baselineYear} → {year}</p>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="absolute bottom-4 right-4 z-[1000] w-80 max-w-[calc(100%-2rem)] rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
                    <div className="mb-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">สัญลักษณ์แผนที่</h4>
                      <p className="mt-1 text-[10px] leading-snug text-slate-400">{mode === "cover" ? "Built-up cover รายเขต" : "การเปลี่ยนแปลงเทียบปีฐาน"}</p>
                    </div>
                    <div className="space-y-2">
                      {legend.map(([color, range, label]) => (
                        <div key={range} className="grid grid-cols-[14px_1fr_auto] items-center gap-2 text-[10px]">
                          <span className="h-3.5 w-3.5 rounded-sm border border-white/10" style={{ backgroundColor: color }} />
                          <span className="min-w-0 truncate text-slate-300">{label}</span>
                          <span className="font-mono text-[9px] text-slate-400">{range}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4 animate-in slide-in-from-right duration-200">
                  <div className="flex min-h-full flex-col gap-3">
                    <InteractiveDistrictPanel
                      accent="orange"
                      selected={activeDistrict !== ALL_DISTRICTS}
                      title={activeDistrict !== ALL_DISTRICTS ? activeDistrict : "เลือกเขตบนแผนที่"}
                      subtitle={activeDistrict !== ALL_DISTRICTS ? "สรุปสิ่งปลูกสร้างของพื้นที่ที่คลิก" : "คลิก polygon เขตเพื่อดูสถิติการขยายตัวเมือง"}
                      onClear={() => setActiveDistrict(ALL_DISTRICTS)}
                      metrics={[
                        { label: "Built-up cover", value: formatUrbanPercent(activeRow?.built_cover_pct), rawValue: activeRow?.built_cover_pct, color: "#f97316" },
                        { label: "พื้นที่สิ่งปลูกสร้าง", value: formatUrbanRai(activeRow?.built_area_rai), rawValue: activeRow?.built_area_rai, color: "#fb923c" },
                        { label: "Built-up gain", value: formatUrbanPercent(activeRow?.built_gain_pct), rawValue: activeRow?.built_gain_pct, color: "#ef4444" },
                        { label: "สีเขียว → built", value: formatUrbanPercent(activeRow?.green_to_built_pct), rawValue: activeRow?.green_to_built_pct, color: "#facc15" },
                      ]}
                      provenance={panelProvenance}
                      insight={panelInsight}
                    />

                    <MapControlPanel
                      accent="orange"
                      granularity="district"
                      onGranularityChange={() => undefined}
                      showGranularity={false}
                      mapMode={mode}
                      mapModes={[
                        { value: "cover", label: "สถานะปัจจุบัน", description: "แสดงสัดส่วนพิกเซลที่จำแนกเป็นสิ่งปลูกสร้างรายเขต" },
                        { value: "change", label: "การขยายตัว (Urban Expansion)", description: "แสดงการขยายตัวของสิ่งปลูกสร้างเปรียบเทียบกับปีฐาน" },
                      ]}
                      onMapModeChange={(m) => setMode(m as "cover" | "change")}
                      showOpacity={true}
                      opacity={opacity}
                      onOpacityChange={setOpacity}
                      baseMap={baseMap}
                      onBaseMapChange={setBaseMap}
                      onReset={() => {
                        setYear(CURRENT_YEAR);
                        setBaselineYear(2020);
                        setActiveDistrict(ALL_DISTRICTS);
                        setMode("cover");
                        setBaseMap("dark");
                        setOpacity(0.72);
                      }}
                      currentLayer={mode === "cover" ? "Built-up Cover" : `การขยายตัวของเมือง (${baselineYear} → ${year})`}
                      currentPeriod={data?.period.currentLabel ?? `ปี ${year}`}
                      dataSource={data?.summary.source ?? "Google Dynamic World V1"}
                      interactionHint="วางเมาส์บนเขตเพื่ออ่านค่าและสัดส่วน"
                    />

                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                        <span>แสดงภาพถ่ายสิ่งปลูกสร้าง</span>
                        <button
                          type="button"
                          onClick={() => setRasterVisible((v) => !v)}
                          className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-[10px] font-bold text-orange-400 hover:text-orange-300 transition-colors"
                        >
                          {rasterVisible ? "แสดงอยู่" : "ซ่อนอยู่"}
                        </button>
                      </div>
                    </div>

                    <MonthYearPicker
                      year={year}
                      month={null}
                      minYear={URBAN_EXPANSION_MIN_YEAR}
                      maxYear={CURRENT_YEAR}
                      onYearChange={setYear}
                      onMonthChange={() => undefined}
                      accentColor="orange"
                      compareMode={true}
                      compareYear={baselineYear}
                      onCompareYearChange={setBaselineYear}
                      onCompareModeChange={() => undefined}
                    />

                    <ExportPanel
                      accentColor="orange"
                      csvFilename={`bangkok_built_up_${baselineYear}_${year}`}
                      csvHeaders={csvHeaders}
                      csvRows={csvRows}
                      reportData={reportData}
                    />
                  </div>
                </aside>
              </div>
            )}

            {viewMode === "stats" && (
              <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Built-up cover เฉลี่ย", formatUrbanPercent(data.summary.builtCoverPct), "text-orange-300"],
                    ["พื้นที่สิ่งปลูกสร้างรวม", formatUrbanRai(data.summary.builtAreaRai), "text-red-300"],
                    [`เปลี่ยนจาก ${baselineYear}`, formatUrbanChange(data.summary.builtChangePp), (data.summary.builtChangePp ?? 0) > 0 ? "text-red-300" : "text-green-300"],
                    ["พื้นที่มีข้อมูลเฉลี่ย", formatUrbanPercent(data.summary.averageCoveragePct), "text-cyan-300"],
                  ].map(([label, value, color]) => <div key={label} className="rounded-xl bg-slate-900/70 p-4"><div className="text-[10px] text-slate-500">{label}</div><div className={`mt-1 text-xl font-black ${color}`}>{value}</div></div>)}
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <ChartCard title="15 เขตที่มี Built-up cover สูง" note="สัดส่วนพิกเซลที่จำแนกเป็นคลาส built ในพื้นที่ที่มีข้อมูล">
                    <BarChart data={coverRanking} layout="vertical" margin={{ left: 12, right: 18 }}><CartesianGrid stroke="#1e293b" horizontal={false} /><XAxis type="number" unit="%" stroke="#64748b" fontSize={9} /><YAxis type="category" dataKey="district_name" width={82} stroke="#94a3b8" fontSize={9} /><Tooltip formatter={(value) => formatUrbanPercent(Number(value))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} /><Bar dataKey="built_cover_pct" radius={[0, 4, 4, 0]}>{coverRanking.map((row) => <Cell key={row.district_id} fill={builtCoverColor(row.built_cover_pct)} />)}</Bar></BarChart>
                  </ChartCard>
                  <ChartCard title="15 เขตที่มีพื้นที่สิ่งปลูกสร้างเพิ่มสูง" note={`สัดส่วนพื้นที่ที่เปลี่ยนจากคลาสอื่นเป็น built ระหว่าง ${baselineYear}–${year}`}>
                    <BarChart data={expansionRanking} layout="vertical" margin={{ left: 12, right: 18 }}><CartesianGrid stroke="#1e293b" horizontal={false} /><XAxis type="number" unit="%" stroke="#64748b" fontSize={9} /><YAxis type="category" dataKey="district_name" width={82} stroke="#94a3b8" fontSize={9} /><Tooltip formatter={(value) => formatUrbanPercent(Number(value))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} /><Bar dataKey="built_gain_pct" fill="#f97316" radius={[0, 4, 4, 0]} /></BarChart>
                  </ChartCard>
                  <ChartCard title="แหล่งที่มาของ Built-up ใหม่" note="แยกการเปลี่ยนจากพื้นที่สีเขียวและพื้นที่โล่ง เพื่อไม่เหมารวมว่า expansion ทุกชนิดมีผลเหมือนกัน">
                    <BarChart data={conversionRows} layout="vertical" margin={{ left: 12, right: 18 }}><CartesianGrid stroke="#1e293b" horizontal={false} /><XAxis type="number" unit="%" stroke="#64748b" fontSize={9} /><YAxis type="category" dataKey="district" width={82} stroke="#94a3b8" fontSize={9} /><Tooltip formatter={(value) => formatUrbanPercent(Number(value))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="สีเขียว → built" fill="#ef4444" radius={[0, 3, 3, 0]} /><Bar dataKey="พื้นที่โล่ง → built" fill="#facc15" radius={[0, 3, 3, 0]} /></BarChart>
                  </ChartCard>
                  <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                    <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><h2 className="text-xs font-bold text-amber-100">อ่านผลอย่างระมัดระวัง</h2>
                      <ul className="mt-3 space-y-3 text-[10px] leading-relaxed text-amber-100/70">
                        <li>Built-up cover คือผลจำแนกคลาส built จากภาพ Sentinel-2 ไม่ใช่พื้นที่อาคารตามทะเบียน</li>
                        <li>ค่าเพิ่มและลดเป็น gross transition ส่วนค่าจุดเปอร์เซ็นต์เป็นการเปลี่ยนแปลงสุทธิ จึงตอบคนละคำถาม</li>
                        <li>NDBI เป็นสัญญาณเชิงสเปกตรัมที่ใช้ช่วยตรวจสอบได้ แต่ไม่ใช้แปลงเป็นไร่หรือยืนยันการก่อสร้างในหน้านี้</li>
                        <li>ควรตรวจภาพความละเอียดสูงหรือข้อมูลภาคสนามก่อนใช้ตัดสินใจระดับแปลง</li>
                      </ul>
                    </div></div>
                  </section>
                </div>
              </div>
            )}

            {viewMode === "table" && (
              <div className="h-full p-4 sm:p-5"><DistrictDataTable
                features={data.geojson.features} columns={TABLE_COLUMNS}
                getRowData={(p) => ({ name: p.district_name, built_cover_pct: p.built_cover_pct, built_area_rai: p.built_area_rai, built_change_pp: p.built_change_pp, built_gain_pct: p.built_gain_pct, built_loss_pct: p.built_loss_pct, green_to_built_pct: p.green_to_built_pct, bare_to_built_pct: p.bare_to_built_pct, stable_built_pct: p.stable_built_pct, confidence_pct: p.confidence_pct, coverage_pct: p.coverage_pct })}
                csvFilename={`bangkok_built_up_${baselineYear}_${year}`} filterDistrict={activeDistrict} onDistrictChange={setActiveDistrict} districts={data.rows.map((row) => row.district_name)} accentColor="orange" dataSource={data.summary.source}
                contextNote={`${baselineYear} → ${year} · Dynamic World 10 ม. · confidence ≥ 45% · built class`} expectedRows={activeDistrict === ALL_DISTRICTS ? 50 : 1}
              /></div>
            )}

            {viewMode === "guide" && (
              <PlainLanguageGuide module="builtup" accent="orange" records={displayedRows} year={year} activeArea={activeDistrict} compareMode compareYear={baselineYear} dataSource={data.summary.source} dataQuality={data.summary.dataQuality} metricKey="built_cover_pct" metricLabel="สัดส่วนพื้นที่สิ่งปลูกสร้าง" unit="%" decimals={2} nameKey="district_name" extraSummary={[
                `เขตที่มี Built-up cover สูงสุด: ${data.summary.highestBuiltCoverDistrict ?? "ไม่มีข้อมูล"}`,
                `เขตที่มี built gain สูงสุด: ${data.summary.highestBuiltGainDistrict ?? "ไม่มีข้อมูล"}`,
                `เขตที่มีการเปลี่ยนจากพื้นที่สีเขียวเป็นสิ่งปลูกสร้างสูงสุด: ${data.summary.highestGreenConversionDistrict ?? "ไม่มีข้อมูล"}`,
              ]} />
            )}
          </>}
        </div>
      </main>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactElement }) {
  return (
    <section className="rounded-xl bg-slate-900/60 p-4">
      <h2 className="text-xs font-bold">{title}</h2>
      <p className="mt-1 text-[10px] text-slate-500">{note}</p>
      <div className="mt-4 h-[380px]"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </section>
  );
}
