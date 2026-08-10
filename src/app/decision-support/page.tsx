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
  MapPin,
  RefreshCw,
  Trees,
  Users,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import InteractiveDistrictPanel from "@/components/map/InteractiveDistrictPanel";
import ResponsivePageSidebar from "@/components/map/ResponsivePageSidebar";
import ExportPanel from "@/components/ui/ExportPanel";
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

function formatCount(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "ไม่มีข้อมูล"
    : Math.round(value).toLocaleString("th-TH");
}

function heatFlagColor(flagCount: number | null | undefined, ready = true) {
  if (!ready || flagCount === null || flagCount === undefined) return "#64748b";
  if (flagCount >= 3) return "#b91c1c";
  if (flagCount === 2) return "#ea580c";
  if (flagCount === 1) return "#d97706";
  return "#0f766e";
}

function coolingAccessColor(value: number | null | undefined, threshold: number | null | undefined) {
  if (value === null || value === undefined || threshold === null || threshold === undefined) return "#64748b";
  return value < threshold ? "#dc2626" : "#0891b2";
}

function formatTableValue(key: string, value: number | null | undefined) {
  if (key === "population" || key === "population_density" || key.endsWith("_count")) return formatCount(value);
  if (key === "ndvi" || key === "ndbi") return formatValue(value, 4);
  if (key.includes("pct") || key.includes("minutes")) return formatValue(value, 1);
  return formatValue(value, 2);
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
              {source.quality && (
                <p className="mt-1 text-[9px] font-bold text-slate-400">
                  ชนิดข้อมูล: {source.quality === "administrative" ? "ข้อมูลทะเบียน" : source.quality === "model-derived" ? "ผลจากแบบจำลอง" : source.quality === "screening" ? "การคัดกรองระยะใกล้" : "ข้อมูลสังเกต"}
                </p>
              )}
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

function HeatScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="max-w-[250px] rounded-lg border border-slate-700 bg-slate-950 p-3 text-[11px] shadow-lg">
      <p className="font-bold text-slate-100">{row.district_name}</p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-slate-400">
        <dt>LST เฉลี่ยรายเขต</dt><dd className="font-mono text-slate-200">{formatValue(row.mean_lst)} °C</dd>
        <dt>ความหนาแน่น</dt><dd className="font-mono text-slate-200">{formatCount(row.population_density)} คน/ตร.กม.</dd>
        <dt>เข้าถึงพื้นที่คลายร้อน</dt><dd className="font-mono text-slate-200">{formatValue(row.recreation_access_pct, 1)}%</dd>
      </dl>
      <p className="mt-2 leading-5 text-slate-400">{row.screening?.label}</p>
    </div>
  );
}

function HeatFlagBadge({ active }: { active: boolean | null | undefined }) {
  if (active === null || active === undefined) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700 px-2 py-1 text-[9px] font-bold text-slate-500">
        <XCircle className="h-3 w-3" /> ข้อมูลไม่พอ
      </span>
    );
  }
  return active ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[9px] font-bold text-orange-300">
      <AlertTriangle className="h-3 w-3" /> เข้าเกณฑ์
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> ไม่เข้าเกณฑ์
    </span>
  );
}

