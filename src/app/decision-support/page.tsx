/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDistrictUrlState } from "@/lib/url-selection-state";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Droplets,
  Flame,
  Gauge,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import InteractiveDistrictPanel from "@/components/map/InteractiveDistrictPanel";
import ResponsivePageSidebar from "@/components/map/ResponsivePageSidebar";
import type { DecisionMode } from "@/lib/decision-support";
import { buildProvenance, getPolicySafeInsight } from "@/lib/data-provenance";

const DecisionSupportMap = dynamic(
  () => import("@/components/map/DecisionSupportMap"),
  { ssr: false, loading: () => <MapSkeleton /> },
);

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 9 }, (_, index) => CURRENT_YEAR - index);

function formatValue(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "ไม่มีข้อมูล"
    : value.toFixed(digits);
}

function scoreColor(score: number | null) {
  if (score === null) return "#64748b";
  if (score >= 80) return "#b91c1c";
  if (score >= 60) return "#f97316";
  if (score >= 40) return "#eab308";
  return "#16a34a";
}

function SourceStatusPanel({ sources }: { sources: any[] }) {
  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <div key={source.key} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
          <div className="flex items-start gap-2">
            {source.status === "available"
              ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />}
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-200">{source.label}</span>
                <span className={`text-[9px] font-bold ${source.status === "available" ? "text-emerald-400" : "text-slate-600"}`}>
                  {source.status === "available" ? "พร้อมใช้" : "ไม่มีข้อมูล"}
                </span>
              </div>
              <p className="mt-0.5 text-[9px] text-slate-500">{source.source}</p>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-600">{source.note}</p>
              {source.observationCount !== null && (
                <p className="mt-1 font-mono text-[9px] text-slate-500">
                  observations: {Number(source.observationCount).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DecisionSupportPage() {
  const [mode, setMode] = useState<DecisionMode>("flood");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useDistrictUrlState();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sortKey, setSortKey] = useState("score");
  const [sortDescending, setSortDescending] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/decision-support?mode=${mode}&year=${year}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "โหลดข้อมูลไม่สำเร็จ");
        return body;
      })
      .then(setData)
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [mode, year]);

  const scoredRows = useMemo(
    () => (data?.rows ?? []).filter((row: any) => typeof row.score === "number"),
    [data?.rows],
  );
  const displayRows = useMemo(() => {
    const base = activeDistrict === "ทั้งหมด"
      ? [...(data?.rows ?? [])]
      : (data?.rows ?? []).filter((row: any) => row.district_name === activeDistrict);
    return base.sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const comparison = typeof av === "string"
        ? av.localeCompare(bv, "th")
        : Number(av) - Number(bv);
      return sortDescending ? -comparison : comparison;
    });
  }, [activeDistrict, data?.rows, sortDescending, sortKey]);
  const selected = activeDistrict === "ทั้งหมด"
    ? scoredRows[0] ?? data?.rows?.[0]
    : data?.rows?.find((row: any) => row.district_name === activeDistrict);
  const chartRows = scoredRows.slice(0, 15);
  const summary = data?.summary;
  const availableSources = (summary?.sourceStatus ?? []).filter((source: any) => source.status === "available");
  const panelProvenance = buildProvenance({
    source: availableSources.map((source: any) => source.label).join(" + ") || "ไม่มีแหล่งข้อมูลพร้อมใช้",
    period: data?.period ?? `ปี ${year}`,
    methodologyId: `decision-${mode}-v1`,
    fallbackQuality: availableSources.length ? "observed" : "unavailable",
    qualityFlags: [
      `${availableSources.length}/${summary?.sourceStatus?.length ?? 0} แหล่งพร้อมใช้`,
      ...(data?.limitations ?? []).slice(0, 1),
    ],
  });
  const panelInsight = getPolicySafeInsight({
    selected: activeDistrict !== "ทั้งหมด",
    title: activeDistrict,
    metricLabel: "คะแนนคัดกรอง",
    primaryValue: selected?.score,
    averageValue: summary?.averageScore,
    higherIsConcern: true,
    provenance: panelProvenance,
  });
  const distribution = [
    { label: "สูงมาก", count: scoredRows.filter((row: any) => row.score >= 80).length, color: "#b91c1c" },
    { label: "สูง", count: scoredRows.filter((row: any) => row.score >= 60 && row.score < 80).length, color: "#f97316" },
    { label: "ปานกลาง", count: scoredRows.filter((row: any) => row.score >= 40 && row.score < 60).length, color: "#eab308" },
    { label: "ต่ำ", count: scoredRows.filter((row: any) => row.score < 40).length, color: "#16a34a" },
    { label: "ข้อมูลไม่พอ", count: (data?.rows?.length ?? 0) - scoredRows.length, color: "#64748b" },
  ];

  const rawColumns = mode === "flood"
    ? [
        ["rainfall", "ฝนสะสม", "มม."],
        ["sar_wetness", "SAR change", "dB"],
        ["water_signal", "สัญญาณน้ำ", "สัดส่วน"],
        ["elevation", "ระดับสูง", "ม."],
        ["complaint_density", "ความหนาแน่นข้อร้องเรียนรายเขต", "เรื่อง/ตร.กม."],
      ]
    : [
        ["mean_lst", "LST median", "°C"],
        ["lst_p90", "LST P90", "°C"],
        ["ndvi", "NDVI", ""],
        ["ndbi", "NDBI", ""],
      ];

  function changeSort(key: string) {
    if (sortKey === key) setSortDescending((current) => !current);
    else {
      setSortKey(key);
      setSortDescending(key !== "district_name");
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <Link href="/" className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-black">วิเคราะห์เพื่อจัดลำดับการดำเนินงาน</h1>
          <p className="text-[10px] text-slate-500">ใช้เฉพาะข้อมูลสังเกตจริงและค่าที่คำนวณจากภาพจริง</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor={mode === "flood" ? "sky" : "orange"} />
          <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              onClick={() => setMode("flood")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold ${mode === "flood" ? "bg-sky-500 text-white" : "text-slate-500"}`}
            >
              <Droplets className="h-3.5 w-3.5" /> น้ำท่วม
            </button>
            <button
              onClick={() => setMode("heat")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold ${mode === "heat" ? "bg-orange-500 text-white" : "text-slate-500"}`}
            >
              <Flame className="h-3.5 w-3.5" /> ความร้อน
            </button>
          </div>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
          >
            {YEARS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> กำลังตรวจแหล่งข้อมูลและประมวลผล
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-red-300">{error}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ResponsivePageSidebar open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <div className="h-full overflow-y-auto p-4">
            <div className={`rounded-xl border p-4 ${mode === "flood" ? "border-sky-500/20 bg-sky-500/5" : "border-orange-500/20 bg-orange-500/5"}`}>
              <div className="flex items-center gap-2">
                {mode === "flood" ? <Droplets className="h-5 w-5 text-sky-400" /> : <Flame className="h-5 w-5 text-orange-400" />}
                <h2 className="text-sm font-black">{data?.title}</h2>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{data?.methodology}</p>
              <p className="mt-2 text-[10px] font-bold text-slate-300">ช่วงข้อมูล: {data?.period}</p>
            </div>

            <label className="mt-4 block text-[9px] font-bold uppercase tracking-widest text-slate-500">เลือกเขต</label>
            <select
              value={activeDistrict}
              onChange={(event) => setActiveDistrict(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
            >
              <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
              {(data?.rows ?? []).map((row: any) => (
                <option key={row.district_name}>{row.district_name}</option>
              ))}
            </select>

            <div className="mt-4">
              <InteractiveDistrictPanel
                accent={mode === "flood" ? "sky" : "orange"}
                selected={activeDistrict !== "ทั้งหมด"}
                title={activeDistrict !== "ทั้งหมด" ? activeDistrict : "เลือกเขตบนแผนที่"}
                subtitle={activeDistrict !== "ทั้งหมด" ? "สรุปคะแนนคัดกรองจากพื้นที่ที่คลิก" : "คลิก polygon เขตเพื่อดูองค์ประกอบคะแนน"}
                onClear={() => setActiveDistrict("ทั้งหมด")}
                metrics={[
                  { label: "คะแนนคัดกรอง", value: selected?.score != null ? `${selected.score}/100` : "ไม่มีข้อมูล", rawValue: selected?.score, color: scoreColor(selected?.score ?? null) },
                  { label: "Coverage", value: selected?.coverage != null ? `${selected.coverage}%` : "ไม่มีข้อมูล", rawValue: selected?.coverage, color: "#38bdf8" },
                  { label: mode === "flood" ? "ฝนสะสม" : "LST median", value: formatValue(mode === "flood" ? selected?.rainfall : selected?.mean_lst), rawValue: mode === "flood" ? selected?.rainfall : selected?.mean_lst, color: mode === "flood" ? "#0ea5e9" : "#f97316" },
                  { label: "องค์ประกอบพร้อมใช้", value: `${selected?.components?.filter((component: any) => component.value != null).length ?? 0}/${selected?.components?.length ?? 0}`, rawValue: selected?.components?.filter((component: any) => component.value != null).length ?? 0, color: "#22c55e" },
                ]}
                provenance={panelProvenance}
                insight={panelInsight}
              />
            </div>

            {selected && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="text-[9px] text-slate-500">คะแนนที่ใช้จัดอันดับ</div>
                    <div className="mt-1 text-2xl font-black">
                      {selected.score ?? "–"}{selected.score !== null && <span className="text-xs text-slate-600">/100</span>}
                    </div>
                    <div className="mt-1 text-[9px] text-slate-500">{selected.level}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="text-[9px] text-slate-500">ความครบถ้วน</div>
                    <div className="mt-1 text-sm font-black">{selected.coverage}%</div>
                    <div className="text-[10px] text-slate-500">เชื่อมั่น {selected.confidence}</div>
                  </div>
                </div>
                <div>
                  <h3 className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                    <Gauge className="h-3 w-3" /> องค์ประกอบคะแนน
                  </h3>
                  <div className="mt-2 space-y-2">
                    {selected.components?.map((component: any) => (
                      <div key={component.key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                        <div className="flex justify-between gap-2 text-[10px]">
                          <span className="text-slate-300">{component.label}</span>
                          <span className="font-mono text-slate-200">
                            {component.normalized === null ? "ไม่มีข้อมูล" : `${component.normalized.toFixed(1)}/100`}
                          </span>
                        </div>
                        <div className="mt-1 text-[9px] text-slate-600">{component.source}</div>
                        <div className="mt-1 flex justify-between text-[9px] text-slate-600">
                          <span>{component.status} · น้ำหนัก {component.weight}%</span>
                          <span>{formatValue(component.value)} {component.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                <Database className="h-3 w-3" /> สถานะแหล่งข้อมูล
              </h3>
              <SourceStatusPanel sources={summary?.sourceStatus ?? []} />
            </div>

            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> ข้อจำกัดก่อนนำไปใช้
              </h3>
              <ul className="mt-2 space-y-1.5 text-[9px] leading-relaxed text-slate-400">
                {(data?.limitations ?? []).map((item: string) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            </div>
          </ResponsivePageSidebar>

          <main className="min-w-0 flex-1 overflow-auto">
            {viewMode === "map" && (
              <div className="relative h-full min-h-[520px]">
                <DecisionSupportMap data={data?.geojson} activeDistrict={activeDistrict} onDistrictSelect={(districtName) => {
                  setActiveDistrict(districtName);
                  setMobileSidebarOpen(true);
                }} />
                <div className="absolute bottom-4 right-4 z-[1000] rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-[9px] shadow-xl">
                  {[
                    ["#b91c1c", "80-100 สูงมาก"],
                    ["#f97316", "60-79 สูง"],
                    ["#eab308", "40-59 ปานกลาง"],
                    ["#16a34a", "0-39 ต่ำ"],
                    ["#64748b", "ข้อมูลไม่พอ / ไม่มีข้อมูล"],
                  ].map(([color, label]) => (
                    <div key={label} className="flex items-center gap-2 py-0.5 text-slate-400">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} /> {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewMode === "stats" && (
              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ["เขตที่ออกคะแนนได้", `${summary?.scoredDistricts ?? 0}/50`],
                    ["คะแนนเฉลี่ย", summary?.averageScore ?? "–"],
                    ["คะแนน ≥ 60", summary?.highDistricts ?? 0],
                    ["coverage เฉลี่ย", `${summary?.averageCoverage ?? 0}%`],
                    ["แหล่งพร้อมใช้", `${(summary?.sourceStatus ?? []).filter((source: any) => source.status === "available").length}/${summary?.sourceStatus?.length ?? 0}`],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                      <div className="text-[10px] text-slate-500">{label}</div>
                      <div className="mt-1 text-xl font-black">{value}</div>
                    </div>
                  ))}
                </div>

                {scoredRows.length === 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
                    ไม่มีเขตที่ผ่านเกณฑ์ความครบถ้วน จึงไม่สร้างอันดับหรือสถิติคะแนน กรุณาตรวจสถานะแหล่งข้อมูลด้านซ้าย
                  </div>
                )}

                <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                  <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                    <h3 className="text-xs font-black">อันดับคะแนนที่ผ่านเกณฑ์</h3>
                    <p className="mt-1 text-[10px] text-slate-500">แสดงสูงสุด 15 เขต เฉพาะเขตที่มี coverage ตามเกณฑ์</p>
                    {chartRows.length ? (
                      <div className="mt-4 h-[360px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartRows} layout="vertical" margin={{ left: 30, right: 20 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={10} />
                            <YAxis type="category" dataKey="district_name" width={95} stroke="#94a3b8" fontSize={10} />
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }} />
                            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                              {chartRows.map((row: any) => <Cell key={row.district_name} fill={scoreColor(row.score)} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="mt-4 flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-800 text-center text-[11px] text-slate-600">
                        ไม่มีข้อมูลที่ผ่านเกณฑ์สำหรับสร้างกราฟอันดับ
                      </div>
                    )}
                  </section>
                  <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                    <h3 className="text-xs font-black">การกระจายระดับคะแนน</h3>
                    <div className="mt-4 space-y-3">
                      {distribution.map((item) => (
                        <div key={item.label}>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-400">{item.label}</span>
                            <span className="font-mono font-bold">{item.count} เขต</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(item.count / 50) * 100}%`, backgroundColor: item.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <h3 className="mt-7 text-xs font-black">ตรวจสอบแหล่งข้อมูล</h3>
                    <div className="mt-3">
                      <SourceStatusPanel sources={summary?.sourceStatus ?? []} />
                    </div>
                  </section>
                </div>
              </div>
            )}

            {viewMode === "table" && (
              <div className="p-5">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black">ตารางตรวจสอบข้อมูลรายเขต</h2>
                    <p className="mt-1 text-[10px] text-slate-500">ค่าดิบทั้งหมดมาจากแหล่งที่ระบุใน API ไม่มีการเติมค่าจำลอง</p>
                  </div>
                  <span className="text-[10px] text-slate-500">{displayRows.length} แถว</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full min-w-[1050px] border-collapse text-left text-[10px]">
                    <thead className="sticky top-0 bg-slate-900 text-slate-400">
                      <tr>
                        {[
                          ["district_name", "เขต"],
                          ["score", "คะแนน"],
                          ["level", "ระดับ"],
                          ["coverage", "Coverage"],
                          ...rawColumns.map(([key, label, unit]) => [key, `${label}${unit ? ` (${unit})` : ""}`]),
                        ].map(([key, label]) => (
                          <th key={key} className="border-b border-slate-700 px-3 py-3">
                            <button onClick={() => changeSort(key)} className="font-bold hover:text-white">
                              {label}{sortKey === key ? (sortDescending ? " ↓" : " ↑") : ""}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row: any) => (
                        <tr key={row.district_name} className="border-b border-slate-800/70 hover:bg-slate-900/70">
                          <td className="px-3 py-2.5 font-bold text-slate-200">{row.district_name}</td>
                          <td className="px-3 py-2.5 font-mono">{row.score ?? "–"}</td>
                          <td className="px-3 py-2.5">{row.level}</td>
                          <td className="px-3 py-2.5 font-mono">{row.coverage}%</td>
                          {rawColumns.map(([key]) => (
                            <td key={key} className="px-3 py-2.5 font-mono text-slate-400">{formatValue(row[key], 4)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {viewMode === "guide" && (
              <PlainLanguageGuide
                module={mode === "flood" ? "decision-flood" : "decision-heat"}
                accent={mode === "flood" ? "sky" : "orange"}
                records={data?.rows ?? []}
                nameKey="district_name"
                year={year}
                activeArea={activeDistrict}
                dataSource={(summary?.sourceStatus ?? [])
                  .filter((source: any) => source.status === "available")
                  .map((source: any) => source.label)
                  .join(", ")}
                dataQuality={`ความครบถ้วนเฉลี่ย ${summary?.averageCoverage ?? 0}%`}
                extraSummary={[
                  `มี ${summary?.scoredDistricts ?? 0} เขตจาก 50 เขตที่มีข้อมูลเพียงพอสำหรับออกคะแนน`,
                  `เขตที่มีคะแนนตั้งแต่ 60 ขึ้นไปมี ${summary?.highDistricts ?? 0} เขต`,
                ]}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
