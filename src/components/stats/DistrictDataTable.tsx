/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download, SlidersHorizontal } from "lucide-react";

export type ColDef = {
  key: string;
  label: string;
  unit?: string;
  format?: (v: any) => string;
  sortable?: boolean;
  heatmap?: boolean;       // color-code this column by value percentile
  heatmapHex?: string;     // accent color for heatmap (default: #06b6d4)
  heatmapInvert?: boolean; // lower = more intense
};

interface DistrictDataTableProps {
  features: any[];
  columns: ColDef[];
  getRowData: (props: any) => Record<string, any>;
  csvFilename?: string;
  showStatsFooter?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export default function DistrictDataTable({
  features,
  columns,
  getRowData,
  csvFilename = "district_data",
  showStatsFooter = true,
}: DistrictDataTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>(columns[1]?.key ?? columns[0]?.key);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showRank, setShowRank] = useState(true);

  const rows = useMemo(() => {
    return (features ?? [])
      .map((f) => getRowData(f.properties))
      .filter((r) => r.name && r.name !== "–");
  }, [features, getRowData]);

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
      if (nums.length) {
        stats[col.key] = {
          mean: nums.reduce((s, v) => s + v, 0) / nums.length,
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
      }
    });
    return stats;
  }, [rows, columns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => String(r.name).toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const num = typeof va === "number" && typeof vb === "number";
      const cmp = num ? va - vb : String(va).localeCompare(String(vb), "th");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
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
    const hex = col.heatmapHex ?? "#06b6d4";
    const [r, g, b] = hexToRgb(hex);
    const alpha = 0.06 + t * 0.28;
    return {
      bg: `rgba(${r},${g},${b},${alpha.toFixed(2)})`,
      color: t > 0.65 ? hex : undefined,
    };
  }

  function exportCSV() {
    const rankHeader = showRank ? ["อันดับ"] : [];
    const headers = [...rankHeader, ...columns.map((c) => c.label + (c.unit ? ` (${c.unit})` : ""))].join(",");
    const body = sorted.map((row, idx) => {
      const rankCell = showRank ? [`"${idx + 1}"`] : [];
      const cells = columns.map((c) => {
        const v = row[c.key];
        const formatted = c.format ? c.format(v) : (v != null ? v : "–");
        return `"${formatted}"`;
      });
      return [...rankCell, ...cells].join(",");
    }).join("\n");
    const blob = new Blob(["﻿" + headers + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${csvFilename}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 w-full flex h-full flex-col bg-slate-950">

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเขต…"
            className="h-9 w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
          />
        </div>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {sorted.length} / {rows.length} เขต
        </span>
        <button
          onClick={() => setShowRank((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors ${showRank ? "border-cyan-700/60 bg-cyan-950/40 text-cyan-400" : "border-slate-700 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> อันดับ
        </button>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-900/98 backdrop-blur">
            <tr className="border-b border-slate-800">
              {showRank && (
                <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-600 w-10">#</th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${col.sortable !== false ? "cursor-pointer select-none" : ""} ${sortKey === col.key ? "text-slate-200" : "text-slate-600 hover:text-slate-400"}`}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    {col.unit && <span className="font-normal normal-case opacity-40">({col.unit})</span>}
                    {col.heatmap && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: col.heatmapHex ?? "#06b6d4" }} />
                    )}
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
                <td colSpan={columns.length + (showRank ? 1 : 0)} className="px-4 py-12 text-center text-slate-600">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => (
              <tr
                key={row.name + idx}
                className="border-b border-slate-800/40 transition-colors hover:bg-slate-800/20"
              >
                {showRank && (
                  <td className="px-3 py-2.5 text-[10px] font-mono text-slate-600 tabular-nums">{idx + 1}</td>
                )}
                {columns.map((col) => {
                  const v = row[col.key];
                  const display = col.format ? col.format(v) : (v != null ? String(v) : "–");
                  const isName = col.key === "name";
                  const isNum = typeof v === "number";
                  const { bg, color } = getCellStyle(col, v);
                  return (
                    <td
                      key={col.key}
                      style={{ backgroundColor: bg, color: color }}
                      className={`px-4 py-2.5 ${isName ? "font-semibold text-slate-200" : isNum ? "font-mono tabular-nums text-slate-300" : "text-slate-400"}`}
                    >
                      {display === "–" ? <span className="text-slate-700">–</span> : display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          {showStatsFooter && rows.length > 0 && (
            <tfoot className="sticky bottom-0 border-t border-slate-700/60 bg-slate-900/98 backdrop-blur">
              <tr>
                {showRank && <td className="px-3 py-2 text-[9px] font-bold uppercase text-slate-700 tracking-widest" />}
                {columns.map((col) => {
                  const s = colStats[col.key];
                  const fmtFn = col.format ?? ((v: any) => v != null ? String(Number(v).toFixed(3)) : "–");
                  return (
                    <td key={col.key} className="px-4 py-2 text-[10px] font-mono text-slate-600 tabular-nums border-0">
                      {col.key === "name" ? (
                        <span className="font-bold uppercase tracking-widest text-slate-700 text-[9px]">ค่าเฉลี่ย</span>
                      ) : s ? (
                        <span title={`min: ${fmtFn(s.min)} / max: ${fmtFn(s.max)}`} className="cursor-help">
                          {fmtFn(s.mean)}
                        </span>
                      ) : "—"}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
