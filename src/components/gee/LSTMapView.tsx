/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { formatLST, getLSTClassThai, getLSTColor } from "@/lib/lst";

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
  ndviLayer?: "green_area_rai" | "green_area_ratio" | "ndvi_mean";
  dataPeriodLabel?: string;
}

const ALL_DISTRICTS = "ทั้งหมด";

const layerLabels: Record<string, string> = {
  green_area_rai: "ขนาดพื้นที่สีเขียว",
  green_area_ratio: "สัดส่วนพื้นที่สีเขียว",
  ndvi_mean: "ค่า NDVI เฉลี่ย",
};

function formatValue(value: number | null | undefined, digits = 2, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  if (suffix.trim() === "ไร่") {
    return `${value.toLocaleString("th-TH", { maximumFractionDigits: digits })}${suffix}`;
  }
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
  ndviLayer = "green_area_rai",
  dataPeriodLabel,
}: LSTMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const geeLayerRef = useRef<L.TileLayer | null>(null);
  const yearRef = useRef(summary?.selectedYear || 2024);
  const baselineYearRef = useRef(summary?.compareYear || 2018);
  const mapModeRef = useRef(mapMode);
  const compareModeRef = useRef(compareMode);
  const analysisTypeRef = useRef(analysisType);
  const dataPeriodRef = useRef(dataPeriodLabel || "");
  const activeDistrictRef = useRef(activeDistrict);

  useEffect(() => {
    if (summary?.selectedYear) yearRef.current = summary.selectedYear;
  }, [summary?.selectedYear]);

  useEffect(() => {
    baselineYearRef.current = summary?.compareYear || 2018;
  }, [summary?.compareYear]);

  useEffect(() => {
    mapModeRef.current = mapMode;
    compareModeRef.current = compareMode;
    analysisTypeRef.current = analysisType;
    dataPeriodRef.current = dataPeriodLabel || "";
    activeDistrictRef.current = activeDistrict;
  }, [activeDistrict, analysisType, compareMode, dataPeriodLabel, mapMode]);

  const pointPopupContent = useCallback((options: {
    lat: number;
    lng: number;
    value?: number | null;
    loading?: boolean;
    error?: string;
  }) => {
    const currentAnalysis = analysisTypeRef.current;
    const isGreen = currentAnalysis === "green";
    const isCompare = compareModeRef.current;
    const accent = isGreen ? "text-emerald-400" : "text-orange-400";
    const label = isCompare
      ? isGreen ? "ส่วนต่าง NDVI" : "ส่วนต่าง LST"
      : isGreen ? "ค่า NDVI ณ พิกเซล" : "ค่า LST ณ พิกเซล";
    const unit = isGreen ? "" : "°C";
    const signedValue = typeof options.value === "number" && isCompare && options.value > 0 ? `+${options.value}` : options.value;
    const valueText = options.loading
      ? "กำลังอ่านค่า..."
      : options.error
        ? "ไม่มีข้อมูล"
        : options.value === null || options.value === undefined
          ? "ไม่มีข้อมูล"
          : isGreen
            ? `${signedValue}${unit}`
            : isCompare
              ? `${signedValue}${unit}`
              : formatLST(Number(options.value));
    const lstClass = !isGreen && typeof options.value === "number" ? getLSTClassThai(options.value) : "";
    const locationLabel = activeDistrictRef.current !== ALL_DISTRICTS ? activeDistrictRef.current : "ตำแหน่งที่คลิกบนแผนที่";

    return `
      <div class="bg-slate-950 text-white p-3 rounded-lg border border-slate-800 shadow-2xl min-w-[190px]">
        <div class="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 border-b border-slate-800 pb-1">ค่าจริงจากพิกเซล GEE</div>
        <div class="text-[10px] text-slate-400 mb-1">พื้นที่/เขต: <span class="text-slate-100 font-bold">${locationLabel}</span></div>
        <div class="flex items-center justify-between gap-3 mb-1">
          <span class="text-[10px] text-slate-400">${label}</span>
          <span class="${accent} font-mono font-bold text-lg">${valueText}</span>
        </div>
        ${!isGreen && lstClass ? `<div class="text-[10px] text-slate-400 mb-1">ระดับอุณหภูมิพื้นผิว: <span class="text-orange-300 font-bold">${lstClass}</span></div>` : ""}
        ${isCompare ? `<div class="text-[9px] text-slate-500 mb-1">ปี ${yearRef.current} เทียบกับ ${baselineYearRef.current}</div>` : `<div class="text-[9px] text-slate-500 mb-1">ช่วงข้อมูล: ${dataPeriodRef.current || `ปี ${yearRef.current}`}</div>`}
        <div class="grid grid-cols-2 gap-2 text-[9px] text-slate-500 font-mono">
          <div>lat ${options.lat.toFixed(6)}</div>
          <div>lng ${options.lng.toFixed(6)}</div>
        </div>
        ${!isGreen && !isCompare && !options.loading && !options.error ? `<div class="text-[9px] text-slate-400 mt-2">พื้นผิวบริเวณนี้มีแนวโน้มสะสมความร้อนสูงตามระดับ LST ที่แสดง</div><div class="text-[9px] text-orange-200 mt-1">หมายเหตุ: ค่า LST ไม่ใช่อุณหภูมิอากาศ</div>` : ""}
        ${options.error ? `<div class="text-[9px] text-red-300 mt-2">${options.error}</div>` : ""}
      </div>
    `;
  }, []);

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
      if (mapModeRef.current !== "idw") return;
      if (!mapRef.current) return;
      const { lat, lng } = e.latlng;
      const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(pointPopupContent({ lat, lng, loading: true }))
        .openOn(mapRef.current);

      try {
        const currentAnalysis = analysisTypeRef.current;
        const metricParam = currentAnalysis === "green" ? "&metric=vegetation" : "";
        const compareParam = compareModeRef.current ? `&compare=true&baseline=${baselineYearRef.current}` : "";
        const res = await fetch(`/api/gee/point?lat=${lat}&lng=${lng}&year=${yearRef.current}${metricParam}${compareParam}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No data");
        const value = data.temp;
        popup.setContent(pointPopupContent({ lat, lng, value }));
      } catch (error: any) {
        popup.setContent(pointPopupContent({ lat, lng, value: null, error: error?.message || "ไม่สามารถดึงข้อมูลจุดนี้ได้" }));
      }
    });
  }, [pointPopupContent]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getContainer().style.cursor = mapMode === "idw" ? "crosshair" : "";
    return () => {
      if (mapRef.current) mapRef.current.getContainer().style.cursor = "";
    };
  }, [mapMode]);

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
    if (ndviLayer === "green_area_rai") return feature?.properties?.green_area_rai;
    if (ndviLayer === "green_area_ratio") return feature?.properties?.green_area_ratio;
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
      if (ndviLayer === "green_area_rai") {
        min = 0;
        max = 20000;
      } else if (ndviLayer === "green_area_ratio") {
        min = 0;
        max = 0.7;
      }
      const pct = (value - min) / Math.max(0.01, max - min);
      return pct > 0.8 ? "#238b45" : pct > 0.6 ? "#68d391" : pct > 0.4 ? "#f6e05e" : pct > 0.2 ? "#d94801" : "#8c2d04";
    }

    return getLSTColor(value);
  }, [analysisType, compareMode, ndviLayer]);

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
        if (mapMode !== "district") return;
        const props = feature.properties || {};
        const value = getFeatureValue(feature);
        const decimals = analysisType === "green" ? (ndviLayer === "green_area_rai" ? 0 : ndviLayer === "green_area_ratio" ? 3 : 3) : 2;
        const unit = analysisType === "heat" ? "°C" : ndviLayer === "green_area_rai" ? " ไร่" : "";
        const title = analysisType === "green" ? (layerLabels[ndviLayer] || "NDVI") : "ค่า LST";
        const selectedDisplay = ndviLayer === "green_area_ratio" && typeof value === "number"
          ? `${(value * 100).toFixed(1)}%`
          : formatValue(value, decimals, unit);
        const deltaLine = props.vegetation_delta !== null && props.vegetation_delta !== undefined
          ? `<div class="text-[10px] text-slate-400 mt-1">แนวโน้ม: <span class="${props.vegetation_delta >= 0 ? "text-emerald-300" : "text-amber-300"} font-mono">${props.vegetation_delta >= 0 ? "+" : ""}${props.vegetation_delta.toFixed(3)}</span></div>`
          : "";
        const heatDetails = analysisType === "heat" && !compareMode ? `
              <div class="text-[10px] text-slate-400 mt-1">ระดับอุณหภูมิพื้นผิว: <span class="text-orange-300 font-bold">${getLSTClassThai(value)}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">ช่วงข้อมูล: <span class="text-slate-200">${dataPeriodLabel || `ปี ${summary?.selectedYear || ""}`}</span></div>
              <div class="text-[9px] text-slate-400 mt-2">พื้นผิวบริเวณนี้มีแนวโน้มสะสมความร้อนสูงตามระดับ LST ที่แสดง</div>
              <div class="text-[9px] text-orange-200 mt-1">หมายเหตุ: ค่า LST ไม่ใช่อุณหภูมิอากาศ</div>
            ` : analysisType === "heat" ? `
              <div class="text-[10px] text-slate-400 mt-1">ผลต่าง LST ระหว่างปี: <span class="text-orange-300 font-bold">${selectedDisplay}</span></div>
              <div class="text-[9px] text-slate-400 mt-2">เป็นการเปรียบเทียบอุณหภูมิพื้นผิวจากดาวเทียมระหว่างปี ยังไม่ใช่ค่า SUHI Intensity อย่างเป็นทางการ</div>
            ` : "";

        layer.bindTooltip(`
          <div class="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 shadow-xl min-w-[190px]">
            <div class="font-bold mb-1 border-b border-slate-800 pb-1">${props.name_th || "Unknown"}</div>
            <div class="text-[10px] text-slate-400">${title}: <span class="${analysisType === "green" ? "text-emerald-300" : "text-orange-300"} text-lg font-mono ml-1">${selectedDisplay}</span></div>
            ${heatDetails}
            ${analysisType === "green" ? `
              <div class="text-[10px] text-slate-400 mt-1">NDVI เฉลี่ย: <span class="text-emerald-300 font-mono">${formatValue(props.ndvi_mean, 3)}</span></div>
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
