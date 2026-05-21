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
  LineChart,
  Line,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Metric = "lst" | "vegetation" | "builtup" | "air_pollution";

interface StatsDashboardProps {
  summary: any;
  metric: Metric;
  year: number;
  compareMode?: boolean;
  accentColor?: string;
}

// ─── per-metric config ────────────────────────────────────────────────────────
function getConfig(metric: Metric) {
  return {
    lst: {
      barTitle: "อันดับ LST เฉลี่ยรายเขต",
      barUnit: "°C",
      trendTitle: "แนวโน้ม LST เฉลี่ยรายปี",
      trendUnit: "°C",
      barColor: "#f97316",
      barColorHigh: "#ef4444",
      accentHex: "#f97316",
    },
    vegetation: {
      barTitle: "อันดับ NDVI เฉลี่ยรายเขต",
      barUnit: "",
      trendTitle: "แนวโน้ม NDVI เฉลี่ยรายปี",
      trendUnit: "",
      barColor: "#10b981",
      barColorHigh: "#34d399",
      accentHex: "#10b981",
    },
    builtup: {
      barTitle: "อันดับพื้นที่สิ่งปลูกสร้างรายเขต (ไร่)",
      barUnit: "ไร่",
      trendTitle: "แนวโน้ม NDBI เฉลี่ยรายปี",
      trendUnit: "",
      barColor: "#6366f1",
      barColorHigh: "#818cf8",
      accentHex: "#6366f1",
    },
    air_pollution: {
      barTitle: "อันดับคะแนนมลพิษอากาศรายเขต",
      barUnit: "",
      trendTitle: "แนวโน้ม NO₂ เฉลี่ยรายปี",
      trendUnit: "mol/m²",
      barColor: "#06b6d4",
      barColorHigh: "#22d3ee",
      accentHex: "#06b6d4",
    },
  }[metric];
}

// ─── derived KPIs per metric ──────────────────────────────────────────────────
function deriveKPIs(summary: any, metric: Metric, compareMode: boolean) {
  if (!summary) return [];
  const rankingRows: any[] = summary.ranking ?? [];
  const avg = summary.averageTemp;
  const max = summary.maxTemp;

  if (compareMode) {
    const delta = summary.avgDelta;
    return [
      {
        label: "ส่วนต่างค่าเฉลี่ย",
        value: delta != null ? `${delta > 0 ? "+" : ""}${Number(delta).toFixed(3)}` : "–",
        sub: `${summary.selectedYear} vs ${summary.compareYear}`,
        trend: delta > 0 ? "up" : delta < 0 ? "down" : "neutral",
      },
      {
        label: "เพิ่มขึ้นสูงสุด",
        value: summary.maxIncreaseDelta != null ? `+${Number(summary.maxIncreaseDelta).toFixed(3)}` : "–",
        sub: "สูงสุดที่เพิ่มขึ้น",
        trend: "up",
      },
      {
        label: "เขตที่เปลี่ยนมากสุด",
        value: rankingRows[0]?.[0] ?? "–",
        sub: rankingRows[0]?.[1] != null ? String(Number(rankingRows[0][1]).toFixed(3)) : "",
        trend: "neutral",
      },
      {
        label: "เขตที่เปลี่ยนน้อยสุด",
        value: rankingRows[rankingRows.length - 1]?.[0] ?? "–",
        sub: "",
        trend: "neutral",
      },
    ];
  }

  if (metric === "lst") {
    const unit = "°C";
    return [
      { label: "LST เฉลี่ย", value: avg != null ? `${Number(avg).toFixed(2)}${unit}` : "–", sub: "ค่าเฉลี่ยทั้ง กทม.", trend: "neutral" },
      { label: "LST สูงสุด", value: max != null ? `${Number(max).toFixed(2)}${unit}` : "–", sub: "พีคสูงสุดปีนี้", trend: "up" },
      { label: "เขตร้อนที่สุด", value: rankingRows[0]?.[0] ?? "–", sub: rankingRows[0]?.[1] != null ? `${Number(rankingRows[0][1]).toFixed(2)}°C` : "", trend: "up" },
      { label: "เขตเย็นที่สุด", value: rankingRows[rankingRows.length - 1]?.[0] ?? "–", sub: rankingRows[rankingRows.length - 1]?.[1] != null ? `${Number(rankingRows[rankingRows.length - 1][1]).toFixed(2)}°C` : "", trend: "down" },
    ];
  }

  if (metric === "vegetation") {
    const greenTrend: [string, number][] = summary.greenAreaTrend ?? [];
    const latestGreen = greenTrend[greenTrend.length - 1]?.[1];
    return [
      { label: "NDVI เฉลี่ย", value: avg != null ? Number(avg).toFixed(4) : "–", sub: "ค่าเฉลี่ยทั้ง กทม.", trend: "neutral" },
      { label: "พื้นที่สีเขียวรวม", value: latestGreen != null ? `${Number(latestGreen).toLocaleString()} ไร่` : "–", sub: `ปี ${summary.selectedYear}`, trend: "neutral" },
      { label: "เขตสีเขียวมากสุด", value: rankingRows[0]?.[0] ?? "–", sub: rankingRows[0]?.[1] != null ? `NDVI ${Number(rankingRows[0][1]).toFixed(4)}` : "", trend: "up" },
      { label: "เขตสีเขียวน้อยสุด", value: rankingRows[rankingRows.length - 1]?.[0] ?? "–", sub: rankingRows[rankingRows.length - 1]?.[1] != null ? `NDVI ${Number(rankingRows[rankingRows.length - 1][1]).toFixed(4)}` : "", trend: "down" },
    ];
  }

  if (metric === "builtup") {
    const builtupTrend: [string, number][] = summary.builtupAreaTrend ?? [];
    const latestBuiltup = builtupTrend[builtupTrend.length - 1]?.[1];
    const densityTop = (summary.densityRanking ?? [])[0];
    return [
      { label: "NDBI เฉลี่ย", value: avg != null ? Number(avg).toFixed(4) : "–", sub: "ค่าเฉลี่ยทั้ง กทม.", trend: "neutral" },
      { label: "พื้นที่สิ่งปลูกสร้างรวม", value: latestBuiltup != null ? `${Number(latestBuiltup).toLocaleString()} ไร่` : "–", sub: `ปี ${summary.selectedYear}`, trend: "neutral" },
      { label: "เขตขยายตัวมากสุด", value: rankingRows[0]?.[0] ?? "–", sub: rankingRows[0]?.[1] != null ? `${Number(rankingRows[0][1]).toLocaleString()} ไร่` : "", trend: "up" },
      { label: "ความหนาแน่นสูงสุด", value: densityTop?.[0] ?? "–", sub: densityTop?.[1] != null ? `${densityTop[1]}%` : "", trend: "up" },
    ];
  }

  // air_pollution
  const densityTop = (summary.densityRanking ?? [])[0];
  return [
    { label: "NO₂ เฉลี่ย", value: avg != null ? `${(Number(avg) * 1e6).toFixed(2)} µmol` : "–", sub: "mol/m² × 10⁻⁶", trend: "neutral" },
    { label: "มลพิษสูงสุด", value: rankingRows[0]?.[0] ?? "–", sub: rankingRows[0]?.[2] != null ? `Score ${rankingRows[0][2]}` : "", trend: "up" },
    { label: "Pollution Score สูงสุด", value: densityTop?.[0] ?? "–", sub: densityTop?.[1] != null ? `${densityTop[1]} pts` : "", trend: "up" },
    { label: "มลพิษต่ำสุด", value: rankingRows[rankingRows.length - 1]?.[0] ?? "–", sub: "", trend: "down" },
  ];
}

