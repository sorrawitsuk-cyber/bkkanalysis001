/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Building,
  MapPin,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  ShieldAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import MapSkeleton from "@/components/ui/MapSkeleton";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import PopulationSidebar from "@/components/population/PopulationSidebar";
import InteractiveDistrictPanel from "@/components/map/InteractiveDistrictPanel";
import { buildProvenance, getPolicySafeInsight } from "@/lib/data-provenance";
import {
  POPULATION_MAX_YEAR,
  POPULATION_MIN_YEAR,
  formatPopulation,
  formatPopulationPercent,
  populationColor,
  type PopulationLevel,
  type PopulationMetric,
  type PopulationResponse,
  type PopulationRow,
} from "@/lib/population";

const PopulationMap = dynamic(() => import("@/components/map/PopulationMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const METRICS: Array<{ value: PopulationMetric; label: string }> = [
  { value: "population", label: "จำนวนประชากร" },
  { value: "density", label: "ความหนาแน่น" },
  { value: "change_pct", label: "เปลี่ยนจากปีก่อน" },
  { value: "houses", label: "จำนวนบ้าน" },
  { value: "exposure_score", label: "แรงกดดันประชากร" },
];

const TABLE_COLUMNS: ColDef[] = [
  { key: "name", label: "พื้นที่", sortable: true },
  { key: "district", label: "เขตแม่", sortable: true, hideable: true },
  { key: "population", label: "ประชากร", unit: "คน", format: formatPopulation, heatmap: true, heatmapHex: "#6366f1" },
  { key: "change_pct", label: "เปลี่ยนจากปีก่อน", unit: "%", format: formatPopulationPercent, heatmap: true, heatmapHex: "#22c55e" },
  { key: "density", label: "ความหนาแน่น", unit: "คน/ตร.กม.", format: formatPopulation, heatmap: true, heatmapHex: "#8b5cf6" },
  { key: "male", label: "ชาย", unit: "คน", format: formatPopulation, hideable: true },
  { key: "female", label: "หญิง", unit: "คน", format: formatPopulation, hideable: true },
  { key: "houses", label: "บ้าน", unit: "หลัง", format: formatPopulation, hideable: true },
  { key: "people_per_house", label: "คนต่อบ้าน", format: (value) => Number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 }), hideable: true },
  { key: "area_km2", label: "พื้นที่", unit: "ตร.กม.", format: (value) => Number(value).toLocaleString("th-TH", { maximumFractionDigits: 3 }), hideable: true },
  { key: "share_pct", label: "สัดส่วน กทม.", unit: "%", format: (value) => `${Number(value).toFixed(2)}%`, hideable: true },
  { key: "exposure_score", label: "แรงกดดันประชากร", unit: "/100", format: (value) => Number(value).toFixed(1), heatmap: true, heatmapHex: "#e11d48" },
  { key: "exposure_level", label: "ระดับแรงกดดัน", sortable: true, hideable: true },
];

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${color}`} /> {label}
      </div>
      <div className={`mt-2 text-xl font-black tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-[9px] text-slate-600">{note}</div>
    </div>
  );
}

