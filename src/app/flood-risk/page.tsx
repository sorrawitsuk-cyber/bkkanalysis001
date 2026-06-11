/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import MapSkeleton from "@/components/ui/MapSkeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MapControlPanel from "@/components/map/MapControlPanel";
import FloodRiskSidebar from "@/components/gee/FloodRiskSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import * as turf from "@turf/turf";
import { TrendingUp, TrendingDown, MapPin, X, Download, FileText } from "lucide-react";
import bkkDistricts from "@/data/bkk_districts.json";
import {
  fetchCacheIndex,
  fetchCacheMetadata,
  getCacheLayerPreviewUrl,
  type SatelliteCacheIndex,
  type SatelliteCacheMetadata,
} from "@/lib/satellite-cache";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel, downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import DistrictDataTable, { type ColDef } from "@/components/stats/DistrictDataTable";
import PlainLanguageGuide from "@/components/analysis/PlainLanguageGuide";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area, ReferenceLine,
} from "recharts";
import { Lightbulb, Activity as ActivityIcon, ChevronLeft, ChevronRight } from "lucide-react";

const FloodRiskMapView = dynamic(() => import("@/components/map/FloodRiskMapView"), { ssr: false, loading: () => <MapSkeleton /> });

type MapMode = "district" | "satellite-cache" | "idw";

const WATER_CACHE_LAYERS = ["ndwi_mean", "ndwi_max", "mndwi_mean"] as const;
type WaterCacheLayer = typeof WATER_CACHE_LAYERS[number];

const WATER_LAYER_LABELS: Record<WaterCacheLayer, string> = {
  ndwi_mean:  "NDWI (mean)",
  ndwi_max:   "NDWI (max)",
  mndwi_mean: "MNDWI (mean)",
};

let _bkk: any = (bkkDistricts.features as any[])[0];
for (let i = 1; i < (bkkDistricts.features as any[]).length; i++) {
  _bkk = turf.union(turf.featureCollection([_bkk, (bkkDistricts.features as any[])[i]]));
}
const BKK_INVERTED_MASK = turf.mask(_bkk);

const DISTRICT_AREA_RAI = new Map<number, number>(
  (bkkDistricts.features as any[]).map((feature: any) => [
    Number(feature.properties.id),
    Math.round(turf.area(feature) / 1600),
  ]),
);

function getLayerValue(row: any, layer: WaterCacheLayer): number | null {
  const value = row?.[layer];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (layer === "ndwi_max") {
    const fallback = row?.ndwi_mean;
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : null;
  }
  return null;
}

function applyJrcCorrection(
  rawRatio: number | null,
  seasonalFromCache: number | null,
  jrcFraction: number,
): number | null {
  if (seasonalFromCache != null) return seasonalFromCache; // cache has exact value
  if (rawRatio == null) return null;
  return parseFloat(Math.max(0, rawRatio - jrcFraction).toFixed(4));
}

function buildFloodRiskView(
  meta: SatelliteCacheMetadata | null,
  baselineMeta: SatelliteCacheMetadata | null,
  selectedYear: number,
  compareYearVal: number | null,
  selectedLayer: WaterCacheLayer,
  jrcBaseline: Record<number, number> = {},
) {
  const rows = (meta?.district_stats ?? []) as any[];
  const baselineRows = (baselineMeta?.district_stats ?? []) as any[];
  const rowById = new Map(rows.map((r: any) => [Number(r.district_id), r]));
  const baselineById = new Map(baselineRows.map((r: any) => [Number(r.district_id), r]));

  let minValue = Infinity;
  let maxValue = -Infinity;

  const features = (bkkDistricts.features as any[]).map((feature: any) => {
    const districtId = Number(feature.properties.id);
    const row = rowById.get(districtId);
    const rawWaterRatio: number | null = row?.water_ratio ?? null;
    const jrcFraction = jrcBaseline[districtId] ?? 0;
    // seasonal_water_ratio = river/canal excluded; derive from cache or apply JRC correction
    const seasonalWaterRatio = applyJrcCorrection(rawWaterRatio, row?.seasonal_water_ratio ?? null, jrcFraction);
    const layerValue = getLayerValue(row, selectedLayer);
    const districtAreaRai = DISTRICT_AREA_RAI.get(districtId) ?? null;
    // Water area is based on seasonal (river-excluded) ratio
    const waterAreaRai = seasonalWaterRatio !== null && districtAreaRai !== null
      ? Math.round(seasonalWaterRatio * districtAreaRai)
      : null;
    // Compare (baseline) — also apply JRC correction
    const baselineRow = compareYearVal !== null ? baselineById.get(districtId) : null;
    const rawCompareRatio: number | null = baselineRow?.water_ratio ?? null;
    const compareRatio = applyJrcCorrection(rawCompareRatio, baselineRow?.seasonal_water_ratio ?? null, jrcFraction);
    const delta = seasonalWaterRatio !== null && compareRatio !== null
      ? +(seasonalWaterRatio - compareRatio).toFixed(4) : null;

    if (seasonalWaterRatio !== null) {
      minValue = Math.min(minValue, seasonalWaterRatio);
      maxValue = Math.max(maxValue, seasonalWaterRatio);
    }

    return {
      ...feature,
      properties: {
        ...feature.properties,
        water_ratio: rawWaterRatio,
        seasonal_water_ratio: seasonalWaterRatio,
        water_area_rai: waterAreaRai,
        district_area_rai: districtAreaRai,
        delta,
        compare_water_ratio: compareRatio,
        ndwi_mean: row?.ndwi_mean ?? null,
        ndwi_max: row?.ndwi_max ?? null,
        mndwi_mean: row?.mndwi_mean ?? null,
        display_value: layerValue,
        display_area_rai: waterAreaRai,
        display_layer: selectedLayer,
        display_label: WATER_LAYER_LABELS[selectedLayer],
        river_corrected: jrcFraction > 0 || (row?.seasonal_water_ratio != null),
      },
    };
  });

  const validRows = rows.filter((r: any) => typeof getLayerValue(r, selectedLayer) === "number");
  const avgDisplayValue = validRows.length
    ? parseFloat((validRows.reduce((s: number, r: any) => s + (getLayerValue(r, selectedLayer) ?? 0), 0) / validRows.length).toFixed(4))
    : null;
  // Average and totals use corrected (river-excluded) seasonal ratios
  const correctedFeatures = features.filter((f: any) => f.properties.seasonal_water_ratio != null);
  const avgWaterRatio = correctedFeatures.length
    ? parseFloat((correctedFeatures.reduce((s: number, f: any) => s + f.properties.seasonal_water_ratio, 0) / correctedFeatures.length).toFixed(4))
    : null;
  const baselineCorrectedFeatures = features.filter((f: any) => f.properties.compare_water_ratio != null);
  const baselineAvg = baselineCorrectedFeatures.length
    ? parseFloat((baselineCorrectedFeatures.reduce((s: number, f: any) => s + f.properties.compare_water_ratio, 0) / baselineCorrectedFeatures.length).toFixed(4))
    : null;
  const avgDelta = avgWaterRatio !== null && baselineAvg !== null
    ? parseFloat((avgWaterRatio - baselineAvg).toFixed(4)) : null;

  const ranking = [...validRows]
    .sort((a: any, b: any) => (getLayerValue(b, selectedLayer) ?? -Infinity) - (getLayerValue(a, selectedLayer) ?? -Infinity))
    .map((r: any) => {
      const dId = Number(r.district_id);
      const areaRai = DISTRICT_AREA_RAI.get(dId) ?? null;
      const corrected = applyJrcCorrection(r.water_ratio ?? null, r.seasonal_water_ratio ?? null, jrcBaseline[dId] ?? 0);
      const waterAreaRai = corrected != null && areaRai != null ? Math.round(corrected * areaRai) : null;
      return [r.district_name ?? "ไม่ระบุ", corrected ?? getLayerValue(r, selectedLayer), waterAreaRai];
    });
  const totalWaterAreaRai = correctedFeatures.length > 0
    ? correctedFeatures.reduce((sum: number, f: any) => sum + (f.properties.water_area_rai ?? 0), 0)
    : null;
  const riverCorrected = Object.keys(jrcBaseline).length > 0 || rows.some((r: any) => r.seasonal_water_ratio != null);

  return {
    geojson: { type: "FeatureCollection", features },
    summary: {
      selectedYear,
      compareYear: compareYearVal,
      avgWaterRatio,
      avgDisplayValue,
      totalWaterAreaRai,
      baselineAvg,
      avgDelta,
      topWet: ranking.slice(0, 5),
      topDry: [...ranking].reverse().slice(0, 5),
      ranking,
      yearlyTrend: [],
      waterAreaTrend: [],
      min_value: minValue !== Infinity ? minValue : 0,
      max_value: maxValue !== -Infinity ? maxValue : 0.5,
      displayLayer: selectedLayer,
      displayLabel: WATER_LAYER_LABELS[selectedLayer],
      dataSource: "R2 cache (Sentinel-2)",
      dataQuality: rows.length ? "observed" : "unavailable",
      sourceLabel: rows.length ? "Sentinel-2 ผ่าน R2 cache" : null,
      sourceNote: rows.length
        ? "ตรวจสัญญาณน้ำหรือความชื้นจาก NDWI ไม่ใช่แบบจำลองยืนยันขอบเขตน้ำท่วม"
        : "ไม่พบข้อมูลดาวเทียมสำหรับช่วงเวลาที่เลือก",
      cacheStatus: meta?.status ?? "pending",
      riverCorrected,
    },
  };
}