export default function DecisionSupportPage() {
  const [mode, setMode] = useState<DecisionMode>("flood");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [baselineYear, setBaselineYear] = useState(Math.max(2018, CURRENT_YEAR - 1));
  const [queryReady, setQueryReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useDistrictUrlState();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sortKey, setSortKey] = useState("score");
  const [sortDescending, setSortDescending] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode: DecisionMode = params.get("mode") === "heat" ? "heat" : "flood";
    const requestedYear = Number(params.get("year"));
    const minimumYear = requestedMode === "heat" ? 2019 : 2018;
    const nextYear = Number.isInteger(requestedYear) && requestedYear >= minimumYear && requestedYear <= CURRENT_YEAR
      ? requestedYear
      : CURRENT_YEAR;
    const requestedBaseline = Number(params.get("baseline"));
    const nextBaseline = Number.isInteger(requestedBaseline) && requestedBaseline >= 2018 && requestedBaseline < nextYear
      ? requestedBaseline
      : Math.max(2018, nextYear - 1);
    setMode(requestedMode);
    setYear(nextYear);
    setBaselineYear(nextBaseline);
    setSortKey(requestedMode === "heat" ? "screening_flag_count" : "score");
    setQueryReady(true);
  }, []);

  useEffect(() => {
    if (!queryReady) return;
    const params = new URLSearchParams(window.location.search);
    params.set("mode", mode);
    params.set("year", String(year));
    if (mode === "heat") params.set("baseline", String(baselineYear));
    else params.delete("baseline");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [baselineYear, mode, queryReady, year]);

  useEffect(() => {
    if (!queryReady) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ mode, year: String(year) });
    if (mode === "heat") params.set("baseline", String(baselineYear));
    fetch(`/api/decision-support?${params.toString()}`, { signal: controller.signal })
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
  }, [baselineYear, mode, queryReady, year]);

  const scoredRows = useMemo(
    () => (data?.rows ?? []).filter((row: any) => typeof row.score === "number"),
    [data?.rows],
  );
  const heatRows = useMemo(
    () => (data?.rows ?? []).filter((row: any) => row.screening?.ready),
    [data?.rows],
  );
  const displayRows = useMemo(() => {
    const base = activeDistrict === "ทั้งหมด"
      ? [...(data?.rows ?? [])]
      : (data?.rows ?? []).filter((row: any) => row.district_name === activeDistrict);
    return base.sort((a: any, b: any) => {
      const av = sortKey === "screening_flag_count"
        ? a.screening?.flag_count
        : sortKey === "screening_label"
          ? a.screening?.label
          : sortKey.startsWith("screening_")
            ? a.screening?.[sortKey.replace("screening_", "")]
          : a[sortKey];
      const bv = sortKey === "screening_flag_count"
        ? b.screening?.flag_count
        : sortKey === "screening_label"
          ? b.screening?.label
          : sortKey.startsWith("screening_")
            ? b.screening?.[sortKey.replace("screening_", "")]
          : b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const comparison = typeof av === "string"
        ? av.localeCompare(bv, "th")
        : Number(av) - Number(bv);
      return sortDescending ? -comparison : comparison;
    });
  }, [activeDistrict, data?.rows, sortDescending, sortKey]);
  const selected = activeDistrict === "ทั้งหมด"
    ? (mode === "heat" ? heatRows[0] : scoredRows[0]) ?? data?.rows?.[0]
    : data?.rows?.find((row: any) => row.district_name === activeDistrict);
  const chartRows = (mode === "heat" ? heatRows : scoredRows).slice(0, 15);
  const summary = data?.summary;
  const heatScreening = summary?.heatScreening;
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
    metricLabel: mode === "heat" ? "อุณหภูมิผิวดิน" : "คะแนนคัดกรอง",
    primaryValue: mode === "heat" ? selected?.mean_lst : selected?.score,
    averageValue: mode === "heat" ? heatScreening?.averageLst : summary?.averageScore,
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
        ["mean_lst", "LST เฉลี่ยรายเขต", "°C"],
        ["lst_delta", `เปลี่ยนจาก ${baselineYear}`, "°C"],
        ["lst_p90", "LST P90", "°C"],
        ["population", "ประชากรตามทะเบียน", "คน"],
        ["population_density", "ความหนาแน่น", "คน/ตร.กม."],
        ["tree_cover_pct", "Tree Cover", "%"],
        ["ndvi", "NDVI", ""],
        ["recreation_access_pct", "เข้าถึงพื้นที่คลายร้อน", "%"],
        ["recreation_p90_minutes", "P90 proximity", "นาที"],
      ];
  const exportHeaders = mode === "heat"
    ? ["เขต", "จำนวนสัญญาณ", "LST สูง", "ประชากรหนาแน่น", "เข้าถึงพื้นที่คลายร้อนต่ำ", "คำอธิบาย", ...rawColumns.map(([, label, unit]) => `${label}${unit ? ` (${unit})` : ""}`)]
    : ["เขต", "คะแนน", "ระดับ", "Coverage", ...rawColumns.map(([, label, unit]) => `${label}${unit ? ` (${unit})` : ""}`)];
  const exportRows = (data?.rows ?? []).map((row: any) => mode === "heat"
    ? [
        row.district_name,
        row.screening?.flag_count ?? null,
        row.screening?.heat_high == null ? null : row.screening.heat_high ? "ใช่" : "ไม่ใช่",
        row.screening?.population_high == null ? null : row.screening.population_high ? "ใช่" : "ไม่ใช่",
        row.screening?.cooling_access_low == null ? null : row.screening.cooling_access_low ? "ใช่" : "ไม่ใช่",
        row.screening?.label ?? "ข้อมูลไม่พอ",
        ...rawColumns.map(([key]) => row[key] ?? null),
      ]
    : [row.district_name, row.score ?? null, row.level, row.coverage, ...rawColumns.map(([key]) => row[key] ?? null)]);
  const reportData = {
    title: data?.title ?? "Decision Support",
    subtitle: mode === "heat"
      ? "คัดกรอง 3 มิติแยกกัน โดยไม่สรุปเป็นดัชนีความเปราะบาง"
      : "คะแนนคัดกรองเพื่อช่วยจัดลำดับการตรวจสอบ",
    source: availableSources.map((source: any) => source.label).join(", "),
    period: data?.period ?? `ปี ${year}`,
    layer: mode === "heat" ? "LST + ประชากรทะเบียน + การเข้าถึงพื้นที่คลายร้อน" : "คะแนนคัดกรองน้ำท่วม",
    district: activeDistrict,
    kpis: mode === "heat"
      ? [
          { label: "เขตที่พร้อมคัดกรอง", value: `${heatScreening?.readyDistricts ?? 0}/50` },
          { label: "พบครบ 3 สัญญาณ", value: `${heatScreening?.allThreeFlagsDistricts ?? 0} เขต` },
          { label: "ประชากรทะเบียนในกลุ่ม 3 สัญญาณ", value: `${formatCount(heatScreening?.registeredPopulationInAllThree)} คน` },
        ]
      : [
          { label: "เขตที่ออกคะแนนได้", value: `${summary?.scoredDistricts ?? 0}/50` },
          { label: "คะแนนเฉลี่ย", value: String(summary?.averageScore ?? "–") },
          { label: "คะแนนตั้งแต่ 60", value: `${summary?.highDistricts ?? 0} เขต` },
        ],
    rankingHeaders: exportHeaders,
    rankingRows: exportRows.slice(0, 50),
    dataVintage: mode === "heat" ? `ประชากรทะเบียนปี ${heatScreening?.populationYear ?? "–"}; accessibility ปี ${heatScreening?.accessibilityPopulationYear ?? "–"}` : data?.period,
    generatedAt: new Date().toISOString(),
    resolution: mode === "heat" ? "สรุประดับเขต; ภาพดาวเทียมและ proximity screening" : "สรุประดับเขต",
  };

  function selectMode(nextMode: DecisionMode) {
    setMode(nextMode);
    if (nextMode === "heat" && year <= 2018) {
      setYear(2019);
      setBaselineYear(2018);
    }
    setActiveDistrict("ทั้งหมด");
    setSortKey(nextMode === "heat" ? "screening_flag_count" : "score");
    setSortDescending(true);
  }

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
          <h1 className="text-base font-black">
            {mode === "heat" ? "คัดกรองการรับสัมผัสความร้อน" : "วิเคราะห์เพื่อจัดลำดับการดำเนินงาน"}
          </h1>
          <p className="text-[10px] text-slate-500">
            {mode === "heat" ? "อ่าน LST ประชากร และการเข้าถึงพื้นที่คลายร้อนแยกกัน" : "ใช้เฉพาะข้อมูลสังเกตจริงและค่าที่คำนวณจากภาพจริง"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor={mode === "flood" ? "sky" : "orange"} />
          <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              onClick={() => selectMode("flood")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold ${mode === "flood" ? "bg-sky-500 text-white" : "text-slate-500"}`}
            >
              <Droplets className="h-3.5 w-3.5" /> น้ำท่วม
            </button>
            <button
              onClick={() => selectMode("heat")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold ${mode === "heat" ? "bg-orange-500 text-white" : "text-slate-500"}`}
            >
              <Flame className="h-3.5 w-3.5" /> ความร้อน
            </button>
          </div>
          <select
            value={year}
            onChange={(event) => {
              const nextYear = Number(event.target.value);
              setYear(nextYear);
              if (baselineYear >= nextYear) setBaselineYear(Math.max(2018, nextYear - 1));
            }}
            aria-label="ปีที่วิเคราะห์"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
          >
            {YEARS.filter((item) => mode === "flood" || item > 2018).map((item) => <option key={item}>{item}</option>)}
          </select>
          {mode === "heat" && (
            <select
              value={baselineYear}
              onChange={(event) => setBaselineYear(Number(event.target.value))}
              aria-label="ปีฐานสำหรับเปรียบเทียบความร้อน"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
            >
              {YEARS.filter((item) => item < year).map((item) => (
                <option key={item} value={item}>เทียบ {item}</option>
              ))}
            </select>
          )}
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
                districtName={activeDistrict !== "ทั้งหมด" ? activeDistrict : undefined}
                title={activeDistrict !== "ทั้งหมด" ? activeDistrict : "เลือกเขตบนแผนที่"}
                subtitle={activeDistrict !== "ทั้งหมด"
                  ? mode === "heat" ? "สรุปสามมิติจากพื้นที่ที่คลิก" : "สรุปคะแนนคัดกรองจากพื้นที่ที่คลิก"
                  : mode === "heat" ? "คลิกเขตเพื่อดู LST คน และพื้นที่คลายร้อน" : "คลิก polygon เขตเพื่อดูองค์ประกอบคะแนน"}
                onClear={() => setActiveDistrict("ทั้งหมด")}
                metrics={mode === "heat" ? [
                  { label: "LST เฉลี่ยรายเขต", value: `${formatValue(selected?.mean_lst)} °C`, rawValue: selected?.mean_lst, color: "#f97316" },
                  { label: `เปลี่ยนจาก ${baselineYear}`, value: `${selected?.lst_delta > 0 ? "+" : ""}${formatValue(selected?.lst_delta)} °C`, rawValue: selected?.lst_delta, color: "#fb923c" },
                  { label: "ความหนาแน่นทะเบียน", value: `${formatCount(selected?.population_density)} คน/ตร.กม.`, rawValue: selected?.population_density, color: "#a78bfa" },
                  { label: "เข้าถึงพื้นที่คลายร้อน", value: `${formatValue(selected?.recreation_access_pct, 1)}%`, rawValue: selected?.recreation_access_pct, color: coolingAccessColor(selected?.recreation_access_pct, heatScreening?.thresholds?.recreation_access_pct) },
                ] : [
                  { label: "คะแนนคัดกรอง", value: selected?.score != null ? `${selected.score}/100` : "ไม่มีข้อมูล", rawValue: selected?.score, color: scoreColor(selected?.score ?? null) },
                  { label: "Coverage", value: selected?.coverage != null ? `${selected.coverage}%` : "ไม่มีข้อมูล", rawValue: selected?.coverage, color: "#38bdf8" },
                  { label: "ฝนสะสม", value: formatValue(selected?.rainfall), rawValue: selected?.rainfall, color: "#0ea5e9" },
                  { label: "องค์ประกอบพร้อมใช้", value: `${selected?.components?.filter((component: any) => component.value != null).length ?? 0}/${selected?.components?.length ?? 0}`, rawValue: selected?.components?.filter((component: any) => component.value != null).length ?? 0, color: "#22c55e" },
                ]}
                showChart={mode !== "heat"}
                provenance={panelProvenance}
                insight={panelInsight}
              />
            </div>

            {selected && (
              <div className="mt-4 space-y-3">
                {mode === "heat" ? (
                  <>
                    <div
                      className="rounded-lg border border-slate-700 bg-slate-950/70 p-3"
                      style={{ borderColor: heatFlagColor(selected.screening?.flag_count, selected.screening?.ready) }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold text-slate-300">ผลคัดกรองเทียบค่ากลาง 50 เขต</span>
                        <span className="font-mono text-xs font-bold">{selected.screening?.flag_count ?? "–"}/3 สัญญาณ</span>
                      </div>
                      <p className="mt-1 text-[10px] leading-5 text-slate-400">{selected.screening?.label}</p>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/55">
                      <div className="flex items-start gap-3 border-b border-slate-800 p-3">
                        <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 text-[10px]"><span>LST เฉลี่ยรายเขต</span><strong className="ml-2">{formatValue(selected.mean_lst)} °C</strong></div>
                            <HeatFlagBadge active={selected.screening?.heat_high} />
                          </div>
                          <p className="mt-1 text-[9px] text-slate-500">เกณฑ์ ≥ {formatValue(heatScreening?.thresholds?.mean_lst)} °C · เฉลี่ยเชิงพื้นที่จากภาพ median · ผลต่าง {selected.lst_delta > 0 ? "+" : ""}{formatValue(selected.lst_delta)} °C จากปี {baselineYear} · ไม่ใช่อุณหภูมิอากาศ</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 border-b border-slate-800 p-3">
                        <Users className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 text-[10px]"><span>ประชากรตามทะเบียน</span><strong className="ml-2">{formatCount(selected.population)} คน</strong></div>
                            <HeatFlagBadge active={selected.screening?.population_high} />
                          </div>
                          <p className="mt-1 text-[9px] text-slate-500">{formatCount(selected.population_density)} คน/ตร.กม. · เกณฑ์ ≥ {formatCount(heatScreening?.thresholds?.population_density)} · ข้อมูลปี {selected.population_year}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 border-b border-slate-800 p-3">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 text-[10px]"><span>เข้าถึงพื้นที่คลายร้อน</span><strong className="ml-2">{formatValue(selected.recreation_access_pct, 1)}%</strong></div>
                            <HeatFlagBadge active={selected.screening?.cooling_access_low} />
                          </div>
                          <p className="mt-1 text-[9px] text-slate-500">เกณฑ์ต่ำกว่า {formatValue(heatScreening?.thresholds?.recreation_access_pct, 1)}% · P90 ประมาณ {formatValue(selected.recreation_p90_minutes, 1)} นาที · ไม่ใช่เวลาเดินทางจริง</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3">
                        <Trees className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 text-[10px]"><span>Tree Cover</span><strong>{formatValue(selected.tree_cover_pct, 1)}%</strong></div>
                          <p className="mt-1 text-[9px] text-slate-500">Dynamic World tree class · NDVI {formatValue(selected.ndvi, 3)} แสดงแยกกัน</p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
            <div className="mt-5">
              <ExportPanel
                reportData={reportData}
                csvFilename={`decision-support-${mode}-${year}`}
                csvHeaders={exportHeaders}
                csvRows={exportRows}
                accentColor={mode === "heat" ? "orange" : "sky"}
              />
            </div>
            </div>
          </ResponsivePageSidebar>

          <main className="min-w-0 flex-1 overflow-auto">
            {viewMode === "map" && (
              <div className="relative h-full min-h-[520px]">
                <DecisionSupportMap data={data?.geojson} mode={mode} activeDistrict={activeDistrict} onDistrictSelect={(districtName) => {
                  setActiveDistrict(districtName);
                  setMobileSidebarOpen(true);
                }} />
                <div className="absolute bottom-4 right-4 z-[1000] rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-[9px] shadow-xl">
                  {(mode === "heat" ? [
                    ["#b91c1c", "พบครบ 3 สัญญาณ"],
                    ["#ea580c", "พบ 2 สัญญาณ"],
                    ["#d97706", "พบ 1 สัญญาณ"],
                    ["#0f766e", "ไม่พบสัญญาณตามเกณฑ์"],
                    ["#64748b", "ข้อมูลไม่พอ"],
                  ] : [
                    ["#b91c1c", "80-100 สูงมาก"],
                    ["#f97316", "60-79 สูง"],
                    ["#eab308", "40-59 ปานกลาง"],
                    ["#16a34a", "0-39 ต่ำ"],
                    ["#64748b", "ข้อมูลไม่พอ / ไม่มีข้อมูล"],
                  ]).map(([color, label]) => (
                    <div key={label} className="flex items-center gap-2 py-0.5 text-slate-400">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} /> {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewMode === "stats" && (
              <div className="space-y-4 p-5">
                {mode === "heat" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        ["เขตที่มีข้อมูลครบ 3 มิติ", `${heatScreening?.readyDistricts ?? 0}/50`],
                        ["พบครบ 3 สัญญาณ", `${heatScreening?.allThreeFlagsDistricts ?? 0} เขต`],
                        ["ประชากรทะเบียนในกลุ่ม 3 สัญญาณ", `${formatCount(heatScreening?.registeredPopulationInAllThree)} คน`],
                        ["LST เฉลี่ยรายเขต", `${formatValue(heatScreening?.averageLst)} °C`],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                          <div className="text-[10px] text-slate-500">{label}</div>
                          <div className="mt-1 text-xl font-black">{value}</div>
                        </div>
                      ))}
                    </div>

                    {heatRows.length ? (
                      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                        <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                          <h3 className="text-xs font-black">ความร้อนเทียบกับความหนาแน่นประชากรทะเบียน</h3>
                          <p className="mt-1 text-[10px] leading-5 text-slate-500">
                            จุดหนึ่งจุดแทนหนึ่งเขต สีแดงหมายถึงการเข้าถึงพื้นที่นันทนาการต่ำกว่าค่ากลาง เส้นประแบ่งด้วยค่ากลางของ 50 เขต
                          </p>
                          <div className="mt-4 h-[420px]">
                            <ResponsiveContainer
                              width="100%"
                              height="100%"
                              minWidth={1}
                              minHeight={1}
                              initialDimension={{ width: 800, height: 420 }}
                            >
                              <ScatterChart margin={{ top: 12, right: 18, bottom: 24, left: 18 }}>
                                <CartesianGrid stroke="#1e293b" />
                                <XAxis
                                  type="number"
                                  dataKey="mean_lst"
                                  name="LST เฉลี่ยรายเขต"
                                  unit=" °C"
                                  domain={["dataMin - 1", "dataMax + 1"]}
                                  stroke="#94a3b8"
                                  fontSize={10}
                                  label={{ value: "LST เฉลี่ยรายเขต (°C)", position: "insideBottom", offset: -16, fill: "#64748b", fontSize: 10 }}
                                />
                                <YAxis
                                  type="number"
                                  dataKey="population_density"
                                  name="ความหนาแน่นประชากรทะเบียน"
                                  stroke="#94a3b8"
                                  fontSize={10}
                                  tickFormatter={(value) => Number(value).toLocaleString("th-TH")}
                                />
                                <ZAxis range={[70, 70]} />
                                <ReferenceLine x={heatScreening?.thresholds?.mean_lst} stroke="#fb923c" strokeDasharray="4 4" />
                                <ReferenceLine y={heatScreening?.thresholds?.population_density} stroke="#a78bfa" strokeDasharray="4 4" />
                                <Tooltip content={<HeatScatterTooltip />} />
                                <Scatter data={heatRows}>
                                  {heatRows.map((row: any) => (
                                    <Cell
                                      key={row.district_name}
                                      fill={coolingAccessColor(row.recreation_access_pct, heatScreening?.thresholds?.recreation_access_pct)}
                                    />
                                  ))}
                                </Scatter>
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </section>
                        <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                          <h3 className="text-xs font-black">เกณฑ์คัดกรองที่ใช้</h3>
                          <p className="mt-1 text-[10px] leading-5 text-slate-500">
                            เกณฑ์เป็นค่ากลางของเขตที่มีข้อมูลครบ ใช้ชี้จุดเริ่มตรวจสอบ ไม่ใช่เส้นแบ่งอันตรายทางสุขภาพ
                          </p>
                          <dl className="mt-4 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/50">
                            <div className="flex items-center justify-between gap-4 p-3 text-[11px]">
                              <dt className="flex items-center gap-2 text-slate-400"><Flame className="h-4 w-4 text-orange-400" /> LST สูง</dt>
                              <dd className="text-right font-mono font-bold">≥ {formatValue(heatScreening?.thresholds?.mean_lst)} °C <span className="block text-[9px] font-normal text-slate-500">{heatScreening?.heatHighDistricts ?? 0} เขต</span></dd>
                            </div>
                            <div className="flex items-center justify-between gap-4 p-3 text-[11px]">
                              <dt className="flex items-center gap-2 text-slate-400"><Users className="h-4 w-4 text-violet-400" /> คนหนาแน่น</dt>
                              <dd className="text-right font-mono font-bold">≥ {formatCount(heatScreening?.thresholds?.population_density)} <span className="block text-[9px] font-normal text-slate-500">{heatScreening?.populationHighDistricts ?? 0} เขต</span></dd>
                            </div>
                            <div className="flex items-center justify-between gap-4 p-3 text-[11px]">
                              <dt className="flex items-center gap-2 text-slate-400"><MapPin className="h-4 w-4 text-cyan-400" /> เข้าถึงต่ำ</dt>
                              <dd className="text-right font-mono font-bold">&lt; {formatValue(heatScreening?.thresholds?.recreation_access_pct, 1)}% <span className="block text-[9px] font-normal text-slate-500">{heatScreening?.coolingAccessLowDistricts ?? 0} เขต</span></dd>
                            </div>
                          </dl>
                          <div className="mt-4 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-[10px] leading-5 text-slate-400">
                            หน้านี้ไม่รวม 3 มิติเป็นคะแนน Heat Vulnerability เพราะยังไม่มีข้อมูลกลุ่มเปราะบางด้านอายุ สุขภาพ หรือสภาพที่อยู่อาศัยที่ตรวจสอบแล้ว
                          </div>
                          <h3 className="mt-6 text-xs font-black">หลักฐานประกอบ</h3>
                          <div className="mt-3">
                            <SourceStatusPanel sources={summary?.sourceStatus ?? []} />
                          </div>
                        </section>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
                        ยังไม่มีเขตที่มีข้อมูลครบทั้ง LST ประชากรทะเบียน และการเข้าถึงพื้นที่คลายร้อน กรุณาตรวจสถานะแหล่งข้อมูลด้านซ้าย
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
                        {(mode === "heat" ? [
                          ["district_name", "เขต"],
                          ["screening_flag_count", "สัญญาณที่พบ"],
                          ["screening_heat_high", "LST สูง"],
                          ["screening_population_high", "คนหนาแน่น"],
                          ["screening_cooling_access_low", "เข้าถึงต่ำ"],
                          ["screening_label", "คำอธิบาย"],
                          ...rawColumns.map(([key, label, unit]) => [key, `${label}${unit ? ` (${unit})` : ""}`]),
                        ] : [
                          ["district_name", "เขต"],
                          ["score", "คะแนน"],
                          ["level", "ระดับ"],
                          ["coverage", "Coverage"],
                          ...rawColumns.map(([key, label, unit]) => [key, `${label}${unit ? ` (${unit})` : ""}`]),
                        ]).map(([key, label]) => (
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
                          {mode === "heat" ? (
                            <>
                              <td className="px-3 py-2.5 font-mono">{row.screening?.flag_count ?? "–"}/3</td>
                              <td className="px-3 py-2.5"><HeatFlagBadge active={row.screening?.heat_high} /></td>
                              <td className="px-3 py-2.5"><HeatFlagBadge active={row.screening?.population_high} /></td>
                              <td className="px-3 py-2.5"><HeatFlagBadge active={row.screening?.cooling_access_low} /></td>
                              <td className="max-w-[260px] px-3 py-2.5 leading-5 text-slate-400">{row.screening?.label ?? "ข้อมูลไม่พอ"}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2.5 font-mono">{row.score ?? "–"}</td>
                              <td className="px-3 py-2.5">{row.level}</td>
                              <td className="px-3 py-2.5 font-mono">{row.coverage}%</td>
                            </>
                          )}
                          {rawColumns.map(([key]) => (
                            <td key={key} className="px-3 py-2.5 font-mono text-slate-400">{formatTableValue(key, row[key])}</td>
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
                dataQuality={mode === "heat"
                  ? `มีข้อมูลครบทั้ง 3 มิติ ${heatScreening?.readyDistricts ?? 0} จาก 50 เขต; ประชากรทะเบียนปี ${heatScreening?.populationYear ?? "–"}`
                  : `ความครบถ้วนเฉลี่ย ${summary?.averageCoverage ?? 0}%`}
                extraSummary={mode === "heat" ? [
                  `มี ${heatScreening?.allThreeFlagsDistricts ?? 0} เขตที่พบทั้ง LST สูง ประชากรทะเบียนหนาแน่น และการเข้าถึงพื้นที่คลายร้อนต่ำเมื่อเทียบค่ากลาง 50 เขต`,
                  `ประชากรตามทะเบียนในเขตกลุ่มดังกล่าวรวม ${formatCount(heatScreening?.registeredPopulationInAllThree)} คน โดยไม่ควรตีความเป็นจำนวนผู้ได้รับผลกระทบจริง`,
                  `Tree Cover และ NDVI ใช้เป็นหลักฐานประกอบคนละความหมาย และไม่ได้รวมเป็นคะแนน Heat Vulnerability`,
                ] : [
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
