/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from "lucide-react";

export type ColDef = {
  key: string;
  label: string;
  unit?: string;
  format?: (v: any) => string;
  sortable?: boolean;
};

interface DistrictDataTableProps {
  features: any[]; // GeoJSON features
  columns: ColDef[];
  getRowData: (props: any) => Record<string, any>; // extract flat row from feature.properties
  csvFilename?: string;
}

export default function DistrictDataTable({
  features,
  columns,
  getRowData,
  csvFilename = "district_data",
}: DistrictDataTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>(columns[1]?.key ?? columns[0]?.key);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    return (features ?? [])
      .map((f) => getRowData(f.properties))
      .filter((r) => r.name && r.name !== "–");
  }, [features, getRowData]);

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

  function exportCSV() {
    const headers = columns.map((c) => c.label + (c.unit ? ` (${c.unit})` : "")).join(",");
    const body = sorted.map((row) =>
      columns.map((c) => {
        const v = row[c.key];
        const formatted = c.format ? c.format(v) : (v != null ? v : "–");
        return `"${formatted}"`;
      }).join(",")
    ).join("\n");
    const blob = new Blob(["﻿" + headers + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${csvFilename}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">

      {/* toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเขต…"
            className="h-9 w-full rounded-lg border border-slate-800 bg-slate-900/80 pl-9 pr-3 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none"
          />
        </div>
        <span className="text-[11px] text-slate-500">
          {sorted.length} / {rows.length} เขต
        </span>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-[11px] font-bold text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-800">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 w-8">#</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap ${col.sortable !== false ? "cursor-pointer hover:text-slate-300 select-none" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    {col.unit && <span className="font-normal normal-case opacity-50">({col.unit})</span>}
                    {col.sortable !== false && (
                      sortKey === col.key
                        ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUp className="h-3 w-3 text-cyan-400" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-600">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => (
              <tr
                key={row.name + idx}
                className="border-t border-slate-800/50 transition-colors hover:bg-slate-800/30"
              >
                <td className="px-4 py-2.5 text-[10px] font-mono text-slate-600">{idx + 1}</td>
                {columns.map((col) => {
                  const v = row[col.key];
                  const display = col.format ? col.format(v) : (v != null ? String(v) : "–");
                  const isName = col.key === "name";
                  const isNum = typeof v === "number";
                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 ${isName ? "font-semibold text-slate-200" : isNum ? "font-mono text-slate-300 tabular-nums" : "text-slate-400"}`}
                    >
                      {display === "–" ? <span className="text-slate-700">–</span> : display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
