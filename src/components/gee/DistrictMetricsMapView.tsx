/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { formatLST, getLSTClassThai, getLSTColor } from "@/lib/lst";
import { getNdviClassThai } from "@/lib/ndvi";

interface DistrictMetricsMapViewProps {
  geojsonData: any;
  invertedMask?: any;
  activeDistrict: string;
  mapMode: "district" | "idw" | "satellite-cache";
  compareMode?: boolean;
  summary?: any;
  opacity?: number;
  baseMap?: "dark" | "light" | "satellite" | "streets" | "none";
  analysisType?: "heat" | "green" | "builtup" | "nightlights" | "air";
  ndviLayer?: "green_area_rai" | "green_area_ratio" | "ndvi_mean";
  airPollutionLayer?: "no2_mean" | "co_mean" | "so2_mean" | "aerosol_index_mean" | "pollution_score";
  dataPeriodLabel?: string;
  nightLightsProduct?: "annual" | "monthly";
  nightLightsMonth?: number;
  /** WebP preview URL from R2 cache — rendered as an image overlay in satellite-cache mode. */
  satelliteCachePreviewUrl?: string | null;
  /** Bounds for the cache overlay: [[south, west], [north, east]]. Defaults to Bangkok extent. */
  satelliteCacheBounds?: [[number, number], [number, number]];
  /** "district" renders 50 district polygons; "subdistrict" renders 180 แขวง polygons. */
  granularity?: "district" | "subdistrict";
  /** Called when GEE tile metadata is received (sceneCount, lowSceneWarning, dataSource) */
  onTileMetadata?: (meta: { sceneCount: number; lowSceneWarning: boolean; dataSource: string }) => void;
}

const ALL_DISTRICTS = "ทั้งหมด";

const layerLabels: Record<string, string> = {
  green_area_rai: "ขนาดพื้นที่สีเขียว",
  green_area_ratio: "สัดส่วนพื้นที่สีเขียว",
  ndvi_mean: "ค่า NDVI เฉลี่ย",
};

const AIR_LAYER_META: Record<string, { label: string; unit: string; digits: number }> = {
  no2_mean: { label: "NO₂", unit: "", digits: 6 },
  co_mean: { label: "CO", unit: "", digits: 4 },
  so2_mean: { label: "SO₂", unit: "", digits: 6 },
  aerosol_index_mean: { label: "ดัชนีละออง", unit: "", digits: 3 },
  pollution_score: { label: "คะแนนมลพิษรวม", unit: " /10", digits: 2 },
};

function formatValue(value: number | null | undefined, digits = 2, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "ไม่มีข้อมูล";
  if (suffix.trim() === "ไร่") {
    return `${value.toLocaleString("th-TH", { maximumFractionDigits: digits })}${suffix}`;
  }
  return `${value.toFixed(digits)}${suffix}`;
}

// Bangkok bounding box used as default for the R2 cache image overlay
const BKK_BOUNDS: [[number, number], [number, number]] = [[13.494, 100.329], [13.956, 100.935]];

