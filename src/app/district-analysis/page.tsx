/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Home, Download, Printer, TrendingUp, TrendingDown, Minus,
  ChevronDown, Flame, Trees, Building2, Wind, Droplets, Moon,
  Search, X, ArrowUp, ArrowDown, AlertCircle, CheckCircle, Info,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, BarChart, Bar, Cell, ComposedChart, Area, ReferenceLine,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
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
interface OverviewState {
  year: number; districts: DistrictRow[];
  ndviTrend: Array<[string, number]>;
  greenTrend: Array<[string, number]>;
  lstTrend: Array<[string, number]>;
}
type SortKey = keyof DistrictRow | "delta_ndvi" | "delta_lst" | "delta_green" | "delta_ntl" | "delta_pollution";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, d = 2, sfx = ""): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v.toFixed(d)}${sfx}`;
}
function fmtRai(v: number | null | undefined): string {
  if (v == null) return "–";
  return `${Math.round(v).toLocaleString()} ไร่`;
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "–";
  return `${(v * 100).toFixed(1)}%`;
}
// NO₂ in mol/m² → displayed as ×10⁻⁴ (more readable than 1.23e-4)
function fmtNo2(v: number | null | undefined, long = false): string {
  if (v == null) return "–";
  const scaled = v * 10000;
  return long ? `${scaled.toFixed(3)} ×10⁻⁴ mol/m²` : `${scaled.toFixed(2)} ×10⁻⁴`;
}
function pollutionLabel(score: number | null | undefined): string {
  if (score == null) return "";
  if (score >= 8) return "สูงมาก";
  if (score >= 6) return "สูง";
  if (score >= 4) return "ปานกลาง";
  if (score >= 2) return "ต่ำ";
  return "ต่ำมาก";
}
function numAvg(arr: (number | null | undefined)[]): number | null {
  const ns = arr.filter((v): v is number => typeof v === "number" && isFinite(v));
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
}
function diff(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared components
// ─────────────────────────────────────────────────────────────────────────────
function DeltaBadge({ delta, invert = false, unit = "" }: { delta: number | null; invert?: boolean; unit?: string }) {
  if (delta == null || !Number.isFinite(delta)) return <span className="text-slate-600 text-[10px]">–</span>;
  if (Math.abs(delta) < 1e-5) return <span className="text-slate-500 text-[10px] flex items-center gap-0.5"><Minus className="h-3 w-3" />เท่าเดิม</span>;
  const isPos = delta > 0;
  const isBad = invert ? !isPos : isPos;
  const abs = Math.abs(delta);
  const disp = abs < 0.0001 ? abs.toExponential(2) : abs.toFixed(abs < 1 ? 4 : 2);
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-bold ${isBad ? "text-red-400" : "text-emerald-400"}`}>
      {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPos ? "+" : "-"}{disp}{unit}
    </span>
  );
}

function DeltaSpan({ delta, lower = false, unit = "", sci = false }: {
  delta: number; lower?: boolean; unit?: string; sci?: boolean;
}) {
  const abs = Math.abs(delta);
  if (abs < 1e-8) return <span className="text-[9px] text-slate-600 block">±0</span>;
  const good = lower ? delta < 0 : delta > 0;
  const sign = delta > 0 ? "+" : "";
  let s: string;
  if (sci || abs < 0.0001) s = sign + delta.toExponential(1);
  else if (abs < 0.001) s = sign + delta.toFixed(5);
  else if (abs < 1) s = sign + delta.toFixed(4);
  else if (abs < 10) s = sign + delta.toFixed(2);
  else s = sign + Math.round(delta).toLocaleString();
  if (unit) s += " " + unit;
  return <span className={`text-[9px] font-bold block leading-none mt-0.5 tabular-nums ${good ? "text-emerald-400" : "text-red-400"}`}>{s}</span>;
}

