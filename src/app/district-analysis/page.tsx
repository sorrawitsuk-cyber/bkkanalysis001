/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Home, Download, Printer, TrendingUp, TrendingDown, Minus,
  ChevronDown, Flame, Trees, Building2, Wind, Droplets, Moon, Search, X,
  ArrowUp, ArrowDown,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Bar, Cell,
} from "recharts";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface YearMetrics {
  mean_lst: number | null; max_lst: number | null;
  ndvi_mean: number | null; green_area_rai: number | null; green_area_ratio: number | null;
  ndbi_mean: number | null; builtup_area_rai: number | null;
  no2_mean: number | null; co_mean: number | null; so2_mean: number | null;
  pollution_score: number | null; water_ratio: number | null;
  water_area_rai: number | null; ndwi_mean: number | null;
  ntl_mean: number | null; ntl_max: number | null;
}
interface ProfileData {
  district: string; areaRai: number; years: number[];
  metrics: Record<number, YearMetrics>; bkkAverages: Record<number, YearMetrics>;
}
interface DistrictRow {
  name_th: string; id: number; district_area_rai: number;
  mean_lst: number | null; max_lst: number | null;
  ndvi_mean: number | null; green_area_ratio: number | null; green_area_rai: number | null;
  ndbi_mean: number | null; builtup_area_rai: number | null; builtup_ratio: number | null;
  no2_mean: number | null; pollution_score: number | null;
  water_ratio: number | null; ntl_mean: number | null;
}
interface OverviewData {
  year: number; districts: DistrictRow[];
  ndviTrend: Array<[string, number]>;
  greenTrend: Array<[string, number]>;
  lstTrend: Array<[string, number]>;
}
type SortKey = keyof DistrictRow;

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, decimals = 2, suffix = ""): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v.toFixed(decimals)}${suffix}`;
}
function fmtRai(v: number | null | undefined): string {
  if (v == null) return "–";
  return `${Math.round(v).toLocaleString()} ไร่`;
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "–";
  return `${(v * 100).toFixed(1)}%`;
}
function numAvg(arr: (number | null | undefined)[]): number | null {
  const ns = arr.filter((v): v is number => typeof v === "number" && isFinite(v));
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
}

function DeltaBadge({ delta, invert = false, unit = "" }: { delta: number | null; invert?: boolean; unit?: string }) {
  if (delta == null || !Number.isFinite(delta)) return <span className="text-slate-600 text-[10px]">–</span>;
  const isPositive = delta > 0;
  const isBad = invert ? !isPositive : isPositive;
  const abs = Math.abs(delta);
  const disp = abs < 0.0001 ? abs.toExponential(2) : abs.toFixed(Math.abs(delta) < 1 ? 4 : 2);
  if (Math.abs(delta) < 0.00001) return <span className="text-slate-500 text-[10px] flex items-center gap-0.5"><Minus className="h-3 w-3" />เท่าเดิม</span>;
  const color = isBad ? "text-red-400" : "text-emerald-400";
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-bold ${color}`}>
      <Icon className="h-3 w-3" />{isPositive ? "+" : "-"}{disp}{unit}
    </span>
  );
}

function DeltaSpan({ delta, lowerIsBetter = false, unit = "", scientific = false }: {
  delta: number; lowerIsBetter?: boolean; unit?: string; scientific?: boolean;
}) {
  const abs = Math.abs(delta);
  if (abs < 1e-8) return <span className="text-[9px] text-slate-600 block">±0</span>;
  const isGood = lowerIsBetter ? delta < 0 : delta > 0;
  const sign = delta > 0 ? "+" : "";
  let str: string;
  if (scientific || abs < 0.0001) str = sign + delta.toExponential(1);
  else if (abs < 0.001) str = sign + delta.toFixed(5);
  else if (abs < 1) str = sign + delta.toFixed(4);
  else if (abs < 10) str = sign + delta.toFixed(2);
  else if (abs < 1000) str = sign + Math.round(delta).toString();
  else str = sign + Math.round(delta).toLocaleString();
  if (unit) str += " " + unit;
  return <span className={`text-[9px] font-bold block leading-none mt-0.5 tabular-nums ${isGood ? "text-emerald-400" : "text-red-400"}`}>{str}</span>;
}

function MetricCard({ icon: Icon, label, value, sub, delta, deltaInvert = false, deltaUnit = "", color, iconBg }: {
  icon: any; label: string; value: string; sub?: string; delta: number | null;
  deltaInvert?: boolean; deltaUnit?: string; color: string; iconBg: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      </div>
      <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
      <DeltaBadge delta={delta} invert={deltaInvert} unit={deltaUnit} />
    </div>
  );
}

