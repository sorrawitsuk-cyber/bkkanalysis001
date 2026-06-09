"use client";

import { Database, Globe, AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";

interface DataSourceBadgeProps {
  dataSource?: string | null;
  dataQuality?: "observed" | "estimated" | "modeled" | "unavailable" | "unknown" | null;
  sourceLabel?: string | null;
  sourceNote?: string | null;
  className?: string;
}

function inferQuality(dataSource?: string | null): NonNullable<DataSourceBadgeProps["dataQuality"]> {
  const source = (dataSource || "").toLowerCase();
  if (!source || source.includes("no data") || source.includes("ไม่มีข้อมูล") || source.includes("no district_statistics")) {
    return "unavailable";
  }
  if (source.includes("modeled") || source.includes("modelled") || source.includes("แบบจำลอง")) {
    return "modeled";
  }
  if (source.includes("seeded estimate") || source.includes("estimate") || source.includes("ประมาณ")) {
    return "estimated";
  }
  if (source.includes("mock") || source.includes("fallback") || source.includes("demo")) {
    return "modeled";
  }
  if (
    source.includes("gee") ||
    source.includes("sentinel") ||
    source.includes("landsat") ||
    source.includes("viirs") ||
    source.includes("bigquery") ||
    source.includes("r2 cache")
  ) {
    return "observed";
  }
  return "unknown";
}

export default function DataSourceBadge({
  dataSource,
  dataQuality,
  sourceLabel,
  sourceNote,
  className = "",
}: DataSourceBadgeProps) {
  if (!dataSource && !dataQuality) return null;

  const quality = dataQuality || inferQuality(dataSource);
  const config = {
    observed: {
      icon: CheckCircle2,
      label: "ข้อมูลจากการสังเกต",
      style: "border-emerald-800/40 bg-emerald-950/30 text-emerald-400",
    },
    estimated: {
      icon: AlertTriangle,
      label: "ข้อมูลประมาณการ",
      style: "border-amber-700/50 bg-amber-950/40 text-amber-300",
    },
    modeled: {
      icon: FlaskConical,
      label: "ข้อมูลแบบจำลอง",
      style: "border-violet-700/50 bg-violet-950/40 text-violet-300",
    },
    unavailable: {
      icon: Database,
      label: "ยังไม่มีข้อมูล",
      style: "border-slate-700/50 bg-slate-800/40 text-slate-400",
    },
    unknown: {
      icon: AlertTriangle,
      label: "ยังไม่ยืนยันแหล่งข้อมูล",
      style: "border-orange-700/50 bg-orange-950/30 text-orange-300",
    },
  }[quality];
  const Icon = config.icon;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className={`inline-flex w-fit items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${config.style}`}>
        <Icon className="h-3 w-3 shrink-0" />
        <span>{config.label}</span>
      </div>
      {(sourceLabel || sourceNote) && (
        <p className="text-[9px] leading-snug text-slate-500">
          {sourceLabel && <span className="font-semibold text-slate-400">{sourceLabel}</span>}
          {sourceLabel && sourceNote ? " · " : ""}
          {sourceNote}
        </p>
      )}
    </div>
  );
}

interface SceneWarningProps {
  sceneCount: number;
  lowSceneWarning: boolean;
  dataSource?: string;
  className?: string;
}

export function SceneWarning({ sceneCount, lowSceneWarning, dataSource, className = "" }: SceneWarningProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {lowSceneWarning && (
        <div className="flex items-start gap-1.5 rounded-lg border border-amber-700/50 bg-amber-950/40 px-2.5 py-1.5 text-[9px] text-amber-300 leading-snug">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-400" />
          <span>ภาพดาวเทียมน้อย ({sceneCount} ภาพ) — ผลลัพธ์อาจไม่สมบูรณ์สำหรับปีนี้</span>
        </div>
      )}
      {dataSource && dataSource.includes("1,000m") && (
        <div className="flex items-start gap-1.5 rounded-lg border border-blue-700/40 bg-blue-950/30 px-2.5 py-1.5 text-[9px] text-blue-300 leading-snug">
          <Globe className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
          <span>ข้อมูลมลพิษจากดาวเทียม — ใช้เปรียบเทียบภาพรวม ไม่ใช่ระดับรายถนน</span>
        </div>
      )}
      {sceneCount >= 0 && !lowSceneWarning && (
        <div className="flex items-center gap-1 text-[9px] text-slate-500">
          <Database className="h-2.5 w-2.5" />
          <span>{sceneCount} ภาพดาวเทียม</span>
        </div>
      )}
    </div>
  );
}