export default function DistrictMetricsMapView({
  geojsonData,
  invertedMask,
  activeDistrict,
  mapMode,
  compareMode,
  summary,
  opacity = 0.8,
  baseMap = "dark",
  analysisType = "heat",
  ndviLayer = "green_area_rai",
  airPollutionLayer = "no2_mean",
  dataPeriodLabel,
  nightLightsProduct = "annual",
  nightLightsMonth,
  satelliteCachePreviewUrl,
  satelliteCacheBounds,
  granularity = "district",
  onTileMetadata,
}: DistrictMetricsMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const geeLayerRef = useRef<L.TileLayer | null>(null);
  const cacheLayerRef = useRef<L.ImageOverlay | null>(null);
  const maskLayerRef = useRef<L.GeoJSON | null>(null);
  const yearRef = useRef(summary?.selectedYear || 2024);
  const baselineYearRef = useRef(summary?.compareYear || 2018);
  const mapModeRef = useRef(mapMode);
  const compareModeRef = useRef(compareMode);
  const analysisTypeRef = useRef(analysisType);
  const nightLightsProductRef = useRef(nightLightsProduct);
  const nightLightsMonthRef = useRef(nightLightsMonth);
  const airPollutantRef = useRef("no2");
  const dataPeriodRef = useRef(dataPeriodLabel || "");
  const activeDistrictRef = useRef(activeDistrict);
  const airPollutant = airPollutionLayer === "co_mean"
    ? "co"
    : airPollutionLayer === "so2_mean"
      ? "so2"
      : airPollutionLayer === "aerosol_index_mean"
        ? "aerosol"
        : "no2";

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
    nightLightsProductRef.current = nightLightsProduct;
    nightLightsMonthRef.current = nightLightsMonth;
    airPollutantRef.current = airPollutant;
    dataPeriodRef.current = dataPeriodLabel || "";
    activeDistrictRef.current = activeDistrict;
  }, [activeDistrict, airPollutant, analysisType, compareMode, dataPeriodLabel, mapMode, nightLightsMonth, nightLightsProduct]);

  const pointPopupContent = useCallback((options: {
    lat: number;
    lng: number;
    value?: number | null;
    loading?: boolean;
    error?: string;
  }) => {
    const currentAnalysis = analysisTypeRef.current;
    const isGreen = currentAnalysis === "green";
    const isBuiltup = currentAnalysis === "builtup";
    const isNightlights = currentAnalysis === "nightlights";
    const isAir = currentAnalysis === "air";
    const isCompare = compareModeRef.current;
    const accent = isGreen ? "text-emerald-400" : isBuiltup ? "text-indigo-400" : isNightlights ? "text-yellow-300" : isAir ? "text-cyan-300" : "text-orange-400";
    const selectedAirMeta = AIR_LAYER_META[airPollutionLayer] ?? AIR_LAYER_META.no2_mean;
    const label = isCompare
      ? isGreen ? "ส่วนต่าง NDVI" : isBuiltup ? "ส่วนต่าง NDBI" : isNightlights ? "ส่วนต่างแสงกลางคืน" : isAir ? `ส่วนต่าง ${selectedAirMeta.label}` : "ส่วนต่าง LST"
      : isGreen ? "ค่า NDVI ณ พิกเซล" : isBuiltup ? "ค่า NDBI ณ พิกเซล" : isNightlights ? "ค่าแสงกลางคืน ณ พิกเซล" : isAir ? `${selectedAirMeta.label} ณ พิกเซล` : "ค่า LST ณ พิกเซล";
    const unit = (isGreen || isBuiltup) ? "" : isNightlights ? " nW/sr/cm²" : isAir ? selectedAirMeta.unit : "°C";
    const signedValue = typeof options.value === "number" && isCompare && options.value > 0 ? `+${options.value}` : options.value;
    const valueText = options.loading
      ? "กำลังอ่านค่า..."
      : options.error
        ? "ไม่มีข้อมูล"
        : options.value === null || options.value === undefined
          ? "ไม่มีข้อมูล"
          : (isGreen || isBuiltup || isNightlights || isAir)
            ? `${signedValue}${unit}`
            : isCompare
              ? `${signedValue}${unit}`
              : formatLST(Number(options.value));
    const lstClass = (!isGreen && !isBuiltup && !isNightlights && !isAir) && typeof options.value === "number" ? getLSTClassThai(options.value) : "";
    const locationLabel = activeDistrictRef.current !== ALL_DISTRICTS ? activeDistrictRef.current : "ตำแหน่งที่คลิกบนแผนที่";

    return `
      <div class="bg-slate-950 text-white p-3 rounded-lg border border-slate-800 shadow-2xl min-w-[190px]">
        <div class="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 border-b border-slate-800 pb-1">ข้อมูลรายพิกเซล</div>
        <div class="text-[10px] text-slate-400 mb-1">พื้นที่/เขต: <span class="text-slate-100 font-bold">${locationLabel}</span></div>
        <div class="flex items-center justify-between gap-3 mb-1">
          <span class="text-[10px] text-slate-400">${label}</span>
          <span class="${accent} font-mono font-bold text-lg">${valueText}</span>
        </div>
        ${lstClass ? `<div class="text-[10px] text-slate-400 mb-1">ระดับอุณหภูมิพื้นผิว: <span class="text-orange-300 font-bold">${lstClass}</span></div>` : ""}
        ${isCompare ? `<div class="text-[9px] text-slate-500 mb-1">ปี ${yearRef.current} เทียบกับ ${baselineYearRef.current}</div>` : `<div class="text-[9px] text-slate-500 mb-1">ช่วงข้อมูล: ${dataPeriodRef.current || `ปี ${yearRef.current}`}</div>`}
        <div class="grid grid-cols-2 gap-2 text-[9px] text-slate-500 font-mono">
          <div>lat ${options.lat.toFixed(6)}</div>
          <div>lng ${options.lng.toFixed(6)}</div>
        </div>
        ${(!isGreen && !isBuiltup && !isNightlights && !isAir) && !isCompare && !options.loading && !options.error ? `<div class="text-[9px] text-slate-400 mt-2">พื้นผิวบริเวณนี้มีแนวโน้มสะสมความร้อนสูงตามระดับ LST ที่แสดง</div><div class="text-[9px] text-orange-200 mt-1">หมายเหตุ: ค่า LST ไม่ใช่อุณหภูมิอากาศ</div>` : ""}
        ${isNightlights && !options.loading && !options.error ? `<div class="text-[9px] text-slate-400 mt-2">ค่าสูง = พื้นที่มีกิจกรรมเมืองมาก แสงไฟถนน อาคาร พาณิชยกรรม</div>` : ""}
        ${isAir && !options.loading && !options.error ? `<div class="text-[9px] text-slate-400 mt-2">ข้อมูลมลพิษจากดาวเทียม ไม่ใช่ AQI จากสถานีภาคพื้น</div>` : ""}
        ${options.error ? `<div class="text-[9px] text-red-300 mt-2">${options.error}</div>` : ""}
      </div>
    `;
  }, [airPollutionLayer]);

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
        const metricParam = currentAnalysis === "green" ? "&metric=vegetation" : currentAnalysis === "builtup" ? "&metric=builtup" : currentAnalysis === "nightlights" ? `&metric=nightlights&product=${nightLightsProductRef.current}${nightLightsMonthRef.current ? `&month=${nightLightsMonthRef.current}` : ""}` : currentAnalysis === "air" ? `&metric=air_pollution&pollutant=${airPollutantRef.current}` : "";
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
    if (compareMode) {
      if (analysisType === "green") return feature?.properties?.vegetation_delta;
      if (analysisType === "nightlights") return feature?.properties?.ntl_delta;
      if (analysisType === "air") {
        const deltaFields: Record<string, string> = {
          no2_mean: "no2_delta",
          co_mean: "co_delta",
          so2_mean: "so2_delta",
          aerosol_index_mean: "aerosol_index_delta",
          pollution_score: "pollution_score_delta",
        };
        return feature?.properties?.[deltaFields[airPollutionLayer]];
      }
      return feature?.properties?.delta;
    }
    if (analysisType === "builtup") return feature?.properties?.ndbi_mean ?? feature?.properties?.ndbi;
    if (analysisType === "nightlights") return feature?.properties?.ntl_mean;
    if (analysisType === "air") return feature?.properties?.[airPollutionLayer] ?? feature?.properties?.no2_mean;
    if (analysisType !== "green") return feature?.properties?.mean_lst;
    if (ndviLayer === "green_area_rai") return feature?.properties?.green_area_rai;
    if (ndviLayer === "green_area_ratio") return feature?.properties?.green_area_ratio;
    return feature?.properties?.ndvi_mean ?? feature?.properties?.ndvi;
  }, [airPollutionLayer, analysisType, compareMode, ndviLayer]);

  const getColor = useCallback((value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "#9ca3af";
    if (compareMode) {
      if (analysisType === "green") {
        return value > 0.15 ? "#047857" : value > 0.05 ? "#86EFAC" : value > -0.05 ? "#F7F7F7" : value > -0.15 ? "#F59E0B" : "#8B1E1E";
      }
      if (analysisType === "builtup") {
        return value > 0.1 ? "#EF4444" : value > 0.05 ? "#F59E0B" : value > -0.05 ? "#F7F7F7" : value > -0.1 ? "#84CC16" : "#16A34A";
      }
      if (analysisType === "nightlights") {
        return value > 8 ? "#B45309" : value > 3 ? "#F59E0B" : value > -3 ? "#F7F7F7" : value > -8 ? "#4292C6" : "#08306B";
      }
      if (analysisType === "air") {
        const thresholds = airPollutionLayer === "pollution_score"
          ? [1, 0.3]
          : airPollutionLayer === "aerosol_index_mean"
            ? [0.3, 0.1]
            : airPollutionLayer === "co_mean"
              ? [0.005, 0.0015]
              : [0.00008, 0.000025];
        return value > thresholds[0] ? "#B2182B" : value > thresholds[1] ? "#F59E0B" : value > -thresholds[1] ? "#F7F7F7" : value > -thresholds[0] ? "#67A9CF" : "#2166AC";
      }
      return value > 1.5 ? "#B2182B" : value > 0.5 ? "#EF8A62" : value > -0.5 ? "#F7F7F7" : value > -1.5 ? "#67A9CF" : "#2166AC";
    }

    if (analysisType === "builtup") {
      const min = -0.2;
      const max = 0.4;
      const pct = (value - min) / Math.max(0.01, max - min);
      return pct > 0.8 ? "#7F1D1D" : pct > 0.6 ? "#EF4444" : pct > 0.4 ? "#F59E0B" : pct > 0.2 ? "#84CC16" : "#16A34A";
    }

    if (analysisType === "nightlights") {
      if (value < 5) return "#172554";
      if (value < 15) return "#2563EB";
      if (value < 35) return "#FACC15";
      if (value < 60) return "#F97316";
      return "#FFFFFF";
    }

    if (analysisType === "air") {
      if (airPollutionLayer === "pollution_score") {
        return value > 8 ? "#7F1D1D" : value > 6 ? "#DC2626" : value > 4 ? "#F97316" : value > 2 ? "#FACC15" : "#22C55E";
      }
      if (airPollutionLayer === "co_mean") {
        const pct = (value - 0.015) / 0.04;
        return pct > 0.8 ? "#7F1D1D" : pct > 0.6 ? "#F97316" : pct > 0.4 ? "#FACC15" : pct > 0.2 ? "#22C55E" : "#67E8F9";
      }
      if (airPollutionLayer === "aerosol_index_mean") {
        const pct = (value + 1) / 3;
        return pct > 0.8 ? "#7F1D1D" : pct > 0.6 ? "#FB923C" : pct > 0.4 ? "#FDE68A" : pct > 0.2 ? "#E0F2FE" : "#0F766E";
      }
      const pct = value / 0.0003;
      return pct > 0.8 ? "#7F1D1D" : pct > 0.6 ? "#F97316" : pct > 0.4 ? "#FACC15" : pct > 0.2 ? "#22C55E" : "#67E8F9";
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
  }, [airPollutionLayer, analysisType, compareMode, ndviLayer]);

  useEffect(() => {
    const updateGeeLayer = async () => {
      if (!mapRef.current) return;
      if (geeLayerRef.current) {
        mapRef.current.removeLayer(geeLayerRef.current);
        geeLayerRef.current = null;
      }
      // Remove cache overlay when switching to idw/district
      if (mapMode !== "satellite-cache" && cacheLayerRef.current) {
        mapRef.current.removeLayer(cacheLayerRef.current);
        cacheLayerRef.current = null;
      }
      if (mapMode === "idw" && summary?.selectedYear) {
        try {
          const metricParam = analysisType === "green" ? "&metric=vegetation" : analysisType === "builtup" ? "&metric=builtup" : analysisType === "nightlights" ? `&metric=nightlights&product=${nightLightsProduct}${nightLightsMonth ? `&month=${nightLightsMonth}` : ""}` : analysisType === "air" ? `&metric=air_pollution&pollutant=${airPollutant}` : "";
          const compareParam = compareModeRef.current ? `&compare=true&baseline=${baselineYearRef.current}` : "";
          const res = await fetch(`/api/gee/tiles?year=${summary.selectedYear}&compare=${compareMode}&baseline=${summary.compareYear}${metricParam}${compareParam}`);
          const data = await res.json();
          if (data.urlFormat) {
            geeLayerRef.current = L.tileLayer(data.urlFormat, { maxZoom: 20, opacity }).addTo(mapRef.current);
          }
          if (onTileMetadata && data.dataSource !== undefined) {
            onTileMetadata({
              sceneCount: data.sceneCount ?? -1,
              lowSceneWarning: data.lowSceneWarning ?? false,
              dataSource: data.dataSource ?? "",
            });
          }
        } catch (error) {
          console.error("Failed to load GEE tiles:", error);
        }
      }
    };
    updateGeeLayer();
  }, [mapMode, summary?.selectedYear, compareMode, summary?.compareYear, analysisType, opacity, nightLightsMonth, nightLightsProduct, airPollutant, onTileMetadata]);

  useEffect(() => {
    if (geeLayerRef.current) geeLayerRef.current.setOpacity(opacity);
    if (cacheLayerRef.current) cacheLayerRef.current.setOpacity(opacity);
  }, [opacity]);

  // Satellite-cache image overlay — rendered when mapMode === "satellite-cache"
  useEffect(() => {
    if (!mapRef.current) return;
    if (cacheLayerRef.current) {
      mapRef.current.removeLayer(cacheLayerRef.current);
      cacheLayerRef.current = null;
    }
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

  // Inverted mask overlay — darkens area outside Bangkok
  useEffect(() => {
    if (!mapRef.current) return;
    if (maskLayerRef.current) { mapRef.current.removeLayer(maskLayerRef.current); maskLayerRef.current = null; }
    if (!invertedMask) return;
    maskLayerRef.current = L.geoJSON(invertedMask, {
      style: { fillColor: "#0b0f19", fillOpacity: 0.85, weight: 0, color: "transparent" },
      interactive: false,
    }).addTo(mapRef.current);
  }, [invertedMask]);

  useEffect(() => {
    if (!mapRef.current || !geojsonData) return;
    if (geojsonLayerRef.current) mapRef.current.removeLayer(geojsonLayerRef.current);

    geojsonLayerRef.current = L.geoJSON(geojsonData, {
      style: (feature) => {
        const value = getFeatureValue(feature);
        const p = feature?.properties ?? {};
        const isSelected = activeDistrict !== ALL_DISTRICTS && (
          p.name_th === activeDistrict || `เขต${p.name_th}` === activeDistrict ||
          // subdistrict: match parent district
          p.district_name === activeDistrict || `เขต${p.district_name}` === activeDistrict
        );
        const isDimmed = activeDistrict !== ALL_DISTRICTS && !isSelected;
        const showFill = mapMode === "district" || activeDistrict !== ALL_DISTRICTS;
        const isSatelliteMode = mapMode === "satellite-cache";
        return {
          fillColor: getColor(value),
          weight: isSatelliteMode ? (isSelected ? 2 : 0) : (isSelected ? 3 : 1),
          opacity: isSatelliteMode ? (isSelected ? 0.9 : 0) : 1,
          color: isSelected ? "#ffffff" : "#1e293b",
          dashArray: isSatelliteMode ? undefined : "3",
          fillOpacity: showFill ? (isDimmed ? 0.2 : 0.72) : 0,
        };
      },
      onEachFeature: (feature, layer) => {
        if (mapMode !== "district") return;
        const props = feature.properties || {};
        const value = getFeatureValue(feature);
        const decimals = analysisType === "green" ? (ndviLayer === "green_area_rai" ? 0 : ndviLayer === "green_area_ratio" ? 3 : 3) : analysisType === "nightlights" ? 3 : analysisType === "air" ? (airPollutionLayer === "pollution_score" ? 2 : 6) : 3;
        const unit = analysisType === "heat" ? "°C" : analysisType === "green" && ndviLayer === "green_area_rai" ? " ไร่" : "";
        const airLayerLabels: Record<string, string> = {
          no2_mean: "NO₂",
          co_mean: "CO",
          so2_mean: "SO₂",
          aerosol_index_mean: "Aerosol Index",
          pollution_score: "คะแนนมลพิษรวม",
        };
        const title = analysisType === "green"
          ? (ndviLayer === "ndvi_mean" ? "พื้นที่สีเขียว" : (layerLabels[ndviLayer] || "NDVI"))
          : analysisType === "builtup" ? "NDBI เฉลี่ย" : analysisType === "nightlights" ? "แสงกลางคืน (เฉลี่ย)" : analysisType === "air" ? airLayerLabels[airPollutionLayer] : "LST เฉลี่ย";
        const selectedDisplay = analysisType === "green"
          ? (ndviLayer === "green_area_ratio" && typeof value === "number"
              ? `${(value * 100).toFixed(1)}%`
              : ndviLayer === "ndvi_mean" && props.green_area_rai != null
                ? `${Number(props.green_area_rai).toLocaleString("th-TH")} ไร่`
                : formatValue(value, decimals, unit))
          : formatValue(value, analysisType === "heat" ? 2 : decimals, unit);
        const deltaLine = props.vegetation_delta !== null && props.vegetation_delta !== undefined
          ? `<div class="text-[10px] text-slate-400 mt-1">เปลี่ยนแปลง: <span class="${props.vegetation_delta >= 0 ? "text-emerald-300" : "text-amber-300"} font-mono">${props.vegetation_delta >= 0 ? "+" : ""}${props.vegetation_delta.toFixed(3)}</span></div>`
          : "";
        const yearLabel = compareMode
          ? `ปี ${summary?.selectedYear || ""} vs ${summary?.compareYear || ""}`
          : `ปี ${summary?.selectedYear || ""}`;
        const heatDetails = analysisType === "heat" && !compareMode ? `
              <div class="text-[10px] text-slate-400 mt-1">LST สูงสุด: <span class="text-red-300 font-mono">${props.max_lst != null ? `${Number(props.max_lst).toFixed(1)}°C` : "–"}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">ระดับ: <span class="text-orange-300 font-bold">${getLSTClassThai(value)}</span></div>
              <div class="text-[9px] text-orange-200/70 mt-1">LST = อุณหภูมิพื้นผิว ≠ อุณหภูมิอากาศ</div>
            ` : analysisType === "heat" ? `
              <div class="text-[9px] text-slate-500 mt-2">ผลต่างอุณหภูมิพื้นผิวจากดาวเทียม · ไม่ใช่ค่า SUHI อย่างเป็นทางการ</div>
            ` : "";
        const builtupDetails = analysisType === "builtup" ? `
              <div class="text-[10px] text-slate-400 mt-1">พื้นที่สิ่งปลูกสร้าง: <span class="text-indigo-300 font-mono">${props.builtup_area_rai != null ? `${Number(props.builtup_area_rai).toLocaleString("th-TH")} ไร่` : "–"}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">สัดส่วน: <span class="text-indigo-300 font-mono">${props.builtup_ratio != null ? `${(Number(props.builtup_ratio) * 100).toFixed(1)}%` : "–"}</span></div>
              <div class="text-[9px] text-slate-500 mt-1">NDBI ช่วง −0.2 ถึง +0.4 · ยิ่งสูง = หนาแน่นขึ้น</div>
            ` : "";
        const nightlightDetails = analysisType === "nightlights" ? `
              <div class="text-[10px] text-slate-400 mt-1">ค่าสูงสุดในเขต: <span class="text-yellow-200 font-mono">${formatValue(props.ntl_max, 3)}</span></div>
              ${props.ntl_delta !== null && props.ntl_delta !== undefined ? `<div class="text-[10px] text-slate-400 mt-1">เปลี่ยนแปลง: <span class="${props.ntl_delta >= 0 ? "text-amber-300" : "text-sky-300"} font-mono">${props.ntl_delta >= 0 ? "+" : ""}${props.ntl_delta.toFixed(3)}</span></div>` : ""}
              <div class="text-[9px] text-slate-500 mt-2">ค่าสูง = พื้นที่มีกิจกรรมเมืองและแสงไฟมาก</div>
            ` : "";
        const airDetails = analysisType === "air" ? `
              <div class="text-[10px] text-slate-400 mt-1">คะแนนรวม: <span class="text-cyan-200 font-mono font-bold">${formatValue(props.pollution_score, 2)}/10</span>${props.pollution_class ? ` <span class="text-slate-500 text-[9px]">(${String(props.pollution_class).replace(/_/g, " ")})</span>` : ""}</div>
              <div class="text-[10px] text-slate-400 mt-1">NO₂: <span class="text-cyan-200 font-mono">${formatValue(props.no2_mean, 6)}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">CO: <span class="text-cyan-200 font-mono">${formatValue(props.co_mean, 4)}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">SO₂: <span class="text-cyan-200 font-mono">${formatValue(props.so2_mean, 6)}</span></div>
              <div class="text-[10px] text-slate-400 mt-1">ละออง: <span class="text-cyan-200 font-mono">${formatValue(props.aerosol_index_mean, 3)}</span></div>
              <div class="text-[9px] text-slate-500 mt-1">ข้อมูลดาวเทียม · ไม่ใช่ AQI</div>
            ` : "";

        const titleSuffix = granularity === "subdistrict" && props.district_name
          ? `<span class="text-slate-500 text-[9px] ml-1">· เขต${props.district_name}</span>` : "";
        layer.bindTooltip(`
          <div class="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 shadow-xl min-w-[200px]">
            <div class="flex items-center justify-between gap-2 mb-1 border-b border-slate-800 pb-1">
              <span class="font-bold">${props.name_th || "Unknown"}${titleSuffix}</span>
              <span class="text-[9px] text-slate-500 font-mono font-normal shrink-0">${yearLabel}</span>
            </div>
            <div class="text-[10px] text-slate-400">${title}: <span class="${analysisType === "green" ? "text-emerald-300" : analysisType === "builtup" ? "text-indigo-300" : analysisType === "nightlights" ? "text-yellow-200" : analysisType === "air" ? "text-cyan-200" : "text-orange-300"} text-lg font-mono ml-1">${selectedDisplay}</span></div>
            ${heatDetails}
            ${builtupDetails}
            ${nightlightDetails}
            ${airDetails}
            ${analysisType === "green" ? `
              ${ndviLayer === "ndvi_mean" ? `<div class="text-[10px] text-slate-400 mt-1">NDVI เฉลี่ย: <span class="text-emerald-300 font-mono">${formatValue(props.ndvi_mean, 3)}</span></div>` : ""}
              ${ndviLayer !== "green_area_ratio" ? `<div class="text-[10px] text-slate-400 mt-1">สัดส่วนสีเขียว: <span class="text-emerald-300 font-mono">${props.green_area_ratio != null ? `${(props.green_area_ratio * 100).toFixed(1)}%` : "–"}</span></div>` : ""}
              ${ndviLayer !== "green_area_rai" ? `<div class="text-[10px] text-slate-400 mt-1">ขนาดพื้นที่สีเขียว: <span class="text-emerald-300 font-mono">${props.green_area_rai != null ? `${Number(props.green_area_rai).toLocaleString("th-TH")} ไร่` : "–"}</span></div>` : ""}
              <div class="text-[10px] text-slate-400 mt-1">ระดับ NDVI: <span class="text-emerald-300">${getNdviClassThai(props.ndvi_class)}</span></div>
              ${deltaLine}
            ` : ""}
          </div>
        `, { sticky: true, className: "bg-transparent border-none shadow-none" });
      },
    }).addTo(mapRef.current);

    if (activeDistrict !== ALL_DISTRICTS && geojsonLayerRef.current) {
      const selectedLayers = geojsonLayerRef.current.getLayers().filter((layer: any) => {
        const lp = layer.feature?.properties ?? {};
        return lp.name_th === activeDistrict || `เขต${lp.name_th}` === activeDistrict ||
               lp.district_name === activeDistrict || `เขต${lp.district_name}` === activeDistrict;
      });
      if (selectedLayers.length > 0) {
        const bounds = L.latLngBounds([]);
        selectedLayers.forEach((l: any) => { if (l.getBounds) bounds.extend(l.getBounds()); });
        if (bounds.isValid()) mapRef.current.flyToBounds(bounds, { padding: [50, 50], duration: 1.2 });
      }
    } else if (geojsonLayerRef.current) {
      mapRef.current.flyToBounds(geojsonLayerRef.current.getBounds(), { padding: [20, 20], duration: 1.2 });
    }
  }, [geojsonData, activeDistrict, mapMode, compareMode, summary, ndviLayer, airPollutionLayer, analysisType, granularity, satelliteCachePreviewUrl, getColor, getFeatureValue]);

  return <div id="lst-map" className="w-full h-full z-0" style={{ background: "#0b0f19" }} />;
}
