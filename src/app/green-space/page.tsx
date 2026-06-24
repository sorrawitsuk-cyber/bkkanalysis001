/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDistrictUrlState } from "@/lib/url-selection-state";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  CalendarRange,
  Download,
  FileText,
  Layers3,
  RefreshCw,
  Trees,
  MapPin,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import TreeCoverSidebar from "@/components/gee/TreeCoverSidebar";
import MapControlPanel from "@/components/map/MapControlPanel";
import InteractiveDistrictPanel from "@/components/map/InteractiveDistrictPanel";
import ResponsiveMapAside from "@/components/map/ResponsiveMapAside";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { buildProvenance, getPolicySafeInsight } from "@/lib/data-provenance";
import {
  TREE_COVER_MIN_YEAR,
  formatTreeChange,
  formatTreePercent,
  formatTreeRai,
  treeCoverColor,
  type TreeCoverResponse,
} from "@/lib/tree-cover";

const TreeCoverMap = dynamic(() => import("@/components/map/TreeCoverMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const ALL_DISTRICTS = "ทั้งหมด";
const CURRENT_YEAR = new Date().getUTCFullYear();

const TABLE_COLUMNS: ColDef[] = [
  { key: "name", label: "เขต", sortable: true },
  { key: "tree_cover_pct", label: "Tree Cover", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#16a34a" },
  { key: "tree_cover_rai", label: "พื้นที่เรือนยอดไม้", unit: "ไร่", format: (value) => Math.round(Number(value)).toLocaleString("th-TH"), heatmap: true, heatmapHex: "#22c55e" },
  { key: "tree_cover_change_pp", label: "เปลี่ยนจากปีฐาน", unit: "จุด%", format: (value) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}`, heatmap: true, heatmapHex: "#4ade80" },
  { key: "tree_gain_pct", label: "พื้นที่ต้นไม้เพิ่ม", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#4ade80", hideable: true },
  { key: "tree_loss_pct", label: "พื้นที่ต้นไม้สูญเสีย", unit: "%", format: (value) => Number(value).toFixed(2), heatmap: true, heatmapHex: "#ef4444", heatmapInvert: true },
  { key: "stable_tree_pct", label: "ต้นไม้คงเดิม", unit: "%", format: (value) => Number(value).toFixed(2), hideable: true },
  { key: "confidence_pct", label: "ความเชื่อมั่นเฉลี่ย", unit: "%", format: (value) => Number(value).toFixed(1), hideable: true },
  { key: "coverage_pct", label: "พื้นที่ที่มีข้อมูล", unit: "%", format: (value) => Number(value).toFixed(1), hideable: true },
];

export default function GreenSpacePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [baselineYear, setBaselineYear] = useState(2020);
  const [activeDistrict, setActiveDistrict] = useDistrictUrlState(ALL_DISTRICTS);
  const [mode, setMode] = useState<"cover" | "change">("cover");
  const [data, setData] = useState<TreeCoverResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rasterVisible, setRasterVisible] = useState(true);
  const [opacity, setOpacity] = useState(0.72);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tree-cover?year=${year}&baseline=${baselineYear}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดข้อมูล Tree Cover ได้");
      setData(payload);
    } catch (loadError: any) {
      setError(loadError?.message ?? "ไม่สามารถโหลดข้อมูล Tree Cover ได้");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [baselineYear, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (baselineYear >= year) setBaselineYear(Math.max(TREE_COVER_MIN_YEAR, year - 1));
  }, [baselineYear, year]);

  const activeRow = activeDistrict === ALL_DISTRICTS
    ? null
    : data?.rows.find((row) => row.district_name === activeDistrict) ?? null;
  const panelProvenance = buildProvenance({
    summary: data?.summary,
    source: data?.summary.source,
    period: data?.period.currentLabel ?? `ปี ${year}`,
    methodologyId: "tree-cover-district-v1",
    qualityFlags: [`Dynamic World trees class · confidence ≥ 45%`, `เทียบปีฐาน ${baselineYear}`],
  });
  const panelInsight = getPolicySafeInsight({
    selected: activeDistrict !== ALL_DISTRICTS,
    title: activeDistrict,
    metricLabel: "Tree Cover",
    primaryValue: activeRow?.tree_cover_pct,
    averageValue: data?.summary.treeCoverPct,
    higherIsConcern: false,
    provenance: panelProvenance,
  });
  const displayedRows = activeRow ? [activeRow] : data?.rows ?? [];
  const rankingRows = useMemo(
    () => [...(data?.rows ?? [])].sort((a, b) => (b.tree_cover_pct ?? -1) - (a.tree_cover_pct ?? -1)).slice(0, 15),
    [data?.rows],
  );
  const changeRows = useMemo(
    () => [...(data?.rows ?? [])]
      .sort((a, b) => Math.abs(b.tree_cover_change_pp ?? 0) - Math.abs(a.tree_cover_change_pp ?? 0))
      .slice(0, 15),
    [data?.rows],
  );
  const gainLossRows = useMemo(
    () => [...(data?.rows ?? [])]
      .sort((a, b) => (b.tree_loss_pct ?? -1) - (a.tree_loss_pct ?? -1))
      .slice(0, 12)
      .map((row) => ({
        district: row.district_name,
        เพิ่ม: row.tree_gain_pct ?? 0,
        สูญเสีย: row.tree_loss_pct ?? 0,
      })),
    [data?.rows],
  );

  const csvRows = (data?.rows ?? []).map((row) => [
    row.district_name,
    row.tree_cover_pct,
    row.tree_cover_rai,
    row.tree_cover_change_pp,
    row.tree_gain_pct,
    row.tree_loss_pct,
    row.confidence_pct,
    row.coverage_pct,
  ]);
  const csvHeaders = ["เขต", "Tree Cover (%)", "พื้นที่เรือนยอดไม้ (ไร่)", "เปลี่ยนจากปีฐาน (จุด%)", "ต้นไม้เพิ่ม (%)", "ต้นไม้สูญเสีย (%)", "ความเชื่อมั่น (%)", "พื้นที่มีข้อมูล (%)"];
  const reportData: PDFReportData = {
    title: "รายงานเรือนยอดไม้ในกรุงเทพมหานคร",
    subtitle: "Google Dynamic World V1 · Trees class",
    source: data?.summary.source ?? "Google Dynamic World V1",
    period: data?.period.currentLabel ?? `ปี ${year}`,
    layer: mode === "cover" ? "Tree Cover" : "Tree Cover Change",
    district: activeDistrict,
    kpis: [
      { label: "Tree Cover เฉลี่ย", value: formatTreePercent(activeRow?.tree_cover_pct ?? data?.summary.treeCoverPct) },
      { label: "พื้นที่เรือนยอดไม้", value: formatTreeRai(activeRow?.tree_cover_rai ?? data?.summary.treeCoverRai) },
      { label: `เปลี่ยนจากปี ${baselineYear}`, value: formatTreeChange(activeRow?.tree_cover_change_pp ?? data?.summary.treeCoverChangePp) },
      { label: "เขต Tree Cover สูงสุด", value: data?.summary.highestTreeCoverDistrict ?? "ไม่มีข้อมูล" },
    ],
    rankingHeaders: ["เขต", "Tree Cover (%)"],
    rankingRows: rankingRows.map((row) => [row.district_name, row.tree_cover_pct]),
  };

  const legend = mode === "cover"
    ? [
        ["#713f12", "< 5%", "น้อยมาก"],
        ["#a16207", "5-10%", "น้อย"],
        ["#65a30d", "10-20%", "ปานกลาง"],
        ["#16a34a", "20-30%", "มาก"],
        ["#047857", "> 30%", "มากที่สุด"],
      ]
    : [
        ["#b91c1c", "< -3 จุด%", "ลดลงมาก"],
        ["#f97316", "-3 ถึง -1", "ลดลง"],
        ["#cbd5e1", "-1 ถึง +1", "ใกล้เคียงเดิม"],
        ["#4ade80", "+1 ถึง +3", "เพิ่มขึ้น"],
        ["#047857", "> +3 จุด%", "เพิ่มขึ้นมาก"],
      ];

  const districts = useMemo(() =>
    [...(data?.rows ?? [])]
      .map((row) => row.district_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "th")),
    [data?.rows]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-50">
      <TreeCoverSidebar
        data={data}
        loading={loading}
        activeDistrict={activeDistrict}
        mode={mode}
        onDistrictSelect={setActiveDistrict}
        onModeChange={setMode}
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
            <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest animate-pulse ml-1">
              กำลังโหลด…
            </span>
          )}
          <div className="flex-1" />
          {!loading && data && viewMode !== "map" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_tree_cover_${baselineYear}_${year}`)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                type="button"
                onClick={() => printReport(reportData)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> กำลังจำแนกเรือนยอดไม้จาก Dynamic World
            </div>
          ) : error || !data ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">
              {error ?? "ไม่มีข้อมูล Tree Cover"}
            </div>
          ) : (
            <>
              {viewMode === "map" && (
                <div className="flex h-full">
                  <div className="relative min-w-0 flex-1">
                    <TreeCoverMap
                      geojsonData={data.geojson}
                      rasterUrl={mode === "cover" ? data.rasters.current.urlFormat : data.rasters.change.urlFormat}
                      rasterVisible={rasterVisible}
                      mode={mode}
                      activeDistrict={activeDistrict}
                      opacity={opacity}
                      baseMap={baseMap}
                      onDistrictSelect={(districtName) => {
                        setActiveDistrict(districtName);
                        setMobileControlsOpen(true);
                      }}
                    />
                    
                    {/* Floating KPI cards */}
                    <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
                      {[
                        ["Tree Cover", formatTreePercent(activeRow?.tree_cover_pct ?? data.summary.treeCoverPct)],
                        ["พื้นที่เรือนยอดไม้", formatTreeRai(activeRow?.tree_cover_rai ?? data.summary.treeCoverRai)],
                        [`เปลี่ยนจาก ${baselineYear}`, formatTreeChange(activeRow?.tree_cover_change_pp ?? data.summary.treeCoverChangePp)],
                        ["พื้นที่มีข้อมูล", formatTreePercent(activeRow?.coverage_pct ?? data.summary.averageCoveragePct)],
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
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
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
                        <p className="mt-1 text-[10px] leading-snug text-slate-400">{mode === "cover" ? "สัดส่วนเรือนยอดไม้รายเขต" : "การเปลี่ยนแปลงเทียบปีฐาน"}</p>
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

                  <ResponsiveMapAside open={mobileControlsOpen} onOpenChange={setMobileControlsOpen} title="ตัวกรองพื้นที่สีเขียว" subtitle={`${baselineYear} → ${year}`}>
                    <div className="flex min-h-full flex-col gap-3">
                      <InteractiveDistrictPanel
                        accent="emerald"
                        selected={activeDistrict !== ALL_DISTRICTS}
                        districtName={activeDistrict !== ALL_DISTRICTS ? activeDistrict : undefined}
                        title={activeDistrict !== ALL_DISTRICTS ? activeDistrict : "เลือกเขตบนแผนที่"}
                        subtitle={activeDistrict !== ALL_DISTRICTS ? "สรุปเรือนยอดไม้ของพื้นที่ที่คลิก" : "คลิก polygon เขตเพื่อดูสถิติเรือนยอดไม้"}
                        onClear={() => setActiveDistrict(ALL_DISTRICTS)}
                        metrics={[
                          { label: "Tree Cover", value: formatTreePercent(activeRow?.tree_cover_pct), rawValue: activeRow?.tree_cover_pct, color: "#22c55e" },
                          { label: "พื้นที่เรือนยอด", value: formatTreeRai(activeRow?.tree_cover_rai), rawValue: activeRow?.tree_cover_rai, color: "#4ade80" },
                          { label: "เปลี่ยนจากปีฐาน", value: formatTreeChange(activeRow?.tree_cover_change_pp), rawValue: activeRow?.tree_cover_change_pp, color: "#facc15" },
                          { label: "Tree loss", value: formatTreePercent(activeRow?.tree_loss_pct), rawValue: activeRow?.tree_loss_pct, color: "#ef4444" },
                        ]}
                        provenance={panelProvenance}
                        insight={panelInsight}
                      />

                      <MapControlPanel
                        accent="emerald"
                        granularity="district"
                        onGranularityChange={() => undefined}
                        showGranularity={false}
                        mapMode={mode}
                        mapModes={[
                          { value: "cover", label: "เรือนยอดไม้ (Tree Cover)", description: "แสดงสัดส่วนพิกเซลที่จำแนกเป็นต้นไม้รายเขต" },
                          { value: "change", label: "การเปลี่ยนแปลง", description: "แสดงการเปลี่ยนแปลงของต้นไม้เปรียบเทียบกับปีฐาน" },
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
                        currentLayer={mode === "cover" ? "Tree Cover" : `การเปลี่ยนแปลงเรือนยอดไม้ (${baselineYear} → ${year})`}
                        currentPeriod={data?.period.currentLabel ?? `ปี ${year}`}
                        dataSource={data?.summary.source ?? "Google Dynamic World V1"}
                        interactionHint="วางเมาส์บนเขตเพื่ออ่านค่าและสัดส่วน"
                      />

                      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                          <span>แสดงภาพถ่ายเรือนยอดไม้</span>
                          <button
                            type="button"
                            onClick={() => setRasterVisible((v) => !v)}
                            className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            {rasterVisible ? "แสดงอยู่" : "ซ่อนอยู่"}
                          </button>
                        </div>
                      </div>

                      <MonthYearPicker
                        year={year}
                        month={null}
                        minYear={TREE_COVER_MIN_YEAR}
                        maxYear={CURRENT_YEAR}
                        onYearChange={setYear}
                        onMonthChange={() => undefined}
                        accentColor="emerald"
                        compareMode={true}
                        compareYear={baselineYear}
                        onCompareYearChange={setBaselineYear}
                        onCompareModeChange={() => undefined}
                      />

                      <ExportPanel
                        accentColor="emerald"
                        csvFilename={`bangkok_tree_cover_${baselineYear}_${year}`}
                        csvHeaders={csvHeaders}
                        csvRows={csvRows}
                        reportData={reportData}
                      />
                    </div>
                  </ResponsiveMapAside>
                </div>
              )}

              {viewMode === "stats" && (
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["Tree Cover เฉลี่ย", formatTreePercent(data.summary.treeCoverPct), "text-emerald-300"],
                      ["พื้นที่เรือนยอดไม้รวม", formatTreeRai(data.summary.treeCoverRai), "text-green-300"],
                      [`เปลี่ยนจาก ${baselineYear}`, formatTreeChange(data.summary.treeCoverChangePp), (data.summary.treeCoverChangePp ?? 0) >= 0 ? "text-green-300" : "text-red-300"],
                      ["ความเชื่อมั่นเฉลี่ย", formatTreePercent(data.summary.averageConfidencePct), "text-cyan-300"],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-xl bg-slate-900/70 p-4">
                        <div className="text-[10px] text-slate-500">{label}</div>
                        <div className={`mt-1 text-xl font-black ${color}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-xl bg-slate-900/60 p-4">
                      <h2 className="text-xs font-bold">15 เขตที่มี Tree Cover สูง</h2>
                      <p className="mt-1 text-[10px] text-slate-500">สัดส่วนพิกเซลที่จำแนกเป็นต้นไม้ในพื้นที่ที่มีข้อมูล</p>
                      <div className="mt-4 h-[380px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rankingRows} layout="vertical" margin={{ left: 12, right: 18 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" unit="%" stroke="#64748b" fontSize={9} />
                            <YAxis type="category" dataKey="district_name" width={82} stroke="#94a3b8" fontSize={9} />
                            <Tooltip formatter={(value) => formatTreePercent(Number(value))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                            <Bar dataKey="tree_cover_pct" radius={[0, 4, 4, 0]}>
                              {rankingRows.map((row) => <Cell key={row.district_id} fill={treeCoverColor(row.tree_cover_pct)} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                    <section className="rounded-xl bg-slate-900/60 p-4">
                      <h2 className="text-xs font-bold">Tree gain และ tree loss</h2>
                      <p className="mt-1 text-[10px] text-slate-500">12 เขตที่มีสัดส่วนการสูญเสียสูงสุดเทียบปีฐาน</p>
                      <div className="mt-4 h-[380px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={gainLossRows} layout="vertical" margin={{ left: 12, right: 18 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" unit="%" stroke="#64748b" fontSize={9} />
                            <YAxis type="category" dataKey="district" width={82} stroke="#94a3b8" fontSize={9} />
                            <Tooltip formatter={(value) => formatTreePercent(Number(value))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="เพิ่ม" fill="#4ade80" radius={[0, 3, 3, 0]} />
                            <Bar dataKey="สูญเสีย" fill="#ef4444" radius={[0, 3, 3, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  </div>
                  <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <div>
                        <h2 className="text-xs font-bold text-amber-100">วิธีอ่านผล</h2>
                        <p className="mt-1 max-w-4xl text-[10px] leading-relaxed text-amber-100/70">
                          Tree Cover ในหน้านี้หมายถึงพื้นที่ที่ Dynamic World จำแนกเป็นคลาส trees จากภาพ Sentinel-2 ไม่ใช่จำนวนต้นไม้
                          และไม่ครอบคลุมสนามหญ้า พืชเกษตร หรือพุ่มไม้ที่ระบบจำแนกเป็นคลาสอื่น
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {viewMode === "table" && (
                <div className="h-full p-4 sm:p-5">
                  <DistrictDataTable
                    features={data.geojson.features}
                    columns={TABLE_COLUMNS}
                    getRowData={(properties) => ({
                      name: properties.district_name,
                      tree_cover_pct: properties.tree_cover_pct,
                      tree_cover_rai: properties.tree_cover_rai,
                      tree_cover_change_pp: properties.tree_cover_change_pp,
                      tree_gain_pct: properties.tree_gain_pct,
                      tree_loss_pct: properties.tree_loss_pct,
                      stable_tree_pct: properties.stable_tree_pct,
                      confidence_pct: properties.confidence_pct,
                      coverage_pct: properties.coverage_pct,
                    })}
                    csvFilename={`bangkok_tree_cover_${baselineYear}_${year}`}
                    filterDistrict={activeDistrict}
                    onDistrictChange={setActiveDistrict}
                    districts={data.rows.map((row) => row.district_name)}
                    accentColor="emerald"
                    dataSource={data.summary.source}
                    contextNote={`${baselineYear} → ${year} · Dynamic World 10 ม. · confidence ≥ 45% · trees class`}
                    expectedRows={activeDistrict === ALL_DISTRICTS ? 50 : 1}
                  />
                </div>
              )}

              {viewMode === "guide" && (
                <PlainLanguageGuide
                  module="treecover"
                  accent="emerald"
                  records={displayedRows}
                  year={year}
                  activeArea={activeDistrict}
                  compareMode
                  compareYear={baselineYear}
                  dataSource={data.summary.source}
                  dataQuality={data.summary.dataQuality}
                  metricKey="tree_cover_pct"
                  metricLabel="สัดส่วนเรือนยอดไม้"
                  unit="%"
                  decimals={2}
                  nameKey="district_name"
                  extraSummary={[
                    `เขตที่มี Tree Cover สูงสุด: ${data.summary.highestTreeCoverDistrict ?? "ไม่มีข้อมูล"}`,
                    `เขตที่สูญเสีย Tree Cover สูงสุด: ${data.summary.highestTreeLossDistrict ?? "ไม่มีข้อมูล"}`,
                    `พื้นที่ที่มีข้อมูลเฉลี่ย: ${formatTreePercent(data.summary.averageCoveragePct)}`,
                  ]}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
