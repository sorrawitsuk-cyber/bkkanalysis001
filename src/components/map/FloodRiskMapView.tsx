/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface FloodRiskMapViewProps {
  geojsonData: any;
  invertedMask?: any;
  activeDistrict: string;
  mapMode: "district" | "satellite-cache";
  compareMode?: boolean;
  summary?: any;
  opacity?: number;
  baseMap?: "dark" | "light" | "satellite" | "streets" | "none";
  satelliteCachePreviewUrl?: string | null;
  satelliteCacheBounds?: [[number, number], [number, number]];
  granularity?: "district" | "subdistrict";
}

const ALL_DISTRICTS = "ทั้งหมด";
const BKK_BOUNDS: [[number, number], [number, number]] = [[13.494, 100.329], [13.956, 100.935]];

function getWaterColor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "#334155";
  if (value > 0.40) return "#075985";
  if (value > 0.25) return "#0284c7";
  if (value > 0.15) return "#38bdf8";
  if (value > 0.05) return "#7dd3fc";
  return "#e0f2fe";
}

function getDeltaColor(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "#334155";
  if (delta > 0.10)  return "#1e3a5f";
  if (delta > 0.03)  return "#0369a1";
  if (delta > -0.03) return "#94a3b8";
  if (delta > -0.10) return "#b45309";
  return "#78350f";
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", { maximumFractionDigits: digits });
}

function formatIndex(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  return value.toFixed(3);
}

