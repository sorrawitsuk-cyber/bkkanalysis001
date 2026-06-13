/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Activity, Leaf, MapPin, Satellite } from "lucide-react";
import DataSourceBadge, { SceneWarning } from "@/components/ui/DataSourceBadge";
import SidebarFooter from "@/components/gee/SidebarFooter";
import SidebarSkeleton from "@/components/gee/SidebarSkeleton";

interface NdviSidebarProps {
  summary: any;
  rows: any[];
  loading: boolean;
  activeDistrict: string;
  onDistrictSelect: (district: string) => void;
  tileMetadata?: { sceneCount: number; lowSceneWarning: boolean; dataSource: string } | null;
}

function formatNdvi(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "ไม่มีข้อมูล";
}

export default function NdviSidebar({
  summary,
  rows,
  loading,
  activeDistrict,
  onDistrictSelect,
  tileMetadata,
}: NdviSidebarProps) {
  if (loading || !summary) return <SidebarSkeleton />;

  const ranked = [...rows]
    .filter((row) => typeof row.ndvi_mean === "number")
    .sort((a, b) => b.ndvi_mean - a.ndvi_mean);
  const weightedArea = ranked.reduce((sum, row) => sum + (row.district_area_rai ?? 0), 0);
  const weightedMean = weightedArea > 0
    ? ranked.reduce((sum, row) => sum + row.ndvi_mean * (row.district_area_rai ?? 0), 0) / weightedArea
    : null;
  const activeRow = activeDistrict === "ทั้งหมด"
    ? null
    : ranked.find((row) => row.name === activeDistrict) ?? null;
  const trend = summary?.yearlyTrend ?? [];
  const trendValues = trend.map((item: any) => Number(item[1])).filter(Number.isFinite);
  const trendMin = trendValues.length ? Math.min(...trendValues) : 0;
  const trendMax = trendValues.length ? Math.max(...trendValues) : 1;

  return (
    <div className="hidden h-full w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-800/60 bg-[#0f172a]/95 shadow-2xl xl:flex 2xl:w-80">
      <div className="sticky top-0 z-20 border-b border-slate-800/60 bg-[#0f172a]/98 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15">
            <Leaf className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">ดัชนีพืชพรรณ NDVI</h1>
            <p className="mt-1 text-[9px] text-slate-400">Vegetation condition · ไม่ใช่ Tree Cover</p>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-1 text-[9px] font-bold text-slate-500">
          <MapPin className="h-3 w-3" /> เลือกเขต
        </label>
        <select
          value={activeDistrict}
          onChange={(event) => onDistrictSelect(event.target.value)}
          className="mt-1.5 w-full rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500/50"
        >
          <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
          {ranked.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
        </select>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5">
        <DataSourceBadge
          dataSource={summary?.dataSource}
          dataQuality={summary?.dataQuality}
          sourceLabel={summary?.sourceLabel}
          sourceNote={summary?.sourceNote}
        />
        {tileMetadata && (
          <SceneWarning
            sceneCount={tileMetadata.sceneCount}
            lowSceneWarning={tileMetadata.lowSceneWarning}
            dataSource={tileMetadata.dataSource}
          />
        )}

        <div className="grid grid-cols-3 gap-2">
          {[
            [activeRow ? "NDVI เขต" : "เฉลี่ยถ่วงพื้นที่", formatNdvi(activeRow?.ndvi_mean ?? weightedMean)],
            [activeRow ? "ต่ำสุด" : "เขตเฉลี่ยสูงสุด", activeRow ? formatNdvi(activeRow.ndvi_min) : formatNdvi(ranked[0]?.ndvi_mean)],
            [activeRow ? "สูงสุด" : "เขตเฉลี่ยต่ำสุด", activeRow ? formatNdvi(activeRow.ndvi_max) : formatNdvi(ranked[ranked.length - 1]?.ndvi_mean)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/55 p-2.5">
              <div className="min-h-[22px] text-[8px] leading-tight text-slate-500">{label}</div>
              <div className="mt-1 font-mono text-sm font-bold text-emerald-300">{value}</div>
            </div>
          ))}
        </div>

        <section className="border-t border-slate-800/70 pt-5">
          <h2 className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
            <Activity className="h-3 w-3" /> แนวโน้มค่าเฉลี่ยรายปี
          </h2>
          <div className="mt-3 flex h-20 items-end gap-1">
            {trend.map(([year, value]: [string, number]) => {
              const height = ((value - trendMin) / (trendMax - trendMin || 1)) * 85 + 15;
              return (
                <div key={year} className="group relative flex h-full flex-1 items-end">
                  <div className="w-full rounded-t-sm bg-emerald-500/80" style={{ height: `${height}%` }} />
                  <div className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded bg-slate-800 px-1.5 py-1 font-mono text-[8px] text-white opacity-0 group-hover:opacity-100">
                    {year}: {formatNdvi(value)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[8px] text-slate-600">
            <span>{trend[0]?.[0]}</span><span>{trend[trend.length - 1]?.[0]}</span>
          </div>
        </section>

        <section className="border-t border-slate-800/70 pt-5">
          <h2 className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
            <Satellite className="h-3 w-3" /> อันดับ NDVI เฉลี่ยรายเขต
          </h2>
          <div className="mt-3 space-y-2">
            {ranked.slice(0, 10).map((row, index) => (
              <button
                key={row.name}
                type="button"
                onClick={() => onDistrictSelect(activeDistrict === row.name ? "ทั้งหมด" : row.name)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="w-4 text-right font-mono text-[9px] text-slate-600">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{row.name}</span>
                <span className="font-mono text-[10px] font-bold text-emerald-300">{formatNdvi(row.ndvi_mean)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <SidebarFooter exclude={["ndvi"]} />
    </div>
  );
}
