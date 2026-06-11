/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  CalendarRange,
  Download,
  FileText,
  Layers3,
  RefreshCw,
  Trees,
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
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
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
  const [activeDistrict, setActiveDistrict] = useState(ALL_DISTRICTS);
  const [mode, setMode] = useState<"cover" | "change">("cover");
  const [data, setData] = useState<TreeCoverResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rasterVisible, setRasterVisible] = useState(true);
  const [opacity, setOpacity] = useState(0.72);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tree-cover?year=${year}&baseline=${baselineYear}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดข้อมูล Tree Cover ได้");
      setData(payload);
      setActiveDistrict(ALL_DISTRICTS);
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
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-2.5">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="emerald" />
          <div className="hidden h-5 w-px bg-slate-800 sm:block" />
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
            ปีข้อมูล
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white outline-none focus:border-emerald-400"
            >
              {Array.from({ length: CURRENT_YEAR - TREE_COVER_MIN_YEAR + 1 }, (_, index) => CURRENT_YEAR - index).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
            ปีฐาน
            <select
              value={baselineYear}
              onChange={(event) => setBaselineYear(Number(event.target.value))}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white outline-none focus:border-emerald-400"
            >
              {Array.from({ length: Math.max(1, year - TREE_COVER_MIN_YEAR) }, (_, index) => year - 1 - index).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500 md:hidden">
            เขต
            <select
              value={activeDistrict}
              onChange={(event) => setActiveDistrict(event.target.value)}
              className="max-w-[118px] rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white outline-none focus:border-emerald-400"
            >
              <option value={ALL_DISTRICTS}>ทุกเขต</option>
              {(data?.rows ?? []).map((row) => (
                <option key={row.district_id} value={row.district_name}>{row.district_name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-[10px] text-slate-400 hover:text-white disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> โหลดใหม่
          </button>
          <div className="flex-1" />
          {!loading && data && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_tree_cover_${baselineYear}_${year}`)}
                className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-[10px] text-slate-400 hover:text-white"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                type="button"
                onClick={() => printReport(reportData)}
                className="flex items-center gap-1.5 rounded-md border border-emerald-700/60 bg-emerald-950/40 px-2 py-1.5 text-[10px] text-emerald-300 hover:text-white"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </header>

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
                <div className="flex h-full min-h-[560px]">
                  <div className="relative min-w-0 flex-1">
                    <TreeCoverMap
                      geojsonData={data.geojson}
                      rasterUrl={mode === "cover" ? data.rasters.current.urlFormat : data.rasters.change.urlFormat}
                      rasterVisible={rasterVisible}
                      mode={mode}
                      activeDistrict={activeDistrict}
                      opacity={opacity}
                      baseMap={baseMap}
                      onDistrictSelect={setActiveDistrict}
                    />
                    <div className="pointer-events-none absolute left-4 top-4 grid max-w-3xl grid-cols-2 gap-2 lg:grid-cols-4">
                      {[
                        ["Tree Cover", formatTreePercent(activeRow?.tree_cover_pct ?? data.summary.treeCoverPct)],
                        ["พื้นที่เรือนยอดไม้", formatTreeRai(activeRow?.tree_cover_rai ?? data.summary.treeCoverRai)],
                        [`เปลี่ยนจาก ${baselineYear}`, formatTreeChange(activeRow?.tree_cover_change_pp ?? data.summary.treeCoverChangePp)],
                        ["พื้นที่มีข้อมูล", formatTreePercent(activeRow?.coverage_pct ?? data.summary.averageCoveragePct)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-slate-950/90 p-3 shadow-lg">
                          <div className="text-[9px] text-slate-500">{label}</div>
                          <div className="mt-1 text-sm font-black text-slate-100">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-slate-950/95 p-3 shadow-xl">
                      <div className="mb-2 text-[10px] font-bold text-slate-300">{mode === "cover" ? "สัดส่วนเรือนยอดไม้รายเขต" : "การเปลี่ยนแปลงเทียบปีฐาน"}</div>
                      {legend.map(([color, range, label]) => (
                        <div key={range} className="grid grid-cols-[12px_70px_1fr] items-center gap-2 py-0.5 text-[9px] text-slate-400">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                          <span>{range}</span>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-slate-800 bg-slate-900/70 p-4 xl:block">
                    <section>
                      <h2 className="flex items-center gap-2 text-xs font-bold"><Layers3 className="h-4 w-4 text-emerald-400" /> การแสดงผลแผนที่</h2>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setMode("cover")} className={`rounded-lg border p-2 text-[10px] ${mode === "cover" ? "border-emerald-400 bg-emerald-500/10 text-emerald-200" : "border-slate-700 text-slate-400"}`}>Tree Cover</button>
                        <button type="button" onClick={() => setMode("change")} className={`rounded-lg border p-2 text-[10px] ${mode === "change" ? "border-emerald-400 bg-emerald-500/10 text-emerald-200" : "border-slate-700 text-slate-400"}`}>การเปลี่ยนแปลง</button>
                      </div>
                    </section>
                    <section>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>ชั้นข้อมูลรายพิกเซล</span>
                        <button type="button" onClick={() => setRasterVisible((value) => !value)} className="text-emerald-300">{rasterVisible ? "เปิด" : "ปิด"}</button>
                      </div>
                      <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="mt-3 w-full accent-emerald-500" />
                    </section>
                    <section>
                      <div className="text-[10px] text-slate-400">แผนที่ฐาน</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(["dark", "light", "satellite", "streets", "none"] as const).map((item) => (
                          <button type="button" key={item} onClick={() => setBaseMap(item)} className={`rounded-md px-2 py-1 text-[9px] ${baseMap === item ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`}>{item}</button>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-lg bg-slate-950/60 p-3">
                      <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300"><CalendarRange className="h-3.5 w-3.5 text-emerald-400" /> ช่วงเปรียบเทียบ</h2>
                      <p className="mt-2 text-[9px] leading-relaxed text-slate-500">{data.period.baselineLabel} → {data.period.currentLabel}</p>
                      <p className="mt-2 text-[9px] leading-relaxed text-slate-500">ใช้เฉพาะพิกเซลที่มีข้อมูลทั้งสองช่วงในการคำนวณการเพิ่มและสูญเสีย</p>
                    </section>
                  </aside>
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
