/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface NdviInsightsPanelProps {
  summary: any;
  areaRows?: Array<{ district: string; value: number; ratio?: number | null }>;
}

export default function NdviInsightsPanel({ summary, areaRows = [] }: NdviInsightsPanelProps) {
  if (!summary) return null;

  const lowRanking = areaRows.length
    ? [...areaRows]
        .filter((item) => Number.isFinite(Number(item.ratio)))
        .sort((a, b) => Number(a.ratio) - Number(b.ratio))
        .slice(0, 10)
        .map((item) => ({ name: item.district, density: Number(item.ratio) * 100 }))
    : (summary.lowestNdviRanking || [])
      .filter((item: any) => Number.isFinite(Number(item.green_area_ratio)))
      .map((item: any) => ({
        name: item.district_name,
        density: Number(item.green_area_ratio) * 100,
      }));

  return (
    <div className="w-full bg-slate-900/50 rounded-lg border border-slate-800 p-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-xs font-bold text-slate-100">ความหนาแน่นพื้นที่สีเขียวรายเขต</h3>
          <p className="text-[10px] text-slate-500 mt-1">แสดงสัดส่วนพื้นที่สีเขียวต่อพื้นที่เขตเป็นร้อยละ</p>
        </div>
        <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1">
          {summary.selectedYear}
        </span>
      </div>

      <div className="h-48 min-h-48 min-w-[1px]">
        <div className="text-[10px] text-slate-400 mb-2">10 เขตความหนาแน่นพื้นที่สีเขียวน้อยสุด (%)</div>
        <ResponsiveContainer width="100%" height={192} minWidth={1} minHeight={1}>
          <BarChart data={lowRanking} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis type="number" domain={[0, "dataMax"]} stroke="#64748b" tick={{ fontSize: 9 }} tickFormatter={(value) => `${value}%`} />
            <YAxis type="category" dataKey="name" width={64} stroke="#64748b" tick={{ fontSize: 9 }} />
            <Tooltip formatter={(value: any) => [`${Number(value || 0).toFixed(1)}%`, "ความหนาแน่น"]} contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", fontSize: 11 }} />
            <Bar dataKey="density" fill="#68d391" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
