/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area,
  ReferenceLine,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, MapPin, Lightbulb, ChevronLeft, ChevronRight, X, Database, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

type Metric = "lst" | "vegetation" | "builtup" | "air_pollution";

interface StatsDashboardProps {
  summary: any;
  metric: Metric;
  year: number;
  compareMode?: boolean;
  accentColor?: string;
  activeDistrict?: string;
  // Inline control callbacks — when provided, controls render inside the dashboard
  onYearChange?: (year: number) => void;
  minYear?: number;
  maxYear?: number;
  onDistrictChange?: (district: string) => void;
  districts?: string[];
  // Compare controls
  onCompareModeChange?: (v: boolean) => void;
  compareYear?: number;
  onCompareYearChange?: (y: number) => void;
}

function getConfig(metric: Metric) {
  return {
    lst: {
      barTitle: "LST เฉลี่ยรายเขต (°C)", barUnit: "°C",
      trendTitle: "แนวโน้ม LST เฉลี่ยรายปี", trendUnit: "°C",
      barColor: "#f97316", barColorHigh: "#ef4444", accentHex: "#f97316",
      thresholdLabel: "เขตร้อน (≥36°C)", threshold: 36, thresholdColor: "#ef4444",
      formatVal: (v: number) => `${v.toFixed(2)}°C`, formatShort: (v: number) => v.toFixed(2),
    },
    vegetation: {
      barTitle: "NDVI เฉลี่ยรายเขต", barUnit: "",
      trendTitle: "แนวโน้ม NDVI เฉลี่ยรายปี", trendUnit: "",
      barColor: "#10b981", barColorHigh: "#34d399", accentHex: "#10b981",
      thresholdLabel: "NDVI ต่ำ (<0.20)", threshold: 0.20, thresholdColor: "#f59e0b",
      formatVal: (v: number) => v.toFixed(4), formatShort: (v: number) => v.toFixed(4),
    },
    builtup: {
      barTitle: "พื้นที่สิ่งปลูกสร้าง (ไร่)", barUnit: "ไร่",
      trendTitle: "แนวโน้ม NDBI เฉลี่ยรายปี", trendUnit: "",
      barColor: "#6366f1", barColorHigh: "#818cf8", accentHex: "#6366f1",
      thresholdLabel: "ขยายตัวสูง (Q3+)", threshold: null, thresholdColor: "#818cf8",
      formatVal: (v: number) => v.toLocaleString(), formatShort: (v: number) => v.toLocaleString(),
    },
    air_pollution: {
      barTitle: "คะแนนมลพิษอากาศรายเขต (0-10)", barUnit: "",
      trendTitle: "แนวโน้มคะแนนมลพิษรวมรายปี", trendUnit: "คะแนน",
      barColor: "#06b6d4", barColorHigh: "#22d3ee", accentHex: "#06b6d4",
      thresholdLabel: "มลพิษสูง (Score≥6)", threshold: 6, thresholdColor: "#f87171",
      formatVal: (v: number) => v.toFixed(3), formatShort: (v: number) => v.toFixed(3),
    },
  }[metric];
}

function computeStats(values: number[]) {
  if (!values.length) return { mean: null, median: null, min: null, max: null, stdDev: null, q1: null, q3: null };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  return { mean, median, min: sorted[0], max: sorted[n - 1], stdDev, q1: sorted[Math.floor(n * 0.25)], q3: sorted[Math.floor(n * 0.75)] };
}

function buildDistribution(values: number[], bins = 8) {
  if (!values.length) return [];
  const min = Math.min(...values); const max = Math.max(...values);
  if (min === max) return [{ label: min.toFixed(2), count: values.length, pct: 100 }];
  const step = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({ label: `${(min + step * i).toFixed(2)}`, count: 0, pct: 0 }));
  values.forEach((v) => { const idx = Math.min(Math.floor((v - min) / step), bins - 1); buckets[idx].count++; });
  const total = values.length;
  buckets.forEach((b) => { b.pct = Math.round((b.count / total) * 100); });
  return buckets;
}

