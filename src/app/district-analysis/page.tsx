/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Home, Download, Printer, TrendingUp, TrendingDown, Minus,
  ChevronDown, Flame, Trees, Building2, Wind, Droplets, Moon, Search,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface YearMetrics {
  mean_lst: number | null;
  max_lst: number | null;
  ndvi_mean: number | null;
  green_area_rai: number | null;
  green_area_ratio: number | null;
  ndbi_mean: number | null;
  builtup_area_rai: number | null;
  no2_mean: number | null;
  co_mean: number | null;
  so2_mean: number | null;
  pollution_score: number | null;
  water_ratio: number | null;
  water_area_rai: number | null;
  ndwi_mean: number | null;
  ntl_mean: number | null;
  ntl_max: number | null;
}

interface ProfileData {
  district: string;
  areaRai: number;
  years: number[];
  metrics: Record<number, YearMetrics>;
  bkkAverages: Record<number, YearMetrics>;
}

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

function DeltaBadge({ delta, invert = false, unit = "" }: { delta: number | null; invert?: boolean; unit?: string }) {
  if (delta == null || !Number.isFinite(delta)) return <span className="text-slate-600 text-[10px]">–</span>;
  const isPositive = delta > 0;
  const isBad = invert ? isPositive : isPositive;
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

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────
function MetricCard({
  icon: Icon, label, value, sub, delta, deltaInvert = false, deltaUnit = "",
  color, iconBg,
}: {
  icon: any; label: string; value: string; sub?: string; delta: number | null;
  deltaInvert?: boolean; deltaUnit?: string; color: string; iconBg: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
      </div>
      <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
      <DeltaBadge delta={delta} invert={deltaInvert} unit={deltaUnit} />
    </div>
  );
}

function TrendChart({
  data, districtKey, bkkKey, label, color, unit, decimals = 2, connectNulls = true,
}: {
  data: any[]; districtKey: string; bkkKey: string;
  label: string; color: string; unit: string; decimals?: number; connectNulls?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#64748b" }} />
          <YAxis
            tick={{ fontSize: 9, fill: "#64748b" }}
            tickFormatter={(v) => typeof v === "number" ? v.toFixed(decimals) : v}
            width={45}
          />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
            formatter={(v: unknown, name: unknown) => [
              typeof v === "number" ? `${v.toFixed(decimals)} ${unit}` : "–",
              name === "district" ? "เขตนี้" : "เฉลี่ย กทม.",
            ] as [string, string]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => v === "district" ? "เขตนี้" : "เฉลี่ย กทม."} />
          <Line type="monotone" dataKey="district" stroke={color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={connectNulls} name="district" />
          <Line type="monotone" dataKey="bkk" stroke="#475569" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls={connectNulls} name="bkk" />
        </LineChart>
      </ResponsiveContainer>
    </div>
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

  // Load district list on mount
  useEffect(() => {
    fetch("/api/district-profile")
      .then((r) => r.json())
      .then((d) => setDistricts(d.districts ?? []));
  }, []);

  // Load profile when district selected
  useEffect(() => {
    if (!selectedDistrict) { setData(null); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/district-profile?district=${encodeURIComponent(selectedDistrict)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDistrict]);

  const filteredDistricts = useMemo(
    () => districts.filter((d) => d.includes(districtSearch.trim())),
    [districts, districtSearch]
  );

  const cur = data?.metrics[selectedYear];
  const base = data?.metrics[compareYear];

  function delta(key: keyof YearMetrics): number | null {
    const c = cur?.[key] as number | null;
    const b = base?.[key] as number | null;
    if (c == null || b == null) return null;
    return c - b;
  }

  // Trend chart data
  const trendData = useMemo(() => {
    if (!data) return [];
    return data.years.map((yr) => ({
      year: yr,
      district_lst: data.metrics[yr]?.mean_lst ?? null,
      bkk_lst: data.bkkAverages[yr]?.mean_lst ?? null,
      district_ndvi: data.metrics[yr]?.ndvi_mean ?? null,
      bkk_ndvi: data.bkkAverages[yr]?.ndvi_mean ?? null,
      district_green: data.metrics[yr]?.green_area_rai ?? null,
      bkk_green: data.bkkAverages[yr]?.green_area_rai ?? null,
      district_builtup: data.metrics[yr]?.builtup_area_rai ?? null,
      bkk_builtup: data.bkkAverages[yr]?.builtup_area_rai ?? null,
      district_air: data.metrics[yr]?.pollution_score ?? null,
      bkk_air: data.bkkAverages[yr]?.pollution_score ?? null,
      district_ntl: data.metrics[yr]?.ntl_mean ?? null,
      bkk_ntl: data.bkkAverages[yr]?.ntl_mean ?? null,
    }));
  }, [data]);

  // BKK comparison bar data (for selected year)
  const comparisonData = useMemo(() => {
    if (!cur || !data?.bkkAverages[selectedYear]) return [];
    const bkk = data.bkkAverages[selectedYear];
    const candidates = [
      { label: "LST (°C)", district: cur.mean_lst, bkk: bkk.mean_lst, color: "#f97316" },
      { label: "NDVI ×100", district: cur.ndvi_mean != null ? cur.ndvi_mean * 100 : null, bkk: bkk.ndvi_mean != null ? bkk.ndvi_mean * 100 : null, color: "#10b981" },
      { label: "พื้นที่เขียว (%)", district: cur.green_area_ratio != null ? cur.green_area_ratio * 100 : null, bkk: bkk.green_area_ratio != null ? bkk.green_area_ratio * 100 : null, color: "#34d399" },
      { label: "NDBI ×100", district: cur.ndbi_mean != null ? cur.ndbi_mean * 100 : null, bkk: bkk.ndbi_mean != null ? bkk.ndbi_mean * 100 : null, color: "#f59e0b" },
      { label: "คุณภาพอากาศ", district: cur.pollution_score, bkk: bkk.pollution_score, color: "#a78bfa" },
      { label: "NTL Mean", district: cur.ntl_mean, bkk: bkk.ntl_mean, color: "#fbbf24" },
    ];
    return candidates.filter((m): m is typeof m & { district: number; bkk: number } => m.district != null && m.bkk != null);
  }, [cur, data, selectedYear]);

  const exportCSV = useCallback(() => {
    if (!data) return;
    const headers = [
      "เขต", "พื้นที่รวม(ไร่)", "ปี",
      "LST เฉลี่ย(°C)", "LST สูงสุด(°C)",
      "NDVI", "พื้นที่สีเขียว(ไร่)", "สัดส่วนสีเขียว(%)",
      "NDBI", "สิ่งปลูกสร้าง(ไร่)",
      "NO₂(mol/m²)", "CO(mol/m²)", "SO₂(mol/m²)", "คะแนนมลพิษ",
      "สัดส่วนน้ำ(%)", "พื้นที่น้ำ(ไร่)", "NDWI",
      "NTL Mean(nW/sr/cm²)", "NTL Max(nW/sr/cm²)",
    ].join(",");
    const rows = data.years.map((yr) => {
      const m = data.metrics[yr] ?? {};
      return [
        `"${data.district}"`, data.areaRai, yr,
        m.mean_lst?.toFixed(2) ?? "", m.max_lst?.toFixed(2) ?? "",
        m.ndvi_mean?.toFixed(4) ?? "", m.green_area_rai?.toFixed(0) ?? "", m.green_area_ratio != null ? (m.green_area_ratio * 100).toFixed(2) : "",
        m.ndbi_mean?.toFixed(4) ?? "", m.builtup_area_rai?.toFixed(0) ?? "",
        m.no2_mean?.toFixed(6) ?? "", m.co_mean?.toFixed(4) ?? "", m.so2_mean?.toFixed(6) ?? "", m.pollution_score?.toFixed(2) ?? "",
        m.water_ratio != null ? (m.water_ratio * 100).toFixed(2) : "", m.water_area_rai?.toFixed(0) ?? "", m.ndwi_mean?.toFixed(4) ?? "",
        m.ntl_mean?.toFixed(3) ?? "", m.ntl_max?.toFixed(3) ?? "",
      ].join(",");
    }).join("\n");
    const blob = new Blob(["﻿" + headers + "\n" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `district_profile_${data.district}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-50 overflow-hidden">

      {/* ── Top controls bar ── */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur z-20">

        {/* Back link */}
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
            <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          </button>
          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-slate-800">
                <input
                  autoFocus
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                  placeholder="ค้นหาเขต…"
                  className="w-full rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
              </div>
              <div className="max-h-52 overflow-y-auto custom-scrollbar">
                {filteredDistricts.map((d) => (
                  <button
                    key={d}
                    onClick={() => { setSelectedDistrict(d); setDistrictSearch(""); setShowDropdown(false); }}
                    className={`w-full px-3 py-2 text-left text-[12px] hover:bg-slate-800 transition-colors ${selectedDistrict === d ? "text-cyan-400 font-bold bg-cyan-950/40" : "text-slate-300"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Year pickers */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500 font-bold">ปีที่วิเคราะห์</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-slate-200 text-[12px] focus:outline-none"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-slate-600">vs</span>
          <select
            value={compareYear}
            onChange={(e) => setCompareYear(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1.5 text-slate-500 text-[12px] focus:outline-none"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Export buttons */}
        {data && (
          <>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" /> พิมพ์
            </button>
          </>
        )}
      </div>

      {/* ── Main scrollable content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar" onClick={() => showDropdown && setShowDropdown(false)}>

        {/* Empty state */}
        {!selectedDistrict && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Search className="h-8 w-8 text-cyan-400/60" />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-300 mb-1">เลือกเขตเพื่อวิเคราะห์</div>
              <div className="text-[12px] text-slate-500">
                ดูข้อมูลครบทุกมิติ — อุณหภูมิ พื้นที่สีเขียว สิ่งปลูกสร้าง คุณภาพอากาศ แสงไฟ<br />
                เปรียบเทียบกับค่าเฉลี่ยกรุงเทพฯ และดูแนวโน้มรายปี
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-[12px] font-bold text-cyan-400 animate-pulse uppercase tracking-widest">กำลังโหลด…</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-400 text-[12px]">{error}</div>
          </div>
        )}

        {/* Dashboard */}
        {!loading && !error && data && cur && (
          <div className="p-5 space-y-5">

            {/* ── District header ── */}
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-slate-100">เขต{data.district}</h1>
              <span className="text-[11px] text-slate-500 font-bold">พื้นที่รวม {data.areaRai.toLocaleString()} ไร่</span>
              <span className="text-[11px] text-slate-600">·</span>
              <span className="text-[11px] text-slate-500">ข้อมูลปี {selectedYear} เทียบกับ {compareYear}</span>
              {!data.metrics[selectedYear] && (
                <span className="text-[10px] text-amber-400 font-bold">ไม่มีข้อมูลปี {selectedYear}</span>
              )}
            </div>

            {/* ── Summary metric cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                icon={Flame} label="LST เฉลี่ย" color="text-orange-400" iconBg="bg-orange-500/10"
                value={fmt(cur.mean_lst, 2, " °C")}
                sub={`สูงสุด ${fmt(cur.max_lst, 2, "°C")}`}
                delta={delta("mean_lst")} deltaInvert deltaUnit="°C"
              />
              <MetricCard
                icon={Trees} label="พื้นที่สีเขียว" color="text-emerald-400" iconBg="bg-emerald-500/10"
                value={fmtRai(cur.green_area_rai)}
                sub={`NDVI ${fmt(cur.ndvi_mean, 4)} · ${fmtPct(cur.green_area_ratio)}`}
                delta={delta("green_area_rai")} deltaInvert={false} deltaUnit=" ไร่"
              />
              <MetricCard
                icon={Building2} label="สิ่งปลูกสร้าง" color="text-amber-400" iconBg="bg-amber-500/10"
                value={fmtRai(cur.builtup_area_rai)}
                sub={`NDBI ${fmt(cur.ndbi_mean, 4)}`}
                delta={delta("builtup_area_rai")} deltaInvert deltaUnit=" ไร่"
              />
              <MetricCard
                icon={Wind} label="มลพิษอากาศ" color="text-purple-400" iconBg="bg-purple-500/10"
                value={fmt(cur.pollution_score, 2, " /10")}
                sub={`NO₂ ${cur.no2_mean != null ? cur.no2_mean.toExponential(2) : "–"}`}
                delta={delta("pollution_score")} deltaInvert deltaUnit=""
              />
              <MetricCard
                icon={Droplets} label="พื้นที่น้ำ" color="text-sky-400" iconBg="bg-sky-500/10"
                value={fmtPct(cur.water_ratio)}
                sub={`NDWI ${fmt(cur.ndwi_mean, 4)}`}
                delta={delta("water_ratio")} deltaInvert={false} deltaUnit=""
              />
              <MetricCard
                icon={Moon} label="แสงไฟกลางคืน" color="text-yellow-400" iconBg="bg-yellow-500/10"
                value={fmt(cur.ntl_mean, 2)}
                sub="nW/sr/cm²"
                delta={delta("ntl_mean")} deltaInvert={false} deltaUnit=""
              />
            </div>

            {/* ── Trend charts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendChart
                data={trendData.map((d) => ({ year: d.year, district: d.district_green, bkk: d.bkk_green }))}
                districtKey="district" bkkKey="bkk"
                label="พื้นที่สีเขียว (ไร่) รายปี" color="#10b981" unit="ไร่" decimals={0}
              />
              <TrendChart
                data={trendData.map((d) => ({ year: d.year, district: d.district_builtup, bkk: d.bkk_builtup }))}
                districtKey="district" bkkKey="bkk"
                label="พื้นที่สิ่งปลูกสร้าง (ไร่) รายปี" color="#f59e0b" unit="ไร่" decimals={0}
              />
              <TrendChart
                data={trendData.map((d) => ({ year: d.year, district: d.district_lst, bkk: d.bkk_lst }))}
                districtKey="district" bkkKey="bkk"
                label="LST เฉลี่ย (°C) รายปี" color="#f97316" unit="°C" decimals={2}
              />
              <TrendChart
                data={trendData.map((d) => ({ year: d.year, district: d.district_air, bkk: d.bkk_air }))}
                districtKey="district" bkkKey="bkk"
                label="คะแนนมลพิษอากาศ (0–10) รายปี" color="#a78bfa" unit="" decimals={2}
              />
            </div>

            {/* ── vs BKK Average ── */}
            {comparisonData.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  เขต{data.district} vs ค่าเฉลี่ยกรุงเทพฯ ปี {selectedYear}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {comparisonData.map((m) => {
                    const pct = m.bkk > 0 ? ((m.district - m.bkk) / m.bkk) * 100 : 0;
                    const isHigh = pct > 0;
                    const absP = Math.abs(pct).toFixed(1);
                    return (
                      <div key={m.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{m.label}</span>
                          <span className={`text-[10px] font-black ${isHigh ? "text-red-400" : "text-emerald-400"}`}>
                            {isHigh ? "↑" : "↓"} {absP}%
                          </span>
                        </div>
                        {/* Bar comparison */}
                        <div className="space-y-1.5">
                          <div>
                            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                              <span>เขตนี้</span>
                              <span style={{ color: m.color }} className="font-bold">{typeof m.district === "number" ? m.district.toFixed(2) : "–"}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (m.district / Math.max(m.district, m.bkk)) * 100)}%`, backgroundColor: m.color }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                              <span>เฉลี่ย กทม.</span>
                              <span className="font-bold text-slate-400">{typeof m.bkk === "number" ? m.bkk.toFixed(2) : "–"}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div className="h-full rounded-full bg-slate-600 transition-all" style={{ width: `${Math.min(100, (m.bkk / Math.max(m.district, m.bkk)) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── All-years data table ── */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">ข้อมูลทุกปี</span>
                <button onClick={exportCSV} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors">
                  <Download className="h-3 w-3" /> Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-900/80">
                    <tr className="border-b border-slate-800">
                      {["ปี", "LST เฉลี่ย", "LST สูงสุด", "NDVI", "พื้นที่เขียว (ไร่)", "สัดส่วนเขียว", "NDBI", "สิ่งปลูกสร้าง (ไร่)", "NO₂", "คะแนนมลพิษ", "สัดส่วนน้ำ", "NTL Mean"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.years.map((yr) => {
                      const m = data.metrics[yr];
                      const isSelected = yr === selectedYear;
                      const isCompare = yr === compareYear;
                      return (
                        <tr
                          key={yr}
                          className={`border-b border-slate-800/40 hover:bg-slate-800/20 ${isSelected ? "bg-cyan-950/20" : ""}`}
                        >
                          <td className="px-3 py-2 font-black tabular-nums">
                            <span className={isSelected ? "text-cyan-400" : isCompare ? "text-slate-400" : "text-slate-500"}>{yr}</span>
                            {isSelected && <span className="ml-1.5 text-[8px] font-bold text-cyan-600 bg-cyan-950/60 px-1.5 py-0.5 rounded-full">เลือก</span>}
                            {isCompare && !isSelected && <span className="ml-1.5 text-[8px] font-bold text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">เปรียบ</span>}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-orange-400 font-mono">{fmt(m?.mean_lst, 2, " °C")}</td>
                          <td className="px-3 py-2 tabular-nums text-red-400 font-mono">{fmt(m?.max_lst, 2, " °C")}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-400 font-mono">{fmt(m?.ndvi_mean, 4)}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-300 font-mono">{m?.green_area_rai != null ? Math.round(m.green_area_rai).toLocaleString() : "–"}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-400 font-mono">{fmtPct(m?.green_area_ratio)}</td>
                          <td className="px-3 py-2 tabular-nums text-amber-400 font-mono">{fmt(m?.ndbi_mean, 4)}</td>
                          <td className="px-3 py-2 tabular-nums text-amber-300 font-mono">{m?.builtup_area_rai != null ? Math.round(m.builtup_area_rai).toLocaleString() : "–"}</td>
                          <td className="px-3 py-2 tabular-nums text-purple-400 font-mono">{m?.no2_mean != null ? m.no2_mean.toExponential(3) : "–"}</td>
                          <td className="px-3 py-2 tabular-nums text-purple-300 font-mono">{fmt(m?.pollution_score, 2)}</td>
                          <td className="px-3 py-2 tabular-nums text-sky-400 font-mono">{fmtPct(m?.water_ratio)}</td>
                          <td className="px-3 py-2 tabular-nums text-yellow-400 font-mono">{fmt(m?.ntl_mean, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* BKK Average comparison row */}
                  {data.bkkAverages[selectedYear] && (
                    <tfoot className="border-t border-slate-700/60 bg-slate-900/90">
                      <tr>
                        <td className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600">เฉลี่ย กทม.</td>
                        {(() => {
                          const b = data.bkkAverages[selectedYear];
                          return (
                            <>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.mean_lst, 2, " °C")}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.max_lst, 2, " °C")}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ndvi_mean, 4)}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.green_area_rai != null ? Math.round(b.green_area_rai).toLocaleString() : "–"}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmtPct(b.green_area_ratio)}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ndbi_mean, 4)}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.builtup_area_rai != null ? Math.round(b.builtup_area_rai).toLocaleString() : "–"}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{b.no2_mean != null ? b.no2_mean.toExponential(3) : "–"}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.pollution_score, 2)}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmtPct(b.water_ratio)}</td>
                              <td className="px-3 py-2 tabular-nums text-slate-500 font-mono text-[10px]">{fmt(b.ntl_mean, 2)}</td>
                            </>
                          );
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
