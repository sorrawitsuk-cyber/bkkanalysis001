/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface NdviInsightsPanelProps {
  summary: any;
}

export default function NdviInsightsPanel({ summary }: NdviInsightsPanelProps) {
  if (!summary) return null;

  const lowRanking = (summary.lowestNdviRanking || []).map((item: any) => ({
    name: item.district_name,
    ndvi: item.ndvi_mean ?? 0,
    priority: item.priority_score ?? 0,
  }));
  const trend = (summary.yearlyTrend || []).map(([year, value]: [string, number]) => ({
    year,
    ndvi: value,
  }));

  return (
    <div className="w-full bg-slate-900/50 rounded-lg border border-slate-800 p-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-xs font-bold text-slate-100">เขตที่ NDVI ต่ำและแนวโน้มพื้นที่สีเขียว</h3>
          <p className="text-[10px] text-slate-500 mt-1">ใช้สำหรับจัดลำดับเขตเป้าหมายเบื้องต้น</p>
        </div>
        <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1">
          {summary.selectedYear}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="h-40 min-w-0">
          <div className="text-[10px] text-slate-400 mb-2">10 เขต NDVI ต่ำสุด</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={lowRanking} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" domain={[0, "dataMax"]} stroke="#64748b" tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="name" width={64} stroke="#64748b" tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", fontSize: 11 }} />
              <Bar dataKey="ndvi" fill="#68d391" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="h-40 min-w-0">
          <div className="text-[10px] text-slate-400 mb-2">แนวโน้ม NDVI รายปี</div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 9 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 9 }} domain={["dataMin - 0.02", "dataMax + 0.02"]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#f8fafc", fontSize: 11 }} />
              <Line type="monotone" dataKey="ndvi" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