// ─── custom tooltip ───────────────────────────────────────────────────────────
const CustomBarTooltip = ({ active, payload, label, unit }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-[11px] shadow-xl">
      <p className="font-bold text-slate-200">{label}</p>
      <p className="font-mono text-cyan-300">
        {Number(payload[0].value).toFixed(unit === "ไร่" ? 0 : 4)} {unit}
      </p>
    </div>
  );
};

const CustomLineTooltip = ({ active, payload, unit }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-[11px] shadow-xl">
      <p className="font-bold text-slate-200">ปี {payload[0].payload.year}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="font-mono" style={{ color: p.color }}>
          {p.name}: {Number(p.value).toFixed(4)} {unit}
        </p>
      ))}
    </div>
  );
};

// ─── monthly trend mini-chart (LST only) ─────────────────────────────────────
function MonthlyTrendChart({ monthlyTrend, compareMonthlyTrend, compareYear, accentHex }: any) {
  const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const data = (monthlyTrend as number[]).map((v, i) => ({
    month: TH_MONTHS[i],
    value: v || null,
    compare: compareMonthlyTrend?.[i] || null,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="mgradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={accentHex} stopOpacity={0.3} />
            <stop offset="95%" stopColor={accentHex} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} />
        <Area type="monotone" dataKey="value" name="ปีหลัก" stroke={accentHex} fill="url(#mgradient)" strokeWidth={2} dot={false} connectNulls />
        {compareMonthlyTrend && (
          <Line type="monotone" dataKey="compare" name={`ปี ${compareYear}`} stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function StatsDashboard({
  summary,
  metric,
  year,
  compareMode = false,
}: StatsDashboardProps) {
  if (!summary) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500 text-sm">
        ไม่มีข้อมูลสำหรับแสดง
      </div>
    );
  }

  const cfg = getConfig(metric);
  const kpis = deriveKPIs(summary, metric, compareMode);

  // ── bar chart data ──
  const rawRanking: [string, number | null][] = summary.ranking ?? [];
  const barData = rawRanking
    .filter(([, v]) => v != null)
    .slice(0, 25)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .reverse(); // recharts horizontal bar: lowest on top → reverse so highest is on top

  // ── trend chart data ──
  const trendRows: [string, number][] = summary.yearlyTrend ?? [];
  const trendData = trendRows
    .filter(([, v]) => v != null)
    .map(([yr, v]) => ({ year: yr, value: Number(v) }));

  // secondary trend (green area or builtup area rai)
  const secondaryTrendRows: [string, number][] =
    metric === "vegetation" ? (summary.greenAreaTrend ?? []) :
    metric === "builtup" ? (summary.builtupAreaTrend ?? []) : [];
  const secondaryTrendData = secondaryTrendRows
    .filter(([, v]) => v != null)
    .map(([yr, v]) => ({ year: yr, value: Number(v) }));

  // ── trend delta (compare mode) ──
  const deltaRows: [string, number][] = compareMode ? (summary.yearlyDeltaTrend ?? []) : [];
  const deltaData = deltaRows.map(([yr, v]) => ({ year: yr, value: Number(v) }));

  const displayTrend = compareMode && deltaData.length ? deltaData : trendData;
  const trendUnit = compareMode ? `Δ ${cfg.trendUnit}` : cfg.trendUnit;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 custom-scrollbar">

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {kpi.trend === "up" && <TrendingUp className="h-3 w-3 text-red-400" />}
              {kpi.trend === "down" && <TrendingDown className="h-3 w-3 text-emerald-400" />}
              {kpi.trend === "neutral" && <Minus className="h-3 w-3 text-slate-600" />}
              {kpi.label}
            </div>
            <div className="text-xl font-black text-slate-100 leading-tight">{kpi.value}</div>
            {kpi.sub && <div className="mt-0.5 text-[10px] text-slate-500">{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── charts row ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">

        {/* Bar chart */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {cfg.barTitle}
            </h3>
            <span className="text-[10px] text-slate-600">Top 25</span>
          </div>
          {barData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-slate-600 text-xs">ไม่มีข้อมูล</div>
          ) : (
            <div className="flex-1" style={{ minHeight: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 9, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomBarTooltip unit={cfg.barUnit} />} cursor={{ fill: "rgba(148,163,184,0.05)" }} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={12}>
                    {barData.map((entry, i) => {
                      const ratio = barData.length > 1 ? i / (barData.length - 1) : 0.5;
                      const r = parseInt(cfg.barColor.slice(1, 3), 16);
                      const g = parseInt(cfg.barColor.slice(3, 5), 16);
                      const b = parseInt(cfg.barColor.slice(5, 7), 16);
                      const r2 = parseInt(cfg.barColorHigh.slice(1, 3), 16);
                      const g2 = parseInt(cfg.barColorHigh.slice(3, 5), 16);
                      const b2 = parseInt(cfg.barColorHigh.slice(5, 7), 16);
                      const mr = Math.round(r + (r2 - r) * ratio);
                      const mg = Math.round(g + (g2 - g) * ratio);
                      const mb = Math.round(b + (b2 - b) * ratio);
                      return <Cell key={i} fill={`rgb(${mr},${mg},${mb})`} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right column: trend charts */}
        <div className="flex flex-col gap-4">

          {/* Yearly trend */}
          <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {cfg.trendTitle}
            </h3>
            {displayTrend.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-slate-600 text-xs">ไม่มีข้อมูลรายปี</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={displayTrend} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tgradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomLineTooltip unit={trendUnit} />} />
                  {compareMode && <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />}
                  <Area type="monotone" dataKey="value" name="ค่าเฉลี่ย" stroke={cfg.accentHex} fill="url(#tgradient)" strokeWidth={2} dot={{ r: 3, fill: cfg.accentHex, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Secondary trend (vegetation / builtup) */}
          {secondaryTrendData.length > 0 && (
            <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {metric === "vegetation" ? "พื้นที่สีเขียวรวม (ไร่) รายปี" : "พื้นที่สิ่งปลูกสร้างรวม (ไร่) รายปี"}
              </h3>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={secondaryTrendData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="s2gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={cfg.accentHex} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={cfg.accentHex} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${Number(v).toLocaleString()} ไร่`, ""]} />
                  <Area type="monotone" dataKey="value" stroke={cfg.accentHex} fill="url(#s2gradient)" strokeWidth={2} dot={{ r: 3, fill: cfg.accentHex, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly trend (LST only) */}
          {metric === "lst" && !compareMode && Array.isArray(summary.monthlyTrend) && summary.monthlyTrend.some(Boolean) && (
            <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                LST เฉลี่ยรายเดือน ปี {year}
              </h3>
              <MonthlyTrendChart
                monthlyTrend={summary.monthlyTrend}
                compareMonthlyTrend={null}
                compareYear={null}
                accentHex={cfg.accentHex}
              />
            </div>
          )}

        </div>
      </div>

      {/* data source note */}
      <p className="shrink-0 text-center text-[10px] text-slate-600">
        ที่มา: {summary.dataSource ?? "Supabase district_statistics"} · ปี {year}
      </p>
    </div>
  );
}
