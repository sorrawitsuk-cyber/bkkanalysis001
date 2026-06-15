/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CloudRain,
  Database,
  Gauge,
  Layers3,
  MapPin,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import SidebarFooter from "@/components/gee/SidebarFooter";
import MapSkeleton from "@/components/ui/MapSkeleton";
import {
  RAINFALL_WINDOWS,
  formatRainfall,
  rainfallColor,
  type RainfallResponse,
  type RainfallWindow,
} from "@/lib/rainfall";
import type { PopulationResponse } from "@/lib/population";
import { buildUrbanImpactRows, type UrbanImpactRow } from "@/lib/urban-impact";
import UrbanImpactPanel from "@/components/analysis/UrbanImpactPanel";

const RainfallMapView = dynamic(() => import("@/components/map/RainfallMapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function defaultRainfallEndDate(): string {
  const bangkokNow = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(bangkokNow - 2 * 86400000).toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function changeText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูลเปรียบเทียบ";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const TABLE_COLUMNS: ColDef[] = [
  { key: "name", label: "เขต", sortable: true },
  { key: "rainfall_mm", label: "ฝนสะสมเฉลี่ยเชิงพื้นที่รายเขต", unit: "มม.", sortable: true, heatmap: true, heatmapHex: "#0ea5e9" },
  { key: "daily_average_mm", label: "เฉลี่ยต่อวัน", unit: "มม.", sortable: true },
  { key: "previous_mm", label: "ช่วงเดียวกันปีก่อน", unit: "มม.", sortable: true },
  { key: "change_mm", label: "เปลี่ยนแปลง", unit: "มม.", sortable: true },
  { key: "change_pct", label: "เปลี่ยนแปลง", unit: "%", sortable: true },
  { key: "flood_reports", label: "ร้องเรียนน้ำท่วม", unit: "เรื่อง", sortable: true, heatmap: true, heatmapHex: "#f97316" },
  { key: "population", label: "ประชากร", unit: "คน", sortable: true, hideable: true },
  { key: "impact_score", label: "คะแนนคัดกรองผลกระทบ", unit: "/100", sortable: true, heatmap: true, heatmapHex: "#e11d48" },
];

export default function RainfallPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [days, setDays] = useState<RainfallWindow>(7);
  const [endDate, setEndDate] = useState(defaultRainfallEndDate);
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [rasterVisible, setRasterVisible] = useState(true);
  const [data, setData] = useState<RainfallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impactRows, setImpactRows] = useState<UrbanImpactRow[]>([]);
  const [impactLoading, setImpactLoading] = useState(false);

  const loadRainfall = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rainfall?days=${days}&end=${endDate}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดข้อมูลฝนได้");
      setData(payload);
    } catch (loadError: any) {
      setError(loadError?.message ?? "ไม่สามารถโหลดข้อมูลฝนได้");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days, endDate]);

  useEffect(() => {
    loadRainfall();
  }, [loadRainfall]);

  useEffect(() => {
    if (!data?.rows.length) return;
    const controller = new AbortController();
    setImpactLoading(true);
    const year = Number(endDate.slice(0, 4));
    Promise.all([
      fetch(
        `/api/flood-risk/traffy?year=${year}&recentDays=${days}&referenceDate=${endDate}&pointLimit=0`,
        { signal: controller.signal },
      ).then((response) => response.ok ? response.json() : null),
      fetch("/api/population?year=2025&level=district", { signal: controller.signal })
        .then((response) => response.ok ? response.json() as Promise<PopulationResponse> : null),
    ])
      .then(([floodData, populationData]) => {
        const rainfallByDistrict = new Map(
          data.rows.map((row) => [row.district_name, row.rainfall_mm] as const),
        );
        const floodReportsByDistrict = new Map<string, { recent: number; unresolved: number }>(
          (floodData?.summary?.byDistrict ?? []).map((row: any) => [
            row.district,
            { recent: Number(row.recent ?? 0), unresolved: Number(row.unresolved ?? 0) },
          ]),
        );
        const populationByDistrict = new Map(
          (populationData?.rows ?? []).map((row) => [
            row.district_name,
            { population: row.population, density: row.density },
          ] as const),
        );
        setImpactRows(buildUrbanImpactRows({
          districts: data.rows.map((row) => row.district_name),
          rainfallByDistrict,
          floodReportsByDistrict,
          populationByDistrict,
        }));
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setImpactRows([]);
      })
      .finally(() => setImpactLoading(false));
    return () => controller.abort();
  }, [data?.rows, days, endDate]);

  const selected = useMemo(() => {
    if (!data?.rows.length) return null;
    return activeDistrict === "ทั้งหมด"
      ? null
      : data.rows.find((row) => row.district_name === activeDistrict) ?? null;
  }, [activeDistrict, data?.rows]);

  const displayMean = selected?.rainfall_mm ?? data?.summary.bangkokMeanMm ?? null;
  const displayPrevious = selected?.previous_mm ?? data?.summary.previousMeanMm ?? null;
  const displayChangePct = selected?.change_pct ?? data?.summary.changePct ?? null;
  const maxDistrictValue = Math.max(
    data?.summary.maximumDistrictMm ?? 0,
    data?.raster.max ? data.raster.max * 0.4 : 1,
    1,
  );
  const chartRows = (data?.rows ?? []).slice(0, 15);
  const trendRows = (data?.trend ?? []).map((point) => ({
    ...point,
    label: formatDate(point.date),
  }));

  const features = data?.geojson.features ?? [];
  const filteredFeatures = activeDistrict === "ทั้งหมด"
    ? features
    : features.filter((feature: any) => feature.properties?.district_name === activeDistrict);
  const impactByDistrict = useMemo(
    () => new Map(impactRows.map((row) => [row.district, row])),
    [impactRows],
  );
  const enrichedFeatures = filteredFeatures.map((feature: any) => {
    const impact = impactByDistrict.get(feature.properties?.district_name);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        flood_reports: impact?.floodReports ?? null,
        population: impact?.population ?? null,
        impact_score: impact?.score ?? null,
      },
    };
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <Link href="/" className="rounded-lg border border-slate-800 p-2 text-slate-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-400/10">
            <CloudRain className="h-5 w-5 text-blue-300" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black">ปริมาณฝนกรุงเทพมหานคร</h1>
            <p className="truncate text-[10px] text-slate-500">GPM IMERG · ฝนสะสมและแนวโน้มรายวัน</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="cyan" />
          <button
            onClick={loadRainfall}
            disabled={loading}
            className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-400 transition-colors hover:text-white disabled:opacity-50"
            title="โหลดข้อมูลใหม่"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800 bg-[#0c1424] p-2 lg:hidden">
        <div className="flex shrink-0 rounded-lg border border-slate-800 bg-slate-950/70 p-1">
          {RAINFALL_WINDOWS.map((windowDays) => (
            <button
              key={windowDays}
              onClick={() => setDays(windowDays)}
              className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                days === windowDays ? "bg-cyan-500 text-slate-950" : "text-slate-500"
              }`}
            >
              {windowDays} วัน
            </button>
          ))}
        </div>
        <input
          type="date"
          value={endDate}
          max={bangkokToday()}
          min="2000-06-01"
          aria-label="วันที่สิ้นสุด"
          onChange={(event) => setEndDate(event.target.value)}
          className="w-[138px] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] text-slate-200 outline-none focus:border-cyan-500"
        />
        <select
          value={activeDistrict}
          aria-label="เลือกเขต"
          onChange={(event) => setActiveDistrict(event.target.value)}
          className="w-[150px] shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] outline-none focus:border-cyan-500"
        >
          <option value="ทั้งหมด">กรุงเทพฯ ทั้งหมด</option>
          {(data?.rows ?? []).map((row) => (
            <option key={row.district_id} value={row.district_name}>{row.district_name}</option>
          ))}
        </select>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-[#0c1424] lg:flex">
          <div className="space-y-5 p-4">
            <section>
              <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <CalendarDays className="h-3.5 w-3.5 text-cyan-400" /> ช่วงฝนสะสม
              </label>
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1">
                {RAINFALL_WINDOWS.map((windowDays) => (
                  <button
                    key={windowDays}
                    onClick={() => setDays(windowDays)}
                    className={`rounded-md py-2 text-[11px] font-bold transition-colors ${
                      days === windowDays ? "bg-cyan-500 text-slate-950" : "text-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {windowDays} วัน
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-[9px] font-bold text-slate-500">วันที่สิ้นสุด</label>
              <input
                type="date"
                value={endDate}
                max={bangkokToday()}
                min="2000-06-01"
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
              />
            </section>

            <section>
              <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-cyan-400" /> พื้นที่
              </label>
              <select
                value={activeDistrict}
                onChange={(event) => setActiveDistrict(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-cyan-500"
              >
                <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
                {(data?.rows ?? []).map((row) => (
                  <option key={row.district_id} value={row.district_name}>{row.district_name}</option>
                ))}
              </select>
            </section>

            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-24 rounded-lg bg-slate-800/70" />
                <div className="h-20 rounded-lg bg-slate-800/50" />
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-900/60 bg-red-950/25 p-3 text-xs leading-relaxed text-red-300">
                {error}
              </div>
            ) : data ? (
              <>
                <section>
                  <div className="text-[10px] text-slate-500">
                    {activeDistrict === "ทั้งหมด" ? "ค่าเฉลี่ยกรุงเทพฯ" : `เขต${activeDistrict}`}
                  </div>
                  <div className="mt-1 text-3xl font-black tabular-nums text-cyan-300">
                    {formatRainfall(displayMean)}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {formatDate(data.period.start)} ถึง {formatDate(data.period.end)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-[9px] text-slate-500">ช่วงเดียวกันปีก่อน</div>
                      <div className="mt-1 text-sm font-bold">{formatRainfall(displayPrevious)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-[9px] text-slate-500">เปลี่ยนแปลง</div>
                      <div className={`mt-1 flex items-center gap-1 text-sm font-bold ${
                        (displayChangePct ?? 0) >= 0 ? "text-orange-300" : "text-emerald-300"
                      }`}>
                        {(displayChangePct ?? 0) >= 0
                          ? <TrendingUp className="h-3.5 w-3.5" />
                          : <TrendingDown className="h-3.5 w-3.5" />}
                        {changeText(displayChangePct)}
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                      <Layers3 className="h-3.5 w-3.5 text-cyan-400" /> ชั้นข้อมูลแผนที่
                    </h2>
                    <button
                      onClick={() => setRasterVisible((current) => !current)}
                      className={`rounded-md border px-2 py-1 text-[9px] font-bold transition-colors ${
                        rasterVisible
                          ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                          : "border-slate-700 text-slate-500"
                      }`}
                    >
                      {rasterVisible ? "GPM เปิดอยู่" : "แสดง GPM"}
                    </button>
                  </div>
                  <p className="text-[9px] leading-relaxed text-slate-500">
                    Raster แสดงการกระจายฝนจาก GPM ส่วนเส้นเขตใช้สำหรับเลือกและสรุปค่าเฉลี่ยเชิงพื้นที่
                  </p>
                </section>

                <section>
                  <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                    <Gauge className="h-3.5 w-3.5 text-cyan-400" /> เขตที่มีฝนสะสมสูง
                  </h2>
                  <div className="space-y-1.5">
                    {data.rows.slice(0, 8).map((row, index) => (
                      <button
                        key={row.district_id}
                        onClick={() => setActiveDistrict(row.district_name)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-800/60"
                      >
                        <span className="w-4 text-[9px] text-slate-600">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{row.district_name}</span>
                        <span className="text-[10px] font-bold tabular-nums text-cyan-300">{formatRainfall(row.rainfall_mm)}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <DataSourceBadge
                  dataSource={data.summary.source}
                  dataQuality={data.summary.dataQuality}
                  sourceLabel={`${data.summary.source} · ${data.summary.observationCount.toLocaleString("th-TH")} ช่วงสังเกตการณ์`}
                  sourceNote={`ความละเอียดประมาณ ${data.summary.approximateResolutionKm} กม. เหมาะสำหรับภาพรวมเมือง ไม่ใช่ค่าจากมาตรวัดฝนรายจุด`}
                />

                {data.summary.isPartial && (
                  <section className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3">
                    <h2 className="text-[10px] font-bold text-amber-300">ข้อมูลช่วงนี้ยังมาไม่ครบ</h2>
                    <p className="mt-1 text-[9px] leading-relaxed text-amber-200/70">
                      พบ {data.summary.observationCount.toLocaleString("th-TH")} จากประมาณ{" "}
                      {data.summary.expectedObservationCount.toLocaleString("th-TH")} ช่วงครึ่งชั่วโมง
                      ({data.summary.completenessPct}%) ค่าฝนสะสมอาจต่ำกว่าความเป็นจริง
                    </p>
                  </section>
                )}

                <section className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                  <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                    <Database className="h-3.5 w-3.5 text-slate-500" /> วิธีอ่านข้อมูล
                  </h2>
                  <ul className="mt-2 space-y-1.5 text-[9px] leading-relaxed text-slate-500">
                    <li>• ปริมาณฝนเป็นค่าประมาณจากดาวเทียม ไม่ใช่มาตรวัดฝนภาคพื้นดิน</li>
                    <li>• ความแตกต่างระหว่างเขตใกล้กันอาจต่ำกว่าความละเอียดของข้อมูล</li>
                    <li>• ข้อมูลใกล้เวลาปัจจุบันอาจได้รับการปรับปรุงภายหลังโดยผู้ผลิต</li>
                  </ul>
                </section>
              </>
            ) : null}
          </div>
          <SidebarFooter exclude={["rainfall"]} />
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> กำลังประมวลผลข้อมูลฝนจาก GPM
            </div>
          ) : error || !data ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">
              {error ?? "ไม่มีข้อมูล"}
            </div>
          ) : (
            <>
              {viewMode === "map" && (
                <div className="relative h-full min-h-[520px]">
                  <RainfallMapView
                    geojsonData={data.geojson}
                    rasterUrl={data.raster.urlFormat}
                    rasterVisible={rasterVisible}
                    activeDistrict={activeDistrict}
                    onDistrictSelect={setActiveDistrict}
                    maxValue={maxDistrictValue}
                  />
                  <div className="absolute bottom-4 right-4 z-[500] w-48 rounded-lg border border-slate-700 bg-slate-950/95 p-3">
                    <div className="mb-2 text-[9px] font-bold text-slate-300">ฝนสะสม {days} วัน</div>
                    <div
                      className="h-2 rounded-sm"
                      style={{ background: `linear-gradient(to right, ${data.raster.palette.join(",")})` }}
                    />
                    <div className="mt-1 flex justify-between text-[8px] text-slate-500">
                      <span>0 มม.</span>
                      <span>{data.raster.max} มม. ขึ้นไป</span>
                    </div>
                  </div>
                </div>
              )}

              {viewMode === "stats" && (
                <div className="space-y-4 p-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ["เฉลี่ยกรุงเทพฯ", formatRainfall(data.summary.bangkokMeanMm)],
                      ["สูงสุด", `${formatRainfall(data.summary.maximumDistrictMm)} · ${data.summary.wettestDistrict ?? "–"}`],
                      ["เทียบปีก่อน", changeText(data.summary.changePct)],
                      ["ความครบถ้วน", `${data.summary.completenessPct}% · ${data.summary.observationCount.toLocaleString("th-TH")} ช่วง`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
                        <div className="text-[10px] text-slate-500">{label}</div>
                        <div className="mt-1 text-lg font-black text-slate-100">{value}</div>
                      </div>
                    ))}
                  </div>

                  {impactLoading ? (
                    <div className="flex h-28 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/45 text-xs text-slate-500">
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      กำลังเชื่อมฝนกับเหตุร้องเรียนและประชากร
                    </div>
                  ) : (
                    <UrbanImpactPanel
                      rows={impactRows}
                      activeDistrict={activeDistrict}
                      onDistrictSelect={(district) => {
                        setActiveDistrict(district);
                        setViewMode("map");
                      }}
                      title="ผลกระทบที่ควรตรวจสอบหลังฝน"
                      description={`ฝนสะสม ${days} วัน สิ้นสุด ${formatDate(endDate)} · เหตุร้องเรียนในช่วงเดียวกัน · ประชากรทะเบียนปี 2568`}
                    />
                  )}

                  <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <h2 className="text-xs font-black">ปริมาณฝนเฉลี่ยรายวัน</h2>
                      <p className="mt-1 text-[10px] text-slate-500">ค่าเฉลี่ยเชิงพื้นที่ของกรุงเทพมหานคร</p>
                      <div className="mt-4 h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendRows}>
                            <defs>
                              <linearGradient id="rainfall-fill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
                                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.03} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} stroke="#64748b" fontSize={9} />
                            <YAxis stroke="#64748b" fontSize={9} unit=" มม." />
                            <Tooltip
                              labelFormatter={(value) => formatDate(String(value))}
                              formatter={(value) => [formatRainfall(Number(value)), "ปริมาณฝน"]}
                              contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
                            />
                            <Area type="monotone" dataKey="rainfall_mm" stroke="#22d3ee" fill="url(#rainfall-fill)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <h2 className="text-xs font-black">15 เขตที่มีฝนสะสมสูง</h2>
                      <p className="mt-1 text-[10px] text-slate-500">ค่าเฉลี่ยภายในขอบเขตเขต</p>
                      <div className="mt-4 h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartRows} layout="vertical" margin={{ left: 20, right: 12 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" stroke="#64748b" fontSize={9} unit=" มม." />
                            <YAxis type="category" dataKey="district_name" width={82} stroke="#94a3b8" fontSize={9} />
                            <Tooltip
                              formatter={(value) => [formatRainfall(Number(value)), "ฝนสะสม"]}
                              contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
                            />
                            <Bar dataKey="rainfall_mm" radius={[0, 4, 4, 0]}>
                              {chartRows.map((row) => (
                                <Cell
                                  key={row.district_id}
                                  fill={rainfallColor(row.rainfall_mm, maxDistrictValue)}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {viewMode === "table" && (
                <div className="p-5">
                  <DistrictDataTable
                    features={enrichedFeatures}
                    columns={TABLE_COLUMNS}
                    getRowData={(properties) => ({
                      name: properties.district_name,
                      rainfall_mm: properties.rainfall_mm,
                      daily_average_mm: properties.daily_average_mm,
                      previous_mm: properties.previous_mm,
                      change_mm: properties.change_mm,
                      change_pct: properties.change_pct,
                      flood_reports: properties.flood_reports,
                      population: properties.population,
                      impact_score: properties.impact_score,
                    })}
                    csvFilename={`bangkok_rainfall_${data.period.end}_${days}d`}
                    filterDistrict={activeDistrict}
                    onDistrictChange={setActiveDistrict}
                    districts={data.rows.map((row) => row.district_name)}
                    accentColor="cyan"
                    dataSource={data.summary.source}
                    contextNote={`ฝนสะสม ${days} วัน สิ้นสุด ${data.period.end} · รวมบริบท Traffy และประชากรปี 2568 · คะแนนเป็นการคัดกรอง`}
                    expectedRows={activeDistrict === "ทั้งหมด" ? 50 : 1}
                  />
                </div>
              )}

              {viewMode === "guide" && (
                <div className="mx-auto max-w-4xl space-y-5 p-6">
                  <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                    <h2 className="text-base font-black">โมดูลนี้ตอบคำถามอะไร</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                      ใช้ติดตามว่าช่วงเวลาที่เลือกมีฝนสะสมมากเพียงใด กระจายตัวบริเวณใด และต่างจากช่วงเดียวกันของปีก่อนอย่างไร
                      เหมาะสำหรับดูภาพรวมเมืองและใช้ประกอบการตรวจสอบเหตุการณ์น้ำท่วม
                    </p>
                  </section>
                  <div className="grid gap-4 md:grid-cols-2">
                    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                      <h3 className="font-bold text-cyan-300">ข้อมูลที่ใช้</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-400">
                        NASA GPM IMERG V07 ประมาณอัตราฝนทุกครึ่งชั่วโมง ระบบคูณค่า มม./ชม. ด้วย 0.5
                        แล้วรวมเป็นปริมาณฝนสะสมของช่วงเวลา
                      </p>
                    </section>
                    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                      <h3 className="font-bold text-cyan-300">ข้อจำกัดสำคัญ</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-400">
                        ความละเอียดประมาณ 0.1 องศาหรือ 11 กม. จึงไม่ควรใช้แทนมาตรวัดฝนระดับถนน
                        และไม่ควรตีความความต่างเล็กน้อยระหว่างเขตติดกันว่าเป็นความต่างจริงอย่างแน่นอน
                      </p>
                    </section>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
