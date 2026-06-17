"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BarChart3, Database, MousePointer2, X } from "lucide-react";
import { type DataProvenance, getQualityLabel } from "@/lib/data-provenance";

type Metric = {
  label: string;
  value: string;
  rawValue?: number | null;
  color?: string;
};

interface InteractiveDistrictPanelProps {
  title: string;
  subtitle?: string;
  metrics: Metric[];
  accent?: "orange" | "emerald" | "cyan" | "yellow";
  selected?: boolean;
  provenance?: DataProvenance;
  insight?: string;
  onClear?: () => void;
}

const accentClasses = {
  orange: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100",
};

const accentText = {
  orange: "text-orange-300",
  emerald: "text-emerald-300",
  cyan: "text-cyan-300",
  yellow: "text-yellow-200",
};

const qualityClasses = {
  observed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  modeled: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  estimated: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  fallback: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  unavailable: "border-slate-600 bg-slate-800/70 text-slate-300",
  unknown: "border-slate-600 bg-slate-800/70 text-slate-300",
};

export default function InteractiveDistrictPanel({
  title,
  subtitle,
  metrics,
  accent = "cyan",
  selected = false,
  provenance,
  insight,
  onClear,
}: InteractiveDistrictPanelProps) {
  const chartRows = metrics
    .filter((metric) => typeof metric.rawValue === "number" && Number.isFinite(metric.rawValue))
    .slice(0, 5)
    .map((metric) => ({
      name: metric.label,
      value: Math.abs(Number(metric.rawValue)),
      fill: metric.color ?? "#38bdf8",
    }));

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" data-testid="interactive-district-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${accentClasses[accent]}`}>
            {selected ? <BarChart3 className="h-3 w-3" /> : <MousePointer2 className="h-3 w-3" />}
            {selected ? "พื้นที่ที่เลือก" : "คลิกบนแผนที่"}
          </div>
          <h3 className="mt-3 truncate text-sm font-black text-slate-100">{title}</h3>
          {subtitle && <p className="mt-1 text-[10px] leading-4 text-slate-500">{subtitle}</p>}
        </div>
        {selected && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800/70 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100"
            title="ล้างพื้นที่ที่เลือก"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {metrics.slice(0, 4).map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/45 p-3">
            <div className="truncate text-[9px] font-semibold text-slate-500">{metric.label}</div>
            <div className={`mt-1 truncate text-sm font-black ${metric.color ? "" : accentText[accent]}`} style={metric.color ? { color: metric.color } : undefined}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {chartRows.length > 0 && (
        <div className="mt-4 h-36 rounded-lg border border-slate-800 bg-slate-950/35 p-2">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={chartRows} layout="vertical" margin={{ left: 6, right: 8, top: 4, bottom: 4 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={72} tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString("th-TH", { maximumFractionDigits: 3 }), "ค่า"]}
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11, color: "#e2e8f0" }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {insight && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/35 p-3 text-[10px] leading-5 text-slate-300" data-testid="district-insight-text">
          {insight}
        </div>
      )}

      {provenance && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 p-3" data-testid="district-provenance">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-bold ${qualityClasses[provenance.quality]}`}>
              <Database className="h-3 w-3" />
              {getQualityLabel(provenance.quality)}
            </span>
            {provenance.methodologyId && (
              <span className="rounded-md border border-slate-800 px-2 py-1 text-[9px] font-mono text-slate-500">
                {provenance.methodologyId}
              </span>
            )}
          </div>
          <div className="mt-2 space-y-1 text-[9px] leading-4 text-slate-500">
            <p className="line-clamp-2">แหล่งข้อมูล: {provenance.sourceLabel || provenance.source}</p>
            {provenance.period && <p>ช่วงข้อมูล: {provenance.period}</p>}
            {provenance.generatedAt && <p>สร้างข้อมูล: {new Date(provenance.generatedAt).toLocaleString("th-TH")}</p>}
          </div>
          {(provenance.sourceNote || provenance.quality !== "observed" || (provenance.qualityFlags?.length ?? 0) > 0) && (
            <div className="mt-2 flex gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-[9px] leading-4 text-amber-100/80">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
              <p>
                {provenance.sourceNote || "ข้อมูลนี้มีข้อจำกัดด้านแหล่งที่มา/วิธีประมาณค่า ควรใช้ประกอบการตรวจสอบเพิ่มเติม"}
                {provenance.qualityFlags?.length ? ` · ${provenance.qualityFlags.join(" · ")}` : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