function TrendChart({ data, districtKey, bkkKey, label, color, unit, decimals = 2, connectNulls = true }: {
  data: any[]; districtKey: string; bkkKey: string;
  label: string; color: string; unit: string; decimals?: number; connectNulls?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 text-[11px] font-semibold text-slate-400">{label}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v) => typeof v === "number" ? v.toFixed(decimals) : v} width={45} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
            formatter={(v: unknown, name: unknown) => [
              typeof v === "number" ? `${v.toFixed(decimals)} ${unit}` : "–",
              name === districtKey ? "เขตนี้" : "เฉลี่ย กทม.",
            ] as [string, string]} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => v === districtKey ? "เขตนี้" : "เฉลี่ย กทม."} />
          <Line type="monotone" dataKey={districtKey} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={connectNulls} name={districtKey} />
          <Line type="monotone" dataKey={bkkKey} stroke="#475569" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls={connectNulls} name={bkkKey} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Overview mini trend chart
// ────────────────────────────────────────────────────────────────
function MiniTrend({ data, dataKey, label, color, unit, decimals = 2 }: {
  data: any[]; dataKey: string; label: string; color: string; unit: string; decimals?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 text-[11px] font-semibold text-slate-400">{label}</div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v) => typeof v === "number" ? v.toFixed(decimals) : v} width={42} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
            formatter={(v: unknown) => [typeof v === "number" ? `${v.toFixed(decimals)} ${unit}` : "–", label] as [string, string]} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Bar metric config
// ────────────────────────────────────────────────────────────────
const BAR_METRICS: { key: SortKey; label: string; color: string; fmt: (v: number) => string; lowerIsBetter?: boolean }[] = [
  { key: "ndvi_mean",       label: "NDVI",          color: "#10b981", fmt: (v) => v.toFixed(3) },
  { key: "green_area_rai",  label: "พื้นที่เขียว",  color: "#34d399", fmt: (v) => `${Math.round(v).toLocaleString()} ไร่` },
  { key: "mean_lst",        label: "LST (°C)",      color: "#f97316", fmt: (v) => `${v.toFixed(1)}°C`, lowerIsBetter: true },
  { key: "ndbi_mean",       label: "NDBI",          color: "#f59e0b", fmt: (v) => v.toFixed(3), lowerIsBetter: true },
  { key: "ntl_mean",        label: "แสงไฟ NTL",    color: "#fbbf24", fmt: (v) => v.toFixed(1) },
  { key: "pollution_score", label: "มลพิษ",         color: "#a78bfa", fmt: (v) => v.toFixed(2), lowerIsBetter: true },
  { key: "water_ratio",     label: "สัดส่วนน้ำ",   color: "#38bdf8", fmt: (v) => `${(v * 100).toFixed(1)}%` },
];

// ────────────────────────────────────────────────────────────────
// Sortable column header
// ────────────────────────────────────────────────────────────────
function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:text-slate-300 transition-colors"
      style={{ color: active ? "#94a3b8" : "#475569" }}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (sortDir === "desc" ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />) : null}
      </span>
    </th>
  );
}

// ────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

