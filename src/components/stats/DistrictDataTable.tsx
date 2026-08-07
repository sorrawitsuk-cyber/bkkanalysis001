/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download, SlidersHorizontal, Calendar, Eye, EyeOff, Layers, X, TrendingUp } from "lucide-react";

export type ColDef = {
  key: string;
  label: string;
  unit?: string;
  format?: (v: any) => string;
  sortable?: boolean;
  heatmap?: boolean;
  heatmapHex?: string;
  heatmapInvert?: boolean;
  hideable?: boolean; // can be toggled off
};

interface DistrictDataTableProps {
  features: any[];
  columns: ColDef[];
  getRowData: (props: any) => Record<string, any>;
  csvFilename?: string;
  showStatsFooter?: boolean;
  filterDistrict?: string;
  // Year controls
  year?: number;
  onYearChange?: (y: number) => void;
  minYear?: number;
  maxYear?: number;
  // District name for multi-year fetch (when filterDistrict is set, load all years)
  enableMultiYear?: boolean;
  accentColor?: string;
  // Compare controls
  compareMode?: boolean;
  onCompareModeChange?: (v: boolean) => void;
  compareYear?: number;
  onCompareYearChange?: (y: number) => void;
  // District selector
  onDistrictChange?: (d: string) => void;
  districts?: string[];
  dataSource?: string | null;
  contextNote?: string;
  expectedRows?: number;
}