function lerpColor(lo: [number, number, number], hi: [number, number, number], t: number): string {
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * t);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * t);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * t);
  return `rgb(${r},${g},${b})`;
}
const BAR_LOW: [number, number, number] = [186, 230, 253];
const BAR_HIGH: [number, number, number] = [3, 105, 161];
const FLOOD_METRIC_GUIDE = [
  { label: "ดัชนี", value: "NDWI/MNDWI", description: "สัญญาณน้ำจากภาพดาวเทียม ใช้ดูแนวโน้มและความชื้น" },
  { label: "หนาแน่น", value: "% ของเขต", description: "สัดส่วนพื้นที่น้ำเทียบกับขนาดเขต เหมาะสำหรับเปรียบเทียบข้ามเขต" },
  { label: "พื้นที่", value: "ไร่", description: "ขนาดพื้นที่น้ำจริง เหมาะสำหรับดูเขตที่มีแหล่งน้ำรวมมาก" },
] as const;

export default function FloodRiskPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<MapMode>("district");
  const [granularity, setGranularity] = useState<"district" | "subdistrict">("district");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");

  const [cacheIndex, setCacheIndex] = useState<SatelliteCacheIndex | null>(null);
  const [yearlyMeta, setYearlyMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [cacheLayer, setCacheLayer] = useState<WaterCacheLayer>("ndwi_mean");
  const [cacheDataMissing, setCacheDataMissing] = useState(false);
  const [jrcBaseline, setJrcBaseline] = useState<Record<number, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const cached = localStorage.getItem("jrc-baseline-v1");
      return cached ? JSON.parse(cached) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    setLoading(true);
    const cacheType   = selectedMonth ? "monthly" : "yearly";
    const cachePeriod = selectedMonth
      ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
      : selectedYear.toString();
    const compareYearStr = compareYear.toString();

    setCacheDataMissing(false);
    Promise.all([
      fetchCacheMetadata(cacheType, cachePeriod),
      compareMode ? fetchCacheMetadata("yearly", compareYearStr) : Promise.resolve(null),
    ])
      .then(async ([meta, baselineMeta]) => {
        setYearlyMeta(meta);
        const stats = (meta?.district_stats ?? []) as any[];
        const hasWaterCache = stats.some((r: any) => typeof r.water_ratio === "number");

        if (hasWaterCache) {
          const built = buildFloodRiskView(meta, baselineMeta, selectedYear, compareMode ? compareYear : null, cacheLayer, jrcBaseline);
          setGeojsonData(built.geojson);
          setSummary(built.summary);
          setLoading(false);
          return;
        }

        // No cache data for this period — flag it so the UI can warn the user
        if (selectedMonth) setCacheDataMissing(true);

        const params = new URLSearchParams({ year: selectedYear.toString() });
        if (activeDistrict !== "ทั้งหมด") params.append("district", activeDistrict);
        if (compareMode) params.append("compareYear", compareYearStr);

        const res = await fetch(`/api/flood-risk?${params}`);
        if (res.ok) {
          const data = await res.json();
          setGeojsonData(data.geojson);
          setSummary({ ...data.summary, cacheStatus: meta?.status ?? "pending" });
        } else {
          const built = buildFloodRiskView(null, null, selectedYear, null, cacheLayer, jrcBaseline);
          setGeojsonData(built.geojson);
          setSummary({
            ...built.summary,
            dataSource: "ไม่มีข้อมูลปีนี้ ระบบกำลังประมวลผล",
            dataQuality: "unavailable",
            sourceNote: "ไม่พบข้อมูลดาวเทียมสำหรับปีที่เลือก",
            cacheStatus: "pending",
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (selectedMonth) setCacheDataMissing(true);
        const built = buildFloodRiskView(null, null, selectedYear, null, cacheLayer, jrcBaseline);
        setGeojsonData(built.geojson);
        setSummary({
          ...built.summary,
          dataSource: "ไม่มีข้อมูลปีนี้ ระบบกำลังประมวลผล",
          dataQuality: "unavailable",
          sourceNote: "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
          cacheStatus: "pending",
        });
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDistrict, selectedYear, selectedMonth, compareMode, compareYear, cacheLayer, jrcBaseline]);

  useEffect(() => { fetchCacheIndex().then(setCacheIndex); }, []);

  // Fetch JRC permanent water fractions once (cached in localStorage for 30 days)
  useEffect(() => {
    if (Object.keys(jrcBaseline).length > 0) return;
    fetch("/api/flood-risk/jrc-baseline")
      .then((r) => r.json())
      .then((data) => {
        if (data.fractions && Object.keys(data.fractions).length > 0) {
          setJrcBaseline(data.fractions);
          try { localStorage.setItem("jrc-baseline-v1", JSON.stringify(data.fractions)); } catch { /* ignore */ }
        }
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cacheIndex?.yearly?.length) return;
    Promise.all(
      (cacheIndex.yearly as string[]).map((yr) =>
        fetchCacheMetadata("yearly", yr).then((m) => {
          const stats = (m?.district_stats ?? []) as any[];
          const vals  = stats
            .map((r: any) => getLayerValue(r, cacheLayer))
            .filter((v: any): v is number => typeof v === "number" && Number.isFinite(v));
          const avg = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          return [yr, avg !== null ? +avg.toFixed(4) : null] as [string, number | null];
        })
      )
    )
      .then((rows) => {
        const trend = rows
          .filter((r): r is [string, number] => r[1] !== null)
          .sort((a, b) => Number(a[0]) - Number(b[0]));
        if (trend.length > 1) {
          setSummary((prev: any) => (prev ? { ...prev, yearlyTrend: trend } : prev));
        }
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheIndex, cacheLayer]);

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setSelectedMonth(null);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode("district");
    setGranularity("district");
    setOpacity(0.78);
    setBaseMap("dark");
    setCacheLayer("ndwi_mean");
    setCacheDataMissing(false);
  };

  const cachePreviewUrl = getCacheLayerPreviewUrl(yearlyMeta, cacheLayer);

  const allDistricts = useMemo((): string[] =>
    [...new Set<string>((geojsonData?.features ?? []).map((f: any) => f.properties.name_th as string).filter((s: unknown): s is string => !!s))]
      .sort((a, b) => a.localeCompare(b, "th")),
    [geojsonData],
  );

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  const periodLabel = selectedMonth
    ? buildPeriodLabel(selectedYear, selectedMonth)
    : selectedYear === new Date().getFullYear()
      ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
      : `1 ม.ค. – 31 ธ.ค. ${selectedYear}`;

  const csvFilename = `flood-risk_${selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear}`;
  const csvHeaders = ["เขต", WATER_LAYER_LABELS[cacheLayer], "พื้นที่ตรวจพบสัญญาณน้ำ (ไร่)", "Layer", "ช่วงเวลา"];

  const rankingForExport: (string | number | null)[][] = (summary?.ranking ?? []).map(
    ([name, val, areaRai]: [string, number | null, number | null]) => [
      name,
      val !== null ? +val.toFixed(4) : null,
      areaRai ?? null,
      WATER_LAYER_LABELS[cacheLayer] ?? cacheLayer,
      selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}` : selectedYear,
    ],
  );

  const reportData = useMemo((): PDFReportData => ({
    title: "วิเคราะห์สัญญาณน้ำและความชื้น",
    subtitle: "Sentinel-2 SR Harmonized",
    source: "Sentinel-2 (R2 Cache)",
    period: periodLabel,
    layer: WATER_LAYER_LABELS[cacheLayer],
    district: activeDistrict,
    kpis: [
      { label: "Water Ratio เฉลี่ย", value: summary?.avgWaterRatio !== null ? `${(+(summary?.avgWaterRatio ?? 0) * 100).toFixed(2)}%` : "–" },
      { label: "พื้นที่น้ำรวม", value: summary?.totalWaterAreaRai != null ? `${summary.totalWaterAreaRai.toLocaleString()} ไร่` : "–" },
      { label: "ปีที่เลือก", value: String(selectedYear) },
    ],
    rankingHeaders: ["เขต", WATER_LAYER_LABELS[cacheLayer], "พื้นที่น้ำ (ไร่)"],
    rankingRows: rankingForExport.map(([name, val, area]) => [name, val, area]),
  }), [periodLabel, cacheLayer, activeDistrict, summary, selectedYear, rankingForExport]);

  // ── Stats computed data ───────────────────────────────────────────────────
  const statsAllFeatures = useMemo(() => {
    if (!geojsonData?.features) return [];
    return (geojsonData.features as any[])
      .map((f: any) => ({
        name: f.properties.name_th ?? "–",
        water_ratio: typeof f.properties.water_ratio === "number" ? f.properties.water_ratio : null,
        water_ratio_pct: typeof f.properties.water_ratio === "number" ? +(f.properties.water_ratio * 100).toFixed(2) : null,
        water_area_rai: f.properties.water_area_rai ?? null,
        district_area_rai: f.properties.district_area_rai ?? null,
        ndwi_mean: f.properties.ndwi_mean ?? null,
        ndwi_max: f.properties.ndwi_max ?? null,
        mndwi_mean: f.properties.mndwi_mean ?? null,
        display_value: f.properties.display_value ?? null,
        delta: f.properties.delta ?? null,
        compare_water_ratio: f.properties.compare_water_ratio ?? null,
      }))
      .filter((d: any) => d.name !== "–")
      .sort((a: any, b: any) => (b.water_ratio_pct ?? -Infinity) - (a.water_ratio_pct ?? -Infinity));
  }, [geojsonData]);

  const statsBarData = useMemo(() => {
    const base = activeDistrict === "ทั้งหมด"
      ? statsAllFeatures
      : statsAllFeatures.filter((d: any) => d.name === activeDistrict);
    return base.filter((d: any) => d.water_ratio_pct !== null);
  }, [statsAllFeatures, activeDistrict]);

  const statsWaterAreaRanking = useMemo(() => {
    const base = activeDistrict === "ทั้งหมด"
      ? statsAllFeatures
      : statsAllFeatures.filter((d: any) => d.name === activeDistrict);
    return [...base]
      .filter((d: any) => typeof d.water_area_rai === "number")
      .sort((a: any, b: any) => (b.water_area_rai ?? -Infinity) - (a.water_area_rai ?? -Infinity));
  }, [statsAllFeatures, activeDistrict]);

  const maxStatsWaterAreaRai = useMemo(() => (
    statsWaterAreaRanking.length
      ? Math.max(...statsWaterAreaRanking.map((d: any) => Number(d.water_area_rai ?? 0)), 1)
      : 1
  ), [statsWaterAreaRanking]);

  // Statistical summary of water_ratio values
  const statsComputed = useMemo(() => {
    const vals = statsAllFeatures.map((d: any) => d.water_ratio).filter((v: any): v is number => v != null);
    if (!vals.length) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = vals.reduce((s: number, v: number) => s + v, 0) / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const stdDev = Math.sqrt(vals.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / n);
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const aboveThreshold = vals.filter((v: number) => v * 100 >= 4).length; // ≥4% water
    return { mean, median, min: sorted[0], max: sorted[n - 1], stdDev, q1, q3, n, aboveThreshold };
  }, [statsAllFeatures]);

  // Auto-insights
  const statsInsights = useMemo(() => {
    if (!statsComputed || !statsBarData.length) return [];
    const insights: string[] = [];
    const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
    insights.push(`ค่าเฉลี่ย water ratio ทุกเขต: ${pct(statsComputed.mean)} (Median: ${pct(statsComputed.median)})`);
    if (statsBarData[0]) insights.push(`${statsBarData[0].name} มีสัดส่วนพื้นที่น้ำสูงสุด: ${pct(statsBarData[0].water_ratio ?? 0)}`);
    if (statsWaterAreaRanking[0]) insights.push(`${statsWaterAreaRanking[0].name} มีพื้นที่แหล่งน้ำมากที่สุด: ${Number(statsWaterAreaRanking[0].water_area_rai).toLocaleString()} ไร่`);
    if (statsComputed.aboveThreshold > 0)
      insights.push(`${statsComputed.aboveThreshold} เขต (${Math.round(statsComputed.aboveThreshold / statsComputed.n * 100)}%) มีสัดส่วนน้ำ ≥ 4% ของพื้นที่เขต`);
    const cv = (statsComputed.stdDev / statsComputed.mean) * 100;
    insights.push(`การกระจาย: ${cv < 20 ? "ใกล้เคียงกัน" : cv < 50 ? "กระจายปานกลาง" : "กระจายสูงมาก"} (CV = ${cv.toFixed(1)}%)`);
    const trendRows: [string, number][] = summary?.yearlyTrend ?? [];
    if (trendRows.length >= 2) {
      const first = Number(trendRows[0][1]);
      const last = Number(trendRows[trendRows.length - 1][1]);
      const delta = last - first;
      insights.push(`แนวโน้ม ${trendRows[0][0]}–${trendRows[trendRows.length - 1][0]}: ${delta > 0 ? "น้ำเพิ่มขึ้น" : "น้ำลดลง"} ${Math.abs(delta * 100).toFixed(2)}pp`);
    }
    return insights.slice(0, 5);
  }, [statsComputed, statsBarData, statsWaterAreaRanking, summary?.yearlyTrend]);

  const statsTrendData = useMemo(() => {
    return (summary?.yearlyTrend ?? []).map(([year, val]: any) => ({
      year: String(year),
      value: typeof val === "number" ? +val.toFixed(4) : null,
    }));
  }, [summary?.yearlyTrend]);

  // Table columns — comprehensive
  const tableColumns: ColDef[] = [
    { key: "name", label: granularity === "subdistrict" ? "แขวง" : "เขต", sortable: false },
    ...(granularity === "subdistrict" ? [{ key: "district", label: "เขตแม่", sortable: false, hideable: true } as ColDef] : []),
    { key: "water_ratio", label: "ความหนาแน่นพื้นที่น้ำรายเขต", unit: "% พื้นที่เขต", format: (v) => v != null ? (v * 100).toFixed(2) : "–", heatmap: true, heatmapHex: "#3b82f6" },
    { key: "water_area_rai", label: "พื้นที่น้ำ", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", heatmap: true, heatmapHex: "#60a5fa" },
    { key: "ndwi_mean", label: "NDWI mean", format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#06b6d4" },
    { key: "ndwi_max",  label: "NDWI max",  format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#0284c7", hideable: true },
    { key: "mndwi_mean",label: "MNDWI mean",format: (v) => v != null ? Number(v).toFixed(4) : "–", heatmap: true, heatmapHex: "#7c3aed", hideable: true },
    { key: "district_area_rai", label: "พื้นที่เขต", unit: "ไร่", format: (v) => v != null ? Number(v).toLocaleString() : "–", hideable: true },
    ...(compareMode ? [
      { key: "delta", label: "Δ สัดส่วนน้ำ", format: (v: any) => v != null ? `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)}%` : "–", heatmap: true, heatmapHex: "#f59e0b" } as ColDef,
      { key: "compare_water_ratio", label: `ปี ${compareYear}`, unit: "%", format: (v: any) => v != null ? `${(v * 100).toFixed(2)}` : "–", hideable: true } as ColDef,
    ] : []),
  ];

  // Legend config
  let legendConfig: { title: string; description: string; unit: string; items: { color: string; label: string; range: string }[] };
  if (compareMode && mapMode === "idw") {
    legendConfig = {
      title: `ผลต่าง ${WATER_LAYER_LABELS[cacheLayer]} จากภาพดาวเทียม`,
      description: `ค่าดัชนีปี ${selectedYear} ลบปีฐาน ${compareYear}; ค่าบวกหมายถึงสัญญาณน้ำ/ความชื้นเพิ่มขึ้น`,
      unit: "",
      items: [
        { color: "#1e3a5f", label: "เพิ่มขึ้นมาก", range: "> +0.15" },
        { color: "#0369a1", label: "เพิ่มขึ้น", range: "+0.05 ถึง +0.15" },
        { color: "#94a3b8", label: "ใกล้เคียงเดิม", range: "-0.05 ถึง +0.05" },
        { color: "#b45309", label: "ลดลง", range: "-0.15 ถึง -0.05" },
        { color: "#78350f", label: "ลดลงมาก", range: "< -0.15" },
      ],
    };
  } else if (compareMode) {
    legendConfig = {
      title: "การเปลี่ยนแปลงพื้นที่น้ำ",
      description: `ค่าน้ำปี ${selectedYear} ลบปีฐาน ${compareYear} (บวก = น้ำเพิ่ม)`,
      unit: "",
      items: [
        { color: "#1e3a5f", label: "น้ำเพิ่มมาก", range: "> +10%" },
        { color: "#0369a1", label: "น้ำเพิ่ม", range: "+3% ถึง +10%" },
        { color: "#94a3b8", label: "ใกล้เคียงเดิม", range: "-3% ถึง +3%" },
        { color: "#b45309", label: "น้ำลด", range: "-10% ถึง -3%" },
        { color: "#78350f", label: "น้ำลดมาก", range: "< -10%" },
      ],
    };
  } else if (mapMode === "satellite-cache" && (cacheLayer === "ndwi_mean" || cacheLayer === "ndwi_max")) {
    legendConfig = {
      title: `NDWI — ดัชนีน้ำผิวดิน (${WATER_LAYER_LABELS[cacheLayer]})`,
      description: "ค่าสูง = น้ำ/ความชื้นสูง  ค่าต่ำ = ดินแห้ง พืช หรือสิ่งปลูกสร้าง",
      unit: "",
      items: [
        { color: "#92400E", label: "ดินแห้ง/พืช",   range: "< -0.30" },
        { color: "#C4974A", label: "กึ่งแห้ง",      range: "-0.30 ถึง -0.10" },
        { color: "#F7F7F7", label: "กลาง",           range: "-0.10 ถึง 0.10" },
        { color: "#7EC8E3", label: "ชื้น/น้ำตื้น",  range: "0.10 ถึง 0.30" },
        { color: "#0369A1", label: "น้ำผิวดิน",     range: "> 0.30" },
      ],
    };
  } else if (mapMode === "satellite-cache") {
    legendConfig = {
      title: "MNDWI — ดัชนีน้ำในเมือง (mean)",
      description: "แม่นกว่า NDWI ในพื้นที่เมือง ลดการรบกวนจากสิ่งปลูกสร้าง",
      unit: "",
      items: [
        { color: "#92400E", label: "ดิน/พืช",       range: "< -0.30" },
        { color: "#C4974A", label: "กึ่งแห้ง",      range: "-0.30 ถึง -0.10" },
        { color: "#F7F7F7", label: "กลาง",           range: "-0.10 ถึง 0.10" },
        { color: "#60ACD8", label: "น้ำตื้น/ชื้น",  range: "0.10 ถึง 0.30" },
        { color: "#0284C7", label: "น้ำ/คลอง",      range: "> 0.30" },
      ],
    };
  } else {
    legendConfig = {
      title: summary?.riverCorrected
        ? "สัดส่วนพื้นที่น้ำรายเขต (ไม่รวมแม่น้ำถาวร)"
        : "สัดส่วนพื้นที่น้ำรายเขต (อาจรวมแหล่งน้ำถาวร)",
      description: summary?.riverCorrected
        ? "สัดส่วนพิกเซล NDWI > 0.05 ต่อพื้นที่เขต หลังตัดแหล่งน้ำถาวรด้วย JRC"
        : "สัดส่วนพิกเซล NDWI > 0.05 ต่อพื้นที่เขต โดยยังไม่มีหลักฐานว่าตัดแหล่งน้ำถาวรแล้ว",
      unit: "",
      items: [
        { color: "#bae6fd", label: "แห้งมาก",       range: "< 1.5%" },
        { color: "#7dd3fc", label: "มีน้ำน้อย",     range: "1.5% – 4%" },
        { color: "#0ea5e9", label: "มีน้ำปานกลาง", range: "4% – 8%" },
        { color: "#0369a1", label: "มีน้ำมาก",      range: "8% – 15%" },
        { color: "#075985", label: "สัญญาณน้ำสูงมาก", range: "> 15%" },
      ],
    };
  }

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <FloodRiskSidebar
          onDistrictSelect={setActiveDistrict}
          activeDistrict={activeDistrict}
          summary={summary}
          geojsonData={displayGeoJson}
          loading={loading}
          compareMode={compareMode}
          mapMode={mapMode}
          granularity={granularity}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Tab bar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
          <ViewTabs view={viewMode} onChange={setViewMode} accentColor="sky" />
          <div className="flex items-center gap-1.5">
            <select
              value={activeDistrict}
              onChange={(e) => setActiveDistrict(e.target.value)}
              className="h-7 rounded-lg border border-slate-700 bg-slate-900/80 px-2 text-[11px] text-slate-300 focus:border-slate-500 focus:outline-none"
            >
              <option value="ทั้งหมด">ทุกเขต</option>
              {allDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {activeDistrict !== "ทั้งหมด" && (
              <button
                onClick={() => setActiveDistrict("ทั้งหมด")}
                className="flex items-center justify-center h-7 w-7 rounded-lg border border-slate-700 bg-slate-900/80 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {viewMode !== "map" && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => downloadCSV(csvHeaders, rankingForExport, csvFilename)}
                className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-700 bg-slate-900/80 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <button
                onClick={() => printReport(reportData)}
                className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-sky-700/50 bg-sky-950/30 text-[11px] text-sky-400 hover:text-sky-200 transition-colors"
              >
                <FileText className="h-3 w-3" /> PDF
              </button>
            </div>
          )}
          <div className="ml-auto text-[10px] text-slate-500">
            {loading ? "กำลังโหลด…" : `${selectedYear}${selectedMonth ? `-${String(selectedMonth).padStart(2, "0")}` : ""} • ${WATER_LAYER_LABELS[cacheLayer]}`}
          </div>
        </div>

        {/* Map view */}
        {viewMode === "map" && (
          <div className="flex flex-1 min-h-0">
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-0 z-0">
                <ErrorBoundary>
                  <FloodRiskMapView
                    geojsonData={displayGeoJson}
                    invertedMask={BKK_INVERTED_MASK}
                    activeDistrict={activeDistrict}
                    mapMode={mapMode}
                    compareMode={compareMode}
                    summary={summary}
                    opacity={opacity}
                    baseMap={baseMap}
                    satelliteCachePreviewUrl={cachePreviewUrl}
                    satelliteCacheBounds={yearlyMeta?.bounds}
                    granularity={granularity}
                    ndwiMetric={cacheLayer === "mndwi_mean" ? "mndwi" : "ndwi"}
                  />
                </ErrorBoundary>
              </div>

              {/* Data source info */}
              <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${summary?.dataQuality === "unavailable" ? "bg-slate-500" : summary?.dataQuality === "unknown" ? "bg-amber-400" : mapMode === "satellite-cache" ? "bg-sky-400" : "bg-cyan-500"}`} />
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">สถานะแหล่งข้อมูล</span>
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {summary?.dataQuality === "unavailable" ? (
                    <>
                      <p className="font-bold text-slate-300">ยังไม่มีข้อมูลสำหรับช่วงเวลานี้</p>
                      <p>{summary?.sourceNote ?? "ไม่พบข้อมูลดาวเทียมสำหรับปีที่เลือก"}</p>
                    </>
                  ) : summary?.dataQuality === "unknown" ? (
                    <>
                      <p><span className="text-white">Source:</span> {summary?.dataSource}</p>
                      <p><span className="text-white">Period:</span> {periodLabel}</p>
                      <p className="text-amber-300/80">{summary?.sourceNote}</p>
                    </>
                  ) : mapMode === "idw" ? (
                    <>
                      <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
                      <p><span className="text-white">Period:</span> {periodLabel}</p>
                      <p><span className="text-white">Layer:</span> {WATER_LAYER_LABELS[cacheLayer] ?? cacheLayer} (GEE Live)</p>
                      <p><span className="text-white">Resolution:</span> 10m per pixel (real-time)</p>
                    </>
                  ) : (
                    <>
                      <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
                      <p><span className="text-white">Period:</span> {periodLabel}</p>
                      <p><span className="text-white">Index:</span> water_ratio (NDWI-based)</p>
                      <p><span className="text-white">Resolution:</span> district-level</p>
                    </>
                  )}
                </div>
              </div>

              {/* Legend */}
              <div className="absolute bottom-4 right-4 z-[1000] w-80 max-w-[calc(100%-2rem)] rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
                <div className="mb-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">สัญลักษณ์แผนที่</h4>
                  <p className="mt-1 text-[10px] leading-snug text-slate-400">{legendConfig.title}</p>
                  <p className="mt-1 text-[9px] leading-snug text-slate-500">{legendConfig.description}</p>
                </div>
                <div className="space-y-2">
                  {legendConfig.items.map((item) => (
                    <div key={`${item.color}-${item.range}`} className="grid grid-cols-[14px_1fr_auto] items-center gap-2 text-[10px]">
                      <span className="h-3.5 w-3.5 rounded-sm border border-white/10" style={{ backgroundColor: item.color }} />
                      <span className="min-w-0 truncate text-slate-300">{item.label}</span>
                      <span className="font-mono text-[9px] text-slate-400">{item.range} {legendConfig.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right control panel */}
            <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
              <div className="flex min-h-full flex-col gap-3">

                <MapControlPanel
                  accent="sky"
                  granularity={granularity}
                  onGranularityChange={setGranularity}
                  mapMode={mapMode}
                  mapModes={[
                    { value: "district", label: "สรุปรายพื้นที่", description: "ระบายสีพื้นที่ด้วยสัดส่วนพิกเซลน้ำที่สรุปเป็นค่ารายเขต" },
                    { value: "idw", label: "ภาพรายพิกเซล", description: "แสดงดัชนีน้ำ NDWI/MNDWI จาก Sentinel-2 ผ่าน GEE ที่ความละเอียดประมาณ 10 เมตร" },
                  ]}
                  onMapModeChange={(m) => setMapMode(m as MapMode)}
                  showOpacity={mapMode === "idw"}
                  opacity={opacity}
                  onOpacityChange={setOpacity}
                  baseMap={baseMap}
                  onBaseMapChange={setBaseMap}
                  onReset={handleReset}
                  currentLayer={compareMode
                    ? mapMode === "idw" ? `ผลต่าง ${WATER_LAYER_LABELS[cacheLayer]}: ${selectedYear} - ${compareYear}` : `ผลต่างสัดส่วนพื้นที่น้ำ: ${selectedYear} - ${compareYear}`
                    : mapMode === "idw" ? WATER_LAYER_LABELS[cacheLayer] : "สัดส่วนพื้นที่น้ำรายเขต"}
                  currentPeriod={periodLabel}
                    dataSource={summary?.dataQuality === "unavailable"
                      ? "ยังไม่มีข้อมูลสำหรับช่วงเวลานี้"
                      : mapMode === "idw" ? "Sentinel-2 ผ่าน GEE" : summary?.sourceLabel ?? summary?.dataSource ?? "สถิติรายเขต"}
                  interactionHint={mapMode === "idw" ? "สีบนภาพคือค่าดัชนีน้ำรายพิกเซล ส่วน tooltip รายพื้นที่เป็นค่าสรุประดับเขต" : "วางเมาส์บนพื้นที่เพื่อดูสัดส่วนและขนาดพื้นที่น้ำ"}
                  granularityNote={granularity === "subdistrict" ? "ขอบเขตแขวงสืบทอดค่าสถิติจากเขตแม่ ไม่ใช่การคำนวณพื้นที่น้ำใหม่รายแขวง" : "สรุปและเลือกพื้นที่ตาม 50 เขต"}
                  extraControls={
                    <div className="mt-1 rounded-lg border border-sky-800/50 bg-sky-950/30 p-3 space-y-2">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">ชั้นข้อมูล (WATER)</p>
                      <div className="flex flex-col gap-1">
                        {WATER_CACHE_LAYERS.map((key) => (
                          <button key={key} onClick={() => setCacheLayer(key)} className={`text-[9px] px-2 py-1.5 rounded-lg border transition-all font-bold text-left ${cacheLayer === key ? "bg-sky-500/20 border-sky-500/60 text-sky-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}>
                            {WATER_LAYER_LABELS[key]}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                />

                <MonthYearPicker
                  year={selectedYear}
                  month={selectedMonth}
                  minYear={cacheIndex?.yearly?.length ? Math.min(...cacheIndex.yearly.map(Number)) : 2018}
                  maxYear={cacheIndex?.yearly?.length ? Math.max(...cacheIndex.yearly.map(Number)) : 2026}
                  availableMonths={cacheIndex?.monthly ?? []}
                  onYearChange={setSelectedYear}
                  onMonthChange={setSelectedMonth}
                  accentColor="sky"
                  compareMode={compareMode}
                  compareYear={compareYear}
                  onCompareModeChange={setCompareMode}
                  onCompareYearChange={setCompareYear}
                />

                {cacheDataMissing && selectedMonth !== null && !loading && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3">
                    <p className="text-[10px] font-bold text-amber-300 mb-1">ไม่มีข้อมูลรายเดือน</p>
                    <p className="text-[9px] text-slate-400 leading-snug">
                      ยังไม่มีข้อมูลแคชสำหรับ {buildPeriodLabel(selectedYear, selectedMonth)} กำลังแสดงข้อมูลรายปี {selectedYear} แทน หรือเลือกเดือนที่มีไฮไลต์ในปฏิทิน
                    </p>
                    <button
                      onClick={() => setSelectedMonth(null)}
                      className="mt-2 text-[9px] px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold hover:bg-amber-500/30 transition-colors"
                    >
                      ดูข้อมูลรายปี {selectedYear}
                    </button>
                  </div>
                )}

                <ExportPanel
                  accentColor="sky"
                  csvFilename={csvFilename}
                  csvHeaders={csvHeaders}
                  csvRows={rankingForExport}
                  reportData={reportData}
                />

                <div className="mt-auto bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-sky-500/20 shadow-2xl w-full">
                  <h4 className="text-[10px] font-bold text-sky-300 uppercase tracking-widest mb-2">หลักวิชาการที่ใช้</h4>
                  <div className="text-[10px] text-slate-400 leading-relaxed space-y-2">
                    <p>
                      <span className="text-slate-100 font-bold">NDWI</span> = (Green - NIR) / (Green + NIR) เป็นดัชนีตรวจสัญญาณน้ำผิวดินหรือความชื้นจากภาพดาวเทียม ไม่ใช่แบบจำลองน้ำท่วมโดยตรง
                    </p>
                    <p>
                      <span className="text-slate-100 font-bold">MNDWI</span> = (Green - SWIR) / (Green + SWIR) มักเหมาะกับเมืองมากขึ้น เพราะลดการรบกวนจาก built-up surface เมื่อเทียบกับ NDWI
                    </p>
                    <p>
                      <span className="text-sky-300 font-bold">Water ratio</span> คือสัดส่วนพิกเซลที่มีค่า NDWI มากกว่า 0.05 ใช้ตรวจสัญญาณน้ำหรือความชื้นรายเขต/แขวง
                    </p>
                    <p className="text-slate-500">
                      ค่า NDWI/MNDWI เป็นดัชนีดาวเทียม ควรอ่านร่วมกับฤดูกาล เมฆ และจำนวนภาพที่นำมาทำ composite
                    </p>
                  </div>
                </div>

              </div>
            </aside>
          </div>
        )}

        {/* ── Stats view — comprehensive ────────────────────────────────────── */}
        {viewMode === "stats" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">

            {/* Inline controls */}
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-700/60 bg-slate-900/50">
              {/* Year stepper */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">ปี</span>
                <button onClick={() => setSelectedYear((y) => Math.max(2018, y - 1))} disabled={selectedYear <= 2018}
                  className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-sm font-black font-mono text-sky-300 min-w-[3rem] text-center">{selectedYear}</span>
                <button onClick={() => setSelectedYear((y) => Math.min(2026, y + 1))} disabled={selectedYear >= 2026}
                  className="h-6 w-6 rounded border border-slate-700 text-slate-500 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 flex items-center justify-center transition-colors">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-4 w-px bg-slate-700/60 shrink-0" />
              {/* District selector */}
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-sky-400 shrink-0" />
                <select value={activeDistrict} onChange={(e) => setActiveDistrict(e.target.value)}
                  className="h-7 rounded border border-slate-700 bg-slate-900/60 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-sky-500/50">
                  <option value="ทั้งหมด">ทุกเขต (50 เขต)</option>
                  {allDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {activeDistrict !== "ทั้งหมด" && (
                  <button onClick={() => setActiveDistrict("ทั้งหมด")} className="h-5 w-5 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {/* Layer selector */}
              <div className="flex items-center gap-1 border border-slate-700/80 rounded-lg overflow-hidden">
                {WATER_CACHE_LAYERS.map((key) => (
                  <button key={key} onClick={() => setCacheLayer(key)}
                    className={`px-2.5 py-1 text-[9px] font-bold transition-colors ${cacheLayer === key ? "bg-sky-600 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                    {WATER_LAYER_LABELS[key]}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <span className="text-[9px] text-slate-600">{summary?.dataSource ?? "R2 Cache"} · {periodLabel}</span>
              {compareMode && summary?.avgDelta != null && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${summary.avgDelta > 0 ? "bg-sky-500/10 text-sky-400" : "bg-amber-500/10 text-amber-400"}`}>
                  {summary.avgDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  เทียบ {compareYear}: {summary.avgDelta > 0 ? "+" : ""}{(summary.avgDelta * 100).toFixed(2)}pp
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center"><span className="text-slate-500 animate-pulse">กำลังโหลด…</span></div>
            ) : !summary ? (
              <div className="flex flex-1 items-center justify-center"><span className="text-slate-600">ไม่มีข้อมูลช่วงนี้</span></div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* ── Stats strip ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-800/60">
                  {[
                    { label: "สัดส่วนเฉลี่ย", value: statsComputed ? `${(statsComputed.mean * 100).toFixed(2)}%` : "–", color: "text-slate-200" },
                    { label: "สัดส่วนสูงสุด", value: statsComputed ? `${(statsComputed.max * 100).toFixed(2)}%` : "–", color: "text-sky-400" },
                    { label: "สัดส่วนต่ำสุด", value: statsComputed ? `${(statsComputed.min * 100).toFixed(2)}%` : "–", color: "text-slate-400" },
                    { label: "พื้นที่แหล่งน้ำรวม", value: summary.totalWaterAreaRai ? `${summary.totalWaterAreaRai.toLocaleString()} ไร่` : "–", color: "text-blue-400" },
                  ].map((s, i) => (
                    <div key={i} className={`px-4 py-3 border-r border-slate-800/60 last:border-r-0 ${i % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/20"}`}>
                      <div className="text-[11px] font-semibold text-slate-500 mb-0.5">{s.label}</div>
                      <div className={`text-base font-black tabular-nums ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* ── Main section: bar chart + right column ─────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] border-b border-slate-800/60">

                  {/* Full 50-district bar chart */}
                  <div className="border-r border-slate-800/60 flex flex-col">
                    <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-800/40">
                      <div>
                        <h3 className="text-[13px] font-semibold text-slate-300">
                          ความหนาแน่นพื้นที่น้ำรายเขต
                        </h3>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {activeDistrict !== "ทั้งหมด" ? `กรองเฉพาะเขต: ${activeDistrict}` : "เรียงจากสัดส่วนพื้นที่น้ำมากไปน้อย"} · หน่วยเป็น % ของพื้นที่เขต · ปี {selectedYear}
                        </p>
                      </div>
                      <div className="text-[9px] px-2 py-0.5 rounded-full border border-sky-500/40 text-sky-400 bg-sky-500/10 font-bold">
                        เกณฑ์ 4%
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-2" style={{ minHeight: 320 }}>
                      <div style={{ height: Math.max(340, statsBarData.length * 18) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={statsBarData.map((d: any) => ({ ...d, value: d.water_ratio_pct }))} layout="vertical" margin={{ top: 0, right: 52, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const entry = statsBarData.find((d: any) => d.name === label);
                                return (
                                  <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-[11px] shadow-xl">
                                    <p className="font-bold text-slate-200">{label}</p>
                                    <p className="text-sky-400 font-mono">Water Ratio: {Number(payload[0].value).toFixed(2)}%</p>
                                    {entry?.water_area_rai != null && <p className="text-slate-500">พื้นที่น้ำ: {Number(entry.water_area_rai).toLocaleString()} ไร่</p>}
                                    {entry?.ndwi_mean != null && <p className="text-cyan-400 font-mono">NDWI mean: {entry.ndwi_mean.toFixed(4)}</p>}
                                    {statsComputed && <p className="text-slate-600">vs เฉลี่ย: {entry?.water_ratio != null ? `${((entry.water_ratio - statsComputed.mean) * 100).toFixed(2)}pp` : "–"}</p>}
                                  </div>
                                );
                              }}
                              cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            />
                            <ReferenceLine x={4} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1.5} />
                            <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={13}
                              label={{ position: "right", fontSize: 10, fill: "#64748b", formatter: (v: unknown) => `${Number(v).toFixed(1)}%` }}>
                              {statsBarData.map((_: any, i: number) => (
                                <Cell key={i} fill={lerpColor(BAR_LOW, BAR_HIGH, i / Math.max(statsBarData.length - 1, 1))} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Right: trend + distribution + insights */}
                  <div className="flex flex-col divide-y divide-slate-800/60 overflow-y-auto custom-scrollbar">

                    {/* Metric guide */}
                    <div className="px-5 py-4">
                      <h3 className="text-[13px] font-semibold text-slate-400 mb-3">
                        วิธีอ่านข้อมูล
                      </h3>
                      <div className="grid gap-2">
                        {FLOOD_METRIC_GUIDE.map((item) => (
                          <div key={item.label} className="rounded-md border border-slate-800 bg-slate-900/35 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-bold text-slate-300">{item.label}</span>
                              <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">{item.value}</span>
                            </div>
                            <p className="mt-1 text-[9px] leading-snug text-slate-500">{item.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Yearly trend (index) */}
                    <div className="px-5 py-4">
                      <h3 className="text-[13px] font-semibold text-slate-400 mb-3">
                        แนวโน้มรายปี — {WATER_LAYER_LABELS[cacheLayer]}
                      </h3>
                      {statsTrendData.length < 2 ? (
                        <div className="flex h-28 items-center justify-center text-slate-700 text-xs">ไม่มีข้อมูลรายปี (ต้องโหลด cache หลายปี)</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={160}>
                          <AreaChart data={statsTrendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                            <defs><linearGradient id="floodGradS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} /><stop offset="95%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                              formatter={(v: any) => [Number(v).toFixed(4), WATER_LAYER_LABELS[cacheLayer]]} />
                            <Area type="monotone" dataKey="value" stroke="#38bdf8" fill="url(#floodGradS)" strokeWidth={2} dot={{ r: 3, fill: "#38bdf8", strokeWidth: 0 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Water area ranking */}
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-400">
                            อันดับพื้นที่แหล่งน้ำมากสุด
                          </h3>
                          <p className="mt-0.5 text-[9px] text-slate-600">เรียงด้วยจำนวนไร่ ไม่ใช่เปอร์เซ็นต์ของเขต</p>
                        </div>
                        <span className="text-[9px] font-bold text-sky-400">
                          ไร่
                        </span>
                      </div>
                      {statsWaterAreaRanking.length === 0 ? (
                        <div className="flex h-24 items-center justify-center text-slate-700 text-xs">ไม่มีข้อมูลพื้นที่แหล่งน้ำ</div>
                      ) : (
                        <ol className="space-y-2">
                          {statsWaterAreaRanking.slice(0, 5).map((row: any, i: number) => {
                            const width = (Number(row.water_area_rai ?? 0) / maxStatsWaterAreaRai) * 100;
                            return (
                              <li key={`${row.name}-area-${i}`} className="space-y-1">
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="w-4 shrink-0 text-right font-mono text-slate-700">{i + 1}</span>
                                  <span className="min-w-0 flex-1 truncate text-slate-300">{row.name}</span>
                                  <span className="font-mono font-bold tabular-nums text-sky-400">{Number(row.water_area_rai).toLocaleString()} ไร่</span>
                                </div>
                                <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-sky-700 to-cyan-400 transition-all duration-700"
                                    style={{ width: `${Math.max(4, Math.min(100, width))}%` }}
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>

                    {/* Insights */}
                    {statsInsights.length > 0 && (
                      <div className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Lightbulb className="w-3.5 h-3.5 text-sky-400" />
                          <h3 className="text-[13px] font-semibold text-slate-400">ข้อสังเกตจากข้อมูล</h3>
                        </div>
                        <ul className="space-y-2">
                          {statsInsights.map((ins, i) => (
                            <li key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
                              <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-700 bg-slate-800">{i + 1}</span>
                              {ins}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  </div>
                </div>

                {/* ── Bottom: Top5 / Bot5 / Quartile ─────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-x divide-slate-800/60 border-t border-slate-800/60">

                  {/* Top 5 wet */}
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                      <h4 className="text-[12px] font-semibold text-slate-500">สัดส่วนพื้นที่น้ำสูงสุด 5 เขต</h4>
                    </div>
                    <ol className="space-y-1.5">
                      {statsBarData.slice(0, 5).map((row: any, i: number) => (
                        <li key={row.name + i} className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-700 w-4 shrink-0">{i + 1}</span>
                          <span className="flex-1 text-[12px] text-slate-300 truncate">{row.name}</span>
                          <span className="font-mono text-[11px] font-bold text-sky-400">{row.water_ratio_pct?.toFixed(2)}%</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Bot 5 wet (driest) */}
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingDown className="w-3.5 h-3.5 text-slate-400" />
                      <h4 className="text-[12px] font-semibold text-slate-500">สัดส่วนพื้นที่น้ำต่ำสุด 5 เขต</h4>
                    </div>
                    <ol className="space-y-1.5">
                      {[...statsBarData].reverse().slice(0, 5).map((row: any, i: number) => (
                        <li key={row.name + i} className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-700 w-4 shrink-0">{i + 1}</span>
                          <span className="flex-1 text-[12px] text-slate-300 truncate">{row.name}</span>
                          <span className="font-mono text-[11px] font-bold text-slate-400">{row.water_ratio_pct?.toFixed(2)}%</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Quartile stats */}
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ActivityIcon className="w-3.5 h-3.5 text-slate-500" />
                      <h4 className="text-[12px] font-semibold text-slate-500">สถิติสรุป</h4>
                    </div>
                    <div className="space-y-2">
                      {statsComputed && [
                        ["สัดส่วนเฉลี่ย", `${(statsComputed.mean * 100).toFixed(2)}%`],
                        ["สัดส่วนสูงสุด", `${(statsComputed.max * 100).toFixed(2)}%`],
                        ["สัดส่วนต่ำสุด", `${(statsComputed.min * 100).toFixed(2)}%`],
                        ["จำนวนเขต", String(statsComputed.n)],
                      ].map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-600">{label}</span>
                          <span className="font-mono font-bold text-slate-300">{val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-800/60 text-[9px] text-slate-700">
                      ที่มา: {summary?.dataSource ?? "Sentinel-2 R2 Cache"} · ปี {selectedYear}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* Table view */}
        {viewMode === "table" && (
          <div className="flex-1 min-h-0">
            <DistrictDataTable
              features={(granularity === "subdistrict" && activeDistrict !== "ทั้งหมด"
                ? (displayGeoJson?.features ?? []).filter((f: any) => f.properties?.district_name === activeDistrict)
                : displayGeoJson?.features) ?? []}
              columns={tableColumns}
              getRowData={(props) => ({
                name: props.name_th,
                district: props.district_name ?? null,
                water_ratio: props.water_ratio ?? null,
                water_area_rai: props.water_area_rai ?? null,
                ndwi_mean: props.ndwi_mean ?? null,
                ndwi_max: props.ndwi_max ?? null,
                mndwi_mean: props.mndwi_mean ?? null,
                district_area_rai: props.district_area_rai ?? null,
                delta: props.delta ?? null,
                compare_water_ratio: props.compare_water_ratio ?? null,
              })}
              csvFilename={csvFilename}
              filterDistrict={granularity === "district" && activeDistrict !== "ทั้งหมด" ? activeDistrict : undefined}
              year={selectedYear} onYearChange={setSelectedYear}
              minYear={2018} maxYear={2026}
              enableMultiYear accentColor="cyan"
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              compareYear={compareYear}
              onCompareYearChange={setCompareYear}
              onDistrictChange={setActiveDistrict}
              districts={allDistricts}
              dataSource={summary?.dataSource ?? "Sentinel-2 cache/GEE"}
              contextNote={granularity === "subdistrict" ? "ระดับแขวงสืบทอดค่าสถิติจากเขตแม่ จึงใช้ดูรายละเอียดเชิงพื้นที่ ไม่ใช่ค่าสถิติคำนวณใหม่รายแขวง" : "Water ratio เป็น proxy จาก NDWI/MNDWI และควรอ่านคู่กับ Traffy/บริบทพื้นที่"}
              expectedRows={granularity === "district" ? (activeDistrict === "ทั้งหมด" ? 50 : 1) : undefined}
            />
          </div>
        )}

        {viewMode === "guide" && (
          <PlainLanguageGuide
            module="flood"
            accent="sky"
            records={displayGeoJson?.features ?? []}
            year={selectedYear}
            activeArea={activeDistrict}
            compareMode={compareMode}
            compareYear={compareYear}
            dataSource={summary?.dataSource ?? "Sentinel-2 cache/GEE"}
            dataQuality={summary?.dataQuality}
          />
        )}
      </main>
    </div>
  );
}