export default function DistrictAnalysisPage() {
  const [districts, setDistricts] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2024);
  const [compareYear, setCompareYear] = useState(2018);
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTableDelta, setShowTableDelta] = useState(false);

  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("ndvi_mean");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeBarMetric, setActiveBarMetric] = useState<SortKey>("ndvi_mean");

  // Load district list
  useEffect(() => {
    fetch("/api/district-profile")
      .then((r) => r.json())
      .then((d) => setDistricts(d.districts ?? []));
  }, []);

  // Load district profile
  useEffect(() => {
    if (!selectedDistrict) { setData(null); return; }
    setLoading(true); setError(null);
    fetch(`/api/district-profile?district=${encodeURIComponent(selectedDistrict)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDistrict]);

  // Load overview data (only when no district selected)
  useEffect(() => {
    if (selectedDistrict) return;
    setOverviewLoading(true);
    Promise.all([
      fetch(`/api/district-metrics?metric=vegetation&year=${selectedYear}`).then((r) => r.json()),
      fetch(`/api/district-metrics?metric=lst&year=${selectedYear}`).then((r) => r.json()),
    ]).then(([vegResp, lstResp]) => {
      const rows: DistrictRow[] = (vegResp.geojson?.features ?? []).map((f: any) => {
        const p = f.properties;
        return {
          name_th: p.name_th, id: p.id,
          district_area_rai: p.district_area_rai ?? 0,
          mean_lst: p.mean_lst ?? null, max_lst: p.max_lst ?? null,
          ndvi_mean: p.ndvi_mean ?? null,
          green_area_ratio: p.green_area_ratio ?? null,
          green_area_rai: p.green_area_rai ?? null,
          ndbi_mean: p.ndbi_mean ?? null,
          builtup_area_rai: p.builtup_area_rai ?? null,
          builtup_ratio: p.builtup_ratio ?? null,
          no2_mean: p.no2_mean ?? null,
          pollution_score: p.pollution_score ?? null,
          water_ratio: p.water_ratio ?? null,
          ntl_mean: p.ntl_mean ?? null,
        };
      });
      setOverviewData({
        year: selectedYear, districts: rows,
        ndviTrend: vegResp.summary?.yearlyTrend ?? [],
        greenTrend: vegResp.summary?.greenAreaTrend ?? [],
        lstTrend: lstResp.summary?.yearlyTrend ?? [],
      });
    }).catch(console.error).finally(() => setOverviewLoading(false));
  }, [selectedYear, selectedDistrict]);

  const filteredDistricts = useMemo(
    () => districts.filter((d) => d.includes(districtSearch.trim())),
    [districts, districtSearch]
  );

  // Sorted district table
  const sortedDistricts = useMemo(() => {
    if (!overviewData?.districts) return [];
    return [...overviewData.districts].sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = (b[sortKey] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [overviewData, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  // BKK avg KPIs
  const bkkAvg = useMemo(() => {
    if (!overviewData?.districts.length) return null;
    const ds = overviewData.districts;
    return {
      ndvi: numAvg(ds.map((d) => d.ndvi_mean)),
      lst: numAvg(ds.map((d) => d.mean_lst)),
      green: ds.reduce((s, d) => s + (d.green_area_rai ?? 0), 0),
      ntl: numAvg(ds.map((d) => d.ntl_mean)),
      pollution: numAvg(ds.map((d) => d.pollution_score)),
      water: numAvg(ds.map((d) => d.water_ratio)),
    };
  }, [overviewData]);

  // Combined trend
  const combinedTrend = useMemo(() => {
    const byYear: Record<string, any> = {};
    (overviewData?.ndviTrend ?? []).forEach(([yr, v]) => { byYear[yr] = { year: yr, ndvi: v }; });
    (overviewData?.lstTrend ?? []).forEach(([yr, v]) => { if (byYear[yr]) byYear[yr].lst = v; else byYear[yr] = { year: yr, lst: v }; });
    (overviewData?.greenTrend ?? []).forEach(([yr, v]) => { if (byYear[yr]) byYear[yr].green = Math.round(v / 1000); });
    return Object.values(byYear).sort((a, b) => Number(a.year) - Number(b.year));
  }, [overviewData]);

  // Bar chart data for selected metric
  const activeCfg = BAR_METRICS.find((m) => m.key === activeBarMetric) ?? BAR_METRICS[0];
  const barData = useMemo(() => {
    if (!overviewData?.districts) return [];
    return [...overviewData.districts]
      .filter((d) => (d[activeBarMetric] as number | null) != null)
      .sort((a, b) => (b[activeBarMetric] as number) - (a[activeBarMetric] as number))
      .map((d, i, arr) => ({
        name: d.name_th,
        value: d[activeBarMetric] as number,
        isTop: i < 5,
        isBot: i >= arr.length - 5,
      }));
  }, [overviewData, activeBarMetric]);

  // Per-district helpers
  const cur = data?.metrics[selectedYear];
  const base = data?.metrics[compareYear];
  function delta(key: keyof YearMetrics): number | null {
    const c = cur?.[key] as number | null;
    const b = base?.[key] as number | null;
    if (c == null || b == null) return null;
    return c - b;
  }
  const trendData = useMemo(() => {
    if (!data) return [];
    return data.years.map((yr) => ({
      year: yr,
      district_lst: data.metrics[yr]?.mean_lst ?? null, bkk_lst: data.bkkAverages[yr]?.mean_lst ?? null,
      district_ndvi: data.metrics[yr]?.ndvi_mean ?? null, bkk_ndvi: data.bkkAverages[yr]?.ndvi_mean ?? null,
      district_green: data.metrics[yr]?.green_area_rai ?? null, bkk_green: data.bkkAverages[yr]?.green_area_rai ?? null,
      district_builtup: data.metrics[yr]?.builtup_area_rai ?? null, bkk_builtup: data.bkkAverages[yr]?.builtup_area_rai ?? null,
      district_air: data.metrics[yr]?.pollution_score ?? null, bkk_air: data.bkkAverages[yr]?.pollution_score ?? null,
      district_ntl: data.metrics[yr]?.ntl_mean ?? null, bkk_ntl: data.bkkAverages[yr]?.ntl_mean ?? null,
    }));
  }, [data]);
  const comparisonData = useMemo(() => {
    if (!cur || !data?.bkkAverages[selectedYear]) return [];
    const bkk = data.bkkAverages[selectedYear];
    return [
      { label: "LST (°C)", district: cur.mean_lst, bkk: bkk.mean_lst, color: "#f97316" },
      { label: "NDVI ×100", district: cur.ndvi_mean != null ? cur.ndvi_mean * 100 : null, bkk: bkk.ndvi_mean != null ? bkk.ndvi_mean * 100 : null, color: "#10b981" },
      { label: "พื้นที่เขียว (%)", district: cur.green_area_ratio != null ? cur.green_area_ratio * 100 : null, bkk: bkk.green_area_ratio != null ? bkk.green_area_ratio * 100 : null, color: "#34d399" },
      { label: "NDBI ×100", district: cur.ndbi_mean != null ? cur.ndbi_mean * 100 : null, bkk: bkk.ndbi_mean != null ? bkk.ndbi_mean * 100 : null, color: "#f59e0b" },
      { label: "คุณภาพอากาศ", district: cur.pollution_score, bkk: bkk.pollution_score, color: "#a78bfa" },
      { label: "NTL Mean", district: cur.ntl_mean, bkk: bkk.ntl_mean, color: "#fbbf24" },
    ].filter((m): m is typeof m & { district: number; bkk: number } => m.district != null && m.bkk != null);
  }, [cur, data, selectedYear]);
  const yearlyDeltas = useMemo(() => {
    if (!data) return {} as Record<number, Partial<YearMetrics>>;
    const sorted = [...data.years].sort((a, b) => a - b);
    const out: Record<number, Partial<YearMetrics>> = {};
    sorted.forEach((yr, i) => {
      if (i === 0) return;
      const curr = data.metrics[yr]; const prev = data.metrics[sorted[i - 1]];
      if (!curr || !prev) return;
      const entry: Partial<YearMetrics> = {};
      (Object.keys(curr) as (keyof YearMetrics)[]).forEach((key) => {
        const c = curr[key] as number | null; const p = prev[key] as number | null;
        (entry as any)[key] = c != null && p != null ? c - p : null;
      });
      out[yr] = entry;
    });
    return out;
  }, [data]);
  const exportCSV = useCallback(() => {
    if (!data) return;
    const headers = ["เขต","พื้นที่รวม(ไร่)","ปี","LST เฉลี่ย(°C)","LST สูงสุด(°C)","NDVI","พื้นที่สีเขียว(ไร่)","สัดส่วนสีเขียว(%)","NDBI","สิ่งปลูกสร้าง(ไร่)","NO₂(mol/m²)","CO(mol/m²)","SO₂(mol/m²)","คะแนนมลพิษ","สัดส่วนน้ำ(%)","พื้นที่น้ำ(ไร่)","NDWI","NTL Mean(nW/sr/cm²)","NTL Max(nW/sr/cm²)"].join(",");
    const rows = data.years.map((yr) => {
      const m = data.metrics[yr] ?? {};
      return [`"${data.district}"`,data.areaRai,yr,m.mean_lst?.toFixed(2)??"",m.max_lst?.toFixed(2)??"",m.ndvi_mean?.toFixed(4)??"",m.green_area_rai?.toFixed(0)??"",m.green_area_ratio!=null?(m.green_area_ratio*100).toFixed(2):"",m.ndbi_mean?.toFixed(4)??"",m.builtup_area_rai?.toFixed(0)??"",m.no2_mean?.toFixed(6)??"",m.co_mean?.toFixed(4)??"",m.so2_mean?.toFixed(6)??"",m.pollution_score?.toFixed(2)??"",m.water_ratio!=null?(m.water_ratio*100).toFixed(2):"",m.water_area_rai?.toFixed(0)??"",m.ndwi_mean?.toFixed(4)??"",m.ntl_mean?.toFixed(3)??"",m.ntl_max?.toFixed(3)??""
      ].join(",");
    }).join("\n");
    const blob = new Blob(["﻿" + headers + "\n" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `district_profile_${data.district}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const exportOverviewCSV = useCallback(() => {
    if (!overviewData) return;
    const headers = ["เขต","พื้นที่(ไร่)","NDVI","พื้นที่เขียว(ไร่)","สัดส่วนเขียว(%)","LST เฉลี่ย(°C)","NDBI","สิ่งปลูกสร้าง(ไร่)","มลพิษ","สัดส่วนน้ำ(%)","NTL Mean"].join(",");
    const rows = sortedDistricts.map((d) => [
      `"${d.name_th}"`, d.district_area_rai,
      d.ndvi_mean?.toFixed(4)??"", d.green_area_rai!=null?Math.round(d.green_area_rai):"", d.green_area_ratio!=null?(d.green_area_ratio*100).toFixed(1):"",
      d.mean_lst?.toFixed(2)??"", d.ndbi_mean?.toFixed(4)??"", d.builtup_area_rai!=null?Math.round(d.builtup_area_rai):"",
      d.pollution_score?.toFixed(2)??"", d.water_ratio!=null?(d.water_ratio*100).toFixed(2):"", d.ntl_mean?.toFixed(2)??""
    ].join(",")).join("\n");
    const blob = new Blob(["﻿" + headers + "\n" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `bkk_overview_${selectedYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [overviewData, sortedDistricts, selectedYear]);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-50 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur z-20">
        <Link href="/" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors shrink-0">
          <Home className="h-3.5 w-3.5" /> Bangkok Analytics
        </Link>
        <div className="h-4 w-px bg-slate-700 shrink-0" />
        <span className="text-[13px] font-black text-slate-200 shrink-0">วิเคราะห์รายเขต</span>
        <div className="flex-1" />

        {/* District picker */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[12px] font-bold text-slate-200 hover:border-slate-500 transition-colors min-w-[160px]"
          >
            <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span className="flex-1 text-left truncate">{selectedDistrict || "เลือกเขต…"}</span>
            {selectedDistrict
              ? <X className="h-3.5 w-3.5 text-slate-500 shrink-0 hover:text-slate-300" onClick={(e) => { e.stopPropagation(); setSelectedDistrict(""); setShowDropdown(false); }} />
              : <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
          </button>
          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-slate-800">
                <input autoFocus value={districtSearch} onChange={(e) => setDistrictSearch(e.target.value)}
                  placeholder="ค้นหาเขต…" className="w-full rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none" />
              </div>
              <div className="max-h-52 overflow-y-auto custom-scrollbar">
                {filteredDistricts.map((d) => (
                  <button key={d} onClick={() => { setSelectedDistrict(d); setDistrictSearch(""); setShowDropdown(false); }}
                    className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-800 transition-colors ${selectedDistrict === d ? "text-cyan-400 font-bold bg-cyan-950/40" : "text-slate-300"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Year pickers */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 font-semibold">ปี</span>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-slate-200 text-[12px] focus:outline-none">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {selectedDistrict && <>
            <span className="text-slate-600">vs</span>
            <select value={compareYear} onChange={(e) => setCompareYear(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-slate-500 text-[12px] focus:outline-none">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </>}
        </div>

        {data && (
          <>
            <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">
              <Printer className="h-3.5 w-3.5" /> พิมพ์
            </button>
          </>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" onClick={() => showDropdown && setShowDropdown(false)}>

        {/* ════ OVERVIEW MODE (no district selected) ════ */}
        {!selectedDistrict && (
          <div className="p-5 space-y-5">

            {overviewLoading && (
              <div className="flex items-center justify-center h-40">
                <div className="text-[12px] font-bold text-cyan-400 animate-pulse uppercase tracking-widest">กำลังโหลดข้อมูล…</div>
              </div>
            )}

            {overviewData && !overviewLoading && (
              <>
                {/* Header */}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h1 className="text-xl font-black text-slate-100">ภาพรวมกรุงเทพมหานคร</h1>
                  <span className="text-[11px] font-semibold text-slate-500">50 เขต · ปี {selectedYear}</span>
                  <span className="text-[11px] text-slate-600">· คลิกเขตในตารางเพื่อดูรายละเอียด</span>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10"><Trees className="h-3.5 w-3.5 text-emerald-400" /></div>
                      <span className="text-[11px] font-semibold text-slate-500">NDVI เฉลี่ย</span>
                    </div>
                    <div className="text-xl font-black tabular-nums text-emerald-400">{bkkAvg?.ndvi != null ? bkkAvg.ndvi.toFixed(3) : "–"}</div>
                    <div className="text-[10px] text-slate-500">ค่าเฉลี่ย 50 เขต</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10"><Trees className="h-3.5 w-3.5 text-emerald-300" /></div>
                      <span className="text-[11px] font-semibold text-slate-500">พื้นที่สีเขียวรวม</span>
                    </div>
                    <div className="text-xl font-black tabular-nums text-emerald-300">{bkkAvg?.green != null ? `${bkkAvg.green.toLocaleString()}` : "–"}</div>
                    <div className="text-[10px] text-slate-500">ไร่รวมทั้ง กทม.</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10"><Flame className="h-3.5 w-3.5 text-orange-400" /></div>
                      <span className="text-[11px] font-semibold text-slate-500">LST เฉลี่ย</span>
                    </div>
                    <div className="text-xl font-black tabular-nums text-orange-400">{bkkAvg?.lst != null ? `${bkkAvg.lst.toFixed(1)} °C` : "–"}</div>
                    <div className="text-[10px] text-slate-500">อุณหภูมิพื้นผิวเฉลี่ย</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-500/10"><Moon className="h-3.5 w-3.5 text-yellow-400" /></div>
                      <span className="text-[11px] font-semibold text-slate-500">NTL เฉลี่ย</span>
                    </div>
                    <div className="text-xl font-black tabular-nums text-yellow-400">{bkkAvg?.ntl != null ? bkkAvg.ntl.toFixed(1) : "–"}</div>
                    <div className="text-[10px] text-slate-500">nW/sr/cm² แสงไฟ</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10"><Wind className="h-3.5 w-3.5 text-purple-400" /></div>
                      <span className="text-[11px] font-semibold text-slate-500">มลพิษเฉลี่ย</span>
                    </div>
                    <div className="text-xl font-black tabular-nums text-purple-400">{bkkAvg?.pollution != null ? `${bkkAvg.pollution.toFixed(2)} /10` : "–"}</div>
                    <div className="text-[10px] text-slate-500">คะแนนมลพิษรวม</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10"><Droplets className="h-3.5 w-3.5 text-sky-400" /></div>
                      <span className="text-[11px] font-semibold text-slate-500">สัดส่วนน้ำเฉลี่ย</span>
                    </div>
                    <div className="text-xl font-black tabular-nums text-sky-400">{bkkAvg?.water != null ? `${(bkkAvg.water * 100).toFixed(2)}%` : "–"}</div>
                    <div className="text-[10px] text-slate-500">พื้นที่น้ำเฉลี่ย</div>
                  </div>
                </div>

                {/* Trend charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <MiniTrend data={combinedTrend} dataKey="ndvi" label="NDVI เฉลี่ย กทม. รายปี" color="#10b981" unit="" decimals={3} />
                  <MiniTrend data={combinedTrend} dataKey="lst" label="LST เฉลี่ย กทม. รายปี (°C)" color="#f97316" unit="°C" decimals={1} />
                  <MiniTrend data={combinedTrend} dataKey="green" label="พื้นที่สีเขียวรวม กทม. (พัน ไร่)" color="#34d399" unit="พัน ไร่" decimals={0} />
                </div>

                {/* Ranking bar chart */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <span className="text-[12px] font-semibold text-slate-300">อันดับ 50 เขต ปี {selectedYear}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {BAR_METRICS.map((m) => (
                        <button key={m.key as string} onClick={() => setActiveBarMetric(m.key)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors border ${activeBarMetric === m.key ? "border-transparent text-slate-900" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
                          style={activeBarMetric === m.key ? { backgroundColor: m.color } : {}}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1" />
                    <span className="text-[10px] text-slate-600">
                      <span style={{ color: activeCfg.color }} className="font-bold">■</span> {activeCfg.lowerIsBetter ? "น้อย = ดี" : "มาก = ดี"}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={Math.max(400, barData.length * 14)}>
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#64748b" }}
                        tickFormatter={(v) => activeCfg.fmt(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={80} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: any) => [activeCfg.fmt(v as number), activeCfg.label]} />
                      <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                        {barData.map((d, i) => (
                          <Cell key={i} fill={
                            activeCfg.lowerIsBetter
                              ? (d.isBot ? "#ef4444" : d.isTop ? "#10b981" : "#475569")
                              : (d.isTop ? activeCfg.color : d.isBot ? "#ef444460" : "#47556980")
                          } />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Sortable table */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 flex-wrap">
                    <span className="text-[12px] font-semibold text-slate-300">ข้อมูลทุกเขต ปี {selectedYear}</span>
                    <span className="text-[10px] text-slate-600">คลิกหัวคอลัมน์เพื่อเรียงลำดับ · คลิกชื่อเขตเพื่อดูรายละเอียด</span>
                    <div className="flex-1" />
                    <button onClick={exportOverviewCSV} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors">
                      <Download className="h-3 w-3" /> Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="bg-slate-900/80">
                        <tr className="border-b border-slate-800">
                          <th className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-600 sticky left-0 bg-slate-900/90 z-10">เขต</th>
                          <SortTh label="พื้นที่ (ไร่)" col="district_area_rai" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="NDVI" col="ndvi_mean" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="เขียว (ไร่)" col="green_area_rai" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="สัดส่วนเขียว" col="green_area_ratio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="LST (°C)" col="mean_lst" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="NDBI" col="ndbi_mean" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="สิ่งปลูกสร้าง (ไร่)" col="builtup_area_rai" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="มลพิษ /10" col="pollution_score" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="สัดส่วนน้ำ" col="water_ratio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="NTL Mean" col="ntl_mean" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDistricts.map((d, i) => (
                          <tr key={d.id}
                            onClick={() => { setSelectedDistrict(d.name_th); }}
                            className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors">
                            <td className="px-3 py-2 font-bold text-slate-300 whitespace-nowrap sticky left-0 bg-slate-950 hover:bg-slate-900 z-10">
                              <span className="text-slate-600 text-[9px] mr-2 tabular-nums">{i + 1}</span>
                              {d.name_th}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-slate-400 font-mono">{d.district_area_rai.toLocaleString()}</td>
                            <td className="px-3 py-2 tabular-nums font-mono">
                              <span className={d.ndvi_mean != null && d.ndvi_mean >= 0.3 ? "text-emerald-400" : "text-emerald-600"}>{fmt(d.ndvi_mean, 3)}</span>
                            </td>
                            <td className="px-3 py-2 tabular-nums font-mono text-emerald-300">{d.green_area_rai != null ? Math.round(d.green_area_rai).toLocaleString() : "–"}</td>
                            <td className="px-3 py-2 tabular-nums font-mono text-slate-400">{fmtPct(d.green_area_ratio)}</td>
                            <td className="px-3 py-2 tabular-nums font-mono">
                              <span className={d.mean_lst != null && d.mean_lst > 37 ? "text-red-400" : "text-orange-400"}>{fmt(d.mean_lst, 1, "°C")}</span>
                            </td>
                            <td className="px-3 py-2 tabular-nums font-mono text-amber-400">{fmt(d.ndbi_mean, 4)}</td>
                            <td className="px-3 py-2 tabular-nums font-mono text-amber-300">{d.builtup_area_rai != null ? Math.round(d.builtup_area_rai).toLocaleString() : "–"}</td>
                            <td className="px-3 py-2 tabular-nums font-mono text-purple-400">{fmt(d.pollution_score, 2)}</td>
                            <td className="px-3 py-2 tabular-nums font-mono text-sky-400">{fmtPct(d.water_ratio)}</td>
                            <td className="px-3 py-2 tabular-nums font-mono text-yellow-400">{fmt(d.ntl_mean, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ DISTRICT MODE ════ */}
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-[12px] font-bold text-cyan-400 animate-pulse uppercase tracking-widest">กำลังโหลด…</div>
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-400 text-[12px]">{error}</div>
          </div>
        )}
        {selectedDistrict && !loading && !error && data && cur && (
          <div className="p-5 space-y-5">

            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-slate-100">เขต{data.district}</h1>
              <span className="text-[11px] text-slate-500 font-semibold">พื้นที่รวม {data.areaRai.toLocaleString()} ไร่</span>
              <span className="text-[11px] text-slate-600">·</span>
              <span className="text-[11px] text-slate-500">ข้อมูลปี {selectedYear} เทียบกับ {compareYear}</span>
              {!data.metrics[selectedYear] && <span className="text-[10px] text-amber-400 font-bold">ไม่มีข้อมูลปี {selectedYear}</span>}
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard icon={Flame} label="LST เฉลี่ย" color="text-orange-400" iconBg="bg-orange-500/10"
                value={fmt(cur.mean_lst, 2, " °C")} sub={`สูงสุด ${fmt(cur.max_lst, 2, "°C")}`}
                delta={delta("mean_lst")} deltaInvert deltaUnit="°C" />
              <MetricCard icon={Trees} label="พื้นที่สีเขียว" color="text-emerald-400" iconBg="bg-emerald-500/10"
                value={fmtRai(cur.green_area_rai)} sub={`NDVI ${fmt(cur.ndvi_mean, 4)} · ${fmtPct(cur.green_area_ratio)}`}
                delta={delta("green_area_rai")} deltaUnit=" ไร่" />
              <MetricCard icon={Building2} label="สิ่งปลูกสร้าง" color="text-amber-400" iconBg="bg-amber-500/10"
                value={fmtRai(cur.builtup_area_rai)} sub={`NDBI ${fmt(cur.ndbi_mean, 4)}`}
                delta={delta("builtup_area_rai")} deltaInvert deltaUnit=" ไร่" />
              <MetricCard icon={Wind} label="มลพิษอากาศ" color="text-purple-400" iconBg="bg-purple-500/10"
                value={fmt(cur.pollution_score, 2, " /10")} sub={`NO₂ ${cur.no2_mean != null ? cur.no2_mean.toExponential(2) : "–"}`}
                delta={delta("pollution_score")} deltaInvert />
              <MetricCard icon={Droplets} label="พื้นที่น้ำ" color="text-sky-400" iconBg="bg-sky-500/10"
                value={fmtPct(cur.water_ratio)} sub={`NDWI ${fmt(cur.ndwi_mean, 4)}`}
                delta={delta("water_ratio")} />
              <MetricCard icon={Moon} label="แสงไฟกลางคืน" color="text-yellow-400" iconBg="bg-yellow-500/10"
                value={fmt(cur.ntl_mean, 2)} sub="nW/sr/cm²"
                delta={delta("ntl_mean")} />
            </div>

            {/* Trend charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendChart data={trendData.map((d) => ({ year: d.year, district: d.district_green, bkk: d.bkk_green }))}
                districtKey="district" bkkKey="bkk" label="พื้นที่สีเขียว (ไร่) รายปี" color="#10b981" unit="ไร่" decimals={0} />
              <TrendChart data={trendData.map((d) => ({ year: d.year, district: d.district_builtup, bkk: d.bkk_builtup }))}
                districtKey="district" bkkKey="bkk" label="พื้นที่สิ่งปลูกสร้าง (ไร่) รายปี" color="#f59e0b" unit="ไร่" decimals={0} />
              <TrendChart data={trendData.map((d) => ({ year: d.year, district: d.district_lst, bkk: d.bkk_lst }))}
                districtKey="district" bkkKey="bkk" label="LST เฉลี่ย (°C) รายปี" color="#f97316" unit="°C" decimals={2} />
              <TrendChart data={trendData.map((d) => ({ year: d.year, district: d.district_air, bkk: d.bkk_air }))}
                districtKey="district" bkkKey="bkk" label="คะแนนมลพิษอากาศ (0–10) รายปี" color="#a78bfa" unit="" decimals={2} />
            </div>

            {/* vs BKK comparison */}
            {comparisonData.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 text-[11px] font-semibold text-slate-400">เขต{data.district} vs ค่าเฉลี่ยกรุงเทพฯ ปี {selectedYear}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {comparisonData.map((m) => {
                    const pct = m.bkk > 0 ? ((m.district - m.bkk) / m.bkk) * 100 : 0;
                    const isHigh = pct > 0;
                    return (
                      <div key={m.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{m.label}</span>
                          <span className={`text-[10px] font-black ${isHigh ? "text-red-400" : "text-emerald-400"}`}>{isHigh ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%</span>
                        </div>
                        <div className="space-y-1.5">
                          <div>
                            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5"><span>เขตนี้</span><span style={{ color: m.color }} className="font-bold">{m.district.toFixed(2)}</span></div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.district / Math.max(m.district, m.bkk)) * 100)}%`, backgroundColor: m.color }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5"><span>เฉลี่ย กทม.</span><span className="font-bold text-slate-400">{m.bkk.toFixed(2)}</span></div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full bg-slate-600" style={{ width: `${Math.min(100, (m.bkk / Math.max(m.district, m.bkk)) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All-years table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-400">ข้อมูลทุกปี เปรียบเทียบรายปี</span>
                <button onClick={() => setShowTableDelta((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors ${showTableDelta ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-400" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}>
                  <TrendingUp className="h-3 w-3" />{showTableDelta ? "ซ่อน Δ ปีก่อน" : "แสดง Δ ปีก่อน"}
                </button>
                <div className="flex-1" />
                <button onClick={exportCSV} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors">
                  <Download className="h-3 w-3" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-900/80">
                    <tr className="border-b border-slate-800">
                      {["ปี","LST เฉลี่ย","LST สูงสุด","NDVI","พื้นที่เขียว (ไร่)","สัดส่วนเขียว","NDBI","สิ่งปลูกสร้าง (ไร่)","NO₂","คะแนนมลพิษ","สัดส่วนน้ำ","NTL Mean"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.years].sort((a, b) => a - b).map((yr) => {
                      const m = data.metrics[yr];
                      const d = yearlyDeltas[yr];
                      const isSelected = yr === selectedYear;
                      const isCompare = yr === compareYear;
                      return (
                        <tr key={yr} className={`border-b border-slate-800/40 hover:bg-slate-800/20 ${isSelected ? "bg-cyan-950/20" : ""}`}>
                          <td className="px-3 py-2 font-black tabular-nums whitespace-nowrap">
                            <span className={isSelected ? "text-cyan-400" : isCompare ? "text-slate-400" : "text-slate-500"}>{yr}</span>
                            {isSelected && <span className="ml-1.5 text-[8px] font-bold text-cyan-600 bg-cyan-950/60 px-1.5 py-0.5 rounded-full">เลือก</span>}
                            {isCompare && !isSelected && <span className="ml-1.5 text-[8px] font-bold text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">เปรียบ</span>}
                          </td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-orange-400">{fmt(m?.mean_lst, 2, "°C")}</span>{showTableDelta && d?.mean_lst != null && <DeltaSpan delta={d.mean_lst} lowerIsBetter unit="°C" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-red-400">{fmt(m?.max_lst, 2, "°C")}</span>{showTableDelta && d?.max_lst != null && <DeltaSpan delta={d.max_lst} lowerIsBetter unit="°C" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-emerald-400">{fmt(m?.ndvi_mean, 4)}</span>{showTableDelta && d?.ndvi_mean != null && <DeltaSpan delta={d.ndvi_mean} />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-emerald-300">{m?.green_area_rai != null ? Math.round(m.green_area_rai).toLocaleString() : "–"}</span>{showTableDelta && d?.green_area_rai != null && <DeltaSpan delta={d.green_area_rai} unit="ไร่" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-slate-400">{fmtPct(m?.green_area_ratio)}</span>{showTableDelta && d?.green_area_ratio != null && <DeltaSpan delta={d.green_area_ratio * 100} unit="%" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-amber-400">{fmt(m?.ndbi_mean, 4)}</span>{showTableDelta && d?.ndbi_mean != null && <DeltaSpan delta={d.ndbi_mean} lowerIsBetter />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-amber-300">{m?.builtup_area_rai != null ? Math.round(m.builtup_area_rai).toLocaleString() : "–"}</span>{showTableDelta && d?.builtup_area_rai != null && <DeltaSpan delta={d.builtup_area_rai} lowerIsBetter unit="ไร่" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-purple-400">{m?.no2_mean != null ? m.no2_mean.toExponential(3) : "–"}</span>{showTableDelta && d?.no2_mean != null && <DeltaSpan delta={d.no2_mean} lowerIsBetter scientific />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-purple-300">{fmt(m?.pollution_score, 2)}</span>{showTableDelta && d?.pollution_score != null && <DeltaSpan delta={d.pollution_score} lowerIsBetter />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-sky-400">{fmtPct(m?.water_ratio)}</span>{showTableDelta && d?.water_ratio != null && <DeltaSpan delta={d.water_ratio * 100} unit="%" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-yellow-400">{fmt(m?.ntl_mean, 2)}</span>{showTableDelta && d?.ntl_mean != null && <DeltaSpan delta={d.ntl_mean} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {data.bkkAverages[selectedYear] && (
                    <tfoot className="border-t border-slate-700/60 bg-slate-900/90">
                      <tr>
                        <td className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 whitespace-nowrap">เฉลี่ย กทม. {selectedYear}</td>
                        {(() => {
                          const b = data.bkkAverages[selectedYear];
                          return (<>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.mean_lst, 2, "°C")}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.max_lst, 2, "°C")}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ndvi_mean, 4)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.green_area_rai != null ? Math.round(b.green_area_rai).toLocaleString() : "–"}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmtPct(b.green_area_ratio)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ndbi_mean, 4)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.builtup_area_rai != null ? Math.round(b.builtup_area_rai).toLocaleString() : "–"}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.no2_mean != null ? b.no2_mean.toExponential(3) : "–"}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.pollution_score, 2)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmtPct(b.water_ratio)}</td>
                            <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ntl_mean, 2)}</td>
                          </>);
                        })()}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
