/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import FloodRiskSidebar from "@/components/gee/FloodRiskSidebar";
import { AlertTriangle, Calendar, Database, Layers, RefreshCw } from "lucide-react";
import {
  fetchCacheIndex,
  fetchCacheMetadata,
  getCacheLayerPreviewUrl,
  formatPeriodThai,
  CACHE_LAYER_LABELS,
  type SatelliteCacheIndex,
  type SatelliteCacheMetadata,
} from "@/lib/satellite-cache";

const FloodRiskMapView = dynamic(() => import("@/components/map/FloodRiskMapView"), { ssr: false });

type MapMode = "district" | "satellite-cache" | "traffy" | "combined";

const WATER_CACHE_LAYERS = ["ndwi_mean", "ndwi_max", "mndwi_mean"] as const;
type WaterCacheLayer = typeof WATER_CACHE_LAYERS[number];

const WATER_LAYER_LABELS: Record<WaterCacheLayer, string> = {
  ndwi_mean:  "NDWI (mean)",
  ndwi_max:   "NDWI (max)",
  mndwi_mean: "MNDWI (mean)",
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeDistrictName(value: string | null | undefined) {
  return (value || "").replace(/^เขต/, "").trim();
}

function confidenceLabel(hasTraffy: boolean, waterScore: number, status?: string) {
  if (status !== "ok") return "ข้อมูล Traffy ยังไม่พร้อม";
  if (hasTraffy && waterScore >= 0.35) return "สูง: Traffy และสัญญาณน้ำสอดคล้องกัน";
  if (hasTraffy) return "กลาง: ยืนยันจากเรื่องร้องเรียนเป็นหลัก";
  if (waterScore >= 0.35) return "ต่ำ-กลาง: พบจากดาวเทียมเป็นหลัก";
  return "ต่ำ: หลักฐานเชิงพื้นที่ยังจำกัด";
}

export default function FloodRiskPage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<MapMode>("district");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [traffyGeojson, setTraffyGeojson] = useState<any>(null);
  const [traffySummary, setTraffySummary] = useState<any>(null);
  const [traffyLoading, setTraffyLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");

  // Satellite cache state
  const [cacheIndex, setCacheIndex] = useState<SatelliteCacheIndex | null>(null);
  const [cacheMeta, setCacheMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheLayer, setCacheLayer] = useState<WaterCacheLayer>("ndwi_mean");
  const [cachePeriod, setCachePeriod] = useState<string | null>(null);

  // Fetch district data
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: selectedYear.toString() });
    if (activeDistrict !== "ทั้งหมด") params.append("district", activeDistrict);
    if (compareMode) params.append("compareYear", compareYear.toString());

    fetch(`/api/flood-risk?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
  }, [activeDistrict, selectedYear, compareMode, compareYear]);

  // Fetch human-reported flood/drainage incident evidence from Traffy.
  useEffect(() => {
    if (mapMode !== "traffy" && mapMode !== "combined") return;
    setTraffyLoading(true);
    const params = new URLSearchParams({
      year: selectedYear.toString(),
      recentDays: "365",
      pointLimit: "1200",
    });
    fetch(`/api/flood-risk/traffy?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setTraffyGeojson(data.geojson);
        setTraffySummary(data.summary);
        setTraffyLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setTraffyLoading(false);
      });
  }, [mapMode, selectedYear]);

  // Load satellite cache index on mount
  useEffect(() => { fetchCacheIndex().then(setCacheIndex); }, []);

  // Default cache period when entering satellite-cache mode
  useEffect(() => {
    if (mapMode === "satellite-cache" && !cachePeriod && cacheIndex?.latest_month) {
      setCachePeriod(cacheIndex.latest_month);
    }
  }, [mapMode, cacheIndex, cachePeriod]);

  // Load cache metadata when period changes
  useEffect(() => {
    if (mapMode !== "satellite-cache" || !cachePeriod) return;
    setCacheLoading(true);
    fetchCacheMetadata("monthly", cachePeriod)
      .then((meta) => { setCacheMeta(meta ?? null); setCacheLoading(false); })
      .catch(() => setCacheLoading(false));
  }, [cachePeriod, mapMode]);

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode("district");
    setOpacity(0.78);
    setBaseMap("dark");
    setCacheLayer("ndwi_mean");
    setCachePeriod(null);
    setCacheMeta(null);
  };

  const cachePreviewUrl = getCacheLayerPreviewUrl(cacheMeta, cacheLayer);
  const augmentedGeojsonData = useMemo(() => {
    if (!geojsonData?.features) return geojsonData;
    const districtRows = traffySummary?.byDistrict || [];
    const traffyByDistrict = new Map<string, any>(
      districtRows.map((row: any) => [normalizeDistrictName(row.district), row]),
    );
    const maxRecentDensity = Math.max(
      0,
      ...districtRows.map((row: any) => Number(row.recent_reports_per_sqkm || 0)),
    );
    const maxTotalDensity = Math.max(
      0,
      ...districtRows.map((row: any) => Number(row.reports_per_sqkm || 0)),
    );

    return {
      ...geojsonData,
      features: geojsonData.features.map((feature: any) => {
        const districtName = normalizeDistrictName(feature.properties?.name_th);
        const traffy = traffyByDistrict.get(districtName);
        const recentDensity = Number(traffy?.recent_reports_per_sqkm || 0);
        const totalDensity = Number(traffy?.reports_per_sqkm || 0);
        const unresolvedRatio = Number(traffy?.unresolved_ratio || 0);
        const waterRatio = Number(feature.properties?.water_ratio || 0);
        const waterScore = clamp01(waterRatio / 0.4);
        const recentScore = maxRecentDensity > 0 ? recentDensity / maxRecentDensity : 0;
        const historicalScore = maxTotalDensity > 0 ? totalDensity / maxTotalDensity : 0;
        const traffyScore = clamp01((recentScore * 0.6) + (historicalScore * 0.25) + (unresolvedRatio * 0.15));
        const combinedScore = clamp01((traffyScore * 0.6) + (waterScore * 0.3) + (unresolvedRatio * 0.1));

        return {
          ...feature,
          properties: {
            ...feature.properties,
            traffy_total: traffy?.total ?? 0,
            traffy_recent: traffy?.recent ?? 0,
            traffy_unresolved: traffy?.unresolved ?? 0,
            traffy_reports_per_sqkm: traffy?.reports_per_sqkm ?? null,
            traffy_recent_per_sqkm: traffy?.recent_reports_per_sqkm ?? null,
            traffy_unresolved_ratio: traffy?.unresolved_ratio ?? null,
            traffy_score: traffy ? traffyScore : null,
            water_observation_score: waterScore,
            combined_flood_proxy: traffy || waterRatio > 0 ? combinedScore : null,
            flood_proxy_confidence: confidenceLabel(!!traffy, waterScore, traffySummary?.status),
          },
        };
      }),
    };
  }, [geojsonData, traffySummary]);

  // Legend config
  const legendConfig = (() => {
    if (compareMode) {
      return {
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
    }

    if (mapMode === "traffy") {
      return {
        title: "Traffy Flood Reports — หลักฐานเหตุการณ์น้ำท่วม/ระบายน้ำ",
        description: "ค่าสูง = มีเรื่องร้องเรียนหนาแน่นและ/หรือยังไม่ปิดงานมากกว่าเขตอื่นในชุดข้อมูลที่กรอง",
        unit: "",
        items: [
          { color: "#164e63", label: "ต่ำมาก", range: "0–20" },
          { color: "#facc15", label: "ต่ำ-กลาง", range: "20–40" },
          { color: "#f97316", label: "กลาง", range: "40–60" },
          { color: "#dc2626", label: "สูง", range: "60–80" },
          { color: "#7f1d1d", label: "สูงมาก", range: "80–100" },
        ],
      };
    }

    if (mapMode === "combined") {
      return {
        title: "Combined Proxy — Traffy + NDWI/MNDWI district signal",
        description: "ไม่ใช่แบบจำลองน้ำท่วมเชิงอุทกวิทยา แต่เป็นคะแนนเฝ้าระวังจากเรื่องร้องเรียนและสัญญาณน้ำผิวดิน",
        unit: "",
        items: [
          { color: "#0f766e", label: "หลักฐานต่ำ", range: "0–20" },
          { color: "#22c55e", label: "ต่ำ-กลาง", range: "20–40" },
          { color: "#f97316", label: "กลาง", range: "40–60" },
          { color: "#be123c", label: "สูง", range: "60–80" },
          { color: "#881337", label: "สูงมาก", range: "80–100" },
        ],
      };
    }

    if (mapMode === "satellite-cache") {
      if (cacheLayer === "ndwi_mean" || cacheLayer === "ndwi_max") {
        return {
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
      }
      return {
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
    }

    return {
      title: "สัดส่วนพื้นที่น้ำรายเขต",
      description: "สัดส่วนพิกเซลที่เป็นน้ำต่อพื้นที่เขต จาก Sentinel-2",
      unit: "%",
      items: [
        { color: "#e0f2fe", label: "พื้นที่แห้ง",            range: "< 5%" },
        { color: "#7dd3fc", label: "มีน้ำน้อย",              range: "5% – 15%" },
        { color: "#38bdf8", label: "พื้นที่ชื้น",            range: "15% – 25%" },
        { color: "#0284c7", label: "แหล่งน้ำ / เสี่ยงท่วม", range: "25% – 40%" },
        { color: "#075985", label: "พื้นที่น้ำถาวร",         range: "> 40%" },
      ],
    };
  })();

  const periodLabel = selectedYear === new Date().getFullYear()
    ? `1 ม.ค. – ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
    : `1 ม.ค. – 31 ธ.ค. ${selectedYear}`;

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <FloodRiskSidebar
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        summary={summary}
        geojsonData={augmentedGeojsonData}
        loading={loading}
        compareMode={compareMode}
        mapMode={mapMode}
        traffySummary={traffySummary}
      />

      <main className="flex-1 min-w-0 relative">
        <div className="absolute inset-0 z-0">
          <FloodRiskMapView
            geojsonData={augmentedGeojsonData}
            invertedMask={invertedMask}
            activeDistrict={activeDistrict}
            mapMode={mapMode}
            compareMode={compareMode}
            summary={summary}
            traffyGeojson={traffyGeojson}
            traffySummary={traffySummary}
            opacity={opacity}
            baseMap={baseMap}
            satelliteCachePreviewUrl={cachePreviewUrl}
            satelliteCacheBounds={cacheMeta?.bounds}
          />
        </div>

        {/* Data source info (bottom-left) */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${mapMode === "satellite-cache" ? "bg-sky-400" : mapMode === "traffy" ? "bg-orange-400" : mapMode === "combined" ? "bg-rose-400" : "bg-cyan-500"}`} />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            {(mapMode === "traffy" || mapMode === "combined") ? (
              <>
                <p><span className="text-white">Incident evidence:</span> Traffy Fondue</p>
                <p><span className="text-white">Filter:</span> น้ำท่วม/ระบายน้ำ + keywords</p>
                <p><span className="text-white">Reports:</span> {(traffySummary?.totalFloodReports ?? 0).toLocaleString("th-TH")} total · {(traffySummary?.recentFloodReports ?? 0).toLocaleString("th-TH")} recent</p>
                <p><span className="text-white">Status:</span> {traffySummary?.status === "ok" ? "BigQuery connected" : "not configured / pending"}</p>
              </>
            ) : mapMode === "satellite-cache" && cacheMeta?.status === "ok" ? (
              <>
                <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
                <p><span className="text-white">Period:</span> {formatPeriodThai(cacheMeta.period)} · {cacheMeta.image_count} scenes{cacheMeta.fallback_used ? " (fallback)" : ""}</p>
                <p><span className="text-white">Layer:</span> {WATER_LAYER_LABELS[cacheLayer] ?? cacheLayer}</p>
                <p><span className="text-white">Resolution:</span> 100m per pixel (R2 cache)</p>
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

        {/* Legend (bottom-right) */}
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
      </main>

      {/* Right control panel */}
      <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
        <div className="flex min-h-full flex-col gap-3">

          {/* Main controls */}
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> แผงควบคุมหลัก
              </h4>
              <button
                onClick={handleReset}
                className="text-[9px] px-2.5 py-1 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 transition-all font-bold"
              >
                RESET
              </button>
            </div>

            {/* Map mode toggle */}
            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 border border-slate-800 gap-1">
              <button
                onClick={() => setMapMode("district")}
                className={`text-[9px] py-2 rounded-lg transition-all font-bold ${mapMode === "district" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                รายเขต
              </button>
              <button
                onClick={() => setMapMode("satellite-cache")}
                className={`text-[9px] py-2 rounded-lg transition-all font-bold flex items-center justify-center gap-1 ${mapMode === "satellite-cache" ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                <Database className="w-2.5 h-2.5" /> NDWI Cache
              </button>
              <button
                onClick={() => setMapMode("traffy")}
                className={`text-[9px] py-2 rounded-lg transition-all font-bold flex items-center justify-center gap-1 ${mapMode === "traffy" ? "bg-orange-600 text-white shadow-lg shadow-orange-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                Traffy Flood
              </button>
              <button
                onClick={() => setMapMode("combined")}
                className={`text-[9px] py-2 rounded-lg transition-all font-bold flex items-center justify-center gap-1 ${mapMode === "combined" ? "bg-rose-600 text-white shadow-lg shadow-rose-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                Combined
              </button>
            </div>

            {(mapMode === "traffy" || mapMode === "combined") && (
              <div className="mt-4 rounded-lg border border-orange-800/50 bg-orange-950/20 p-3 space-y-2">
                <h4 className="text-[10px] font-bold text-orange-300 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Traffy Flood Evidence
                </h4>
                {traffyLoading ? (
                  <p className="text-[9px] text-slate-500 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลดเรื่องร้องเรียน...
                  </p>
                ) : traffySummary?.status === "ok" ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2">
                      <p className="text-[8px] text-slate-500">ทั้งหมด</p>
                      <p className="text-sm font-bold text-orange-300 font-mono">{traffySummary.totalFloodReports.toLocaleString("th-TH")}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2">
                      <p className="text-[8px] text-slate-500">365 วัน</p>
                      <p className="text-sm font-bold text-amber-300 font-mono">{traffySummary.recentFloodReports.toLocaleString("th-TH")}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2">
                      <p className="text-[8px] text-slate-500">ยังเปิด</p>
                      <p className="text-sm font-bold text-rose-300 font-mono">{traffySummary.unresolvedFloodReports.toLocaleString("th-TH")}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[9px] leading-snug text-amber-300">
                    ยังไม่ได้เชื่อม BigQuery ใน environment นี้ จะแสดงเฉพาะ NDWI/ข้อมูลรายเขตจนกว่าจะตั้งค่า BQ_PROJECT_ID, BQ_DATASET และ BQ_CREDENTIALS
                  </p>
                )}
              </div>
            )}

            {/* Satellite cache controls */}
            {mapMode === "satellite-cache" && (
              <div className="mt-4 rounded-lg border border-sky-800/50 bg-sky-950/30 p-3 space-y-2">
                <h4 className="text-[10px] font-bold text-sky-300 mb-1 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Satellite Cache (R2)
                </h4>

                {cacheIndex?.monthly && cacheIndex.monthly.length > 0 && (
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">เดือน</p>
                    <select
                      value={cachePeriod ?? ""}
                      onChange={(e) => setCachePeriod(e.target.value)}
                      className="w-full bg-slate-900/60 border border-sky-800/40 text-slate-200 text-[10px] rounded-lg px-2 py-1.5 appearance-none focus:outline-none focus:border-sky-500/60 cursor-pointer"
                    >
                      {[...cacheIndex.monthly].reverse().map((p) => (
                        <option key={p} value={p}>{formatPeriodThai(p)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {cacheLoading ? (
                  <p className="text-[9px] text-slate-500 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด...
                  </p>
                ) : cacheMeta?.status === "ok" ? (
                  <>
                    <p className="text-[9px] text-slate-400">
                      <span className="text-slate-200 font-bold">จำนวนภาพ:</span>{" "}
                      {cacheMeta.image_count} scenes
                      {cacheMeta.fallback_used && <span className="text-amber-400 ml-1">(fallback)</span>}
                    </p>
                    <div className="mt-1">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">ชั้นข้อมูล (Water)</p>
                      <div className="flex flex-col gap-1">
                        {WATER_CACHE_LAYERS.map((key) => (
                          <button
                            key={key}
                            onClick={() => setCacheLayer(key)}
                            className={`text-[9px] px-2 py-1.5 rounded-lg border transition-all font-bold text-left ${cacheLayer === key ? "bg-sky-500/20 border-sky-500/60 text-sky-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}
                          >
                            {WATER_LAYER_LABELS[key]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {!cachePreviewUrl && (
                      <p className="text-[9px] text-amber-400">ยังไม่มี preview สำหรับ layer นี้</p>
                    )}
                  </>
                ) : (
                  <p className="text-[9px] text-slate-500">
                    ยังไม่มีข้อมูล cache — รัน GitHub Action เพื่อประมวลผลครั้งแรก
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Opacity slider (satellite-cache mode) */}
          {mapMode === "satellite-cache" && (
            <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความโปร่งใส</h4>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full text-sky-400 bg-sky-500/10">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
              />
            </div>
          )}

          {/* Base map */}
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> แผนที่ฐาน (Base Map)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "dark",      label: "Dark" },
                { id: "light",     label: "Light" },
                { id: "satellite", label: "Satellite" },
                { id: "streets",   label: "Street" },
                { id: "none",      label: "None" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setBaseMap(m.id as any)}
                  className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${baseMap === m.id ? "bg-sky-500 border-sky-500 text-white shadow-md shadow-sky-500/20" : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Year selector */}
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> เลือกปี (Year)
              </h4>
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`text-[9px] px-3 py-1.5 rounded-lg transition-all border font-bold ${compareMode ? "bg-sky-500/20 text-sky-400 border-sky-500/50" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500"}`}
              >
                เปรียบเทียบปี
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-mono">2018</span>
              <span className="text-lg font-bold text-sky-400 font-mono">{selectedYear}</span>
              <span className="text-xs text-slate-400 font-mono">2026</span>
            </div>
            <input
              type="range" min="2018" max="2026"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 mb-2"
            />

            {compareMode && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">ปีฐาน (Baseline)</h4>
                  <span className="text-sm font-bold text-sky-400 font-mono">{compareYear}</span>
                </div>
                <input
                  type="range" min="2018" max="2026"
                  value={compareYear}
                  onChange={(e) => setCompareYear(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
              </div>
            )}
          </div>

          {/* Info card */}
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
                <span className="text-orange-300 font-bold">Traffy</span> เป็น human-reported incident evidence: บอกจุดที่ประชาชนพบปัญหาน้ำท่วม น้ำขัง หรือระบายน้ำจริง แต่มี reporting bias ตามการใช้งานแพลตฟอร์ม
              </p>
              <p className="text-slate-500">
                คะแนน Combined เป็น proxy เพื่อจัดลำดับเฝ้าระวัง: 60% Traffy signal, 30% water observation, 10% unresolved ratio ไม่ใช่ hydraulic flood model
              </p>
            </div>
          </div>

        </div>
      </aside>
    </div>
  );
}
