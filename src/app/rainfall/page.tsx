/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDistrictUrlState } from "@/lib/url-selection-state";
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
  X,
  Download,
  FileText,
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
import MapControlPanel from "@/components/map/MapControlPanel";
import InteractiveDistrictPanel from "@/components/map/InteractiveDistrictPanel";
import ResponsiveMapAside from "@/components/map/ResponsiveMapAside";
import ResponsivePageSidebar from "@/components/map/ResponsivePageSidebar";
import ExportPanel from "@/components/ui/ExportPanel";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import SidebarFooter from "@/components/gee/SidebarFooter";
import MapSkeleton from "@/components/ui/MapSkeleton";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import { buildProvenance, getPolicySafeInsight } from "@/lib/data-provenance";
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
  const [activeDistrict, setActiveDistrict] = useDistrictUrlState();
  const [rasterVisible, setRasterVisible] = useState(true);
  const [data, setData] = useState<RainfallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impactRows, setImpactRows] = useState<UrbanImpactRow[]>([]);
  const [impactLoading, setImpactLoading] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
  const panelProvenance = buildProvenance({
    summary: data?.summary,
    source: data?.summary.source,
    period: data?.period.label ?? `${days} วัน สิ้นสุด ${endDate}`,
    methodologyId: "rainfall-gpm-district-v1",
    qualityFlags: [
      data?.summary.isPartial && `ข้อมูลยังไม่ครบ (${data.summary.completenessPct}%)`,
      data?.summary.approximateResolutionKm != null && `ความละเอียดประมาณ ${data.summary.approximateResolutionKm} กม.`,
    ],
  });
  const panelInsight = getPolicySafeInsight({
    selected: activeDistrict !== "ทั้งหมด",
    title: activeDistrict,
    metricLabel: "ฝนสะสม",
    primaryValue: selected?.rainfall_mm,
    averageValue: data?.summary.bangkokMeanMm,
    higherIsConcern: true,
    provenance: panelProvenance,
  });

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

  const districts = useMemo(() =>
    [...(data?.rows ?? [])]
      .map((row) => row.district_name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "th")),
    [data?.rows]
  );

  const csvHeaders = [
    "เขต",
    "ฝนสะสมเฉลี่ย (มม.)",
    "เฉลี่ยต่อวัน (มม.)",
    "ช่วงเดียวกันปีก่อน (มม.)",
    "เปลี่ยนแปลง (มม.)",
    "เปลี่ยนแปลง (%)",
    "ร้องเรียนน้ำท่วม (เรื่อง)",
    "ประชากร (คน)",
    "คะแนนผลกระทบ",
  ];

  const csvRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.map((row) => {
      const impact = impactRows.find((i) => i.district === row.district_name);
      return [
        row.district_name,
        row.rainfall_mm,
        row.daily_average_mm,
        row.previous_mm,
        row.change_mm,
        row.change_pct,
        impact?.floodReports ?? 0,
        impact?.population ?? 0,
        impact?.score ?? 0,
      ];
    });
  }, [data?.rows, impactRows]);

  const reportData = useMemo((): PDFReportData => ({
    title: "รายงานปริมาณน้ำฝนเชิงพื้นที่ กรุงเทพมหานคร",
    subtitle: "NASA GPM IMERG · Spatial Rainfall Summary",
    source: data?.summary.source ?? "GPM IMERG",
    period: data ? `${formatDate(data.period.start)} ถึง ${formatDate(data.period.end)}` : "",
    layer: `ฝนสะสม ${days} วัน`,
    district: activeDistrict,
    kpis: [
      { label: "ฝนเฉลี่ยเชิงพื้นที่", value: formatRainfall(displayMean) },
      { label: "ฝนสูงสุดรายเขต", value: data?.summary.maximumDistrictMm != null ? `${formatRainfall(data.summary.maximumDistrictMm)} · ${data.summary.wettestDistrict ?? "–"}` : "–" },
      { label: "ร้องเรียนสะสม (Traffy)", value: `${impactRows.reduce((sum, r) => sum + (r.floodReports ?? 0), 0)} เรื่อง` },
      { label: "ความครบถ้วนข้อมูล", value: data ? `${data.summary.completenessPct}%` : "–" },
    ],
    rankingHeaders: ["เขต", "ปริมาณฝนสะสม (มม.)"],
    rankingRows: (data?.rows ?? []).map((row) => [row.district_name, row.rainfall_mm]),
  }), [data, days, activeDistrict, displayMean, impactRows]);

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      {/* Left Sidebar */}
      <ResponsivePageSidebar open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        {/* Sidebar Header with Page Title */}
        <div className="p-4 border-b border-slate-800/70 bg-slate-900/40">
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-lg border border-slate-800/80 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-400/10 shrink-0">
              <CloudRain className="h-5 w-5 text-blue-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black text-slate-100">ปริมาณน้ำฝนเชิงพื้นที่</h1>
              <p className="text-[10px] text-slate-500">GPM IMERG · ฝนสะสมรายเขต</p>
            </div>
          </div>
        </div>

        {/* Scrollable Sidebar Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-28 rounded-lg bg-slate-800/60" />
              <div className="h-44 rounded-lg bg-slate-800/40" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-900/60 bg-red-950/25 p-3 text-xs leading-relaxed text-red-300">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Main KPIs */}
              <section className="bg-slate-900/45 border border-slate-800/60 rounded-xl p-4">
                <div className="text-[10px] text-slate-500">
                  {activeDistrict === "ทั้งหมด" ? "เฉลี่ยพื้นที่กรุงเทพฯ" : `เขต${activeDistrict}`}
                </div>
                <div className="mt-1 text-3xl font-black tabular-nums text-cyan-400">
                  {formatRainfall(displayMean)}
                </div>
                <div className="text-[9px] text-slate-400 leading-snug mt-1">
                  ช่วงสะสมฝน {days} วัน: {formatDate(data.period.start)} ถึง {formatDate(data.period.end)}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="bg-slate-950/50 border border-slate-800/70 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500">ช่วงเดียวกันปีก่อน</div>
                    <div className="mt-0.5 text-xs font-bold text-slate-300">{formatRainfall(displayPrevious)}</div>
                  </div>
                  <div className="bg-slate-950/50 border border-slate-800/70 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500">การเปลี่ยนแปลง</div>
                    <div className={`mt-0.5 flex items-center gap-1 text-xs font-bold ${
                      (displayChangePct ?? 0) >= 0 ? "text-orange-400" : "text-emerald-400"
                    }`}>
                      {(displayChangePct ?? 0) >= 0
                        ? <TrendingUp className="h-3 w-3 shrink-0" />
                        : <TrendingDown className="h-3 w-3 shrink-0" />}
                      {changeText(displayChangePct)}
                    </div>
                  </div>
                </div>
              </section>

              {/* Rain rankings */}
              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                  <Gauge className="h-3.5 w-3.5 text-cyan-400" /> เขตที่มีปริมาณน้ำฝนสูงสุด
                </h2>
                <div className="space-y-1 bg-slate-900/35 border border-slate-800/50 rounded-xl p-1.5">
                  {data.rows.slice(0, 8).map((row, index) => (
                    <button
                      key={row.district_id}
                      onClick={() => setActiveDistrict(row.district_name)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        activeDistrict === row.district_name
                          ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-300"
                          : "hover:bg-slate-800/50 border border-transparent text-slate-300 hover:text-white"
                      }`}
                    >
                      <span className="w-4 text-[9px] text-slate-500 font-mono">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{row.district_name}</span>
                      <span className="text-[10px] font-black text-cyan-400">{formatRainfall(row.rainfall_mm)}</span>
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
                <section className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3.5 text-[10px] leading-5 text-amber-100/70">
                  <h3 className="font-bold text-amber-300">ข้อมูลยังไม่สมบูรณ์</h3>
                  <p className="mt-1 text-[9px] leading-relaxed">
                    พบ {data.summary.observationCount.toLocaleString("th-TH")} จาก {data.summary.expectedObservationCount.toLocaleString("th-TH")} คาบครึ่งชั่วโมง
                    ({data.summary.completenessPct}%)
                  </p>
                </section>
              )}

              {/* Guide Note */}
              <section className="rounded-xl border border-slate-800 bg-slate-900/25 p-3.5">
                <h2 className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                  <Database className="h-3.5 w-3.5 text-slate-500" /> วิธีการอ่านผลลัพธ์
                </h2>
                <ul className="mt-2 space-y-1.5 text-[9px] leading-relaxed text-slate-500">
                  <li>• การวัดปริมาณน้ำฝนเป็นค่าประมาณเชิงพื้นที่เฉลี่ย ไม่สามารถเทียบกับความรู้สึกส่วนบุคคลบนถนนจุดใดจุดหนึ่ง</li>
                  <li>• Traffy เป็นข้อมูลรายงานความเสี่ยงไม่ใช่ฝนตกจริง</li>
                </ul>
              </section>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800/70 bg-slate-900/20 shrink-0">
          <SidebarFooter exclude={["rainfall"]} />
        </div>
      </ResponsivePageSidebar>

      {/* Main content area */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/95 backdrop-blur-sm z-[1001]">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="cyan" />
          <div className="h-4 w-px bg-slate-700/60 mx-0.5 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-slate-600 shrink-0" />
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              disabled={districts.length === 0}
              className="rounded-md border border-slate-700/80 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/50 disabled:opacity-40 max-w-[130px]"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {districts.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {activeDistrict !== "ทั้งหมด" && (
              <button
                onClick={() => setActiveDistrict("ทั้งหมด")}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                title="ล้างตัวกรอง"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {loading && (
            <span className="text-[10px] font-bold text-cyan-400/70 uppercase tracking-widest animate-pulse ml-1">
              กำลังโหลด…
            </span>
          )}
          <div className="flex-1" />
          {!loading && data && viewMode !== "map" && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => downloadCSV(csvHeaders, csvRows, `bangkok_rainfall_${data.period.end}_${days}d`)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                type="button"
                onClick={() => printReport(reportData)}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-700/40 bg-cyan-900/20 px-2.5 py-1.5 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-40"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex">
          {loading && !data ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500 w-full">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin text-cyan-400" /> กำลังประมวลผลข้อมูลฝนจาก GPM...
            </div>
          ) : error || !data ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300 w-full">{error ?? "ไม่มีข้อมูล"}</div>
          ) : (
            <>
              {viewMode === "map" && (
                <>
                  <div className="relative flex-1 min-w-0">
                    <div className="absolute inset-0 z-0">
                      <RainfallMapView
                        geojsonData={data.geojson}
                        rasterUrl={data.raster.urlFormat}
                        rasterVisible={rasterVisible}
                        activeDistrict={activeDistrict}
                        onDistrictSelect={(districtName) => {
                          setActiveDistrict(districtName);
                          setMobileControlsOpen(true);
                        }}
                        maxValue={maxDistrictValue}
                      />
                    </div>

                    {/* Floating KPI cards */}
                    <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
                      {[
                        ["ฝนสะสมเฉลี่ย", formatRainfall(displayMean)],
                        ["ฝนสูงสุดรายเขต", data?.summary.maximumDistrictMm != null ? `${formatRainfall(data.summary.maximumDistrictMm)} · ${data.summary.wettestDistrict ?? "–"}` : "–"],
                        ["เทียบปีก่อน", changeText(data.summary.changePct)],
                        ["ความสมบูรณ์ข้อมูล", `${data.summary.completenessPct}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
                          <div className="text-[11px] text-slate-400 font-semibold leading-tight">{label}</div>
                          <div className="text-sm font-black text-slate-100 mt-1 truncate">{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Data Source Badge */}
                    <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">แหล่งข้อมูล</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed">
                        <p>{data?.summary.source ?? "GPM IMERG"}</p>
                        <p>ช่วงเวลา: {days} วัน สิ้นสุด {endDate}</p>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="absolute bottom-4 right-4 z-[500] w-52 rounded-xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-md">
                      <div className="mb-2 text-[10px] font-bold text-slate-300 uppercase tracking-[0.12em]">ฝนสะสม {days} วัน</div>
                      <div
                        className="h-2 rounded-sm border border-white/5"
                        style={{ background: `linear-gradient(to right, ${data.raster.palette.join(",")})` }}
                      />
                      <div className="mt-1 flex justify-between text-[8px] text-slate-400 font-mono">
                        <span>0 มม.</span>
                        <span>{data.raster.max} มม. ขึ้นไป</span>
                      </div>
                    </div>
                  </div>

                  {/* Right aside */}
                  <ResponsiveMapAside open={mobileControlsOpen} onOpenChange={setMobileControlsOpen} title="ตัวกรองปริมาณฝน" subtitle={`${days} วัน · ${endDate}`}>
                    <div className="flex min-h-full flex-col gap-3">
                      <InteractiveDistrictPanel
                        accent="cyan"
                        selected={activeDistrict !== "ทั้งหมด"}
                        title={activeDistrict !== "ทั้งหมด" ? activeDistrict : "เลือกเขตบนแผนที่"}
                        subtitle={activeDistrict !== "ทั้งหมด" ? "สรุปฝนสะสมของพื้นที่ที่คลิก" : "คลิก polygon เขตเพื่อดูปริมาณฝนสะสม"}
                        onClear={() => setActiveDistrict("ทั้งหมด")}
                        metrics={[
                          { label: "ฝนสะสม", value: formatRainfall(selected?.rainfall_mm), rawValue: selected?.rainfall_mm, color: "#38bdf8" },
                          { label: "เฉลี่ยต่อวัน", value: formatRainfall(selected?.daily_average_mm), rawValue: selected?.daily_average_mm, color: "#22d3ee" },
                          { label: "ช่วงปีก่อน", value: formatRainfall(selected?.previous_mm), rawValue: selected?.previous_mm, color: "#818cf8" },
                          { label: "เปลี่ยนแปลง", value: changeText(selected?.change_pct), rawValue: selected?.change_pct, color: "#f59e0b" },
                        ]}
                        provenance={panelProvenance}
                        insight={panelInsight}
                      />

                      <MapControlPanel
                        accent="cyan"
                        granularity="district"
                        onGranularityChange={() => undefined}
                        showGranularity={false}
                        mapMode={rasterVisible ? "raster" : "district"}
                        mapModes={[
                          { value: "raster", label: "ภาพฝนสะสมเชิงพื้นที่ (GPM)", description: "แสดงภาพการกระจายตัวของฝนสะสมละเอียดรายพิกเซล" },
                          { value: "district", label: "สรุปรายเขตพื้นที่", description: "ระบายสีแต่ละเขตด้วยค่าเฉลี่ยฝนสะสมในเขตนั่น" }
                        ]}
                        onMapModeChange={(m) => setRasterVisible(m === "raster")}
                        showOpacity={false}
                        opacity={1.0}
                        onOpacityChange={() => undefined}
                        baseMap="none"
                        onBaseMapChange={() => undefined}
                        onReset={() => {
                          setDays(7);
                          setEndDate(defaultRainfallEndDate());
                          setActiveDistrict("ทั้งหมด");
                          setRasterVisible(true);
                        }}
                        currentLayer={rasterVisible ? "ภาพฝนสะสม (GPM)" : "ฝนสะสมเฉลี่ยรายเขต"}
                        currentPeriod={`${days} วัน สิ้นสุด ${endDate}`}
                        dataSource={data?.summary.source ?? "GPM IMERG"}
                        interactionHint="วางเมาส์บนเขตเพื่อดูปริมาณฝนสะสม"
                      />

                      {/* Custom Rainfall days & dates */}
                      <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-4">
                        <div>
                          <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <CalendarDays className="h-3.5 w-3.5 text-cyan-400 animate-pulse" /> ช่วงสะสมฝน
                          </label>
                          <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1">
                            {RAINFALL_WINDOWS.map((windowDays) => (
                              <button
                                key={windowDays}
                                onClick={() => setDays(windowDays)}
                                className={`rounded-md py-1.5 text-[10px] font-bold transition-colors ${
                                  days === windowDays ? "bg-cyan-500 text-slate-950" : "text-slate-500 hover:text-slate-200"
                                }`}
                              >
                                {windowDays} วัน
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">วันที่สิ้นสุดข้อมูล</label>
                          <input
                            type="date"
                            value={endDate}
                            max={bangkokToday()}
                            min="2000-06-01"
                            onChange={(event) => setEndDate(event.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                          />
                        </div>
                      </section>

                      <ExportPanel
                        accentColor="cyan"
                        csvFilename={`bangkok_rainfall_${data.period.end}_${days}d`}
                        csvHeaders={csvHeaders}
                        csvRows={csvRows}
                        reportData={reportData}
                      />
                    </div>
                  </ResponsiveMapAside>
                </>
              )}

              {viewMode === "stats" && (
                <div className="space-y-4 p-5 flex-1 overflow-y-auto custom-scrollbar">
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
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin text-cyan-400" /> กำลังประเมินดัชนีผลกระทบภัยพิบัติ (Traffy)...
                    </div>
                  ) : (
                    <UrbanImpactPanel
                      rows={impactRows}
                      activeDistrict={activeDistrict}
                      onDistrictSelect={setActiveDistrict}
                    />
                  )}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <h2 className="text-xs font-black">15 เขตที่มีปริมาณน้ำฝนสะสมสูงสุด</h2>
                      <p className="mt-1 text-[10px] text-slate-500">ฝนสะสมรวม {days} วัน (มิลลิเมตร)</p>
                      <div className="mt-4 h-[360px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartRows} layout="vertical" margin={{ left: 18, right: 18 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" stroke="#64748b" fontSize={9} unit=" มม." />
                            <YAxis type="category" dataKey="district_name" width={82} stroke="#94a3b8" fontSize={9} />
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
                              formatter={(value) => [`${Number(value).toFixed(1)} มม.`, "ปริมาณฝน"]} />
                            <Bar dataKey="rainfall_mm" radius={[0, 4, 4, 0]}>
                              {chartRows.map((row) => (
                                <Cell key={row.district_id} fill={rainfallColor(row.rainfall_mm, maxDistrictValue)} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
                      <h2 className="text-xs font-black">แนวโน้มฝนตกสะสมรายวัน</h2>
                      <p className="mt-1 text-[10px] text-slate-500">เฉลี่ยเชิงพื้นที่กรุงเทพฯ (มิลลิเมตร)</p>
                      <div className="mt-4 h-[360px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendRows} margin={{ left: 12, right: 12 }}>
                            <defs>
                              <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="label" stroke="#64748b" fontSize={8} />
                            <YAxis stroke="#64748b" fontSize={9} unit=" มม." />
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 11 }}
                              formatter={(value) => [`${Number(value).toFixed(1)} มม.`, "ปริมาณฝน"]} />
                            <Area type="monotone" dataKey="rainfall_mm" stroke="#0ea5e9" strokeWidth={2} fillOpacity={1} fill="url(#rainGrad)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {viewMode === "table" && (
                <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
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
                    districts={districts}
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
        </div>
      </main>
    </div>
  );
}
