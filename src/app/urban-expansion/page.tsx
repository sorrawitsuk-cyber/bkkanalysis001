/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CalendarRange, Download, FileText, Layers3, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import UrbanExpansionSidebar from "@/components/gee/UrbanExpansionSidebar";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-50">
      <UrbanExpansionSidebar data={data} loading={loading} activeDistrict={activeDistrict} mode={mode} onDistrictSelect={setActiveDistrict} onModeChange={setMode} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-2.5">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="orange" />
          <div className="hidden h-5 w-px bg-slate-800 sm:block" />
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500">ปีข้อมูล
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white outline-none focus:border-orange-400">
              {Array.from({ length: CURRENT_YEAR - URBAN_EXPANSION_MIN_YEAR + 1 }, (_, index) => CURRENT_YEAR - index).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500">ปีฐาน
            <select value={baselineYear} onChange={(event) => setBaselineYear(Number(event.target.value))} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white outline-none focus:border-orange-400">
              {Array.from({ length: Math.max(1, year - URBAN_EXPANSION_MIN_YEAR) }, (_, index) => year - 1 - index).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500 md:hidden">เขต
            <select value={activeDistrict} onChange={(event) => setActiveDistrict(event.target.value)} className="max-w-[118px] rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white outline-none focus:border-orange-400">
              <option value={ALL_DISTRICTS}>ทุกเขต</option>
              {(data?.rows ?? []).map((row) => <option key={row.district_id} value={row.district_name}>{row.district_name}</option>)}
            </select>
          </label>
          <button onClick={loadData} disabled={loading} className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-[10px] text-slate-400 hover:text-white disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> โหลดใหม่</button>
          <div className="flex-1" />
          {!loading && data && <div className="flex items-center gap-1.5">
            <button onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_built_up_${baselineYear}_${year}`)} className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-[10px] text-slate-400 hover:text-white"><Download className="h-3 w-3" /> CSV</button>
            <button onClick={() => printReport(reportData)} className="flex items-center gap-1.5 rounded-md border border-orange-700/60 bg-orange-950/40 px-2 py-1.5 text-[10px] text-orange-300 hover:text-white"><FileText className="h-3 w-3" /> PDF</button>
          </div>}
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />กำลังจำแนกพื้นที่สิ่งปลูกสร้างจาก Dynamic World</div>
          ) : error || !data ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">{error ?? "ไม่มีข้อมูลพื้นที่สิ่งปลูกสร้าง"}</div>
          ) : <>
            {viewMode === "map" && (
              <div className="flex h-full min-h-[560px]">
                <div className="relative min-w-0 flex-1">
                  <UrbanExpansionMap geojsonData={data.geojson} rasterUrl={mode === "cover" ? data.rasters.current.urlFormat : data.rasters.change.urlFormat} rasterVisible={rasterVisible} mode={mode} activeDistrict={activeDistrict} opacity={opacity} baseMap={baseMap} onDistrictSelect={setActiveDistrict} />
                  <div className="pointer-events-none absolute left-4 top-4 z-[1000] grid max-w-3xl grid-cols-2 gap-2 lg:grid-cols-4">
                    {[
                      ["Built-up cover", formatUrbanPercent(activeRow?.built_cover_pct ?? data.summary.builtCoverPct)],
                      ["พื้นที่สิ่งปลูกสร้าง", formatUrbanRai(activeRow?.built_area_rai ?? data.summary.builtAreaRai)],
                      [`เปลี่ยนจาก ${baselineYear}`, formatUrbanChange(activeRow?.built_change_pp ?? data.summary.builtChangePp)],
                      ["สีเขียว → built", formatUrbanPercent(activeRow?.green_to_built_pct ?? data.summary.greenToBuiltPct)],
                    ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-950/90 p-3 shadow-lg"><div className="text-[9px] text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-slate-100">{value}</div></div>)}
                  </div>
                  <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] rounded-lg bg-slate-950/95 p-3 shadow-xl">
                    <div className="mb-2 text-[10px] font-bold text-slate-300">{mode === "cover" ? "Built-up cover รายเขต" : "การเปลี่ยนแปลงเทียบปีฐาน"}</div>
                    {legend.map(([color, range, label]) => <div key={range} className="grid grid-cols-[12px_78px_1fr] items-center gap-2 py-0.5 text-[9px] text-slate-400"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} /><span>{range}</span><span>{label}</span></div>)}
                  </div>
                </div>
                <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-slate-800 bg-slate-900/70 p-4 xl:block">
                  <section><h2 className="flex items-center gap-2 text-xs font-bold"><Layers3 className="h-4 w-4 text-orange-400" />การแสดงผลแผนที่</h2>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => setMode("cover")} className={`rounded-lg border p-2 text-[10px] ${mode === "cover" ? "border-orange-400 bg-orange-500/10 text-orange-200" : "border-slate-700 text-slate-400"}`}>สถานะปัจจุบัน</button>
                      <button onClick={() => setMode("change")} className={`rounded-lg border p-2 text-[10px] ${mode === "change" ? "border-orange-400 bg-orange-500/10 text-orange-200" : "border-slate-700 text-slate-400"}`}>การขยายตัว</button>
                    </div>
                  </section>
                  <section><div className="flex items-center justify-between text-[10px] text-slate-400"><span>ชั้นข้อมูลรายพิกเซล</span><button onClick={() => setRasterVisible((value) => !value)} className="text-orange-300">{rasterVisible ? "เปิด" : "ปิด"}</button></div><input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="mt-3 w-full accent-orange-500" /></section>
                  <section><div className="text-[10px] text-slate-400">แผนที่ฐาน</div><div className="mt-2 flex flex-wrap gap-1">{(["dark", "light", "satellite", "streets", "none"] as const).map((item) => <button key={item} onClick={() => setBaseMap(item)} className={`rounded-md px-2 py-1 text-[9px] ${baseMap === item ? "bg-orange-600 text-white" : "bg-slate-800 text-slate-400"}`}>{item}</button>)}</div></section>
                  <section className="rounded-lg bg-slate-950/60 p-3"><h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300"><CalendarRange className="h-3.5 w-3.5 text-orange-400" />ช่วงเปรียบเทียบ</h2><p className="mt-2 text-[9px] leading-relaxed text-slate-500">{data.period.baselineLabel} → {data.period.currentLabel}</p><p className="mt-2 text-[9px] leading-relaxed text-slate-500">การเปลี่ยนแปลงใช้เฉพาะพิกเซลที่มีข้อมูลผ่านเกณฑ์ทั้งสองปี</p></section>
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
