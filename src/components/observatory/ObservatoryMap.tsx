"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BMA_CITYMAP,
  type CityMapStatus,
} from "@/lib/observatory/citymap";

type AreaProperties = {
  areaCode: string;
  legacyId: number;
  nameTh: string;
  nameEn: string;
  level: string;
  metricValue?: number | null;
};

type AreaFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: AreaProperties;
};

type AreaCollection = {
  type: "FeatureCollection";
  features: AreaFeature[];
};

type ObservatoryMapProps = {
  geojson: AreaCollection | null;
  trustedValues: boolean;
  selectedName: string | null;
  ramp: string[];
  onSelect: (feature: AreaFeature) => void;
  onBasemapStatus: (status: CityMapStatus) => void;
};

const EMPTY_COLOR = "oklch(0.90 0.012 275)";
const EMPTY_STROKE = "oklch(0.63 0.025 278)";
const SELECTED_STROKE = "oklch(0.40 0.13 294)";

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
  onSelect,
  onBasemapStatus,
}: ObservatoryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const selectRef = useRef(onSelect);
  const basemapStatusRef = useRef(onBasemapStatus);
  selectRef.current = onSelect;
  basemapStatusRef.current = onBasemapStatus;

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [13.7563, 100.5018],
      crs: L.CRS.EPSG4326,
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
      keyboard: true,
    });

    const basemap = L.tileLayer.wms(BMA_CITYMAP.wmsUrl, {
      attribution: BMA_CITYMAP.attribution,
      layers: BMA_CITYMAP.wmsLayers,
      version: BMA_CITYMAP.wmsVersion,
      crs: L.CRS.EPSG4326,
      format: "image/png",
      transparent: false,
      minZoom: 8,
      maxZoom: 20,
      keepBuffer: 2,
      updateWhenIdle: true,
    });
    basemap.on("loading", () => basemapStatusRef.current("loading"));
    basemap.on("load", () => basemapStatusRef.current("ready"));
    basemap.on("tileerror", () =>
      basemapStatusRef.current("unavailable"),
    );
    basemap.addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    if (layerRef.current) {
      layerRef.current.removeFrom(map);
    }

    const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const properties = feature?.properties as AreaProperties | undefined;
        const selected = properties?.nameTh === selectedName;
        return {
          fillColor: trustedValues
            ? rampColor(properties?.metricValue, range.min, range.max, ramp)
            : EMPTY_COLOR,
          fillOpacity: trustedValues ? 0.72 : 0.22,
          color: selected ? SELECTED_STROKE : EMPTY_STROKE,
          weight: selected ? 3 : 1,
          opacity: 1,
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

    layerRef.current = layer;
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [18, 18] });
    }
  }, [geojson, ramp, range.max, range.min, selectedName, trustedValues]);

  return (
    <div
      ref={containerRef}
      className="map-keyboard-target h-full min-h-[520px] w-full bg-[var(--oe-map-canvas)]"
      role="application"
      aria-label="แผนที่เลือกพื้นที่วิเคราะห์กรุงเทพมหานคร ใช้แป้นลูกศรเพื่อเลื่อนแผนที่ และใช้ตารางด้านล่างเป็นทางเลือกสำหรับเลือกเขต"
      tabIndex={0}
    />
  );
}
