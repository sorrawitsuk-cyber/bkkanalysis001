/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Clock3,
  Layers,
  MapPin,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import Sidebar from "@/components/Sidebar";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import InteractiveDistrictPanel from "@/components/map/InteractiveDistrictPanel";
import { buildProvenance, getPolicySafeInsight } from "@/lib/data-provenance";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const ALL = "ทั้งหมด";
const STATE_COLORS: Record<string, string> = {
  รอรับเรื่อง: "#ef4444",
  กำลังดำเนินการ: "#eab308",
  ส่งต่อ: "#f97316",
  เสร็จสิ้น: "#22c55e",
};

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof MapPin;
  color: string;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className={`mt-2 text-2xl font-black tabular-nums ${color}`}>{value}</div>
      <p className="mt-1 text-[10px] leading-5 text-slate-500">{note}</p>
    </section>
  );
}

export default function TraffyPage() {
  const [view, setView] = useState<ViewMode>("map");
  const [activeTag, setActiveTag] = useState(ALL);
  const [activeDistrict, setActiveDistrict] = useState(ALL);
  const [activeCategory, setActiveCategory] = useState(ALL);
  const [activeDistrictGroup, setActiveDistrictGroup] = useState(ALL);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [traffyData, setTraffyData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<"points" | "heatmap">("points");
  const [districtSortAscending, setDistrictSortAscending] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ limit: "5000" });
    if (activeDistrict !== ALL) params.append("district", activeDistrict);
    if (activeCategory !== ALL) params.append("category", activeCategory);
    if (activeDistrictGroup !== ALL) params.append("district_group", activeDistrictGroup);
    if (activeYear) params.append("year", activeYear);
    if (activeMonth !== null) params.append("month", String(activeMonth));

    fetch(`/api/traffy?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `โหลดข้อมูลไม่สำเร็จ (${response.status})`);
        }
        return data;
      })
      .then((data) => {
        setTraffyData(data.geojson);
        setSummary(data.summary);
        setDataSource(data.source || "unknown");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setTraffyData(null);
        setSummary(null);
        setDataSource("");
        setLoadError(error instanceof Error ? error.message : "โหลดข้อมูล Traffy ไม่สำเร็จ");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [activeCategory, activeDistrict, activeDistrictGroup, activeMonth, activeYear]);

  const districtRows = useMemo(
    () =>
      (summary?.byDistrict ?? [])
        .filter(([name]: [string, number]) => name && name !== "ไม่ระบุ")
        .map(([district_name, count]: [string, number]) => ({ district_name, count }))
        .sort((a: any, b: any) =>
          districtSortAscending ? a.count - b.count : b.count - a.count,
        ),
    [districtSortAscending, summary?.byDistrict],
  );
  const categoryRows = useMemo(
    () =>
      (summary?.byType ?? []).slice(0, 12).map(([name, count]: [string, number]) => ({
        name,
        count,
      })),
    [summary?.byType],
  );
  const stateRows = useMemo(
    () =>
      Object.entries(summary?.byState ?? {})
        .filter(([name]) => name !== ALL)
        .map(([name, count]) => ({ name, count: Number(count) })),
    [summary?.byState],
  );
  const districtSummaryRecords = useMemo(
    () => districtRows.map((row: any) => ({ ...row })),
    [districtRows],
  );

  const resolvedCount = Number(summary?.byState?.["เสร็จสิ้น"] ?? 0);
  const totalCount = Number(summary?.totalApi ?? 0);
  const resolutionRate = totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0;
  const filterSummary = [
    activeDistrict !== ALL ? `เขต${activeDistrict}` : "ทุกเขต",
    activeCategory !== ALL ? activeCategory : "ทุกประเภท",
    activeYear ? `${activeMonth ? `เดือน ${activeMonth} · ` : ""}ปี ${activeYear}` : "ทุกช่วงเวลา",
  ].join(" · ");
  const activeDistrictRow = activeDistrict === ALL
    ? null
    : districtRows.find((row: any) => row.district_name === activeDistrict) ?? null;
  const selectedDistrictCount = activeDistrict === ALL ? totalCount : activeDistrictRow?.count ?? null;
  const panelProvenance = buildProvenance({
    source: dataSource === "bigquery" ? "Traffy Fondue ผ่าน BigQuery" : dataSource || "Traffy Fondue",
    period: filterSummary,
    methodologyId: "traffy-complaints-v1",
    fallbackQuality: loadError ? "unavailable" : "observed",
    qualityFlags: [
      `แสดงพิกัดสูงสุด ${Number(summary?.totalFetched ?? 0).toLocaleString("th-TH")} จุด`,
      activeCategory !== ALL && `กรองประเภท ${activeCategory}`,
    ],
  });
  const panelInsight = getPolicySafeInsight({
    selected: activeDistrict !== ALL,
    title: activeDistrict,
    metricLabel: "จำนวนเรื่องร้องเรียน",
    primaryValue: selectedDistrictCount,
    averageValue: activeDistrict === ALL ? null : totalCount,
    higherIsConcern: true,
    provenance: panelProvenance,
  });

  function handleYearSelect(year: string | null) {
    setActiveYear(year);
    setActiveMonth(null);
  }

  function handleMonthSelect(year: string, month: number | null) {
    setActiveYear(year);
    setActiveMonth(month);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 font-sans text-slate-50">
      {view !== "guide" && (
        <div className="hidden h-full lg:block">
          <Sidebar
            onTagSelect={setActiveTag}
            activeTag={activeTag}
            onDistrictSelect={setActiveDistrict}
            activeDistrict={activeDistrict}
            onCategorySelect={setActiveCategory}
            activeCategory={activeCategory}
            onDistrictGroupSelect={setActiveDistrictGroup}
            activeDistrictGroup={activeDistrictGroup}
            activeYear={activeYear}
            activeMonth={activeMonth}
            onYearSelect={handleYearSelect}
            onMonthSelect={handleMonthSelect}
            traffyData={traffyData}
            summary={summary}
            loading={loading}
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-800 p-2 text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            aria-label="กลับหน้าหลัก"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black">ปัญหาเมืองจาก Traffy Fondue</h1>
            <p className="truncate text-[10px] text-slate-500">{filterSummary}</p>
          </div>
          <div className="ml-auto">
            <ViewTabs view={view} onChange={setView} accentColor="orange" />
          </div>
          {view !== "guide" && (
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[10px] font-bold text-slate-300 lg:hidden"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              ตัวกรอง
            </button>
          )}
        </header>

        {loadError && view !== "guide" && (
          <div className="flex items-start gap-2 border-b border-amber-700/40 bg-amber-950/35 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="text-xs font-bold text-amber-200">ยังโหลดข้อมูล Traffy ไม่ได้</p>
              <p className="mt-1 text-[10px] text-amber-100/70">{loadError}</p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {view === "map" && (
            <div className="relative h-full">
              <ErrorBoundary>
                <MapView
                  activeTag={activeTag}
                  activeDistrict={activeDistrict}
                  traffyData={traffyData}
                  mapMode={mapMode}
                  onDistrictSelect={setActiveDistrict}
                />
              </ErrorBoundary>

              <div className="absolute left-4 top-4 z-[1000] hidden w-80 xl:block">
                <InteractiveDistrictPanel
                  accent="orange"
                  selected={activeDistrict !== ALL}
                  title={activeDistrict !== ALL ? activeDistrict : "เลือกเขตบนแผนที่"}
                  subtitle={activeDistrict !== ALL ? "สรุปเรื่องร้องเรียนของเขตที่คลิก" : "คลิก boundary เขตเพื่อกรองจุดและ heatmap"}
                  onClear={() => setActiveDistrict(ALL)}
                  metrics={[
                    { label: "เรื่องร้องเรียน", value: selectedDistrictCount?.toLocaleString("th-TH") ?? "ไม่มีข้อมูลเขต", rawValue: selectedDistrictCount, color: "#f97316" },
                    { label: "ปิดเรื่องแล้ว", value: `${resolutionRate.toFixed(1)}%`, rawValue: resolutionRate, color: "#22c55e" },
                    { label: "จุดบนแผนที่", value: Number(summary?.totalFetched ?? 0).toLocaleString("th-TH"), rawValue: Number(summary?.totalFetched ?? 0), color: "#38bdf8" },
                    { label: "ประเภทสูงสุด", value: categoryRows[0]?.count?.toLocaleString("th-TH") ?? "ไม่มีข้อมูล", rawValue: categoryRows[0]?.count, color: "#facc15" },
                  ]}
                  provenance={panelProvenance}
                  insight={panelInsight}
                />
              </div>

              {activeDistrict !== ALL && (
                <div className="absolute inset-x-3 bottom-3 z-[1000] max-h-[48vh] overflow-y-auto md:left-4 md:right-auto md:w-80 xl:hidden">
                  <InteractiveDistrictPanel
                    accent="orange"
                    selected
                    title={activeDistrict}
                    subtitle="สรุปเรื่องร้องเรียนของเขตที่คลิก"
                    onClear={() => setActiveDistrict(ALL)}
                    metrics={[
                      { label: "เรื่องร้องเรียน", value: selectedDistrictCount?.toLocaleString("th-TH") ?? "ไม่มีข้อมูลเขต", rawValue: selectedDistrictCount, color: "#f97316" },
                      { label: "ปิดเรื่องแล้ว", value: `${resolutionRate.toFixed(1)}%`, rawValue: resolutionRate, color: "#22c55e" },
                      { label: "จุดบนแผนที่", value: Number(summary?.totalFetched ?? 0).toLocaleString("th-TH"), rawValue: Number(summary?.totalFetched ?? 0), color: "#38bdf8" },
                      { label: "ประเภทสูงสุด", value: categoryRows[0]?.count?.toLocaleString("th-TH") ?? "ไม่มีข้อมูล", rawValue: categoryRows[0]?.count, color: "#facc15" },
                    ]}
                    provenance={panelProvenance}
                    insight={panelInsight}
                  />
                </div>
              )}

              <div className="absolute right-4 top-4 z-[1000] w-56 rounded-xl border border-slate-700 bg-slate-900/95 p-3">
                <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <Layers className="h-3.5 w-3.5" /> รูปแบบแผนที่
                </h2>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {[
                    ["points", "จุดเรื่องร้องเรียน"],
                    ["heatmap", "ความหนาแน่น"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMapMode(mode as "points" | "heatmap")}
                      className={`rounded-lg px-2 py-2 text-[10px] font-bold transition-colors ${
                        mapMode === mode
                          ? "bg-orange-500 text-slate-950"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 border-t border-slate-800 pt-3">
                  {stateRows.map((row) => (
                    <div key={row.name} className="mb-1.5 flex items-center gap-2 text-[10px] last:mb-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: STATE_COLORS[row.name] ?? "#64748b" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-slate-300">{row.name}</span>
                      <span className="tabular-nums text-slate-500">{row.count.toLocaleString("th-TH")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "stats" && (
            <div className="h-full overflow-y-auto p-4 md:p-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label="เรื่องร้องเรียนตามตัวกรอง"
                  value={loading ? "..." : totalCount.toLocaleString("th-TH")}
                  note={`แสดงพิกัดบนแผนที่ ${Number(summary?.totalFetched ?? 0).toLocaleString("th-TH")} จุด`}
                  icon={CircleDot}
                  color="text-orange-300"
                />
                <SummaryCard
                  label="ดำเนินการเสร็จสิ้น"
                  value={loading ? "..." : `${resolutionRate.toFixed(1)}%`}
                  note={`${resolvedCount.toLocaleString("th-TH")} เรื่องจากข้อมูลที่เลือก`}
                  icon={CheckCircle2}
                  color="text-emerald-300"
                />
                <SummaryCard
                  label="ประเภทที่พบมากที่สุด"
                  value={categoryRows[0]?.count?.toLocaleString("th-TH") ?? "ไม่มีข้อมูล"}
                  note={categoryRows[0]?.name ?? "ยังไม่มีประเภทปัญหา"}
                  icon={BarChart3}
                  color="text-cyan-300"
                />
                <SummaryCard
                  label="เขตที่พบมากที่สุด"
                  value={districtRows[0]?.count?.toLocaleString("th-TH") ?? "ไม่มีข้อมูล"}
                  note={districtRows[0]?.district_name ?? "ยังไม่มีข้อมูลรายเขต"}
                  icon={MapPin}
                  color="text-indigo-300"
                />
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                  <h2 className="text-sm font-black">ประเภทปัญหาที่พบบ่อย</h2>
                  <p className="mt-1 text-[10px] text-slate-500">คลิกแท่งเพื่อใช้เป็นตัวกรอง และคลิกซ้ำเพื่อล้าง</p>
                  <div className="mt-4 h-[360px] min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryRows} layout="vertical" margin={{ left: 28, right: 18 }}>
                        <CartesianGrid stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} />
                        <YAxis type="category" dataKey="name" width={105} tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <Tooltip
                          cursor={{ fill: "#1e293b", opacity: 0.35 }}
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[0, 4, 4, 0]}
                          onClick={(row: any) => setActiveCategory(activeCategory === row.name ? ALL : row.name)}
                          className="cursor-pointer"
                        >
                          {categoryRows.map((row: any) => (
                            <Cell
                              key={row.name}
                              fill={activeCategory === ALL || activeCategory === row.name ? "#f97316" : "#475569"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                  <h2 className="text-sm font-black">สถานะการดำเนินงาน</h2>
                  <p className="mt-1 text-[10px] text-slate-500">เลือกสถานะเพื่อกลับไปตรวจตำแหน่งบนแผนที่</p>
                  <div className="mt-4 space-y-3">
                    {stateRows.map((row) => {
                      const pct = totalCount > 0 ? (row.count / totalCount) * 100 : 0;
                      return (
                        <button
                          key={row.name}
                          type="button"
                          onClick={() => {
                            setActiveTag(activeTag === row.name ? ALL : row.name);
                            setView("map");
                          }}
                          className="w-full rounded-lg border border-slate-800 bg-slate-950/45 p-3 text-left transition-colors hover:border-slate-600"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: STATE_COLORS[row.name] ?? "#64748b" }}
                            />
                            <span className="flex-1 text-xs font-bold text-slate-300">{row.name}</span>
                            <span className="text-xs font-black tabular-nums">{row.count.toLocaleString("th-TH")}</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: STATE_COLORS[row.name] ?? "#64748b",
                              }}
                            />
                          </div>
                          <p className="mt-1 text-right text-[9px] text-slate-500">{pct.toFixed(1)}%</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}

          {view === "table" && (
            <div className="h-full overflow-auto p-4 md:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black">จำนวนเรื่องร้องเรียนรายเขต</h2>
                  <p className="mt-1 text-[10px] text-slate-500">เลือกแถวเพื่อกรองเขตและกลับไปสำรวจบนแผนที่</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDistrictSortAscending((value) => !value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-bold text-slate-300 hover:border-slate-500"
                >
                  เรียง {districtSortAscending ? "น้อยไปมาก" : "มากไปน้อย"}
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-[10px] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">อันดับ</th>
                      <th className="px-4 py-3">เขต</th>
                      <th className="px-4 py-3 text-right">จำนวนเรื่อง</th>
                      <th className="px-4 py-3 text-right">สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {districtRows.map((row: any, index: number) => (
                      <tr
                        key={row.district_name}
                        onClick={() => {
                          setActiveDistrict(row.district_name);
                          setView("map");
                        }}
                        className="cursor-pointer border-t border-slate-800 bg-slate-950/35 transition-colors hover:bg-slate-900"
                      >
                        <td className="px-4 py-3 text-slate-600">{index + 1}</td>
                        <td className="px-4 py-3 font-bold text-slate-200">เขต{row.district_name}</td>
                        <td className="px-4 py-3 text-right font-black tabular-nums text-orange-300">
                          {row.count.toLocaleString("th-TH")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                          {totalCount > 0 ? `${((row.count / totalCount) * 100).toFixed(1)}%` : "ไม่มีข้อมูล"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "guide" && (
            <PlainLanguageGuide
              module="traffy"
              accent="orange"
              records={districtSummaryRecords}
              metricKey="count"
              metricLabel="จำนวนเรื่องร้องเรียน"
              unit="เรื่อง"
              decimals={0}
              nameKey="district_name"
              year={activeYear ? Number(activeYear) : new Date().getFullYear()}
              activeArea={activeDistrict}
              dataSource={dataSource === "bigquery" ? "Traffy Fondue ผ่าน BigQuery" : dataSource}
              dataQuality={loadError ? "แหล่งข้อมูลยังไม่พร้อม" : "ข้อมูลรายการร้องเรียน"}
              extraSummary={[
                `ข้อมูลตามตัวกรองมีทั้งหมด ${totalCount.toLocaleString("th-TH")} เรื่อง และมีพิกัดสำหรับแสดงบนแผนที่ ${Number(summary?.totalFetched ?? 0).toLocaleString("th-TH")} จุด`,
                `อัตราเรื่องที่มีสถานะเสร็จสิ้นตามข้อมูลชุดนี้อยู่ที่ ${resolutionRate.toFixed(1)}% ควรอ่านร่วมกับช่วงเวลาและประเภทปัญหาที่เลือก`,
              ]}
            />
          )}
        </div>

        {view !== "guide" && (
          <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 bg-slate-950 px-4 py-2 text-[9px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-3 w-3" /> ตัวกรองปัจจุบัน: {filterSummary}
            </span>
            <span>แหล่งข้อมูล: {dataSource === "bigquery" ? "BigQuery" : dataSource || "กำลังตรวจสอบ"}</span>
          </footer>
        )}
      </main>

      {mobileFiltersOpen && view !== "guide" && (
        <div className="fixed inset-0 z-[2000] lg:hidden" role="dialog" aria-modal="true" aria-label="ตัวกรองข้อมูล Traffy">
          <button
            type="button"
            aria-label="ปิดแผงตัวกรอง"
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute inset-0 bg-slate-950/80"
          />
          <div className="absolute inset-y-0 left-0 w-[min(340px,90vw)]">
            <Sidebar
              onTagSelect={setActiveTag}
              activeTag={activeTag}
              onDistrictSelect={(district) => {
                setActiveDistrict(district);
                setMobileFiltersOpen(false);
              }}
              activeDistrict={activeDistrict}
              onCategorySelect={setActiveCategory}
              activeCategory={activeCategory}
              onDistrictGroupSelect={setActiveDistrictGroup}
              activeDistrictGroup={activeDistrictGroup}
              activeYear={activeYear}
              activeMonth={activeMonth}
              onYearSelect={handleYearSelect}
              onMonthSelect={handleMonthSelect}
              traffyData={traffyData}
              summary={summary}
              loading={loading}
            />
            <button
              type="button"
              aria-label="ปิดตัวกรอง"
              onClick={() => setMobileFiltersOpen(false)}
              className="absolute right-3 top-3 rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
