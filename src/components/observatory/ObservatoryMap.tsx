"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeeMetric } from "@/lib/observatory/catalog";

export type MapDisplayMode = "district" | "gee";
export type GeeLayerStatus = {
  state: "idle" | "loading" | "ready" | "error";
  message?: string;
  sceneCount?: number;
  resolutionMeters?: number;
  dataSource?: string;
};

export type GeePointResult = {
  value: number | null;
  lat: number;
  lng: number;
  sceneCount?: number;
  resolutionMeters?: number;
  loading?: boolean;
  error?: string;
};

type BasemapStatus = "loading" | "ready" | "unavailable";

export type AreaProperties = {
  areaCode: string;
  legacyId: number;
  nameTh: string;
  nameEn: string;
  level: string;
  metricValue?: number | null;
  baselineValue?: number | null;
  metricDelta?: number | null;
};

export type AreaFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: AreaProperties;
};

export type AreaCollection = {
  type: "FeatureCollection";
  features: AreaFeature[];
};

type ObservatoryMapProps = {
  geojson: AreaCollection | null;
  trustedValues: boolean;
  selectedName: string | null;
  ramp: string[];
  mode: MapDisplayMode;
  geeMetric?: GeeMetric;
  year: number;
  baseline: number;
  compare: boolean;
  onSelect: (feature: AreaFeature) => void;
  onBasemapStatus: (status: BasemapStatus) => void;
  onGeeStatus: (status: GeeLayerStatus) => void;
  onPointResult: (result: GeePointResult | null) => void;
};

const EMPTY_COLOR = "oklch(0.32 0.02 265)";
const EMPTY_STROKE = "oklch(0.72 0.035 255)";
const SELECTED_STROKE = "oklch(0.82 0.13 240)";

function rampColor(value: number | null | undefined, min: number, max: number, ramp: string[]) {
  if (typeof value !== "number" || !Number.isFinite(value) || min === max) return EMPTY_COLOR;
  const normalized = Math.max(0, Math.min(0.999, (value - min) / (max - min)));
  return ramp[Math.floor(normalized * ramp.length)] ?? ramp[0];
}

