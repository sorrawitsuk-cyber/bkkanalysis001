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
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import SidebarFooter from "@/components/gee/SidebarFooter";
import MapSkeleton from "@/components/ui/MapSkeleton";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <Link href="/" className="rounded-lg border border-slate-800 p-2 text-slate-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-lime-400/25 bg-lime-400/10">
            <ArrowRightLeft className="h-5 w-5 text-lime-300" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black">การเปลี่ยนแปลงสิ่งปกคลุมดิน</h1>
            <p className="truncate text-[10px] text-slate-500">Dynamic World · Land Cover Transition 10 เมตร</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="emerald" />
          <button
            onClick={loadData}
            disabled={loading}
            className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-400 transition-colors hover:text-white disabled:opacity-50"
            title="โหลดข้อมูลใหม่"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800 bg-[#0c1424] p-2 lg:hidden">
        <select value={baselineYear} onChange={(event) => setBaselineYear(Number(event.target.value))} aria-label="ปีฐาน"
          className="w-[105px] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px]">
          {yearOptions(year - 1).map((option) => <option key={option} value={option}>ฐาน {option}</option>)}
        </select>
        <select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="ปีปัจจุบัน"
          className="w-[105px] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px]">
          {yearOptions(currentYear).filter((option) => option > LAND_COVER_MIN_YEAR).map((option) => <option key={option} value={option}>ปี {option}</option>)}
        </select>
        <select value={layer} onChange={(event) => setLayer(event.target.value as LandCoverLayer)} aria-label="ชั้นข้อมูล"
          className="w-[145px] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px]">
          {LAYER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select value={activeDistrict} onChange={(event) => setActiveDistrict(event.target.value)} aria-label="เลือกเขต"
          className="w-[145px] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px]">
          <option value="ทั้งหมด">กรุงเทพฯ ทั้งหมด</option>
          {(data?.rows ?? []).map((row) => <option key={row.district_id} value={row.district_name}>{row.district_name}</option>)}
        </select>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-[#0c1424] lg:flex">
          <div className="space-y-5 p-4">
            <section>
              <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <CalendarRange className="h-3.5 w-3.5 text-lime-400" /> ช่วงเปรียบเทียบ
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-[9px] text-slate-600">ปีฐาน</span>
                  <select value={baselineYear} onChange={(event) => setBaselineYear(Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs">
                    {yearOptions(year - 1).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <span className="mb-1 block text-[9px] text-slate-600">ปีปัจจุบัน</span>
                  <select value={year} onChange={(event) => setYear(Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs">
                    {yearOptions(currentYear).filter((option) => option > LAND_COVER_MIN_YEAR).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <section>
              <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <Layers3 className="h-3.5 w-3.5 text-lime-400" /> ชั้นข้อมูลแผนที่
              </label>
              <div className="space-y-1.5">
                {LAYER_OPTIONS.map((option) => (
                  <button key={option.value} onClick={() => setLayer(option.value)}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                      layer === option.value ? "border-lime-500/50 bg-lime-500/10" : "border-slate-800 bg-slate-950/45 hover:border-slate-700"
                    }`}>
                    <div className={`text-[10px] font-bold ${layer === option.value ? "text-lime-300" : "text-slate-400"}`}>{option.label}</div>
                    <div className="mt-0.5 text-[9px] leading-relaxed text-slate-600">{option.description}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => setRasterVisible((value) => !value)}
                className={`mt-2 w-full rounded-lg border px-3 py-2 text-[10px] font-bold ${
                  rasterVisible ? "border-lime-500/40 bg-lime-500/10 text-lime-300" : "border-slate-700 text-slate-500"
                }`}>
                {rasterVisible ? "แสดง raster อยู่" : "แสดง raster"}
              </button>
            </section>

            <section>
              <label className="mb-1.5 text-[10px] font-bold text-slate-400">พื้นที่</label>
              <select value={activeDistrict} onChange={(event) => setActiveDistrict(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs">
                <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
                {(data?.rows ?? []).map((row) => <option key={row.district_id} value={row.district_name}>{row.district_name}</option>)}
              </select>
            </section>

            {loading ? (
              <div className="space-y-2 animate-pulse"><div className="h-28 rounded-lg bg-slate-800/70" /><div className="h-24 rounded-lg bg-slate-800/50" /></div>
            ) : error ? (
              <div className="rounded-lg border border-red-900/60 bg-red-950/25 p-3 text-xs leading-relaxed text-red-300">{error}</div>
            ) : data && display ? (
              <>
                <section>
                  <div className="text-[10px] text-slate-500">{activeDistrict === "ทั้งหมด" ? "ค่าเฉลี่ย 50 เขต" : `เขต${activeDistrict}`}</div>
                  <div className="mt-1 text-3xl font-black tabular-nums text-red-300">{formatPercent(display.green_to_built_pct)}</div>
                  <div className="text-[9px] text-slate-500">พื้นที่สีเขียวที่เปลี่ยนเป็นสิ่งปลูกสร้าง</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-[9px] text-slate-500">สีเขียวสุทธิ</div>
                      <div className={`mt-1 text-sm font-bold ${(display.green_change_pp ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {formatPercentagePoint(display.green_change_pp)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-[9px] text-slate-500">สิ่งปลูกสร้างสุทธิ</div>
                      <div className={`mt-1 text-sm font-bold ${(display.built_change_pp ?? 0) <= 0 ? "text-emerald-300" : "text-orange-300"}`}>
                        {formatPercentagePoint(display.built_change_pp)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-[9px] text-slate-500">เปลี่ยน class ทั้งหมด</div>
                      <div className="mt-1 text-sm font-bold text-purple-300">{formatPercent(display.changed_pct)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-[9px] text-slate-500">ความเชื่อมั่น</div>
                      <div className="mt-1 text-sm font-bold text-cyan-300">{formatPercent(display.confidence_pct)}</div>
                    </div>
                  </div>
                </section>

                <DataSourceBadge
                  dataSource={data.summary.source}
                  dataQuality={data.summary.dataQuality}
                  sourceLabel={`${data.summary.source} · ${data.summary.currentSceneCount.toLocaleString("th-TH")} ภาพปี ${year}`}
                  sourceNote={data.summary.processingNote}
                />

                <section>
                  <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-red-400" /> เขตที่สีเขียวเปลี่ยนเป็นสิ่งปลูกสร้างสูง
                  </h2>
                  <div className="space-y-1">
                    {data.rows.slice(0, 8).map((row, index) => (
                      <button key={row.district_id} onClick={() => setActiveDistrict(row.district_name)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-800/60">
                        <span className="w-4 text-[9px] text-slate-600">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{row.district_name}</span>
                        <span className="text-[10px] font-bold text-red-300">{formatPercent(row.green_to_built_pct)}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                  <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                    <ShieldCheck className="h-3.5 w-3.5 text-lime-400" /> เกณฑ์คุณภาพ
                  </h2>
                  <ul className="mt-2 space-y-1.5 text-[9px] leading-relaxed text-slate-500">
                    <li>• ใช้เฉพาะพิกเซลที่ความเชื่อมั่นอย่างน้อย 45%</li>
                    <li>• ปีปัจจุบันเป็นข้อมูลตั้งแต่ต้นปีถึงวันที่ล่าสุด</li>
                    <li>• การเปลี่ยน class ไม่เท่ากับการอนุมัติก่อสร้างหรือการใช้ที่ดินทางกฎหมาย</li>
                  </ul>
                </section>
              </>
            ) : null}
          </div>
          <SidebarFooter exclude={["land-cover-change"]} />
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> กำลังประมวลผล Dynamic World รายเขต
            </div>
          ) : error || !data ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">{error ?? "ไม่มีข้อมูล"}</div>
          ) : (
            <>
              {viewMode === "map" && (
                <div className="relative h-full min-h-[520px]">
                  <LandCoverChangeMap
                    geojsonData={data.geojson}
                    rasterUrl={raster?.urlFormat ?? null}
                    rasterVisible={rasterVisible}
                    layer={layer}
                    activeDistrict={activeDistrict}
                    onDistrictSelect={setActiveDistrict}
                    maxConversion={maxConversion}
                  />
                  <div className="absolute bottom-4 right-4 z-[500] max-h-[46vh] w-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/95 p-3">
                    <div className="mb-2 text-[9px] font-bold text-slate-200">{LAYER_OPTIONS.find((option) => option.value === layer)?.label}</div>
                    <div className="space-y-1.5">
                      {(raster?.labels ?? []).map((labelText, index) => (
                        <div key={labelText} className="flex items-center gap-2 text-[8px] text-slate-400">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: raster?.palette[index] }} />
                          <span>{labelText}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-slate-800 pt-2 text-[8px] leading-relaxed text-slate-500">
                      เส้นเขตและสีพื้นโปร่งใช้แสดงระดับสีเขียว → สิ่งปลูกสร้างรายเขต
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "stats" && (
                <div className="space-y-4 p-4 sm:p-5">
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
                <div className="h-full p-4 sm:p-5">
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
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
