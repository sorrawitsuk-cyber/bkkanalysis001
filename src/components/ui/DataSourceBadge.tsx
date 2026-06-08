"use client";

import { Database, Globe, AlertTriangle, CheckCircle2 } from "lucide-react";

interface DataSourceBadgeProps {
  /** "supabase district_statistics" | "local fallback (mock)" | "no district_statistics rows" | other */
  dataSource?: string | null;
  className?: string;
}

export default function DataSourceBadge({ dataSource, className = "" }: DataSourceBadgeProps) {
  if (!dataSource) return null;

  // "local fallback (mock)" → truly fake data (LST fallback)
  const isMock = dataSource.includes("mock") || dataSource.includes("fallback");
  // "no district_statistics rows" → DB exists but metric not yet seeded
  const isNoDbData = dataSource.includes("no district_statistics") || dataSource === "no district_statistics rows";

  if (isNoDbData) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest ${className}`}>
        <Database className="h-3 w-3 shrink-0" />
        <span>สถิติยังไม่ถูกประมวลผล</span>
      </div>
    );
  }

  if (isMock) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-700/50 bg-amber-950/40 px-2.5 py-1 text-[9px] font-bold text-amber-400 uppercase tracking-widest ${className}`}>
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span>ข้อมูลจำลอง</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-1 text-[9px] font-bold text-emerald-400 uppercase tracking-widest ${className}`}>
      <CheckCircle2 className="h-3 w-3 shrink-0" />
      <span>ข้อมูลจริง</span>
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