function generateInsights(values: number[], ranking: any[], metric: Metric, cfg: ReturnType<typeof getConfig>, summary: any, compareMode: boolean): string[] {
  if (!values.length) return [];
  const stats = computeStats(values);
  const insights: string[] = [];
  const n = values.length;
  if (compareMode && summary.avgDelta != null) {
    const dir = summary.avgDelta > 0 ? "เพิ่มขึ้น" : "ลดลง";
    insights.push(`ภาพรวม กทม. ${dir} ${Math.abs(Number(summary.avgDelta)).toFixed(3)} ${cfg.trendUnit || cfg.barUnit} เทียบปีฐาน`);
  }
  if (!compareMode && stats.mean != null && ranking[0]) {
    const [topName, topVal] = ranking[0];
    if (topVal != null) insights.push(`${topName} มีค่าสูงกว่าค่าเฉลี่ย ${cfg.formatShort(Math.abs(Number(topVal) - stats.mean))} ${cfg.barUnit}`);
  }
  if (cfg.threshold != null && !compareMode) {
    const aboveCount = values.filter((v) => v >= cfg.threshold!).length;
    if (aboveCount > 0) insights.push(`${aboveCount} เขต (${Math.round((aboveCount / n) * 100)}%) มีค่าเกินเกณฑ์ ${cfg.thresholdLabel}`);
  }
  const trendRows: [string, number][] = summary.yearlyTrend ?? [];
  if (trendRows.length >= 3) {
    const first = Number(trendRows[0][1]);
    const last = Number(trendRows[trendRows.length - 1][1]);
    const delta = last - first;
    const years = Number(trendRows[trendRows.length - 1][0]) - Number(trendRows[0][0]);
    insights.push(`แนวโน้ม ${years} ปี: ${delta > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(delta).toFixed(3)} ${cfg.barUnit || cfg.trendUnit} (${trendRows[0][0]}–${trendRows[trendRows.length - 1][0]})`);
  }
  return insights.slice(0, 4);
}

