/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface FloodRiskMapViewProps {
  geojsonData: any;
  invertedMask?: any;
  activeDistrict: string;
  mapMode: "district" | "satellite-cache" | "traffy" | "combined";
  compareMode?: boolean;
  summary?: any;
  traffyGeojson?: any;
  traffySummary?: any;
  opacity?: number;
  baseMap?: "dark" | "light" | "satellite" | "streets" | "none";
  satelliteCachePreviewUrl?: string | null;
  satelliteCacheBounds?: [[number, number], [number, number]];
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

function getTraffyColor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "#334155";
  if (value >= 0.80) return "#7f1d1d";
  if (value >= 0.60) return "#dc2626";
  if (value >= 0.40) return "#f97316";
  if (value >= 0.20) return "#facc15";
  return "#164e63";
}

function getCombinedColor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "#334155";
  if (value >= 0.80) return "#881337";
  if (value >= 0.60) return "#be123c";
  if (value >= 0.40) return "#f97316";
  if (value >= 0.20) return "#22c55e";
  return "#0f766e";
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", { maximumFractionDigits: digits });
}

export default function FloodRiskMapView({
  geojsonData,
  invertedMask,
  activeDistrict,
  mapMode,
  compareMode,
  summary,
  traffyGeojson,
  traffySummary,
  opacity = 0.78,
  baseMap = "dark",
  satelliteCachePreviewUrl,
  satelliteCacheBounds,
}: FloodRiskMapViewProps) {
  const mapRef            = useRef<L.Map | null>(null);
  const baseLayerRef      = useRef<L.TileLayer | null>(null);
  const geojsonLayerRef   = useRef<L.GeoJSON | null>(null);
  const maskLayerRef      = useRef<L.GeoJSON | null>(null);
  const cacheLayerRef     = useRef<L.ImageOverlay | null>(null);
  const traffyLayerRef    = useRef<L.LayerGroup | null>(null);
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
    if (mapMode === "traffy") return getTraffyColor(feature?.properties?.traffy_score);
    if (mapMode === "combined") return getCombinedColor(feature?.properties?.combined_flood_proxy);
    return getWaterColor(feature?.properties?.water_ratio);
  }, [compareMode, mapMode]);

  // Traffy point evidence overlay
  useEffect(() => {
    if (!mapRef.current) return;
    if (traffyLayerRef.current) {
      mapRef.current.removeLayer(traffyLayerRef.current);
      traffyLayerRef.current = null;
    }
    if ((mapMode !== "traffy" && mapMode !== "combined") || !traffyGeojson?.features?.length) return;

    const group = L.layerGroup();
    traffyGeojson.features.forEach((feature: any) => {
      const [lon, lat] = feature.geometry?.coordinates || [];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      const props = feature.properties || {};
      const isOpen = ["รอรับเรื่อง", "กำลังดำเนินการ", "ส่งต่อ(ใหม่)", "ส่งต่อ"].some((state) =>
        String(props.state || "").includes(state)
      );
      const marker = L.circleMarker([lat, lon], {
        radius: isOpen ? 5 : 3.5,
        color: isOpen ? "#f97316" : "#38bdf8",
        fillColor: isOpen ? "#f97316" : "#38bdf8",
        fillOpacity: isOpen ? 0.72 : 0.42,
        weight: isOpen ? 1.3 : 0.8,
      });
      marker.bindPopup(`
        <div class="text-slate-800 w-64">
          <div class="font-bold text-slate-900">${props.district || "ไม่ระบุเขต"}</div>
          <div class="text-[11px] text-slate-500 mb-1">${props.state || "ไม่ระบุสถานะ"} · ${props.ticket_id || ""}</div>
          <div class="text-[12px] leading-snug">${props.description || props.problem_type || "ไม่มีรายละเอียด"}</div>
          <div class="text-[10px] text-slate-500 mt-2">${props.address || ""}</div>
          <div class="text-[10px] text-slate-400 mt-1">${props.timestamp ? new Date(props.timestamp).toLocaleString("th-TH") : ""}</div>
        </div>
      `);
      group.addLayer(marker);
    });
    group.addTo(mapRef.current);
    traffyLayerRef.current = group;
  }, [mapMode, traffyGeojson]);

  // GeoJSON district layer
  useEffect(() => {
    if (!mapRef.current || !geojsonData) return;
    if (geojsonLayerRef.current) { mapRef.current.removeLayer(geojsonLayerRef.current); geojsonLayerRef.current = null; }

    geojsonLayerRef.current = L.geoJSON(geojsonData, {
      style: (feature) => {
        const isSelected = activeDistrict !== ALL_DISTRICTS &&
          (feature?.properties?.name_th === activeDistrict || `เขต${feature?.properties?.name_th}` === activeDistrict);
        const isDimmed = activeDistrict !== ALL_DISTRICTS && !isSelected;
        const showFill = mapMode === "district" || mapMode === "traffy" || mapMode === "combined" || activeDistrict !== ALL_DISTRICTS;
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
        const delta: number | null = props.delta;
        const compareRatio: number | null = props.compare_water_ratio;
        const traffyRecent = props.traffy_recent as number | null;
        const traffyDensity = props.traffy_recent_per_sqkm as number | null;
        const combinedScore = props.combined_flood_proxy as number | null;
        const confidence = props.flood_proxy_confidence as string | null;
        const year = summary?.selectedYear ?? "–";
        const cmpYear = summary?.compareYear ?? "–";

        const deltaLine = compareMode && delta !== null
          ? `<div class="text-[10px] text-slate-400 mt-1">เปลี่ยนแปลง: <span class="${delta >= 0 ? "text-sky-300" : "text-amber-300"} font-mono font-bold">${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%</span> <span class="text-slate-500">(${cmpYear}→${year})</span></div>
           <div class="text-[10px] text-slate-400">ปีฐาน: <span class="text-slate-200 font-mono">${formatPct(compareRatio ?? undefined)}</span></div>`
          : "";

        const traffyLine = (mapMode === "traffy" || mapMode === "combined")
          ? `<div class="mt-2 border-t border-slate-800 pt-1.5">
              <div class="text-[10px] text-slate-400">Traffy น้ำท่วม/ระบายน้ำ ${traffySummary?.recentDays || 365} วัน: <span class="text-orange-300 font-mono font-bold">${formatNumber(traffyRecent, 0)}</span> เรื่อง</div>
              <div class="text-[10px] text-slate-400">ความหนาแน่นล่าสุด: <span class="text-orange-200 font-mono">${formatNumber(traffyDensity, 2)}</span> เรื่อง/ตร.กม.</div>
              ${combinedScore !== null && combinedScore !== undefined ? `<div class="text-[10px] text-slate-400">คะแนน proxy รวม: <span class="text-rose-300 font-mono font-bold">${(combinedScore * 100).toFixed(0)}/100</span></div>` : ""}
              ${confidence ? `<div class="text-[9px] text-slate-500">confidence: ${confidence}</div>` : ""}
            </div>`
          : "";

        layer.bindTooltip(`
          <div class="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 shadow-xl min-w-[200px]">
            <div class="font-bold mb-1 border-b border-slate-800 pb-1 text-sky-300">${props.name_th || "Unknown"}</div>
            <div class="text-[10px] text-slate-400">สัดส่วนพื้นที่น้ำ: <span class="text-sky-300 text-lg font-mono ml-1">${formatPct(waterRatio ?? undefined)}</span></div>
            ${waterAreaRai !== null ? `<div class="text-[10px] text-slate-400 mt-1">ขนาดพื้นที่น้ำ: <span class="text-sky-200 font-mono">${(waterAreaRai).toLocaleString("th-TH")} ไร่</span></div>` : ""}
            ${deltaLine}
            ${traffyLine}
            <div class="text-[9px] text-slate-500 mt-2">ปีที่แสดง: ${year}</div>
          </div>
        `, { sticky: true, className: "bg-transparent border-none shadow-none" });
      },
    }).addTo(mapRef.current);

    // Fly to selected district or fit all
    if (activeDistrict !== ALL_DISTRICTS && geojsonLayerRef.current) {
      const sel = geojsonLayerRef.current.getLayers().find((l: any) =>
        l.feature?.properties?.name_th === activeDistrict || `เขต${l.feature?.properties?.name_th}` === activeDistrict
      ) as L.Polygon | undefined;
      if (sel) mapRef.current.flyToBounds(sel.getBounds(), { padding: [50, 50], duration: 1.2 });
    } else if (geojsonLayerRef.current) {
      mapRef.current.flyToBounds(geojsonLayerRef.current.getBounds(), { padding: [20, 20], duration: 1.2 });
    }
  }, [geojsonData, activeDistrict, mapMode, compareMode, summary, traffySummary?.recentDays, getFeatureColor]);

  return <div id="flood-risk-map" className="w-full h-full z-0" style={{ background: "#0b0f19" }} />;
}
