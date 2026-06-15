"use client";

import { RefreshCw, Users } from "lucide-react";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import SidebarFooter from "@/components/gee/SidebarFooter";
import {
  POPULATION_MAX_YEAR,
  POPULATION_MIN_YEAR,
  formatPopulation,
  formatPopulationPercent,
  type PopulationLevel,
  type PopulationMetric,
  type PopulationResponse,
  type PopulationRow,
} from "@/lib/population";

interface PopulationSidebarProps {
  year: number;
  level: PopulationLevel;
  metric: PopulationMetric;
  districtFilter: string;
  districtNames: string[];
  ranked: PopulationRow[];
  activeId: number | null;
  data: PopulationResponse | null;
  loading: boolean;
  onYearChange: (year: number) => void;
  onLevelChange: (level: PopulationLevel) => void;
  onMetricChange: (metric: PopulationMetric) => void;
  onDistrictChange: (district: string) => void;
  onSelectRow: (row: PopulationRow) => void;
  onReload: () => void;
}

const METRICS: Array<{ value: PopulationMetric; label: string }> = [
  { value: "population", label: "จำนวนประชากร" },
  { value: "density", label: "ความหนาแน่น" },
  { value: "change_pct", label: "เปลี่ยนจากปีก่อน" },
  { value: "houses", label: "จำนวนบ้าน" },
  { value: "exposure_score", label: "แรงกดดันประชากร" },
];

const controlClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40";

export default function PopulationSidebar({
  year,
  level,
  metric,
  districtFilter,
  districtNames,
  ranked,
  activeId,
  data,
  loading,
  onYearChange,
  onLevelChange,
  onMetricChange,
  onDistrictChange,
  onSelectRow,
  onReload,
}: PopulationSidebarProps) {
  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col border-r border-slate-800 bg-[#0c1424] md:flex">
      <div className="border-b border-slate-800 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10">
            <Users className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100">ข้อมูลประชากร</h1>
            <p className="mt-0.5 text-[10px] text-slate-500">ตั้งค่าพื้นที่และตัวชี้วัด</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <label className="block text-[10px] font-medium text-slate-400">
            ปีข้อมูล
            <select value={year} onChange={(event) => onYearChange(Number(event.target.value))} className={controlClass}>
              {Array.from(
                { length: POPULATION_MAX_YEAR - POPULATION_MIN_YEAR + 1 },
                (_, index) => POPULATION_MAX_YEAR - index,
              ).map((option) => (
                <option key={option} value={option}>{option + 543} ({option})</option>
              ))}
            </select>
          </label>

          <label className="block text-[10px] font-medium text-slate-400">
            ระดับพื้นที่
            <select value={level} onChange={(event) => onLevelChange(event.target.value as PopulationLevel)} className={controlClass}>
              <option value="district">เขต (50)</option>
              <option value="subdistrict">แขวง (180)</option>
            </select>
          </label>

          <label className="block text-[10px] font-medium text-slate-400">
            ตัวชี้วัด
            <select value={metric} onChange={(event) => onMetricChange(event.target.value as PopulationMetric)} className={controlClass}>
              {METRICS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="block text-[10px] font-medium text-slate-400">
            กรองเขต
            <select
              disabled={level === "district"}
              value={districtFilter}
              onChange={(event) => onDistrictChange(event.target.value)}
              className={controlClass}
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {districtNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>

          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            โหลดข้อมูลใหม่
          </button>
        </section>

        {data && (
          <>
            <DataSourceBadge
              dataSource={data.summary.source}
              dataQuality="observed"
              sourceLabel={`${data.summary.source} · ธันวาคม ${year + 543}`}
              sourceNote="จำนวนประชากรตามทะเบียนราษฎร"
            />

            <section>
              <h2 className="text-[10px] font-bold text-slate-300">
                อันดับ {METRICS.find((item) => item.value === metric)?.label}
              </h2>
              <div className="mt-2 space-y-1">
                {ranked.map((row, index) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onSelectRow(row)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                      activeId === row.id
                        ? "bg-indigo-500/15 text-white"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
                    }`}
                  >
                    <span className="w-5 text-center text-[9px] font-bold text-slate-600">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[10px]">{row.name}</span>
                    <span className="text-[10px] font-bold tabular-nums text-indigo-300">
                      {metric === "change_pct"
                        ? formatPopulationPercent(row.change_pct)
                        : metric === "exposure_score"
                          ? `${row.exposure_score.toFixed(1)}/100`
                        : formatPopulation(Number(row[metric]))}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <SidebarFooter exclude={["population"]} />
    </aside>
  );
}