export default function PopulationPage() {
  const [view, setView] = useState<ViewMode>("map");
  const [year, setYear] = useState(POPULATION_MAX_YEAR);
  const [level, setLevel] = useState<PopulationLevel>("district");
  const [metric, setMetric] = useState<PopulationMetric>("population");
  const [districtFilter, setDistrictFilter] = useState("ทั้งหมด");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [data, setData] = useState<PopulationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/population?year=${year}&level=${level}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดข้อมูลประชากรได้");
      setData(payload);
      setActiveId(null);
    } catch (loadError: any) {
      setError(loadError?.message ?? "ไม่สามารถโหลดข้อมูลประชากรได้");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [level, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (level === "district") setDistrictFilter("ทั้งหมด");
  }, [level]);

  const districtNames = useMemo(
    () => Array.from(new Set((data?.rows ?? []).map((row) => row.district_name))).sort((a, b) => a.localeCompare(b, "th")),
    [data?.rows],
  );
  const rows = useMemo(
    () => districtFilter === "ทั้งหมด"
      ? data?.rows ?? []
      : (data?.rows ?? []).filter((row) => row.district_name === districtFilter),
    [data?.rows, districtFilter],
  );
  const ids = new Set(rows.map((row) => row.id));
  const geojson = data
    ? {
        ...data.geojson,
        features: data.geojson.features.filter((feature: any) => ids.has(Number((feature as any).properties?.id))),
      }
    : null;
  const selected = activeId === null ? null : rows.find((row) => row.id === activeId) ?? null;
  const panelProvenance = buildProvenance({
    source: data?.summary.source ?? "ทะเบียนราษฎรกรุงเทพมหานคร",
    period: `ธันวาคม ${year + 543}`,
    methodologyId: `population-${level}-v1`,
    fallbackQuality: "observed",
    qualityFlags: [level === "subdistrict" && "ระดับแขวง", data?.previousYear != null && `เทียบปี ${data.previousYear + 543}`],
  });
  const panelInsight = getPolicySafeInsight({
    selected: selected !== null,
    title: selected?.name ?? "กรุงเทพมหานคร",
    metricLabel: metric === "density" ? "ความหนาแน่น" : metric === "exposure_score" ? "แรงกดดันประชากร" : "ประชากร",
    primaryValue: selected ? Number(selected[metric] ?? selected.population) : null,
    averageValue: metric === "density"
      ? data?.summary.density
      : metric === "exposure_score"
        ? rows.reduce((sum, row) => sum + row.exposure_score, 0) / Math.max(rows.length, 1)
        : (data?.summary.population ?? 0) / Math.max(data?.rows.length ?? 1, 1),
    higherIsConcern: metric === "density" || metric === "exposure_score",
    provenance: panelProvenance,
  });
  const filteredSummary = useMemo(() => {
    if (districtFilter === "ทั้งหมด" || rows.length === 0) return null;
    const totals = rows.reduce(
      (sum, row) => ({
        population: sum.population + row.population,
        male: sum.male + row.male,
        female: sum.female + row.female,
        houses: sum.houses + row.houses,
        area: sum.area + row.area_km2,
        previousPopulation: sum.previousPopulation
          + (row.change_abs === null ? row.population : row.population - row.change_abs),
      }),
      { population: 0, male: 0, female: 0, houses: 0, area: 0, previousPopulation: 0 },
    );
    return {
      ...totals,
      density: totals.area > 0 ? totals.population / totals.area : 0,
      changePct: data?.previousYear && totals.previousPopulation > 0
        ? ((totals.population - totals.previousPopulation) / totals.previousPopulation) * 100
        : null,
      peoplePerHouse: totals.houses > 0 ? totals.population / totals.houses : null,
      femaleSharePct: totals.population > 0 ? (totals.female / totals.population) * 100 : 0,
    };
  }, [data?.previousYear, districtFilter, rows]);
  const displayPopulation = selected?.population ?? filteredSummary?.population ?? data?.summary.population ?? 0;
  const displayChangePct = selected?.change_pct ?? filteredSummary?.changePct ?? data?.summary.changePct ?? null;
  const displayDensity = selected?.density ?? filteredSummary?.density ?? data?.summary.density ?? 0;
  const displayHouses = selected?.houses ?? filteredSummary?.houses ?? data?.summary.houses ?? 0;
  const displayPeoplePerHouse = selected?.people_per_house
    ?? filteredSummary?.peoplePerHouse
    ?? (data?.summary.houses ? data.summary.population / data.summary.houses : null);
  const displayFemaleSharePct = selected
    ? (selected.female / selected.population) * 100
    : filteredSummary?.femaleSharePct ?? data?.summary.femaleSharePct ?? 0;
  const displayExposure = selected?.exposure_score
    ?? (rows.length
      ? rows.reduce((sum, row) => sum + row.exposure_score, 0) / rows.length
      : 0);
  const displayAreaName = selected?.name ?? (filteredSummary ? `เขต${districtFilter}` : `กรุงเทพมหานคร ปี ${year + 543}`);
  const ranked = [...rows].sort((a, b) => {
    const av = a[metric] ?? -Infinity;
    const bv = b[metric] ?? -Infinity;
    return Number(bv) - Number(av);
  }).slice(0, 15);
  const metricValues = ranked.map((row) => Number(row[metric] ?? 0));
  const metricMin = Math.min(...metricValues, 0);
  const metricMax = Math.max(...metricValues, 1);
  const exposureRanking = useMemo(
    () => [...rows].sort((a, b) => b.exposure_score - a.exposure_score).slice(0, 10),
    [rows],
  );

  const selectRow = (row: PopulationRow) => setActiveId(row.id);
  const rowData = (properties: any) => ({
    name: properties.name,
    district: properties.level === "subdistrict" ? properties.district_name : "-",
    population: properties.population,
    change_pct: properties.change_pct,
    density: properties.density,
    male: properties.male,
    female: properties.female,
    houses: properties.houses,
    people_per_house: properties.people_per_house,
    area_km2: properties.area_km2,
    share_pct: properties.share_pct,
    exposure_score: properties.exposure_score,
    exposure_level: properties.exposure_level,
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#07101e] text-slate-100">
      <header className="shrink-0 border-b border-slate-800/80 bg-slate-950/80 px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
              <Users className="h-5 w-5 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black">ประชากรกรุงเทพมหานคร</h1>
              <p className="truncate text-[10px] text-slate-500">ทะเบียนราษฎร · 50 เขต · 180 แขวง · 2018–2025</p>
            </div>
          </div>
          <ViewTabs view={view} onChange={setView} accentColor="indigo" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <PopulationSidebar
          year={year}
          level={level}
          metric={metric}
          districtFilter={districtFilter}
          districtNames={districtNames}
          ranked={ranked}
          activeId={activeId}
          data={data}
          loading={loading}
          onYearChange={setYear}
          onLevelChange={setLevel}
          onMetricChange={setMetric}
          onDistrictChange={(district) => {
            setDistrictFilter(district);
            setActiveId(null);
          }}
          onSelectRow={selectRow}
          onReload={loadData}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
        <div className="mb-3 grid shrink-0 grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 md:hidden">
          <label className="text-[10px] text-slate-400">
            ปีข้อมูล
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white outline-none focus:border-indigo-400"
            >
              {Array.from(
                { length: POPULATION_MAX_YEAR - POPULATION_MIN_YEAR + 1 },
                (_, index) => POPULATION_MAX_YEAR - index,
              ).map((option) => (
                <option key={option} value={option}>{option + 543}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] text-slate-400">
            ระดับพื้นที่
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as PopulationLevel)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white outline-none focus:border-indigo-400"
            >
              <option value="district">เขต</option>
              <option value="subdistrict">แขวง</option>
            </select>
          </label>
          <label className="col-span-2 text-[10px] text-slate-400">
            ตัวชี้วัด
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as PopulationMetric)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white outline-none focus:border-indigo-400"
            >
              {METRICS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {loading && (
          <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> กำลังจัดเตรียมข้อมูลประชากร
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-8 text-center text-sm text-red-300">{error}</div>
        )}
        {!loading && data && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
              <MetricCard icon={Users} label="ประชากรรวม" value={`${formatPopulation(displayPopulation)} คน`} note={displayAreaName} color="text-indigo-300" />
              <MetricCard icon={(displayChangePct ?? 0) >= 0 ? TrendingUp : TrendingDown} label="เปลี่ยนจากปีก่อน" value={formatPopulationPercent(displayChangePct)} note={data.previousYear ? `เทียบปี ${data.previousYear + 543}` : "ปีแรกของชุดข้อมูล"} color={(displayChangePct ?? 0) >= 0 ? "text-emerald-300" : "text-orange-300"} />
              <MetricCard icon={MapPin} label="ความหนาแน่น" value={formatPopulation(displayDensity)} note="คนต่อตารางกิโลเมตร" color="text-violet-300" />
              <MetricCard icon={Building} label="จำนวนบ้าน" value={`${formatPopulation(displayHouses)} หลัง`} note={`${displayPeoplePerHouse?.toLocaleString("th-TH", { maximumFractionDigits: 2 }) ?? "-"} คน/บ้าน`} color="text-cyan-300" />
              <MetricCard icon={UserRound} label="สัดส่วนหญิง" value={`${displayFemaleSharePct.toFixed(1)}%`} note="จากประชากรทะเบียนราษฎร" color="text-pink-300" />
              <MetricCard icon={ShieldAlert} label="แรงกดดันประชากร" value={`${displayExposure.toFixed(1)}/100`} note="คน 35% · หนาแน่น 35% · บ้าน 20% · เติบโต 10%" color="text-rose-300" />
            </div>

            {view === "map" && (
              <>
                <div className="flex min-h-[420px] flex-1">
                  <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800">
                    <PopulationMap geojsonData={geojson} rows={rows} metric={metric} activeId={activeId} onSelect={selectRow} />
                    {selected && (
                      <div className="absolute inset-x-3 bottom-3 z-[1000] max-h-[48vh] overflow-y-auto md:left-4 md:right-auto md:w-80 xl:hidden">
                        <InteractiveDistrictPanel
                          accent="indigo"
                          selected
                          title={selected.name}
                          subtitle={`${selected.level === "district" ? "เขต" : "แขวง"}${selected.name}`}
                          onClear={() => setActiveId(null)}
                          showChart={false}
                          metrics={[
                            { label: "ประชากร", value: `${formatPopulation(selected.population)} คน`, rawValue: selected.population, color: "#818cf8" },
                            { label: "ความหนาแน่น", value: `${formatPopulation(selected.density)} คน/ตร.กม.`, rawValue: selected.density, color: "#a78bfa" },
                            { label: "เปลี่ยนจากปีก่อน", value: formatPopulationPercent(selected.change_pct), rawValue: selected.change_pct, color: "#22c55e" },
                            { label: "แรงกดดัน", value: `${selected.exposure_score.toFixed(1)}/100`, rawValue: selected.exposure_score, color: "#fb7185" },
                          ]}
                          provenance={panelProvenance}
                          insight={panelInsight}
                        />
                      </div>
                    )}
                  </div>
                  <aside className="ml-3 hidden w-80 shrink-0 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/65 p-4 xl:block">
                    <InteractiveDistrictPanel
                      accent="indigo"
                      selected={selected !== null}
                      title={selected?.name ?? "เลือกพื้นที่บนแผนที่"}
                      subtitle={selected ? `${selected.level === "district" ? "เขต" : "แขวง"}${selected.name}` : "คลิก polygon เขต/แขวงเพื่อดูข้อมูลประชากร"}
                      onClear={() => setActiveId(null)}
                      metrics={[
                        { label: "ประชากร", value: `${formatPopulation(selected?.population)} คน`, rawValue: selected?.population, color: "#818cf8" },
                        { label: "ความหนาแน่น", value: `${formatPopulation(selected?.density)} คน/ตร.กม.`, rawValue: selected?.density, color: "#a78bfa" },
                        { label: "เปลี่ยนจากปีก่อน", value: formatPopulationPercent(selected?.change_pct), rawValue: selected?.change_pct, color: "#22c55e" },
                        { label: "แรงกดดัน", value: selected ? `${selected.exposure_score.toFixed(1)}/100` : "ไม่มีข้อมูล", rawValue: selected?.exposure_score, color: "#fb7185" },
                      ]}
                      provenance={panelProvenance}
                      insight={panelInsight}
                    />
                  </aside>
                </div>
              </>
            )}

            {view === "stats" && (
              <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-2">
                  <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <h2 className="text-xs font-bold">แนวโน้มประชากรกรุงเทพมหานคร</h2>
                  <p className="mt-1 text-[10px] text-slate-500">ทะเบียนราษฎร ณ เดือนธันวาคมของแต่ละปี</p>
                  <div className="mt-4 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 10 }} />
                        <YAxis domain={["dataMin - 50000", "dataMax + 50000"]} tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} formatter={(value: any) => [`${formatPopulation(Number(value))} คน`, "ประชากร"]} />
                        <Line type="monotone" dataKey="population" stroke="#818cf8" strokeWidth={3} dot={{ fill: "#a5b4fc" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  </section>
                  <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <h2 className="text-xs font-bold">15 อันดับตามตัวชี้วัดที่เลือก</h2>
                  <p className="mt-1 text-[10px] text-slate-500">{METRICS.find((item) => item.value === metric)?.label} · ปี {year + 543}</p>
                  <div className="mt-4 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ranked} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} formatter={(value: any) => [metric === "change_pct" ? formatPopulationPercent(Number(value)) : metric === "exposure_score" ? `${Number(value).toFixed(1)}/100` : formatPopulation(Number(value)), "ค่า"]} />
                        <Bar dataKey={metric} radius={[0, 4, 4, 0]}>
                          {ranked.map((row) => <Cell key={row.id} fill={populationColor(Number(row[metric] ?? 0), metricMin, metricMax, metric)} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  </section>
                </div>

                <section className="rounded-xl border border-slate-800 bg-slate-900/60">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-black">
                        <ShieldAlert className="h-4 w-4 text-rose-300" />
                        แรงกดดันประชากรสำหรับประกอบการวางแผน
                      </h2>
                      <p className="mt-1 text-[10px] leading-5 text-slate-500">
                        คะแนนสัมพัทธ์ภายในระดับพื้นที่และปีที่เลือก ใช้จำนวนประชากร 35% ความหนาแน่น 35% บ้าน 20% และการเติบโตทางบวก 10%
                      </p>
                    </div>
                    <span className="rounded-lg border border-amber-700/40 bg-amber-950/25 px-2.5 py-1.5 text-[9px] text-amber-300">
                      ไม่ใช่ดัชนีความเปราะบาง
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-[11px]">
                      <thead className="bg-slate-950/45 text-[9px] text-slate-500">
                        <tr>
                          <th className="px-4 py-3">อันดับ</th>
                          <th className="px-4 py-3">พื้นที่</th>
                          <th className="px-4 py-3">คะแนน</th>
                          <th className="px-4 py-3">ประชากร</th>
                          <th className="px-4 py-3">ความหนาแน่น</th>
                          <th className="px-4 py-3">บ้าน</th>
                          <th className="px-4 py-3">เปลี่ยนจากปีก่อน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exposureRanking.map((row, index) => (
                          <tr
                            key={`exposure-${row.id}`}
                            onClick={() => {
                              setActiveId(row.id);
                              setMetric("exposure_score");
                              setView("map");
                            }}
                            className="cursor-pointer border-t border-slate-800 transition-colors hover:bg-slate-800/35"
                          >
                            <td className="px-4 py-3 text-slate-600">{index + 1}</td>
                            <td className="px-4 py-3 font-bold text-slate-200">{row.name}</td>
                            <td className="px-4 py-3">
                              <span className={`font-black tabular-nums ${
                                row.exposure_score >= 75 ? "text-rose-300" : row.exposure_score >= 55 ? "text-orange-300" : "text-cyan-300"
                              }`}>
                                {row.exposure_score.toFixed(1)}/100
                              </span>
                              <span className="ml-2 text-[9px] text-slate-500">{row.exposure_level}</span>
                            </td>
                            <td className="px-4 py-3 tabular-nums text-slate-300">{formatPopulation(row.population)} คน</td>
                            <td className="px-4 py-3 tabular-nums text-slate-300">{formatPopulation(row.density)} คน/ตร.กม.</td>
                            <td className="px-4 py-3 tabular-nums text-slate-300">{formatPopulation(row.houses)} หลัง</td>
                            <td className="px-4 py-3 tabular-nums text-slate-300">{formatPopulationPercent(row.change_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {view === "table" && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <DistrictDataTable
                  features={geojson?.features ?? []}
                  columns={TABLE_COLUMNS}
                  getRowData={rowData}
                  csvFilename={`bkk_population_${level}_${year}`}
                  expectedRows={level === "district" ? 50 : districtFilter === "ทั้งหมด" ? 180 : rows.length}
                  accentColor="indigo"
                  dataSource={data.summary.source}
                  contextNote={`ทะเบียนราษฎรเดือนธันวาคม ${year + 543} · พื้นที่คำนวณจาก polygon แผนที่`}
                />
              </div>
            )}

            {view === "guide" && (
              <PlainLanguageGuide
                module="population"
                accent="indigo"
                records={rows}
                year={year + 543}
                activeArea={districtFilter}
                dataSource={data.summary.source}
                dataQuality="observed"
                nameKey="name"
                extraSummary={[
                  `พื้นที่ประชากรมากที่สุด: ${data.summary.mostPopulous ?? "ไม่มีข้อมูล"}`,
                  `พื้นที่ความหนาแน่นสูงสุด: ${data.summary.highestDensity ?? "ไม่มีข้อมูล"}`,
                  `พื้นที่เติบโตเร็วสุดจากปีก่อน: ${data.summary.fastestGrowing ?? "ไม่มีข้อมูล"}`,
                  `พื้นที่แรงกดดันประชากรสูงสุด: ${data.summary.highestExposure ?? "ไม่มีข้อมูล"} คะแนนนี้ใช้จำนวนคน ความหนาแน่น บ้าน และการเติบโต ไม่ใช่ดัชนีความเปราะบาง`,
                ]}
              />
            )}
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