export default function ObservatoryMap({
  geojson,
  trustedValues,
  selectedName,
  ramp,
  mode,
  geeMetric,
  year,
  baseline,
  compare,
  onSelect,
  onBasemapStatus,
  onGeeStatus,
  onPointResult,
}: ObservatoryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const districtLayerRef = useRef<L.GeoJSON | null>(null);
  const geeLayerRef = useRef<L.TileLayer | null>(null);
  const pointMarkerRef = useRef<L.CircleMarker | null>(null);
  const selectRef = useRef(onSelect);
  const basemapStatusRef = useRef(onBasemapStatus);
  const pointResultRef = useRef(onPointResult);
  const pointAbortRef = useRef<AbortController | null>(null);
  selectRef.current = onSelect;
  basemapStatusRef.current = onBasemapStatus;
  pointResultRef.current = onPointResult;

  const range = useMemo(() => {
    if (!geojson || !trustedValues) return { min: 0, max: 0 };
    const values = geojson.features
      .map((feature) => feature.properties.metricValue)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
    };
  }, [geojson, trustedValues]);

  const readPoint = useCallback(async (lat: number, lng: number) => {
    if (mode !== "gee" || !geeMetric) return;
    pointAbortRef.current?.abort();
    const controller = new AbortController();
    pointAbortRef.current = controller;
    pointResultRef.current({ value: null, lat, lng, loading: true });

    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      year: String(year),
      baseline: String(baseline),
      compare: String(compare),
      metric: geeMetric,
    });

    try {
      const response = await fetch(`/api/gee/point?${params.toString()}`, {
        signal: controller.signal,
      });
      const payload = await response.json() as {
        temp?: number | null;
        sceneCount?: number;
        resolutionMeters?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "ยังอ่านค่าจุดนี้ไม่ได้");
      pointResultRef.current({
        value: typeof payload.temp === "number" ? payload.temp : null,
        lat,
        lng,
        sceneCount: payload.sceneCount,
        resolutionMeters: payload.resolutionMeters,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      pointResultRef.current({
        value: null,
        lat,
        lng,
        error: error instanceof Error ? error.message : "ยังอ่านค่าจุดนี้ไม่ได้",
      });
    }
  }, [baseline, compare, geeMetric, mode, year]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [13.7563, 100.5018],
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
      keyboard: true,
    });
    const basemap = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
        minZoom: 8,
        maxZoom: 19,
        keepBuffer: 2,
        updateWhenIdle: true,
      },
    );
    basemap.on("loading", () => basemapStatusRef.current("loading"));
    basemap.on("load", () => basemapStatusRef.current("ready"));
    basemap.on("tileerror", () => basemapStatusRef.current("unavailable"));
    basemap.addTo(map);
    mapRef.current = map;

    return () => {
      pointAbortRef.current?.abort();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleClick = (event: L.LeafletMouseEvent) => {
      if (mode !== "gee" || !geeMetric) return;
      if (pointMarkerRef.current) pointMarkerRef.current.removeFrom(map);
      pointMarkerRef.current = L.circleMarker(event.latlng, {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 1,
      }).addTo(map);
      void readPoint(event.latlng.lat, event.latlng.lng);
    };
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [geeMetric, mode, readPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (geeLayerRef.current) {
      geeLayerRef.current.removeFrom(map);
      geeLayerRef.current = null;
    }
    pointAbortRef.current?.abort();
    pointResultRef.current(null);
    if (pointMarkerRef.current) {
      pointMarkerRef.current.removeFrom(map);
      pointMarkerRef.current = null;
    }

    if (mode !== "gee" || !geeMetric) {
      onGeeStatus({ state: "idle" });
      return;
    }

    const controller = new AbortController();
    onGeeStatus({ state: "loading" });
    const params = new URLSearchParams({
      year: String(year),
      baseline: String(baseline),
      compare: String(compare),
      metric: geeMetric,
    });

    fetch(`/api/gee/tiles?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as {
          urlFormat?: string;
          sceneCount?: number;
          resolutionMeters?: number;
          dataSource?: string;
          error?: string;
        };
        if (!response.ok || !payload.urlFormat) {
          throw new Error(payload.error || "ยังเปิดภาพดาวเทียมไม่ได้");
        }
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        geeLayerRef.current = L.tileLayer(payload.urlFormat!, {
          maxZoom: 20,
          opacity: 0.84,
        }).addTo(map);
        districtLayerRef.current?.bringToFront();
        onGeeStatus({
          state: "ready",
          sceneCount: payload.sceneCount,
          resolutionMeters: payload.resolutionMeters,
          dataSource: payload.dataSource,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        onGeeStatus({
          state: "error",
          message: error instanceof Error ? error.message : "ยังเปิดภาพดาวเทียมไม่ได้",
        });
      });

    return () => controller.abort();
  }, [baseline, compare, geeMetric, mode, onGeeStatus, year]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;
    districtLayerRef.current?.removeFrom(map);

    const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const properties = feature?.properties as AreaProperties | undefined;
        const selected = properties?.nameTh === selectedName;
        const showDistrictFill = mode === "district";
        return {
          fillColor: trustedValues && showDistrictFill
            ? rampColor(properties?.metricValue, range.min, range.max, ramp)
            : EMPTY_COLOR,
          fillOpacity: showDistrictFill ? (trustedValues ? 0.72 : 0.22) : 0.02,
          color: selected ? SELECTED_STROKE : EMPTY_STROKE,
          weight: selected ? 3 : mode === "gee" ? 1.2 : 1,
          opacity: mode === "gee" ? 0.82 : 1,
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const typedFeature = feature as AreaFeature;
        featureLayer.on("click", () => selectRef.current(typedFeature));
        featureLayer.bindTooltip(typedFeature.properties.nameTh, {
          sticky: true,
          direction: "top",
          className: "oe-map-tooltip",
        });
      },
    }).addTo(map);

    districtLayerRef.current = layer;
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [18, 18] });
  }, [geojson, mode, ramp, range.max, range.min, selectedName, trustedValues]);

  return (
    <div
      ref={containerRef}
      className={`map-keyboard-target h-full min-h-[580px] w-full bg-[var(--oe-map-canvas)] ${mode === "gee" ? "cursor-crosshair" : ""}`}
      role="application"
      aria-label={mode === "gee"
        ? "แผนที่ภาพดาวเทียมกรุงเทพมหานคร คลิกเพื่ออ่านค่าจุด หรือคลิกเขตเพื่อดูสรุป"
        : "แผนที่สรุปข้อมูล 50 เขต คลิกเขตเพื่อดูรายละเอียด"}
      tabIndex={0}
    />
  );
}
