/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

interface LSTMapViewProps {
  geojsonData: any;
  invertedMask?: any;
  activeDistrict: string;
  mapMode: "district" | "idw";
  compareMode?: boolean;
  summary?: any;
  opacity?: number;
  baseMap?: "dark" | "light" | "satellite" | "streets" | "none";
  analysisType?: "heat" | "green";
  ndviLayer?: "ndvi_score" | "green_area_ratio" | "ndvi_mean" | "low_green_ratio" | "ntl_mean";
}

const ALL_DISTRICTS = "ทั้งหมด";

const layerLabels: Record<string, string> = {
  ndvi_score: "คะแนนพื้นที่สีเขียว",
  green_area_ratio: "สัดส่วนพื้นที่สีเขียว",
  ndvi_mean: "ค่า NDVI เฉลี่ย",
  low_green_ratio: "สัดส่วนพื้นที่เขียวน้อย",
  ntl_mean: "ความสว่างกลางคืนเฉลี่ย",
};

function formatValue(value: number | null | undefined, digits = 2, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  return `${value.toFixed(digits)}${suffix}`;
}

export default function LSTMapView({
  geojsonData,
  activeDistrict,
  mapMode,
  compareMode,
  summary,
  opacity = 0.8,
  baseMap = "dark",
  analysisType = "heat",
  ndviLayer = "ndvi_score",
}: LSTMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const geeLayerRef = useRef<L.TileLayer | null>(null);
  const yearRef = useRef(summary?.selectedYear || 2024);

  useEffect(() => {
    if (summary?.selectedYear) yearRef.current = summary.selectedYear;
  }, [summary?.selectedYear]);

  useEffect(() => {
    if (mapRef.current) return;
    mapRef.current = L.map("lst-map", {
      center: [13.7563, 100.5018],
      zoom: 11,
      zoomControl: false,
    });

    baseLayerRef.current = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(mapRef.current);

    mapRef.current.on("click", async (e: L.LeafletMouseEvent) => {
      if (!mapRef.current) return;
      const { lat, lng } = e.latlng;
      const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent('<div class="p-2 text-xs font-mono">กำลังวิเคราะห์พิกเซล...</div>')
        .openOn(mapRef.current);

      try {
        const metricParam = analysisType === "green" ? "&metric=vegetation" : "";
        const res = await fetch(`/api/gee/point?lat=${lat}&lng=${lng}&year=${yearRef.current}${metricParam}`);
        const data = await res.json();
        const value = data.temp;
        popup.setContent(`
          <div class="bg-slate-950 text-white p-3 rounded-lg border border-slate-800 shadow-2xl min-w-[150px]">
            <div class="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 border-b border-slate-800 pb-1">Pixel Analysis</div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] text-slate-400">${analysisType === "green" ? "NDVI" : "LST"}</span>
              <span class="${analysisType === "green" ? "text-emerald-400" : "text-orange-400"} font-mono font-bold text-lg">${value ?? "ไม่มีข้อมูล"}${analysisType === "green" ? "" : "°C"}</span>
            </div>
            <div class="text-[9px] text-slate-500 italic mt-1">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
          </div>
        `);
      } catch {
        popup.setContent('<div class="p-2 text-xs text-red-400">ไม่สามารถดึงข้อมูลจุดนี้ได้</div>');
      }
    });
  }, [analysisType]);

  useEffect(() => {
    if (!mapRef.current || !baseLayerRef.current) return;
    const mapUrls: Record<string, string> = {
      dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      none: "",
    };
    if (baseMap === "none") {
      baseLayerRef.current.setOpacity(0);
    } else {
      baseLayerRef.current.setOpacity(1);
      baseLayerRef.current.setUrl(mapUrls[baseMap] || mapUrls.dark);
    }
  }, [baseMap]);

  const getFeatureValue = useCallback((feature: any) => {
    if (compareMode) return analysisType === "green" ? feature?.properties?.vegetation_delta : feature?.properties?.delta;
    if (analysisType !== "green") return feature?.properties?.mean_lst;
    if (ndviLayer === "ndvi_score") return feature?.properties?.ndvi_score;
    if (ndviLayer === "green_area_ratio") return feature?.properties?.green_area_ratio;
    if (ndviLayer === "low_green_ratio") return feature?.properties?.low_green_ratio;
    if (ndviLayer === "ntl_mean") return feature?.properties?.ntl_mean;
    return feature?.properties?.ndvi_mean ?? feature?.properties?.ndvi;
  }, [analysisType, compareMode, ndviLayer]);

  const getColor = useCallback((value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "#9ca3af";
    if (compareMode) {
      if (analysisType === "green") {
        return value > 0.15 ? "#047857" : value > 0.05 ? "#86EFAC" : value > -0.05 ? "#F7F7F7" : value > -0.15 ? "#F59E0B" : "#8B1E1E";
      }
      return value > 1.5 ? "#B2182B" : value > 0.5 ? "#EF8A62" : value > -0.5 ? "#F7F7F7" : value > -1.5 ? "#67A9CF" : "#2166AC";
    }

    if (analysisType === "green") {
      let min = 0.1;
      let max = 0.6;
      if (ndviLayer === "ndvi_score") {
        min = 0;
        max = 10;
      } else if (ndviLayer === "green_area_ratio" || ndviLayer === "low_green_ratio") {
        min = 0;
        max = 0.7;
      } else if (ndviLayer === "ntl_mean") {
        min = 0;
        max = Math.max(60, summary?.max_lst || 60);
      }
      const pct = (value - min) / Math.max(0.01, max - min);
      return pct > 0.8 ? "#238b45" : pct > 0.6 ? "#68d391" : pct > 0.4 ? "#f6e05e" : pct > 0.2 ? "#d94801" : "#8c2d04";
    }

    const min = summary?.min_lst || 30;
    const max = summary?.max_lst || 40;
    const pct = (value - min) / Math.max(0.01, max - min);
    return pct > 0.8 ? "#800026" : pct > 0.6 ? "#E31A1C" : pct > 0.4 ? "#FD8D3C" : pct > 0.2 ? "#FEB24C" : "#FFEDA0";
  }, [analysisType, compareMode, ndviLayer, summary?.max_lst, summary?.min_lst]);

  useEffect(() => {
    const updateGeeLayer = async () => {
      if (!mapRef.current) return;
      if (geeLayerRef.current) {
        mapRef.current.removeLayer(geeLayerRef.current);
        geeLayerRef.current = null;
      }
      if (mapMode === "idw" && summary?.selectedYear) {
        try {
          const metricParam = analysisType === "green" ? "&metric=vegetation" : "";
          const res = await fetch(`/api/gee/tiles?year=${summary.selectedYear}&compare=${compareMode}&baseline=${summary.compareYear}${metricParam}`);
          const data = await res.json();
          if (data.urlFormat) {
            geeLayerRef.current = L.tileLayer(data.urlFormat, { maxZoom: 20, opacity }).addTo(mapRef.current);
          }
        } catch (error) {
          console.error("Failed to load GEE tiles:", error);
        }
      }
    };
    updateGeeLayer();
  }, [mapMode, summary?.selectedYear, compareMode, summary?.compareYear, analysisType, opacity]);

  useEffect(() => {
    if (geeLayerRef.current) geeLayerRef.current.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    if (!mapRef.current || !geojsonData) return;
    if (geojsonLayerRef.current) mapRef.current.removeLayer(geojsonLayerRef.current);

    geojsonLayerRef.current = L.geoJSON(geojsonData, {
      style: (feature) => {
        const value = getFeatureValue(feature);
        const isSelected = activeDistrict !== ALL_DISTRICTS &&
          (feature?.properties?.name_th === activeDistrict || `เขต${feature?.properties?.name_th}` === activeDistrict);
        const isDimmed = activeDistrict !== ALL_DISTRICTS && !isSelected;
        const showFill = mapMode === "district" || activeDistrict !== ALL_DISTRICTS;
        return {
          fillColor: getColor(value),
          weight: isSelected ? 3 : 1,
          opacity: 1,
          color: isSelected ? "#ffffff" : "#1e293b",
          dashArray: "3",
          fillOpacity: showFill ? (isDimmed ? 0.2 : 0.72) : 0,
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const value = getFeatureValue(feature);
        const decimals = analysisType === "green" && ndviLayer !== "ndvi_score" ? 3 : 2;
        const unit = analysisType === "heat" ? "°C" : "";
        const title = analysisType === "green" ? (layerLabels[ndviLayer] || "NDVI") : "อุณหภูมิพื้นผิว";
        const deltaLine = props.vegetation_delta !== null && props.vegetation_delta !== undefined
          ? `<div class="text-[10px] text-slate-400 mt-1">แนวโน้ม: <span class="${props.vegetation_delta >= 0 ? "text-emerald-300" : "text-amber-300"} font-mono">${props.vegetation_delta >= 0 ? "+" : ""}${props.vegetation_delta.toFixed(3)}</span></div>`
          : "";

        layer.bindTooltip(`
          <div class="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 shadow-xl min-w-[190px]">
            <div class="font-bold mb-1 border-b border-slate-800 pb-1">${props.name_th || "Unknown"}</div>
            <div class="text-[10px] text-slate-400">${title}: <span class="text-emerald-300 text-lg font-mono ml-1">${formatValue(value, decimals, unit)}</span></div>
            ${analysisType === "green" ? `
              <div class="text-[10px] text-slate-400 mt-1">NDVI เฉลี่ย: <span class="text-emerald-300 font-mono">${formatValue(props.ndvi_mean, 3)}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">คะแนน: <span class="text-emerald-300 font-mono">${formatValue(props.ndvi_score, 2)}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">ระดับ: <span class="text-emerald-300">${props.ndvi_class || "ไม่มีข้อมูล"}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">พื้นที่สีเขียว: <span class="text-emerald-300 font-mono">${props.green_area_ratio !== null && props.green_area_ratio !== undefined ? `${(props.green_area_ratio * 100).toFixed(1)}%` : "ไม่มีข้อมูล"}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">ประมาณ: <span class="text-emerald-300 font-mono">${props.green_area_rai !== null && props.green_area_rai !== undefined ? `${Number(props.green_area_rai).toLocaleString("th-TH")} ไร่` : "ไม่มีข้อมูล"}</span></div>
              ${deltaLine}
            ` : ""}
          </div>
        `, { sticky: true, className: "bg-transparent border-none shadow-none" });
      },
    }).addTo(mapRef.current);

    if (activeDistrict !== ALL_DISTRICTS && geojsonLayerRef.current) {
      const selectedLayers = geojsonLayerRef.current.getLayers().filter((layer: any) =>
        layer.feature.properties.name_th === activeDistrict || `เขต${layer.feature.properties.name_th}` === activeDistrict,
      );
      if (selectedLayers.length > 0 && selectedLayers[0] instanceof L.Polygon) {
        mapRef.current.flyToBounds((selectedLayers[0] as L.Polygon).getBounds(), { padding: [50, 50], duration: 1.2 });
      }
    } else if (geojsonLayerRef.current) {
      mapRef.current.flyToBounds(geojsonLayerRef.current.getBounds(), { padding: [20, 20], duration: 1.2 });
    }
  }, [geojsonData, activeDistrict, mapMode, compareMode, summary, ndviLayer, analysisType, getColor, getFeatureValue]);

  return <div id="lst-map" className="w-full h-full z-0" style={{ background: "#0b0f19" }} />;
}