function fmtDelta(delta: number): string {
  const abs = Math.abs(delta);
  const sign = delta > 0 ? "+" : "";
  if (abs < 1e-8)   return "±0";
  if (abs < 0.0001) return sign + delta.toExponential(1);
  if (abs < 0.001)  return sign + delta.toFixed(5);
  if (abs < 1)      return sign + delta.toFixed(4);
  if (abs < 10)     return sign + delta.toFixed(2);
  if (abs < 1000)   return sign + Math.round(delta).toString();
  return sign + Math.round(delta).toLocaleString();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const ACCENT_HEX: Record<string, string> = {
  orange: "#f97316", emerald: "#10b981", indigo: "#6366f1", cyan: "#06b6d4",
};

export default function DistrictDataTable({
  features,
  columns,
  getRowData,
  csvFilename = "district_data",
  showStatsFooter = true,
  filterDistrict,
  year,
  onYearChange,
  minYear = 2018,
  maxYear = 2026,
  enableMultiYear = false,
  accentColor = "cyan",
  compareMode = false,
  onCompareModeChange,
  compareYear,
  onCompareYearChange,
  onDistrictChange,
  districts = [],
  dataSource,
  contextNote,
  expectedRows,
}: DistrictDataTableProps) {
  const [search, setSearch]           = useState("");
  const [sortKey, setSortKey]         = useState<string>(columns[1]?.key ?? columns[0]?.key);
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");
  const [showRank, setShowRank]       = useState(true);
  const [hiddenCols, setHiddenCols]   = useState<Set<string>>(new Set());
  const [showColPicker, setShowColPicker] = useState(false);
  const [showDelta, setShowDelta]     = useState(false);

  // ── Multi-year district mode ──────────────────────────────────────────────
  const [multiYearMode, setMultiYearMode] = useState(false);
  const [multiYearRows, setMultiYearRows] = useState<any[]>([]);
  const [multiYearLoading, setMultiYearLoading] = useState(false);

  const isDistrictFiltered = !!(filterDistrict && filterDistrict !== "ทั้งหมด");
  const accentHex = ACCENT_HEX[accentColor] ?? "#06b6d4";

  // ── Year range filter ─────────────────────────────────────────────────────
  const [yearFrom, setYearFrom] = useState<number>(minYear);
  const [yearTo,   setYearTo]   = useState<number>(maxYear);
  const showYearFilter = multiYearMode && multiYearRows.length > 0;

  // Fetch all-years data when entering multi-year mode for a filtered district
  const fetchMultiYear = useCallback(async () => {
    if (!filterDistrict || filterDistrict === "ทั้งหมด") return;
    setMultiYearLoading(true);
    try {
      const res = await fetch(`/api/district-profile?district=${encodeURIComponent(filterDistrict)}`);
      const data = await res.json();
      if (data.error || !data.metrics) { setMultiYearRows([]); return; }

      // Flatten metrics per year into flat rows compatible with columns
      const rows: any[] = Object.entries(data.metrics as Record<string, any>).map(([yr, m]) => ({
        name: filterDistrict,
        year: Number(yr),
        // Spread all metric fields so table columns can access them
        ...m,
        // Map common aliases
        mean_lst: m.mean_lst, max_lst: m.max_lst,
        ndvi_mean: m.ndvi_mean, ndvi_score: m.ndvi_score,
        green_area_ratio: m.green_area_ratio, green_area_rai: m.green_area_rai,
        ndbi_mean: m.ndbi_mean, builtup_area_rai: m.builtup_area_rai,
        no2_mean: m.no2_mean, co_mean: m.co_mean, so2_mean: m.so2_mean, pollution_score: m.pollution_score,
        ntl_mean: m.ntl_mean, ntl_max: m.ntl_max,
        water_ratio: m.water_ratio, ndwi_mean: m.ndwi_mean,
      }));
      setMultiYearRows(rows.sort((a, b) => a.year - b.year));
    } catch {
      setMultiYearRows([]);
    } finally {
      setMultiYearLoading(false);
    }
  }, [filterDistrict]);

  useEffect(() => {
    if (multiYearMode && isDistrictFiltered) {
      fetchMultiYear();
    } else if (!multiYearMode) {
      setMultiYearRows([]);
    }
  }, [multiYearMode, isDistrictFiltered, fetchMultiYear]);

  // Reset multi-year when district changes
  useEffect(() => {
    setMultiYearMode(false);
    setMultiYearRows([]);
  }, [filterDistrict]);

  // Reset delta when leaving multi-year mode
  useEffect(() => {
    if (!multiYearMode) setShowDelta(false);
  }, [multiYearMode]);

  // Delta map: for each year row, compute delta vs previous chronological year
  const deltaMap = useMemo(() => {
    if (!multiYearMode || multiYearRows.length === 0) return {} as Record<number, Record<string, number | null>>;
    const byYear = [...multiYearRows].sort((a, b) => a.year - b.year);
    const map: Record<number, Record<string, number | null>> = {};
    byYear.forEach((row, i) => {
      map[row.year] = {};
      if (i === 0) return;
      columns.forEach((col) => {
        const curr = row[col.key];
        const prev = byYear[i - 1][col.key];
        map[row.year][col.key] =
          typeof curr === "number" && typeof prev === "number" ? curr - prev : null;
      });
    });
    return map;
  }, [multiYearMode, multiYearRows, columns]);

  // ── Visible columns ────────────────────────────────────────────────────────
  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenCols.has(c.key)),
    [columns, hiddenCols],
  );

  // ── Row source: multi-year OR single-year ─────────────────────────────────
  const rows = useMemo(() => {
    if (multiYearMode && multiYearRows.length > 0) {
      // Multi-year: each row is a year entry — skip getRowData, data is already flat
      return multiYearRows.filter((r) =>
        (!showYearFilter || (r.year >= yearFrom && r.year <= yearTo))
      );
    }
    return (features ?? [])
      .map((f) => getRowData(f.properties))
      .filter((r) => r.name && r.name !== "–");
  }, [features, getRowData, multiYearMode, multiYearRows, showYearFilter, yearFrom, yearTo]);

  const heatmapRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    columns.forEach((col) => {
      if (!col.heatmap) return;
      const nums = rows.map((r) => r[col.key]).filter((v) => typeof v === "number" && Number.isFinite(v)) as number[];
      if (nums.length) ranges[col.key] = { min: Math.min(...nums), max: Math.max(...nums) };
    });
    return ranges;
  }, [rows, columns]);

  const colStats = useMemo(() => {
    const stats: Record<string, { mean: number; min: number; max: number }> = {};
    columns.forEach((col) => {
      const nums = rows.map((r) => r[col.key]).filter((v) => typeof v === "number" && Number.isFinite(v)) as number[];
      if (nums.length) stats[col.key] = { mean: nums.reduce((s, v) => s + v, 0) / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
    });
    return stats;
  }, [rows, columns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = q ? rows.filter((r) => String(r.name ?? "").toLowerCase().includes(q) || String(r.year ?? "").includes(q)) : rows;
    if (!multiYearMode && filterDistrict && filterDistrict !== "ทั้งหมด") {
      result = result.filter((r) => r.name === filterDistrict || r.name === filterDistrict.replace(/^เขต/, ""));
    }
    return result;
  }, [rows, search, filterDistrict, multiYearMode]);

  const completeness = useMemo(() => {
    const numericCols = columns.filter((c) => c.key !== "name" && c.key !== "delta" && !c.key.startsWith("compare_"));
    const usableRows = filtered.filter((row) =>
      numericCols.some((col) => typeof row[col.key] === "number" && Number.isFinite(row[col.key]))
    ).length;
    return {
      usableRows,
      expectedRows: expectedRows ?? filtered.length,
    };
  }, [columns, filtered, expectedRows]);

  const sorted = useMemo(() => {
    // In multi-year mode with default sort key, sort by year asc
    const effectiveSortKey = multiYearMode && sortKey === (columns[1]?.key ?? columns[0]?.key) ? "year" : sortKey;
    const effectiveSortDir = (multiYearMode && effectiveSortKey === "year") ? "asc" : sortDir;
    return [...filtered].sort((a, b) => {
      const va = a[effectiveSortKey]; const vb = b[effectiveSortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1; if (vb == null) return -1;
      const cmp = (typeof va === "number" && typeof vb === "number") ? va - vb : String(va).localeCompare(String(vb), "th");
      return effectiveSortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, multiYearMode, columns]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function getCellStyle(col: ColDef, value: any): { bg?: string; color?: string } {
    if (!col.heatmap) return {};
    const range = heatmapRanges[col.key];
    if (!range || typeof value !== "number") return {};
    const { min, max } = range;
    if (max === min) return {};
    let t = (value - min) / (max - min);
    if (col.heatmapInvert) t = 1 - t;
    const hex = col.heatmapHex ?? accentHex;
    const [r, g, b] = hexToRgb(hex);
    return { bg: `rgba(${r},${g},${b},${(0.06 + t * 0.28).toFixed(2)})`, color: t > 0.65 ? hex : undefined };
  }

  function exportCSV() {
    const extraHeaders = multiYearMode ? ["ปี"] : [];
    const rankHeader = showRank && !multiYearMode ? ["อันดับ"] : [];
    const headers = [...rankHeader, ...extraHeaders, ...visibleColumns.map((c) => c.label + (c.unit ? ` (${c.unit})` : ""))].join(",");
    const body = sorted.map((row, idx) => {
      const rankCell = (showRank && !multiYearMode) ? [`"${idx + 1}"`] : [];
      const yearCell = multiYearMode ? [`"${row.year ?? ""}"`] : [];
      const cells = visibleColumns.map((c) => {
        const v = row[c.key];
        const formatted = v == null ? "–" : (c.format ? c.format(v) : v);
        return `"${formatted}"`;
      });
      return [...rankCell, ...yearCell, ...cells].join(",");
    }).join("\n");
    const blob = new Blob(["﻿" + headers + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${csvFilename}${multiYearMode ? "_all-years" : ""}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 w-full min-w-0 flex h-full flex-col overflow-hidden bg-slate-950">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 sm:px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">

        {/* Search */}
        <div className="relative min-w-[11rem] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเขต / ปี…"
            className="h-8 w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
          />
        </div>

        {/* Year stepper (single-year mode) */}
        {onYearChange && !multiYearMode && (
          <div className="flex items-center gap-1 shrink-0">
            <Calendar className="h-3.5 w-3.5 text-slate-600" />
            <button onClick={() => onYearChange(Math.max(minYear, (year ?? minYear) - 1))} disabled={(year ?? minYear) <= minYear}
              className="h-7 w-7 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center text-xs transition-colors">‹</button>
            <span className="text-[12px] font-bold font-mono tabular-nums w-12 text-center" style={{ color: accentHex }}>{year ?? minYear}</span>
            <button onClick={() => onYearChange(Math.min(maxYear, (year ?? maxYear) + 1))} disabled={(year ?? maxYear) >= maxYear}
              className="h-7 w-7 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center text-xs transition-colors">›</button>
          </div>
        )}

        {/* Year range filter (multi-year mode) */}
        {showYearFilter && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar className="h-3.5 w-3.5 text-slate-600" />
            <select value={yearFrom} onChange={(e) => setYearFrom(Number(e.target.value))}
              className="h-7 rounded border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-300 focus:outline-none">
              {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-slate-600 text-[11px]">–</span>
            <select value={yearTo} onChange={(e) => setYearTo(Number(e.target.value))}
              className="h-7 rounded border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-300 focus:outline-none">
              {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).filter((y) => y >= yearFrom).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {/* Row count */}
        <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
          {sorted.length}{!multiYearMode && ` / ${rows.length} เขต`}{multiYearMode && " แถว"}
        </span>

        <div className="hidden lg:block lg:flex-1" />

        {/* Multi-year toggle (only when district is selected) */}
        {enableMultiYear && isDistrictFiltered && (
          <button
            onClick={() => setMultiYearMode((v) => !v)}
            disabled={multiYearLoading}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${multiYearMode ? "border-sky-700/60 bg-sky-950/40 text-sky-400" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
          >
            <Layers className="h-3.5 w-3.5" />
            {multiYearLoading ? "กำลังโหลด…" : multiYearMode ? "ดูแค่ปีนี้" : "ดูทุกปี"}
          </button>
        )}

        {/* Delta toggle (multi-year mode only) */}
        {multiYearMode && multiYearRows.length > 0 && (
          <button
            onClick={() => setShowDelta((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${showDelta ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-400" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Δ ปีก่อน
          </button>
        )}

        {/* Rank toggle */}
        {!multiYearMode && (
          <button
            onClick={() => setShowRank((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${showRank ? "border-cyan-700/60 bg-cyan-950/40 text-cyan-400" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> อันดับ
          </button>
        )}

        {/* Column picker */}
        <div className="relative">
          <button
            onClick={() => setShowColPicker((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${showColPicker ? "border-slate-500 bg-slate-800 text-slate-200" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
          >
            {hiddenCols.size > 0 ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            คอลัมน์
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 max-h-72 min-w-[190px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/98 p-3 shadow-2xl backdrop-blur">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">แสดง/ซ่อนคอลัมน์</p>
              {columns.filter((c) => c.hideable !== false && c.key !== "name").map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer group">
                  <input type="checkbox" checked={!hiddenCols.has(col.key)}
                    onChange={(e) => {
                      setHiddenCols((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(col.key); else next.add(col.key);
                        return next;
                      });
                    }}
                    className="accent-cyan-500"
                  />
                  <span className="text-[11px] text-slate-400 group-hover:text-slate-200 transition-colors">
                    {col.label}{col.unit && <span className="text-slate-600"> ({col.unit})</span>}
                  </span>
                </label>
              ))}
              <button onClick={() => setShowColPicker(false)} className="mt-2 w-full text-[10px] text-slate-600 hover:text-slate-400">ปิด</button>
            </div>
          )}
        </div>

        {/* District selector */}
        {onDistrictChange && districts.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={filterDistrict ?? "ทั้งหมด"}
              onChange={(e) => onDistrictChange(e.target.value)}
              className="h-8 rounded-lg border border-slate-800 bg-slate-900/80 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-slate-600"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {filterDistrict && filterDistrict !== "ทั้งหมด" && (
              <button onClick={() => onDistrictChange("ทั้งหมด")} className="h-7 w-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Compare toggle + baseline year */}
        {onCompareModeChange && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onCompareModeChange(!compareMode)}
              className={`h-8 px-3 rounded-lg border text-[11px] font-bold transition-colors ${compareMode ? "border-sky-700/60 bg-sky-950/40 text-sky-400" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
            >
              {compareMode ? "เทียบปีฐาน ON" : "เทียบปีฐาน"}
            </button>
            {compareMode && onCompareYearChange && compareYear != null && (
              <>
                <button onClick={() => onCompareYearChange(Math.max(minYear, compareYear - 1))} disabled={compareYear <= minYear}
                  className="h-8 w-8 rounded border border-slate-700 text-slate-500 hover:text-slate-200 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">‹</button>
                <span className="text-[11px] font-bold font-mono text-sky-300 min-w-[3rem] text-center">{compareYear}</span>
                <button onClick={() => onCompareYearChange(Math.min((year ?? maxYear) - 1, compareYear + 1))} disabled={compareYear >= (year ?? maxYear) - 1}
                  className="h-8 w-8 rounded border border-slate-700 text-slate-500 hover:text-slate-200 disabled:opacity-30 flex items-center justify-center transition-colors text-xs">›</button>
              </>
            )}
          </div>
        )}

        {/* Export CSV */}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-[11px] font-bold text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {(dataSource || contextNote || rows.length > 0) && (
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-800/50 bg-slate-900/15 px-4 py-2 text-[10px] text-slate-500">
          <span className="font-bold text-slate-400">
            ข้อมูลตัวเลข {completeness.usableRows}/{completeness.expectedRows} แถว
          </span>
          {completeness.usableRows < completeness.expectedRows && (
            <span className="text-amber-400">
              มีบางพื้นที่ยังไม่มีค่าดาวเทียมในปี/ชั้นข้อมูลนี้
            </span>
          )}
          {dataSource && (
            <span>
              ที่มา: <span className="text-slate-300">{dataSource}</span>
            </span>
          )}
          {contextNote && <span className="text-slate-600">{contextNote}</span>}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
        <table className="w-max min-w-full text-[12px] border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900/98 backdrop-blur">
            <tr className="border-b border-slate-800">
              {(showRank && !multiYearMode) && (
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-600 w-10">#</th>
              )}
              {/* Year column in multi-year mode */}
              {multiYearMode && (
                <th onClick={() => handleSort("year")} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none text-slate-400">
                  <div className="flex items-center gap-1.5">ปี {sortKey === "year" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-cyan-400" /> : <ArrowDown className="h-3 w-3 text-cyan-400" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-3 sm:px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${col.sortable !== false ? "cursor-pointer select-none" : ""} ${sortKey === col.key ? "text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    {col.unit && <span className="font-normal normal-case opacity-40">({col.unit})</span>}
                    {col.heatmap && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: col.heatmapHex ?? accentHex }} />}
                    {col.sortable !== false && (
                      sortKey === col.key
                        ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUp className="h-3 w-3 text-cyan-400" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-20" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + (showRank && !multiYearMode ? 1 : 0) + (multiYearMode ? 1 : 0)} className="px-4 py-12 text-center text-slate-600">
                  {multiYearLoading ? "กำลังโหลดข้อมูลทุกปี…" : "ไม่พบข้อมูล"}
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => {
              const isHighlight = !multiYearMode && filterDistrict && filterDistrict !== "ทั้งหมด"
                && (row.name === filterDistrict || row.name === filterDistrict.replace(/^เขต/, ""));
              const isCurrentYear = multiYearMode && row.year === year;

              return (
                <tr
                  key={(row.name ?? "") + (row.year ?? idx)}
                  className={`border-b border-slate-800/40 transition-colors
                    ${isHighlight ? "bg-sky-950/30 border-l-2 border-l-sky-500" : ""}
                    ${isCurrentYear ? "bg-sky-950/20" : ""}
                    hover:bg-slate-800/20`}
                >
                  {(showRank && !multiYearMode) && (
                    <td className="px-3 py-2.5 text-[10px] font-mono text-slate-600 tabular-nums">{idx + 1}</td>
                  )}
                  {multiYearMode && (
                    <td className="px-4 py-2.5 font-mono tabular-nums font-bold" style={{ color: isCurrentYear ? accentHex : "#64748b" }}>
                      {row.year}
                      {isCurrentYear && <span className="ml-1 text-[8px] rounded px-1" style={{ background: accentHex + "25", color: accentHex }}>▶</span>}
                    </td>
                  )}
                  {visibleColumns.map((col) => {
                    const v = row[col.key];
                    const display = v == null ? "–" : (col.format ? col.format(v) : String(v));
                    const isName = col.key === "name";
                    const isNum = typeof v === "number";
                    const { bg, color } = getCellStyle(col, v);

                    // Delta vs previous year
                    const delta = (showDelta && multiYearMode && row.year != null && isNum)
                      ? (deltaMap[row.year]?.[col.key] ?? undefined)
                      : undefined;
                    const hasDelta = delta !== undefined && delta !== null;
                    const deltaIsZero = hasDelta && Math.abs(delta!) < 1e-8;
                    const deltaIsGood = hasDelta && !deltaIsZero && (col.heatmapInvert ? delta! < 0 : delta! > 0);
                    const deltaColor = deltaIsZero
                      ? "text-slate-600"
                      : deltaIsGood ? "text-emerald-400" : "text-red-400";

                    return (
                      <td
                        key={col.key}
                        style={{ backgroundColor: bg, color }}
                        className={`px-3 sm:px-4 py-2 whitespace-nowrap ${isName ? "sticky left-0 z-[1] bg-slate-950/95 font-semibold text-slate-200" : isNum ? "font-mono tabular-nums text-slate-300" : "text-slate-400"}`}
                      >
                        {display === "–" ? (
                          <span className="text-slate-700">–</span>
                        ) : hasDelta ? (
                          <div className="flex flex-col leading-tight gap-0.5">
                            <span>{display}</span>
                            <span className={`text-[9px] font-bold tabular-nums ${deltaColor}`}>
                              {deltaIsZero ? "=" : fmtDelta(delta!)}
                            </span>
                          </div>
                        ) : display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {showStatsFooter && rows.length > 0 && !multiYearMode && (
            <tfoot className="sticky bottom-0 border-t border-slate-700/60 bg-slate-900/98 backdrop-blur">
              {(["max", "mean", "min"] as const).map((stat) => (
                <tr key={stat} className={stat !== "min" ? "border-b border-slate-800/30" : ""}>
                  {showRank && <td className="px-3 py-1.5" />}
                  {visibleColumns.map((col) => {
                    const s = colStats[col.key];
                    const fmtFn = col.format ?? ((v: any) => v != null ? String(Number(v).toFixed(3)) : "–");
                    const labelColor = stat === "max" ? "text-amber-500/70" : stat === "mean" ? "text-slate-500" : "text-sky-600/70";
                    const valueColor = stat === "max" ? "text-slate-300" : stat === "mean" ? "text-slate-500" : "text-slate-600";
                    return (
                      <td key={col.key} className={`px-4 py-1.5 text-[10px] font-mono tabular-nums ${valueColor}`}>
                        {col.key === "name" ? (
                          <span className={`font-bold uppercase tracking-widest text-[9px] ${labelColor}`}>
                            {stat === "max" ? "สูงสุด" : stat === "mean" ? "เฉลี่ย" : "ต่ำสุด"}
                          </span>
                        ) : s ? (
                          fmtFn(s[stat])
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