export default function FloodRiskMapView({
  geojsonData,
  invertedMask,
  activeDistrict,
  mapMode,
  compareMode,
  summary,
  opacity = 0.78,
  baseMap = "dark",
  satelliteCachePreviewUrl,
  satelliteCacheBounds,
  granularity = "district",
}: FloodRiskMapViewProps) {
  const mapRef            = useRef<L.Map | null>(null);
  const baseLayerRef      = useRef<L.TileLayer | null>(null);
  const geojsonLayerRef   = useRef<L.GeoJSON | null>(null);
  const maskLayerRef      = useRef<L.GeoJSON | null>(null);
  const cacheLayerRef     = useRef<L.ImageOverlay | null>(null);
  const yearRef           = useRef(summary?.selectedYear || 2024);
  const compareModeRef    = useRef(compareMode);
  const activeDistrictRef = useRef(activeDistrict);

  useEffect(() => { if (summary?.selectedYear) yearRef.current = summary.selectedYear; }, [summary?.selectedYear]);
  useEffect(() => { compareModeRef.current = compareMode; activeDistrictRef.current = activeDistrict; }, [compareMode, activeDistrict]);

  // Init map
  useEffect(() => {
    if (mapRef.current) return;
    mapRef.current = L.map("flood-risk-map", {
      center: [13.7563, 100.5018],
      zoom: 11,
      zoomControl: false,
    });
    baseLayerRef.current = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap contributors © CARTO", subdomains: "abcd", maxZoom: 20 }
    ).addTo(mapRef.current);
  }, []);

  // Base map change
  useEffect(() => {
    if (!mapRef.current || !baseLayerRef.current) return;
    const urls: Record<string, string> = {
      dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      light:     "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      streets:   "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      none:      "",
    };
    if (baseMap === "none") { baseLayerRef.current.setOpacity(0); }
    else { baseLayerRef.current.setOpacity(1); baseLayerRef.current.setUrl(urls[baseMap] || urls.dark); }
  }, [baseMap]);

  // Opacity sync
  useEffect(() => {
    if (cacheLayerRef.current) cacheLayerRef.current.setOpacity(opacity);
  }, [opacity]);

  // Satellite cache overlay
  useEffect(() => {
    if (!mapRef.current) return;
    if (cacheLayerRef.current) { mapRef.current.removeLayer(cacheLayerRef.current); cacheLayerRef.current = null; }
    if (mapMode === "satellite-cache" && satelliteCachePreviewUrl) {
      const bounds = satelliteCacheBounds ?? BKK_BOUNDS;
      cacheLayerRef.current = L.imageOverlay(satelliteCachePreviewUrl, bounds, {
        opacity,
        interactive: false,
        className: "satellite-cache-overlay",
      }).addTo(mapRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode, satelliteCachePreviewUrl, satelliteCacheBounds]);

  // Inverted mask overlay (outside Bangkok)
  useEffect(() => {
    if (!mapRef.current || !invertedMask) return;
    if (maskLayerRef.current) { mapRef.current.removeLayer(maskLayerRef.current); maskLayerRef.current = null; }
    maskLayerRef.current = L.geoJSON(invertedMask, {
      style: { fillColor: "#0b0f19", fillOpacity: 0.85, weight: 0, color: "transparent" },
      interactive: false,
    }).addTo(mapRef.current);
  }, [invertedMask]);

  const getFeatureColor = useCallback((feature: any) => {
    if (compareMode) return getDeltaColor(feature?.properties?.delta);
    return getWaterColor(feature?.properties?.display_value ?? feature?.properties?.water_ratio);
  }, [compareMode, mapMode]);

  // GeoJSON district layer
  useEffect(() => {
    if (!mapRef.current || !geojsonData) return;
    if (geojsonLayerRef.current) { mapRef.current.removeLayer(geojsonLayerRef.current); geojsonLayerRef.current = null; }

    // Fall back to district choropleth when satellite-cache has no preview URL
    const effectiveMapMode = mapMode === "satellite-cache" && !satelliteCachePreviewUrl ? "district" : mapMode;

    geojsonLayerRef.current = L.geoJSON(geojsonData, {
      style: (feature) => {
        const fp = feature?.properties ?? {};
        const isSelected = activeDistrict !== ALL_DISTRICTS && (
          fp.name_th === activeDistrict || `เขต${fp.name_th}` === activeDistrict ||
          fp.district_name === activeDistrict || `เขต${fp.district_name}` === activeDistrict
        );
        const isDimmed = activeDistrict !== ALL_DISTRICTS && !isSelected;
        const showFill = effectiveMapMode === "district" || activeDistrict !== ALL_DISTRICTS;
        return {
          fillColor: getFeatureColor(feature),
          weight: isSelected ? 2.5 : 1,
          opacity: 1,
          color: isSelected ? "#ffffff" : "#1e293b",
          dashArray: "3",
          fillOpacity: showFill ? (isDimmed ? 0.15 : 0.72) : 0,
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const waterRatio: number | null = props.water_ratio;
        const waterAreaRai: number | null = props.water_area_rai;
        const displayValue: number | null = props.display_value;
        const displayAreaRai: number | null = props.display_area_rai;
        const displayLabel = props.display_label || "NDWI";
        const delta: number | null = props.delta;
        const compareRatio: number | null = props.compare_water_ratio;
        const year = summary?.selectedYear ?? "–";
        const cmpYear = summary?.compareYear ?? "–";

        const deltaLine = compareMode && delta !== null
          ? `<div class="text-[10px] text-slate-400 mt-1">เปลี่ยนแปลง: <span class="${delta >= 0 ? "text-sky-300" : "text-amber-300"} font-mono font-bold">${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%</span> <span class="text-slate-500">(${cmpYear}→${year})</span></div>
           <div class="text-[10px] text-slate-400">ปีฐาน: <span class="text-slate-200 font-mono">${formatPct(compareRatio ?? undefined)}</span></div>`
          : "";

        layer.bindTooltip(`
          <div class="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 shadow-xl min-w-[200px]">
            <div class="font-bold mb-1 border-b border-slate-800 pb-1 text-sky-300">${props.name_th || "Unknown"}${granularity === "subdistrict" && props.district_name ? `<span class="text-slate-500 text-[9px] ml-1">· เขต${props.district_name}</span>` : ""}</div>
            <div class="text-[10px] text-slate-400">${displayLabel}: <span class="text-sky-300 text-lg font-mono ml-1">${formatIndex(displayValue ?? waterRatio ?? undefined)}</span></div>
            <div class="text-[10px] text-slate-400 mt-1">สัดส่วนพื้นที่น้ำ: <span class="text-sky-200 font-mono">${formatPct(waterRatio ?? undefined)}</span></div>
            ${displayAreaRai !== null || waterAreaRai !== null ? `<div class="text-[10px] text-slate-400 mt-1">ขนาดพื้นที่น้ำ: <span class="text-sky-200 font-mono">${formatNumber(displayAreaRai ?? waterAreaRai, 0)} ไร่</span></div>` : ""}
            ${deltaLine}
            <div class="text-[9px] text-slate-500 mt-2">ปีที่แสดง: ${year}</div>
          </div>
        `, { sticky: true, className: "bg-transparent border-none shadow-none" });
      },
    }).addTo(mapRef.current);

    // Fly to selected district (or all its subdistricts) or fit all
    if (activeDistrict !== ALL_DISTRICTS && geojsonLayerRef.current) {
      const sels = geojsonLayerRef.current.getLayers().filter((l: any) => {
        const lp = l.feature?.properties ?? {};
        return lp.name_th === activeDistrict || `เขต${lp.name_th}` === activeDistrict ||
               lp.district_name === activeDistrict || `เขต${lp.district_name}` === activeDistrict;
      });
      if (sels.length > 0) {
        const bounds = L.latLngBounds([]);
        sels.forEach((l: any) => { if (l.getBounds) bounds.extend(l.getBounds()); });
        if (bounds.isValid()) mapRef.current.flyToBounds(bounds, { padding: [50, 50], duration: 1.2 });
      }
    } else if (geojsonLayerRef.current) {
      mapRef.current.flyToBounds(geojsonLayerRef.current.getBounds(), { padding: [20, 20], duration: 1.2 });
    }
  }, [geojsonData, activeDistrict, mapMode, compareMode, summary, granularity, getFeatureColor, satelliteCachePreviewUrl]);

  return <div id="flood-risk-map" className="w-full h-full z-0" style={{ background: "#0b0f19" }} />;
}
