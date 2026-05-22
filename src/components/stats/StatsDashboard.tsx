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
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Lightbulb, Activity } from "lucide-react";

type Metric = "lst" | "vegetation" | "builtup" | "air_pollution";

interface StatsDashboardProps {
  summary: any;
  metric: Metric;
  year: number;
  compareMode?: boolean;
  accentColor?: string;
}

function getConfig(metric: Metric) {
  return {
    lst: {
      barTitle: "LST เฉลี่ยรายเขต (°C)",
      barUnit: "°C",
      trendTitle: "แนวโน้ม LST เฉลี่ยรายปี",
      trendUnit: "°C",
      barColor: "#f97316",
      barColorHigh: "#ef4444",
      accentHex: "#f97316",
      thresholdLabel: "เขตร้อน (≥36°C)",
      threshold: 36,
      thresholdColor: "#ef4444",
      formatVal: (v: number) => `${v.toFixed(2)}°C`,
      formatShort: (v: number) => v.toFixed(2),
    },
    vegetation: {
      barTitle: "NDVI เฉลี่ยรายเขต",
      barUnit: "",
      trendTitle: "แนวโน้ม NDVI เฉลี่ยรายปี",
      trendUnit: "",
      barColor: "#10b981",
      barColorHigh: "#34d399",
      accentHex: "#10b981",
      thresholdLabel: "NDVI ต่ำ (<0.15)",
      threshold: 0.15,
      thresholdColor: "#f59e0b",
      formatVal: (v: number) => v.toFixed(4),
      formatShort: (v: number) => v.toFixed(4),
    },
    builtup: {
      barTitle: "พื้นที่สิ่งปลูกสร้าง (ไร่)",
      barUnit: "ไร่",
      trendTitle: "แนวโน้ม NDBI เฉลี่ยรายปี",
      trendUnit: "",
      barColor: "#6366f1",
      barColorHigh: "#818cf8",
      accentHex: "#6366f1",
      thresholdLabel: "ขยายตัวสูง (Q3+)",
      threshold: null,
      thresholdColor: "#818cf8",
      formatVal: (v: number) => v.toLocaleString(),
      formatShort: (v: number) => v.toLocaleString(),
    },
    air_pollution: {
      barTitle: "คะแนนมลพิษอากาศรายเขต (0–10)",
      barUnit: "",
      trendTitle: "แนวโน้ม NO₂ เฉลี่ยรายปี (mol/m²)",
      trendUnit: "mol/m²",
      barColor: "#06b6d4",
      barColorHigh: "#22d3ee",
      accentHex: "#06b6d4",
      thresholdLabel: "มลพิษสูง (Score≥6)",
      threshold: 6,
      thresholdColor: "#f87171",
      formatVal: (v: number) => v.toFixed(3),
      formatShort: (v: number) => v.toFixed(3),
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
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  return { mean, median, min: sorted[0], max: sorted[n - 1], stdDev, q1, q3 };
}

function buildDistribution(values: number[], bins = 10): { label: string; count: number; pct: number }[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: min.toFixed(2), count: values.length, pct: 100 }];
  const step = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    label: `${(min + step * i).toFixed(2)}`,
    count: 0,
    pct: 0,
  }));
  values.forEach((v) => {
    const idx = Math.min(Math.floor((v - min) / step), bins - 1);
    buckets[idx].count++;
  });
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

  if (!compareMode && stats.mean != null) {
    const topDistrict = ranking[0];
    const topName = topDistrict?.[0];
    const topVal = topDistrict?.[1];
    if (topName && topVal != null && stats.mean != null) {
      const diff = Number(topVal) - stats.mean;
      insights.push(`${topName} มีค่าสูงกว่าค่าเฉลี่ย ${diff > 0 ? "+" : ""}${cfg.formatShort(Math.abs(diff))} ${cfg.barUnit}`);
    }
  }

  if (cfg.threshold != null && !compareMode) {
    const aboveCount = values.filter((v) => v >= cfg.threshold!).length;
    const pct = Math.round((aboveCount / n) * 100);
    if (aboveCount > 0) insights.push(`${aboveCount} เขต (${pct}%) มีค่าเกินเกณฑ์ ${cfg.thresholdLabel}`);
  }

  if (stats.stdDev != null && stats.mean != null) {
    const cv = (stats.stdDev / Math.abs(stats.mean)) * 100;
    const dispersion = cv < 5 ? "ใกล้เคียงกันมาก" : cv < 15 ? "กระจายระดับปานกลาง" : "กระจายสูง (heterogeneous)";
    insights.push(`การกระจายข้อมูล: ${dispersion} (CV = ${cv.toFixed(1)}%)`);
  }

  // trend insight
  const trendRows: [string, number][] = summary.yearlyTrend ?? [];
  if (trendRows.length >= 3) {
    const first = Number(trendRows[0][1]);
    const last = Number(trendRows[trendRows.length - 1][1]);
    const delta = last - first;
    const years = Number(trendRows[trendRows.length - 1][0]) - Number(trendRows[0][0]);
    const dir = delta > 0 ? "เพิ่มขึ้น" : "ลดลง";
    const unit = cfg.barUnit || cfg.trendUnit;
    insights.push(`แนวโน้ม ${years} ปี: ${dir} ${Math.abs(delta).toFixed(3)} ${unit} (${trendRows[0][0]}–${trendRows[trendRows.length - 1][0]})`);
  }

  if (stats.q1 != null && stats.q3 != null) {
    const unit = cfg.barUnit;
    insights.push(`IQR (Q1–Q3): ${cfg.formatShort(stats.q1)} – ${cfg.formatShort(stats.q3)} ${unit}`);
  }

  return insights.slice(0, 5);
}