function lerpColor(hex1: string, hex2: string, t: number) {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const ACCENT_COLORS: Record<string, { bg: string; border: string; text: string; sub: string }> = {
  orange:  { bg: "bg-orange-950/40",  border: "border-orange-900/30",  text: "text-orange-300",  sub: "text-orange-400/60" },
  emerald: { bg: "bg-emerald-950/40", border: "border-emerald-900/30", text: "text-emerald-300", sub: "text-emerald-400/60" },
  indigo:  { bg: "bg-indigo-950/40",  border: "border-indigo-900/30",  text: "text-indigo-300",  sub: "text-indigo-400/60" },
  cyan:    { bg: "bg-cyan-950/40",    border: "border-cyan-900/30",    text: "text-cyan-300",    sub: "text-cyan-400/60" },
};

// ─── Metric → profile field mapping ─────────────────────────────────────────
function metricFieldFromProfile(metric: Metric, m: any): number | null {
  if (!m) return null;
  if (metric === "lst")           return m.mean_lst        ?? null;
  if (metric === "vegetation")    return m.ndvi_mean        ?? null;
  if (metric === "builtup")       return m.ndbi_mean        ?? null;
  if (metric === "air_pollution") return m.pollution_score ?? m.no2_mean ?? null;
  return null;
}

function secondaryFieldFromProfile(metric: Metric, m: any): number | null {
  if (!m) return null;
  if (metric === "vegetation") return m.green_area_rai != null ? Math.round(m.green_area_rai) : null;
  if (metric === "builtup")    return m.builtup_area_rai ?? null;
  return null;
}

// ─── District-mode sub-component ─────────────────────────────────────────────
function DistrictModeView({ summary, cfg, metric, year, accentColor, ac, profileData }: {
  summary: any; cfg: ReturnType<typeof getConfig>; metric: Metric; year: number;
  accentColor: string; ac: typeof ACCENT_COLORS[string]; profileData: any;
}) {
  // Build trend data: prefer district-profile API (real per-district data), fall back to summary.yearlyTrend
  const profileTrendRows: [string, number][] = profileData?.years
    ? profileData.years
        .map((yr: number) => {
          const val = metricFieldFromProfile(metric, profileData.metrics?.[yr]);
          return val !== null ? [String(yr), val] : null;
        })
        .filter(Boolean) as [string, number][]
    : [];

  const summaryTrendRows: [string, number][] = summary.yearlyTrend ?? [];
  const trendSourceRows = profileTrendRows.length > 0 ? profileTrendRows : summaryTrendRows;
  const trendData = trendSourceRows.filter(([, v]) => v != null).map(([yr, v]) => ({ year: yr, value: Number(v) }));
  const hasProfileData = profileTrendRows.length > 0;

  // Year-by-year table using trendData
  const currentEntry = trendData.find((d) => Number(d.year) === year);
  const currentValue = currentEntry?.value ?? null;

  // Multi-year bar — district value per year
  const yearBarData = [...trendData].sort((a, b) => Number(a.year) - Number(b.year));

  // Delta vs previous year
  const changeEntries = yearBarData.map((d, i) => ({
    year: d.year,
    value: d.value,
    delta: i > 0 ? Number((d.value - yearBarData[i - 1].value).toFixed(4)) : 0,
  }));

  const allValues = trendData.map((d) => d.value);
  const stats = computeStats(allValues);

  // Secondary trend (green area rai / builtup area rai) — prefer profile data
  const profileSecondaryRows: [string, number][] = profileData?.years
    ? profileData.years
        .map((yr: number) => {
          const val = secondaryFieldFromProfile(metric, profileData.metrics?.[yr]);
          return val !== null ? [String(yr), val] : null;
        })
        .filter(Boolean) as [string, number][]
    : [];
  const summarySecondaryRows: [string, number][] =
    metric === "vegetation" ? (summary.greenAreaTrend ?? []) :
    metric === "builtup"    ? (summary.builtupAreaTrend ?? []) : [];
  const secondaryTrendRows = profileSecondaryRows.length > 0 ? profileSecondaryRows : summarySecondaryRows;
  const secondaryTrend = secondaryTrendRows.filter(([, v]) => v != null).map(([yr, v]) => ({ year: yr, value: Number(v) }));

  const monthlyData = metric === "lst" && Array.isArray(summary.monthlyTrend)
    ? summary.monthlyTrend.map((v: number | null, i: number) => ({ month: TH_MONTHS[i], value: v || null }))
    : [];

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-0 border-b border-slate-800/60">

      {/* Left: Multi-year trend for this district */}
      <div className="border-r border-slate-800/60 flex flex-col">
        <div className="shrink-0 px-5 py-3 border-b border-slate-800/40">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-slate-300">{cfg.trendTitle} (เขตนี้)</h3>
            {hasProfileData
              ? <span className="text-[9px] px-2 py-0.5 rounded-full border border-slate-700/60 bg-slate-800/40 text-slate-400 font-bold">Supabase</span>
              : <span className="text-[9px] px-2 py-0.5 rounded-full border border-amber-700/40 bg-amber-950/30 text-amber-400 font-bold">ยังไม่มีข้อมูลในDB</span>
            }
          </div>
          <p className="text-[10px] text-slate-600 mt-0.5">ค่ารายปีเปรียบเทียบกับปีก่อนหน้า</p>
        </div>
        <div className="flex-1 px-3 py-3" style={{ minHeight: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={changeEntries} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="distgrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cfg.accentHex} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                formatter={(v: any, name: any) => [
                  name === "value"
                    ? `${Number(v).toFixed(4)} ${cfg.barUnit}`
                    : `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(4)}`,
                  name === "value" ? cfg.trendTitle : "Δ ปีก่อน",
                ]}
              />
              <Area yAxisId="left" type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#distgrad)" strokeWidth={2.5} dot={{ r: 4, fill: cfg.accentHex, strokeWidth: 0 }} activeDot={{ r: 6 }} />
              <Bar yAxisId="right" dataKey="delta" maxBarSize={20} opacity={0.6} radius={[2, 2, 0, 0]}>
                {changeEntries.map((entry, i) => (
                  <Cell key={i} fill={entry.delta >= 0 ? cfg.barColorHigh : "#22d3ee"} />
                ))}
              </Bar>
              <ReferenceLine yAxisId="right" y={0} stroke="#475569" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Year table */}
        <div className="shrink-0 border-t border-slate-800/40 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-800/60">
                {["ปี", "ค่า", "เปลี่ยนจากปีก่อน", "เทียบค่ามัธยฐานเขต"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changeEntries.map((entry, i) => {
                const isCurrentYear = Number(entry.year) === year;
                const vsMed = stats.median != null ? entry.value - stats.median : null;
                return (
                  <tr key={entry.year} className={`border-b border-slate-800/30 transition-colors ${isCurrentYear ? `${ACCENT_COLORS[accentColor]?.bg ?? "bg-cyan-950/40"} font-bold` : "hover:bg-slate-800/20"}`}>
                    <td className="px-3 py-1.5 font-mono">{entry.year}{isCurrentYear && <span className="ml-1 text-[8px] rounded px-1" style={{ background: cfg.accentHex + "30", color: cfg.accentHex }}>ปีที่เลือก</span>}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums" style={{ color: cfg.accentHex }}>{cfg.formatShort(entry.value)}</td>
                    <td className={`px-3 py-1.5 font-mono tabular-nums ${i === 0 ? "text-slate-700" : metric === "vegetation" ? (entry.delta > 0 ? "text-emerald-400" : "text-red-400") : (entry.delta > 0 ? "text-red-400" : "text-emerald-400")}`}>
                      {i === 0 ? "–" : `${entry.delta > 0 ? "+" : ""}${cfg.formatShort(entry.delta)}`}
                    </td>
                    <td className={`px-3 py-1.5 font-mono tabular-nums ${vsMed == null ? "text-slate-700" : vsMed > 0 ? "text-amber-400" : "text-sky-400"}`}>
                      {vsMed == null ? "–" : `${vsMed > 0 ? "+" : ""}${cfg.formatShort(vsMed)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: stats for this district + secondary trend + monthly */}
      <div className="flex flex-col divide-y divide-slate-800/60 overflow-y-auto custom-scrollbar">

        {/* District stats card */}
        <div className="px-5 py-4">
          <h3 className="text-[13px] font-semibold text-slate-400 mb-3">สถิติเขตนี้ (ทุกปีที่มีข้อมูล)</h3>
          <div className="space-y-2">
            {[
              ["ค่าปีปัจจุบัน", currentValue != null ? cfg.formatVal(currentValue) : "–", cfg.accentHex],
              ["ค่าเฉลี่ย (ทุกปี)", stats.mean != null ? cfg.formatVal(stats.mean) : "–", "#94a3b8"],
              ["ต่ำสุด (ปีใด)", stats.min != null ? cfg.formatVal(stats.min) : "–", "#22d3ee"],
              ["สูงสุด (ปีใด)", stats.max != null ? cfg.formatVal(stats.max) : "–", "#f87171"],
              ["จำนวนปี", String(allValues.length), "#64748b"],
            ].map(([label, val, color]) => (
              <div key={label} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">{label}</span>
                <span className="font-mono font-bold" style={{ color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Secondary area trend */}
        {secondaryTrend.length > 0 && (
          <div className="px-5 py-4">
            <h3 className="text-[13px] font-semibold text-slate-400 mb-3">
              {metric === "vegetation" ? "พื้นที่สีเขียว (ไร่)" : "พื้นที่สิ่งปลูกสร้าง (ไร่)"}
            </h3>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={secondaryTrend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <defs><linearGradient id="s2d" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.25} /><stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false}
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${Number(v).toLocaleString()} ไร่`, ""]} />
                <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#s2d)" strokeWidth={2} dot={{ r: 3, fill: cfg.accentHex, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
            {metric === "vegetation" && (
              <p className="mt-1.5 text-[9px] text-slate-600 leading-snug">
                ประมาณจาก NDVI × พื้นที่เขต · แหล่งข้อมูล: แบบจำลอง ENSO+Urbanization (รอ GEE จริง)
              </p>
            )}
          </div>
        )}

        {/* Monthly (LST only) */}
        {monthlyData.length > 0 && monthlyData.some((d: any) => d.value) && (
          <div className="px-5 py-4">
            <h3 className="text-[13px] font-semibold text-slate-400 mb-3">LST รายเดือน ปี {year}</h3>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs><linearGradient id="md2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.3} /><stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${Number(v).toFixed(2)}°C`, "LST"]} />
                <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#md2)" strokeWidth={2} dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StatsDashboard({
  summary, metric, year, compareMode = false, accentColor = "cyan", activeDistrict,
  onYearChange, minYear = 2018, maxYear = 2026, onDistrictChange, districts = [],
  onCompareModeChange, compareYear = minYear, onCompareYearChange,
}: StatsDashboardProps) {
  // ── Fetch district profile (real per-district multi-year data) ─────────────
  const [profileData, setProfileData] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const isDistrictModeCheck = !!(activeDistrict && activeDistrict !== "ทั้งหมด");

  useEffect(() => {
    if (!isDistrictModeCheck) { setProfileData(null); return; }
    setProfileLoading(true);
    fetch(`/api/district-profile?district=${encodeURIComponent(activeDistrict!)}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setProfileData(d); else setProfileData(null); })
      .catch(() => setProfileData(null))
      .finally(() => setProfileLoading(false));
  }, [activeDistrict, isDistrictModeCheck]);

  if (!summary) {
    return <div className="flex h-full items-center justify-center text-slate-500 text-sm">ไม่มีข้อมูลสำหรับแสดง</div>;
  }

  const cfg = getConfig(metric);
  const rawRanking: any[] = metric === "air_pollution"
    ? compareMode
      ? summary.pollutionScoreDeltaRanking ?? []
      : summary.pollutionScoreRanking ?? summary.densityRanking ?? []
    : summary.ranking ?? [];
  const ac = ACCENT_COLORS[accentColor] ?? ACCENT_COLORS.cyan;
  const isDistrictMode = !!(activeDistrict && activeDistrict !== "ทั้งหมด");

  // Detect when DB has no stats for this metric (builtup, air_pollution without data seeded)
  const hasNoDbStats = !!(
    summary.dataSource &&
    (summary.dataSource.includes("no district_statistics") || summary.dataSource === "no district_statistics rows")
  );

  const values: number[] = rawRanking
    .map((r: any) => r[1]).filter((v: any) => v != null && Number.isFinite(Number(v))).map(Number);

  const stats = computeStats(values);
  const distribution = buildDistribution(values, 8);
  const insightSummary = metric === "air_pollution" && compareMode
    ? { ...summary, avgDelta: stats.mean, yearlyTrend: summary.pollutionScoreTrend ?? [] }
    : metric === "air_pollution"
      ? { ...summary, yearlyTrend: summary.pollutionScoreTrend ?? [] }
      : summary;
  const insights = generateInsights(values, rawRanking, metric, cfg, insightSummary, compareMode);

  const barData = [...rawRanking].filter(([, v]: any) => v != null)
    .map(([name, value]: any) => ({ name, value: Number(value) })).reverse();

  const trendRows: [string, number][] = metric === "air_pollution"
    ? summary.pollutionScoreTrend ?? []
    : summary.yearlyTrend ?? [];
  const trendData = trendRows.filter(([, v]) => v != null).map(([yr, v]) => ({ year: yr, value: Number(v) }));
  const deltaRows: [string, number][] = compareMode
    ? (metric === "air_pollution" ? summary.pollutionScoreDeltaTrend ?? [] : summary.yearlyDeltaTrend ?? [])
    : [];
  const deltaData = deltaRows.map(([yr, v]) => ({ year: yr, value: Number(v) }));
  const displayTrend = compareMode && deltaData.length ? deltaData : trendData;
  const trendUnit = compareMode ? `Δ ${cfg.trendUnit}` : cfg.trendUnit;
  const secondaryTrendRows: [string, number][] = metric === "vegetation" ? (summary.greenAreaTrend ?? []) : metric === "builtup" ? (summary.builtupAreaTrend ?? []) : [];
  const secondaryTrendData = secondaryTrendRows.filter(([, v]) => v != null).map(([yr, v]) => ({ year: yr, value: Number(v) }));
  const monthlyData = (metric === "lst" && !compareMode && Array.isArray(summary.monthlyTrend))
    ? summary.monthlyTrend.map((v: number | null, i: number) => ({ month: TH_MONTHS[i], value: v || null }))
    : [];

  const top5 = rawRanking.slice(0, 5);
  const bot5 = [...rawRanking].reverse().slice(0, 5);

  const avgTxt = stats.mean != null ? cfg.formatShort(stats.mean) : "–";
  const medTxt = stats.median != null ? cfg.formatShort(stats.median) : "–";
  const maxTxt = stats.max != null ? cfg.formatShort(stats.max) : "–";
  const minTxt = stats.min != null ? cfg.formatShort(stats.min) : "–";
  const stdTxt = stats.stdDev != null ? cfg.formatShort(stats.stdDev) : "–";
  const aboveCount = cfg.threshold != null ? values.filter((v) => v >= cfg.threshold!).length : null;

  const statStrip = [
    { label: "ค่าเฉลี่ย", value: avgTxt, unit: cfg.barUnit, color: "text-slate-200" },
    { label: "สูงสุด", value: maxTxt, unit: cfg.barUnit, color: "text-red-400" },
    { label: "ต่ำสุด", value: minTxt, unit: cfg.barUnit, color: "text-emerald-400" },
    ...(aboveCount != null
      ? [{ label: cfg.thresholdLabel, value: String(aboveCount), unit: "เขต", color: "text-rose-400" }]
      : [{ label: "เขตทั้งหมด", value: String(values.length), unit: "เขต", color: "text-slate-400" }]),
  ];

  return (
    <div className="flex-1 w-full flex h-full flex-col overflow-y-auto custom-scrollbar bg-slate-950">

      {/* ── Inline Controls Bar ────────────────────────────────────────────────── */}
      {(onYearChange || onDistrictChange) && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-700/60 bg-slate-900/50">

          {/* Year stepper */}
          {onYearChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">ปี</span>
              <button
                onClick={() => onYearChange(Math.max(minYear, year - 1))}
                disabled={year <= minYear}
                className="h-6 w-6 rounded flex items-center justify-center border border-slate-700/80 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className={`text-sm font-black font-mono tabular-nums min-w-[3rem] text-center ${ac.text}`}>{year}</span>
              <button
                onClick={() => onYearChange(Math.min(maxYear, year + 1))}
                disabled={year >= maxYear}
                className="h-6 w-6 rounded flex items-center justify-center border border-slate-700/80 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              <input
                type="range" min={minYear} max={maxYear} value={year}
                onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
                className={`w-28 h-1 bg-slate-800 rounded appearance-none cursor-pointer`}
                style={{ accentColor: cfg.accentHex }}
              />
              <span className="text-[9px] text-slate-600 font-mono">{minYear}–{maxYear}</span>
            </div>
          )}

          <div className="h-4 w-px bg-slate-700/60 shrink-0" />

          {/* District selector */}
          {onDistrictChange && districts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <MapPin className={`h-3 w-3 ${ac.text} shrink-0`} />
              <select
                value={activeDistrict ?? "ทั้งหมด"}
                onChange={(e) => onDistrictChange(e.target.value)}
                className="h-7 rounded border border-slate-700/80 bg-slate-900/60 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-slate-500"
                style={{ accentColor: cfg.accentHex }}
              >
                <option value="ทั้งหมด">ทุกเขต (50 เขต)</option>
                {districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {isDistrictMode && (
                <button onClick={() => onDistrictChange("ทั้งหมด")} className="h-5 w-5 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Compare toggle + baseline year */}
          {onCompareModeChange && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onCompareModeChange(!compareMode)}
                className={`h-7 px-3 rounded-lg border text-[11px] font-bold transition-colors ${compareMode ? "border-sky-600 bg-sky-900/40 text-sky-300" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
              >
                {compareMode ? "เทียบปีฐาน ON" : "เทียบปีฐาน"}
              </button>
              {compareMode && onCompareYearChange && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-600 font-bold">ฐาน</span>
                  <button
                    onClick={() => onCompareYearChange(Math.max(minYear, compareYear - 1))}
                    disabled={compareYear <= minYear}
                    className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span className="text-[11px] font-bold font-mono text-sky-300 min-w-[3rem] text-center">{compareYear}</span>
                  <button
                    onClick={() => onCompareYearChange(Math.min(year - 1, compareYear + 1))}
                    disabled={compareYear >= year - 1}
                    className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex-1" />
          <span className="text-[9px] text-slate-600">
            {compareMode ? `${year} vs ${compareYear}` : `ปี ${year}`} · {summary.dataSource ?? "Supabase"}
          </span>
        </div>
      )}

      {/* ── District filter banner ─────────────────────────────────────────────── */}
      {isDistrictMode && !onDistrictChange && (
        <div className={`shrink-0 flex items-center gap-2 px-5 py-2 ${ac.bg} border-b ${ac.border}`}>
          <MapPin className={`h-3 w-3 ${ac.text} shrink-0`} />
          <span className={`text-[11px] font-bold ${ac.text}`}>กรองเฉพาะเขต: {activeDistrict}</span>
          <span className="text-[10px] text-slate-500">· แนวโน้มและสถิติแสดงเฉพาะเขตนี้ทุกปี</span>
        </div>
      )}

      {/* ── No-stats banner (DB empty for this metric) ────────────────────────── */}
      {hasNoDbStats && !isDistrictMode && (
        <div className="shrink-0 flex items-start gap-3 px-5 py-3 bg-amber-950/30 border-b border-amber-800/40">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-amber-300">ยังไม่มีสถิติรายเขตในฐานข้อมูล</p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              ข้อมูลสถิติ <span className="font-bold text-slate-200">{cfg.barTitle}</span> ยังไม่ถูกประมวลผลใส่ Supabase
              — แผนที่ GEE แสดงค่าจริงจากดาวเทียม เลือกเขตจากแผนที่เพื่อดูค่า pixel จริงได้เลย
            </p>
          </div>
          <div className="ml-auto shrink-0 flex items-center gap-1">
            <Database className="h-3 w-3 text-slate-600" />
            <span className="text-[9px] text-slate-600">Supabase: ไม่มีข้อมูล</span>
          </div>
        </div>
      )}

      {/* ── Stats strip ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-slate-800/60">
        {statStrip.map((s, i) => (
          <div key={i} className={`px-4 py-3 border-r border-slate-800/60 last:border-r-0 ${i % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/20"}`}>
            <div className="text-[11px] font-semibold text-slate-500 mb-0.5">{s.label}</div>
            <div className={`text-lg font-black tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-700">{s.unit}</div>
          </div>
        ))}
      </div>

      {/* ── Main section: District mode vs All-districts mode ─────────────────── */}
      {isDistrictMode ? (
        profileLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-slate-500 text-sm">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-600 border-t-cyan-400 rounded-full" />
            กำลังโหลดข้อมูลจริงจาก Supabase…
          </div>
        ) : (
          <DistrictModeView summary={summary} cfg={cfg} metric={metric} year={year} accentColor={accentColor} ac={ac} profileData={profileData} />
        )
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-0 border-b border-slate-800/60">

          {/* Bar chart: all 50 districts */}
          <div className="border-r border-slate-800/60 flex flex-col min-h-0">
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-800/40">
              <div>
                <h3 className="text-[13px] font-semibold text-slate-300">{cfg.barTitle}</h3>
                <p className="text-[10px] text-slate-600 mt-0.5">50 เขตกรุงเทพฯ เรียงจากมากไปน้อย · ปี {year}</p>
              </div>
              {cfg.threshold != null && (
                <div className="text-[9px] font-bold px-2 py-0.5 rounded-full border" style={{ borderColor: cfg.thresholdColor + "60", color: cfg.thresholdColor, backgroundColor: cfg.thresholdColor + "15" }}>
                  เกณฑ์ {cfg.threshold} {cfg.barUnit}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2" style={{ minHeight: 300 }}>
              <div style={{ height: Math.max(320, barData.length * 18) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const v = Number(payload[0].value);
                        const rank = barData.length - barData.findIndex((d) => d.name === label);
                        const pct = stats.mean != null ? ((v - stats.mean) / Math.abs(stats.mean) * 100) : null;
                        return (
                          <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-[11px] shadow-xl">
                            <p className="font-bold text-slate-200">{label}</p>
                            <p className="font-mono" style={{ color: cfg.accentHex }}>{cfg.formatVal(v)} {cfg.barUnit}</p>
                            <p className="text-slate-500">อันดับ {rank}/{barData.length}</p>
                            {pct != null && <p className="text-slate-500">{pct > 0 ? "+" : ""}{pct.toFixed(1)}% จากค่าเฉลี่ย</p>}
                          </div>
                        );
                      }}
                      cursor={{ fill: "rgba(148,163,184,0.05)" }}
                    />
                    {cfg.threshold != null && <ReferenceLine x={cfg.threshold} stroke={cfg.thresholdColor} strokeDasharray="3 3" strokeWidth={1.5} />}
                    <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={13}
                      label={{ position: "right", fontSize: 10, fill: "#64748b", formatter: (v: unknown) => { const n = Number(v); return cfg.barUnit === "ไร่" ? n.toLocaleString() : n.toFixed(cfg.barUnit === "°C" ? 1 : 3); } }}>
                      {barData.map((_, i) => <Cell key={i} fill={lerpColor(cfg.barColor, cfg.barColorHigh, i / Math.max(barData.length - 1, 1))} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Right: trends + insights */}
          <div className="flex flex-col divide-y divide-slate-800/60 overflow-y-auto custom-scrollbar">

            <div className="px-5 py-4">
              <h3 className="text-[13px] font-semibold text-slate-400 mb-3">{cfg.trendTitle}</h3>
              {displayTrend.length === 0 ? (
                <div className="flex h-28 items-center justify-center text-slate-700 text-xs">ไม่มีข้อมูลรายปี</div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={displayTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <defs><linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.35} /><stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [Number(v).toFixed(4), trendUnit || "ค่าเฉลี่ย"]} />
                    {compareMode && <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />}
                    <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#tgrad)" strokeWidth={2} dot={{ r: 3, fill: cfg.accentHex, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {secondaryTrendData.length > 0 && (
              <div className="px-5 py-4">
                <h3 className="text-[13px] font-semibold text-slate-400 mb-3">
                  {metric === "vegetation" ? "พื้นที่สีเขียวรวม (ไร่)" : "พื้นที่สิ่งปลูกสร้าง (ไร่)"}
                </h3>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={secondaryTrendData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <defs><linearGradient id="s2grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.25} /><stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false}
                      domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${Number(v).toLocaleString()} ไร่`, ""]} />
                    <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#s2grad)" strokeWidth={2} dot={{ r: 3, fill: cfg.accentHex, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
                {metric === "vegetation" && (
                  <p className="mt-1.5 text-[9px] text-slate-600 leading-snug">
                    รวมทั้ง 50 เขต · แหล่งข้อมูล: แบบจำลอง ENSO+Urbanization (รอ GEE จริง)
                  </p>
                )}
              </div>
            )}

            {monthlyData.length > 0 && monthlyData.some((d: any) => d.value) && (
              <div className="px-5 py-4">
                <h3 className="text-[13px] font-semibold text-slate-400 mb-3">LST เฉลี่ยรายเดือน ปี {year}</h3>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <defs><linearGradient id="mgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.3} /><stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${Number(v).toFixed(2)}°C`, "LST"]} />
                    <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#mgrad)" strokeWidth={2} dot={false} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {insights.length > 0 && (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-3.5 h-3.5" style={{ color: cfg.accentHex }} />
                  <h3 className="text-[13px] font-semibold text-slate-400">ข้อสังเกตจากข้อมูล</h3>
                </div>
                <ul className="space-y-2">
                  {insights.map((ins, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
                      <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-700 bg-slate-800">{i + 1}</span>
                      {ins}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Bottom: Top5 / Bot5 / Quartile (all-districts mode only) ────────────── */}
      {!isDistrictMode && (
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-0 divide-x divide-slate-800/60 border-t border-slate-800/60">

          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-red-400" />
              <h4 className="text-[12px] font-semibold text-slate-500">สูงที่สุด 5 เขต</h4>
            </div>
            <ol className="space-y-1.5">
              {top5.map(([name, val]: any, i: number) => (
                <li key={name + i} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-slate-700 w-4 shrink-0">{i + 1}</span>
                  <span className="flex-1 text-[12px] text-slate-300 truncate">{name}</span>
                  <span className="font-mono text-[11px] font-bold" style={{ color: cfg.accentHex }}>{val != null ? cfg.formatShort(Number(val)) : "–"}</span>
                  <span className="text-[9px] text-slate-700">{cfg.barUnit}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
              <h4 className="text-[12px] font-semibold text-slate-500">ต่ำที่สุด 5 เขต</h4>
            </div>
            <ol className="space-y-1.5">
              {bot5.map(([name, val]: any, i: number) => (
                <li key={name + i} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-slate-700 w-4 shrink-0">{i + 1}</span>
                  <span className="flex-1 text-[12px] text-slate-300 truncate">{name}</span>
                  <span className="font-mono text-[11px] font-bold text-emerald-400">{val != null ? cfg.formatShort(Number(val)) : "–"}</span>
                  <span className="text-[9px] text-slate-700">{cfg.barUnit}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              <h4 className="text-[12px] font-semibold text-slate-500">สถิติสรุป</h4>
            </div>
            <div className="space-y-2">
              {[
                ["ค่าเฉลี่ย", avgTxt],
                ["ค่าสูงสุด", maxTxt],
                ["ค่าต่ำสุด", minTxt],
                ["จำนวนเขต", String(values.length)],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-mono font-bold text-slate-300">{val} <span className="text-[10px] text-slate-700">{cfg.barUnit}</span></span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/60 text-[9px] text-slate-700">
              ที่มา: {summary.dataSource ?? "Supabase district_statistics"} · ปี {year}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
