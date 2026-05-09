/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, ArrowLeft, BarChart3, Calendar, Layers, RefreshCw, Wind } from "lucide-react";

const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false });

type MapMode = "district" | "idw";
type AirLayer = "no2_mean" | "co_mean" | "so2_mean" | "aerosol_index_mean" | "pollution_score";

const ALL_DISTRICTS = "ทั้งหมด";

const AIR_LAYERS: Array<{ id: AirLayer; label: string; unit: string }> = [
  { id: "no2_mean", label: "NO2", unit: "mol/m²" },
  { id: "co_mean", label: "CO", unit: "mol/m²" },
  { id: "so2_mean", label: "SO2", unit: "mol/m²" },
  { id: "aerosol_index_mean", label: "Aerosol", unit: "index" },
  { id: "pollution_score", label: "Score", unit: "0-10" },
];

function formatMetric(value: number | null | undefined, layer: AirLayer) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (layer === "pollution_score") return value.toFixed(2);
  if (layer === "co_mean") return value.toFixed(4);
  if (layer === "aerosol_index_mean") return value.toFixed(3);
  return value.toFixed(6);
}

export default function AirQualityPage() {
  const [activeDistrict, setActiveDistrict] = useState(ALL_DISTRICTS);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2019);
  const [mapMode, setMapMode] = useState<MapMode>("idw");
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [opacity, setOpacity] = useState(0.78);
  const [airLayer, setAirLayer] = useState<AirLayer>("no2_mean");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      year: String(selectedYear),
      metric: "air_pollution",
    });
    if (activeDistrict !== ALL_DISTRICTS) params.append("district", activeDistrict);
    if (compareMode) params.append("compareYear", String(compareYear));

    fetch(`/api/district-metrics?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setGeojsonData(null);
        setSummary(null);
        setLoading(false);
      });
  }, [activeDistrict, selectedYear, compareMode, compareYear]);

  const features = geojsonData?.features ?? [];
  const ranked = useMemo(() => {
    return [...features]
      .filter((feature: any) => typeof feature?.properties?.[airLayer] === "number")
      .sort((a: any, b: any) => Number(b.properties[airLayer]) - Number(a.properties[airLayer]))
      .slice(0, 8);
  }, [features, airLayer]);

  const values = features
    .map((feature: any) => feature?.properties?.[airLayer])
    .filter((value: any): value is number => typeof value === "number" && Number.isFinite(value));
  const avgValue = values.length ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length : null;
  const maxFeature = ranked[0];
  const latestLabel = selectedYear === new Date().getFullYear()
    ? `1 Jan - ${new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" })} ${selectedYear} (YTD)`
    : `1 Jan - 31 Dec ${selectedYear}`;
  const layerMeta = AIR_LAYERS.find((layer) => layer.id === airLayer) ?? AIR_LAYERS[0];

  const handleReset = () => {
    setActiveDistrict(ALL_DISTRICTS);
    setSelectedYear(2026);
    setCompareMode(false);
    setCompareYear(2019);
    setMapMode("idw");
    setBaseMap("dark");
    setOpacity(0.78);
    setAirLayer("no2_mean");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-50">
      <aside className="z-10 flex h-full w-[340px] shrink-0 flex-col border-r border-slate-800/70 bg-[#0b1220]">
        <div className="border-b border-slate-800/70 p-5">
          <Link href="/" className="mb-4 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Bangkok Analytics
          </Link>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-cyan-500/15 p-2 text-cyan-300 ring-1 ring-cyan-400/25">
              <Wind className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-black leading-tight text-white">มลพิษอากาศจากดาวเทียม</h1>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">Satellite Air Pollution Index</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Average</div>
              <div className="mt-1 truncate font-mono text-lg font-black text-cyan-200">{formatMetric(avgValue, airLayer)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Highest</div>
              <div className="mt-1 truncate text-sm font-black text-white">{maxFeature?.properties?.name_th || "--"}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <Layers className="h-3 w-3" /> Layer
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {AIR_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => setAirLayer(layer.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${airLayer === layer.id ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-600"}`}
                >
                  {layer.label}
                  <span className="mt-0.5 block text-[9px] font-medium text-slate-500">{layer.unit}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <Calendar className="h-3 w-3" /> Year
            </h3>
            <input
              type="range"
              min="2019"
              max="2026"
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="w-full accent-cyan-400"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>{latestLabel}</span>
              <span className="font-mono text-cyan-300">{selectedYear}</span>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMapMode(mapMode === "idw" ? "district" : "idw")}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400/50"
            >
              {mapMode === "idw" ? "Live GEE raster" : "District colors"}
            </button>
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${compareMode ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-300"}`}
            >
              Compare
            </button>
          </section>

          {compareMode && (
            <section>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>Baseline year</span>
                <span className="font-mono text-cyan-300">{compareYear}</span>
              </div>
              <input
                type="range"
                min="2019"
                max={selectedYear - 1}
                value={compareYear}
                onChange={(event) => setCompareYear(Number(event.target.value))}
                className="w-full accent-cyan-400"
              />
            </section>
          )}

          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <BarChart3 className="h-3 w-3" /> Ranking
            </h3>
            <div className="space-y-2">
              {loading ? (
                <div className="text-xs text-slate-500">Loading...</div>
              ) : ranked.length ? ranked.map((feature: any, index: number) => (
                <button
                  key={feature.properties.id}
                  onClick={() => setActiveDistrict(activeDistrict === feature.properties.name_th ? ALL_DISTRICTS : feature.properties.name_th)}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-left hover:border-cyan-400/40"
                >
                  <span className="w-5 text-right font-mono text-[10px] text-slate-600">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-200">{feature.properties.name_th}</span>
                  <span className="font-mono text-[11px] text-cyan-200">{formatMetric(feature.properties[airLayer], airLayer)}</span>
                </button>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-800 p-3 text-xs leading-5 text-slate-500">
                  ยังไม่มีค่าเฉลี่ยรายเขตใน Supabase สำหรับ layer นี้ ให้รัน migration และ pipeline ก่อน ส่วน live GEE raster ยังเปิดดูได้ในโหมดแผนที่
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="border-t border-slate-800/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Opacity</span>
            <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="flex-1 accent-cyan-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={baseMap} onChange={(event) => setBaseMap(event.target.value as any)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200 outline-none">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="satellite">Satellite</option>
              <option value="streets">Streets</option>
              <option value="none">None</option>
            </select>
            <button onClick={handleReset} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400/50">
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <DistrictMetricsMapView
          geojsonData={geojsonData}
          invertedMask={invertedMask}
          activeDistrict={activeDistrict}
          mapMode={mapMode}
          compareMode={compareMode}
          summary={summary}
          opacity={opacity}
          baseMap={baseMap}
          analysisType="air"
          airPollutionLayer={airLayer}
          dataPeriodLabel={latestLabel}
        />

        <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] max-w-sm rounded-xl border border-slate-700/70 bg-slate-950/90 p-3 text-[11px] leading-5 text-slate-400 shadow-xl backdrop-blur">
          <div className="mb-1 flex items-center gap-2 font-bold uppercase tracking-widest text-slate-300">
            <Activity className="h-3.5 w-3.5 text-cyan-300" /> Satellite proxy
          </div>
          Sentinel-5P column density แสดงมลพิษจากดาวเทียม ไม่ใช่ AQI จากสถานีตรวจวัดภาคพื้น
        </div>
      </main>
    </div>
  );
}
