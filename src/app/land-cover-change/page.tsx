/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CalendarRange,
  Database,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Trees,
  MapPin,
  X,
  Download,
  FileText,
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
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import MapControlPanel from "@/components/map/MapControlPanel";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import SidebarFooter from "@/components/gee/SidebarFooter";
import MapSkeleton from "@/components/ui/MapSkeleton";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import {
  LAND_COVER_MIN_YEAR,
  conversionColor,
  formatPercent,
  formatPercentagePoint,
  type LandCoverLayer,
  type LandCoverResponse,
} from "@/lib/land-cover";

const LandCoverChangeMap = dynamic(() => import("@/components/map/LandCoverChangeMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const LAYER_OPTIONS: Array<{ value: LandCoverLayer; label: string; description: string }> = [
  { value: "change", label: "การเปลี่ยนแปลง", description: "แสดงประเภท transition ระหว่างสองปี" },
  { value: "current", label: "ปีปัจจุบัน", description: "แสดงประเภทสิ่งปกคลุมดินของปีที่เลือก" },
  { value: "baseline", label: "ปีฐาน", description: "แสดงประเภทสิ่งปกคลุมดินของปีเปรียบเทียบ" },
];

const TABLE_COLUMNS: ColDef[] = [
  { key: "name", label: "เขต", sortable: true },
  { key: "green_to_built_pct", label: "สีเขียว → สิ่งปลูกสร้าง", unit: "% พื้นที่เปรียบเทียบ", format: (v) => formatPercent(v), heatmap: true, heatmapHex: "#ef4444" },
  { key: "green_change_pp", label: "สีเขียวเปลี่ยนสุทธิ", unit: "จุด%", format: (v) => formatPercentagePoint(v), heatmap: true, heatmapHex: "#22c55e" },
  { key: "built_change_pp", label: "สิ่งปลูกสร้างเปลี่ยนสุทธิ", unit: "จุด%", format: (v) => formatPercentagePoint(v), heatmap: true, heatmapHex: "#f97316" },
  { key: "changed_pct", label: "พื้นที่เปลี่ยนประเภท", unit: "%", format: (v) => formatPercent(v), heatmap: true, heatmapHex: "#a855f7" },
  { key: "green_pct", label: "พื้นที่สีเขียวปีล่าสุด", unit: "%", format: (v) => formatPercent(v), hideable: true },
  { key: "built_pct", label: "สิ่งปลูกสร้างปีล่าสุด", unit: "%", format: (v) => formatPercent(v), hideable: true },
  { key: "water_pct", label: "พื้นที่น้ำปีล่าสุด", unit: "%", format: (v) => formatPercent(v), hideable: true },
  { key: "confidence_pct", label: "ความเชื่อมั่นเฉลี่ย", unit: "%", format: (v) => formatPercent(v), hideable: true },
  { key: "coverage_pct", label: "พื้นที่มีข้อมูล", unit: "%", format: (v) => formatPercent(v), hideable: true },
];

function yearOptions(maxYear: number) {
  return Array.from({ length: maxYear - LAND_COVER_MIN_YEAR + 1 }, (_, index) => maxYear - index);
}

export default function LandCoverChangePage() {
  const currentYear = new Date().getFullYear();
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [year, setYear] = useState(currentYear);
  const [baselineYear, setBaselineYear] = useState(2020);
  const [layer, setLayer] = useState<LandCoverLayer>("change");
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [rasterVisible, setRasterVisible] = useState(true);
  const [data, setData] = useState<LandCoverResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/land-cover-change?year=${year}&baseline=${baselineYear}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดข้อมูลการเปลี่ยนแปลงได้");
      setData(payload);
    } catch (loadError: any) {
      setError(loadError?.message ?? "ไม่สามารถโหลดข้อมูลการเปลี่ยนแปลงได้");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [baselineYear, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (baselineYear >= year) setBaselineYear(Math.max(LAND_COVER_MIN_YEAR, year - 1));
  }, [baselineYear, year]);

  const selected = useMemo(
    () => activeDistrict === "ทั้งหมด"
      ? null
      : data?.rows.find((row) => row.district_name === activeDistrict) ?? null,
    [activeDistrict, data?.rows],
  );
  const filteredFeatures = activeDistrict === "ทั้งหมด"
    ? data?.geojson.features ?? []
    : (data?.geojson.features ?? []).filter((feature: any) => feature.properties?.district_name === activeDistrict);
  const raster = data?.rasters[layer];
  const maxConversion = Math.max(...(data?.rows ?? []).map((row) => row.green_to_built_pct ?? 0), 0.1);
  const rankingRows = (data?.rows ?? []).slice(0, 15);
  const compositionRows = (data?.rows ?? []).slice(0, 12).map((row) => ({
    district: row.district_name,
    สีเขียว: row.green_pct,
    สิ่งปลูกสร้าง: row.built_pct,
    น้ำ: row.water_pct,
    พื้นที่โล่ง: row.bare_pct,
  }));
  const display = selected ?? (data ? {
    green_pct: data.summary.greenPct,
    built_pct: data.summary.builtPct,
    green_change_pp: data.summary.greenChangePp,
    built_change_pp: data.summary.builtChangePp,
    green_to_built_pct: data.summary.greenToBuiltPct,
    changed_pct: data.summary.changedPct,
    confidence_pct: data.summary.averageConfidencePct,
    coverage_pct: data.summary.averageCoveragePct,
  } : null);

  const districts = useMemo(() =>
    [...(data?.rows ?? [])]
      .map((row) => row.district_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "th")),
    [data?.rows]
  );

  const activeRow = useMemo(() =>
    activeDistrict === "ทั้งหมด"
      ? null
      : data?.rows.find((row) => row.district_name === activeDistrict) ?? null,
    [activeDistrict, data?.rows]
  );

  const csvHeaders = [
    "เขต",
    "สีเขียว -> สิ่งปลูกสร้าง (%)",
    "สีเขียวเปลี่ยนสุทธิ (จุด%)",
    "สิ่งปลูกสร้างเปลี่ยนสุทธิ (จุด%)",
    "เปลี่ยนประเภทดิน (%)",
    "พื้นที่สีเขียว (%)",
    "พื้นที่สิ่งปลูกสร้าง (%)",
    "พื้นที่น้ำ (%)",
    "ความเชื่อมั่น (%)",
    "พื้นที่มีข้อมูล (%)"
  ];
  
  const csvRows = useMemo(() =>
    (data?.rows ?? []).map((row) => [
      row.district_name,
      row.green_to_built_pct,
      row.green_change_pp,
      row.built_change_pp,
      row.changed_pct,
      row.green_pct,
      row.built_pct,
      row.water_pct,
      row.confidence_pct,
      row.coverage_pct,
    ]),
    [data?.rows]
  );

  const reportData = useMemo((): PDFReportData => ({
    title: "รายงานการเปลี่ยนแปลงสิ่งปกคลุมดิน กรุงเทพฯ",
    subtitle: "Google Dynamic World V1 · Land Cover Transitions",
    source: data?.summary.source ?? "Google Dynamic World V1",
    period: `${baselineYear} → ${year}`,
    layer: layer === "change" ? "การเปลี่ยนแปลงสิ่งปกคลุมดิน" : `ชนิดสิ่งปกคลุมดิน (${layer === "current" ? year : baselineYear})`,
    district: activeDistrict,
    kpis: [
      { label: "เปลี่ยนเป็นสิ่งปลูกสร้าง", value: formatPercent(activeRow?.green_to_built_pct ?? data?.summary.greenToBuiltPct) },
      { label: "สีเขียวเปลี่ยนสุทธิ", value: formatPercentagePoint(activeRow?.green_change_pp ?? data?.summary.greenChangePp) },
      { label: "สิ่งปลูกสร้างเปลี่ยนสุทธิ", value: formatPercentagePoint(activeRow?.built_change_pp ?? data?.summary.builtChangePp) },
      { label: "เฉลี่ยความเชื่อมั่น", value: formatPercent(activeRow?.confidence_pct ?? data?.summary.averageConfidencePct) },
    ],
    rankingHeaders: ["เขต", "สีเขียว → สิ่งปลูกสร้าง (%)"],
    rankingRows: (data?.rows ?? []).map((row) => [row.district_name, row.green_to_built_pct]),
  }), [data, baselineYear, year, layer, activeDistrict, activeRow]);

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      {/* Left Sidebar */}
      <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-r border-slate-800/70 shadow-2xl flex flex-col h-full overflow-hidden text-slate-200">
        {/* Sidebar Header with Page Title */}
        <div className="p-4 border-b border-slate-800/70 bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-lime-400/25 bg-lime-400/10">
              <ArrowRightLeft className="h-5 w-5 text-lime-300" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-100">การเปลี่ยนแปลงของดิน</h1>
              <p className="text-[10px] text-slate-500">Dynamic World · Land Cover Transition</p>
            </div>
          </div>
        </div>
        
        {/* Sidebar Content (KPIs & ranking list) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-32 rounded-lg bg-slate-800/60" />
              <div className="h-48 rounded-lg bg-slate-800/40" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-900/60 bg-red-950/25 p-3 text-xs leading-relaxed text-red-300">
              {error}
            </div>
          ) : data && display ? (
            <>
              {/* Main KPI */}
              <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <div className="text-[10px] text-slate-500">{activeDistrict === "ทั้งหมด" ? "กรุงเทพฯ สรุป 50 เขต" : `เขต${activeDistrict}`}</div>
                <div className="mt-1 text-3xl font-black tabular-nums text-red-400">{formatPercent(display.green_to_built_pct)}</div>
                <div className="text-[9px] text-slate-400 leading-snug mt-1">พื้นที่สีเขียวที่เปลี่ยนเป็นสิ่งปลูกสร้าง</div>
                
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="bg-slate-950/50 border border-slate-800/70 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500">สีเขียวเปลี่ยนสุทธิ</div>
                    <div className={`mt-0.5 text-xs font-bold ${(display.green_change_pp ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatPercentagePoint(display.green_change_pp)}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 border border-slate-800/70 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500">สิ่งปลูกสร้างเปลี่ยนสุทธิ</div>
                    <div className={`mt-0.5 text-xs font-bold ${(display.built_change_pp ?? 0) <= 0 ? "text-emerald-400" : "text-orange-400"}`}>
                      {formatPercentagePoint(display.built_change_pp)}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 border border-slate-800/70 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500">เปลี่ยนคลาสทั้งหมด</div>
                    <div className="mt-0.5 text-xs font-bold text-purple-400">{formatPercent(display.changed_pct)}</div>
                  </div>
                  <div className="bg-slate-950/50 border border-slate-800/70 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500">ความเชื่อมั่นเฉลี่ย</div>
                    <div className="mt-0.5 text-xs font-bold text-cyan-400">{formatPercent(display.confidence_pct)}</div>
                  </div>
                </div>
              </section>

              {/* Ranking list */}
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                  <ArrowRightLeft className="h-3.5 w-3.5 text-red-400" /> เขตที่เปลี่ยนเป็นสิ่งปลูกสร้างสูงสุด
                </h2>
                <div className="space-y-1 bg-slate-900/35 border border-slate-800/50 rounded-xl p-1.5">
                  {data.rows.slice(0, 8).map((row, index) => (
                    <button
                      key={row.district_id}
                      onClick={() => setActiveDistrict(row.district_name)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        activeDistrict === row.district_name
                          ? "bg-red-500/10 border border-red-500/20 text-red-300"
                          : "hover:bg-slate-800/50 border border-transparent text-slate-300 hover:text-white"
                      }`}
                    >
                      <span className="w-4 text-[9px] text-slate-500 font-mono">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{row.district_name}</span>
                      <span className="text-[10px] font-black text-red-400">{formatPercent(row.green_to_built_pct)}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Quality Criteria */}
              <section className="rounded-xl border border-slate-800 bg-slate-900/25 p-3.5">
                <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                  <ShieldCheck className="h-3.5 w-3.5 text-lime-400" /> เกณฑ์การวิเคราะห์
                </h2>
                <ul className="mt-2 space-y-1.5 text-[9px] leading-relaxed text-slate-500">
                  <li>• คัดกรองพิกเซลที่มีค่าความเชื่อมั่น &ge; 45%</li>
                  <li>• ข้อมูลปัจจุบันคำนวณแบบสะสม (YTD) สำหรับปีที่ยังไม่สมบูรณ์</li>
                  <li>• การเปลี่ยนประเภทดินเป็นเพียงข้อบ่งชี้ทางกายภาพจากภาพถ่ายดาวเทียม ไม่ใช่การเปลี่ยนสีผังเมืองตามกฎหมาย</li>
                </ul>
              </section>
            </>
          ) : null}
        </div>
        
        {/* Footer */}
        <div className="p-3 border-t border-slate-800/70 bg-slate-900/20 shrink-0">
          <SidebarFooter exclude={["land-cover-change"]} />
        </div>
      </aside>

      {/* Main content area */}
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
                onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_land_cover_change_${baselineYear}_${year}`)}
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

        {/* Content */}
        <div className="flex-1 min-h-0 flex">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500 w-full">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin text-emerald-400" /> กำลังประมวลผล Dynamic World รายเขต...
            </div>
          ) : error || !data ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300 w-full">{error ?? "ไม่มีข้อมูล"}</div>
          ) : (
            <>
              {viewMode === "map" && (
                <>
                  <div className="relative flex-1 min-w-0">
                    <div className="absolute inset-0 z-0">
                      <LandCoverChangeMap
                        geojsonData={data.geojson}
                        rasterUrl={raster?.urlFormat ?? null}
                        rasterVisible={rasterVisible}
                        layer={layer}
                        activeDistrict={activeDistrict}
                        onDistrictSelect={setActiveDistrict}
                        maxConversion={maxConversion}
                      />
                    </div>

                    {/* Floating KPI cards */}
                    <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
                      {[
                        ["เปลี่ยนเป็นสิ่งปลูกสร้าง", formatPercent(activeRow?.green_to_built_pct ?? data.summary.greenToBuiltPct)],
                        ["สีเขียวเปลี่ยนสุทธิ", formatPercentagePoint(activeRow?.green_change_pp ?? data.summary.greenChangePp)],
                        ["สิ่งปลูกสร้างเปลี่ยนสุทธิ", formatPercentagePoint(activeRow?.built_change_pp ?? data.summary.builtChangePp)],
                        ["ความเชื่อมั่นเฉลี่ย", formatPercent(activeRow?.confidence_pct ?? data.summary.averageConfidencePct)],
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
                        <p>เปรียบเทียบ: {baselineYear} → {year}</p>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="absolute bottom-4 right-4 z-[1000] w-80 max-w-[calc(100%-2rem)] rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
                      <div className="mb-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">สัญลักษณ์แผนที่</h4>
                        <p className="mt-1 text-[10px] leading-snug text-slate-400">{LAYER_OPTIONS.find((option) => option.value === layer)?.label}</p>
                      </div>
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                        {(raster?.labels ?? []).map((labelText, index) => (
                          <div key={labelText} className="grid grid-cols-[14px_1fr] items-center gap-2 text-[10px]">
                            <span className="h-3.5 w-3.5 rounded-sm border border-white/10 shrink-0" style={{ backgroundColor: raster?.palette[index] }} />
                            <span className="min-w-0 truncate text-slate-300">{labelText}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 border-t border-slate-800 pt-2 text-[9px] leading-relaxed text-slate-500">
                        เส้นเขตและสีพื้นโปร่งใช้แสดงระดับสีเขียว → สิ่งปลูกสร้างรายเขต
                      </div>
                    </div>
                  </div>

                  {/* Right aside */}
                  <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4 animate-in slide-in-from-right duration-200">
                    <div className="flex min-h-full flex-col gap-3">
                      <MapControlPanel
                        accent="emerald"
                        granularity="district"
                        onGranularityChange={() => undefined}
                        showGranularity={false}
                        mapMode={layer}
                        mapModes={LAYER_OPTIONS}
                        onMapModeChange={(m) => setLayer(m as LandCoverLayer)}
                        showOpacity={false}
                        opacity={1.0}
                        onOpacityChange={() => undefined}
                        baseMap="none"
                        onBaseMapChange={() => undefined}
                        onReset={() => {
                          setYear(currentYear);
                          setBaselineYear(2020);
                          setLayer("change");
                          setActiveDistrict("ทั้งหมด");
                        }}
                        currentLayer={layer === "change" ? "การเปลี่ยนแปลงสิ่งปกคลุมดิน" : `ชนิดสิ่งปกคลุมดิน (${layer === "current" ? year : baselineYear})`}
                        currentPeriod={`${baselineYear} → ${year}`}
                        dataSource={data?.summary.source ?? "Google Dynamic World V1"}
                        interactionHint="คลิกหรือวางเมาส์บนพื้นที่เขตเพื่อดูรายละเอียด"
                      />

                      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                          <span>แสดงภาพถ่ายสิ่งปกคลุมดิน</span>
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
                        minYear={LAND_COVER_MIN_YEAR}
                        maxYear={currentYear}
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
                        csvFilename={`bangkok_land_cover_change_${baselineYear}_${year}`}
                        csvHeaders={csvHeaders}
                        csvRows={csvRows}
                        reportData={reportData}
                      />
                    </div>
                  </aside>
                </>
              )}

              {viewMode === "stats" && (
                <div className="space-y-4 p-4 sm:p-5 flex-1 overflow-y-auto custom-scrollbar">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["สีเขียว → สิ่งปลูกสร้าง", formatPercent(data.summary.greenToBuiltPct), "text-red-300"],
                      ["สีเขียวเปลี่ยนสุทธิ", formatPercentagePoint(data.summary.greenChangePp), (data.summary.greenChangePp ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"],
                      ["สิ่งปลูกสร้างเปลี่ยนสุทธิ", formatPercentagePoint(data.summary.builtChangePp), "text-orange-300"],
                      ["ความเชื่อมั่นเฉลี่ย", formatPercent(data.summary.averageConfidencePct), "text-cyan-300"],
                    ].map(([labelText, value, color]) => (
                      <div key={labelText} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                        <div className="text-[10px] text-slate-500">{labelText}</div>
                        <div className={`mt-1 text-lg font-black ${color}`}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <h2 className="text-xs font-black">15 เขตที่สีเขียวเปลี่ยนเป็นสิ่งปลูกสร้างสูง</h2>
                      <p className="mt-1 text-[10px] text-slate-500">{baselineYear} → {year} · ร้อยละของพื้นที่ที่เปรียบเทียบได้</p>
                      <div className="mt-4 h-[360px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rankingRows} layout="vertical" margin={{ left: 18, right: 18 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" stroke="#64748b" fontSize={9} unit="%" />
                            <YAxis type="category" dataKey="district_name" width={84} stroke="#94a3b8" fontSize={9} />
                            <Tooltip formatter={(value) => [formatPercent(Number(value)), "สีเขียว → สิ่งปลูกสร้าง"]}
                              contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                            <Bar dataKey="green_to_built_pct" radius={[0, 4, 4, 0]}>
                              {rankingRows.map((row) => <Cell key={row.district_id} fill={conversionColor(row.green_to_built_pct, maxConversion)} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <h2 className="text-xs font-black">องค์ประกอบสิ่งปกคลุมดินปี {year}</h2>
                      <p className="mt-1 text-[10px] text-slate-500">12 เขตแรกตามอันดับ conversion</p>
                      <div className="mt-4 h-[360px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={compositionRows} layout="vertical" margin={{ left: 18, right: 12 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={9} unit="%" />
                            <YAxis type="category" dataKey="district" width={82} stroke="#94a3b8" fontSize={9} />
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} formatter={(value) => formatPercent(Number(value))} />
                            <Legend wrapperStyle={{ fontSize: 9 }} />
                            <Bar dataKey="สีเขียว" stackId="cover" fill="#22c55e" />
                            <Bar dataKey="สิ่งปลูกสร้าง" stackId="cover" fill="#ef4444" />
                            <Bar dataKey="น้ำ" stackId="cover" fill="#3b82f6" />
                            <Bar dataKey="พื้นที่โล่ง" stackId="cover" fill="#d97706" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  </div>

                  <section className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <Trees className="h-4 w-4 text-emerald-400" />
                      <div className="mt-2 text-[10px] text-slate-500">พื้นที่สีเขียวเฉลี่ยปี {year}</div>
                      <div className="text-xl font-black text-emerald-300">{formatPercent(data.summary.greenPct)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <Building2 className="h-4 w-4 text-red-400" />
                      <div className="mt-2 text-[10px] text-slate-500">สิ่งปลูกสร้างเฉลี่ยปี {year}</div>
                      <div className="text-xl font-black text-red-300">{formatPercent(data.summary.builtPct)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <Database className="h-4 w-4 text-cyan-400" />
                      <div className="mt-2 text-[10px] text-slate-500">พื้นที่มีข้อมูลเฉลี่ย</div>
                      <div className="text-xl font-black text-cyan-300">{formatPercent(data.summary.averageCoveragePct)}</div>
                    </div>
                  </section>
                </div>
              )}

              {viewMode === "table" && (
                <div className="h-full p-4 sm:p-5 flex-1 overflow-y-auto custom-scrollbar">
                  <DistrictDataTable
                    features={filteredFeatures}
                    columns={TABLE_COLUMNS}
                    getRowData={(properties) => ({
                      name: properties.district_name,
                      green_to_built_pct: properties.green_to_built_pct,
                      green_change_pp: properties.green_change_pp,
                      built_change_pp: properties.built_change_pp,
                      changed_pct: properties.changed_pct,
                      green_pct: properties.green_pct,
                      built_pct: properties.built_pct,
                      water_pct: properties.water_pct,
                      confidence_pct: properties.confidence_pct,
                      coverage_pct: properties.coverage_pct,
                    })}
                    csvFilename={`bangkok_land_cover_change_${baselineYear}_${year}`}
                    filterDistrict={activeDistrict}
                    onDistrictChange={setActiveDistrict}
                    districts={data.rows.map((row) => row.district_name)}
                    accentColor="emerald"
                    dataSource={data.summary.source}
                    contextNote={`${baselineYear} → ${year} · Dynamic World 10 ม. · confidence ≥ 45%`}
                    expectedRows={activeDistrict === "ทั้งหมด" ? 50 : 1}
                  />
                </div>
              )}

              {viewMode === "guide" && (
                <div className="h-full flex-1 overflow-y-auto custom-scrollbar">
                  <PlainLanguageGuide
                    module="landcover"
                    accent="emerald"
                    records={activeDistrict === "ทั้งหมด" ? data.rows : data.rows.filter((row) => row.district_name === activeDistrict)}
                    year={year}
                    activeArea={activeDistrict}
                    compareMode
                    compareYear={baselineYear}
                    dataSource={data.summary.source}
                    dataQuality={data.summary.dataQuality}
                    metricKey="green_to_built_pct"
                    metricLabel="สัดส่วนสีเขียวที่เปลี่ยนเป็นสิ่งปลูกสร้าง"
                    unit="%"
                    decimals={2}
                    nameKey="district_name"
                    extraSummary={[
                      `เขตที่มี conversion สูงสุดคือ ${data.summary.highestConversionDistrict ?? "ไม่มีข้อมูล"}`,
                      `ความเชื่อมั่นเฉลี่ยของพิกเซลที่ใช้คำนวณ ${formatPercent(data.summary.averageConfidencePct)}`,
                    ]}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