// Inline delta cell for overview table
function InlineDelta({ v, lowerBetter = false, decimals = 3, pct = false }: {
  v: number | null; lowerBetter?: boolean; decimals?: number; pct?: boolean;
}) {
  if (v == null) return <span className="text-slate-700 text-[9px]">–</span>;
  if (Math.abs(v) < 1e-6) return <span className="text-slate-600 text-[9px]">±0</span>;
  const isPos = v > 0;
  const good = lowerBetter ? !isPos : isPos;
  const disp = pct ? `${(v * 100).toFixed(1)}%` : Math.abs(v) < 1 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
  return (
    <span className={`text-[9px] font-bold tabular-nums ${good ? "text-emerald-400" : "text-red-400"}`}>
      {isPos ? "+" : ""}{disp}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricCard with optional rank badge
// ─────────────────────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, delta, deltaInvert = false, deltaUnit = "", color, iconBg, rank }: {
  icon: any; label: string; value: string; sub?: string; delta: number | null;
  deltaInvert?: boolean; deltaUnit?: string; color: string; iconBg: string; rank?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}><Icon className={`h-3.5 w-3.5 ${color}`} /></div>
        <span className="text-[11px] font-semibold text-slate-500 flex-1">{label}</span>
        {rank != null && (
          <span className="text-[9px] font-black text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full tabular-nums">#{rank}/50</span>
        )}
      </div>
      <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
      <DeltaBadge delta={delta} invert={deltaInvert} unit={deltaUnit} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TrendChart (per-district mode)
// ─────────────────────────────────────────────────────────────────────────────
function TrendChart({ data, dk, bk, label, color, unit, decimals = 2 }: {
  data: any[]; dk: string; bk: string; label: string; color: string; unit: string; decimals?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 text-[11px] font-semibold text-slate-400">{label}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v) => typeof v === "number" ? v.toFixed(decimals) : v} width={48} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
            formatter={(v: unknown, name: unknown) => [typeof v === "number" ? `${v.toFixed(decimals)} ${unit}` : "–", name === dk ? "เขตนี้" : "เฉลี่ย กทม."] as [string, string]} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => v === dk ? "เขตนี้" : "เฉลี่ย กทม."} />
          <Line type="monotone" dataKey={dk} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls name={dk} />
          <Line type="monotone" dataKey={bk} stroke="#475569" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls name={bk} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MiniTrend (overview mode)
// ─────────────────────────────────────────────────────────────────────────────
function MiniTrend({ data, dataKey, label, color, unit, decimals = 2, refValue }: {
  data: any[]; dataKey: string; label: string; color: string; unit: string; decimals?: number; refValue?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 text-[11px] font-semibold text-slate-400">{label}</div>
      <ResponsiveContainer width="100%" height={130}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v) => typeof v === "number" ? v.toFixed(decimals) : v} width={44} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
            formatter={(v: unknown) => [typeof v === "number" ? `${v.toFixed(decimals)} ${unit}` : "–", label] as [string, string]} />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={`${color}18`} strokeWidth={2} dot={{ r: 2.5, fill: color }} connectNulls />
          {refValue != null && <ReferenceLine y={refValue} stroke={`${color}60`} strokeDasharray="4 2" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar metric config
// ─────────────────────────────────────────────────────────────────────────────
const BAR_METRICS = [
  { key: "ndvi_mean" as SortKey,       label: "NDVI",          color: "#10b981", fmt: (v: number) => v.toFixed(3) },
  { key: "green_area_rai" as SortKey,  label: "พื้นที่เขียว",  color: "#34d399", fmt: (v: number) => `${Math.round(v).toLocaleString()} ไร่` },
  { key: "mean_lst" as SortKey,        label: "LST (°C)",      color: "#f97316", fmt: (v: number) => `${v.toFixed(1)}°`, lowerBetter: true },
  { key: "ndbi_mean" as SortKey,       label: "NDBI",          color: "#f59e0b", fmt: (v: number) => v.toFixed(3), lowerBetter: true },
  { key: "ntl_mean" as SortKey,        label: "แสงไฟ NTL",    color: "#fbbf24", fmt: (v: number) => v.toFixed(1) },
  { key: "pollution_score" as SortKey, label: "มลพิษ",         color: "#a78bfa", fmt: (v: number) => v.toFixed(2), lowerBetter: true },
  { key: "water_ratio" as SortKey,     label: "สัดส่วนน้ำ",   color: "#38bdf8", fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sortable TH
// ─────────────────────────────────────────────────────────────────────────────
function SortTh({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th onClick={() => onSort(col)} className="px-2 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:text-slate-300 transition-colors"
      style={{ color: active ? "#94a3b8" : "#475569" }}>
      <span className="flex items-center gap-1">
        {label}
        {active && (sortDir === "desc" ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />)}
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NDVI distribution buckets
// ─────────────────────────────────────────────────────────────────────────────
const NDVI_BINS = [
  { label: "< 0.10", min: -1, max: 0.10, color: "#7f1d1d", textColor: "text-red-900" },
  { label: "0.10–0.20", min: 0.10, max: 0.20, color: "#dc2626", textColor: "text-red-400" },
  { label: "0.20–0.30", min: 0.20, max: 0.30, color: "#f59e0b", textColor: "text-amber-400" },
  { label: "0.30–0.40", min: 0.30, max: 0.40, color: "#84cc16", textColor: "text-lime-400" },
  { label: "> 0.40", min: 0.40, max: 2, color: "#10b981", textColor: "text-emerald-400" },
];
const LST_BINS = [
  { label: "< 33°C", min: 0, max: 33, color: "#0ea5e9", textColor: "text-sky-400" },
  { label: "33–35°C", min: 33, max: 35, color: "#22c55e", textColor: "text-green-400" },
  { label: "35–37°C", min: 35, max: 37, color: "#f59e0b", textColor: "text-amber-400" },
  { label: "37–39°C", min: 37, max: 39, color: "#f97316", textColor: "text-orange-400" },
  { label: "> 39°C", min: 39, max: 999, color: "#ef4444", textColor: "text-red-400" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

function mapFeatureToRow(f: any): DistrictRow {
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
}

export default function DistrictAnalysisPage() {
  // ── District & profile states ──────────────────────────────────────────────
  const [districtList, setDistrictList] = useState<string[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showTableDelta, setShowTableDelta] = useState(false);

  // ── Year selection ──────────────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState(2024);
  const [compareYear, setCompareYear] = useState(2018);

  // ── Overview states ────────────────────────────────────────────────────────
  const [overview, setOverview] = useState<OverviewState | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [compareOverview, setCompareOverview] = useState<DistrictRow[] | null>(null);
  const [compareOverviewLoading, setCompareOverviewLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("ndvi_mean");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeBarMetric, setActiveBarMetric] = useState<SortKey>("ndvi_mean");
  const [showDeltaCol, setShowDeltaCol] = useState(true);
  const [activeInsightTab, setActiveInsightTab] = useState<"improve" | "decline">("improve");

  // ── Load district list ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/district-profile").then(r => r.json()).then(d => setDistrictList(d.districts ?? []));
  }, []);

  // ── Load profile when district selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedDistrict) { setProfileData(null); return; }
    setProfileLoading(true); setProfileError(null);
    fetch(`/api/district-profile?district=${encodeURIComponent(selectedDistrict)}`)
      .then(r => r.json()).then(d => { if (d.error) setProfileError(d.error); else setProfileData(d); })
      .catch(e => setProfileError(e.message)).finally(() => setProfileLoading(false));
  }, [selectedDistrict]);

  // ── Load overview data (selected year) ────────────────────────────────────
  useEffect(() => {
    setOverviewLoading(true);
    Promise.all([
      fetch(`/api/district-metrics?metric=vegetation&year=${selectedYear}`).then(r => r.json()),
      fetch(`/api/district-metrics?metric=lst&year=${selectedYear}`).then(r => r.json()),
    ]).then(([vegR, lstR]) => {
      setOverview({
        year: selectedYear,
        districts: (vegR.geojson?.features ?? []).map(mapFeatureToRow),
        ndviTrend: vegR.summary?.yearlyTrend ?? [],
        greenTrend: vegR.summary?.greenAreaTrend ?? [],
        lstTrend: lstR.summary?.yearlyTrend ?? [],
      });
    }).catch(console.error).finally(() => setOverviewLoading(false));
  }, [selectedYear]);

  // ── Load compare year data ─────────────────────────────────────────────────
  useEffect(() => {
    if (compareYear === selectedYear) { setCompareOverview(null); return; }
    setCompareOverviewLoading(true);
    fetch(`/api/district-metrics?metric=vegetation&year=${compareYear}`)
      .then(r => r.json())
      .then(r => setCompareOverview((r.geojson?.features ?? []).map(mapFeatureToRow)))
      .catch(console.error)
      .finally(() => setCompareOverviewLoading(false));
  }, [compareYear, selectedYear]);

  const filteredDistricts = useMemo(
    () => districtList.filter(d => d.includes(districtSearch.trim())),
    [districtList, districtSearch]
  );

  // ── Rank lookup from overview ──────────────────────────────────────────────
  const rankLookup = useMemo(() => {
    if (!overview?.districts) return new Map<number, Record<string, number>>();
    const m = new Map<number, Record<string, number>>();
    const keys: (keyof DistrictRow)[] = ["ndvi_mean", "green_area_rai", "mean_lst", "ndbi_mean", "ntl_mean", "pollution_score"];
    keys.forEach(k => {
      const sorted = [...overview.districts]
        .filter(d => d[k] != null)
        .sort((a, b) => (b[k] as number) - (a[k] as number));
      sorted.forEach((d, i) => {
        if (!m.has(d.id)) m.set(d.id, {});
        m.get(d.id)![k as string] = i + 1;
      });
    });
    return m;
  }, [overview]);

  function getRank(districtId: number, key: string): number | undefined {
    return rankLookup.get(districtId)?.[key];
  }

  // ── Compare delta per district ─────────────────────────────────────────────
  const compareMap = useMemo(() => {
    if (!compareOverview) return new Map<number, DistrictRow>();
    return new Map(compareOverview.map(d => [d.id, d]));
  }, [compareOverview]);

  const deltaRows = useMemo(() => {
    if (!overview || !compareOverview) return [] as Array<DistrictRow & {
      delta_ndvi: number | null; delta_lst: number | null; delta_green: number | null;
      delta_ntl: number | null; delta_pollution: number | null; delta_builtup: number | null;
    }>;
    return overview.districts.map(d => {
      const c = compareMap.get(d.id);
      return {
        ...d,
        delta_ndvi: diff(d.ndvi_mean, c?.ndvi_mean),
        delta_lst: diff(d.mean_lst, c?.mean_lst),
        delta_green: diff(d.green_area_rai, c?.green_area_rai),
        delta_ntl: diff(d.ntl_mean, c?.ntl_mean),
        delta_pollution: diff(d.pollution_score, c?.pollution_score),
        delta_builtup: diff(d.builtup_area_rai, c?.builtup_area_rai),
      };
    });
  }, [overview, compareOverview, compareMap]);

  // ── BKK avg delta (for KPI cards) ─────────────────────────────────────────
  const bkkAvg = useMemo(() => {
    if (!overview?.districts.length) return null;
    const ds = overview.districts;
    const cds = compareOverview ?? [];
    const cAvg = (key: keyof DistrictRow) => numAvg(cds.map(d => d[key] as number));
    return {
      ndvi: numAvg(ds.map(d => d.ndvi_mean)), ndviCmp: cAvg("ndvi_mean"),
      lst: numAvg(ds.map(d => d.mean_lst)), lstCmp: cAvg("mean_lst"),
      green: ds.reduce((s, d) => s + (d.green_area_rai ?? 0), 0),
      greenCmp: cds.reduce((s, d) => s + (d.green_area_rai ?? 0), 0) || null,
      ntl: numAvg(ds.map(d => d.ntl_mean)), ntlCmp: cAvg("ntl_mean"),
      pollution: numAvg(ds.map(d => d.pollution_score)), pollutionCmp: cAvg("pollution_score"),
      water: numAvg(ds.map(d => d.water_ratio)), waterCmp: cAvg("water_ratio"),
    };
  }, [overview, compareOverview]);

  // ── Sorted district table ──────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const rows: any[] = deltaRows.length ? deltaRows : (overview?.districts ?? []);
    return [...rows].sort((a, b) => {
      const av = (a[sortKey as string] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = (b[sortKey as string] as number | null) ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [overview, deltaRows, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  // ── Trend data for charts ──────────────────────────────────────────────────
  const combinedTrend = useMemo(() => {
    const by: Record<string, any> = {};
    (overview?.ndviTrend ?? []).forEach(([y, v]) => { by[y] = { year: y, ndvi: v }; });
    (overview?.lstTrend ?? []).forEach(([y, v]) => { if (by[y]) by[y].lst = v; else by[y] = { year: y, lst: v }; });
    (overview?.greenTrend ?? []).forEach(([y, v]) => { if (by[y]) by[y].green = Math.round(v / 1000); });
    return Object.values(by).sort((a, b) => Number(a.year) - Number(b.year));
  }, [overview]);

  // ── Multi-year BKK summary table ───────────────────────────────────────────
  const multiYearTable = useMemo(() => {
    return combinedTrend.map((row, i, arr) => {
      const prev = arr[i - 1];
      return {
        ...row,
        dNdvi: i > 0 ? diff(row.ndvi, prev.ndvi) : null,
        dLst: i > 0 ? diff(row.lst, prev.lst) : null,
        dGreen: i > 0 ? diff(row.green, prev.green) : null,
      };
    });
  }, [combinedTrend]);

  // ── Distribution analysis ──────────────────────────────────────────────────
  const ndviDist = useMemo(() => {
    if (!overview) return [];
    return NDVI_BINS.map(b => ({
      ...b,
      count: overview.districts.filter(d => d.ndvi_mean != null && d.ndvi_mean >= b.min && d.ndvi_mean < b.max).length,
      districts: overview.districts.filter(d => d.ndvi_mean != null && d.ndvi_mean >= b.min && d.ndvi_mean < b.max).map(d => d.name_th),
    }));
  }, [overview]);

  const lstDist = useMemo(() => {
    if (!overview) return [];
    return LST_BINS.map(b => ({
      ...b,
      count: overview.districts.filter(d => d.mean_lst != null && d.mean_lst >= b.min && d.mean_lst < b.max).length,
      districts: overview.districts.filter(d => d.mean_lst != null && d.mean_lst >= b.min && d.mean_lst < b.max).map(d => d.name_th),
    }));
  }, [overview]);

  // ── Auto-insights ──────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!deltaRows.length) return { improve: [] as any[], decline: [] as any[] };
    const sorted = [...deltaRows].filter(d => d.delta_ndvi != null || d.delta_lst != null || d.delta_green != null);

    const top = (arr: any[], key: string, desc: boolean) =>
      [...arr].filter(d => d[key] != null).sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key]).slice(0, 5);

    return {
      improve: [
        ...top(sorted, "delta_ndvi", true).slice(0, 3).map(d => ({
          icon: "tree", label: `${d.name_th}`, value: `NDVI +${d.delta_ndvi?.toFixed(3)}`,
          sub: `พื้นที่เขียว${d.delta_green != null && d.delta_green > 0 ? ` +${Math.round(d.delta_green).toLocaleString()} ไร่` : ""}`,
        })),
        ...top(sorted, "delta_lst", false).slice(0, 2).map(d => ({
          icon: "cool", label: `${d.name_th}`, value: `LST ${d.delta_lst?.toFixed(1)}°C`,
          sub: "อุณหภูมิลดลง",
        })),
        ...top(sorted, "delta_pollution", false).slice(0, 2).map(d => ({
          icon: "air", label: `${d.name_th}`, value: `มลพิษ ${d.delta_pollution?.toFixed(2)} pts`,
          sub: "คุณภาพอากาศดีขึ้น",
        })),
      ].slice(0, 6),
      decline: [
        ...top(sorted, "delta_ndvi", false).slice(0, 3).map(d => ({
          icon: "tree_bad", label: `${d.name_th}`, value: `NDVI ${d.delta_ndvi?.toFixed(3)}`,
          sub: `พื้นที่เขียว${d.delta_green != null && d.delta_green < 0 ? ` ${Math.round(d.delta_green).toLocaleString()} ไร่` : ""}`,
        })),
        ...top(sorted, "delta_lst", true).slice(0, 2).map(d => ({
          icon: "hot", label: `${d.name_th}`, value: `LST +${d.delta_lst?.toFixed(1)}°C`,
          sub: "อุณหภูมิเพิ่มขึ้น",
        })),
        ...top(sorted, "delta_pollution", true).slice(0, 2).map(d => ({
          icon: "air_bad", label: `${d.name_th}`, value: `มลพิษ +${d.delta_pollution?.toFixed(2)} pts`,
          sub: "คุณภาพอากาศแย่ลง",
        })),
      ].slice(0, 6),
    };
  }, [deltaRows]);

  // ── Bar chart data ─────────────────────────────────────────────────────────
  const activeCfg = BAR_METRICS.find(m => m.key === activeBarMetric) ?? BAR_METRICS[0];
  const barData = useMemo(() => {
    if (!overview?.districts) return [];
    return [...overview.districts]
      .filter(d => (d[activeBarMetric as keyof DistrictRow] as number | null) != null)
      .sort((a, b) => (b[activeBarMetric as keyof DistrictRow] as number) - (a[activeBarMetric as keyof DistrictRow] as number))
      .map((d, i, arr) => ({
        name: d.name_th, value: d[activeBarMetric as keyof DistrictRow] as number,
        isTop: i < 5, isBot: i >= arr.length - 5,
      }));
  }, [overview, activeBarMetric]);

  // ── Per-district trend data ────────────────────────────────────────────────
  const cur = profileData?.metrics[selectedYear];
  const base = profileData?.metrics[compareYear];
  function delta(k: keyof YearMetrics): number | null {
    const c = cur?.[k] as number | null; const b = base?.[k] as number | null;
    if (c == null || b == null) return null; return c - b;
  }
  const trendData = useMemo(() => {
    if (!profileData) return [];
    return profileData.years.map(yr => ({
      year: yr,
      district: profileData.metrics[yr]?.ndvi_mean ?? null, bkk: profileData.bkkAverages[yr]?.ndvi_mean ?? null,
      district_lst: profileData.metrics[yr]?.mean_lst ?? null, bkk_lst: profileData.bkkAverages[yr]?.mean_lst ?? null,
      district_green: profileData.metrics[yr]?.green_area_rai ?? null, bkk_green: profileData.bkkAverages[yr]?.green_area_rai ?? null,
      district_builtup: profileData.metrics[yr]?.builtup_area_rai ?? null, bkk_builtup: profileData.bkkAverages[yr]?.builtup_area_rai ?? null,
      district_air: profileData.metrics[yr]?.pollution_score ?? null, bkk_air: profileData.bkkAverages[yr]?.pollution_score ?? null,
      district_ntl: profileData.metrics[yr]?.ntl_mean ?? null, bkk_ntl: profileData.bkkAverages[yr]?.ntl_mean ?? null,
      district_water: profileData.metrics[yr]?.water_ratio != null ? profileData.metrics[yr]!.water_ratio! * 100 : null,
      bkk_water: profileData.bkkAverages[yr]?.water_ratio != null ? profileData.bkkAverages[yr]!.water_ratio! * 100 : null,
    }));
  }, [profileData]);

  const comparisonData = useMemo(() => {
    if (!cur || !profileData?.bkkAverages[selectedYear]) return [];
    const bkk = profileData.bkkAverages[selectedYear];
    return [
      { label: "LST (°C)", d: cur.mean_lst, b: bkk.mean_lst, color: "#f97316" },
      { label: "NDVI ×100", d: cur.ndvi_mean != null ? cur.ndvi_mean * 100 : null, b: bkk.ndvi_mean != null ? bkk.ndvi_mean * 100 : null, color: "#10b981" },
      { label: "พื้นที่เขียว (%)", d: cur.green_area_ratio != null ? cur.green_area_ratio * 100 : null, b: bkk.green_area_ratio != null ? bkk.green_area_ratio * 100 : null, color: "#34d399" },
      { label: "NDBI ×100", d: cur.ndbi_mean != null ? cur.ndbi_mean * 100 : null, b: bkk.ndbi_mean != null ? bkk.ndbi_mean * 100 : null, color: "#f59e0b" },
      { label: "คะแนนมลพิษ", d: cur.pollution_score, b: bkk.pollution_score, color: "#a78bfa" },
      { label: "NTL Mean", d: cur.ntl_mean, b: bkk.ntl_mean, color: "#fbbf24" },
    ].filter((m): m is typeof m & { d: number; b: number } => m.d != null && m.b != null);
  }, [cur, profileData, selectedYear]);

  const yearlyDeltas = useMemo(() => {
    if (!profileData) return {} as Record<number, Partial<YearMetrics>>;
    const sorted = [...profileData.years].sort((a, b) => a - b);
    const out: Record<number, Partial<YearMetrics>> = {};
    sorted.forEach((yr, i) => {
      if (i === 0) return;
      const c = profileData.metrics[yr]; const p = profileData.metrics[sorted[i - 1]];
      if (!c || !p) return;
      const e: Partial<YearMetrics> = {};
      (Object.keys(c) as (keyof YearMetrics)[]).forEach(k => {
        const cv = c[k] as number | null; const pv = p[k] as number | null;
        (e as any)[k] = cv != null && pv != null ? cv - pv : null;
      });
      out[yr] = e;
    });
    return out;
  }, [profileData]);

  const exportCSV = useCallback(() => {
    if (!profileData) return;
    const headers = ["เขต","พื้นที่รวม(ไร่)","ปี","LST เฉลี่ย(°C)","LST สูงสุด(°C)","NDVI","พื้นที่สีเขียว(ไร่)","สัดส่วนสีเขียว(%)","NDBI","สิ่งปลูกสร้าง(ไร่)","NO₂(mol/m²)","CO(mol/m²)","SO₂(mol/m²)","คะแนนมลพิษ","สัดส่วนน้ำ(%)","พื้นที่น้ำ(ไร่)","NDWI","NTL Mean","NTL Max"].join(",");
    const rows = profileData.years.map(yr => {
      const m = profileData.metrics[yr] ?? {};
      return [`"${profileData.district}"`,profileData.areaRai,yr,m.mean_lst?.toFixed(2)??"",m.max_lst?.toFixed(2)??"",m.ndvi_mean?.toFixed(4)??"",m.green_area_rai?.toFixed(0)??"",m.green_area_ratio!=null?(m.green_area_ratio*100).toFixed(2):"",m.ndbi_mean?.toFixed(4)??"",m.builtup_area_rai?.toFixed(0)??"",m.no2_mean?.toFixed(6)??"",m.co_mean?.toFixed(4)??"",m.so2_mean?.toFixed(6)??"",m.pollution_score?.toFixed(2)??"",m.water_ratio!=null?(m.water_ratio*100).toFixed(2):"",m.water_area_rai?.toFixed(0)??"",m.ndwi_mean?.toFixed(4)??"",m.ntl_mean?.toFixed(3)??"",m.ntl_max?.toFixed(3)??""
      ].join(",");
    }).join("\n");
    const blob = new Blob(["﻿" + headers + "\n" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `district_profile_${profileData.district}.csv`; a.click(); URL.revokeObjectURL(url);
  }, [profileData]);

  const exportOverviewCSV = useCallback(() => {
    if (!sortedRows.length) return;
    const hasDelta = deltaRows.length > 0;
    const hdr = ["ลำดับ","เขต","พื้นที่(ไร่)","NDVI",hasDelta?"ΔNDVI":"","เขียว(ไร่)",hasDelta?"Δเขียว(ไร่)":"","สัดส่วนเขียว(%)","LST(°C)",hasDelta?"ΔLST(°C)":"","NDBI","สิ่งปลูกสร้าง(ไร่)","มลพิษ",hasDelta?"Δมลพิษ":"","สัดส่วนน้ำ(%)","NTL Mean",hasDelta?"ΔNTL":""].filter(Boolean).join(",");
    const rows = sortedRows.map((d: any, i: number) => [
      i+1,`"${d.name_th}"`,d.district_area_rai,
      d.ndvi_mean?.toFixed(4)??"",hasDelta?d.delta_ndvi?.toFixed(4)??""  :"",
      d.green_area_rai!=null?Math.round(d.green_area_rai):"",hasDelta?d.delta_green!=null?Math.round(d.delta_green):""  :"",
      d.green_area_ratio!=null?(d.green_area_ratio*100).toFixed(1):"",
      d.mean_lst?.toFixed(2)??"",hasDelta?d.delta_lst?.toFixed(2)??""  :"",
      d.ndbi_mean?.toFixed(4)??"",d.builtup_area_rai!=null?Math.round(d.builtup_area_rai):"",
      d.pollution_score?.toFixed(2)??"",hasDelta?d.delta_pollution?.toFixed(2)??""  :"",
      d.water_ratio!=null?(d.water_ratio*100).toFixed(2):"",d.ntl_mean?.toFixed(2)??"",hasDelta?d.delta_ntl?.toFixed(2)??""  :"",
    ].filter((_, ci) => hasDelta || ![4,6,9,13,16].includes(ci)).join(",")).join("\n");
    const blob = new Blob(["﻿" + hdr + "\n" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `bkk_${selectedYear}_vs_${compareYear}.csv`; a.click(); URL.revokeObjectURL(url);
  }, [sortedRows, deltaRows, selectedYear, compareYear]);

  const hasDelta = deltaRows.length > 0 && compareOverview != null;

  // ── Profile district's id (from overview) ──────────────────────────────────
  const profileDistrictId = useMemo(() => {
    if (!selectedDistrict || !overview) return null;
    return overview.districts.find(d => d.name_th === selectedDistrict)?.id ?? null;
  }, [selectedDistrict, overview]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-50 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur z-20">
        <Link href="/" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 shrink-0">
          <Home className="h-3.5 w-3.5" /> Bangkok Analytics
        </Link>
        <div className="h-4 w-px bg-slate-700 shrink-0" />
        <span className="text-[13px] font-black text-slate-200 shrink-0">วิเคราะห์รายเขต</span>
        <div className="flex-1" />

        {/* District picker */}
        <div className="relative">
          <button onClick={() => setShowDropdown(v => !v)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[12px] font-bold text-slate-200 hover:border-slate-500 transition-colors min-w-[160px]">
            <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span className="flex-1 text-left truncate">{selectedDistrict || "เลือกเขต…"}</span>
            {selectedDistrict
              ? <X className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300 shrink-0" onClick={e => { e.stopPropagation(); setSelectedDistrict(""); setShowDropdown(false); }} />
              : <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
          </button>
          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-slate-800">
                <input autoFocus value={districtSearch} onChange={e => setDistrictSearch(e.target.value)}
                  placeholder="ค้นหาเขต…" className="w-full rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none" />
              </div>
              <div className="max-h-52 overflow-y-auto custom-scrollbar">
                {filteredDistricts.map(d => (
                  <button key={d} onClick={() => { setSelectedDistrict(d); setDistrictSearch(""); setShowDropdown(false); }}
                    className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-800 transition-colors ${selectedDistrict === d ? "text-cyan-400 font-bold bg-cyan-950/40" : "text-slate-300"}`}>{d}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Year pickers */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 font-semibold">ปี</span>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-slate-200 text-[12px] focus:outline-none">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-slate-600 font-semibold">vs</span>
          <select value={compareYear} onChange={e => setCompareYear(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-slate-500 text-[12px] focus:outline-none">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {profileData && (
          <>
            <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 transition-colors">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 transition-colors">
              <Printer className="h-3.5 w-3.5" /> พิมพ์
            </button>
          </>
        )}
      </div>

      {/* ── Main ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" onClick={() => showDropdown && setShowDropdown(false)}>

        {/* ════════════════════════════════════════════════════════════
            OVERVIEW MODE
        ════════════════════════════════════════════════════════════ */}
        {!selectedDistrict && (
          <div className="p-5 space-y-5">
            {overviewLoading && (
              <div className="flex items-center justify-center h-40">
                <div className="text-[12px] font-bold text-cyan-400 animate-pulse uppercase tracking-widest">กำลังโหลดข้อมูล…</div>
              </div>
            )}

            {overview && !overviewLoading && (
              <>
                {/* ── Header ── */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <h1 className="text-xl font-black text-slate-100">ภาพรวมกรุงเทพมหานคร</h1>
                    <p className="text-[11px] text-slate-500 mt-0.5">50 เขต · ปี {selectedYear}{hasDelta ? ` เปรียบเทียบกับ ${compareYear}` : ""}</p>
                  </div>
                  {hasDelta && (
                    <div className="ml-auto flex items-center gap-2 rounded-lg border border-cyan-800/50 bg-cyan-950/30 px-3 py-1.5">
                      <span className="text-[10px] font-bold text-cyan-400">Δ {selectedYear} − {compareYear}</span>
                      {compareOverviewLoading && <span className="text-[9px] text-slate-500 animate-pulse">โหลด…</span>}
                    </div>
                  )}
                </div>

                {/* ── KPI Cards with Δ ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { icon: Trees, label: "NDVI เฉลี่ย", val: bkkAvg?.ndvi, cmp: bkkAvg?.ndviCmp, color: "text-emerald-400", bg: "bg-emerald-500/10", fmt: (v: number) => v.toFixed(3), invert: false },
                    { icon: Trees, label: "พื้นที่เขียวรวม", val: bkkAvg?.green, cmp: bkkAvg?.greenCmp || null, color: "text-emerald-300", bg: "bg-emerald-500/10", fmt: (v: number) => `${Math.round(v/1000).toLocaleString()}k ไร่`, invert: false },
                    { icon: Flame, label: "LST เฉลี่ย", val: bkkAvg?.lst, cmp: bkkAvg?.lstCmp, color: "text-orange-400", bg: "bg-orange-500/10", fmt: (v: number) => `${v.toFixed(1)}°C`, invert: true },
                    { icon: Moon, label: "NTL เฉลี่ย", val: bkkAvg?.ntl, cmp: bkkAvg?.ntlCmp, color: "text-yellow-400", bg: "bg-yellow-500/10", fmt: (v: number) => v.toFixed(1), invert: false },
                    { icon: Wind, label: "มลพิษเฉลี่ย", val: bkkAvg?.pollution, cmp: bkkAvg?.pollutionCmp, color: "text-purple-400", bg: "bg-purple-500/10", fmt: (v: number) => `${v.toFixed(2)} /10`, invert: true },
                    { icon: Droplets, label: "สัดส่วนน้ำ", val: bkkAvg?.water, cmp: bkkAvg?.waterCmp, color: "text-sky-400", bg: "bg-sky-500/10", fmt: (v: number) => `${(v*100).toFixed(2)}%`, invert: false },
                  ].map(({ icon: Icon, label, val, cmp, color, bg, fmt: fmtFn, invert }) => (
                    <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-3.5 w-3.5 ${color}`} /></div>
                        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                      </div>
                      <div className={`text-xl font-black tabular-nums ${color}`}>{val != null ? fmtFn(val) : "–"}</div>
                      {hasDelta && cmp != null && val != null && (
                        <DeltaBadge delta={val - cmp} invert={invert} unit="" />
                      )}
                    </div>
                  ))}
                </div>

                {/* ── Trend charts ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <MiniTrend data={combinedTrend} dataKey="ndvi" label={`NDVI เฉลี่ย กทม. (2018–2026)`} color="#10b981" unit="" decimals={3} />
                  <MiniTrend data={combinedTrend} dataKey="lst" label="LST เฉลี่ย กทม. (°C)" color="#f97316" unit="°C" decimals={1} />
                  <MiniTrend data={combinedTrend} dataKey="green" label="พื้นที่เขียวรวม กทม. (พัน ไร่)" color="#34d399" unit="k ไร่" decimals={0} />
                </div>

                {/* ── Multi-year BKK summary table ── */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
                    <span className="text-[12px] font-semibold text-slate-300">เปรียบเทียบรายปี — ค่าเฉลี่ย กทม.</span>
                    <span className="text-[10px] text-slate-600">Δ = เปลี่ยนจากปีก่อน</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="bg-slate-900/80">
                        <tr className="border-b border-slate-800">
                          {["ปี","NDVI เฉลี่ย","Δ NDVI","พื้นที่เขียว (พัน ไร่)","Δ เขียว","LST เฉลี่ย (°C)","Δ LST"].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {multiYearTable.map(row => {
                          const isSel = String(row.year) === String(selectedYear);
                          const isCmp = String(row.year) === String(compareYear);
                          return (
                            <tr key={row.year} className={`border-b border-slate-800/40 hover:bg-slate-800/20 ${isSel ? "bg-cyan-950/20" : ""}`}>
                              <td className="px-3 py-2 font-black tabular-nums">
                                <span className={isSel ? "text-cyan-400" : isCmp ? "text-slate-400" : "text-slate-500"}>{row.year}</span>
                                {isSel && <span className="ml-1.5 text-[8px] text-cyan-600 bg-cyan-950/60 px-1.5 py-0.5 rounded-full">เลือก</span>}
                                {isCmp && !isSel && <span className="ml-1.5 text-[8px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">เปรียบ</span>}
                              </td>
                              <td className="px-3 py-2 tabular-nums font-mono text-emerald-400">{row.ndvi != null ? row.ndvi.toFixed(4) : "–"}</td>
                              <td className="px-3 py-2 tabular-nums font-mono">{row.dNdvi != null ? <InlineDelta v={row.dNdvi} decimals={4} /> : <span className="text-slate-700">–</span>}</td>
                              <td className="px-3 py-2 tabular-nums font-mono text-emerald-300">{row.green != null ? row.green.toFixed(1) : "–"}</td>
                              <td className="px-3 py-2 tabular-nums font-mono">{row.dGreen != null ? <InlineDelta v={row.dGreen} decimals={1} /> : <span className="text-slate-700">–</span>}</td>
                              <td className="px-3 py-2 tabular-nums font-mono text-orange-400">{row.lst != null ? `${row.lst.toFixed(2)}°C` : "–"}</td>
                              <td className="px-3 py-2 tabular-nums font-mono">{row.dLst != null ? <InlineDelta v={row.dLst} lowerBetter decimals={2} /> : <span className="text-slate-700">–</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Insights (only when compare data available) ── */}
                {hasDelta && insights.improve.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-[12px] font-semibold text-slate-300">การวิเคราะห์การเปลี่ยนแปลง {compareYear} → {selectedYear}</span>
                      <div className="flex gap-1.5 ml-auto">
                        <button onClick={() => setActiveInsightTab("improve")}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${activeInsightTab === "improve" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-700/50" : "text-slate-500 hover:text-slate-300"}`}>
                          <CheckCircle className="h-3 w-3 inline mr-1" />ดีขึ้น
                        </button>
                        <button onClick={() => setActiveInsightTab("decline")}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${activeInsightTab === "decline" ? "bg-red-500/20 text-red-400 border border-red-700/50" : "text-slate-500 hover:text-slate-300"}`}>
                          <AlertCircle className="h-3 w-3 inline mr-1" />แย่ลง
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(activeInsightTab === "improve" ? insights.improve : insights.decline).map((ins: any, i: number) => (
                        <div key={i} className={`rounded-lg border p-3 cursor-pointer hover:border-slate-600 transition-colors ${activeInsightTab === "improve" ? "border-emerald-800/40 bg-emerald-950/20" : "border-red-800/40 bg-red-950/20"}`}
                          onClick={() => setSelectedDistrict(ins.label)}>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-300">{ins.label}</span>
                            <span className={`text-[10px] font-black tabular-nums shrink-0 ${activeInsightTab === "improve" ? "text-emerald-400" : "text-red-400"}`}>{ins.value}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">{ins.sub}</p>
                        </div>
                      ))}
                    </div>
                    {/* Summary stats */}
                    <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "เขต NDVI > 0.30", val: overview.districts.filter(d => (d.ndvi_mean ?? 0) > 0.3).length, color: "text-emerald-400" },
                        { label: "เขต NDVI < 0.15", val: overview.districts.filter(d => d.ndvi_mean != null && d.ndvi_mean < 0.15).length, color: "text-red-400" },
                        { label: "เขต LST > 37°C", val: overview.districts.filter(d => d.mean_lst != null && d.mean_lst > 37).length, color: "text-orange-400" },
                        { label: "เขต LST < 34°C", val: overview.districts.filter(d => d.mean_lst != null && d.mean_lst < 34).length, color: "text-sky-400" },
                      ].map(s => (
                        <div key={s.label} className="text-center">
                          <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Distribution ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* NDVI distribution */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                    <div className="mb-3 text-[11px] font-semibold text-slate-400">การกระจาย NDVI — 50 เขต ปี {selectedYear}</div>
                    <div className="space-y-2">
                      {ndviDist.map(b => (
                        <div key={b.label} className="flex items-center gap-2 group" title={b.districts.join(", ")}>
                          <span className="text-[10px] w-20 text-slate-500 shrink-0 tabular-nums">{b.label}</span>
                          <div className="flex-1 h-5 bg-slate-800 rounded-full overflow-hidden relative">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(b.count / 50) * 100}%`, backgroundColor: b.color }} />
                          </div>
                          <span className="text-[10px] font-bold tabular-nums w-8 text-right" style={{ color: b.color }}>{b.count}</span>
                          <span className="text-[9px] text-slate-600 w-8 text-right">{((b.count / 50) * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-3">ชี้เมาส์ที่แถบเพื่อดูชื่อเขต</p>
                  </div>
                  {/* LST distribution */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                    <div className="mb-3 text-[11px] font-semibold text-slate-400">การกระจาย LST — 50 เขต ปี {selectedYear}</div>
                    <div className="space-y-2">
                      {lstDist.map(b => (
                        <div key={b.label} className="flex items-center gap-2" title={b.districts.join(", ")}>
                          <span className="text-[10px] w-20 text-slate-500 shrink-0 tabular-nums">{b.label}</span>
                          <div className="flex-1 h-5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(b.count / 50) * 100}%`, backgroundColor: b.color }} />
                          </div>
                          <span className="text-[10px] font-bold tabular-nums w-8 text-right" style={{ color: b.color }}>{b.count}</span>
                          <span className="text-[9px] text-slate-600 w-8 text-right">{((b.count / 50) * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-3">ชี้เมาส์ที่แถบเพื่อดูชื่อเขต</p>
                  </div>
                </div>

                {/* ── Bar chart ranking ── */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <span className="text-[12px] font-semibold text-slate-300">อันดับ 50 เขต ปี {selectedYear}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {BAR_METRICS.map(m => (
                        <button key={m.key as string} onClick={() => setActiveBarMetric(m.key)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors border ${activeBarMetric === m.key ? "border-transparent text-slate-900" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
                          style={activeBarMetric === m.key ? { backgroundColor: m.color } : {}}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={Math.max(420, barData.length * 14)}>
                    <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 64, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={v => activeCfg.fmt(v)} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} width={80} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                        formatter={(v: any) => [activeCfg.fmt(v), activeCfg.label]} />
                      <Bar dataKey="value" radius={[0, 3, 3, 0]}
                        label={{ position: "right", fontSize: 9, fill: "#64748b", formatter: (v: any) => activeCfg.fmt(v) }}>
                        {barData.map((d, i) => (
                          <Cell key={i} fill={
                            activeCfg.lowerBetter
                              ? (d.isBot ? "#ef4444" : d.isTop ? "#10b981" : "#47556970")
                              : (d.isTop ? activeCfg.color : d.isBot ? "#ef444450" : "#47556970")
                          } />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ── Sortable all-district table ── */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 flex-wrap">
                    <span className="text-[12px] font-semibold text-slate-300">ข้อมูลทุกเขต ปี {selectedYear}</span>
                    {hasDelta && (
                      <button onClick={() => setShowDeltaCol(v => !v)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors ${showDeltaCol ? "border-cyan-700/50 bg-cyan-950/30 text-cyan-400" : "border-slate-700 text-slate-500"}`}>
                        <Info className="h-3 w-3" />{showDeltaCol ? "ซ่อน Δ" : "แสดง Δ"} vs {compareYear}
                      </button>
                    )}
                    <span className="text-[10px] text-slate-600">คลิกหัวคอลัมน์เรียง · คลิกชื่อเขตดูรายละเอียด</span>
                    <div className="flex-1" />
                    <button onClick={exportOverviewCSV} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300">
                      <Download className="h-3 w-3" /> Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="bg-slate-900/80">
                        <tr className="border-b border-slate-800">
                          <th className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-600 sticky left-0 bg-slate-900/95 z-10 w-8">#</th>
                          <th className="px-2 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-600 sticky left-8 bg-slate-900/95 z-10">เขต</th>
                          <SortTh label="NDVI" col="ndvi_mean" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          {hasDelta && showDeltaCol && <SortTh label="ΔNDVI" col="delta_ndvi" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                          <SortTh label="เขียว (ไร่)" col="green_area_rai" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          {hasDelta && showDeltaCol && <SortTh label="Δเขียว" col="delta_green" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                          <SortTh label="เขียว %" col="green_area_ratio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="LST °C" col="mean_lst" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          {hasDelta && showDeltaCol && <SortTh label="ΔLST" col="delta_lst" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                          <SortTh label="NDBI" col="ndbi_mean" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="สิ่งปลูก (ไร่)" col="builtup_area_rai" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="มลพิษ" col="pollution_score" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          {hasDelta && showDeltaCol && <SortTh label="Δมลพิษ" col="delta_pollution" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                          <SortTh label="น้ำ %" col="water_ratio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          <SortTh label="NTL" col="ntl_mean" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                          {hasDelta && showDeltaCol && <SortTh label="ΔNTL" col="delta_ntl" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((d: any, i: number) => (
                          <tr key={d.id} onClick={() => setSelectedDistrict(d.name_th)}
                            className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors">
                            <td className="px-3 py-2 text-slate-600 text-[9px] tabular-nums sticky left-0 bg-slate-950 z-10">{i + 1}</td>
                            <td className="px-2 py-2 font-bold text-slate-300 whitespace-nowrap sticky left-8 bg-slate-950 z-10 min-w-[72px]">{d.name_th}</td>
                            <td className="px-2 py-2 tabular-nums font-mono"><span className={d.ndvi_mean != null && d.ndvi_mean >= 0.3 ? "text-emerald-400" : "text-emerald-600"}>{fmt(d.ndvi_mean, 3)}</span></td>
                            {hasDelta && showDeltaCol && <td className="px-2 py-2 tabular-nums font-mono"><InlineDelta v={d.delta_ndvi} decimals={3} /></td>}
                            <td className="px-2 py-2 tabular-nums font-mono text-emerald-300">{d.green_area_rai != null ? Math.round(d.green_area_rai).toLocaleString() : "–"}</td>
                            {hasDelta && showDeltaCol && <td className="px-2 py-2 tabular-nums font-mono"><InlineDelta v={d.delta_green != null ? Math.round(d.delta_green) : null} /></td>}
                            <td className="px-2 py-2 tabular-nums font-mono text-slate-400">{fmtPct(d.green_area_ratio)}</td>
                            <td className="px-2 py-2 tabular-nums font-mono"><span className={d.mean_lst != null && d.mean_lst > 37 ? "text-red-400" : "text-orange-400"}>{fmt(d.mean_lst, 1, "°C")}</span></td>
                            {hasDelta && showDeltaCol && <td className="px-2 py-2 tabular-nums font-mono"><InlineDelta v={d.delta_lst} lowerBetter decimals={2} /></td>}
                            <td className="px-2 py-2 tabular-nums font-mono text-amber-400">{fmt(d.ndbi_mean, 4)}</td>
                            <td className="px-2 py-2 tabular-nums font-mono text-amber-300">{d.builtup_area_rai != null ? Math.round(d.builtup_area_rai).toLocaleString() : "–"}</td>
                            <td className="px-2 py-2 tabular-nums font-mono text-purple-400">{fmt(d.pollution_score, 2)}</td>
                            {hasDelta && showDeltaCol && <td className="px-2 py-2 tabular-nums font-mono"><InlineDelta v={d.delta_pollution} lowerBetter decimals={2} /></td>}
                            <td className="px-2 py-2 tabular-nums font-mono text-sky-400">{fmtPct(d.water_ratio)}</td>
                            <td className="px-2 py-2 tabular-nums font-mono text-yellow-400">{fmt(d.ntl_mean, 1)}</td>
                            {hasDelta && showDeltaCol && <td className="px-2 py-2 tabular-nums font-mono"><InlineDelta v={d.delta_ntl} decimals={1} /></td>}
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

        {/* ════════════════════════════════════════════════════════════
            DISTRICT MODE
        ════════════════════════════════════════════════════════════ */}
        {selectedDistrict && profileLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-[12px] font-bold text-cyan-400 animate-pulse uppercase tracking-widest">กำลังโหลด…</div>
          </div>
        )}
        {selectedDistrict && profileError && !profileLoading && (
          <div className="flex items-center justify-center h-full"><div className="text-red-400 text-[12px]">{profileError}</div></div>
        )}
        {selectedDistrict && !profileLoading && !profileError && profileData && (
          <div className="p-5 space-y-5">

            {/* Header */}
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-slate-100">เขต{profileData.district}</h1>
              <span className="text-[11px] text-slate-500 font-semibold">พื้นที่รวม {profileData.areaRai.toLocaleString()} ไร่</span>
              <span className="text-[11px] text-slate-600">·</span>
              <span className="text-[11px] text-slate-500">ปี {selectedYear} เทียบกับ {compareYear}</span>
              {!cur && (
                <span className="text-[10px] text-amber-400 font-bold bg-amber-950/40 border border-amber-800/50 rounded-full px-2.5 py-1">
                  ไม่มีข้อมูลปี {selectedYear} — แสดงแนวโน้มทุกปีด้านล่าง
                </span>
              )}
            </div>

            {/* Metric cards with rank — only when current year has data */}
            {cur ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricCard icon={Flame} label="LST เฉลี่ย" color="text-orange-400" iconBg="bg-orange-500/10"
                  value={fmt(cur.mean_lst, 2, " °C")} sub={`สูงสุด ${fmt(cur.max_lst, 2, "°C")}`}
                  delta={delta("mean_lst")} deltaInvert deltaUnit="°C"
                  rank={profileDistrictId ? getRank(profileDistrictId, "mean_lst") : undefined} />
                <MetricCard icon={Trees} label="พื้นที่สีเขียว" color="text-emerald-400" iconBg="bg-emerald-500/10"
                  value={fmtRai(cur.green_area_rai)} sub={`NDVI ${fmt(cur.ndvi_mean, 4)} · ${fmtPct(cur.green_area_ratio)}`}
                  delta={delta("green_area_rai")} deltaUnit=" ไร่"
                  rank={profileDistrictId ? getRank(profileDistrictId, "ndvi_mean") : undefined} />
                <MetricCard icon={Building2} label="สิ่งปลูกสร้าง" color="text-amber-400" iconBg="bg-amber-500/10"
                  value={fmtRai(cur.builtup_area_rai)} sub={`NDBI ${fmt(cur.ndbi_mean, 4)}`}
                  delta={delta("builtup_area_rai")} deltaInvert deltaUnit=" ไร่"
                  rank={profileDistrictId ? getRank(profileDistrictId, "ndbi_mean") : undefined} />
                <MetricCard icon={Wind} label="มลพิษอากาศ" color="text-purple-400" iconBg="bg-purple-500/10"
                  value={`${fmt(cur.pollution_score, 2)} /10`}
                  sub={`${pollutionLabel(cur.pollution_score)} · NO₂ ${fmtNo2(cur.no2_mean)}`}
                  delta={delta("pollution_score")} deltaInvert
                  rank={profileDistrictId ? getRank(profileDistrictId, "pollution_score") : undefined} />
                <MetricCard icon={Droplets} label="พื้นที่น้ำ" color="text-sky-400" iconBg="bg-sky-500/10"
                  value={cur.water_area_rai != null ? `${Math.round(cur.water_area_rai).toLocaleString()} ไร่` : fmtPct(cur.water_ratio)}
                  sub={`${fmtPct(cur.water_ratio)} พื้นที่ · NDWI ${fmt(cur.ndwi_mean, 4)}`}
                  delta={delta("water_ratio") != null ? (delta("water_ratio") as number) * 100 : null}
                  deltaUnit="%" />
                <MetricCard icon={Moon} label="แสงไฟกลางคืน" color="text-yellow-400" iconBg="bg-yellow-500/10"
                  value={fmt(cur.ntl_mean, 2)} sub="nW/sr/cm²"
                  delta={delta("ntl_mean")}
                  rank={profileDistrictId ? getRank(profileDistrictId, "ntl_mean") : undefined} />
              </div>
            ) : (
              <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 px-5 py-4 text-[11px] text-amber-300">
                ยังไม่มีข้อมูลดาวเทียมปี {selectedYear} สำหรับเขต{profileData.district} — เลือกปีอื่น หรือดูแนวโน้มรายปีที่ตารางด้านล่าง
              </div>
            )}

            {/* Trend charts — 3×2 grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TrendChart data={trendData.map(d => ({ year: d.year, district: d.district_green, bkk: d.bkk_green }))}
                dk="district" bk="bkk" label="พื้นที่สีเขียว (ไร่) รายปี" color="#10b981" unit="ไร่" decimals={0} />
              <TrendChart data={trendData.map(d => ({ year: d.year, district: d.district_lst, bkk: d.bkk_lst }))}
                dk="district" bk="bkk" label="LST เฉลี่ย (°C) รายปี" color="#f97316" unit="°C" decimals={2} />
              <TrendChart data={trendData.map(d => ({ year: d.year, district: d.district_builtup, bkk: d.bkk_builtup }))}
                dk="district" bk="bkk" label="สิ่งปลูกสร้าง (ไร่) รายปี" color="#f59e0b" unit="ไร่" decimals={0} />
              <TrendChart data={trendData.map(d => ({ year: d.year, district: d.district_air, bkk: d.bkk_air }))}
                dk="district" bk="bkk" label="คะแนนมลพิษ (0–10) รายปี" color="#a78bfa" unit="" decimals={2} />
              <TrendChart data={trendData.map(d => ({ year: d.year, district: d.district_ntl, bkk: d.bkk_ntl }))}
                dk="district" bk="bkk" label="แสงไฟกลางคืน NTL รายปี" color="#fbbf24" unit="" decimals={1} />
              <TrendChart data={trendData.map(d => ({ year: d.year, district: d.district_water, bkk: d.bkk_water }))}
                dk="district" bk="bkk" label="สัดส่วนน้ำ (%) รายปี" color="#38bdf8" unit="%" decimals={2} />
            </div>

            {/* vs BKK comparison */}
            {comparisonData.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 text-[11px] font-semibold text-slate-400">เขต{profileData.district} vs ค่าเฉลี่ยกรุงเทพฯ ปี {selectedYear}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {comparisonData.map(m => {
                    const pct = m.b > 0 ? ((m.d - m.b) / m.b) * 100 : 0;
                    return (
                      <div key={m.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{m.label}</span>
                          <span className={`text-[9px] font-black ${pct > 0 ? "text-red-400" : "text-emerald-400"}`}>{pct > 0 ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%</span>
                        </div>
                        <div className="space-y-1.5">
                          <div>
                            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5"><span>เขตนี้</span><span style={{ color: m.color }} className="font-bold">{m.d.toFixed(2)}</span></div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.d / Math.max(m.d, m.b)) * 100)}%`, backgroundColor: m.color }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5"><span>เฉลี่ย กทม.</span><span className="font-bold text-slate-400">{m.b.toFixed(2)}</span></div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full bg-slate-600" style={{ width: `${Math.min(100, (m.b / Math.max(m.d, m.b)) * 100)}%` }} />
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
                <span className="text-[11px] font-semibold text-slate-400">ข้อมูลทุกปี — เขต{profileData.district}</span>
                <button onClick={() => setShowTableDelta(v => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold transition-colors ${showTableDelta ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-400" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
                  <TrendingUp className="h-3 w-3" />{showTableDelta ? "ซ่อน Δ ปีก่อน" : "แสดง Δ ปีก่อน"}
                </button>
                <div className="flex-1" />
                <button onClick={exportCSV} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300">
                  <Download className="h-3 w-3" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-900/80">
                    <tr className="border-b border-slate-800">
                      {["ปี","LST เฉลี่ย","LST สูงสุด","NDVI","พื้นที่เขียว (ไร่)","สัดส่วนเขียว","NDBI","สิ่งปลูกสร้าง (ไร่)","NO₂ (×10⁻⁴ mol/m²)","คะแนนมลพิษ (/10)","สัดส่วนน้ำ","NTL Mean"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...profileData.years].sort((a, b) => a - b).map(yr => {
                      const m = profileData.metrics[yr]; const d = yearlyDeltas[yr];
                      const isSel = yr === selectedYear; const isCmp = yr === compareYear;
                      return (
                        <tr key={yr} className={`border-b border-slate-800/40 hover:bg-slate-800/20 ${isSel ? "bg-cyan-950/20" : ""}`}>
                          <td className="px-3 py-2 font-black tabular-nums whitespace-nowrap">
                            <span className={isSel ? "text-cyan-400" : isCmp ? "text-slate-400" : "text-slate-500"}>{yr}</span>
                            {isSel && <span className="ml-1.5 text-[8px] text-cyan-600 bg-cyan-950/60 px-1.5 py-0.5 rounded-full">เลือก</span>}
                            {isCmp && !isSel && <span className="ml-1.5 text-[8px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">เปรียบ</span>}
                          </td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-orange-400">{fmt(m?.mean_lst, 2, "°C")}</span>{showTableDelta && d?.mean_lst != null && <DeltaSpan delta={d.mean_lst} lower unit="°C" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-red-400">{fmt(m?.max_lst, 2, "°C")}</span>{showTableDelta && d?.max_lst != null && <DeltaSpan delta={d.max_lst} lower unit="°C" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-emerald-400">{fmt(m?.ndvi_mean, 4)}</span>{showTableDelta && d?.ndvi_mean != null && <DeltaSpan delta={d.ndvi_mean} />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-emerald-300">{m?.green_area_rai != null ? Math.round(m.green_area_rai).toLocaleString() : "–"}</span>{showTableDelta && d?.green_area_rai != null && <DeltaSpan delta={d.green_area_rai} unit="ไร่" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-slate-400">{fmtPct(m?.green_area_ratio)}</span>{showTableDelta && d?.green_area_ratio != null && <DeltaSpan delta={d.green_area_ratio * 100} unit="%" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-amber-400">{fmt(m?.ndbi_mean, 4)}</span>{showTableDelta && d?.ndbi_mean != null && <DeltaSpan delta={d.ndbi_mean} lower />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-amber-300">{m?.builtup_area_rai != null ? Math.round(m.builtup_area_rai).toLocaleString() : "–"}</span>{showTableDelta && d?.builtup_area_rai != null && <DeltaSpan delta={d.builtup_area_rai} lower unit="ไร่" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-purple-400">{fmtNo2(m?.no2_mean, true)}</span>{showTableDelta && d?.no2_mean != null && <DeltaSpan delta={d.no2_mean * 10000} lower unit="×10⁻⁴" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-purple-300">{fmt(m?.pollution_score, 2)}</span>{showTableDelta && d?.pollution_score != null && <DeltaSpan delta={d.pollution_score} lower />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-sky-400">{fmtPct(m?.water_ratio)}</span>{m?.water_area_rai != null && <span className="text-[9px] text-slate-600 block">{Math.round(m.water_area_rai).toLocaleString()} ไร่</span>}{showTableDelta && d?.water_ratio != null && <DeltaSpan delta={d.water_ratio * 100} unit="%" />}</td>
                          <td className="px-3 py-2 tabular-nums font-mono"><span className="text-yellow-400">{fmt(m?.ntl_mean, 2)}</span>{showTableDelta && d?.ntl_mean != null && <DeltaSpan delta={d.ntl_mean} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {profileData.bkkAverages[selectedYear] && (() => {
                    const b = profileData.bkkAverages[selectedYear];
                    return (
                      <tfoot className="border-t border-slate-700/60 bg-slate-900/90">
                        <tr>
                          <td className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 whitespace-nowrap">เฉลี่ย กทม. {selectedYear}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.mean_lst, 2, "°C")}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.max_lst, 2, "°C")}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ndvi_mean, 4)}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.green_area_rai != null ? Math.round(b.green_area_rai).toLocaleString() : "–"}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmtPct(b.green_area_ratio)}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ndbi_mean, 4)}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.builtup_area_rai != null ? Math.round(b.builtup_area_rai).toLocaleString() : "–"}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmtNo2(b.no2_mean, true)}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.pollution_score, 2)}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmtPct(b.water_ratio)}{b.water_area_rai != null && <span className="block text-[8px]">{Math.round(b.water_area_rai).toLocaleString()} ไร่</span>}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ntl_mean, 2)}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
