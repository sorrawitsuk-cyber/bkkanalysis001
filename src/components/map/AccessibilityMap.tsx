/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ACCESSIBILITY_LABELS,
  accessibilityColor,
  accessibilityValue,
  type AccessibilityCategory,
  type AccessibilityDistrict,
  type AccessibilityMetric,
  type AccessibilityService,
} from "@/lib/accessibility";

const SERVICE_COLORS: Record<AccessibilityCategory, string> = {
  health: "#ef4444",
  education: "#3b82f6",
  food: "#f59e0b",
  recreation: "#22c55e",
  transit: "#a855f7",
};

function FitBounds({ geojson, districtId }: { geojson: any; districtId: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson) return;
    const selected = districtId
      ? {
          type: "FeatureCollection",
          features: geojson.features.filter(
            (feature: any) => feature.properties?.id === districtId,
          ),
        }
      : geojson;
    const bounds = L.geoJSON(selected).getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [24, 24], duration: 0.4 });
  }, [districtId, geojson, map]);
  return null;
}

export default function AccessibilityMap({
  geojson,
  districts,
  services,
  metric,
  category,
  activeDistrictId,
  showServices,
  onSelectDistrict,
}: {
  geojson: any;
  districts: AccessibilityDistrict[];
  services: AccessibilityService[];
  metric: AccessibilityMetric;
  category: AccessibilityCategory | "all";
  activeDistrictId: number | null;
  showServices: boolean;
  onSelectDistrict: (district: AccessibilityDistrict) => void;
}) {
  const rowById = useMemo(
    () => new Map(districts.map((district) => [district.district_id, district])),
    [districts],
  );
  const visibleServices = services.filter(
    (service) =>
      (category === "all" || service.category === category) &&
      (!activeDistrictId || service.district_id === activeDistrictId),
  );

  return (
    <MapContainer
      center={[13.7563, 100.5018]}
      zoom={10}
      className="h-full w-full bg-slate-950"
      attributionControl
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <GeoJSON
        key={`${metric}-${activeDistrictId ?? "all"}`}
        data={geojson}
        style={(feature) => {
          const district = rowById.get(Number(feature?.properties?.id));
          const value = district ? accessibilityValue(district, metric) : 0;
          const active = !activeDistrictId || activeDistrictId === district?.district_id;
          return {
            color: activeDistrictId === district?.district_id ? "#ffffff" : "#64748b",
            weight: activeDistrictId === district?.district_id ? 2.5 : 0.8,
            fillColor: accessibilityColor(value),
            fillOpacity: active ? 0.72 : 0.12,
          };
        }}
        onEachFeature={(feature, layer) => {
          const district = rowById.get(Number(feature.properties?.id));
          if (!district) return;
          const value = accessibilityValue(district, metric);
          layer.bindTooltip(
            `<strong>เขต${district.district_name}</strong><br/>ค่าที่แสดง: <strong>${value.toFixed(1)}%</strong><br/>ครบ 5 หมวด: ${district.complete_coverage_pct.toFixed(1)}%<br/>อันดับ ${district.rank}/50`,
            { sticky: true },
          );
          layer.on("click", () => onSelectDistrict(district));
        }}
      />
      {showServices &&
        visibleServices.map((service) => (
          <CircleMarker
            key={service.id}
            center={[service.lat, service.lng]}
            radius={4}
            pathOptions={{
              color: "#ffffff",
              weight: 0.6,
              fillColor: SERVICE_COLORS[service.category],
              fillOpacity: 0.9,
            }}
          >
            <Tooltip>
              <strong>{service.name}</strong>
              <br />
              {ACCESSIBILITY_LABELS[service.category]}
              <br />
              <span className="text-slate-500">{service.source}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      <FitBounds geojson={geojson} districtId={activeDistrictId} />
      <div className="leaflet-bottom leaflet-left">
        <div className="leaflet-control m-3 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-[10px] text-slate-300 shadow-xl">
          <div className="mb-1.5 font-bold">สัดส่วนพื้นที่ที่เข้าถึงภายใน 15 นาที</div>
          <div className="flex items-center gap-1.5">
            <span>ต่ำ</span>
            <span className="h-2.5 w-28 rounded bg-gradient-to-r from-red-700 via-yellow-400 to-emerald-700" />
            <span>สูง</span>
          </div>
        </div>
      </div>
    </MapContainer>
  );
}
