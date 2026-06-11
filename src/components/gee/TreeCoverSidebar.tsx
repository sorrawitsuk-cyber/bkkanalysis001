"use client";

import { AlertTriangle, MapPin, Trees } from "lucide-react";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import SidebarFooter from "@/components/gee/SidebarFooter";
import SidebarSkeleton from "@/components/gee/SidebarSkeleton";
import {
  formatTreeChange,
  formatTreePercent,
  formatTreeRai,
  type TreeCoverResponse,
} from "@/lib/tree-cover";

interface TreeCoverSidebarProps {
  data: TreeCoverResponse | null;
  loading: boolean;
  activeDistrict: string;
  mode: "cover" | "change";
  onDistrictSelect: (district: string) => void;
  onModeChange: (mode: "cover" | "change") => void;
}

const ALL_DISTRICTS = "ทั้งหมด";

export default function TreeCoverSidebar({
  data,
  loading,
  activeDistrict,
  mode,
  onDistrictSelect,
  onModeChange,
}: TreeCoverSidebarProps) {
  if (loading || !data) return <SidebarSkeleton />;
  const activeRow = activeDistrict === ALL_DISTRICTS
    ? null
    : data.rows.find((row) => row.district_name === activeDistrict) ?? null;
  const displayCover = activeRow?.tree_cover_pct ?? data.summary.treeCoverPct;
  const displayArea = activeRow?.tree_cover_rai ?? data.summary.treeCoverRai;
  const displayChange = activeRow?.tree_cover_change_pp ?? data.summary.treeCoverChangePp;
  const ranking = [...data.rows].sort((a, b) => mode === "cover"
    ? (b.tree_cover_pct ?? -1) - (a.tree_cover_pct ?? -1)
    : (b.tree_cover_change_pp ?? -999) - (a.tree_cover_change_pp ?? -999));

  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col border-r border-slate-800 bg-[#0c1424] md:flex">
      <div className="border-b border-slate-800 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <Trees className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">เรือนยอดไม้ในเมือง</h1>
            <p className="mt-0.5 text-[10px] text-slate-500">Bangkok Tree Cover</p>
          </div>
        </div>
        <DataSourceBadge
          dataSource={data.summary.source}
          dataQuality={data.summary.dataQuality}
          sourceLabel={`${data.summary.source} · ${data.period.currentLabel}`}
          sourceNote="Dynamic World class: trees · ความละเอียด 10 เมตร"
          className="mt-4"
        />
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-[9px] leading-relaxed text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ผลจำแนกจากดาวเทียม ไม่ใช่ทะเบียนต้นไม้รายต้น และอาจคลาดเคลื่อนบริเวณเงาอาคาร พุ่มไม้ หรือแปลงขนาดเล็ก
        </div>
        <label className="mt-4 block text-[10px] font-medium text-slate-400">
          พื้นที่
          <select
            value={activeDistrict}
            onChange={(event) => onDistrictSelect(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
          >
            <option value={ALL_DISTRICTS}>กรุงเทพมหานคร (ทั้งหมด)</option>
            {data.rows.map((row) => <option key={row.district_id} value={row.district_name}>{row.district_name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-slate-900/70 p-3">
            <div className="text-[9px] text-slate-500">สัดส่วน Tree Cover</div>
            <div className="mt-1 text-xl font-black text-emerald-300">{formatTreePercent(displayCover)}</div>
          </div>
          <div className="rounded-lg bg-slate-900/70 p-3">
            <div className="text-[9px] text-slate-500">พื้นที่เรือนยอดไม้</div>
            <div className="mt-1 text-sm font-black text-emerald-200">{formatTreeRai(displayArea)}</div>
          </div>
          <div className="col-span-2 rounded-lg bg-slate-900/70 p-3">
            <div className="text-[9px] text-slate-500">เปลี่ยนจากปี {data.period.baselineYear}</div>
            <div className={`mt-1 text-lg font-black ${(displayChange ?? 0) >= 0 ? "text-green-300" : "text-red-300"}`}>
              {formatTreeChange(displayChange)}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex rounded-lg bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => onModeChange("cover")}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold ${mode === "cover" ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-200"}`}
            >
              Tree Cover
            </button>
            <button
              type="button"
              onClick={() => onModeChange("change")}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold ${mode === "change" ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-200"}`}
            >
              การเปลี่ยนแปลง
            </button>
          </div>
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
            อันดับรายเขต
          </h2>
          <div className="mt-2 space-y-1">
            {ranking.slice(0, 15).map((row, index) => (
              <button
                type="button"
                key={row.district_id}
                onClick={() => onDistrictSelect(activeDistrict === row.district_name ? ALL_DISTRICTS : row.district_name)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                  activeDistrict === row.district_name
                    ? "bg-emerald-500/15 text-white"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
                }`}
              >
                <span className="w-5 text-center text-[9px] text-slate-600">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[10px]">{row.district_name}</span>
                <span className={`text-[10px] font-bold tabular-nums ${
                  mode === "change" && (row.tree_cover_change_pp ?? 0) < 0 ? "text-red-300" : "text-emerald-300"
                }`}>
                  {mode === "cover" ? formatTreePercent(row.tree_cover_pct) : formatTreeChange(row.tree_cover_change_pp)}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <SidebarFooter exclude={["green-space"]} />
    </aside>
  );
}