function lerpColor(hex1: string, hex2: string, t: number): string {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function StatsDashboard({ summary, metric, year, compareMode = false }: StatsDashboardProps) {
  if (!summary) {
    return <div className="flex h-full items-center justify-center text-slate-500 text-sm">ไม่มีข้อมูลสำหรับแสดง</div>;
  }

  const cfg = getConfig(metric);
  const rawRanking: any[] = summary.ranking ?? [];

  // ── values for stats ──
  const values: number[] = rawRanking
    .map((r: any) => r[1])
    .filter((v: any) => v != null && Number.isFinite(Number(v)))
    .map(Number);

  const stats = computeStats(values);
  const distribution = buildDistribution(values, 8);
  const insights = generateInsights(values, rawRanking, metric, cfg, summary, compareMode);

  // ── bar chart: ALL districts ──
  const barData = [...rawRanking]
    .filter(([, v]: any) => v != null)
    .map(([name, value]: any) => ({ name, value: Number(value) }))
    .reverse();

  // ── trend data ──
  const trendRows: [string, number][] = summary.yearlyTrend ?? [];
  const trendData = trendRows.filter(([, v]) => v != null).map(([yr, v]) => ({ year: yr, value: Number(v) }));
  const deltaRows: [string, number][] = compareMode ? (summary.yearlyDeltaTrend ?? []) : [];
  const deltaData = deltaRows.map(([yr, v]) => ({ year: yr, value: Number(v) }));
  const displayTrend = compareMode && deltaData.length ? deltaData : trendData;
  const trendUnit = compareMode ? `Δ ${cfg.trendUnit}` : cfg.trendUnit;

  const secondaryTrendRows: [string, number][] =
    metric === "vegetation" ? (summary.greenAreaTrend ?? []) :
    metric === "builtup" ? (summary.builtupAreaTrend ?? []) : [];
  const secondaryTrendData = secondaryTrendRows.filter(([, v]) => v != null).map(([yr, v]) => ({ year: yr, value: Number(v) }));

  const monthlyData = (metric === "lst" && !compareMode && Array.isArray(summary.monthlyTrend))
    ? summary.monthlyTrend.map((v: number | null, i: number) => ({ month: TH_MONTHS[i], value: v || null }))
    : [];

  // ── top/bottom 5 ──
  const top5 = rawRanking.slice(0, 5);
  const bot5 = [...rawRanking].reverse().slice(0, 5);

  // stat strip items
  const avgTxt = stats.mean != null ? cfg.formatShort(stats.mean) : "–";
  const medTxt = stats.median != null ? cfg.formatShort(stats.median) : "–";
  const maxTxt = stats.max != null ? cfg.formatShort(stats.max) : "–";
  const minTxt = stats.min != null ? cfg.formatShort(stats.min) : "–";
  const stdTxt = stats.stdDev != null ? cfg.formatShort(stats.stdDev) : "–";
  const aboveCount = cfg.threshold != null ? values.filter((v) => v >= cfg.threshold!).length : null;

  const statStrip = [
    { label: "ค่าเฉลี่ย", value: avgTxt, unit: cfg.barUnit, color: "text-slate-200" },
    { label: "ค่ากลาง (Median)", value: medTxt, unit: cfg.barUnit, color: "text-slate-200" },
    { label: "สูงสุด", value: maxTxt, unit: cfg.barUnit, color: "text-red-400" },
    { label: "ต่ำสุด", value: minTxt, unit: cfg.barUnit, color: "text-emerald-400" },
    { label: "ส่วนเบี่ยงเบน (σ)", value: stdTxt, unit: cfg.barUnit, color: "text-amber-400" },
    ...(aboveCount != null
      ? [{ label: cfg.thresholdLabel, value: String(aboveCount), unit: "เขต", color: "text-rose-400" }]
      : [{ label: "เขตทั้งหมด", value: String(values.length), unit: "เขต", color: "text-slate-400" }]),
  ];

  const barBarHeight = Math.max(320, barData.length * 18);

  return (
    <div className="flex h-full flex-col overflow-y-auto custom-scrollbar bg-slate-950">

      {/* ── Stats summary strip ── */}
      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-6 gap-0 border-b border-slate-800/60">
        {statStrip.map((s, i) => (
          <div key={i} className={`px-4 py-3 border-r border-slate-800/60 last:border-r-0 ${i % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/20"}`}>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">{s.label}</div>
            <div className={`text-lg font-black tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-[9px] text-slate-700">{s.unit}</div>
          </div>
        ))}
      </div>

      {/* ── Main charts row ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-0 border-b border-slate-800/60">

        {/* Bar chart — ALL districts */}
        <div className="border-r border-slate-800/60 flex flex-col min-h-0">
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-800/40">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-300">{cfg.barTitle}</h3>
              <p className="text-[10px] text-slate-600 mt-0.5">50 เขตกรุงเทพฯ เรียงจากมากไปน้อย</p>
            </div>
            {cfg.threshold != null && (
              <div className="text-[9px] font-bold px-2 py-0.5 rounded-full border" style={{ borderColor: cfg.thresholdColor + "60", color: cfg.thresholdColor, backgroundColor: cfg.thresholdColor + "15" }}>
                เกณฑ์ {cfg.threshold} {cfg.barUnit}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2" style={{ minHeight: 300 }}>
            <div style={{ height: barBarHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9.5, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
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
                          <p className="text-slate-500">อันดับ {rank} / {barData.length}</p>
                          {pct != null && <p className="text-slate-500">{pct > 0 ? "+" : ""}{pct.toFixed(1)}% จากค่าเฉลี่ย</p>}
                        </div>
                      );
                    }}
                    cursor={{ fill: "rgba(148,163,184,0.05)" }}
                  />
                  {cfg.threshold != null && (
                    <ReferenceLine x={cfg.threshold} stroke={cfg.thresholdColor} strokeDasharray="3 3" strokeWidth={1.5} />
                  )}
                  <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={13} label={{ position: "right", fontSize: 8, fill: "#64748b", formatter: (v: unknown) => { const n = Number(v); return cfg.barUnit === "ไร่" ? n.toLocaleString() : n.toFixed(cfg.barUnit === "°C" ? 1 : 3); } }}>
                    {barData.map((_, i) => (
                      <Cell key={i} fill={lerpColor(cfg.barColor, cfg.barColorHigh, i / Math.max(barData.length - 1, 1))} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right column: trends + insights */}
        <div className="flex flex-col divide-y divide-slate-800/60 overflow-y-auto custom-scrollbar">

          {/* Yearly trend */}
          <div className="px-5 py-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{cfg.trendTitle}</h3>
            {displayTrend.length === 0 ? (
              <div className="flex h-28 items-center justify-center text-slate-700 text-xs">ไม่มีข้อมูลรายปี</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={displayTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} />
                    </linearGradient>
                  </defs>
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

          {/* Secondary trend (vegetation/builtup area rai) */}
          {secondaryTrendData.length > 0 && (
            <div className="px-5 py-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                {metric === "vegetation" ? "พื้นที่สีเขียวรวม (ไร่)" : "พื้นที่สิ่งปลูกสร้าง (ไร่)"}
              </h3>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={secondaryTrendData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="s2grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [`${Number(v).toLocaleString()} ไร่`, ""]} />
                  <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#s2grad)" strokeWidth={2} dot={{ r: 3, fill: cfg.accentHex, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly trend (LST only) */}
          {monthlyData.length > 0 && monthlyData.some((d: any) => d.value) && (
            <div className="px-5 py-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                LST เฉลี่ยรายเดือน ปี {year}
              </h3>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mgrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [`${Number(v).toFixed(2)}°C`, "LST"]} />
                  <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#mgrad)" strokeWidth={2} dot={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Distribution histogram */}
          {distribution.length > 0 && (
            <div className="px-5 py-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                การกระจายค่า (Distribution)
              </h3>
              <p className="text-[9px] text-slate-600 mb-3">จำนวนเขตในแต่ละช่วงค่า</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={distribution} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 8, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [`${v} เขต`, ""]} />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]} fill={cfg.accentHex} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Auto-insights */}
          {insights.length > 0 && (
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-3.5 h-3.5" style={{ color: cfg.accentHex }} />
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">ข้อสังเกตจากข้อมูล</h3>
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

      {/* ── Bottom: Top 5 vs Bottom 5 + quartile box ── */}
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-0 divide-x divide-slate-800/60 border-t border-slate-800/60">

        {/* Top 5 */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-red-400" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">สูงที่สุด 5 เขต</h4>
          </div>
          <ol className="space-y-1.5">
            {top5.map(([name, val]: any, i: number) => (
              <li key={name + i} className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-700 w-4 shrink-0">{i + 1}</span>
                <span className="flex-1 text-[12px] text-slate-300 truncate">{name}</span>
                <span className="font-mono text-[11px] font-bold" style={{ color: cfg.accentHex }}>
                  {val != null ? cfg.formatShort(Number(val)) : "–"}
                </span>
                <span className="text-[9px] text-slate-700">{cfg.barUnit}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Bottom 5 */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">ต่ำที่สุด 5 เขต</h4>
          </div>
          <ol className="space-y-1.5">
            {bot5.map(([name, val]: any, i: number) => (
              <li key={name + i} className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-700 w-4 shrink-0">{i + 1}</span>
                <span className="flex-1 text-[12px] text-slate-300 truncate">{name}</span>
                <span className="font-mono text-[11px] font-bold text-emerald-400">
                  {val != null ? cfg.formatShort(Number(val)) : "–"}
                </span>
                <span className="text-[9px] text-slate-700">{cfg.barUnit}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Statistical summary box */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">สถิติสรุป</h4>
          </div>
          <div className="space-y-2">
            {[
              ["Q1 (25%)", stats.q1 != null ? cfg.formatShort(stats.q1) : "–"],
              ["Q2 Median", stats.median != null ? cfg.formatShort(stats.median) : "–"],
              ["Q3 (75%)", stats.q3 != null ? cfg.formatShort(stats.q3) : "–"],
              ["IQR (Q3-Q1)", (stats.q1 != null && stats.q3 != null) ? cfg.formatShort(stats.q3 - stats.q1) : "–"],
              ["Std Dev (σ)", stats.stdDev != null ? cfg.formatShort(stats.stdDev) : "–"],
              ["N เขต", String(values.length)],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">{label}</span>
                <span className="font-mono font-bold text-slate-300">{val} <span className="text-[9px] text-slate-700">{cfg.barUnit}</span></span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/60 text-[9px] text-slate-700">
            ที่มา: {summary.dataSource ?? "Supabase district_statistics"} · ปี {year}
          </div>
        </div>

      </div>
    </div>
  );
}
